import path from 'node:path'
import { expect, test } from '@playwright/test'

/** Synthetic market context only: 1 OHLCV bar per weekday, including the warm-up
 * period requested by the chart. No real statements or subscription credentials. */
function history(from: string, to: string) {
  const result = []
  let index = 0
  for (let time = Date.parse(from.slice(0,10)); time <= Date.parse(to.slice(0,10)); time += 86400000) {
    const date = new Date(time)
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue
    const open = 48 + index * .06 + Math.sin(index / 8) * 3
    const close = open + Math.sin(index * 1.7) * .8
    result.push({time:date.toISOString(),open,close,high:Math.max(open,close) + .7,low:Math.min(open,close) - .8,volume:Math.round(900000 + (Math.sin(index) + 1) * 500000)})
    index++
  }
  return result
}

test('one-year trade review has real candle annotations, stable zoom, working controls and a useful inspector', async ({ page }, testInfo) => {
  test.setTimeout(120000)
  await page.setViewportSize({width:1600,height:1050})
  const errors: string[] = []
  page.on('pageerror',error=>errors.push(error.message))
  let failNext = false
  let requests = 0
  await page.route('**/api/market-data?**', async route => {
    const params = new URL(route.request().url()).searchParams
    requests++
    if (failNext) {failNext=false;await route.fulfill({status:503,json:{error:'synthetic-unavailable'}});return}
    await route.fulfill({json:{candles:history(params.get('from')!, params.get('to')!),effectiveTimeframe:'1d',source:'finviz',fallbackMessage:params.get('timeframe') === '1d' ? null : 'Intraday data not available for this date range. Showing daily.'}})
  })
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
  const email = `playwright-chart-review-${unique}@example.com`
  await page.goto('/register')
  await page.getByLabel('Name', {exact:true}).fill('Chart Review')
  await page.getByLabel('Email', {exact:true}).fill(email)
  await page.getByLabel('Password', {exact:true}).fill('playwright-pass-123')
  await page.getByRole('button',{name:'Create account',exact:true}).click()
  await page.waitForURL(/\/login\?registered=1$/)
  await page.getByLabel('Email', {exact:true}).fill(email)
  await page.getByLabel('Password', {exact:true}).fill('playwright-pass-123')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  await page.waitForURL(/\/dashboard$/)
  await page.goto('/upload')
  await page.locator('input[type=file]').setInputFiles(path.join(__dirname,'fixtures','sample-trades.csv'))
  await page.getByRole('button',{name:'Import 1 Trades',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Import complete',exact:true})).toBeVisible({timeout:30000})
  await page.goto('/trades')
  await page.getByRole('link',{name:'BROS',exact:true}).click()
  const plot = page.getByTestId('price-chart')
  await expect(plot).toHaveAttribute('data-mapped-fill-count','2')
  await expect(plot).toHaveAttribute('data-marker-count','2')
  await expect(plot).toHaveAttribute('data-timeframe','1d')
  await expect(page.getByRole('button',{name:'1Y',exact:true})).toHaveAttribute('aria-pressed','true')
  const from = (await plot.getAttribute('data-range-from'))!
  const to = (await plot.getAttribute('data-range-to'))!
  expect(Date.parse(to)-Date.parse(from)).toBeGreaterThanOrEqual(365*86400000)
  expect(Number(await plot.getAttribute('data-candle-count'))).toBeGreaterThan(240)
  expect(await plot.locator('canvas').count()).toBeGreaterThanOrEqual(6)
  await expect(page.getByRole('region',{name:'Selected trade details'})).toContainText('60.25')
  await expect(page.getByRole('region',{name:'Selected trade details'})).toContainText('62.25')
  await page.mouse.move(650,450)
  const count = requests
  await page.mouse.wheel(0,-600)
  // Previously this triggered an automatic intraday switch after 700ms.
  await page.waitForTimeout(1000)
  expect(requests).toBe(count)
  await expect(plot).toHaveAttribute('data-timeframe','1d')
  await page.screenshot({path:testInfo.outputPath('one-year-annotated-desktop.png'),animations:'disabled'})

  await page.getByRole('button',{name:'Focus trade',exact:true}).click()
  await expect.poll(async()=>Date.parse((await plot.getAttribute('data-range-to'))!)-Date.parse((await plot.getAttribute('data-range-from'))!)).toBeLessThan(90*86400000)
  await expect(plot).toHaveAttribute('data-mapped-fill-count','2')
  await page.getByRole('button',{name:'1Y',exact:true}).click()
  await expect.poll(async()=>Date.parse((await plot.getAttribute('data-range-to'))!)-Date.parse((await plot.getAttribute('data-range-from'))!)).toBeGreaterThanOrEqual(365*86400000)
  await page.getByText('Display',{exact:true}).click()
  await page.getByLabel('Trade annotations',{exact:true}).uncheck()
  await expect(plot).toHaveAttribute('data-marker-count','0')
  await page.getByLabel('Trade annotations',{exact:true}).check()
  await expect(plot).toHaveAttribute('data-marker-count','2')
  const fullPaneCanvasCount = await plot.locator('canvas').count()
  await page.getByLabel('RSI pane',{exact:true}).uncheck()
  await expect.poll(async()=>plot.locator('canvas').count()).toBeLessThan(fullPaneCanvasCount)
  await page.getByLabel('RSI pane',{exact:true}).check()
  await expect.poll(async()=>plot.locator('canvas').count()).toBe(fullPaneCanvasCount)
  await page.getByText('Display',{exact:true}).click()

  await page.getByRole('button',{name:'Clear selected trade',exact:true}).click()
  await expect(page.getByText('See the trade behind the marker.',{exact:true})).toBeVisible()
  await page.getByText('Chart annotations (2)',{exact:true}).click()
  await page.getByRole('button',{name:/Inspect entry marker/}).click()
  await expect(page.getByRole('region',{name:'Selected trade details'})).toContainText('60.25')
  await page.getByText('Chart annotations (2)',{exact:true}).click()

  failNext = true
  const previous = await plot.getAttribute('data-range-from')
  await page.getByRole('button',{name:'3M',exact:true}).click()
  await expect(plot.getByRole('alert')).toContainText('previous chart is preserved')
  await expect(plot).toHaveAttribute('data-range-from',previous!)
  await page.getByRole('button',{name:'Retry',exact:true}).click()
  await expect(plot.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'3M',exact:true})).toHaveAttribute('aria-pressed','true')
  const threeMonthStart = await plot.getAttribute('data-range-from')
  await page.getByRole('button',{name:'1D',exact:true}).click()
  await expect(plot).toHaveAttribute('data-range-from',threeMonthStart!)
  await expect(page.getByRole('button',{name:'3M',exact:true})).toHaveAttribute('aria-pressed','true')

  await page.getByRole('button',{name:'1H',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Showing daily')
  await expect(plot).toHaveAttribute('data-timeframe','1d')
  await expect(page.getByRole('button',{name:'1D',exact:true})).toHaveAttribute('aria-pressed','true')

  await page.getByRole('button',{name:'Expand chart',exact:true}).click()
  await expect(page.getByRole('button',{name:'Exit expanded chart',exact:true})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button',{name:'Expand chart',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Hide trade inspector',exact:true}).click()
  await expect(page.getByRole('complementary',{name:'Trade inspector'})).toHaveCount(0)
  await page.getByRole('button',{name:'Show trade inspector',exact:true}).click()
  await expect(page.getByRole('complementary',{name:'Trade inspector'})).toBeVisible()

  await page.getByRole('button',{name:'1Y',exact:true}).click()
  await page.setViewportSize({width:390,height:844})
  await expect(page.locator('.app-sidebar')).toHaveCSS('width','60px')
  await expect.poll(()=>page.locator('#main-content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  await expect.poll(async () => {
    const chartBox = await plot.boundingBox()
    const inspectorBox = await page.getByRole('complementary',{name:'Trade inspector'}).boundingBox()
    return !!chartBox && !!inspectorBox && inspectorBox.y >= chartBox.y + chartBox.height - 1
  }).toBe(true)
  await page.screenshot({path:testInfo.outputPath('annotated-chart-mobile.png'),animations:'disabled'})
  await page.setViewportSize({width:1600,height:1050})
  await page.getByRole('textbox',{name:'Jump to symbol',exact:true}).fill('AAPL')
  await page.getByRole('button',{name:'Open symbol chart',exact:true}).click()
  await expect(page).toHaveURL(/\/chart\/AAPL\?/)
  // Next can retain a streamed route copy outside the active workspace.
  const heading = page.locator('#main-content').getByRole('heading',{name:'AAPL',exact:true})
  await expect(heading).toHaveCount(1)
  await expect(heading).toBeVisible()
  await expect(page.getByTestId('price-chart')).toHaveAttribute('data-marker-count','0')
  expect(errors).toEqual([])
})
