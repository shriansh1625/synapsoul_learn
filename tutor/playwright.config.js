import { defineConfig, devices } from '@playwright/test'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND = process.env.LEARNLAB_FRONTEND_URL || 'https://tutor-alpha-sandy.vercel.app'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], [join(__dirname, 'scripts', 'live-e2e-reporter.js')]],
  use: {
    baseURL: FRONTEND,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  outputDir: join(__dirname, 'e2e', 'test-output'),
})
