from datetime import date
from decimal import Decimal, localcontext

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations import completed_valuation
from app.core.errors import DomainError
from app.domain.valuation import EFFECTIVE_ACT365, ValuedEvent, value_events
from app.market_data import QUANTUM_TERM_CURVE, discount_points
from app.models import CalculationRun, CashflowEvent, Deal, MarketDataSnapshot, Portfolio, PortfolioVersion


def list_valuations(db: Session, portfolio_id: str | None = None) -> list[dict]:
    statement = (
        select(CalculationRun, Portfolio)
        .join(PortfolioVersion, PortfolioVersion.id == CalculationRun.portfolio_version_id)
        .join(Portfolio, Portfolio.id == PortfolioVersion.portfolio_id)
        .where(CalculationRun.run_type == "valuation", CalculationRun.status == "succeeded")
        .order_by(CalculationRun.valuation_date.desc(), CalculationRun.created_at.desc())
        .limit(200)
    )
    if portfolio_id:
        statement = statement.where(Portfolio.id == portfolio_id)
    return [
        {
            "run_id": run.id, "portfolio_id": portfolio.id, "portfolio_name": portfolio.name,
            "valuation_date": run.valuation_date, "snapshot_id": run.market_snapshot_id,
            "method_version": run.method_version, **_summary(run),
        }
        for run, portfolio in db.execute(statement)
        if run.market_snapshot_id and run.valuation_date and {"pv", "npv", "balance"} <= (run.result or {}).keys()
    ]


def _summary(run: CalculationRun) -> dict:
    result = run.result or {}
    return {key: result[key] for key in ("pv", "npv", "balance")}


def historical_comparison(db: Session, first_run_id: str, last_run_id: str) -> dict:
    first, last = completed_valuation(db, first_run_id), completed_valuation(db, last_run_id)
    if first.valuation_date >= last.valuation_date:
        raise DomainError("HISTORICAL_DATE_ORDER", "Дата первого расчёта должна быть раньше даты второго", status_code=409)
    before, after = _summary(first), _summary(last)
    with localcontext() as context:
        context.prec = 34
        changes = {key: Decimal(after[key]) - Decimal(before[key]) for key in before}
    return {
        "first": {"run_id": first.id, "date": first.valuation_date, **before},
        "last": {"run_id": last.id, "date": last.valuation_date, **after},
        "delta": {key: str(value) for key, value in changes.items()},
    }


def _event_columns(event: ValuedEvent) -> dict:
    return {
        "rate": str(event.rate_decimal), "df": str(event.discount_factor),
        "pv": str(event.present_value),
    }


def discount_breakdown(
    db: Session,
    run_id: str,
    alternative_id: str | None,
    scenario: str,
    deal_id: str | None,
    page: int,
) -> dict:
    """Переоценить сохранённые события и вернуть одну страницу детализации."""
    run = completed_valuation(db, run_id)
    valuation_date: date = run.valuation_date
    base = db.get(MarketDataSnapshot, run.market_snapshot_id)
    alternative = db.get(MarketDataSnapshot, alternative_id) if alternative_id else base
    if base is None or alternative is None:
        raise DomainError("SNAPSHOT_NOT_FOUND", "Снимок кривой не найден", status_code=404)
    if alternative.trade_date > valuation_date:
        raise DomainError("CURVE_AFTER_VALUATION_DATE", "Дата выбранной кривой позже даты оценки", status_code=409)
    query = select(CashflowEvent).where(CashflowEvent.run_id == run.id).order_by(
        CashflowEvent.payment_date, CashflowEvent.business_deal_id, CashflowEvent.event_order,
    )
    if deal_id:
        deal = db.get(Deal, deal_id)
        if deal is None or deal.portfolio_version_id != run.portfolio_version_id:
            raise DomainError("DEAL_NOT_IN_RUN", "Сделка не входит в этот расчёт", status_code=404)
        query = query.where(CashflowEvent.deal_id == deal_id)
        balance = deal.principal
    else:
        balance = Decimal(_summary(run)["balance"])
    rows = list(db.scalars(query.where(CashflowEvent.amount != 0)))
    events = [
        {"deal_id": row.business_deal_id, "payment_date": row.payment_date, "amount": row.raw_fields["amount"]}
        for row in rows
    ]
    alternative_method = EFFECTIVE_ACT365 if alternative.curve_type == QUANTUM_TERM_CURVE else (
        run.method_version if alternative.id == base.id else None
    )
    with localcontext() as context:
        context.prec = 34
        try:
            before, pv_before = value_events(events, valuation_date, discount_points(base), method=run.method_version)
            if alternative.id == base.id and scenario == "base":
                after, pv_after = before, pv_before
            else:
                after, pv_after = value_events(
                    events, valuation_date, discount_points(alternative, scenario), method=alternative_method,
                )
        except ValueError as exc:
            raise DomainError("VALUATION_COVERAGE", str(exc), status_code=409) from exc
        summary = {"pv_before": str(pv_before), "pv_after": str(pv_after),
                   "npv_before": str(pv_before - balance), "npv_after": str(pv_after - balance),
                   "delta": str(pv_after - pv_before)}
    page_size = 25
    interval = slice((page - 1) * page_size, page * page_size)
    items = [
        {
            "deal_id": original.deal_id, "date": original.payment_date, "amount": str(original.amount),
            "event_order": row.event_order, "payment_type": row.payment_type, "before": _event_columns(original),
            "after": _event_columns(stressed),
        }
        for row, original, stressed in zip(rows[interval], before[interval], after[interval], strict=True)
    ]
    return {**summary, "valuation_date": valuation_date, "total": len(rows), "pages": (len(rows) + page_size - 1) // page_size, "items": items}
