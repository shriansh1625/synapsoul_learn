import { test, expect } from '@playwright/test'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS = join(__dirname, 'screenshots')

test.describe('LearnLab live student journey', () => {
  test.beforeAll(() => {
    mkdirSync(SCREENSHOTS, { recursive: true })
  })

  test('landing → dashboard with brain panel', async ({ page, baseURL }) => {
    const criticalErrors = []
    const ignored = /favicon|404.*\.(png|ico|svg)|Failed to load resource.*manifest/i

    page.on('console', msg => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      if (ignored.test(text)) return
      criticalErrors.push(text)
    })

    page.on('pageerror', err => {
      criticalErrors.push(err.message)
    })

    await page.addInitScript(() => {
      localStorage.setItem('learnlab-onboarded', '1')
      localStorage.setItem(
        'ai-tutor-progress-v2',
        JSON.stringify({
          profile: { name: 'E2E Student', degree: 'B.Tech', bio: 'Live test', level: 'beginner', track: 'node' },
          completedModules: {},
          session: null,
        })
      )
    })

    const response = await page.goto(baseURL || '/', { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBeLessThan(400)

    const startBtn = page.getByRole('button', { name: /Start Learning/i }).first()
    await expect(startBtn).toBeVisible({ timeout: 20_000 })
    await startBtn.click()

    await page.waitForTimeout(500)

    const onboarding = page.locator('.onboarding-overlay')
    if (await onboarding.isVisible().catch(() => false)) {
      const skip = page.getByRole('button', { name: 'Skip' })
      if (await skip.isVisible().catch(() => false)) {
        await skip.click()
      } else {
        await page.evaluate(() => localStorage.setItem('learnlab-onboarded', '1'))
        await page.reload({ waitUntil: 'domcontentloaded' })
      }
    }

    const dashboardNav = page.getByRole('button', { name: 'Dashboard' }).or(page.locator('nav').filter({ hasText: 'Dashboard' }))
    const brainEyebrow = page.getByText('LearnLab Brain')

    const sawDashboard =
      (await dashboardNav.first().isVisible().catch(() => false)) ||
      (await brainEyebrow.isVisible().catch(() => false))

    if (!sawDashboard) {
      const skillsTab = page.getByRole('button', { name: 'Skills' })
      if (await skillsTab.isVisible().catch(() => false)) {
        await skillsTab.click()
        await page.getByRole('button', { name: 'Dashboard' }).click()
      }
    }

    await expect(brainEyebrow).toBeVisible({ timeout: 25_000 })

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(200)

    if (criticalErrors.length > 0) {
      await page.screenshot({ path: join(SCREENSHOTS, 'console-errors.png'), fullPage: true })
      throw new Error(`Console/page errors: ${criticalErrors.slice(0, 5).join(' | ')}`)
    }
  })
})
