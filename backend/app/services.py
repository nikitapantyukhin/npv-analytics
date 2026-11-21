from __future__ import annotations

import csv
import hashlib
import json
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from redis import Redis
from rq import Queue

from app.core.config import get_settings
from app.core.errors import DomainError
from app.domain.generator import GeneratorRequest, config_hash, generate_deals
from app.domain.valuation import DiscountPoint, calculate_npv, sequential_waterfall, shifted_points
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
    utcnow,
)
from app.schemas import CurveImportRequest, ScenarioRequest
from app.db import SessionLocal


def stable_hash(value: object) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def log_event(db: Session, module: str, code: str, message: str, *, level: str = "info", details: dict | None = None) -> None:
    db.add(AuditEvent(module=module, code=code, message=message, level=level, details=details))


def create_generation_run(db: Session, config: GeneratorRequest) -> CalculationRun:
    args_hash = stable_hash({"type": "generation", **config.model_dump(mode="json")})
    if config.idempotency_key:
        args_hash = stable_hash({"idempotency_key": config.idempotency_key, "args": args_hash})
        existing = db.scalar(select(CalculationRun).where(CalculationRun.run_type == "generation", CalculationRun.args_hash == args_hash))
        if existing:
            return existing
    run = CalculationRun(run_type="generation", valuation_date=config.valuation_date, args_hash=args_hash)
    db.add(run)
    db.commit()
    db.refresh(run)
    if get_settings().task_mode == "rq":
        Queue("npv", connection=Redis.from_url(get_settings().redis_url)).enqueue(
            execute_generation_job, run.id, config.model_dump(mode="json"), job_timeout="30m"
        )
        return run
    return _execute_generation(db, run, config)


def _execute_generation(db: Session, run: CalculationRun, config: GeneratorRequest) -> CalculationRun:
    try:
        run.status, run.stage, run.started_at = "running", "generation", utcnow()
        deals, stats = generate_deals(config)
        portfolio = Portfolio(name=config.name, portfolio_type=config.portfolio_type)
        db.add(portfolio)
        db.flush()
        version = PortfolioVersion(
            portfolio_id=portfolio.id,
            version_no=1,
            valuation_date=config.valuation_date,
            config_hash=config_hash(config),
            seed=config.seed,
            generator_version=get_settings().generator_version,
            config=config.model_dump(mode="json"),
        )
        db.add(version)
        db.flush()
        for row in deals:
            principal = Decimal(row["current_principal_amt"])
            db.add(
                Deal(
                    portfolio_version_id=version.id,
                    business_deal_id=row["deal_id"],
                    kind="credit" if principal > 0 else "deposit",
                    discriminator=row["discriminator"],
                    rate_type=row["rate_type_cd"],
                    principal=principal,
                    interest_rate=Decimal(row["interest_rate"]),
                    deal_date=date.fromisoformat(row["deal_dttm"]),
                    maturity_date=date.fromisoformat(row["maturity_dttm"]),
                    raw_fields=row,
                )
            )
        run.portfolio_version_id = version.id
        run.status, run.stage, run.finished_at = "succeeded", "completed", utcnow()
        run.result = {"portfolio_id": portfolio.id, "version_id": version.id, **stats}
        log_event(db, "generator", "PORTFOLIO_GENERATED", f"Создан портфель {portfolio.name}", details=stats)
        db.commit()
    except Exception as exc:
        db.rollback()
        run = db.get(CalculationRun, run.id)
        run.status, run.stage, run.finished_at = "failed", "generation", utcnow()
        run.error_summary = str(exc)
        log_event(db, "generator", "GENERATION_FAILED", str(exc), level="error")
        db.commit()
    return run


def execute_generation_job(run_id: str, payload: dict) -> None:
    """RQ entrypoint; uses a fresh session and the same audited generation path."""
    with SessionLocal() as db:
        run = db.get(CalculationRun, run_id)
        if run is not None:
            _execute_generation(db, run, GeneratorRequest.model_validate(payload))


def latest_version(db: Session, portfolio_id: str) -> PortfolioVersion:
    version = db.scalar(
        select(PortfolioVersion)
        .where(PortfolioVersion.portfolio_id == portfolio_id)
        .order_by(PortfolioVersion.version_no.desc())
        .limit(1)
    )
    if not version:
        raise DomainError("PORTFOLIO_NOT_FOUND", "Портфель не найден", status_code=404)
    return version


def create_calculation_run(db: Session, portfolio_id: str, snapshot_id: str | None, idempotency_key: str | None) -> CalculationRun:
    version = latest_version(db, portfolio_id)
    args_hash = stable_hash({"version": version.id, "snapshot": snapshot_id, "idempotency": idempotency_key})
    if idempotency_key:
        existing = db.scalar(select(CalculationRun).where(CalculationRun.run_type == "valuation", CalculationRun.args_hash == args_hash))
        if existing:
            return existing
    run = CalculationRun(
        run_type="valuation",
        portfolio_version_id=version.id,
        valuation_date=version.valuation_date,
        market_snapshot_id=snapshot_id,
        method_version=get_settings().valuation_method,
        engine_sha=get_settings().nosnitches_sha,
        args_hash=args_hash,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    if get_settings().task_mode == "rq":
        Queue("npv", connection=Redis.from_url(get_settings().redis_url)).enqueue(
            execute_calculation_job, run.id, version.id, job_timeout="30m"
        )
    else:
        _execute_calculation(db, run, version)
    return run


def execute_calculation_job(run_id: str, version_id: str) -> None:
    """RQ entrypoint for cfgen and valuation."""
    with SessionLocal() as db:
        run = db.get(CalculationRun, run_id)
        version = db.get(PortfolioVersion, version_id)
        if run is not None and version is not None:
            _execute_calculation(db, run, version)


def _rates_file_for_version(version: PortfolioVersion) -> Path:
    path = get_settings().artifacts_dir.resolve() / "market" / "key_rate.csv"
    has_float = any(deal.rate_type == "FLOAT" for deal in version.deals)
    if has_float and not path.is_file():
        raise DomainError(
            "KEY_RATE_MISSING",
            "Для FLOAT-сделок нужен проверенный CSV истории/прогноза CBKEY1M. Загрузите его в «Источники данных».",
            status_code=409,
        )
    if not path.is_file():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("indicator,date,rate\n", encoding="utf-8")
    return path


def _execute_calculation(db: Session, run: CalculationRun, version: PortfolioVersion) -> None:
    try:
        run.status, run.stage, run.started_at = "running", "cashflows", utcnow()
        db.commit()
        rows = [deal.raw_fields for deal in version.deals]
        rates_path = _rates_file_for_version(version)
        result = CashflowEngineAdapter().calculate(rows, rates_path, run.id)
        deal_by_business = {deal.business_deal_id: deal for deal in version.deals}
        for issue in result.issues:
            db.add(
                ValidationIssue(
                    run_id=run.id,
                    deal_id=issue.get("deal_id"),
                    severity=issue.get("severity", "error"),
                    code=issue.get("code", "UNKNOWN"),
                    field=issue.get("field") or None,
                    message=issue.get("message", "Ошибка расчётного движка"),
                    source="nosnitches",
                )
            )
        for raw in result.events:
            deal = deal_by_business.get(raw["deal_id"])
            db.add(
                CashflowEvent(
                    run_id=run.id,
                    deal_id=deal.id if deal else None,
                    business_deal_id=raw["deal_id"],
                    event_order=int(raw["event_order"]),
                    payment_date=date.fromisoformat(raw["payment_dttm"]),
                    payment_type=raw["payment_type"],
                    stream=raw["stream"],
                    amount=Decimal(raw["amount"]),
                    principal_before=Decimal(raw["principal_before"]) if raw.get("principal_before") else None,
                    principal_after=Decimal(raw["principal_after"]) if raw.get("principal_after") else None,
                    rate=Decimal(raw["rate"]) if raw.get("rate") else None,
                    base_rate=Decimal(raw["base_rate"]) if raw.get("base_rate") else None,
                    raw_fields=raw,
                )
            )
        run.stage = "valuation"
        run.status = result.status
        run.result = {
            "cashflow_status": result.status,
            "cashflow_event_count": len(result.events),
            "issue_count": len(result.issues),
            "binary_checksum": result.binary_checksum,
        }
        db.flush()
        if result.status != "failed" and run.market_snapshot_id:
            snapshot = db.get(MarketDataSnapshot, run.market_snapshot_id)
            if not snapshot:
                raise DomainError("SNAPSHOT_NOT_FOUND", "Снимок кривой не найден", status_code=404)
            points = [DiscountPoint(Decimal(point.tenor_years), Decimal(point.rate_decimal)) for point in snapshot.points]
            events = [{"deal_id": item["deal_id"], "payment_date": item["payment_dttm"], "amount": item["amount"]} for item in result.events]
            balances = {deal.business_deal_id: Decimal(deal.principal) for deal in version.deals}
            valuation = calculate_npv(events, balances, version.valuation_date, points)
            run.result = {**run.result, **valuation, "snapshot_id": snapshot.id, "convention": snapshot.convention}
        elif result.status != "failed":
            run.status = "partial"
            run.result = {**run.result, "valuation_status": "blocked", "valuation_reason": "Не выбран проверенный снимок дисконтной кривой"}
        run.finished_at = utcnow()
        log_event(db, "calculation", "RUN_FINISHED", f"Расчёт {run.id}: {run.status}", details=run.result)
        db.commit()
    except DomainError as exc:
        db.rollback()
        run = db.get(CalculationRun, run.id)
        run.status, run.finished_at, run.error_summary = "failed", utcnow(), exc.message
        db.add(ValidationIssue(run_id=run.id, severity="error", code=exc.code, message=exc.message, source="platform"))
        db.commit()
    except Exception as exc:
        db.rollback()
        run = db.get(CalculationRun, run.id)
        run.status, run.finished_at, run.error_summary = "failed", utcnow(), str(exc)
        db.add(ValidationIssue(run_id=run.id, severity="error", code="CALCULATION_FAILED", message=str(exc), source="platform"))
        db.commit()


def import_curve(db: Session, payload: CurveImportRequest) -> MarketDataSnapshot:
    raw = payload.model_dump(mode="json")
    digest = stable_hash(raw)
    snapshot = MarketDataSnapshot(
        source=payload.source,
        external_id=payload.external_id,
        trade_date=payload.trade_date,
        convention=payload.convention,
        data_hash=digest,
        source_sha=payload.source_sha,
        raw_response=raw,
    )
    db.add(snapshot)
    db.flush()
    for point in payload.points:
        db.add(
            CurvePoint(
                snapshot_id=snapshot.id,
                bucket_code=point.bucket_code,
                tenor_years=point.tenor_years,
                rate_decimal=point.rate_percent / Decimal(100),
            )
        )
    log_event(db, "curves", "CURVE_IMPORTED", f"Импортирован снимок {snapshot.id}", details={"source": payload.source, "hash": digest})
    db.commit()
    db.refresh(snapshot)
    return snapshot


def refresh_quantum(db: Session) -> MarketDataSnapshot:
    adapter = QuantumCurvesAdapter()
    latest = adapter.get_latest_snapshot()
    if not latest.ok or not isinstance(latest.data, dict):
        raise DomainError("QUANTUM_UNAVAILABLE", "QuantumTeam недоступен или не содержит снимка", status_code=502, details={"error": latest.error}, retryable=True)
    external_id = int(latest.data["id"])
    curve = adapter.get_base_curve(external_id)
    if not curve.ok or not isinstance(curve.data, list):
        raise DomainError("QUANTUM_CURVE_FAILED", "Не удалось получить точки базовой кривой QuantumTeam", status_code=502, details={"error": curve.error}, retryable=True)
    normalized = adapter.normalize_points(curve.data)
    payload = CurveImportRequest(
        source="verified_external",
        trade_date=date.fromisoformat(str(latest.data["trade_date"])),
        convention="QuantumTeam annual_rate_pct; continuous-zero use is an explicit NPV Analytics assumption",
        external_id=str(external_id),
        source_sha=get_settings().quantum_sha,
        points=[{"bucket_code": item["bucket_code"], "tenor_years": item["tenor_years"], "rate_percent": item["rate_decimal"] * Decimal(100)} for item in normalized],
    )
    return import_curve(db, payload)


def run_discount_scenario(db: Session, payload: ScenarioRequest) -> CalculationRun:
    base_run = db.get(CalculationRun, payload.base_run_id)
    if not base_run or not base_run.result or "npv" not in base_run.result:
        raise DomainError("BASE_RUN_INCOMPLETE", "Базовый запуск не содержит полного NPV", status_code=409)
    if any(factor.kind != "discount_shift_bp" for factor in payload.factors):
        raise DomainError("FACTOR_REQUIRES_CFGEN", "Изменение договорной ставки требует отдельного пересчёта cfgen; используйте фоновый расчёт условий сделки", status_code=409)
    snapshot = db.get(MarketDataSnapshot, base_run.market_snapshot_id)
    if not snapshot:
        raise DomainError("SNAPSHOT_NOT_FOUND", "Базовый снимок кривой не найден", status_code=404)
    version = db.get(PortfolioVersion, base_run.portfolio_version_id)
    events = db.scalars(select(CashflowEvent).where(CashflowEvent.run_id == base_run.id).order_by(CashflowEvent.id)).all()
    event_data = [{"deal_id": item.business_deal_id, "payment_date": item.payment_date, "amount": item.amount} for item in events]
    balances = {deal.business_deal_id: Decimal(deal.principal) for deal in version.deals}
    points = [DiscountPoint(Decimal(point.tenor_years), Decimal(point.rate_decimal)) for point in snapshot.points]
    base_npv = Decimal(base_run.result["npv"])
    current_points = points
    step_npvs: list[tuple[str, Decimal]] = []
    last_result = base_run.result
    for index, factor in enumerate(payload.factors, start=1):
        current_points = shifted_points(current_points, factor.value)
        last_result = calculate_npv(event_data, balances, version.valuation_date, current_points)
        step_npvs.append((f"Сдвиг кривой {factor.value} б.п. (шаг {index})", Decimal(last_result["npv"])))
    waterfall = sequential_waterfall(base_npv, step_npvs)
    run = CalculationRun(
        run_type="scenario",
        portfolio_version_id=version.id,
        valuation_date=version.valuation_date,
        status="succeeded",
        stage="completed",
        started_at=utcnow(),
        finished_at=utcnow(),
        market_snapshot_id=snapshot.id,
        method_version=get_settings().valuation_method,
        args_hash=stable_hash(payload.model_dump(mode="json")),
        result={
            "name": payload.name,
            "base_run_id": base_run.id,
            "base_npv": str(base_npv),
            "scenario_npv": last_result["npv"],
            "delta_npv": str(Decimal(last_result["npv"]) - base_npv),
            "waterfall": waterfall,
            "cashflows_reused": True,
            "cfgen_invoked": False,
        },
    )
    db.add(run)
    log_event(db, "analysis", "SCENARIO_COMPLETED", f"Сценарий {payload.name} рассчитан", details=run.result)
    db.commit()
    db.refresh(run)
    return run


def register_artifact(db: Session, run_id: str | None, artifact_type: str, path: Path, root: Path) -> StoredArtifact:
    resolved = path.resolve()
    if root.resolve() not in resolved.parents:
        raise DomainError("UNSAFE_ARTIFACT_PATH", "Недопустимый путь артефакта", status_code=400)
    digest = hashlib.sha256(resolved.read_bytes()).hexdigest()
    artifact = StoredArtifact(run_id=run_id, artifact_type=artifact_type, filename=resolved.name, relative_path=str(resolved.relative_to(root.resolve())), sha256=digest, size_bytes=resolved.stat().st_size)
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return artifact
