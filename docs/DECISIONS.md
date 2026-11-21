# Решения и открытые вопросы

1. Внешние репозитории не вендорятся и не изменяются. `cfgen` собирается из pinned SHA в Docker multi-stage; QuantumTeam подключается по URL.
2. Для тестов backend использует SQLite и inline mode; production Compose — PostgreSQL + Redis/RQ.
3. Исходные объекты immutable. Любой новый расчёт имеет отдельный `CalculationRun` и артефакты.
4. Генератор создаёт только совместимые комбинации: SIMPLE с явным погашением в конце; FLOAT только CBKEY1M. Субсидии по умолчанию выключены.
5. Случайные ставки не являются market data. Импорт `educational_reference` остаётся явно учебным.
6. QuantumTeam `rate` трактуется как annual percent. Continuous-zero применение — версия нашей методики и должно быть подтверждено экспертом.
7. Исторический экран реализован как полный blocked-state, потому что два фактических снимка не переданы.

Открытые вопросы: экономический знак/включение `sub` в итоговую стоимость, официальная discount convention QuantumTeam, time/composition attribution исторического анализа, точная старая Excel CF/DF-фикстура.
