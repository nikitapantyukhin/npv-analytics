# Архитектура

## Компоненты

- React + TypeScript + Vite: маршруты, формы, таблицы, SVG-графики и все 15 UI-состояний.
- FastAPI + Pydantic: типизированный REST API и единая серверная валидация.
- SQLAlchemy + Alembic + PostgreSQL: immutable-версии портфелей, сделок, снимков, запусков, потоков и журналов.
- Redis + RQ: генерация и финансовые расчёты в Compose; `TASK_MODE=inline` используется только для локальных unit/API-тестов.
- `CashflowEngineAdapter`: безопасный `subprocess` без shell, отдельный каталог запуска, timeout, сырые `cashflow.csv`/`errors.csv`.
- `QuantumCurvesAdapter`: только реально существующие маршруты текущей ревизии QuantumTeam.
- Decimal valuation: ACT/365, явная continuous-zero конвенция, интерполяция без скрытой экстраполяции.

## Поток данных

`Generator/import → PortfolioVersion → RQ run → cfgen → CashflowEvent → MarketDataSnapshot → Discounted valuation → Scenario waterfall`.

Каждая генерация и расчёт создают новую запись. Сценарий ссылается на конкретные версии; старые результаты не перезаписываются. Внешние артефакты сохраняются в изолированном каталоге `artifacts/<run_id>` и не раздаются по произвольным путям.

## API

Реализованы health/capabilities, генерация и импорт, список/детали портфелей и сделок, server-side фильтры/пагинация, экспорт CSV, расчёт, статусы/результаты запусков, кривые/import/refresh, сценарный анализ, честный historical blocker, integration status/smoke test, issues/audit и защищённая выдача артефактов.

## Безопасность и границы

- Аргументы `cfgen` передаются массивом; `shell=True` не используется.
- Файлы ограничены по размеру и проверяются в UTF-8/CSV.
- Сортировки и фильтры ограничены whitelist.
- В браузер не передаются секреты или абсолютные серверные пути.
- Большие реестры читаются постранично; генерация допускает до 100 000 сделок и выполняется worker'ом.
