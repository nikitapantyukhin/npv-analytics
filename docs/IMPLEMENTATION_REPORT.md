# Отчёт о реализации спринта 03

Дата проверки: 21.11.2026.

## Результат

Платформа реализована с нуля как единый проект React/FastAPI/PostgreSQL/Redis/RQ. Созданы все шесть окон и все 15 утверждённых экранных состояний. Числа макетов не используются как результаты: интерфейс читает портфели, запуски, денежные потоки, кривые, NPV, issues и audit events из backend.

## Реализованные функции

- Детерминированный генератор кредитов, депозитов и mixed-портфелей с seed, exact largest-remainder долями, ANN/RGM/SIMPLE и FIXED/FLOAT.
- Immutable Portfolio/PortfolioVersion/Deal, server-side фильтры, сортировки, пагинация, карточка сделки и CSV import/export через общий валидатор.
- Безопасный адаптер `cfgen`: subprocess без shell, timeout, уникальный каталог запуска, сохранение событий и структурированных errors/warnings, `partial` без маскировки пропусков.
- Immutable снимки кривых с source, trade/retrieval dates, convention, source SHA и data hash; live QuantumTeam refresh и импорт явно маркированного snapshot.
- Decimal NPV: signed cash flows, ACT/365, continuous zero rate, линейная интерполяция zero rate, запрет скрытой экстраполяции и проверка покрытия.
- Сценарий сдвига дисконтной кривой без повторного вызова `cfgen`; последовательный waterfall телескопируется в итоговую ΔNPV.
- PostgreSQL/Alembic, Redis/RQ worker, audit log, issues, capability/integration status, артефакты запуска и health API.
- Docker Compose для frontend/nginx, backend, worker, PostgreSQL и Redis. Backend/worker используют один production image с pinned `cfgen`.

## Внешние интеграции

### nosnitches-cashflow

Проверен commit `81690108afbe00b890a7f92f1e13fb125c603078`. Изменений во внешний репозиторий нет. Подтверждены 48 обязательных колонок плюс optional prepayment, знаки кредитов/депозитов, ANN/RGM/SIMPLE, FIXED/FLOAT, CBKEY1M, формат событий и ошибок.

Результаты аудита: 53 upstream tests passed; официальный набор — 55 входных сделок, 54 рассчитано, 1 error, 7 warnings, 4435 событий; 13 golden-файлов совпали с допуском 0,01 ₽. Production Docker image самостоятельно клонирует pinned SHA и выполняет `cargo build --locked --release -p cfgen`.

### QuantumTeam

Проверен commit `4823c82e8e71bcad1d7e5699ec35ff03f596fb11`. Изменений во внешний репозиторий нет. Используются только фактические REST endpoints текущей ревизии.

Результаты аудита: 40 upstream tests passed. Live smoke на PostgreSQL вернул health ok, snapshot `id=1`, trade date 20.11.2026, 19 базовых точек и 6 сценариев. Ответ сохранён как `backend/fixtures/quantum_snapshot_2026-11-20.json` и загружается с маркировкой `quantum_cached`; cached snapshot не выдаётся за live.

## Проверки проекта

- Backend: 11 passed, 2 skipped без внешних путей; оба skip — opt-in интеграционные проверки.
- Реальный `cfgen`: 2/2 integration tests passed, включая generator → `cfgen` → curve → Decimal NPV → +100 bp → waterfall.
- Frontend unit: 2/2 passed.
- Playwright Chromium: 17/17 passed — 15 full-page screenshots и 2 navigation/form flows.
- Alembic: initial migration успешно применена к чистой SQLite DB; production smoke применил её к чистой PostgreSQL DB.
- `python -m compileall`, TypeScript build, Vite production build и `docker compose config` прошли.
- npm audit: 0 production и 0 dev vulnerabilities после обновления Vite/Vitest/Playwright toolchain.
- Production images `npv-analytics-backend:latest` и `npv-analytics-frontend:latest` собраны; backend image содержит release `cfgen`.
- Full Compose smoke: Postgres/Redis/backend healthy, RQ worker слушает `npv`, nginx отдаёт UI и proxy API. Через nginx/RQ создано 10 FIXED-кредитов, `cfgen` вернул 531 событие, NPV = −551178.59888267762599821211759870 ₽; сценарий +100 bp дал NPV = −825813.90122704681442094672196843 ₽ и ΔNPV = −274635.30234436918842273460436973 ₽. Waterfall contribution в точности равен ΔNPV.

## Визуальное соответствие

Все 15 full-page снимков 1600×1000+ сохранены в `artifacts/screenshots/` и вручную сопоставлены с `.local/designs/screens/`. Перенесены исходные design tokens, sidebar 257 px, topbar 68 px, сетки, карточки, вкладки, формы, таблицы, графики, палитра и типографическая иерархия. Динамические UUID, даты и финансовые значения закономерно отличаются от иллюстративных данных PNG.

При визуальном QA найден и исправлен один дефект: Decimal NPV на экране дисконтирования теперь форматируется как RUB с двумя знаками. `.local/designs/` не изменялась.

## Честные ограничения

- QuantumTeam не включён во внутренний Compose, чтобы не менять и не дублировать чужой проект. Подключение выполняется к существующему сервису через `QUANTUM_BASE_URL`; при недоступности UI/API показывает structured status. Для офлайн-демо есть отдельно маркированный verified cached snapshot.
- Применение QuantumTeam `annual_rate_pct` как continuous zero rate — явно версионированное допущение NPV Analytics, не приписываемая внешней команде методика.
- Contract-rate factor требует повторного сценарного запуска `cfgen` и пока отвечает `FACTOR_REQUIRES_CFGEN`; фиктивная ΔNPV не создаётся.
- Исторический факторный анализ требует два полных снимка состава, CF и кривых плюс согласованную time/composition attribution. До получения этих данных endpoint возвращает HTTP 409 с перечнем недостающих входов.
- FLOAT расчёт блокируется без проверенного ряда CBKEY1M. Субсидии и массовые досрочки не синтезируются без подтверждённой методики, хотя поля/контракт внешнего движка сохранены.
- LLM-чат явно помечен как функция вне спринта 03.

## Основные документы

- `README.md` — запуск и рабочий путь.
- `docs/ARCHITECTURE.md` — компоненты и границы.
- `docs/INTEGRATION_CONTRACTS.md` — фактические контракты и SHA внешних проектов.
- `docs/FINANCIAL_METHODOLOGY.md` — формулы и допущения.
- `docs/FEATURE_STATUS.md` — матрица доступности.
- `docs/VISUAL_QA.md` — проверка 15 макетов.
- `docs/DEMO.md` — сценарий демонстрации.
