from datetime import date
from decimal import Decimal

import pytest

from app.domain.valuation import DiscountPoint, calculate_npv, continuous_discount_factor, sequential_waterfall, shifted_points


POINTS = [DiscountPoint(Decimal("0.1"), Decimal("0.10")), DiscountPoint(Decimal("5"), Decimal("0.10"))]


def test_manual_signed_npv_formula():
    events = [
        {"deal_id": "CR-1", "payment_date": date(2027, 11, 21), "amount": Decimal("110")},
        {"deal_id": "DP-1", "payment_date": date(2027, 11, 21), "amount": Decimal("-55")},
    ]
    result = calculate_npv(events, {"CR-1": Decimal("100"), "DP-1": Decimal("-50")}, date(2026, 11, 21), POINTS)
    df = continuous_discount_factor(Decimal("0.10"), Decimal(1))
    # События аккумулируются отдельно: это сохраняет аудируемый порядок CF
    # и может отличаться от предварительного неттинга на последний знак Decimal.
    expected = Decimal("110") * df + Decimal("-55") * df - Decimal("50")
    assert Decimal(result["npv"]) == expected
    assert Decimal(result["npv"]) == sum((Decimal(item["npv"]) for item in result["by_deal"].values()), Decimal(0))


def test_zero_scenario_and_waterfall_telescope():
    base = Decimal("100")
    waterfall = sequential_waterfall(base, [("zero", Decimal("100")), ("change", Decimal("93.25"))])
    assert Decimal(waterfall[0]["contribution"]) == 0
    assert sum((Decimal(item["contribution"]) for item in waterfall), Decimal(0)) == Decimal("-6.75")


def test_discount_shift_changes_df_not_cashflows():
    shifted = shifted_points(POINTS, Decimal("100"))
    assert shifted[0].rate_decimal == Decimal("0.11")
    assert continuous_discount_factor(shifted[0].rate_decimal, Decimal(1)) < continuous_discount_factor(POINTS[0].rate_decimal, Decimal(1))


def test_out_of_curve_fails_instead_of_hidden_extrapolation():
    with pytest.raises(ValueError, match="вне диапазона"):
        calculate_npv([{"deal_id": "1", "payment_date": date(2036, 1, 1), "amount": Decimal("1")}], {"1": Decimal("1")}, date(2026, 1, 1), POINTS)
