# Визуальная проверка

Эталон: `.local/designs/screens/*.png`, viewport 1600×1000. Общие токены, sidebar 257 px, topbar 68 px, карточки, вкладки, типографика и сетки перенесены из `.local/designs/source/styles.css` в общую React design system.

Playwright-процедура `frontend/e2e/visual.spec.ts` охватывает:

1. overview;
2. generator simple;
3. generator advanced;
4. portfolio registry;
5. deal detail;
6. factor scenario;
7. factor history;
8. curves;
9. curve scenarios;
10. discount/NPV;
11. curve history;
12. integration connections;
13. data sources;
14. calculation runs;
15. diagnostics/logs.

Фактические снимки сохраняются в `artifacts/screenshots/`. Финансовые числа могут отличаться от PNG: в приложении они берутся только из API. Responsive breakpoints 1200/800 px сохраняют desktop layout и переводят сетки в одну колонку на мобильных.

## Результат 21.11.2026

- Все 15 full-page снимков получены Chromium при viewport 1600×1000 и просмотрены вручную рядом с каноническими PNG.
- Совпадают каркас 257/68 px, ширины контента, сетки карточек, вкладки, таблицы, палитра, типографическая иерархия и состояния отсутствующих данных.
- Динамические суммы, UUID, даты, статусы и строки таблиц намеренно не копируют эталон: это реальные ответы backend.
- При просмотре найден и исправлен один дефект: сырая Decimal-строка NPV на экране дисконтирования теперь форматируется в RUB с двумя знаками.
- Playwright: 15 визуальных маршрутов и 2 сквозных пользовательских сценария, всего 17/17 passed. Сквозной набор создаёт детерминированный портфель, запускает настоящий `cfgen`, использует сохранённую проверенную кривую, вычисляет NPV и сценарий +100 б.п.

Автоматический pixel-perfect diff не используется как критерий для динамических финансовых данных. Критерий — ручное сравнение структуры плюс устойчивые route/flow assertions; изображения остаются в `artifacts/screenshots/` для повторной проверки.
