# Реестр функций

Статусы формируются также динамически через `GET /api/capabilities`; таблица фиксирует состояние реализации.

| Функция | Статус | Доказательство / ограничение |
|---|---|---|
| Шесть разделов и 15 состояний | Работает | 15/15 full-page Chromium screenshots просмотрены; 17/17 Playwright tests |
| Simple/advanced генератор, общее состояние | Работает | `test_generator_*`, frontend flow test |
| Кредиты/депозиты/mixed, seed, exact weights | Работает | largest-remainder и hash tests |
| 1/100/1000 сделок | Работает | pytest; лимит API 100 000 |
| CSV import/export и общий валидатор | Работает | API tests и server validator |
| Реестр, фильтры, пагинация, карточка | Работает | API tests + React UI |
| Реальный cfgen | Работает при наличии бинарника | 53 upstream-теста + 13 golden прошли; Compose собирает pinned SHA; capability проверяет файл, partial не маскируется |
| FLOAT | Работает при загруженном CBKEY1M | Без проверенного CSV расчёт блокируется `KEY_RATE_MISSING` |
| Досрочки | Доступно по контракту, UI расширения | Поле `prepayment_schedule`; генератор по умолчанию не выдумывает события |
| Субсидии | Ожидает подтверждения сценарных настроек | События движка поддержаны, массовая генерация полей не включена без методики |
| QuantumTeam live | Зависит от внешнего URL | 40 upstream-тестов прошли; health и реальные endpoints; offline не выдаётся за live |
| Immutable curve snapshots | Работает | import/refresh, hash/SHA/source/date |
| PV/NPV Decimal | Работает | signed formula, coverage и extrapolation tests |
| Discount-curve scenario | Работает | CF reused, DF/PV recomputed, waterfall tests |
| Contract-rate scenario | Ожидает фонового сценарного cfgen | API сообщает `FACTOR_REQUIRES_CFGEN`, фиктивный ΔNPV не создаёт |
| Исторический анализ | Ожидает данные/методику | Нужны два снимка состава, кривых, CF и time effect; HTTP 409 structured blocker |
| LLM-чат | Запланировано | Вне спринта 03 |
