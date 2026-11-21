from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, getcontext


getcontext().prec = 34


@dataclass(frozen=True)
class DiscountPoint:
    tenor_years: Decimal
    rate_decimal: Decimal


@dataclass(frozen=True)
class ValuedEvent:
    deal_id: str
    payment_date: date
    amount: Decimal
    time_fraction: Decimal
    rate_decimal: Decimal
    discount_factor: Decimal
    present_value: Decimal


def act365(valuation_date: date, payment_date: date) -> Decimal:
    days = (payment_date - valuation_date).days
    if days <= 0:
        raise ValueError("Платёж должен быть позже даты оценки")
    return Decimal(days) / Decimal(365)


def interpolate_zero_rate(points: list[DiscountPoint], tenor: Decimal) -> Decimal:
    ordered = sorted(points, key=lambda item: item.tenor_years)
    if not ordered:
        raise ValueError("Кривая пуста")
    if tenor < ordered[0].tenor_years or tenor > ordered[-1].tenor_years:
        raise ValueError("Срок вне диапазона кривой; скрытая экстраполяция запрещена")
    for point in ordered:
        if tenor == point.tenor_years:
            return point.rate_decimal
    for left, right in zip(ordered, ordered[1:], strict=False):
        if left.tenor_years < tenor < right.tenor_years:
            weight = (tenor - left.tenor_years) / (right.tenor_years - left.tenor_years)
            return left.rate_decimal + (right.rate_decimal - left.rate_decimal) * weight
    raise ValueError("Не удалось интерполировать ставку")


def continuous_discount_factor(rate_decimal: Decimal, tenor: Decimal) -> Decimal:
    return (-rate_decimal * tenor).exp()


def value_events(events: list[dict], valuation_date: date, points: list[DiscountPoint]) -> tuple[list[ValuedEvent], Decimal]:
    valued: list[ValuedEvent] = []
    total_pv = Decimal(0)
    for event in events:
        amount = Decimal(str(event["amount"]))
        if amount == 0:
            continue
        payment_date = event["payment_date"] if isinstance(event["payment_date"], date) else date.fromisoformat(str(event["payment_date"]))
        tenor = act365(valuation_date, payment_date)
        rate = interpolate_zero_rate(points, tenor)
        factor = continuous_discount_factor(rate, tenor)
        pv = amount * factor
        valued.append(ValuedEvent(str(event["deal_id"]), payment_date, amount, tenor, rate, factor, pv))
        total_pv += pv
    return valued, total_pv


def calculate_npv(events: list[dict], balances: dict[str, Decimal], valuation_date: date, points: list[DiscountPoint]) -> dict:
    valued, total_pv = value_events(events, valuation_date, points)
    total_balance = sum(balances.values(), Decimal(0))
    by_deal_pv: dict[str, Decimal] = {}
    for event in valued:
        by_deal_pv[event.deal_id] = by_deal_pv.get(event.deal_id, Decimal(0)) + event.present_value
    by_deal = {
        deal_id: {"pv": str(by_deal_pv.get(deal_id, Decimal(0))), "balance": str(balance), "npv": str(by_deal_pv.get(deal_id, Decimal(0)) - balance)}
        for deal_id, balance in balances.items()
    }
    return {
        "pv": str(total_pv),
        "balance": str(total_balance),
        "npv": str(total_pv - total_balance),
        "by_deal": by_deal,
        "event_count": len(valued),
    }


def shifted_points(points: list[DiscountPoint], shift_bp: Decimal) -> list[DiscountPoint]:
    shift = shift_bp / Decimal(10_000)
    return [DiscountPoint(point.tenor_years, point.rate_decimal + shift) for point in points]


def sequential_waterfall(base_npv: Decimal, step_npvs: list[tuple[str, Decimal]]) -> list[dict]:
    previous = base_npv
    waterfall: list[dict] = []
    for factor, current in step_npvs:
        waterfall.append({"factor": factor, "npv_before": str(previous), "npv_after": str(current), "contribution": str(current - previous)})
        previous = current
    if sum((Decimal(item["contribution"]) for item in waterfall), Decimal(0)) != previous - base_npv:
        raise ArithmeticError("Waterfall не телескопируется")
    return waterfall
