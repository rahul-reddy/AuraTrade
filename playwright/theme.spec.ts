import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { MarketDataCandle } from '../src/lib/market-data/yahoo-client'

async function expectMode(page: Page, mode: 'dark' | 'light') {
  await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
  await expect(page.locator('html')).toHaveCSS('color-scheme', mode)
  await expect(page.locator('body')).toHaveCSS('background-color', mode === 'dark' ? 'rgb(27, 23, 19)' : 'rgb(246, 242, 233)')
  await expect(page.getByRole('button', { name: `Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`, exact: true })).toBeVisible()
}

test('Espresso & Acid persists across sign-in, pages and tabs, with themed charts and mobile controls', async ({ page, context }, testInfo) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 1600, height: 1050 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let marketRequests = 0
  await page.route('**/api/market-data?**', async route => {
    marketRequests++
    const params = new URL(route.request().url()).searchParams
    const candles: MarketDataCandle[] = []
    for (let time = Date.parse(params.get('from')!.slice(0, 10)); time <= Date.parse(params.get('to')!.slice(0, 10)); time += 86400000) {
      const i = candles.length
      const open = 50 + Math.sin(i / 8) * 3
      const close = open + (i % 2 ? .8 : -.8)
      candles.push({ time: new Date(time).toISOString(), open, close, high: open + 1, low: open - 1, volume: 1000000 + i * 1000 })
    }
    await route.fulfill({ json: { candles, effectiveTimeframe: '1d', source: 'cache', fallbackMessage: null } })
  })

  const email = `playwright-theme-${Date.now()}@example.com`
  await page.goto('/register')
  await expectMode(page, 'dark')
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
  await expectMode(page, 'light')
  await page.getByLabel('Name', { exact: true }).fill('Theme Review')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.waitForURL(/\/login\?registered=1$/)
  await expectMode(page, 'light')
  await page.reload()
  await expectMode(page, 'light')
  await page.screenshot({ path: testInfo.outputPath('login-light.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('login-dark.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(/\/dashboard$/)
  await expectMode(page, 'light')
  await page.goto('/upload')
  await page.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures', 'sample-trades.csv'))
  await page.getByRole('button', { name: 'Import 1 Trades', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Import complete', exact: true })).toBeVisible({ timeout: 30_000 })

  for (const mode of ['light', 'dark'] as const) {
    if (mode === 'dark') await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
    for (const route of ['/dashboard', '/trades', '/upload', '/settings/integrity']) {
      await page.goto(route)
      const heading = page.locator('#main-content').getByRole('heading', { level: 1 })
      await expect(heading).toHaveCount(1, { timeout: 30_000 })
      await expect(heading).toBeVisible()
      await expectMode(page, mode)
      await page.screenshot({ path: testInfo.outputPath(`${route.split('/').pop()}-${mode}.png`), animations: 'disabled' })
    }
  }

  // A second tab receives real storage events; the current tab needs no reload.
  const other = await context.newPage()
  await other.goto('/dashboard')
  await expectMode(other, 'dark')
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
  await expectMode(other, 'light')
  await other.close()

  await page.goto('/trades')
  await page.getByRole('link', { name: 'BROS', exact: true }).click()
  const plot = page.getByTestId('price-chart')
  await expect(plot).toHaveAttribute('data-mapped-fill-count', '2')
  await expect(plot.locator('canvas').first()).toBeVisible()
  const canvas = plot.locator('canvas').first()
  const pixel = () => canvas.evaluate(element => Array.from((element as HTMLCanvasElement).getContext('2d')!.getImageData(2, 2, 1, 1).data).slice(0, 3))
  await expect.poll(pixel).toEqual([246, 242, 233])
  const before = { from: await plot.getAttribute('data-range-from'), to: await plot.getAttribute('data-range-to'), requests: marketRequests }
  // Retheme the mounted canvas in place; it must retain its zoom and selected trade.
  await page.mouse.move(650, 450)
  await page.mouse.wheel(0, -500)
  const canvasHandle = await canvas.elementHandle()
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
  await expect.poll(pixel).toEqual([27, 23, 19])
  expect(await canvasHandle!.evaluate(element => element.isConnected)).toBe(true)
  await expect(plot).toHaveAttribute('data-range-from', before.from!)
  await expect(plot).toHaveAttribute('data-range-to', before.to!)
  await expect(page.getByRole('region', { name: 'Selected trade details' })).toContainText('60.25')
  expect(marketRequests).toBe(before.requests)
  await page.screenshot({ path: testInfo.outputPath('chart-dark.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
  await expect.poll(pixel).toEqual([246, 242, 233])
  await page.screenshot({ path: testInfo.outputPath('chart-light.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Search pages and commands', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(246, 242, 233)')
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Switch to dark mode', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
  await expectMode(page, 'dark')
  await page.screenshot({ path: testInfo.outputPath('chart-mobile-dark.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('chart-mobile-light.png'), animations: 'disabled' })
  expect(errors).toEqual([])
})

test('saved light theme applies before hydration and the toggle survives blocked storage', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (new URL(location.href).searchParams.has('blockStorage')) {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError') } })
    } else {
      localStorage.setItem('auratrade-theme', 'light')
    }
  })
  // With client bundles held back, only the inline bootstrap can select light.
  await page.route('**/_next/static/**/*.js', route => route.abort())
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 242, 233)')
  await page.unroute('**/_next/static/**/*.js')
  await page.goto('/login?blockStorage=1')
  await expectMode(page, 'dark')
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
  await expectMode(page, 'light')
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
  await expectMode(page, 'dark')
  expect(errors).toEqual([])
})
