from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def uuid_str() -> str:
    return str(uuid4())


class Portfolio(Base):
    __tablename__ = "portfolios"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(200))
    portfolio_type: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    versions: Mapped[list[PortfolioVersion]] = relationship(back_populates="portfolio", cascade="all, delete-orphan")


class PortfolioVersion(Base):
    __tablename__ = "portfolio_versions"
    __table_args__ = (UniqueConstraint("portfolio_id", "version_no"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.id"), index=True)
    version_no: Mapped[int] = mapped_column(Integer, default=1)
    valuation_date: Mapped[date] = mapped_column(Date)
    config_hash: Mapped[str] = mapped_column(String(64))
    seed: Mapped[int] = mapped_column(Integer)
    generator_version: Mapped[str] = mapped_column(String(64))
    config: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    portfolio: Mapped[Portfolio] = relationship(back_populates="versions")
    deals: Mapped[list[Deal]] = relationship(back_populates="version", cascade="all, delete-orphan")


class Deal(Base):
    __tablename__ = "deals"
    __table_args__ = (
        UniqueConstraint("portfolio_version_id", "business_deal_id"),
        Index("ix_deals_version_kind", "portfolio_version_id", "kind"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    portfolio_version_id: Mapped[str] = mapped_column(ForeignKey("portfolio_versions.id"), index=True)
    business_deal_id: Mapped[str] = mapped_column(String(80), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    discriminator: Mapped[str] = mapped_column(String(16))
    rate_type: Mapped[str] = mapped_column(String(16))
    principal: Mapped[Decimal] = mapped_column(Numeric(24, 8))
    interest_rate: Mapped[Decimal] = mapped_column(Numeric(18, 10))
    deal_date: Mapped[date] = mapped_column(Date)
    maturity_date: Mapped[date] = mapped_column(Date)
    raw_fields: Mapped[dict] = mapped_column(JSON)
    validation_status: Mapped[str] = mapped_column(String(20), default="valid")
    version: Mapped[PortfolioVersion] = relationship(back_populates="deals")


class MarketDataSnapshot(Base):
    __tablename__ = "market_data_snapshots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    source: Mapped[str] = mapped_column(String(40))
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    trade_date: Mapped[date] = mapped_column(Date)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    curve_type: Mapped[str] = mapped_column(String(40), default="zero_rate")
    scenario: Mapped[str] = mapped_column(String(80), default="base")
    convention: Mapped[str] = mapped_column(String(120))
    rate_unit_source: Mapped[str] = mapped_column(String(40), default="percent")
    data_hash: Mapped[str] = mapped_column(String(64))
    source_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_response: Mapped[dict] = mapped_column(JSON)
    points: Mapped[list[CurvePoint]] = relationship(back_populates="snapshot", cascade="all, delete-orphan")


class CurvePoint(Base):
    __tablename__ = "curve_points"
    __table_args__ = (UniqueConstraint("snapshot_id", "tenor_years"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("market_data_snapshots.id"), index=True)
    bucket_code: Mapped[str] = mapped_column(String(32))
    tenor_years: Mapped[Decimal] = mapped_column(Numeric(18, 10))
    rate_decimal: Mapped[Decimal] = mapped_column(Numeric(18, 12))
    shift_bp: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    snapshot: Mapped[MarketDataSnapshot] = relationship(back_populates="points")


class CalculationRun(Base):
    __tablename__ = "calculation_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_type: Mapped[str] = mapped_column(String(32))
    portfolio_version_id: Mapped[str | None] = mapped_column(ForeignKey("portfolio_versions.id"), nullable=True, index=True)
    valuation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    stage: Mapped[str] = mapped_column(String(40), default="queued")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    engine_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    market_snapshot_id: Mapped[str | None] = mapped_column(ForeignKey("market_data_snapshots.id"), nullable=True)
    method_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    args_hash: Mapped[str] = mapped_column(String(64), index=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CashflowEvent(Base):
    __tablename__ = "cashflow_events"
    __table_args__ = (UniqueConstraint("run_id", "business_deal_id", "event_order"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("calculation_runs.id"), index=True)
    deal_id: Mapped[str | None] = mapped_column(ForeignKey("deals.id"), nullable=True, index=True)
    business_deal_id: Mapped[str] = mapped_column(String(80), index=True)
    event_order: Mapped[int] = mapped_column(Integer)
    payment_date: Mapped[date] = mapped_column(Date)
    payment_type: Mapped[str] = mapped_column(String(40))
    stream: Mapped[str] = mapped_column(String(16))
    amount: Mapped[Decimal] = mapped_column(Numeric(24, 8))
    principal_before: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    principal_after: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 12), nullable=True)
    base_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 12), nullable=True)
    raw_fields: Mapped[dict] = mapped_column(JSON)


class ValidationIssue(Base):
    __tablename__ = "validation_issues"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("calculation_runs.id"), nullable=True, index=True)
    deal_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    severity: Mapped[str] = mapped_column(String(16))
    code: Mapped[str] = mapped_column(String(80))
    field: Mapped[str | None] = mapped_column(String(80), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    level: Mapped[str] = mapped_column(String(16), default="info")
    module: Mapped[str] = mapped_column(String(40))
    code: Mapped[str] = mapped_column(String(80))
    message: Mapped[str] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StoredArtifact(Base):
    __tablename__ = "stored_artifacts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("calculation_runs.id"), nullable=True, index=True)
    artifact_type: Mapped[str] = mapped_column(String(40))
    filename: Mapped[str] = mapped_column(String(255))
    relative_path: Mapped[str] = mapped_column(String(500))
    sha256: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
