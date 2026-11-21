import os
import subprocess
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.domain.generator import generate_deals
from app.integrations.cashflow import CashflowEngineAdapter
from app.schemas import GeneratorRequest


REPO = Path(os.environ.get("NOSNITCHES_REPO", "/nonexistent"))
BINARY = Path(os.environ.get("CFGEN_BIN", "/nonexistent"))


@pytest.mark.skipif(not (REPO / "testdata/deals/test_deals.csv").is_file() or not BINARY.is_file(), reason="Нужны NOSNITCHES_REPO и собранный CFGEN_BIN")
def test_official_golden_and_generated_contract(tmp_path):
    adapter = CashflowEngineAdapter(str(BINARY), timeout=120)
    # Официальный golden проверяется непосредственно CLI, чтобы не менять контракт команды.
    out = tmp_path / "official"
    subprocess.run([str(BINARY), "run", "--deals", str(REPO / "testdata/deals/test_deals.csv"), "--rates", str(REPO / "testdata/rates/key_rate.csv"), "--out-dir", str(out)], check=True)
    verify = subprocess.run([str(BINARY), "verify", "--result", str(out / "cashflow.csv"), "--golden-dir", str(REPO / "testdata/golden")], capture_output=True, text=True)
    assert verify.returncode == 0, verify.stdout + verify.stderr

    config = GeneratorRequest(name="cfgen", portfolio_type="credit", count=10, valuation_date=date(2026, 11, 21), fixed_share=100, credit_share=100)
    deals, _ = generate_deals(config)
    result = adapter.calculate(deals, REPO / "testdata/rates/key_rate.csv", f"generated-contract-{tmp_path.name}")
    assert result.status == "succeeded", result.issues
    assert {event["deal_id"] for event in result.events} == {deal["deal_id"] for deal in deals}


@pytest.mark.skipif(not BINARY.is_file(), reason="Нужен собранный CFGEN_BIN")
def test_end_to_end_cf_df_npv_and_scenario(client):
    generated = client.post("/api/portfolios/generate", json={
        "name": "Сквозной тест", "portfolio_type": "credit", "count": 10,
        "valuation_date": "2026-11-21", "seed": 42, "credit_share": 100,
        "fixed_share": 100,
    }).json()
    assert generated["status"] == "succeeded", generated
    portfolio_id = generated["result"]["portfolio_id"]

    snapshot = client.post("/api/curves/import", json={
        "source": "educational_reference",
        "trade_date": "2026-11-21",
        "convention": "continuous_zero_rate_ACT365",
        "points": [
            {"bucket_code": "1d", "tenor_years": "0.0027", "rate_percent": "10"},
            {"bucket_code": "30y", "tenor_years": "30", "rate_percent": "10"},
        ],
    }).json()
    calculated = client.post(f"/api/portfolios/{portfolio_id}/calculate", json={"snapshot_id": snapshot["id"]}).json()
    assert calculated["status"] == "succeeded", calculated
    assert calculated["result"]["cashflow_event_count"] > 0
    assert calculated["result"]["event_count"] > 0

    scenario = client.post("/api/analysis/scenario", json={
        "portfolio_id": portfolio_id,
        "base_run_id": calculated["run_id"],
        "name": "+100 bp",
        "factors": [{"kind": "discount_shift_bp", "value": "100"}],
    }).json()
    assert scenario["status"] == "succeeded", scenario
    result = scenario["result"]
    assert result["cashflows_reused"] is True
    assert result["cfgen_invoked"] is False
    assert result["delta_npv"] != "0"
    assert sum(Decimal(item["contribution"]) for item in result["waterfall"]) == Decimal(result["delta_npv"])
