import csv
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal

from sqlalchemy.orm import Session

from app.domain.generator import generate_deals, validate_deal_rows
from app.domain.valuation import DiscountPoint, EFFECTIVE_ACT365, calculate_npv
from app.integrations.cashflow import CashflowEngineAdapter
from app.integrations.curves import QuantumCurvesAdapter
from app.market_data import csv_date, parse_quantum_export
from app.schemas import GeneratorRequest
from app.services import log_event


DiagnosticCheck = Literal["deals", "cashflows", "curves", "full"]


def _check_curve() -> tuple[date | None, list[DiscountPoint], str]:
    adapter = QuantumCurvesAdapter()
    latest = adapter.get_latest_snapshot()
    if not latest.ok or not isinstance(latest.data, dict):
        return None, [], "Снимок QuantumTeam недоступен. Постройте кривую MOEX в разделе «Кривые ставок»."
    try:
        trade_date = csv_date(latest.data["trade_date"])
        exported = adapter.get_term_export(int(latest.data["id"]))
        if not exported.ok or not isinstance(exported.data, str):
            return None, [], "В снимке QuantumTeam нет срочной кривой."
        points = parse_quantum_export(exported.data, trade_date)["base"]
    except (KeyError, ValueError, TypeError, InvalidOperation, csv.Error) as exc:
        return None, [], f"Некорректная кривая QuantumTeam: {exc}"
    return trade_date, points, f"{trade_date.isoformat()}, {len(points)} точек"


def run_integration_checks(db: Session, check: DiagnosticCheck) -> dict:
    """Проверить реальные контракты на одной фиксированной сделке."""
    def step(name: str, passed: bool, reason: str) -> None:
        steps.append({"name": name, "status": "passed" if passed else "blocked", "reason": reason})

    steps: list[dict] = []
    trade_date, points = None, []
    if check in {"curves", "full"}:
        trade_date, points, detail = _check_curve()
        step("Срочная кривая QuantumTeam", bool(points), detail)
    if check != "curves":
        valuation_date = trade_date or date.today()
        config = GeneratorRequest(
            name="Диагностика", portfolio_type="credit", count=1, fixed_share=100, valuation_date=valuation_date,
        )
        deals, _ = generate_deals(config)
        issues = validate_deal_rows(deals)
        step("Контракт сделок", not issues, "Одна фиксированная сделка прошла проверку" if not issues else issues[0]["message"])
        if check != "deals":
            with TemporaryDirectory(prefix="npv-smoke-") as folder:
                cashflow = CashflowEngineAdapter().calculate(
                    deals, b"indicator,date,rate\n", "smoke", report_date=valuation_date, artifacts_dir=Path(folder),
                )
            ready = cashflow.status == "succeeded"
            detail = f"{len(cashflow.events)} событий" if ready else next(
                (issue["message"] for issue in cashflow.issues if issue["severity"] == "error"), "Движок не вернул потоков",
            )
            step("Расчёт cfgen", ready, detail)
            if check == "full":
                if ready and points:
                    events = [
                        {"deal_id": item["deal_id"], "payment_date": item["payment_dttm"], "amount": item["amount"]}
                        for item in cashflow.events
                    ]
                    balances = {deal["deal_id"]: Decimal(deal["current_principal_amt"]) for deal in deals}
                    try:
                        result = calculate_npv(events, balances, valuation_date, points, method=EFFECTIVE_ACT365)
                        step("Дисконтирование и NPV", True, f"Оценено {result['event_count']} событий")
                    except ValueError as exc:
                        step("Дисконтирование и NPV", False, str(exc))
                else:
                    step("Дисконтирование и NPV", False, "Нужны полные потоки и готовая срочная кривая")
    status = "succeeded" if all(item["status"] == "passed" for item in steps) else "partial"
    log_event(db, "integrations", "INTEGRATION_CHECK", f"Проверка интеграции: {status}", details={"steps": steps})
    db.commit()
    return {"status": status, "steps": steps}
