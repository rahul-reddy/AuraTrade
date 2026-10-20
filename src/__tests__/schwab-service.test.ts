jest.mock('@/lib/prisma', () => ({ prisma: { $transaction: jest.fn(), schwabConnection: { findUnique: jest.fn(), findMany: jest.fn() }, tradingAccount: { findMany: jest.fn() } } }))
jest.mock('@/lib/brokers/schwab/client', () => {
  const actual = jest.requireActual('@/lib/brokers/schwab/client')
  return { ...actual, exchange: jest.fn(), brokerGet: jest.fn() }
})
jest.mock('@/lib/engine/trade-enrichment', () => ({ startEnrichment: jest.fn() }))
jest.mock('@/lib/parser/broker-statement-store', () => ({ persistBrokerStatementImport: jest.fn() }))
jest.mock('@/lib/engine/daily-snapshots', () => ({ rebuildDailySnapshotsForAccount: jest.fn() }))
jest.mock('@/lib/engine/account-ledger-rebuild', () => {
  const actual = jest.requireActual('@/lib/engine/account-ledger-rebuild')
  return { ...actual, previewStatementImport: jest.fn(), rebuildLedgerTradesForAccount: jest.fn() }
})
import { prisma } from '@/lib/prisma'
import { beginConnection, bindAccount, completedDays, connectionStatus, finishConnection, runDailySync, syncAction } from '@/lib/brokers/schwab/service'
import { Prisma } from '@/generated/prisma'
import { hash, seal, unseal } from '@/lib/brokers/schwab/crypto'
import { transactionsToCsv } from '@/lib/brokers/schwab/transactions'
import { startEnrichment } from '@/lib/engine/trade-enrichment'
import { persistBrokerStatementImport } from '@/lib/parser/broker-statement-store'
import { previewStatementImport } from '@/lib/engine/account-ledger-rebuild'
import { brokerGet, exchange } from '@/lib/brokers/schwab/client'

const findUnique = jest.fn()
const update = jest.fn()
const tx = { $executeRaw: jest.fn(), schwabConnection: { findUnique, findUniqueOrThrow: findUnique, upsert: jest.fn(), update, deleteMany: jest.fn(), updateMany: jest.fn() }, tradingAccount: { findFirst: jest.fn() }, brokerStatementImport: { findFirst: jest.fn(), findFirstOrThrow: jest.fn(), update: jest.fn() } }

beforeEach(() => {
  jest.clearAllMocks()
  update.mockReset()
  jest.mocked(startEnrichment).mockReset()
  jest.mocked(brokerGet).mockReset()
  process.env.SCHWAB_TOKEN_KEY = 'ab'.repeat(32)
  process.env.SCHWAB_CLIENT_ID = 'synthetic-client'; process.env.SCHWAB_CLIENT_SECRET = 'synthetic-secret'
  jest.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => (callback as (db: unknown) => Promise<unknown>)(tx) as never)
})

test('authorization URL binds a hashed one-use nonce to the signed-in user', async () => {
  const result = await beginConnection('owner')
  expect(new URL(result.url).searchParams.get('state')).toBe(result.state)
  expect(tx.schwabConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner' }, create: expect.objectContaining({ userId: 'owner', oauthState: hash(result.state) }) }))
})
test('callback rejects missing cookie, mismatched state, replay and expired state before exchanging credentials', async () => {
  await expect(finishConnection('owner', 'state', undefined, 'code')).rejects.toThrow()
  findUnique.mockResolvedValue({ oauthState: hash('other'), oauthExpiresAt: new Date(Date.now() + 60000) })
  await expect(finishConnection('owner', 'state', 'state', 'code')).rejects.toThrow()
  findUnique.mockResolvedValue({ oauthState: null, oauthExpiresAt: new Date(Date.now() + 60000) })
  await expect(finishConnection('owner', 'state', 'state', 'code')).rejects.toThrow()
  findUnique.mockResolvedValue({ oauthState: hash('state'), oauthExpiresAt: new Date(0) })
  await expect(finishConnection('owner', 'state', 'state', 'code')).rejects.toThrow()
  expect(exchange).not.toHaveBeenCalled()
})
test('successful callback encrypts tokens and account identifiers and consumes the state', async () => {
  findUnique.mockResolvedValue({ oauthState: hash('state'), oauthExpiresAt: new Date(Date.now() + 60000) })
  jest.mocked(exchange).mockResolvedValue({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expiresAt: Date.now() + 1800000 })
  jest.mocked(brokerGet).mockResolvedValue([{ accountNumber: 'TEST-ACCOUNT', hashValue: 'synthetic-account-hash' }])
  await finishConnection('owner', 'state', 'state', 'synthetic-code')
  const data = update.mock.calls[0][0].data
  expect(data.oauthState).toBeNull()
  expect(data.autoSync).toBe(false)
  expect(JSON.stringify(data)).not.toContain('synthetic-access')
  expect(JSON.stringify(data)).not.toContain('TEST-ACCOUNT')
  expect(JSON.stringify(data)).not.toContain('synthetic-account-hash')
})
test('a source validation failure occurs after refreshed credentials have been committed separately', async () => {
  const c = { userId: 'owner', accountId: 'local', binding: seal('owner', 'binding', { hashValue: 'synthetic-hash', label: 'Synthetic' }), accounts: null,
    tokens: seal('owner', 'tokens', { access_token: 'expired', refresh_token: 'synthetic-refresh', expiresAt: 0 }), refreshExpiresAt: new Date(Date.now() + 86400000), lastSyncAt: null }
  findUnique.mockResolvedValue(c)
  jest.mocked(exchange).mockResolvedValue({ access_token: 'new-access', refresh_token: 'new-refresh', expiresAt: Date.now() + 1800000 })
  jest.mocked(brokerGet).mockResolvedValue([{ unsupported: true }])
  await expect(syncAction('owner', 'preview')).rejects.toThrow()
  expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  expect(update).toHaveBeenCalledTimes(1)
  expect(update.mock.calls[0][0].data).toHaveProperty('tokens')
})
test('account selection rejects another user account and prevents remapping linked history', async () => {
  const selected = { hashValue: 'synthetic-hash', label: 'Synthetic account' }
  findUnique.mockResolvedValue({ accounts: seal('owner', 'accounts', [selected]) })
  tx.tradingAccount.findFirst.mockResolvedValue(null)
  await expect(bindAccount('owner', 0, 'foreign')).rejects.toThrow('not found')
  expect(tx.tradingAccount.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', userId: 'owner' } })
  findUnique.mockResolvedValue({ accounts: seal('owner', 'accounts', [selected]), binding: seal('owner', 'binding', { ...selected, hashValue: 'different' }), accountId: 'local' })
  tx.tradingAccount.findFirst.mockResolvedValue({ id: 'local' })
  await expect(bindAccount('owner', 0, 'local')).rejects.toThrow('Disconnect')
  expect(update).not.toHaveBeenCalled()
  expect(startEnrichment).not.toHaveBeenCalled()
})
test('confirm rejects changed and expired previews before any ledger writes', async () => {
  findUnique.mockResolvedValue({ preview: 'cipher', accountId: 'local', previewHash: 'new' })
  await expect(syncAction('owner', 'confirm', 'old')).rejects.toThrow('changed')
  findUnique.mockResolvedValue({ preview: seal('owner', 'preview', { createdAt: 0, days: [] }), accountId: 'local', previewHash: 'new' })
  await expect(syncAction('owner', 'confirm', 'new')).rejects.toThrow('expired')
  expect(update).not.toHaveBeenCalled()
})
test('disconnect deletes only the requesting user connection', async () => {
  await syncAction('owner', 'disconnect')
  expect(tx.schwabConnection.deleteMany).toHaveBeenCalledWith({ where: { userId: 'owner' } })
})
test('status uses an explicit safe response instead of serializing connection secrets', async () => {
  jest.mocked(prisma.schwabConnection.findUnique).mockResolvedValue({ tokens: 'never-return', binding: 'private', accounts: null, preview: null, userId: 'owner', refreshExpiresAt: new Date(Date.now() + 60000) } as never)
  jest.mocked(prisma.tradingAccount.findMany).mockResolvedValue([])
  expect(JSON.stringify(await connectionStatus('owner'))).not.toContain('never-return')
  expect(prisma.tradingAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner' } }))
})
test('completed date windows exclude today in New York and retain overlap across DST', () => {
  const first = completedDays(new Date('2026-11-02T03:00:00Z'), null)
  expect(first).toHaveLength(59)
  expect(first.at(-1)).toBe('2026-10-31')
  const daily = completedDays(new Date('2026-11-03T12:00:00Z'), new Date('2026-11-02T12:00:00Z'))
  expect(daily).toHaveLength(8)
  expect(daily.at(-1)).toBe('2026-11-02')
})
test('daily worker waits until morning and checks the persisted attempt before importing twice', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-20T08:00:00Z'))
  try {
    await runDailySync()
    expect(prisma.schwabConnection.findMany).not.toHaveBeenCalled()
    jest.setSystemTime(new Date('2026-10-20T12:00:00Z'))
    const c = { userId: 'owner', accountId: 'local', autoSync: true, lastAttemptAt: null, lastSyncAt: new Date('2026-10-19T12:00:00Z'),
      accounts: null, binding: seal('owner', 'binding', { hashValue: 'synthetic-hash', label: 'Synthetic' }),
      tokens: seal('owner', 'tokens', { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expiresAt: Date.now() + 1800000 }),
      refreshExpiresAt: new Date(Date.now() + 86400000) }
    findUnique.mockResolvedValue(c)
    update.mockImplementation(async ({ data }: { data: object }) => Object.assign(c, data))
    jest.mocked(prisma.schwabConnection.findMany).mockResolvedValue([{ userId: 'owner' }] as never)
    tx.tradingAccount.findFirst.mockResolvedValue({ id: 'local', startingBalance: new Prisma.Decimal(0) })
    tx.brokerStatementImport.findFirst.mockResolvedValue(null)
    jest.mocked(brokerGet).mockResolvedValue([])
    await runDailySync()
    expect(brokerGet).toHaveBeenCalledTimes(8)
    expect(startEnrichment).not.toHaveBeenCalled()
    expect(c.lastSyncAt).toEqual(new Date())
    await runDailySync()
    expect(brokerGet).toHaveBeenCalledTimes(8)
  } finally { jest.useRealTimers() }
})
test('confirmed ledger changes start technical enrichment only after commit; rejected batches never start it', async () => {
  const day = '2026-10-19'
  const csv = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n10/19/2026,Buy,SYN,Synthetic,1,100,0,-100'
  const c = { userId: 'owner', accountId: 'local', previewHash: 'reviewed', preview: seal('owner', 'preview', { createdAt: Date.now(), days: [{ day, csv, fileHash: 'synthetic-hash' }] }) }
  findUnique.mockResolvedValue(c)
  tx.tradingAccount.findFirst.mockResolvedValue({ id: 'local', startingBalance: new Prisma.Decimal(0) })
  tx.brokerStatementImport.findFirst.mockResolvedValue(null)
  tx.brokerStatementImport.findFirstOrThrow.mockResolvedValue({ id: 'statement', createdAt: new Date() })
  jest.mocked(persistBrokerStatementImport).mockResolvedValue({ statementImportId: 'statement' })
  jest.mocked(previewStatementImport).mockResolvedValue({ warnings: [] } as never)
  let committed = false
  jest.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => {
    const result = await (callback as (db: unknown) => Promise<unknown>)(tx)
    committed = true
    return result as never
  })
  jest.mocked(startEnrichment).mockImplementation(() => { expect(committed).toBe(true) })
  await syncAction('owner', 'confirm', 'reviewed')
  expect(startEnrichment).toHaveBeenCalledWith('local', prisma)
  jest.mocked(startEnrichment).mockClear()
  jest.mocked(previewStatementImport).mockResolvedValue({ warnings: ['Missing earlier history'] } as never)
  await expect(syncAction('owner', 'confirm', 'reviewed')).rejects.toThrow('unresolved')
  expect(startEnrichment).not.toHaveBeenCalled()
})
test('unchanged days skip against the current observation, but a broker A → B → A revision is not lost as an old duplicate', async () => {
  const rawForDay = (day: string) => [{ activityId: 1, type: 'TRADE', status: 'VALID', time: `${day}T14:30:00Z`, tradeDate: `${day}T04:00:00Z`, netAmount: -100,
    transferItems: [{ instrument: { assetType: 'CURRENCY', symbol: 'CURRENCY_USD' }, amount: 0, cost: 0, feeType: 'COMMISSION' }, { instrument: { assetType: 'EQUITY', symbol: 'SYN' }, amount: 1, cost: -100, price: 100, positionEffect: 'OPENING' }] }]
  const c = { userId: 'owner', accountId: 'local', accounts: null, binding: seal('owner', 'binding', { hashValue: 'synthetic-hash', label: 'Synthetic' }),
    lastSyncAt: new Date(Date.now() - 86400000), refreshExpiresAt: new Date(Date.now() + 86400000), tokens: seal('owner', 'tokens', { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expiresAt: Date.now() + 1800000 }) }
  findUnique.mockResolvedValue(c)
  update.mockImplementation(async ({ data }: { data: object }) => Object.assign(c, data))
  jest.mocked(brokerGet).mockImplementation(async (_access, path) => rawForDay(new URLSearchParams(path.split('?')[1]).get('startDate')!.slice(0, 10)))
  tx.brokerStatementImport.findFirst.mockImplementation(async ({ where }: { where: { fileName: string } }) => {
    const day = where.fileName.slice(11, 21)
    return { assumptions: [`Schwab API content SHA-256: ${hash(transactionsToCsv(rawForDay(day), day))}`] }
  })
  await syncAction('owner', 'preview')
  const unchanged = unseal('owner', 'preview', update.mock.calls.at(-1)![0].data.preview) as { days: unknown[] }
  expect(unchanged.days).toHaveLength(0)
  tx.brokerStatementImport.findFirst.mockResolvedValue({ assumptions: ['Schwab API content SHA-256: current-version-B'] })
  await syncAction('owner', 'preview')
  const reverted = unseal('owner', 'preview', update.mock.calls.at(-1)![0].data.preview) as { days: unknown[] }
  expect(reverted.days.length).toBeGreaterThan(0)
  expect(tx.brokerStatementImport.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' }, where: expect.objectContaining({ userId: 'owner', sourceFormat: 'SCHWAB_API' }) }))
})
