# NPV Analytics — спринт 03

Рабочая банковская аналитическая платформа для генерации кредитных и депозитных портфелей, расчёта денежных потоков через `nosnitches-cashflow`, загрузки кривых QuantumTeam, PV/NPV и сценарного факторного анализа.

Интерфейс реализует все шесть разделов и 15 утверждённых состояний из `.local/designs/`. Иллюстративные числа макетов не используются как финансовые результаты: KPI читаются из backend, а отсутствующие источники показаны честными статусами.

## Быстрый запуск

Требования: Docker Desktop/Engine с Compose v2; для Windows 11 рекомендуется WSL2 Ubuntu 24.04. Для локальной frontend-разработки нужен Node.js 22.12+. Для первого запуска нужна сеть для сборки образов. Настройки по умолчанию подходят для локального запуска. При обновлении старой установки замените прежний `QUANTUM_BASE_URL` в `.env` на `http://quantum:8000`.

```bash
docker compose up --build -d
docker compose ps
curl http://localhost:8000/api/health
```

Откройте `http://localhost:3000`. OpenAPI доступен на `http://localhost:8000/docs`.

Compose запускает frontend, backend, RQ worker, Redis и QuantumTeam с отдельной PostgreSQL-базой. Backend и worker используют один образ с собранным `cfgen` и обращаются к Quantum по внутреннему HTTP-адресу. Ревизии обоих компонентов зафиксированы в Compose. Для отдельного Quantum можно задать `QUANTUM_BASE_URL` и `QUANTUM_SHA`.

```bash
# логи
docker compose logs -f backend worker frontend

# остановка без удаления данных
docker compose down

```

## Локальная разработка

```bash
python3 -m venv .venv
.venv/bin/pip install -e 'backend[test]'
(cd backend && DATABASE_URL=sqlite:///../npv_analytics.sqlite3 ../.venv/bin/alembic upgrade head)
DATABASE_URL=sqlite:///./npv_analytics.sqlite3 .venv/bin/uvicorn app.main:app --app-dir backend --reload --port 8000

cd frontend
npm install
npm run dev
```

## Проверки

```bash
.venv/bin/pytest backend/tests
(cd frontend && npm run test && npm run build && npx playwright test)
docker compose config
```

Интеграционный тест `cfgen` запускается, если заданы `NOSNITCHES_REPO` и `CFGEN_BIN`:

```bash
NOSNITCHES_REPO=/path/to/nosnitches-cashflow \
CFGEN_BIN=/path/to/cfgen \
ARTIFACTS_DIR=/tmp/npv-test-artifacts \
.venv/bin/pytest backend/tests/test_cfgen_integration.py -v
```

Сквозная проверка в браузере запускается на отдельном стенде с QuantumTeam и `cfgen`. Укажите доступную торговую дату MOEX. Тест создаёт проверочные портфели и наборы ставок.

```bash
cd frontend
NPV_INTEGRATION_DATE=YYYY-MM-DD npx playwright test e2e/market-integration.spec.ts
```

## Рабочий путь

1. В «Кривых ставок» нажмите «Построить кривую MOEX». Для расчёта на прошлую дату укажите торговый день. Если Quantum уже построил снимок, выберите «Импортировать готовый». На вкладке «Сценарии» доступны кривые, сохранённые для выбранного снимка.
2. Создайте или импортируйте портфель с общей датой оценки. Снимок кривой может относиться к этой или более ранней дате.
3. Для FLOAT загрузите проверенную историю CBKEY1M в «Данные и интеграции → Источники данных». При наличии утверждённого прогноза загрузите его с источником и датой оценки портфеля. История использует заголовок `indicator,date,rate`, прогноз добавляет `scenario`. Ставки указываются в долях, например `0.10` для 10%. Прогноз должен содержать `base`, а даты его точек должны быть позже даты оценки. Без колонки `scenario` весь CSV считается базовым. До первой будущей точки `cfgen` использует последнее известное значение на дату оценки, затем применяет файл как ступенчатый ряд.
4. Нажмите «Рассчитать портфель». По умолчанию приложение подбирает проверенную кривую на дату оценки или раньше. Можно выбрать конкретный снимок, версии CSV или режим «Только денежные потоки». При работе только с историей действует правило H3. В журнале доступны статусы, версии входов и CSV, сформированные движком.
5. В «Факторном анализе» выберите полный базовый расчёт, затем стресс MOEX и/или стресс CBKEY1M. Первый фактор переоценивает сохранённые потоки. При втором `cfgen` строит новые потоки, а backend считает NPV под выбранной дисконтной кривой.
6. В разделе «Кривые ставок» можно сопоставить точки двух снимков и увидеть ставку, DF и PV по отдельным платежам. В историческом режиме «Факторного анализа» доступны сравнения сохранённых NPV, PV и баланса на две даты.

## Расчёт без доступа к MOEX

Загрузите верифицированный снимок QuantumTeam/MOEX за 20.11.2026 из комплекта репозитория.

```bash
docker compose exec backend python scripts/load_verified_snapshot.py
```

Выберите в портфеле снимок `quantum_cached` и дату оценки не раньше 20.11.2026. Этот снимок содержит бакетную базу и использует сохранённую методику непрерывного дисконтирования. Для рабочего прогона FLOAT нужен отдельный CSV истории. Образец Quantum `calculator-demo.csv` содержит условные ставки и подходит для сверки формата файла.

При обновлении существующей установки сохраните резервную копию PostgreSQL и тома артефактов. Compose применяет Alembic при старте backend и подключает существующие тома. Ранее загруженная история из `market/key_rate.csv` переносится в каталог версий при первом FLOAT-расчёте, которому нужна эта история.

Полный результат зафиксирован в [docs/IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md). Методика и ограничения описаны в [docs/FINANCIAL_METHODOLOGY.md](docs/FINANCIAL_METHODOLOGY.md), статусы — в [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md), сценарий защиты — в [docs/DEMO.md](docs/DEMO.md).
