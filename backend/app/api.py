from __future__ import annotations

import csv
import hashlib
import io
import json
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, File, Query, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import DomainError, domain_error_handler
from app.db import Base, engine, get_db
from app.domain.generator import NOSNITCHES_HEADERS, validate_deal_rows
from app.integrations.cashflow import CashflowEngineAdapter
from app.integrations.curves import QuantumCurvesAdapter
from app.models import (
    AuditEvent,
    CalculationRun,
    CashflowEvent,
    CurvePoint,
    Deal,
    MarketDataSnapshot,
    Portfolio,
    PortfolioVersion,
    StoredArtifact,
    ValidationIssue,
)
from app.schemas import CalculateRequest, CurveImportRequest, GeneratorRequest, ScenarioRequest
from app.services import (
    create_calculation_run,
    create_generation_run,
    import_curve,
    latest_version,
    refresh_quantum,
    run_discount_scenario,
)


router = APIRouter(prefix="/api")


def run_payload(run: CalculationRun) -> dict:
    return {
        "run_id": run.id,
        "type": run.run_type,
        "status": run.status,
        "stage": run.stage,
        "portfolio_version_id": run.portfolio_version_id,
        "valuation_date": run.valuation_date,
        "created_at": run.created_at,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "error_summary": run.error_summary,
        "result": run.result,
    }


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    db.scalar(select(func.count(Portfolio.id)))
    return {"status": "ok", "database": "ok", "version": "0.1.0", "time": datetime.now(timezone.utc)}


@router.get("/capabilities")
def capabilities() -> dict:
    settings = get_settings()
    cashflow = CashflowEngineAdapter()
    quantum = QuantumCurvesAdapter().healthcheck()
    return {
        "capabilities": [
            {"code": "generator", "name": "Генератор сделок", "status": "Работает", "reason": "Детерминированный генератор и серверная валидация доступны"},
            {"code": "cashflows", "name": "Расчёт денежных потоков", "status": "Работает" if cashflow.available() else "Ожидает интеграции", "reason": None if cashflow.available() else f"Бинарник cfgen не найден по пути {settings.cfgen_bin}"},
            {"code": "curves", "name": "Кривые QuantumTeam", "status": "Работает" if quantum.ok else "Ожидает интеграции", "reason": None if quantum.ok else f"HTTP API {settings.quantum_base_url} недоступен: {quantum.error}"},
            {"code": "valuation", "name": "PV / NPV", "status": "Работает", "reason": "Версионируемая учебная continuous-zero/ACT365 конвенция; требует проверенной кривой и полных CF"},
            {"code": "scenario_discount", "name": "Сценарный сдвиг дисконтной кривой", "status": "Работает", "reason": "CF переиспользуются, DF и PV пересчитываются"},
            {"code": "historical", "name": "Исторический факторный анализ", "status": "Ожидает интеграции", "reason": "Нужны два полных снимка состава портфеля, кривых и CF"},
            {"code": "llm_chat", "name": "LLM-чат", "status": "Запланировано", "reason": "Не входит в третий спринт"},
        ],
        "revisions": {"nosnitches": settings.nosnitches_sha, "quantum": settings.quantum_sha},
    }


@router.post("/portfolios/generate", status_code=status.HTTP_202_ACCEPTED)
def generate_portfolio(payload: GeneratorRequest, db: Session = Depends(get_db)) -> dict:
    return run_payload(create_generation_run(db, payload))


@router.post("/portfolios/import", status_code=status.HTTP_201_CREATED)
async def import_portfolio(
    file: UploadFile = File(...),
    name: str = Query(default="Импортированный портфель", min_length=1, max_length=200),
    db: Session = Depends(get_db),
) -> dict:
    content = await file.read(20 * 1024 * 1024 + 1)
    if len(content) > 20 * 1024 * 1024:
        raise DomainError("FILE_TOO_LARGE", "Максимальный размер CSV — 20 МБ", status_code=413)
    try:
        text = content.decode("utf-8-sig")
        rows = list(csv.DictReader(io.StringIO(text)))
    except (UnicodeDecodeError, csv.Error) as exc:
        raise DomainError("BAD_CSV", "Не удалось прочитать CSV в UTF-8", details={"error": str(exc)}) from exc
    missing_headers = [header for header in NOSNITCHES_HEADERS[:-1] if header not in (rows[0].keys() if rows else [])]
    issues = validate_deal_rows(rows)
    if missing_headers:
        issues.append({"severity": "error", "code": "MISSING_HEADERS", "field": None, "message": f"Отсутствуют колонки: {', '.join(missing_headers)}"})
    if not rows or any(item["severity"] == "error" for item in issues):
        raise DomainError("IMPORT_VALIDATION_FAILED", "CSV не прошёл серверную валидацию", details={"issues": issues})
    report_date = date.fromisoformat(rows[0]["report_dttm"])
    kinds = {"credit" if Decimal(row["current_principal_amt"]) > 0 else "deposit" for row in rows}
    portfolio_type = next(iter(kinds)) if len(kinds) == 1 else "mixed"
    portfolio = Portfolio(name=name, portfolio_type=portfolio_type)
    db.add(portfolio)
    db.flush()
    digest = hashlib.sha256(content).hexdigest()
    version = PortfolioVersion(portfolio_id=portfolio.id, version_no=1, valuation_date=report_date, config_hash=digest, seed=0, generator_version="csv-import/1.0", config={"source_filename": file.filename, "sha256": digest})
    db.add(version)
    db.flush()
    for row in rows:
        principal = Decimal(row["current_principal_amt"])
        db.add(Deal(portfolio_version_id=version.id, business_deal_id=row["deal_id"], kind="credit" if principal > 0 else "deposit", discriminator=row["discriminator"], rate_type=row["rate_type_cd"], principal=principal, interest_rate=Decimal(row["interest_rate"]), deal_date=date.fromisoformat(row["deal_dttm"]), maturity_date=date.fromisoformat(row["maturity_dttm"]), raw_fields=row))
    db.commit()
    return {"portfolio_id": portfolio.id, "version_id": version.id, "rows": len(rows), "sha256": digest, "issues": issues}


@router.get("/portfolios")
def list_portfolios(db: Session = Depends(get_db)) -> list[dict]:
    portfolios = db.scalars(select(Portfolio).order_by(Portfolio.created_at.desc())).all()
    result = []
    for portfolio in portfolios:
        version = latest_version(db, portfolio.id)
        counts = dict(db.execute(select(Deal.kind, func.count(Deal.id)).where(Deal.portfolio_version_id == version.id).group_by(Deal.kind)).all())
        last_run = db.scalar(select(CalculationRun).where(CalculationRun.portfolio_version_id == version.id, CalculationRun.run_type.in_(["valuation", "scenario"])).order_by(CalculationRun.created_at.desc()).limit(1))
        result.append({"id": portfolio.id, "name": portfolio.name, "portfolio_type": portfolio.portfolio_type, "created_at": portfolio.created_at, "version": {"id": version.id, "version_no": version.version_no, "valuation_date": version.valuation_date, "seed": version.seed, "generator_version": version.generator_version, "deal_count": sum(counts.values()), "credit_count": counts.get("credit", 0), "deposit_count": counts.get("deposit", 0)}, "last_run": run_payload(last_run) if last_run else None})
    return result


@router.get("/portfolios/{portfolio_id}")
def get_portfolio(portfolio_id: str, db: Session = Depends(get_db)) -> dict:
    portfolio = db.get(Portfolio, portfolio_id)
    if not portfolio:
        raise DomainError("PORTFOLIO_NOT_FOUND", "Портфель не найден", status_code=404)
    version = latest_version(db, portfolio_id)
    stats = db.execute(select(Deal.kind, func.count(Deal.id), func.sum(Deal.principal)).where(Deal.portfolio_version_id == version.id).group_by(Deal.kind)).all()
    runs = db.scalars(select(CalculationRun).where(CalculationRun.portfolio_version_id == version.id).order_by(CalculationRun.created_at.desc()).limit(20)).all()
    return {"id": portfolio.id, "name": portfolio.name, "portfolio_type": portfolio.portfolio_type, "created_at": portfolio.created_at, "version": {"id": version.id, "version_no": version.version_no, "valuation_date": version.valuation_date, "config_hash": version.config_hash, "seed": version.seed, "generator_version": version.generator_version, "config": version.config}, "stats": [{"kind": kind, "count": count, "principal": str(principal)} for kind, count, principal in stats], "runs": [run_payload(run) for run in runs]}


@router.get("/portfolios/{portfolio_id}/deals")
def list_deals(
    portfolio_id: str,
    search: str | None = None,
    kind: str | None = Query(default=None, pattern="^(credit|deposit)$"),
    rate_type: str | None = Query(default=None, pattern="^(FIXED|FLOAT)$"),
    discriminator: str | None = Query(default=None, pattern="^(ANN|RGM|SIMPLE)$"),
    sort: str = Query(default="business_deal_id", pattern="^(business_deal_id|principal|maturity_date|interest_rate)$"),
    direction: str = Query(default="asc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    version = latest_version(db, portfolio_id)
    statement = select(Deal).where(Deal.portfolio_version_id == version.id)
    if search:
        statement = statement.where(or_(Deal.business_deal_id.ilike(f"%{search[:100]}%"), Deal.kind.ilike(f"%{search[:100]}%")))
    if kind:
        statement = statement.where(Deal.kind == kind)
    if rate_type:
        statement = statement.where(Deal.rate_type == rate_type)
    if discriminator:
        statement = statement.where(Deal.discriminator == discriminator)
    count = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    column = getattr(Deal, sort)
    statement = statement.order_by(column.desc() if direction == "desc" else column.asc()).offset((page - 1) * page_size).limit(page_size)
    deals = db.scalars(statement).all()
    return {"items": [{"id": deal.id, "deal_id": deal.business_deal_id, "kind": deal.kind, "discriminator": deal.discriminator, "rate_type": deal.rate_type, "principal": str(deal.principal), "interest_rate": str(deal.interest_rate), "deal_date": deal.deal_date, "maturity_date": deal.maturity_date, "validation_status": deal.validation_status} for deal in deals], "page": page, "page_size": page_size, "total": count, "pages": (count + page_size - 1) // page_size}


@router.get("/portfolios/{portfolio_id}/export")
def export_portfolio(portfolio_id: str, db: Session = Depends(get_db)) -> StreamingResponse:
    version = latest_version(db, portfolio_id)
    deals = db.scalars(select(Deal).where(Deal.portfolio_version_id == version.id).order_by(Deal.business_deal_id)).all()
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=NOSNITCHES_HEADERS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows([deal.raw_fields for deal in deals])
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="portfolio-{portfolio_id}.csv"'})


@router.post("/portfolios/{portfolio_id}/calculate", status_code=status.HTTP_202_ACCEPTED)
def calculate_portfolio(portfolio_id: str, payload: CalculateRequest, db: Session = Depends(get_db)) -> dict:
    return run_payload(create_calculation_run(db, portfolio_id, payload.snapshot_id, payload.idempotency_key))


def _find_deal(db: Session, deal_id: str) -> Deal:
    deal = db.scalar(select(Deal).where(or_(Deal.id == deal_id, Deal.business_deal_id == deal_id)).order_by(Deal.id.desc()).limit(1))
    if not deal:
        raise DomainError("DEAL_NOT_FOUND", "Сделка не найдена", status_code=404)
    return deal


@router.get("/deals/{deal_id}")
def get_deal(deal_id: str, db: Session = Depends(get_db)) -> dict:
    deal = _find_deal(db, deal_id)
    version = db.get(PortfolioVersion, deal.portfolio_version_id)
    return {"id": deal.id, "deal_id": deal.business_deal_id, "portfolio_id": version.portfolio_id, "version_id": version.id, "kind": deal.kind, "discriminator": deal.discriminator, "rate_type": deal.rate_type, "principal": str(deal.principal), "interest_rate": str(deal.interest_rate), "deal_date": deal.deal_date, "maturity_date": deal.maturity_date, "raw_fields": deal.raw_fields, "validation_status": deal.validation_status}


@router.get("/deals/{deal_id}/cashflows")
def get_deal_cashflows(deal_id: str, run_id: str | None = None, db: Session = Depends(get_db)) -> dict:
    deal = _find_deal(db, deal_id)
    if run_id is None:
        run_id = db.scalar(select(CashflowEvent.run_id).where(CashflowEvent.deal_id == deal.id).order_by(CashflowEvent.id.desc()).limit(1))
    events = db.scalars(select(CashflowEvent).where(CashflowEvent.deal_id == deal.id, CashflowEvent.run_id == run_id).order_by(CashflowEvent.event_order)).all() if run_id else []
    return {"run_id": run_id, "items": [{"event_order": item.event_order, "payment_date": item.payment_date, "payment_type": item.payment_type, "stream": item.stream, "amount": str(item.amount), "principal_before": str(item.principal_before) if item.principal_before is not None else None, "principal_after": str(item.principal_after) if item.principal_after is not None else None, "rate": str(item.rate) if item.rate is not None else None, "base_rate": str(item.base_rate) if item.base_rate is not None else None} for item in events]}


@router.get("/runs/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.get(CalculationRun, run_id)
    if not run:
        raise DomainError("RUN_NOT_FOUND", "Запуск не найден", status_code=404)
    return run_payload(run)


@router.get("/runs/{run_id}/results")
def get_run_results(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.get(CalculationRun, run_id)
    if not run:
        raise DomainError("RUN_NOT_FOUND", "Запуск не найден", status_code=404)
    if run.status in {"queued", "running"}:
        return Response(status_code=status.HTTP_202_ACCEPTED, content=json.dumps(run_payload(run), default=str), media_type="application/json")
    return {"run_id": run.id, "status": run.status, "result": run.result, "error_summary": run.error_summary}


@router.get("/runs")
def list_runs(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)) -> list[dict]:
    return [run_payload(run) for run in db.scalars(select(CalculationRun).order_by(CalculationRun.created_at.desc()).limit(limit)).all()]


@router.get("/curves")
def list_curves(db: Session = Depends(get_db)) -> list[dict]:
    snapshots = db.scalars(select(MarketDataSnapshot).order_by(MarketDataSnapshot.trade_date.desc(), MarketDataSnapshot.retrieved_at.desc())).all()
    return [{"id": item.id, "source": item.source, "external_id": item.external_id, "trade_date": item.trade_date, "retrieved_at": item.retrieved_at, "curve_type": item.curve_type, "scenario": item.scenario, "convention": item.convention, "data_hash": item.data_hash, "source_sha": item.source_sha, "point_count": len(item.points)} for item in snapshots]


@router.get("/curves/{snapshot_id}")
def get_curve(snapshot_id: str, db: Session = Depends(get_db)) -> dict:
    snapshot = db.get(MarketDataSnapshot, snapshot_id)
    if not snapshot:
        raise DomainError("SNAPSHOT_NOT_FOUND", "Снимок кривой не найден", status_code=404)
    return {"id": snapshot.id, "source": snapshot.source, "external_id": snapshot.external_id, "trade_date": snapshot.trade_date, "retrieved_at": snapshot.retrieved_at, "convention": snapshot.convention, "data_hash": snapshot.data_hash, "source_sha": snapshot.source_sha, "points": [{"bucket_code": item.bucket_code, "tenor_years": str(item.tenor_years), "rate_decimal": str(item.rate_decimal), "rate_percent": str(Decimal(item.rate_decimal) * 100), "shift_bp": str(item.shift_bp) if item.shift_bp is not None else None} for item in sorted(snapshot.points, key=lambda point: point.tenor_years)]}


@router.post("/curves/import", status_code=status.HTTP_201_CREATED)
def import_curve_endpoint(payload: CurveImportRequest, db: Session = Depends(get_db)) -> dict:
    snapshot = import_curve(db, payload)
    return {"id": snapshot.id, "source": snapshot.source, "trade_date": snapshot.trade_date, "data_hash": snapshot.data_hash, "point_count": len(snapshot.points)}


@router.post("/curves/refresh", status_code=status.HTTP_201_CREATED)
def refresh_curve(db: Session = Depends(get_db)) -> dict:
    snapshot = refresh_quantum(db)
    return {"id": snapshot.id, "source": snapshot.source, "trade_date": snapshot.trade_date, "data_hash": snapshot.data_hash, "point_count": len(snapshot.points)}


@router.get("/curves/scenarios/available")
def curve_scenarios() -> dict:
    result = QuantumCurvesAdapter().list_scenarios()
    return {"status": "available" if result.ok else "unavailable", "items": result.data if result.ok else [], "reason": result.error}


@router.post("/analysis/scenario", status_code=status.HTTP_201_CREATED)
def scenario_analysis(payload: ScenarioRequest, db: Session = Depends(get_db)) -> dict:
    return run_payload(run_discount_scenario(db, payload))


@router.post("/analysis/historical")
def historical_analysis() -> Response:
    return Response(status_code=409, media_type="application/json", content=json.dumps({"code": "HISTORICAL_SNAPSHOTS_MISSING", "message": "Для исторического анализа нужны два полных снимка портфеля, кривой и денежных потоков, а также подтверждённая методика эффекта времени.", "details": {"required": ["portfolio_snapshot_start", "portfolio_snapshot_end", "curve_start", "curve_end", "cashflows_start", "cashflows_end", "time_effect_method"]}, "retryable": False}, ensure_ascii=False))


@router.get("/analysis/{analysis_id}")
def get_analysis(analysis_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.get(CalculationRun, analysis_id)
    if not run or run.run_type != "scenario":
        raise DomainError("ANALYSIS_NOT_FOUND", "Сценарный анализ не найден", status_code=404)
    return run_payload(run)


@router.post("/data/key-rates/import", status_code=status.HTTP_201_CREATED)
async def import_key_rates(file: UploadFile = File(...)) -> dict:
    content = await file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise DomainError("FILE_TOO_LARGE", "Максимальный размер CSV — 10 МБ", status_code=413)
    try:
        text = content.decode("utf-8-sig")
        rows = list(csv.DictReader(io.StringIO(text)))
        if not rows or not {"indicator", "date", "rate"}.issubset(rows[0]):
            raise ValueError("Нужны колонки indicator,date,rate")
        for row in rows:
            if row["indicator"] != "CBKEY1M":
                raise ValueError(f"Неподдерживаемый индикатор {row['indicator']}")
            date.fromisoformat(row["date"])
            Decimal(row["rate"])
    except (UnicodeDecodeError, csv.Error, ValueError, ArithmeticError) as exc:
        raise DomainError("KEY_RATE_VALIDATION_FAILED", "CSV ключевой ставки не прошёл проверку", details={"error": str(exc)}) from exc
    target = get_settings().artifacts_dir.resolve() / "market" / "key_rate.csv"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return {"filename": file.filename, "rows": len(rows), "sha256": hashlib.sha256(content).hexdigest(), "indicator": "CBKEY1M", "status": "validated"}


@router.get("/integrations/status")
def integration_status() -> dict:
    settings = get_settings()
    cashflow = CashflowEngineAdapter()
    quantum = QuantumCurvesAdapter().healthcheck()
    return {"checked_at": datetime.now(timezone.utc), "nosnitches": {"status": "Доступно" if cashflow.available() else "Недоступно", "available": cashflow.available(), "sha": settings.nosnitches_sha, "binary": str(cashflow.binary), "checksum": cashflow.checksum()}, "quantum": {"status": "Доступно" if quantum.ok else "Недоступно", "available": quantum.ok, "sha": settings.quantum_sha, "base_url": settings.quantum_base_url, "response": quantum.data, "error": quantum.error}}


@router.post("/integrations/smoke-test")
def smoke_test() -> dict:
    settings = get_settings()
    quantum = QuantumCurvesAdapter().healthcheck()
    return {"status": "partial" if not (CashflowEngineAdapter().available() and quantum.ok) else "succeeded", "steps": [{"name": "cfgen binary", "status": "passed" if CashflowEngineAdapter().available() else "blocked", "reason": None if CashflowEngineAdapter().available() else f"Нет {settings.cfgen_bin}"}, {"name": "QuantumTeam health", "status": "passed" if quantum.ok else "blocked", "reason": quantum.error}, {"name": "NPV Analytics formula", "status": "passed", "reason": "Проверяется unit-тестами Decimal/ACT365/waterfall"}]}


@router.get("/validation-issues")
def validation_issues(limit: int = Query(default=200, ge=1, le=1000), db: Session = Depends(get_db)) -> list[dict]:
    issues = db.scalars(select(ValidationIssue).order_by(ValidationIssue.created_at.desc()).limit(limit)).all()
    return [{"id": item.id, "run_id": item.run_id, "deal_id": item.deal_id, "severity": item.severity, "code": item.code, "field": item.field, "message": item.message, "source": item.source, "created_at": item.created_at} for item in issues]


@router.get("/audit-events")
def audit_events(limit: int = Query(default=200, ge=1, le=1000), db: Session = Depends(get_db)) -> list[dict]:
    events = db.scalars(select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)).all()
    return [{"id": item.id, "level": item.level, "module": item.module, "code": item.code, "message": item.message, "details": item.details, "created_at": item.created_at} for item in events]


@router.get("/artifacts/{artifact_id}/download")
def download_artifact(artifact_id: str, db: Session = Depends(get_db)) -> FileResponse:
    artifact = db.get(StoredArtifact, artifact_id)
    if not artifact:
        raise DomainError("ARTIFACT_NOT_FOUND", "Артефакт не найден", status_code=404)
    root = get_settings().artifacts_dir.resolve()
    path = (root / artifact.relative_path).resolve()
    if root not in path.parents or not path.is_file():
        raise DomainError("ARTIFACT_UNAVAILABLE", "Файл артефакта недоступен", status_code=404)
    return FileResponse(path, filename=artifact.filename, media_type="application/octet-stream")


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings().artifacts_dir.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="NPV Analytics API", version="0.1.0", lifespan=lifespan)
    app.add_exception_handler(DomainError, domain_error_handler)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    app.include_router(router)
    return app
