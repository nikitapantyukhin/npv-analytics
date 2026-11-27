import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const baseURL = process.env.NPV_E2E_URL || 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {timeout: 5_000},
  use: {baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: executablePath ? {executablePath} : undefined},
  webServer: process.env.NPV_E2E_URL ? undefined : {command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 120_000},
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome'], viewport: {width: 1600, height: 1000}}}],
})
