import { expect, test, type APIRequestContext } from '@playwright/test'

const portfolioId = process.env.NPV_READY_PORTFOLIO_ID

type CalculationState = {
  status: string
  inputs?: {curve_mode?: string}
  result?: {cashflow_status?: string; valuation_reason?: string; npv?: string}
}

async function completed(request: APIRequestContext, id: string): Promise<CalculationState> {
  let run: CalculationState = {status: 'queued'}
  await expect.poll(async () => {
    run = await (await request.get(`/api/runs/${id}`)).json()
    return ['queued', 'running'].includes(run.status) ? 'waiting' : 'finished'
  }, {timeout: 55_000}).toBe('finished')
  return run
}

test.describe('готовый стенд', () => {
  test.skip(!portfolioId, 'Задайте NPV_READY_PORTFOLIO_ID на стенде с двумя оценками и историей ставок')
  test.setTimeout(180_000)

  test('расчёт по умолчанию, отдельный расчёт потоков, реестр и скачивание', async ({page, request}) => {
    await page.goto(`/portfolios/${portfolioId}`)
    const curveInput = page.getByLabel('Снимок дисконтной кривой')
    const calculate = page.getByRole('button', {name: 'Рассчитать портфель'})
    await expect(curveInput).toHaveValue('auto')

    await curveInput.selectOption('cashflows')
    const flowsResponse = page.waitForResponse(response => response.url().endsWith('/calculate') && response.request().method() === 'POST')
    await calculate.click()
    const flows = await completed(request, (await (await flowsResponse).json()).run_id)
    expect(flows.result?.cashflow_status).toBe('succeeded')
    await expect(page.getByRole('status').filter({hasText: 'Денежные потоки рассчитаны'})).toBeVisible()
    await expect(page.getByText('Не удалось получить данные')).toHaveCount(0)

    await curveInput.selectOption('auto')
    const valuationResponse = page.waitForResponse(response => response.url().endsWith('/calculate') && response.request().method() === 'POST')
    await calculate.click()
    const valuation = await completed(request, (await (await valuationResponse).json()).run_id)
    expect(valuation.status, valuation.result?.valuation_reason).toBe('succeeded')
    expect(valuation.inputs?.curve_mode).toBe('automatic')
    expect(valuation.result?.npv).toBeDefined()

    await page.getByLabel('Тип сделки').selectOption('deposit')
    await page.getByLabel('Ставка', {exact: true}).selectOption('FLOAT')
    await page.getByLabel('Статус', {exact: true}).selectOption('valid')
    await page.getByRole('button', {name: 'Вперёд'}).click()
    await expect(page.getByText(/Страница 2 из/)).toBeVisible()
    await page.getByRole('button', {name: 'Назад'}).click()
    await expect(page.getByText(/Страница 1 из/)).toBeVisible()
    await page.getByLabel('Поиск сделки в портфеле').fill('SYNTHETIC_DEPOSIT')
    await page.getByRole('button', {name: 'Найти сделку'}).click()
    await expect(page.locator('tbody tr').first()).toContainText('Депозит')

    const exported = page.waitForEvent('download')
    await page.getByRole('button', {name: 'Экспорт CSV'}).click()
    expect((await exported).suggestedFilename()).toMatch(/^portfolio-.+\.csv$/)
    await page.getByRole('link', {name: 'Денежные потоки', exact: true}).click()
    await expect(page.getByRole('link', {name: 'cashflow.csv'})).toBeVisible()
    await expect(page.getByRole('link', {name: 'errors.csv'})).toBeVisible()

    await curveInput.selectOption('cashflows')
    const portfolioSwitcher = page.getByLabel('Открыть портфель', {exact: true})
    const another = await portfolioSwitcher.locator('option').evaluateAll((options, current) =>
      options.map(option => (option as HTMLOptionElement).value).find(value => value && value !== current),
    portfolioId)
    expect(another).toBeTruthy()
    await portfolioSwitcher.selectOption(another!)
    await expect(curveInput).toHaveValue('auto')
  })

  test('исторические оценки, кривые, дисконтирование сделки и диагностика', async ({page, request}) => {
    await page.goto(`/analysis?portfolio=${portfolioId}`)
    await page.getByLabel('Режим сценария').selectOption('manual')
    await page.getByLabel('Сдвиг дисконтной кривой').press('ArrowRight')
    await page.getByRole('button', {name: 'Рассчитать', exact: true}).click()
    await expect(page.getByText('Реальный расчёт')).toBeVisible()

    await page.goto('/analysis?mode=history')
    await page.getByRole('button', {name: 'Сравнить сохранённые расчёты'}).click()
    await expect(page.getByRole('heading', {name: 'Сравнение NPV'})).toBeVisible()

    await page.goto('/curves?tab=history')
    await expect(page.getByRole('heading', {name: 'Кривые на две даты'})).toBeVisible()
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(19)
    await page.getByRole('button', {name: 'Импортировать готовый'}).click()
    await expect(page.getByRole('button', {name: 'Импортировать готовый'})).toBeEnabled()

    const {items} = await (await request.get(`/api/portfolios/${portfolioId}/deals?page_size=1`)).json()
    await page.goto(`/portfolios/${portfolioId}/deals/${items[0].id}`)
    await expect(page.locator('canvas').first()).toBeVisible()
    await page.getByRole('link', {name: 'NPV и дисконтирование'}).click()
    await expect(page.getByRole('heading', {name: 'Дисконтирование по событиям'})).toBeVisible()
    await page.getByRole('link', {name: 'Сравнить кривые'}).click()
    await page.getByLabel('Сценарий сравнения').selectOption('parallel_up')
    await expect(page.getByRole('heading', {name: 'Дисконтирование по событиям'})).toBeVisible()

    await page.goto('/integrations')
    await page.getByText('Подробнее о подключении QuantumTeam').click()
    for (const button of ['Проверить nosnitches-cashflow', 'Проверить QuantumTeam', 'Проверить подключения']) {
      const diagnostics = page.waitForResponse(response => response.url().includes('/integrations/smoke-test'))
      await page.getByRole('button', {name: button, exact: true}).click()
      const result = await (await diagnostics).json()
      expect(result.status, JSON.stringify(result.steps)).toBe('succeeded')
      await expect(page.getByRole('heading', {name: 'Результаты проверки'})).toBeVisible()
    }
    await page.getByRole('link', {name: 'Проверки и журнал'}).click()
    await page.getByRole('button', {name: 'Проверить: Формат сделок'}).click()
    await expect(page.getByText('Контракт сделок · Одна фиксированная сделка прошла проверку')).toBeVisible()
    await page.getByRole('button', {name: 'error', exact: true}).click()
    await page.getByRole('switch').click()
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    const log = page.waitForEvent('download')
    await page.getByRole('button', {name: 'Скачать лог'}).click()
    expect((await log).suggestedFilename()).toBe('npv-analytics-log.txt')

    await page.getByText('Настройки отображения').click()
    await page.getByRole('checkbox', {name: 'Компактные таблицы'}).check()
    await expect(page.locator('html')).toHaveAttribute('data-compact-tables', '')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-compact-tables', '')
    await page.getByLabel('Открыть портфель', {exact: true}).selectOption(portfolioId!)
    await expect(page).toHaveURL(new RegExp(`/portfolios/${portfolioId}$`))
  })
})
