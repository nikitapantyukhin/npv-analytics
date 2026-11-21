# NPV Analytics — спринт 03

Рабочая банковская аналитическая платформа для генерации кредитных и депозитных портфелей, расчёта денежных потоков через `nosnitches-cashflow`, загрузки кривых QuantumTeam, PV/NPV и сценарного факторного анализа.

Интерфейс реализует все шесть разделов и 15 утверждённых состояний из `.local/designs/`. Иллюстративные числа макетов не используются как финансовые результаты: KPI читаются из backend, а отсутствующие источники показаны честными статусами.

## Быстрый запуск

Требования: Docker Desktop/Engine с Compose v2; для Windows 11 рекомендуется WSL2 Ubuntu 24.04. Для локальной frontend-разработки нужен Node.js 22.12+. Скопируйте `.env.example` в `.env` и при необходимости измените URL QuantumTeam.

```bash
docker compose up --build -d
docker compose ps
curl http://localhost:8000/api/health
```

Откройте `http://localhost:3000`. OpenAPI доступен на `http://localhost:8000/docs`.

Compose запускает frontend, backend, RQ worker, PostgreSQL и Redis. Образ backend клонирует только зафиксированный commit `nosnitches-cashflow` и собирает `cfgen`; чужой репозиторий не изменяется. QuantumTeam подключается как внешний HTTP-сервис по `QUANTUM_BASE_URL` (по умолчанию `http://host.docker.internal:8001`).

```bash
# логи
docker compose logs -f backend worker frontend

# остановка без удаления данных
docker compose down

# удалить только Docker volumes проекта (не затрагивает .local/designs)
docker compose down -v
```

## Локальная разработка

```bash
python3 -m venv .venv
.venv/bin/pip install -e 'backend[test]'
DATABASE_URL=sqlite:///./npv_analytics.sqlite3 .venv/bin/uvicorn app.main:app --app-dir backend --reload --port 8000

cd frontend
npm install
npm run dev
```

## Проверки

```bash
.venv/bin/pytest backend/tests
cd frontend && npm run test && npm run build
cd frontend && npx playwright test
docker compose config
```

Интеграционный тест `cfgen` запускается, если заданы `NOSNITCHES_REPO` и `CFGEN_BIN`:

```bash
NOSNITCHES_REPO=/path/to/nosnitches-cashflow \
CFGEN_BIN=/path/to/cfgen \
ARTIFACTS_DIR=/tmp/npv-test-artifacts \
.venv/bin/pytest backend/tests/test_cfgen_integration.py -v
```

## Минимальный рабочий путь

1. Создайте портфель в «Генераторе сделок»; одинаковые настройки, `seed` и версия дают одинаковый hash.
2. Для FLOAT загрузите проверенный CSV `indicator,date,rate` в «Данные и интеграции → Источники данных».
3. Получите снимок QuantumTeam или импортируйте кривую через `POST /api/curves/import`, обязательно указав реальный тип источника.
4. В портфеле выберите снимок и запустите расчёт. `cfgen` сохраняет исходные события и ошибки; NPV считается только при полном покрытии DF.
5. В «Факторном анализе» примените сдвиг кривой. Денежные потоки переиспользуются, DF/PV пересчитываются, waterfall телескопируется.

Для офлайн-защиты доступен верифицированный снимок живого QuantumTeam/MOEX за 20.11.2026:

```bash
docker compose exec backend python scripts/load_verified_snapshot.py
```

Он маркируется `quantum_cached`, содержит SHA источника и не выдаётся за текущее live-подключение.

Полный результат зафиксирован в [docs/IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md). Методика и ограничения описаны в [docs/FINANCIAL_METHODOLOGY.md](docs/FINANCIAL_METHODOLOGY.md), статусы — в [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md), сценарий защиты — в [docs/DEMO.md](docs/DEMO.md).
