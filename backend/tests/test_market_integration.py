import csv
import io
import subprocess
from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.calculations import execute_calculation_job
from app.core.config import get_settings
from app.db import SessionLocal
from app.domain.valuation import EFFECTIVE_ACT365
from app.integrations.cashflow import CashflowEngineAdapter
from app.models import MarketDataSnapshot
from app.worker import mark_interrupted_run


HISTORY = b"indicator,date,rate\nCBKEY1M,2026-11-20,0.08\n"
FORECAST = b"indicator,date,rate,scenario\nCBKEY1M,2026-12-01,0.10,base\nCBKEY1M,2026-12-01,0.12,stress\n"
EXPORT = (
    "trade_date,scenario,tenor_years,rate\n"
    "2026-11-21,base,0.5,0.10\n2026-11-21,base,2,0.10\n"
    "2026-11-21,parallel_up,0.5,0.20\n2026-11-21,parallel_up,2,0.20\n"
)


@pytest.fixture
def quantum(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[httpx.Request]]:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/api/v1/exports/curves/17/moex.csv":
            return httpx.Response(200, text=EXPORT)
        if request.url.path in {"/api/v1/curves/latest", "/api/v1/curves/calculate"}:
            return httpx.Response(200, json={"id": 17, "status": "built", "trade_date": "2026-11-21"})
        return httpx.Response(404)

    with httpx.Client(transport=httpx.MockTransport(respond)) as upstream:
        monkeypatch.setattr("app.integrations.curves.httpx.request", upstream.request)
        yield requests


@pytest.fixture
def cashflow_cli(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    calls: list[dict] = []

    def execute(command: list[str], *, capture_output: bool, text: bool, timeout: int, check: bool) -> subprocess.CompletedProcess[str]:
        arguments = dict(zip(command[2::2], command[3::2], strict=True))
        forecast = Path(arguments["--curves"]).read_bytes() if "--curves" in arguments else None
        history = Path(arguments["--rates"]).read_bytes()
        scenario = arguments.get("--scenario", "base")
        calls.append({"arguments": arguments, "history": history, "forecast": forecast})
        with Path(arguments["--deals"]).open(encoding="utf-8") as source:
            deals = list(csv.DictReader(source))
        output = Path(arguments["--out-dir"])
        output.mkdir()
        base_rate = "0.12" if scenario == "stress" else "0.10"
        with (output / "cashflow.csv").open("w", encoding="utf-8", newline="") as destination:
            writer = csv.writer(destination)
            writer.writerow(["deal_id", "event_order", "payment_dttm", "payment_type", "stream", "amount", "base_rate"])
            for deal in deals:
                signed_amount = Decimal(deal["current_principal_amt"]) * (1 + Decimal(base_rate))
                writer.writerow([deal["deal_id"], "1", "2027-11-21", "repayment", "client", signed_amount, base_rate])
        (output / "errors.csv").write_text("deal_id,severity,code,field,message\n", encoding="utf-8")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr(CashflowEngineAdapter, "available", lambda self: True)
    monkeypatch.setattr(CashflowEngineAdapter, "checksum", lambda self: "test-binary")
    monkeypatch.setattr("app.integrations.cashflow.subprocess.run", execute)
    return calls


def _portfolio(client: TestClient, *, fixed_share: int = 0, valuation_date: str = "2026-11-21") -> str:
    response = client.post("/api/portfolios/generate", json={
        "name": "Проверка связки", "portfolio_type": "mixed", "count": 6,
        "valuation_date": valuation_date, "fixed_share": fixed_share,
    })
    assert response.json()["status"] == "succeeded", response.json()
    return response.json()["result"]["portfolio_id"]


def _history(client: TestClient, content: bytes = HISTORY) -> dict:
    response = client.post("/api/data/key-rates/import", files={"file": ("key_rate.csv", content)})
    assert response.status_code == 201, response.json()
    return response.json()


def _forecast(client: TestClient, content: bytes, valuation_date: str = "2026-11-21") -> httpx.Response:
    return client.post(
        "/api/data/key-rate-forecasts", data={"source": "Проверочный CSV", "valuation_date": valuation_date},
        files={"file": ("curves.csv", content)},
    )


def test_quantum_refresh_and_build_share_version(client: TestClient, quantum: list[httpx.Request]) -> None:
    refreshed = client.post("/api/curves/refresh")
    assert refreshed.status_code == 201, refreshed.json()
    snapshot = refreshed.json()
    assert snapshot["scenarios"] == ["base", "parallel_up"]
    assert snapshot["convention"] == EFFECTIVE_ACT365
    built = client.post("/api/curves/calculate", json={"trade_date": "2026-11-21"})
    assert built.status_code == 202
    assert built.json()["status"] == "succeeded", built.json()
    assert built.json()["result"]["snapshot_id"] == snapshot["id"]
    assert quantum[2].url.params["trade_date"] == "2026-11-21"
    latest = client.post("/api/curves/calculate")
    assert latest.status_code == 202
    assert latest.json()["result"]["snapshot_id"] == snapshot["id"]
    assert "trade_date" not in quantum[4].url.params
    assert len(client.get("/api/curves").json()) == 1
    stressed = client.get(f"/api/curves/{snapshot['id']}?scenario=parallel_up").json()
    assert Decimal(stressed["points"][0]["rate_decimal"]) == Decimal("0.20")
    assert Decimal(stressed["points"][0]["shift_bp"]) == 1000
    with SessionLocal() as db:
        stored = db.scalar(select(MarketDataSnapshot))
        assert stored.raw_response["moex_csv"] == EXPORT


@pytest.mark.parametrize("bad_row,reason", [
    ("CBKEY1M,2026-11-21,0.10,base", "позже даты оценки"),
    ("CBKEY1M,2026-12-01,NaN,base", "конечным числом"),
    ("CBKEY1M,2026-12-01,0.10,base\nCBKEY1M,2026-12-01,0.20,base", "Повтор даты"),
])
def test_invalid_forecast_reports_row(client: TestClient, bad_row: str, reason: str) -> None:
    response = _forecast(client, f"indicator,date,rate,scenario\n{bad_row}\n".encode())
    assert response.status_code == 400
    assert response.json()["code"] == "KEY_RATE_VALIDATION_FAILED"
    assert reason in response.json()["message"]
    assert client.get("/api/data/key-rate-forecasts").json() == []


def test_market_scenario_reuses_or_rebuilds_cashflows(
    client: TestClient, quantum: list[httpx.Request], cashflow_cli: list[dict],
) -> None:
    portfolio_id = _portfolio(client, fixed_share=50)
    curves = client.post("/api/curves/refresh").json()
    history = _history(client)
    forecast = _forecast(client, FORECAST).json()
    base = client.post(f"/api/portfolios/{portfolio_id}/calculate", json={
        "snapshot_id": curves["id"], "history_id": history["id"], "forecast_id": forecast["id"],
    }).json()
    assert base["status"] == "succeeded", base
    assert base["method_version"] == EFFECTIVE_ACT365
    assert abs(Decimal(base["result"]["npv"])) < Decimal("0.000001")
    assert cashflow_cli[0]["arguments"]["--report-date"] == "2026-11-21"
    assert cashflow_cli[0]["arguments"]["--scenario"] == "base"
    assert cashflow_cli[0]["history"] == HISTORY
    assert cashflow_cli[0]["forecast"] == FORECAST

    discount = client.post("/api/analysis/market-scenario", json={
        "base_run_id": base["run_id"], "discount_scenario": "parallel_up",
    }).json()
    assert discount["status"] == "succeeded", discount
    assert discount["result"]["cashflows_reused"] is True
    assert len(cashflow_cli) == 1

    stress = client.post("/api/analysis/market-scenario", json={
        "base_run_id": base["run_id"], "discount_scenario": "parallel_up", "indicator_scenario": "stress",
    }).json()
    assert stress["status"] == "succeeded", stress
    assert len(cashflow_cli) == 2
    assert cashflow_cli[1]["arguments"]["--scenario"] == "stress"
    result = stress["result"]
    assert result["cfgen_invoked"] is True
    assert result["cashflows_reused"] is False
    assert len(result["waterfall"]) == 2
    assert sum(Decimal(item["contribution"]) for item in result["waterfall"]) == Decimal(result["delta_npv"])
    artifacts = {item["filename"]: item["id"] for item in result["artifacts"]}
    cashflow = client.get(f"/api/artifacts/{artifacts['cashflow.csv']}/download")
    assert cashflow.status_code == 200
    events = list(csv.DictReader(io.StringIO(cashflow.text)))
    assert {event["base_rate"] for event in events} == {"0.12"}
    assert {Decimal(event["amount"]) > 0 for event in events} == {True, False}
    assert client.get(f"/api/artifacts/{artifacts['errors.csv']}/download").status_code == 200
    missing = client.post("/api/analysis/market-scenario", json={
        "base_run_id": base["run_id"], "indicator_scenario": "missing",
    })
    assert missing.status_code == 409
    assert missing.json()["code"] == "FORECAST_SCENARIO_MISSING"


def test_queued_run_pins_history_and_supports_forecast_without_scenario(
    client: TestClient, cashflow_cli: list[dict], monkeypatch: pytest.MonkeyPatch,
) -> None:
    portfolio_id = _portfolio(client)
    history = _history(client)
    forecast = _forecast(client, b"indicator,date,rate\nCBKEY1M,2026-12-01,0.10\n").json()
    jobs: list[str] = []

    class LocalQueue:
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        def enqueue(self, function: object, run_id: str, **kwargs: object) -> None:
            jobs.append(run_id)

    monkeypatch.setattr(get_settings(), "task_mode", "rq")
    monkeypatch.setattr("app.calculations.Queue", LocalQueue)
    payload = {"forecast_id": forecast["id"], "idempotency_key": "same-request", "history_id": history["id"]}
    created = client.post(f"/api/portfolios/{portfolio_id}/calculate", json=payload).json()
    assert created["status"] == "queued"
    assert client.post(f"/api/portfolios/{portfolio_id}/calculate", json=payload).json()["run_id"] == created["run_id"]
    _history(client, HISTORY.replace(b"0.08", b"0.15"))
    assert jobs == [created["run_id"]]
    execute_calculation_job(jobs[0])
    execute_calculation_job(jobs[0])
    assert len(cashflow_cli) == 1
    assert cashflow_cli[0]["history"] == HISTORY
    assert "--scenario" not in cashflow_cli[0]["arguments"]
    assert client.get(f"/api/runs/{jobs[0]}").json()["result"]["valuation_status"] == "blocked"
    assert client.get(f"/api/runs/{jobs[0]}").json()["status"] == "partial"

    interrupted = client.post(f"/api/portfolios/{portfolio_id}/calculate", json={
        **payload, "idempotency_key": "interrupted-request",
    }).json()
    mark_interrupted_run(Mock(args=[interrupted["run_id"]], connection=Mock()), 123, 6, Mock())
    failed = client.get(f"/api/runs/{interrupted['run_id']}").json()
    assert failed["status"] == "failed"
    assert "Фоновая задача прервана" in failed["error_summary"]


def test_uncovered_payment_keeps_cashflows(client: TestClient, cashflow_cli: list[dict]) -> None:
    portfolio_id = _portfolio(client, fixed_share=100)
    curve = client.post("/api/curves/import", json={
        "source": "educational_reference", "trade_date": "2026-11-21",
        "points": [
            {"bucket_code": "3y", "tenor_years": "3", "rate_percent": "10"},
            {"bucket_code": "4y", "tenor_years": "4", "rate_percent": "10"},
        ],
    }).json()
    run = client.post(f"/api/portfolios/{portfolio_id}/calculate", json={"snapshot_id": curve["id"]}).json()
    assert run["status"] == "partial", run
    assert "npv" not in run["result"]
    assert "вне диапазона" in run["result"]["valuation_reason"]
    assert run["result"]["cashflow_event_count"] == 6


def test_partial_cashflow_never_produces_portfolio_npv(
    client: TestClient, quantum: list[httpx.Request], cashflow_cli: list[dict], monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_run = subprocess.run

    def run_partial(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        result = original_run(command, **kwargs)
        output_dir = Path(cashflow_cli[-1]["arguments"]["--out-dir"])
        path = output_dir / "cashflow.csv"
        rows = path.read_text(encoding="utf-8").splitlines()
        omitted = rows.pop().split(",")[0]
        path.write_text("\n".join(rows) + "\n", encoding="utf-8")
        (output_dir / "errors.csv").write_text(
            f"deal_id,severity,code,field,message\n{omitted},error,BAD_DEAL,date,Invalid deal\n", encoding="utf-8",
        )
        return result

    monkeypatch.setattr("app.integrations.cashflow.subprocess.run", run_partial)
    portfolio_id = _portfolio(client, fixed_share=100)
    curve = client.post("/api/curves/refresh").json()
    run = client.post(f"/api/portfolios/{portfolio_id}/calculate", json={"snapshot_id": curve["id"]}).json()
    assert run["status"] == "partial", run
    assert run["result"]["cashflow_event_count"] == 5
    assert run["result"]["issue_count"] == 1
    assert "npv" not in run["result"]


def test_automatic_discount_loads_market_curve_and_cashflows_only_is_explicit(
    client: TestClient, quantum: list[httpx.Request], cashflow_cli: list[dict],
) -> None:
    portfolio_id = _portfolio(client, fixed_share=100)
    client.post("/api/curves/import", json={
        "source": "educational_reference", "trade_date": "2026-11-21",
        "points": [
            {"bucket_code": "1m", "tenor_years": "0.083", "rate_percent": "1"},
            {"bucket_code": "3y", "tenor_years": "3", "rate_percent": "1"},
        ],
    }).raise_for_status()
    calculated = client.post(f"/api/portfolios/{portfolio_id}/calculate", json={"auto_curve": True}).json()
    assert calculated["status"] == "succeeded", calculated
    assert calculated["method_version"] == EFFECTIVE_ACT365
    assert calculated["inputs"]["curve_mode"] == "automatic"
    curve = client.get(f"/api/curves/{calculated['market_snapshot_id']}").json()
    assert curve["source"] == "quantum_live"
    partial = client.post(f"/api/portfolios/{portfolio_id}/calculate", json={}).json()
    assert partial["status"] == "partial"
    assert partial["inputs"]["curve_mode"] == "cashflows_only"
    assert partial["result"]["cashflow_status"] == "succeeded"
    assert partial["result"]["cashflow_event_count"] == 6


def test_discount_and_historical_readouts_use_saved_results(
    client: TestClient, quantum: list[httpx.Request], cashflow_cli: list[dict],
) -> None:
    snapshot_id = client.post("/api/curves/refresh").raise_for_status().json()["id"]
    first_id = _portfolio(client, fixed_share=100)
    last_id = _portfolio(client, fixed_share=100, valuation_date="2026-11-22")
    first, last = [
        client.post(f"/api/portfolios/{portfolio_id}/calculate", json={"snapshot_id": snapshot_id}).raise_for_status().json()
        for portfolio_id in (first_id, last_id)
    ]
    saved = client.get("/api/analysis/valuations").raise_for_status().json()
    assert [item["portfolio_id"] for item in saved] == [last_id, first_id]
    assert client.get(f"/api/analysis/valuations?portfolio_id={last_id}").json() == saved[:1]
    comparison = client.post("/api/analysis/historical", json={
        "first_run_id": first["run_id"], "last_run_id": last["run_id"],
    }).raise_for_status().json()
    assert comparison["first"]["date"] == "2026-11-21"
    assert comparison["last"]["date"] == "2026-11-22"
    assert Decimal(comparison["delta"]["npv"]) == Decimal(comparison["delta"]["pv"]) - Decimal(comparison["delta"]["balance"])
    assert client.post("/api/analysis/historical", json={
        "first_run_id": last["run_id"], "last_run_id": first["run_id"],
    }).json()["code"] == "HISTORICAL_DATE_ORDER"
    deals = client.get(f"/api/portfolios/{last_id}/deals?kind=deposit&search=SYNTHETIC_DEPOSIT&validation_status=valid").raise_for_status().json()
    assert deals["total"] > 0
    deal_id = deals["items"][0]["id"]
    detail = client.get(f"/api/runs/{last['run_id']}/discount", params={
        "scenario": "parallel_up", "deal_id": deal_id,
    }).raise_for_status().json()
    assert detail["total"] == 1
    payment = detail["items"][0]
    assert Decimal(payment["before"]["df"]) > Decimal(payment["after"]["df"])
    assert Decimal(payment["amount"]) < 0
    assert len(cashflow_cli) == 2


def test_diagnostics_execute_real_calculation_steps(
    client: TestClient, quantum: list[httpx.Request], cashflow_cli: list[dict],
) -> None:
    checked = client.post("/api/integrations/smoke-test?check=deals").raise_for_status().json()
    assert checked["status"] == "succeeded"
    assert len(checked["steps"]) == 1
    assert not cashflow_cli
    full = client.post("/api/integrations/smoke-test?check=full").raise_for_status().json()
    assert full["status"] == "succeeded", full
    assert [step["status"] for step in full["steps"]] == ["passed"] * 4
    assert len(cashflow_cli) == 1
    assert any(event["code"] == "INTEGRATION_CHECK" for event in client.get("/api/audit-events").json())
