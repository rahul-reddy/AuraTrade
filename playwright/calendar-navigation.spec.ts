import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { DashboardPayload } from '../src/lib/dashboard/types'

async function expectActiveHeading(page: Page, name: string) {
  // Next can briefly retain a streamed route copy outside the active workspace.
  const heading = page.locator('#main-content').getByRole('heading', { name, exact: true })
  await expect(heading).toHaveCount(1)
  await expect(heading).toBeVisible()
}

async function signInAndImport(page: Page, fixture: string, tradeCount: number) {
  const email = `playwright-calendar-nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill('Calendar Navigation')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.waitForURL(/\/login\?registered=1$/)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(/\/dashboard$/)
  await page.goto('/upload')
  await page.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures', fixture))
  await page.getByRole('button', { name: `Import ${tradeCount} Trades`, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Import complete', exact: true })).toBeVisible({ timeout: 30000 })
}

test('heatmap sorts newest first and filters calendar months and years independently of dashboard dates', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  await signInAndImport(page, 'sample-trades.csv', 1)
  await page.route('**/api/dashboard?**', async route => {
    const response = await route.fetch()
    const payload = await response.json() as DashboardPayload
    // Deliberately unordered synthetic calendar presentation; retain real API metrics.
    payload.insights.monthlyHeatmap = [
      { monthKey: '2025-09', monthLabel: 'September 2025' },
      { monthKey: '2026-01', monthLabel: 'January 2026' },
      { monthKey: '2026-10', monthLabel: 'October 2026' },
      { monthKey: '2025-02', monthLabel: 'February 2025' },
    ].map(month => ({ ...month, totalPnl: 150, days: [{ date: `${month.monthKey}-15`, day: 15, pnl: 150, intensity: 1, tradeCount: 1 }] }))
    await route.fulfill({ response, json: payload })
  })
  await page.goto('/dashboard')
  const calendar = page.locator('#calendar')
  const months = calendar.getByTestId('heatmap-month')
  await expect(months).toHaveCount(4)
  await expect.poll(() => months.evaluateAll(elements => elements.map(element => element.getAttribute('data-month')))).toEqual(['2026-10', '2026-01', '2025-09', '2025-02'])
  const originalUrl = page.url()
  await page.getByLabel('Heatmap year', { exact: true }).selectOption('2025')
  await expect(months).toHaveCount(2)
  await expect(months.first()).toHaveAttribute('data-month', '2025-09')
  await page.getByLabel('Heatmap month', { exact: true }).selectOption('09')
  await expect(months).toHaveCount(1)
  await expect(months.first()).toHaveAttribute('data-month', '2025-09')
  await page.getByLabel('Heatmap month', { exact: true }).selectOption('10')
  await expect(months).toHaveCount(0)
  await expect(calendar.getByText(/No trading history for this month and year/)).toBeVisible()
  await page.getByRole('button', { name: 'Clear calendar filters', exact: true }).click()
  await expect(months).toHaveCount(4)
  await page.getByLabel('Heatmap month', { exact: true }).selectOption('01')
  await expect(months).toHaveCount(1)
  await expect(months.first()).toHaveAttribute('data-month', '2026-01')
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('')
  expect(page.url()).toBe(originalUrl)
  await page.getByRole('button', { name: 'Clear calendar filters', exact: true }).click()
  await calendar.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('calendar-filters-desktop.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.locator('#main-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await calendar.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('calendar-filters-mobile.png'), animations: 'disabled' })
})

test('chart symbol search works in place and returning to trades clears the chart symbol', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  await page.route('**/api/market-data?**', route => route.fulfill({ json: { effectiveTimeframe: '1d', source: 'cache', fallbackMessage: null, candles: [{ time: '2026-01-15T00:00:00Z', open: 20, high: 23, low: 19, close: 22, volume: 1000 }] } }))
  await signInAndImport(page, 'sample-tos-account-statement.csv', 2)
  await page.goto('/trades?symbol=TOSA')
  await page.getByRole('link', { name: 'TOSA', exact: true }).click()
  await expectActiveHeading(page, 'TOSA')
  const accountId = new URL(await page.getByRole('link', { name: '← Trades', exact: true }).getAttribute('href') ?? '', page.url()).searchParams.get('accountId')
  await expect(page.getByRole('search', { name: 'Search chart symbols' })).toBeVisible()
  await expect(page.getByText('Symbol search', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Jump to symbol', exact: true }).fill('tosb')
  await page.getByRole('button', { name: 'Open symbol chart', exact: true }).click()
  await expectActiveHeading(page, 'TOSB')
  expect(new URL(page.url()).searchParams.get('accountId')).toBe(accountId)
  await page.getByRole('textbox', { name: 'Jump to symbol', exact: true }).fill('AAPL')
  await page.getByRole('textbox', { name: 'Jump to symbol', exact: true }).press('Enter')
  await expectActiveHeading(page, 'AAPL')
  await page.screenshot({ path: testInfo.outputPath('chart-symbol-search.png'), animations: 'disabled' })
  await page.getByRole('link', { name: '← Trades', exact: true }).click()
  await expectActiveHeading(page, 'Trade History')
  expect(new URL(page.url()).searchParams.has('symbol')).toBe(false)
  expect(new URL(page.url()).searchParams.get('accountId')).toBe(accountId)
  await expect(page.getByLabel('Search symbol', { exact: true })).toHaveValue('')
  await expect(page.getByRole('link', { name: 'TOSA', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'TOSB', exact: true })).toBeVisible()
})
