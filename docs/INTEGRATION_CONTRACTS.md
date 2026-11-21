# Подтверждённые интеграционные контракты

Дата аудита: 21.11.2026. Чужие репозитории клонировались во временный каталог только для чтения и не изменялись.

## nosnitches-cashflow

- Репозиторий: `delusssion/nosnitches-cashflow`.
- Commit: `81690108afbe00b890a7f92f1e13fb125c603078` от 20.11.2026 17:53:52 +03:00.
- Toolchain репозитория: Rust stable; CLI workspace `engine`, пакет `cfgen`.
- Вход: UTF-8 CSV, 48 колонок в контракте плюс необязательная `prepayment_schedule`/`prepayment`; ставки в долях; кредитный остаток положительный, депозитный отрицательный.
- Поддержаны `ANN/RGM/SIMPLE`, `FIXED/FLOAT`, индикатор `CBKEY1M`, досрочки, субсидийные события по подтверждённым полям.
- Запуск: `cfgen run --deals ... --rates ... --out-dir ...`; дополнительно проверены `--summary`, `--curves`, `--scenario`, `--shift-bp` в исходном CLI.
- Выход `cashflow.csv`: `report_dttm,deal_id,event_order,payment_dttm,payment_type,stream,amount,principal_before,principal_after,rate,base_rate,accrual_start_dttm,accrual_end_dttm,accrual_days,year_frac,discriminator`.
- Ошибки: `deal_id,severity,code,field,message`; `error` исключает сделку, `warning` сохраняет расчёт.
- NPV в этот проект не входит; его считает NPV Analytics.

`CashflowEngineAdapter` сохраняет знаки, порядок событий и исходные ошибки. Полный `succeeded` возможен только если рассчитано ожидаемое множество сделок; иначе `partial/failed`.

Фактический аудит: 53 теста репозитория прошли (42 unit, 3 golden, 7 integration, 1 doctest). Официальный набор: прочитано 55, рассчитано 54, одна сделка с error, 7 warnings, 4435 событий; 13 golden-файлов совпали при допуске 0,01 ₽. SHA-256 собранного временного бинарника: `17ed60f2b9145df45bef2c199b14a94f78068adc60771e1fe5d89fda9d11f510` (checksum зависит от toolchain/build environment и фиксируется для каждого production build).

## QuantumTeam

- Репозиторий: `miniMlena/QuantumTeam`.
- Commit: `4823c82e8e71bcad1d7e5699ec35ff03f596fb11` от 31.10.2026 01:43:40 +03:00.
- Сервис: FastAPI 0.1.0, PostgreSQL, Redis/RQ; по умолчанию его Compose конфликтует по стандартным портам, поэтому он не вложен в наш Compose.
- Реальные маршруты: `GET /health`, `POST /api/v1/curves/calculate`, `GET /api/v1/curves/latest`, `GET /api/v1/curves/{id}/base`, `GET /api/v1/curves/{id}/scenarios/{scenario_id}`, `POST /api/v1/curves/{id}/rebuild`, `GET/POST /api/v1/scenarios`, portfolio/results routes.
- Базовая кривая строится из параметров G-кривой MOEX. Поле `rate` — годовая ставка в процентах, вычисленная как `exp(G/10000)-1`, а не DF.
- 19 бакетов Basel; шесть сценариев: parallel up/down, short up/down, steepener, flattener. В текущем исходнике RUB shocks равны 400/500/300 б.п. по соответствующим формулам.
- Пользовательский сценарий создаётся реальным `POST /api/v1/scenarios`; rebuild возвращает только `task_id/status=queued`, отдельного job-status route нет.

NPV Analytics нормализует проценты в decimal и хранит сырой ответ, внешний ID, hash, SHA и даты. Применение этих ставок как continuous zero rate является нашим явным предварительным допущением, а не подтверждённой методикой QuantumTeam.

Фактический аудит: все 40 тестов QuantumTeam прошли, включая API, MOEX fixture, Excel reference, шесть Basel-сценариев, NPV/NII и противоположный знак пассива. Live smoke на PostgreSQL: `/health` — ok; `POST /api/v1/curves/calculate` — 200, snapshot `id=1`, trade date 20.11.2026, status `built`; получены 19 базовых точек и 6 сценариев. Неизменённый ответ сохранён в `backend/fixtures/quantum_snapshot_2026-11-20.json` как `quantum_cached`.
