from datetime import date


def payload(count: int = 10):
    return {"name": "API портфель", "portfolio_type": "mixed", "count": count, "valuation_date": str(date(2026, 11, 21)), "seed": 42, "credit_share": 70}


def test_health_and_capabilities(client):
    assert client.get("/api/health").status_code == 200
    response = client.get("/api/capabilities")
    assert response.status_code == 200
    assert any(item["code"] == "generator" and item["status"] == "Работает" for item in response.json()["capabilities"])


def test_generate_registry_and_deal_detail(client):
    generated = client.post("/api/portfolios/generate", json=payload()).json()
    assert generated["status"] == "succeeded"
    portfolio_id = generated["result"]["portfolio_id"]
    portfolios = client.get("/api/portfolios").json()
    assert portfolios[0]["version"]["deal_count"] == 10
    registry = client.get(f"/api/portfolios/{portfolio_id}/deals", params={"page_size": 5}).json()
    assert registry["total"] == 10
    detail = client.get(f"/api/deals/{registry['items'][0]['id']}")
    assert detail.status_code == 200
    assert detail.json()["portfolio_id"] == portfolio_id


def test_curve_import_is_unit_explicit(client):
    response = client.post("/api/curves/import", json={"source": "educational_reference", "trade_date": "2026-11-21", "convention": "continuous_zero_rate_ACT365", "points": [{"bucket_code": "3m", "tenor_years": "0.25", "rate_percent": "10"}, {"bucket_code": "30y", "tenor_years": "30", "rate_percent": "12"}]})
    assert response.status_code == 201
    curve = client.get(f"/api/curves/{response.json()['id']}").json()
    assert curve["source"] == "educational_reference"
    assert curve["points"][0]["rate_decimal"] == "0.100000000000"


def test_historical_analysis_is_honestly_blocked(client):
    response = client.post("/api/analysis/historical", json={})
    assert response.status_code == 409
    assert response.json()["code"] == "HISTORICAL_SNAPSHOTS_MISSING"
