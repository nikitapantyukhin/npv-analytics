from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class CategoryWeights(BaseModel):
    ann: int = Field(default=50, ge=0, le=100)
    rgm: int = Field(default=30, ge=0, le=100)
    simple: int = Field(default=20, ge=0, le=100)

    @model_validator(mode="after")
    def total_is_100(self):
        if self.ann + self.rgm + self.simple != 100:
            raise ValueError("Доли ANN/RGM/SIMPLE должны составлять 100%")
        return self


class GeneratorRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    portfolio_type: Literal["credit", "deposit", "mixed"] = "mixed"
    count: int = Field(default=1000, ge=1, le=100_000)
    valuation_date: date
    seed: int = 42
    credit_share: int = Field(default=70, ge=0, le=100)
    min_amount: Decimal = Field(default=Decimal("100000"), gt=0)
    max_amount: Decimal = Field(default=Decimal("5000000"), gt=0)
    min_term_months: int = Field(default=6, ge=1, le=360)
    max_term_months: int = Field(default=60, ge=1, le=360)
    min_rate_percent: Decimal = Field(default=Decimal("8"), ge=0, le=100)
    max_rate_percent: Decimal = Field(default=Decimal("24"), ge=0, le=100)
    fixed_share: int = Field(default=70, ge=0, le=100)
    schedules: CategoryWeights = CategoryWeights()
    amount_distribution: Literal["uniform", "normal", "lognormal"] = "lognormal"
    idempotency_key: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def validate_ranges(self):
        if self.min_amount >= self.max_amount:
            raise ValueError("Минимальная сумма должна быть меньше максимальной")
        if self.min_term_months > self.max_term_months:
            raise ValueError("Минимальный срок должен быть не больше максимального")
        if self.min_rate_percent > self.max_rate_percent:
            raise ValueError("Минимальная ставка должна быть не больше максимальной")
        if self.portfolio_type == "credit" and self.credit_share != 100:
            self.credit_share = 100
        if self.portfolio_type == "deposit" and self.credit_share != 0:
            self.credit_share = 0
        return self


class CalculateRequest(BaseModel):
    snapshot_id: str | None = None
    idempotency_key: str | None = Field(default=None, max_length=120)


class CurvePointIn(BaseModel):
    bucket_code: str
    tenor_years: Decimal = Field(gt=0)
    rate_percent: Decimal


class CurveImportRequest(BaseModel):
    source: Literal["quantum_cached", "verified_external", "educational_reference"]
    trade_date: date
    convention: str = "continuous_zero_rate_ACT365"
    external_id: str | None = None
    source_sha: str | None = None
    points: list[CurvePointIn] = Field(min_length=2)


class ScenarioFactor(BaseModel):
    kind: Literal["discount_shift_bp", "contract_rate_pp"]
    value: Decimal


class ScenarioRequest(BaseModel):
    portfolio_id: str
    base_run_id: str
    factors: list[ScenarioFactor] = Field(min_length=1, max_length=10)
    name: str = Field(default="Пользовательский сценарий", max_length=200)


class RunOut(BaseModel):
    run_id: str
    status: str
    stage: str
    created_at: datetime


class APIError(BaseModel):
    code: str
    message: str
    details: dict | None = None
    field: str | None = None
    source: str | None = None
    run_id: str | None = None
    retryable: bool = False
