from datetime import date

from app.domain.generator import generate_deals, largest_remainder, validate_deal_rows
from app.schemas import GeneratorRequest


def make_config(count: int = 10, seed: int = 42) -> GeneratorRequest:
    return GeneratorRequest(name="Тест", count=count, seed=seed, valuation_date=date(2026, 11, 21))


def test_largest_remainder_is_exact():
    assert largest_remainder(7, {"credit": 70, "deposit": 30}) == {"credit": 5, "deposit": 2}


def test_generator_is_reproducible_and_contract_valid():
    first, first_stats = generate_deals(make_config(100, 17))
    second, second_stats = generate_deals(make_config(100, 17))
    assert first == second
    assert first_stats["deals_hash"] == second_stats["deals_hash"]
    assert first_stats["credit_count"] == 70
    assert first_stats["deposit_count"] == 30
    assert first_stats["schedule_counts"] == {"ANN": 50, "RGM": 30, "SIMPLE": 20}
    assert validate_deal_rows(first) == []
    assert len({row["deal_id"] for row in first}) == 100


def test_generator_supports_one_and_thousand_rows():
    for count in (1, 1000):
        deals, stats = generate_deals(make_config(count))
        assert len(deals) == count
        assert stats["count"] == count
