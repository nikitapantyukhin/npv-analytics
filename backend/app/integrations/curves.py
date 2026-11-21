from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

import httpx

from app.core.config import get_settings


@dataclass
class QuantumResponse:
    ok: bool
    data: object | None = None
    error: str | None = None


class QuantumCurvesAdapter:
    def __init__(self, base_url: str | None = None, timeout: int | None = None):
        settings = get_settings()
        self.base_url = (base_url or settings.quantum_base_url).rstrip("/")
        self.timeout = timeout or settings.quantum_timeout_seconds

    def _request(self, method: str, path: str, **kwargs) -> QuantumResponse:
        try:
            response = httpx.request(method, f"{self.base_url}{path}", timeout=self.timeout, **kwargs)
            response.raise_for_status()
            return QuantumResponse(True, response.json())
        except (httpx.HTTPError, ValueError) as exc:
            return QuantumResponse(False, error=str(exc))

    def healthcheck(self) -> QuantumResponse:
        return self._request("GET", "/health")

    def list_scenarios(self) -> QuantumResponse:
        return self._request("GET", "/api/v1/scenarios")

    def get_latest_snapshot(self) -> QuantumResponse:
        return self._request("GET", "/api/v1/curves/latest")

    def get_base_curve(self, snapshot_id: int) -> QuantumResponse:
        return self._request("GET", f"/api/v1/curves/{snapshot_id}/base")

    def get_scenario_curve(self, snapshot_id: int, scenario_id: int) -> QuantumResponse:
        return self._request("GET", f"/api/v1/curves/{snapshot_id}/scenarios/{scenario_id}")

    def request_calculation(self, trade_date: str | None = None) -> QuantumResponse:
        params = {"trade_date": trade_date} if trade_date else None
        return self._request("POST", "/api/v1/curves/calculate", params=params)

    def request_rebuild(self, snapshot_id: int) -> QuantumResponse:
        return self._request("POST", f"/api/v1/curves/{snapshot_id}/rebuild")

    @staticmethod
    def normalize_points(points: list[dict]) -> list[dict]:
        normalized = []
        for point in points:
            rate_percent = Decimal(str(point.get("rate", point.get("shifted_rate"))))
            normalized.append({
                "bucket_code": str(point["bucket_code"]),
                "tenor_years": Decimal(str(point["tenor_years"])),
                "rate_decimal": rate_percent / Decimal(100),
                "shift_bp": Decimal(str(point["shift_bp"])) if point.get("shift_bp") is not None else None,
            })
        return normalized
