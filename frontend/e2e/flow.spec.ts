import { test, expect } from '@playwright/test'

test('six primary routes remain navigable', async ({page}) => {
  await page.goto('/overview')
  for (const label of ['Обзор', 'Генератор', 'Портфель', 'Факторный анализ', 'Кривые ставок', 'Данные и интеграции']) {
    await expect(page.getByRole('link', {name: label}).first()).toBeVisible()
  }
})

test('application chrome is simplified on every primary route', async ({page}) => {
  for (const path of ['/overview', '/generator', '/portfolios', '/analysis', '/curves', '/integrations']) {
    await page.goto(path)
    await expect(page.locator('.sidebar nav .nav-item')).toHaveCount(6)
    await expect(page.locator('.top-status, .live-badge, .avatar, .sidebar-panel, .sidebar-foot')).toHaveCount(0)
    await expect(page.getByText('Проект · Спринт 03')).toHaveCount(0)
    await expect(page.getByText('Настройки отображения')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy()
  }

  await page.goto('/integrations')
  await expect(page.getByText('nosnitches-cashflow', {exact: true})).toBeVisible()
  await expect(page.getByRole('heading', {name: 'QuantumTeam'})).toBeVisible()

  await page.goto('/overview')
  const portfolioCard = page.locator('.current-portfolio-kpi')
  await expect(portfolioCard).toBeVisible()
  await expect(portfolioCard.getByText(/^ID /)).toHaveCount(0)
})

test('refined chrome stays within a compact viewport', async ({page}) => {
  await page.setViewportSize({width: 768, height: 900})
  await page.goto('/overview')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy()
  await expect(page.locator('.sidebar nav .nav-item')).toHaveCount(6)
  await expect(page.locator('.current-portfolio-kpi')).toBeVisible()
})

test('generator modes keep entered values', async ({page}) => {
  await page.goto('/generator')
  const name = page.getByLabel('Название портфеля')
  await name.fill('Сохраняемое состояние')
  await page.getByRole('link', {name: 'Расширенный режим'}).click()
  await page.getByRole('link', {name: 'Простой режим'}).click()
  await expect(page.getByLabel('Название портфеля')).toHaveValue('Сохраняемое состояние')
})
