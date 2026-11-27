import { expect, test } from '@playwright/test'

const valuationDate = process.env.NPV_INTEGRATION_DATE

test('Quantum и cfgen рассчитывают базу и стресс из общего интерфейса', async ({page, request}) => {
  test.skip(!valuationDate, 'Задайте NPV_INTEGRATION_DATE для запущенного стенда с Quantum и cfgen')
  test.setTimeout(120_000)

  await page.goto('/curves')
  await page.getByLabel('Торговая дата MOEX').fill(valuationDate!)
  const build = page.waitForResponse(response => response.url().endsWith('/curves/calculate'))
  await page.getByRole('button', {name: 'Построить кривую MOEX'}).click()
  const buildRun = await (await build).json()
  let snapshotId: string
  await expect.poll(async () => {
    const run = await (await request.get(`/api/runs/${buildRun.run_id}`)).json()
    snapshotId = run.result?.snapshot_id
    return run.error_summary || run.status
  }, {timeout: 90_000}).toBe('succeeded')
  await expect(page.getByLabel('Сохранённый снимок')).toHaveValue(snapshotId!)
  await page.getByLabel('Сценарий снимка').selectOption('parallel_up')
  const stressCurve = await request.get(`/api/curves/${snapshotId!}?scenario=parallel_up`)
  expect((await stressCurve.json()).points).toHaveLength(19)

  await page.goto('/integrations?tab=sources')
  await page.getByLabel('Тип набора данных').selectOption('key-rates')
  await page.getByLabel('Источник ставок').fill('Проверочная история')
  await page.getByLabel('Выбрать CSV').setInputFiles({
    name: 'key_rate.csv', mimeType: 'text/csv', buffer: Buffer.from('indicator,date,rate\nCBKEY1M,2020-01-01,0.08\n'),
  })
  const historyUpload = page.waitForResponse(response => response.url().endsWith('/data/key-rates/import'))
  await page.getByRole('button', {name: 'Проверить и импортировать'}).click()
  const history = await historyUpload
  expect(history.status()).toBe(201)
  const historyId = (await history.json()).id
  const nextDay = new Date(Date.parse(valuationDate!) + 86_400_000).toISOString().slice(0, 10)
  await page.getByLabel('Тип набора данных').selectOption('forecast')
  await page.getByLabel('Источник ставок').fill('Проверочный прогноз')
  await page.getByLabel('Дата оценки прогноза').fill(valuationDate!)
  await page.getByLabel('Выбрать CSV').setInputFiles({
    name: 'curves.csv', mimeType: 'text/csv', buffer: Buffer.from(
      `indicator,date,rate,scenario\nCBKEY1M,${nextDay},0.10,base\nCBKEY1M,${nextDay},0.12,stress\n`,
    ),
  })
  const upload = page.waitForResponse(response => response.url().endsWith('/data/key-rate-forecasts') && response.request().method() === 'POST')
  await page.getByRole('button', {name: 'Проверить и импортировать'}).click()
  const forecast = await upload
  expect(forecast.status()).toBe(201)
  const forecastId = (await forecast.json()).id

  await page.goto('/generator')
  await page.getByLabel('Название портфеля').fill('Сквозная проверка Quantum и cfgen')
  await page.getByLabel('Количество сделок').fill('10')
  await page.getByLabel('Дата оценки').fill(valuationDate!)
  await page.getByRole('slider', {name: 'Доля FIXED'}).press('ArrowLeft')
  await expect(page.getByRole('slider', {name: 'Доля FIXED'})).toHaveValue('69')
  await page.getByRole('button', {name: 'Проверить настройки'}).click()
  await expect(page.getByText('Настройки прошли проверку')).toBeVisible()
  const generation = page.waitForResponse(response => response.url().endsWith('/portfolios/generate') && response.request().method() === 'POST')
  await page.getByRole('button', {name: 'Сгенерировать портфель'}).click()
  const generationId = (await (await generation).json()).run_id
  let portfolioId: string
  await expect.poll(async () => {
    const run = await (await request.get(`/api/runs/${generationId}`)).json()
    portfolioId = run.result?.portfolio_id
    return run.status
  }, {timeout: 30_000}).toBe('succeeded')

  await page.waitForURL(`**/portfolios/${portfolioId!}`)
  await page.getByLabel('Снимок дисконтной кривой').selectOption(snapshotId!)
  await page.getByLabel('История CBKEY1M').selectOption(historyId)
  await page.getByLabel('Прогноз CBKEY1M').selectOption(forecastId)
  const calculation = page.waitForResponse(response => response.url().endsWith('/calculate') && response.request().method() === 'POST')
  await page.getByRole('button', {name: 'Рассчитать портфель'}).click()
  const base = await (await calculation).json()
  await expect.poll(async () => {
    const run = await (await request.get(`/api/runs/${base.run_id}`)).json()
    return run.status === 'succeeded' ? run.result.valuation_status : run.status
  }, {timeout: 30_000}).toBe('succeeded')

  await page.goto('/analysis')
  await page.getByLabel('Объект анализа').selectOption(portfolioId!)
  await page.getByLabel('Базовый расчёт').selectOption(base.run_id)
  await page.getByLabel('Стресс кривой MOEX').selectOption('parallel_up')
  await page.getByLabel('Стресс прогноза CBKEY1M').selectOption('stress')
  const scenarioResponse = page.waitForResponse(response => response.url().endsWith('/analysis/market-scenario'))
  await page.getByRole('button', {name: 'Рассчитать', exact: true}).click()
  const scenario = await (await scenarioResponse).json()
  await expect(page.getByText('Реальный расчёт')).toBeVisible({timeout: 30_000})
  const result = (await (await request.get(`/api/runs/${scenario.run_id}`)).json()).result
  expect(result.cfgen_invoked).toBe(true)
  expect(result.waterfall).toHaveLength(2)
  const cashflow = result.artifacts.find((artifact: {filename: string}) => artifact.filename === 'cashflow.csv')
  const events = await (await request.get(`/api/artifacts/${cashflow.id}/download`)).text()
  const [headers, ...rows] = events.trim().split('\n').map(row => row.trim().split(','))
  const baseRate = headers.indexOf('base_rate')
  const amount = headers.indexOf('amount')
  expect(rows.some(row => Number(row[baseRate]) === 0.12)).toBe(true)
  expect(rows.some(row => Number(row[amount]) < 0)).toBe(true)
  expect(rows.some(row => Number(row[amount]) > 0)).toBe(true)
  const deals = await (await request.get(`/api/portfolios/${portfolioId!}/deals?page_size=1`)).json()
  await page.goto(`/portfolios/${portfolioId!}/deals/${deals.items[0].id}`)
  await expect(page.getByText('Динамика платежей')).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible()

  await page.goto('/generator')
  await page.getByRole('button', {name: 'История генераций'}).click()
  await expect(page.getByRole('heading', {name: 'История генераций'})).toBeVisible()
  await expect(page.locator('tbody tr').first()).toContainText('generation')

  const exported = await (await request.get(`/api/portfolios/${portfolioId!}/export`)).text()
  await page.goto('/integrations?tab=sources')
  const transfer = await page.evaluateHandle(csv => {
    const upload = new DataTransfer()
    upload.items.add(new File([csv], 'deals.csv', {type: 'text/csv'}))
    return upload
  }, exported)
  await page.getByText('Перетащите CSV-файл сюда').dispatchEvent('drop', {dataTransfer: transfer})
  const portfolioUpload = page.waitForResponse(response => response.url().endsWith('/portfolios/import'))
  await page.getByRole('button', {name: 'Проверить и импортировать'}).click()
  const importedPortfolio = await portfolioUpload
  expect(importedPortfolio.status()).toBe(201)
  expect((await importedPortfolio.json()).rows).toBe(10)
})
