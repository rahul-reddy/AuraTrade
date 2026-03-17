import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function registerAndSignIn(page: Page) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `playwright-settings-${unique}@example.com`
  const password = 'playwright-pass-123'

  await page.goto('/register')
  await page.getByLabel('Name').fill(`Playwright Settings ${unique}`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await page.waitForURL(/\/login\?registered=1$/, { timeout: 15_000 })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })
}

test('user can open the integrity settings page after importing trades', async ({ page }) => {
  await registerAndSignIn(page)

  const fixturePath = path.join(process.cwd(), 'playwright', 'fixtures', 'sample-trades.csv')

  await page.goto('/upload')
  await page.locator('input[type="file"]').setInputFiles(fixturePath)
  await expect(page.getByText('Executions parsed')).toBeVisible()
  await page.getByRole('button', { name: 'Import 1 Trades' }).click()
  await expect(page.getByText('Import complete')).toBeVisible()

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.waitForURL(/\/settings\/integrity$/, { timeout: 15_000 })

  await expect(page.getByRole('heading', { name: 'Data Integrity' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reprocess All Trades' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Orphaned Executions' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Duplicate Candidates' })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reprocess All Trades' }).click()
  await expect(page.getByText(/Reprocessed .* trades and rebuilt .* snapshots\./)).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Rebuild All Snapshots' }).click()
  await expect(page.getByText(/Rebuilt .* daily snapshots\./)).toBeVisible()
})
