import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function registerAndSignIn(page: Page) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `playwright-concurrent-${unique}@example.com`
  const password = 'playwright-pass-123'

  await page.goto('/register')
  await page.getByLabel('Name').fill(`Playwright Concurrent ${unique}`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await page.waitForURL(/\/login\?registered=1$/, { timeout: 15_000 })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 })
}

function fixtureFile(name: string) {
  return {
    name,
    mimeType: 'text/csv',
    buffer: fs.readFileSync(path.join(process.cwd(), 'playwright', 'fixtures', name)),
  }
}

test('two statements confirmed at the same moment each land exactly once', async ({ page }) => {
  test.setTimeout(120_000)
  await registerAndSignIn(page)

  // Non-overlapping statements: TOSA (closed) + TOSB (open), and TOSC (open).
  const files = [fixtureFile('sample-tos-account-statement.csv'), fixtureFile('tos-carry-in-open.csv')]

  const uploadIds: string[] = []
  for (const file of files) {
    const preview = await page.request.post('/api/upload', { multipart: { file } })
    expect(preview.ok()).toBe(true)
    const body = (await preview.json()) as { uploadId: string | null; summary: { canImport: boolean } }
    expect(body.summary.canImport).toBe(true)
    expect(body.uploadId).toBeTruthy()
    uploadIds.push(body.uploadId as string)
  }

  // Fire both confirmations concurrently. Each rebuilds the account ledger;
  // without serialization one could rebuild from a snapshot missing the other.
  const confirms = await Promise.all(
    uploadIds.map((id, index) =>
      page.request.post(`/api/upload/${id}/confirm`, { multipart: { file: files[index] } }),
    ),
  )
  for (const confirm of confirms) {
    expect(confirm.status()).toBe(200)
  }

  const response = await page.request.get('/api/trades?pageSize=100')
  expect(response.ok()).toBe(true)
  const { trades } = (await response.json()) as {
    trades: Array<{ symbol: string; isOpen: boolean }>
  }
  const bySymbol = (symbol: string) => trades.filter((trade) => trade.symbol === symbol)
  expect(trades).toHaveLength(3)
  expect(bySymbol('TOSA')).toEqual([expect.objectContaining({ isOpen: false })])
  expect(bySymbol('TOSB')).toEqual([expect.objectContaining({ isOpen: true })])
  expect(bySymbol('TOSC')).toEqual([expect.objectContaining({ isOpen: true })])
})
