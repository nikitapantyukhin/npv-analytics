import { test, expect } from '@playwright/test'

test('six primary routes remain navigable', async ({page}) => {
  await page.goto('/overview')
  for (const label of ['Обзор', 'Генератор', 'Портфель', 'Факторный анализ', 'Кривые ставок', 'Данные и интеграции']) {
    await expect(page.getByRole('link', {name: label}).first()).toBeVisible()
  }
})

test('application chrome is consistent on every primary route', async ({page}) => {
  for (const path of ['/overview', '/generator', '/portfolios', '/analysis', '/curves', '/integrations']) {
    await page.goto(path)
    await expect(page.locator('aside nav a')).toHaveCount(6)
    await expect(page.locator('aside nav a.bg-lime')).toHaveCount(1)
    await expect(page.getByText('Проект · Спринт 03')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy()
  }

  await page.goto('/integrations')
  await expect(page.getByText('nosnitches-cashflow', {exact: true})).toBeVisible()
  await expect(page.getByRole('heading', {name: 'QuantumTeam'})).toBeVisible()
})

test('refined chrome stays within a compact viewport', async ({page}) => {
  await page.setViewportSize({width: 768, height: 900})
  await page.goto('/overview')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy()
  await expect(page.locator('aside nav a')).toHaveCount(6)
})

test('generator modes keep entered values', async ({page}) => {
  await page.goto('/generator')
  const name = page.getByLabel('Название портфеля')
  await name.fill('Сохраняемое состояние')
  await page.getByRole('link', {name: 'Расширенный'}).click()
  await page.getByRole('link', {name: 'Простой'}).click()
  await expect(page.getByLabel('Название портфеля')).toHaveValue('Сохраняемое состояние')
})
