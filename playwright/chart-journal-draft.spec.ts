import { expect, test } from '@playwright/test'

test('chart journals load on demand and retain drafts across inspector changes', async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/market-data?**', route => route.fulfill({ json: {
    candles: [{ time: '2022-02-07T00:00:00Z', open: 60, high: 64, low: 59, close: 63, volume: 1000000 }],
    effectiveTimeframe: '1d', source: 'cache', fallbackMessage: null,
  } }))
  await page.goto('/register')
  const email = `playwright-chart-draft-${Date.now()}@example.com`
  await page.getByLabel('Name', { exact: true }).fill('Chart draft review')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.waitForURL(/\/login\?registered=1$/)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(/\/dashboard$/)

  const csv = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n' +
    '02/07/2022,Buy,BROS,Synthetic,10,$60.00,$0.00,($600.00)\n' +
    '02/07/2022,Sell,BROS,Synthetic,10,$61.00,$0.04,$609.96\n' +
    '02/08/2022,Buy,BROS,Synthetic,10,$62.00,$0.00,($620.00)\n' +
    '02/08/2022,Sell,BROS,Synthetic,10,$63.00,$0.04,$629.96\n'
  await page.goto('/upload')
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-journal-drafts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByRole('button', { name: 'Import 2 Trades', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Import complete', exact: true })).toBeVisible({ timeout: 30000 })
  const payload = await (await page.request.get('/api/trades')).json()
  const firstId = payload.trades[0].id as string
  const secondId = payload.trades[1].id as string
  const reads: string[] = []
  let failLoads = true
  await page.route('**/api/journal?**', async route => {
    reads.push(new URL(route.request().url()).searchParams.get('tradeId')!)
    if (failLoads) await route.fulfill({ status: 503, json: { message: 'Synthetic journal load failure.' } })
    else await route.continue()
  })
  const chartHref = `/chart/BROS?tradeId=${firstId}`
  await page.goto(chartHref)
  const inspector = page.getByRole('complementary', { name: 'Trade inspector', exact: true })
  const editor = page.getByRole('form', { name: 'Trade journal', exact: true })
  await expect(inspector).toBeVisible()
  await page.getByRole('button', { name: 'Hide trade inspector', exact: true }).click()
  await expect(inspector).not.toBeVisible()
  await page.getByRole('button', { name: 'Show trade inspector', exact: true }).click()
  await expect(inspector).toBeVisible()
  const unselectedTrade = inspector.getByLabel('Trade list', { exact: true }).locator('button[aria-pressed="false"]')
  await unselectedTrade.click()
  await unselectedTrade.click()
  expect(reads).toEqual([])

  await page.getByRole('button', { name: 'Journal', exact: true }).click()
  await expect(inspector.getByRole('alert')).toContainText('Synthetic journal load failure.')
  failLoads = false
  await page.getByRole('button', { name: 'Retry journal', exact: true }).click()
  const thesis = editor.getByRole('textbox', { name: 'Trade thesis', exact: true })
  await thesis.fill('Preserve my unsaved decision notes.')
  const loadedReads = reads.length
  await page.getByRole('button', { name: 'Details', exact: true }).click()
  await page.getByRole('button', { name: 'Journal', exact: true }).click()
  await expect(thesis).toHaveValue('Preserve my unsaved decision notes.')
  await page.getByRole('button', { name: 'Hide trade inspector', exact: true }).click()
  await expect(editor).not.toBeVisible()
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('link', { name: 'Trades', exact: true }).click()
  await expect(page).toHaveURL(/\/chart\/BROS/)
  await page.getByRole('button', { name: 'Show trade inspector', exact: true }).click()
  await expect(thesis).toHaveValue('Preserve my unsaved decision notes.')
  expect(reads).toHaveLength(loadedReads)

  const otherTrade = inspector.getByLabel('Trade list', { exact: true }).locator('button[aria-pressed="false"]')
  page.once('dialog', dialog => dialog.dismiss())
  await otherTrade.click()
  await expect(thesis).toHaveValue('Preserve my unsaved decision notes.')
  expect(reads).not.toContain(secondId)
  await editor.getByRole('button', { name: 'Save journal', exact: true }).click()
  await expect(editor.getByRole('status', { name: 'Journal save status', exact: true })).toContainText('Journal saved')
  await otherTrade.click()
  await expect(thesis).toHaveValue('')
  expect(reads).toContain(secondId)
  await thesis.fill('Discard only after confirmation.')
  page.once('dialog', dialog => dialog.accept())
  await otherTrade.click()
  await expect(thesis).toHaveValue('Preserve my unsaved decision notes.')
  const saved = await (await page.request.get(`/api/journal?tradeId=${firstId}`)).json()
  expect(saved.thesis).toBe('Preserve my unsaved decision notes.')
  const discarded = await (await page.request.get(`/api/journal?tradeId=${secondId}`)).json()
  expect(discarded.thesis).toBe('')

  // Direct review links must still open the journal without an extra click.
  await page.goto(chartHref + '&journal=1')
  await expect(thesis).toHaveValue('Preserve my unsaved decision notes.')
  expect(errors).toEqual([])
})
