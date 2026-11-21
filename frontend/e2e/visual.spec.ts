import { test, expect } from '@playwright/test'

let portfolioId = ''
let dealId = ''

test.beforeAll(async ({request}) => {
  let portfolios = await (await request.get('/api/portfolios')).json()
  if (!portfolios.length) {
    const generated = await (await request.post('/api/portfolios/generate', {data: {name: 'Визуальная проверка', portfolio_type: 'mixed', count: 100, valuation_date: '2026-11-21', seed: 42, credit_share: 70, fixed_share: 100}})).json()
    portfolioId = generated.result.portfolio_id
    const knownCurves = await (await request.get('/api/curves')).json()
    const curve = knownCurves[0] || await (await request.post('/api/curves/import', {data: {source: 'educational_reference', trade_date: '2026-11-21', convention: 'continuous_zero_rate_ACT365', points: [{bucket_code: '1d', tenor_years: '0.0027', rate_percent: '10'}, {bucket_code: '30y', tenor_years: '30', rate_percent: '12'}]}})).json()
    const calculated = await (await request.post(`/api/portfolios/${portfolioId}/calculate`, {data: {snapshot_id: curve.id}})).json()
    await request.post('/api/analysis/scenario', {data: {portfolio_id: portfolioId, base_run_id: calculated.run_id, name: '+100 б.п.', factors: [{kind: 'discount_shift_bp', value: '100'}]}})
  } else {
    portfolioId = portfolios[0].id
  }
  const deals = await (await request.get(`/api/portfolios/${portfolioId}/deals?page_size=1`)).json()
  dealId = deals.items[0].id
})

const screens: [string, string][] = [
  ['01_overview', '/overview'],
  ['02_generator_simple', '/generator'],
  ['03_generator_advanced', '/generator?mode=advanced'],
  ['04_portfolio', '/portfolios'],
  ['05_deal_detail', '/portfolios/{portfolioId}/deals/{dealId}'],
  ['06_factor_scenario', '/analysis'],
  ['07_factor_history', '/analysis?mode=history'],
  ['08_curves', '/curves'],
  ['09_curves_scenarios', '/curves?tab=scenarios'],
  ['10_curves_discount', '/curves?tab=discount'],
  ['11_curves_history', '/curves?tab=history'],
  ['12_integrations_connections', '/integrations'],
  ['13_integrations_sources', '/integrations?tab=sources'],
  ['14_integrations_runs', '/integrations?tab=runs'],
  ['15_integrations_logs', '/integrations?tab=logs'],
]

for (const [name, path] of screens) {
  test(`${name} renders at 1600x1000`, async ({page}) => {
    await page.goto(path.replace('{portfolioId}', portfolioId).replace('{dealId}', dealId))
    await expect(page.locator('.sidebar')).toBeVisible()
    await expect(page.locator('.topbar')).toBeVisible()
    await page.screenshot({path: `../artifacts/screenshots/${name}.png`, fullPage: true})
  })
}
