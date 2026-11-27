from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.config import get_settings


@dataclass
class QuantumResponse:
    ok: bool
    data: object | None = None
    error: str | None = None


class QuantumCurvesAdapter:
    def __init__(self, base_url: str | None = None, timeout: int | None = None) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.quantum_base_url).rstrip("/")
        self.timeout = timeout or settings.quantum_timeout_seconds

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        text: bool = False,
        timeout: int | None = None,
    ) -> QuantumResponse:
        try:
            response = httpx.request(
                method, f"{self.base_url}{path}", params=params, timeout=timeout or self.timeout,
            )
            response.raise_for_status()
            return QuantumResponse(True, response.content.decode("utf-8") if text else response.json())
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

    def get_term_export(self, snapshot_id: int) -> QuantumResponse:
        return self._request("GET", f"/api/v1/exports/curves/{snapshot_id}/moex.csv", text=True)

    def request_calculation(self, trade_date: str | None = None) -> QuantumResponse:
        params = {"trade_date": trade_date} if trade_date else None
        return self._request(
            "POST", "/api/v1/curves/calculate", params=params,
            timeout=get_settings().quantum_calculation_timeout_seconds,
        )

    def request_rebuild(self, snapshot_id: int) -> QuantumResponse:
        return self._request("POST", f"/api/v1/curves/{snapshot_id}/rebuild")
