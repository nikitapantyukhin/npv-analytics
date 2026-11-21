from __future__ import annotations

import hashlib
import json
import math
import random
from calendar import monthrange
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from app.core.config import get_settings
from app.schemas import GeneratorRequest


NOSNITCHES_HEADERS = [
    "report_dttm", "discriminator", "deal_id", "currency_id", "start_principal_amt",
    "current_principal_amt", "deal_dttm", "maturity_dttm", "rate_type_cd", "interest_rate",
    "base_indicator_rate", "base_indicator", "interest_payment_rule_start_dttm",
    "interest_payment_rule_period_cd", "interest_payment_rule_day_num", "day_convention_cd",
    "regular_payment_rule_start_dttm", "regular_payment_rule_period_cd", "regular_payment_rule_day_num",
    "repricing_rule_start_dttm", "repricing_rule_period_cd", "repricing_rule_day_num", "accrued_interest",
    "product", "behavior_model_cd", "interest_payment", "principal_payment", "repricing_dttm_schedule",
    "repricing_dttm_rate_schedule", "repricing_dttm_rate_schedule_fixed", "cap_limit_interest_rate",
    "floor_limit_interest_rate", "sub_rate_type_cd", "sub_interest_rate", "sub_float_indicator",
    "sub_payment_rule_period_cd", "sub_payment_rule_day_num", "sub_payment_rule_start_dttm",
    "sub_repricing_rule_start_dttm", "sub_repricing_rule_period_cd", "sub_repricing_rule_day_num",
    "sub_cap_limit_interest_rate", "sub_floor_limit_interest_rate", "sub_coeff_index", "deal_report_dttm",
    "sub_repricing_rule_first_event_flg", "indicator_lag_cd", "sub_indicator_lag_cd", "prepayment_schedule",
]


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)


def largest_remainder(total: int, weights: dict[str, int]) -> dict[str, int]:
    raw = {key: Decimal(total) * Decimal(weight) / Decimal(100) for key, weight in weights.items()}
    counts = {key: int(value) for key, value in raw.items()}
    remainder = total - sum(counts.values())
    ranked = sorted(weights, key=lambda key: (raw[key] - counts[key], key), reverse=True)
    for key in ranked[:remainder]:
        counts[key] += 1
    return counts


def exact_assignments(total: int, weights: dict[str, int], rng: random.Random) -> list[str]:
    assignments: list[str] = []
    for key, count in largest_remainder(total, weights).items():
        assignments.extend([key] * count)
    rng.shuffle(assignments)
    return assignments


def _amount(config: GeneratorRequest, rng: random.Random) -> Decimal:
    low, high = float(config.min_amount), float(config.max_amount)
    if config.amount_distribution == "uniform":
        value = rng.uniform(low, high)
    elif config.amount_distribution == "normal":
        value = min(high, max(low, rng.gauss((low + high) / 2, (high - low) / 6)))
    else:
        log_low, log_high = math.log(low), math.log(high)
        value = math.exp(rng.uniform(log_low, log_high))
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def canonical_config(config: GeneratorRequest) -> str:
    return json.dumps(config.model_dump(mode="json"), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def config_hash(config: GeneratorRequest) -> str:
    return hashlib.sha256(canonical_config(config).encode()).hexdigest()


def deals_hash(deals: list[dict]) -> str:
    payload = json.dumps(deals, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def generate_deals(config: GeneratorRequest) -> tuple[list[dict], dict]:
    rng = random.Random(config.seed)
    kinds = exact_assignments(config.count, {"credit": config.credit_share, "deposit": 100 - config.credit_share}, rng)
    schedules = exact_assignments(
        config.count,
        {"ANN": config.schedules.ann, "RGM": config.schedules.rgm, "SIMPLE": config.schedules.simple},
        rng,
    )
    rate_types = exact_assignments(config.count, {"FIXED": config.fixed_share, "FLOAT": 100 - config.fixed_share}, rng)
    deals: list[dict] = []
    next_payment = add_months(config.valuation_date, 1)
    payment_day = min(config.valuation_date.day, 28)
    for index in range(config.count):
        kind = kinds[index]
        discriminator = schedules[index]
        rate_type = rate_types[index]
        amount = _amount(config, rng)
        signed_amount = amount if kind == "credit" else -amount
        months = rng.randint(config.min_term_months, config.max_term_months)
        maturity = add_months(config.valuation_date, months)
        rate_percent = rng.uniform(float(config.min_rate_percent), float(config.max_rate_percent))
        rate_decimal = Decimal(str(rate_percent / 100)).quantize(Decimal("0.00000001"))
        deal_id = f"{'CR' if kind == 'credit' else 'DP'}-{index + 1:07d}"
        regular_period = "ENDDATE" if discriminator == "SIMPLE" else "1M"
        principal_payment = f"{maturity.isoformat()},{amount}" if discriminator == "SIMPLE" else ""
        row = {header: "" for header in NOSNITCHES_HEADERS}
        row.update(
            {
                "report_dttm": config.valuation_date.isoformat(),
                "discriminator": discriminator,
                "deal_id": deal_id,
                "currency_id": "RUB",
                "start_principal_amt": str(signed_amount),
                "current_principal_amt": str(signed_amount),
                "deal_dttm": config.valuation_date.isoformat(),
                "maturity_dttm": maturity.isoformat(),
                "rate_type_cd": rate_type,
                "interest_rate": str(rate_decimal),
                "base_indicator": "CBKEY1M" if rate_type == "FLOAT" else "",
                "interest_payment_rule_start_dttm": next_payment.isoformat(),
                "interest_payment_rule_period_cd": "1M",
                "interest_payment_rule_day_num": str(payment_day),
                "day_convention_cd": "ACT/365",
                "regular_payment_rule_start_dttm": next_payment.isoformat() if discriminator != "SIMPLE" else maturity.isoformat(),
                "regular_payment_rule_period_cd": regular_period,
                "regular_payment_rule_day_num": str(payment_day),
                "repricing_rule_start_dttm": next_payment.isoformat() if rate_type == "FLOAT" else "",
                "repricing_rule_period_cd": "1M" if rate_type == "FLOAT" else "",
                "repricing_rule_day_num": str(payment_day) if rate_type == "FLOAT" else "",
                "accrued_interest": "0",
                "product": "SYNTHETIC_CREDIT" if kind == "credit" else "SYNTHETIC_DEPOSIT",
                "behavior_model_cd": "",
                "principal_payment": principal_payment,
                "deal_report_dttm": config.valuation_date.isoformat(),
                "indicator_lag_cd": "0D" if rate_type == "FLOAT" else "",
            }
        )
        deals.append(row)

    stats = {
        "count": len(deals),
        "credit_count": kinds.count("credit"),
        "deposit_count": kinds.count("deposit"),
        "schedule_counts": {key: schedules.count(key) for key in ("ANN", "RGM", "SIMPLE")},
        "rate_type_counts": {key: rate_types.count(key) for key in ("FIXED", "FLOAT")},
        "config_hash": config_hash(config),
        "deals_hash": deals_hash(deals),
        "generator_version": get_settings().generator_version,
    }
    return deals, stats


def validate_deal_rows(rows: list[dict]) -> list[dict]:
    issues: list[dict] = []
    seen: set[str] = set()
    for number, row in enumerate(rows, start=2):
        deal_id = str(row.get("deal_id", "")).strip()
        if not deal_id:
            issues.append({"row": number, "deal_id": None, "severity": "error", "code": "MISSING_FIELD", "field": "deal_id", "message": "Не указан deal_id"})
        elif deal_id in seen:
            issues.append({"row": number, "deal_id": deal_id, "severity": "error", "code": "DUPLICATE_DEAL_ID", "field": "deal_id", "message": "Повторяющийся deal_id"})
        seen.add(deal_id)
        if row.get("discriminator") not in {"ANN", "RGM", "SIMPLE"}:
            issues.append({"row": number, "deal_id": deal_id, "severity": "error", "code": "UNKNOWN_DISCRIMINATOR", "field": "discriminator", "message": "Допустимы ANN, RGM, SIMPLE"})
        if row.get("rate_type_cd") not in {"FIXED", "FLOAT"}:
            issues.append({"row": number, "deal_id": deal_id, "severity": "error", "code": "BAD_RATE_TYPE", "field": "rate_type_cd", "message": "Допустимы FIXED и FLOAT"})
        try:
            if Decimal(str(row.get("current_principal_amt", "0"))) == 0:
                raise ValueError
        except Exception:
            issues.append({"row": number, "deal_id": deal_id, "severity": "error", "code": "BAD_NUMBER", "field": "current_principal_amt", "message": "Остаток должен быть ненулевым числом"})
    return issues
