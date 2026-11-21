import { test, expect } from '@playwright/test'

test('six primary routes remain navigable', async ({page}) => {
  await page.goto('/overview')
  for (const label of ['Обзор', 'Генератор сделок', 'Портфель', 'Факторный анализ', 'Кривые ставок', 'Данные и интеграции']) {
    await expect(page.getByRole('link', {name: label}).first()).toBeVisible()
  }
})

test('generator modes keep entered values', async ({page}) => {
  await page.goto('/generator')
  const name = page.getByLabel('Название портфеля')
  await name.fill('Сохраняемое состояние')
  await page.getByRole('link', {name: 'Расширенный режим'}).click()
  await page.getByRole('link', {name: 'Простой режим'}).click()
  await expect(page.getByLabel('Название портфеля')).toHaveValue('Сохраняемое состояние')
})
