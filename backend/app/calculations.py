from __future__ import annotations

import logging
from collections.abc import Callable, Mapping, Sequence
from datetime import date
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5

from redis import Redis
from rq import Queue
from rq.job import Job
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import DomainError
from app.db import SessionLocal
from app.domain.valuation import DiscountPoint, calculate_npv, sequential_waterfall, shifted_points
from app.integrations.cashflow import CashflowEngineAdapter, CashflowResult
from app.integrations.curves import QuantumCurvesAdapter
from app.market_data import (
    QUANTUM_TERM_CURVE,
    discount_points,
    import_indicator_dataset,
    import_quantum_snapshot,
)
from app.models import (
    CalculationRun,
    CashflowEvent,
    IndicatorDataset,
    MarketDataSnapshot,
    PortfolioVersion,
    ValidationIssue,
    utcnow,
)
from app.schemas import CalculateRequest, MarketScenarioRequest, ScenarioRequest
from app.services import latest_version, log_event, register_artifact, stable_hash


logger = logging.getLogger(__name__)
EMPTY_HISTORY = b"indicator,date,rate\n"


def _fail_run(db: Session, run_id: str, error: DomainError) -> None:
    db.rollback()
    run = db.get(CalculationRun, run_id)
    if run is None or run.status not in {"queued", "running"}:
        return
    run.status, run.finished_at, run.error_summary = "failed", utcnow(), error.message
    db.add(ValidationIssue(run_id=run_id, severity="error", code=error.code, message=error.message, source="platform"))
    log_event(db, "calculation", error.code, error.message, level="error", details={"run_id": run_id, **(error.details or {})})
    db.commit()


def fail_background_run(job: Job, connection: Redis, *exception_info: object) -> None:
    run_id = job.args[0]
    with SessionLocal() as db:
        _fail_run(db, run_id, DomainError("BACKGROUND_JOB_FAILED", "Фоновая задача прервана"))


def _submit(db: Session, run: CalculationRun, job: Callable[[str], None]) -> CalculationRun:
    try:
        with db.begin_nested():
            db.add(run)
            db.flush()
    except IntegrityError:
        existing = db.get(CalculationRun, run.id)
        if existing is None:
            raise
        return existing
    db.commit()
    settings = get_settings()
    if settings.task_mode == "rq":
        try:
            Queue("npv", connection=Redis.from_url(settings.redis_url)).enqueue(
                job, run.id, job_id=run.id, job_timeout="30m", on_failure=fail_background_run,
            )
        except Exception:
            logger.exception("Не удалось поставить запуск %s в очередь", run.id)
            _fail_run(db, run.id, DomainError("QUEUE_UNAVAILABLE", "Очередь расчётов временно недоступна", retryable=True))
    else:
        job(run.id)
    db.refresh(run)
    return run


def _claim(db: Session, run_id: str, stage: str) -> CalculationRun | None:
    claimed = db.execute(
        update(CalculationRun)
        .where(CalculationRun.id == run_id, CalculationRun.status == "queued")
        .values(status="running", stage=stage, started_at=utcnow())
    )
    db.commit()
    return db.get(CalculationRun, run_id) if claimed.rowcount == 1 else None


def _finish(db: Session, run: CalculationRun, status: str) -> None:
    run.status, run.stage, run.finished_at = status, "completed", utcnow()
    log_event(db, "calculation", "RUN_FINISHED", f"Расчёт {run.id}: {status}", details={"run_id": run.id})
    db.commit()


def _dataset(db: Session, dataset_id: str, kind: str) -> IndicatorDataset:
    dataset = db.get(IndicatorDataset, dataset_id)
    if dataset is None or dataset.kind != kind:
        label = "истории" if kind == "history" else "прогноза"
        raise DomainError("KEY_RATE_DATASET_NOT_FOUND", f"Версия {label} CBKEY1M не найдена", status_code=404)
    return dataset


def _history(
    db: Session, version: PortfolioVersion, history_id: str | None,
) -> IndicatorDataset | None:
    has_float = any(
        deal.rate_type == "FLOAT" or deal.raw_fields.get("sub_rate_type_cd") == "FLOAT"
        for deal in version.deals
    )
    if history_id:
        history = _dataset(db, history_id, "history")
    elif has_float:
        history = db.scalar(
            select(IndicatorDataset)
            .where(IndicatorDataset.kind == "history", IndicatorDataset.first_date <= version.valuation_date)
            .order_by(IndicatorDataset.created_at.desc(), IndicatorDataset.id.desc()).limit(1)
        )
        legacy_file = get_settings().artifacts_dir / "market" / "key_rate.csv"
        if history is None and legacy_file.is_file() and legacy_file.stat().st_size > len(EMPTY_HISTORY):
            history = import_indicator_dataset(
                db, legacy_file.read_bytes(), kind="history", filename=legacy_file.name, source="Ранее загруженная история",
            )
    else:
        return None
    if history is None or history.first_date > version.valuation_date:
        raise DomainError("KEY_RATE_MISSING", "Нужна история CBKEY1M со ставкой на дату оценки или раньше", status_code=409)
    return history


def _snapshot(db: Session, snapshot_id: str, valuation_date: date) -> MarketDataSnapshot:
    snapshot = db.get(MarketDataSnapshot, snapshot_id)
    if snapshot is None:
        raise DomainError("SNAPSHOT_NOT_FOUND", "Снимок кривой не найден", status_code=404)
    if snapshot.trade_date > valuation_date:
        raise DomainError("CURVE_AFTER_VALUATION_DATE", "Дата кривой позже даты оценки портфеля", status_code=409)
    return snapshot


def _automatic_snapshot(db: Session, valuation_date: date) -> MarketDataSnapshot | None:
    return db.scalar(
        select(MarketDataSnapshot)
        .where(
            MarketDataSnapshot.trade_date <= valuation_date,
            MarketDataSnapshot.source.in_(("quantum_live", "quantum_cached", "verified_external")),
        )
        .order_by(
            (MarketDataSnapshot.curve_type == QUANTUM_TERM_CURVE).desc(),
            MarketDataSnapshot.trade_date.desc(), MarketDataSnapshot.retrieved_at.desc(),
        )
        .limit(1)
    )


def _load_automatic_snapshot(db: Session, valuation_date: date) -> MarketDataSnapshot:
    saved = _automatic_snapshot(db, valuation_date)
    if saved is not None:
        return saved
    adapter = QuantumCurvesAdapter()
    latest = adapter.get_latest_snapshot()
    if latest.ok and isinstance(latest.data, dict) and str(latest.data.get("trade_date", "")) <= valuation_date.isoformat():
        try:
            return import_quantum_snapshot(db, adapter, latest)
        except DomainError:
            # У старого снимка Quantum могут отсутствовать срочные точки.
            pass
    snapshot = import_quantum_snapshot(db, adapter, adapter.request_calculation(valuation_date.isoformat()))
    if snapshot.trade_date > valuation_date:
        raise DomainError("CURVE_AFTER_VALUATION_DATE", "Дата кривой позже даты оценки портфеля", status_code=409)
    return snapshot


def create_calculation_run(db: Session, portfolio_id: str, payload: CalculateRequest) -> CalculationRun:
    version = latest_version(db, portfolio_id)
    snapshot = _snapshot(db, payload.snapshot_id, version.valuation_date) if payload.snapshot_id else None
    if snapshot is None and payload.auto_curve:
        snapshot = _automatic_snapshot(db, version.valuation_date)
    forecast = _dataset(db, payload.forecast_id, "forecast") if payload.forecast_id else None
    if forecast is not None and forecast.valuation_date != version.valuation_date:
        raise DomainError("FORECAST_DATE_MISMATCH", "Дата оценки прогноза отличается от даты оценки портфеля", status_code=409)
    if forecast is not None and "base" not in forecast.scenarios:
        raise DomainError("FORECAST_SCENARIO_MISSING", "Прогноз CBKEY1M не содержит сценарий base", status_code=409)
    history = _history(db, version, payload.history_id)
    if forecast is not None and history is None:
        raise DomainError("KEY_RATE_MISSING", "Для прогона с прогнозом нужна история CBKEY1M", status_code=409)
    inputs = {
        "history_id": history.id if history else None,
        "history_sha256": history.sha256 if history else None,
        "forecast_id": forecast.id if forecast else None,
        "forecast_sha256": forecast.sha256 if forecast else None,
        "indicator_scenario": "base" if forecast else None,
        "indicator_mode": "forecast" if forecast else "H3" if history else None,
        "discount_scenario": "base" if snapshot else None,
        "curve_mode": "automatic" if payload.auto_curve else "selected" if snapshot else "cashflows_only",
        "curve_hash": snapshot.data_hash if snapshot else None,
    }
    digest = stable_hash({"version": version.id, "snapshot": snapshot.id if snapshot else None, "key": payload.idempotency_key, **inputs})
    run = CalculationRun(
        run_type="valuation", portfolio_version_id=version.id, valuation_date=version.valuation_date,
        market_snapshot_id=snapshot.id if snapshot else None,
        method_version=snapshot.convention if snapshot and snapshot.curve_type == QUANTUM_TERM_CURVE else get_settings().valuation_method,
        engine_sha=get_settings().nosnitches_sha, args_hash=digest, inputs=inputs,
    )
    if payload.idempotency_key:
        run.id = str(uuid5(NAMESPACE_URL, f"npv-valuation/{digest}"))
        existing = db.get(CalculationRun, run.id)
        if existing is not None:
            return existing
    return _submit(db, run, execute_calculation_job)


def _save_cashflows(db: Session, run: CalculationRun, version: PortfolioVersion, result: CashflowResult) -> dict:
    deal_ids = {deal.business_deal_id: deal.id for deal in version.deals}
    for issue in result.issues:
        db.add(ValidationIssue(
            run_id=run.id, deal_id=issue.get("deal_id"), severity=issue["severity"],
            code=issue["code"], field=issue.get("field") or None, message=issue["message"], source="nosnitches",
        ))
    for row in result.events:
        db.add(CashflowEvent(
            run_id=run.id, deal_id=deal_ids[row["deal_id"]], business_deal_id=row["deal_id"],
            event_order=int(row["event_order"]), payment_date=date.fromisoformat(row["payment_dttm"]),
            stream=row["stream"], payment_type=row["payment_type"], amount=Decimal(row["amount"]),
            principal_before=Decimal(row["principal_before"]) if row.get("principal_before") else None,
            principal_after=Decimal(row["principal_after"]) if row.get("principal_after") else None,
            rate=Decimal(row["rate"]) if row.get("rate") else None,
            base_rate=Decimal(row["base_rate"]) if row.get("base_rate") else None,
            raw_fields=row,
        ))
    artifacts = []
    if result.artifact_dir is not None:
        for relative_path in ("output/cashflow.csv", "output/errors.csv", "deals.csv", "key_rate.csv", "curves.csv"):
            path = result.artifact_dir / relative_path
            if path.is_file():
                artifact = register_artifact(db, run.id, path.stem, path, get_settings().artifacts_dir.resolve())
                artifacts.append({"id": artifact.id, "filename": artifact.filename, "sha256": artifact.sha256})
    return {
        "cashflow_status": result.status, "cashflow_event_count": len(result.events),
        "issue_count": len(result.issues), "binary_checksum": result.binary_checksum, "artifacts": artifacts,
    }


def _run_cashflows(db: Session, run: CalculationRun, version: PortfolioVersion) -> CashflowResult:
    inputs = run.inputs or {}
    history_id, forecast_id = inputs.get("history_id"), inputs.get("forecast_id")
    history = _dataset(db, history_id, "history") if history_id else None
    if run.inputs is None:  # Запуски из очереди предыдущей версии.
        history = _history(db, version, None)
    forecast = _dataset(db, forecast_id, "forecast") if forecast_id else None
    return CashflowEngineAdapter().calculate(
        [deal.raw_fields for deal in version.deals], history.content if history else EMPTY_HISTORY, run.id,
        report_date=version.valuation_date, forecast=forecast.content if forecast else None,
        scenario=inputs.get("indicator_scenario") or "base",
    )


def _event_data(rows: Sequence[Mapping[str, str]]) -> list[dict]:
    return [
        {"deal_id": row["deal_id"], "payment_date": row["payment_dttm"], "amount": row["amount"]}
        for row in rows
    ]


def _stored_events(db: Session, run_id: str) -> list[dict]:
    rows = db.scalars(select(CashflowEvent.raw_fields).where(CashflowEvent.run_id == run_id).order_by(CashflowEvent.id))
    return _event_data(list(rows))


def _price(
    version: PortfolioVersion, events: list[dict], points: list[DiscountPoint], method: str | None,
) -> dict:
    balances = {deal.business_deal_id: deal.principal for deal in version.deals}
    try:
        return calculate_npv(events, balances, version.valuation_date, points, method=method)
    except ValueError as exc:
        raise DomainError("VALUATION_COVERAGE", str(exc), status_code=409) from exc


def _block_valuation(db: Session, run: CalculationRun, reason: str, code: str | None = None) -> None:
    run.result = {**(run.result or {}), "valuation_status": "blocked", "valuation_reason": reason}
    if code:
        db.add(ValidationIssue(run_id=run.id, severity="error", code=code, message=reason, source="platform"))


def execute_calculation_job(run_id: str, version_id: str | None = None) -> None:
    with SessionLocal() as db:
        run = _claim(db, run_id, "cashflows")
        if run is None:
            return
        try:
            version = db.get(PortfolioVersion, run.portfolio_version_id or version_id)
            if version is None:
                raise DomainError("PORTFOLIO_NOT_FOUND", "Версия портфеля не найдена")
            result = _run_cashflows(db, run, version)
            run.result = _save_cashflows(db, run, version, result)
            if result.status != "succeeded":
                _block_valuation(db, run, "Расчёт денежных потоков завершён с ошибками")
                _finish(db, run, result.status)
                return
            automatic = (run.inputs or {}).get("curve_mode") == "automatic"
            if not run.market_snapshot_id and not automatic:
                _block_valuation(db, run, "Не выбран проверенный снимок дисконтной кривой")
                _finish(db, run, "partial")
                return
            try:
                if run.market_snapshot_id:
                    snapshot = _snapshot(db, run.market_snapshot_id, version.valuation_date)
                else:
                    snapshot = _load_automatic_snapshot(db, version.valuation_date)
                    run.market_snapshot_id = snapshot.id
                    run.method_version = snapshot.convention if snapshot.curve_type == QUANTUM_TERM_CURVE else get_settings().valuation_method
                    run.inputs = {**(run.inputs or {}), "curve_hash": snapshot.data_hash, "discount_scenario": "base"}
                priced = _price(version, _event_data(result.events), discount_points(snapshot), run.method_version)
            except DomainError as exc:
                _block_valuation(db, run, exc.message, exc.code)
                _finish(db, run, "partial")
                return
            run.result = {
                **run.result, **priced, "snapshot_id": snapshot.id, "convention": snapshot.convention,
                "valuation_status": "succeeded",
            }
            _finish(db, run, "succeeded")
        except DomainError as exc:
            _fail_run(db, run_id, exc)
        except Exception:
            logger.exception("Ошибка расчёта %s", run_id)
            _fail_run(db, run_id, DomainError("CALCULATION_FAILED", "Не удалось сохранить расчёт денежных потоков и NPV"))


def refresh_quantum(db: Session) -> MarketDataSnapshot:
    adapter = QuantumCurvesAdapter()
    snapshot = import_quantum_snapshot(db, adapter, adapter.get_latest_snapshot())
    db.commit()
    return snapshot


def create_quantum_run(db: Session, trade_date: date | None) -> CalculationRun:
    run = CalculationRun(
        run_type="quantum_curve", inputs={"trade_date": trade_date.isoformat() if trade_date else None},
        args_hash=stable_hash({"trade_date": trade_date}),
    )
    return _submit(db, run, execute_quantum_job)


def execute_quantum_job(run_id: str) -> None:
    with SessionLocal() as db:
        run = _claim(db, run_id, "quantum")
        if run is None:
            return
        try:
            adapter = QuantumCurvesAdapter()
            response = adapter.request_calculation((run.inputs or {}).get("trade_date"))
            snapshot = import_quantum_snapshot(db, adapter, response)
            run.market_snapshot_id = snapshot.id
            run.result = {"snapshot_id": snapshot.id, "trade_date": snapshot.trade_date.isoformat(), "curve_hash": snapshot.data_hash}
            _finish(db, run, "succeeded")
        except DomainError as exc:
            _fail_run(db, run_id, exc)
        except Exception:
            logger.exception("Ошибка импорта снимка Quantum для запуска %s", run_id)
            _fail_run(db, run_id, DomainError("QUANTUM_IMPORT_FAILED", "Не удалось сохранить снимок QuantumTeam"))


def completed_valuation(db: Session, run_id: str) -> CalculationRun:
    run = db.get(CalculationRun, run_id)
    if (
        not run or run.run_type != "valuation" or run.status != "succeeded"
        or not run.portfolio_version_id or not run.market_snapshot_id or not run.valuation_date
        or not run.result or not {"npv", "pv", "balance"} <= run.result.keys()
    ):
        raise DomainError("BASE_RUN_INCOMPLETE", "Базовый запуск не содержит полного NPV", status_code=409)
    return run


def create_market_scenario(db: Session, payload: MarketScenarioRequest) -> CalculationRun:
    base = completed_valuation(db, payload.base_run_id)
    inputs = base.inputs or {}
    discount_scenario, indicator_scenario = payload.discount_scenario or "base", payload.indicator_scenario or "base"
    if discount_scenario == indicator_scenario == "base":
        raise DomainError("SCENARIO_REQUIRED", "Выберите стресс кривой MOEX или прогноза CBKEY1M")
    snapshot = _snapshot(db, base.market_snapshot_id, base.valuation_date)
    discount_points(snapshot, discount_scenario)
    if indicator_scenario != "base":
        forecast_id = inputs.get("forecast_id")
        if not forecast_id or indicator_scenario not in _dataset(db, forecast_id, "forecast").scenarios:
            raise DomainError("FORECAST_SCENARIO_MISSING", f"Базовый прогноз не содержит сценарий {indicator_scenario}", status_code=409)
    run = CalculationRun(
        run_type="scenario", portfolio_version_id=base.portfolio_version_id, valuation_date=base.valuation_date,
        market_snapshot_id=base.market_snapshot_id, method_version=base.method_version,
        engine_sha=get_settings().nosnitches_sha,
        inputs={
            **inputs, "base_run_id": base.id, "discount_scenario": discount_scenario,
            "indicator_scenario": indicator_scenario if inputs.get("forecast_id") else None,
        },
        args_hash=stable_hash(payload.model_dump()),
    )
    return _submit(db, run, execute_market_scenario_job)


def _scenario_result(base: CalculationRun, steps: list[tuple[str, Decimal]], reused: bool) -> dict:
    base_npv = Decimal(base.result["npv"])
    scenario_npv = steps[-1][1]
    return {
        "base_run_id": base.id, "base_npv": str(base_npv), "scenario_npv": str(scenario_npv),
        "delta_npv": str(scenario_npv - base_npv), "waterfall": sequential_waterfall(base_npv, steps),
        "cashflows_reused": reused, "cfgen_invoked": not reused, "valuation_status": "succeeded",
        **({"cashflow_run_id": base.id, "artifacts": base.result.get("artifacts", [])} if reused else {}),
    }


def execute_market_scenario_job(run_id: str) -> None:
    with SessionLocal() as db:
        run = _claim(db, run_id, "scenario")
        if run is None:
            return
        try:
            inputs = run.inputs or {}
            base = completed_valuation(db, inputs["base_run_id"])
            version = db.get(PortfolioVersion, base.portfolio_version_id)
            snapshot = _snapshot(db, run.market_snapshot_id, version.valuation_date)
            discount_scenario = inputs["discount_scenario"]
            indicator_scenario = inputs["indicator_scenario"]
            points = discount_points(snapshot, discount_scenario)
            steps: list[tuple[str, Decimal]] = []
            if discount_scenario != "base":
                priced = _price(version, _stored_events(db, base.id), points, run.method_version)
                steps.append((f"Кривая MOEX: {discount_scenario}", Decimal(priced["npv"])))
            reused = indicator_scenario in {None, "base"}
            if not reused:
                result = _run_cashflows(db, run, version)
                run.result = _save_cashflows(db, run, version, result)
                if result.status != "succeeded":
                    _block_valuation(db, run, "Сценарный расчёт денежных потоков завершён с ошибками")
                    _finish(db, run, result.status)
                    return
                priced = _price(version, _event_data(result.events), points, run.method_version)
                steps.append((f"Прогноз CBKEY1M: {indicator_scenario}", Decimal(priced["npv"])))
            run.result = {**(run.result or {}), **_scenario_result(base, steps, reused)}
            _finish(db, run, "succeeded")
        except DomainError as exc:
            if exc.code == "VALUATION_COVERAGE":
                _block_valuation(db, run, exc.message, exc.code)
                _finish(db, run, "partial" if run.result.get("artifacts") else "failed")
            else:
                _fail_run(db, run_id, exc)
        except Exception:
            logger.exception("Ошибка сценарного расчёта %s", run_id)
            _fail_run(db, run_id, DomainError("SCENARIO_FAILED", "Не удалось выполнить сценарный расчёт"))


def run_discount_scenario(db: Session, payload: ScenarioRequest) -> CalculationRun:
    base = completed_valuation(db, payload.base_run_id)
    if any(factor.kind != "discount_shift_bp" for factor in payload.factors):
        raise DomainError("FACTOR_REQUIRES_CFGEN", "Изменение договорной ставки требует отдельного пересчёта cfgen", status_code=409)
    version = db.get(PortfolioVersion, base.portfolio_version_id)
    if version.portfolio_id != payload.portfolio_id:
        raise DomainError("BASE_RUN_PORTFOLIO_MISMATCH", "Базовый запуск относится к другому портфелю", status_code=409)
    snapshot = _snapshot(db, base.market_snapshot_id, version.valuation_date)
    events = _stored_events(db, base.id)
    points = discount_points(snapshot)
    steps: list[tuple[str, Decimal]] = []
    for index, factor in enumerate(payload.factors, start=1):
        points = shifted_points(points, factor.value)
        priced = _price(version, events, points, base.method_version)
        steps.append((f"Сдвиг кривой {factor.value} б.п. (шаг {index})", Decimal(priced["npv"])))
    run = CalculationRun(
        run_type="scenario", portfolio_version_id=version.id, valuation_date=version.valuation_date,
        started_at=utcnow(), market_snapshot_id=snapshot.id, method_version=base.method_version,
        inputs={**(base.inputs or {}), "base_run_id": base.id}, args_hash=stable_hash(payload.model_dump(mode="json")),
        result={"name": payload.name, **_scenario_result(base, steps, True)},
    )
    db.add(run)
    db.flush()
    _finish(db, run, "succeeded")
    return run
