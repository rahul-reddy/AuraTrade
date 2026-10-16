import { expect, test, type Page } from '@playwright/test'

async function registerAndSignIn(page: Page) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `playwright-sidebar-${unique}@example.com`
  const password = 'playwright-pass-123'

  await page.goto('/register')
  await page.getByLabel('Name').fill(`Playwright Sidebar ${unique}`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await page.waitForURL(/\/login\?registered=1$/, { timeout: 15_000 })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 })
}

test('sidebar collapse persists across a reload when storage works', async ({ page }) => {
  test.setTimeout(60_000)
  await registerAndSignIn(page)

  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()

  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible()
})

test('sidebar still toggles when localStorage writes throw', async ({ page }) => {
  test.setTimeout(60_000)
  // Simulate private mode / blocked site data: every storage write throws.
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage is disabled', 'SecurityError')
    }
  })
  await registerAndSignIn(page)

  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()

  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible()
})
