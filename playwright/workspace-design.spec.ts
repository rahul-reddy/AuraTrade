import path from 'node:path'
import { expect, test } from '@playwright/test'

test('root sign-in reaches the dashboard and the redesigned workspace supports review and import', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `playwright-design-${unique}@example.com`
  const password = 'playwright-pass-123'

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill('Design Review')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.waitForURL(/\/login\?registered=1$/)

  // Reproduce the production bug: visit / while signed out, then follow its callback.
  await page.goto('/')
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2F$/)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('sign-in-desktop.png') })
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Show characters', exact: true }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide characters', exact: true }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
  await expect(page.getByText('No trading account found.', { exact: true })).toBeVisible()
  await expect(page.getByText('To get started, edit the page.tsx file.')).toHaveCount(0)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('onboarding-desktop.png') })

  await page.getByRole('link', { name: 'Upload a CSV to get started →', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Import Trades', exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Import progress' }).locator('[aria-current="step"]')).toContainText('Choose statement')
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('import-desktop.png') })
  await page.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures', 'sample-trades.csv'))
  await expect(page.getByRole('button', { name: /Import \d+ Trades/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('list', { name: 'Import progress' }).locator('[aria-current="step"]')).toContainText('Review preview')
  await page.getByRole('button', { name: /Import \d+ Trades/ }).click()
  await expect(page.getByRole('heading', { name: 'Import complete', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('list', { name: 'Import progress' }).locator('[aria-current="step"]')).toContainText('Explore trades')

  await page.goto('/')
  await expect(page).toHaveURL(/\/dashboard$/)
  // The import starts enrichment in the background; wait for the dashboard API
  // to finish rather than treating its loading skeleton as a missing page.
  await expect(page.getByRole('heading', { name: 'Performance Dashboard', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Equity Curve', exact: true })).toBeVisible()
  await page.getByText('More performance statistics · best/worst day, streak, drawdown', { exact: true }).click()
  // With the synthetic all-winning history, even the worst day is profitable.
  await expect(page.getByRole('link', { name: /^Worst Day/ }).locator('p.font-mono')).toHaveClass(/text-green-400/)
  await page.getByText('More performance statistics · best/worst day, streak, drawdown', { exact: true }).click()
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('dashboard-desktop.png') })
  await page.getByRole('link', { name: 'Trading calendar', exact: true }).click()
  await expect(page.locator('#calendar')).toBeInViewport()

  await page.getByRole('button', { name: 'Search pages and commands', exact: true }).click()
  await page.getByPlaceholder('Search pages and actions…').fill('Trades')
  await page.getByRole('option', { name: /^Trades/ }).click()
  await expect(page.getByRole('heading', { name: 'Trade History', exact: true })).toBeVisible()
  await expect(page.getByLabel('Search symbol', { exact: true })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('trades-desktop.png') })
  await page.getByLabel('Search symbol', { exact: true }).fill('BROS')
  await expect(page).toHaveURL(/symbol=BROS/)
  // GET form navigation updates the URL before the next document's links render.
  // Wait for the filtered view's tab, rather than clicking the previous document.
  await expect(page.getByRole('link', { name: 'Closed trades', exact: true })).toHaveAttribute('href', /symbol=BROS/)
  await page.getByRole('link', { name: 'Closed trades', exact: true }).click()
  await expect(page).toHaveURL(/status=closed/)
  expect(new URL(page.url()).searchParams.get('symbol')).toBe('BROS')
  await page.getByRole('link', { name: 'Open positions', exact: true }).click()
  await expect(page).toHaveURL(/status=open/)
  await expect(page.getByText('No trades match your filters.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'All trades', exact: true }).click()
  await expect(page).toHaveURL(url => !url.searchParams.has('status'))
  await expect(page.getByRole('link', { name: 'BROS', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'BROS', exact: true }).click()
  await expect(page.getByTestId('chart-workspace')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Trades', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('chart-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.app-sidebar')).toHaveCSS('width', '60px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect.poll(() => page.locator('#main-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('chart-mobile.png') })
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Data Integrity', exact: true })).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('settings-desktop.png') })

  await page.setViewportSize({ width: 390, height: 844 })
  for (const route of ['/dashboard', '/trades', '/upload', '/settings/integrity']) {
    await page.goto(route)
    // Next.js can briefly retain hidden streamed markup during navigation.
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toHaveCount(1, { timeout: 30_000 })
    await expect(heading).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('link', { name: 'Upload', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect.poll(() => page.locator('#main-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`${route.split('/').pop()}-mobile.png`) })
  }
})

test('sign-in preserves a protected deep link and supports a small viewport', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  const email = `playwright-deep-link-${Date.now()}@example.com`
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill('Deep Link')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.waitForURL(/\/login\?registered=1$/)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/upload')
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fupload$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('sign-in-mobile.png') })
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/upload$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Import Trades', exact: true })).toBeVisible()
})
