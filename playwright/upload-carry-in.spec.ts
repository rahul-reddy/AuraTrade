import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function registerAndSignIn(page: Page) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `playwright-carry-${unique}@example.com`
  const password = 'playwright-pass-123'

  await page.goto('/register')
  await page.getByLabel('Name').fill(`Playwright Carry ${unique}`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await page.waitForURL(/\/login\?registered=1$/, { timeout: 15_000 })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 })
}

async function importStatement(page: Page, fixture: string, expectedButton: string) {
  await page.goto('/upload')
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(process.cwd(), 'playwright', 'fixtures', fixture))
  await expect(page.getByText(fixture)).toBeVisible()
  const importButton = page.getByRole('button', { name: expectedButton })
  await expect(importButton).toBeEnabled({ timeout: 20_000 })
  await importButton.scrollIntoViewIfNeeded()
  await importButton.click()
  await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible({
    timeout: 20_000,
  })
}

test('a statement that only closes a position opened in an earlier statement imports the round trip', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await registerAndSignIn(page)

  // Statement 1 only opens TOSC (10 @ $50.00).
  await importStatement(page, 'tos-carry-in-open.csv', 'Import 1 Trades')

  // Statement 2 only closes it (10 @ $55.00, $0.05 fee). On its own it has no
  // inventory; against the account ledger it completes one round trip:
  // (55.00 − 50.00) × 10 − 0.05 = $49.95.
  await importStatement(page, 'tos-carry-in-close.csv', 'Import 1 Trades')

  await page.goto('/trades')
  await expect(page.getByRole('heading', { name: 'Trade History' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'TOSC' })).toHaveCount(1)
  await expect(page.getByText('49.95').first()).toBeVisible()
})
