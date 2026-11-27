from __future__ import annotations

import hashlib
import json
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session
from redis import Redis
from rq import Queue

from app.core.config import get_settings
from app.core.errors import DomainError
from app.domain.generator import GeneratorRequest, config_hash, generate_deals
from app.models import (
    AuditEvent,
    CalculationRun,
    CurvePoint,
    Deal,
    MarketDataSnapshot,
    Portfolio,
    PortfolioVersion,
    StoredArtifact,
    utcnow,
)
from app.schemas import CurveImportRequest
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


def execute_calculation_job(run_id: str, version_id: str) -> None:
    # Старые задания RQ содержат путь к этой функции.
    from app.calculations import execute_calculation_job as calculate

    calculate(run_id, version_id)


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


def register_artifact(db: Session, run_id: str | None, artifact_type: str, path: Path, root: Path) -> StoredArtifact:
    resolved = path.resolve()
    if root.resolve() not in resolved.parents:
        raise DomainError("UNSAFE_ARTIFACT_PATH", "Недопустимый путь артефакта", status_code=400)
    with resolved.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    artifact = StoredArtifact(run_id=run_id, artifact_type=artifact_type, filename=resolved.name, relative_path=str(resolved.relative_to(root.resolve())), sha256=digest, size_bytes=resolved.stat().st_size)
    db.add(artifact)
    db.flush()
    return artifact
