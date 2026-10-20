import { expect, test, type Page } from '@playwright/test'
import { PrismaClient } from '../src/generated/prisma'
import { seal, hash } from '../src/lib/brokers/schwab/crypto'
import { config } from 'dotenv'

// Only synthetic connection records. Tests never call Schwab or use real tokens.
config({ path: '.env.local', quiet: true }); config({ path: '.env', quiet: true })
async function register(page: Page) {
  const email = `playwright-schwab-${Date.now()}@example.com`
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill('Schwab Test')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.waitForURL(/\/login\?registered=1$/)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(/\/dashboard$/)
  return email
}
const csv = (day: string, rows: string) => `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n${rows.replaceAll('DAY', `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}`)}`

test('Schwab preview, transactional confirm, ownership, retry, concurrent requests and disconnect work in both themes', async ({ page, browser }, testInfo) => {
  test.setTimeout(180000)
  // DB access is solely for synthetic fixture setup. Require an explicitly
  // supplied test database, never infer or write to the developer/live database.
  expect(process.env.SCHWAB_TEST_DATABASE_URL, 'Supply an isolated test DB URL').toBeTruthy()
  const testDb = new URL(process.env.SCHWAB_TEST_DATABASE_URL!)
  if (!['localhost', '127.0.0.1'].includes(testDb.hostname) || !/_(test|ci)$/.test(testDb.pathname)) throw new Error('Schwab browser fixtures require a local database ending in _test or _ci.')
  const db = new PrismaClient({ datasourceUrl: process.env.SCHWAB_TEST_DATABASE_URL! })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const email = await register(page)
  const user = await db.user.findUniqueOrThrow({ where: { email } })
  const account = await db.tradingAccount.create({ data: { userId: user.id, name: 'Synthetic Schwab', startingBalance: 0 } })
  async function preview(days: { day: string; csv: string }[]) {
    const data = { createdAt: Date.now(), days: days.map(d => ({ ...d, fileHash: hash(`synthetic:${d.day}:${d.csv}`) })) }
    const previewHash = hash(JSON.stringify(data))
    await db.schwabConnection.upsert({ where: { userId: user.id }, create: {
      userId: user.id, accountId: account.id, binding: seal(user.id, 'binding', { hashValue: 'synthetic-hash', label: 'Synthetic account' }),
      tokens: seal(user.id, 'tokens', { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expiresAt: Date.now() + 600000 }),
      refreshExpiresAt: new Date(Date.now() + 86400000), preview: seal(user.id, 'preview', data), previewHash,
    }, update: { preview: seal(user.id, 'preview', data), previewHash } })
    return previewHash
  }
  try {
    const initialHash = await preview([{ day: '2026-10-19', csv: csv('2026-10-19', 'DAY,Buy,SYN,Synthetic buy,10,100,0,-1000\nDAY,Sell,SYN,Synthetic sell,10,110,0.17,1099.83') }])
    await page.goto('/settings/connections')
    const main = page.locator('#main-content')
    await expect(main.getByRole('heading', { name: 'Sync preview', exact: true })).toBeVisible()
    await main.getByText('Inspect transactions and broker fees', { exact: true }).click()
    await expect(main.getByRole('table')).toContainText('0.17')
    await page.getByRole('button', { name: 'Hide P&L and balances', exact: true }).click()
    await expect(main.getByRole('table')).not.toContainText('0.17')
    await page.getByRole('button', { name: 'Show P&L and balances', exact: true }).click()
    await page.route('**/api/brokers/schwab', async route => {
      if (route.request().method() === 'POST') await route.fulfill({ status: 503, json: { message: 'Synthetic temporary failure. Retry.' } })
      else await route.continue()
    }, { times: 1 })
    await main.getByRole('button', { name: 'Confirm sync', exact: true }).click()
    await expect(main.getByRole('alert')).toContainText('Synthetic temporary failure')
    await expect(main.getByRole('button', { name: 'Confirm sync', exact: true })).toBeEnabled()
    await main.getByRole('button', { name: 'Confirm sync', exact: true }).click()
    await expect(main.getByRole('status').filter({ hasText: 'Sync complete' })).toBeVisible()
    const trade = await db.roundTripTrade.findFirstOrThrow({ where: { accountId: account.id } })
    expect(trade.netPnl?.toString()).toBe('99.83')
    expect((await page.request.post('/api/brokers/schwab', { data: { action: 'confirm', hash: initialHash, autoSync: false } })).status()).toBe(409)
    expect((await page.request.post('/api/brokers/schwab', { headers: { origin: 'https://untrusted.example' }, data: { action: 'disconnect' } })).status()).toBe(403)
    const outsider = await browser.newContext()
    const signedOut = await outsider.request.get(`${new URL(page.url()).origin}/api/brokers/schwab`, { maxRedirects: 0 })
    expect([401, 307]).toContain(signedOut.status())
    if (signedOut.status() === 307) expect(signedOut.headers().location).toContain('/login')
    await outsider.close()

    // A later invalid day rolls back even earlier valid days in the same batch.
    const badHash = await preview([
      { day: '2026-10-20', csv: csv('2026-10-20', 'DAY,Buy,AAA,Synthetic open,1,10,0,-10') },
      { day: '2026-10-21', csv: csv('2026-10-21', 'DAY,Sell,BBB,Synthetic unmatched close,1,10,0,10') },
    ])
    expect((await page.request.post('/api/brokers/schwab', { data: { action: 'confirm', hash: badHash, autoSync: false } })).status()).toBe(422)
    expect(await db.brokerStatementImport.count({ where: { userId: user.id } })).toBe(1)
    expect(await db.roundTripTrade.count({ where: { accountId: account.id } })).toBe(1)
    expect((await db.schwabConnection.findUniqueOrThrow({ where: { userId: user.id } })).previewHash).toBe(badHash)

    const nextHash = await preview([{ day: '2026-10-20', csv: csv('2026-10-20', 'DAY,Buy,AAA,Synthetic open,1,10,0,-10') }])
    const responses = await Promise.all([1, 2].map(() => page.request.post('/api/brokers/schwab', { data: { action: 'confirm', hash: nextHash, autoSync: false } })))
    expect(responses.map(r => r.status()).sort()).toEqual([200, 409])
    expect(await db.roundTripTrade.count({ where: { accountId: account.id } })).toBe(2)
    await page.reload()
    await expect(main.getByRole('button', { name: 'Fetch sync preview', exact: true })).toBeVisible()
    await expect(page.locator('a[aria-current="page"]')).toHaveCount(1)
    for (const theme of ['light', 'dark']) {
      await page.evaluate(mode => { localStorage.setItem('auratrade-theme', mode); document.documentElement.dataset.theme = mode; document.documentElement.classList.toggle('dark', mode === 'dark'); window.dispatchEvent(new Event('auratrade-theme-change')) }, theme)
      await page.setViewportSize({ width: theme === 'light' ? 1440 : 390, height: 1000 })
      if (theme === 'dark') await expect.poll(() => page.locator('aside.app-sidebar').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(60)
      await expect(main.getByRole('heading', { name: 'Connect Schwab', exact: true })).toBeVisible()
      await expect(main.getByRole('button', { name: 'Fetch sync preview', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await testInfo.attach(`schwab-${theme}`, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
    }
    await main.getByRole('button', { name: 'Disconnect', exact: true }).click()
    await main.getByRole('button', { name: 'Confirm disconnect', exact: true }).click()
    await expect(main.getByText('Not connected', { exact: true })).toBeVisible()
    expect(await db.schwabConnection.count({ where: { userId: user.id } })).toBe(0)
    expect(await db.roundTripTrade.count({ where: { accountId: account.id } })).toBe(2)
    expect(errors).toEqual([])
  } finally {
    await db.user.delete({ where: { id: user.id } })
    await db.$disconnect()
  }
})
