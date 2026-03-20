import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function registerAndSignIn(page: Page) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `playwright-dry-run-${unique}@example.com`
  const password = 'playwright-pass-123'

  await page.goto('/register')
  await page.getByLabel('Name').fill(`Playwright Dry Run ${unique}`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await page.waitForURL(/\/login\?registered=1$/, { timeout: 15_000 })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 })
}

test('mixed broker statements surface option warnings before import', async ({
  page,
}) => {
  test.setTimeout(60_000)

  await registerAndSignIn(page)

  const fixturePath = path.join(
    process.cwd(),
    'playwright',
    'fixtures',
    'sample-option-statement.csv',
  )

  await page.goto('/upload')
  await expect(page.getByRole('heading', { name: 'Import Trades' })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles(fixturePath)

  await expect(page.getByText('sample-option-statement.csv')).toBeVisible()
  await expect(page.getByText('Option rows')).toBeVisible()
  await expect(page.getByText(/Grouper warnings \(\d+\)/)).toBeVisible()
  await expect(
    page.getByText('Option contract row detected. Quantity is contracts, not shares.'),
  ).toBeVisible()

  const importButton = page.getByRole('button', {
    name: 'Import 2 Trades',
  })
  await expect(importButton).toBeEnabled()
})
