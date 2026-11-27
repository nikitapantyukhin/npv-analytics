from __future__ import annotations

import csv
import hashlib
import io
import math
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import DomainError
from app.domain.valuation import DiscountPoint, EFFECTIVE_ACT365
from app.integrations.curves import QuantumCurvesAdapter, QuantumResponse
from app.models import CurvePoint, IndicatorDataset, MarketDataSnapshot


MAX_INDICATOR_CSV_BYTES = 10 * 1024 * 1024
QUANTUM_TERM_CURVE = "quantum_term"


def csv_date(value: str) -> date:
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError("Нужна дата в формате YYYY-MM-DD")
    return parsed


def import_indicator_dataset(
    db: Session,
    content: bytes,
    *,
    kind: str,
    filename: str,
    source: str,
    valuation_date: date | None = None,
) -> IndicatorDataset:
    """Проверить и сохранить неизменяемую версию CSV индикатора."""
    if len(content) > MAX_INDICATOR_CSV_BYTES:
        raise DomainError("FILE_TOO_LARGE", "Максимальный размер CSV - 10 МБ", status_code=413)
    if not source.strip():
        raise DomainError("KEY_RATE_SOURCE_REQUIRED", "Укажите источник ставок")
    dates: set[tuple[str, date]] = set()
    forecast = kind == "forecast"
    try:
        raw_text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(raw_text), strict=True)
        headers = reader.fieldnames or []
        required = {"indicator", "date", "rate"}
        missing = required.difference(headers)
        if missing:
            raise ValueError(f"Отсутствуют колонки {', '.join(sorted(missing))}")
        allowed = required | {"scenario"} if forecast else required
        if len(headers) != len(set(headers)) or set(headers) - allowed:
            raise ValueError("Заголовок содержит лишние или повторяющиеся колонки")
        for row in reader:
            try:
                if None in row or None in row.values():
                    raise ValueError("Число значений не совпадает с заголовком")
                if row["indicator"] != "CBKEY1M":
                    raise ValueError(f"Неподдерживаемый индикатор {row['indicator']}")
                scenario = row.get("scenario", "base")
                if not scenario or len(scenario) > 80 or scenario.strip() != scenario:
                    raise ValueError("Некорректный код сценария")
                day = csv_date(row["date"])
                if forecast and (valuation_date is None or day <= valuation_date):
                    raise ValueError("Дата прогноза должна быть позже даты оценки")
                rate = row["rate"].strip()
                if not re.fullmatch(r"[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", rate) or not math.isfinite(float(rate)):
                    raise ValueError("Ставка должна быть конечным числом в долях")
                if (scenario, day) in dates:
                    raise ValueError(f"Повтор даты {day} в сценарии {scenario}")
                dates.add((scenario, day))
            except ValueError as exc:
                raise ValueError(f"Строка {reader.line_num}: {exc}") from exc
        if not dates:
            raise ValueError("В CSV нет строк со ставками")
    except (UnicodeDecodeError, csv.Error, ValueError) as exc:
        raise DomainError("KEY_RATE_VALIDATION_FAILED", f"CSV ключевой ставки: {exc}") from exc
    dataset = IndicatorDataset(
        kind=kind,
        filename=filename[:255],
        source=source.strip(),
        valuation_date=valuation_date,
        first_date=min(day for _, day in dates),
        last_date=max(day for _, day in dates),
        scenarios=sorted({scenario for scenario, _ in dates}) if forecast else [],
        row_count=len(dates),
        sha256=hashlib.sha256(content).hexdigest(),
        content=content,
    )
    db.add(dataset)
    db.flush()
    return dataset


def dataset_payload(dataset: IndicatorDataset) -> dict:
    return {
        "id": dataset.id, "filename": dataset.filename, "source": dataset.source,
        "valuation_date": dataset.valuation_date, "first_date": dataset.first_date,
        "last_date": dataset.last_date, "scenarios": dataset.scenarios, "rows": dataset.row_count,
        "sha256": dataset.sha256, "indicator": "CBKEY1M", "status": "validated",
    }


def snapshot_scenarios(snapshot: MarketDataSnapshot) -> list[str]:
    return [snapshot.scenario, *sorted(snapshot.raw_response.get("scenarios", {}))]


def discount_points(snapshot: MarketDataSnapshot, scenario: str = "base") -> list[DiscountPoint]:
    if scenario == snapshot.scenario:
        return [DiscountPoint(point.tenor_years, point.rate_decimal) for point in snapshot.points]
    rows = snapshot.raw_response.get("scenarios", {}).get(scenario)
    if rows is None:
        raise DomainError(
            "QUANTUM_SCENARIO_NOT_FOUND", f"Снимок кривой не содержит сценарий {scenario}", status_code=409,
        )
    return [DiscountPoint(Decimal(row["tenor_years"]), Decimal(row["rate_decimal"])) for row in rows]


def parse_quantum_export(content: str, trade_date: date) -> dict[str, list[DiscountPoint]]:
    reader = csv.DictReader(io.StringIO(content), strict=True)
    if reader.fieldnames != ["trade_date", "scenario", "tenor_years", "rate"]:
        raise ValueError("Нужны колонки trade_date,scenario,tenor_years,rate")
    scenarios: dict[str, dict[Decimal, Decimal]] = {}
    for row in reader:
        if None in row or None in row.values() or csv_date(row["trade_date"]) != trade_date:
            raise ValueError(f"Строка {reader.line_num}: некорректные данные торговой даты или CSV")
        scenario = row["scenario"]
        if not scenario or len(scenario) > 80 or scenario.strip() != scenario:
            raise ValueError(f"Строка {reader.line_num}: некорректный код сценария")
        tenor, rate = Decimal(row["tenor_years"]), Decimal(row["rate"])
        if not tenor.is_finite() or not 0 < tenor <= 30 or not rate.is_finite() or rate <= -1:
            raise ValueError(f"Строка {reader.line_num}: некорректная ставка или срок")
        points = scenarios.setdefault(scenario, {})
        if tenor in points:
            raise ValueError(f"Повтор срока {tenor} в сценарии {scenario}")
        points[tenor] = rate
    base = scenarios.get("base", {})
    if len(base) < 2 or any(points.keys() != base.keys() for points in scenarios.values()):
        raise ValueError("Нужны базовая кривая и одинаковые сроки у всех сохранённых сценариев")
    return {
        scenario: [DiscountPoint(tenor, rate) for tenor, rate in sorted(points.items())]
        for scenario, points in scenarios.items()
    }


def import_quantum_snapshot(
    db: Session, adapter: QuantumCurvesAdapter, response: QuantumResponse,
) -> MarketDataSnapshot:
    """Импортировать базу и сценарии одного готового снимка Quantum."""
    if not response.ok or not isinstance(response.data, dict):
        raise DomainError(
            "QUANTUM_SNAPSHOT_UNAVAILABLE", "QuantumTeam не вернул готовый снимок",
            status_code=502, details={"error": response.error}, retryable=True,
        )
    metadata = response.data
    try:
        external_id = int(metadata["id"])
        trade_date = csv_date(str(metadata["trade_date"]))
        if external_id <= 0 or metadata.get("status") != "built":
            raise ValueError("Снимок должен иметь положительный ID и статус built")
    except (KeyError, TypeError, ValueError) as exc:
        raise DomainError("QUANTUM_SNAPSHOT_INVALID", f"Метаданные снимка QuantumTeam: {exc}", status_code=502) from exc
    exported = adapter.get_term_export(external_id)
    if not exported.ok or not isinstance(exported.data, str):
        raise DomainError(
            "QUANTUM_TERM_CURVE_UNAVAILABLE", "Срочная кривая недоступна. Постройте новый снимок QuantumTeam",
            status_code=502, details={"error": exported.error}, retryable=True,
        )
    try:
        scenarios = parse_quantum_export(exported.data, trade_date)
    except (ValueError, InvalidOperation, csv.Error) as exc:
        raise DomainError("QUANTUM_CURVE_INVALID", f"Некорректный экспорт QuantumTeam: {exc}", status_code=502) from exc
    digest = hashlib.sha256(exported.data.encode("utf-8")).hexdigest()
    source_sha = get_settings().quantum_sha
    snapshot_id = str(uuid5(NAMESPACE_URL, f"quantum-term/{source_sha}/{external_id}/{digest}"))
    existing = db.get(MarketDataSnapshot, snapshot_id)
    if existing is not None:
        return existing
    base = scenarios.pop("base")
    snapshot = MarketDataSnapshot(
        id=snapshot_id, source="quantum_live", external_id=str(external_id), trade_date=trade_date,
        curve_type=QUANTUM_TERM_CURVE, convention=EFFECTIVE_ACT365, rate_unit_source="decimal",
        data_hash=digest, source_sha=source_sha,
        raw_response={
            "snapshot": metadata, "moex_csv": exported.data,
            "scenarios": {
                code: [{"tenor_years": str(point.tenor_years), "rate_decimal": str(point.rate_decimal)} for point in points]
                for code, points in scenarios.items()
            },
        },
        points=[
            CurvePoint(bucket_code=f"{point.tenor_years}y", tenor_years=point.tenor_years, rate_decimal=point.rate_decimal)
            for point in base
        ],
    )
    try:
        with db.begin_nested():
            db.add(snapshot)
            db.flush()
    except IntegrityError:
        existing = db.get(MarketDataSnapshot, snapshot_id)
        if existing is None:
            raise
        return existing
    return snapshot
