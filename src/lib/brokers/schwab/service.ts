import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'
import { persistBrokerStatementImport } from '@/lib/parser/broker-statement-store'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'
import { evaluateStatementImportSupport } from '@/lib/engine/broker-trade-importer'
import { lockAccountLedger, previewStatementImport, rebuildLedgerTradesForAccount } from '@/lib/engine/account-ledger-rebuild'
import { rebuildDailySnapshotsForAccount } from '@/lib/engine/daily-snapshots'
import { startEnrichment } from '@/lib/engine/trade-enrichment'
import { configuration, hash, seal, unseal } from './crypto'
import { accountsSchema, brokerGet, exchange, SchwabError, tokensSchema } from './client'
import { analyzeApiCsv, transactionsToCsv } from './transactions'

const previewSchema = z.object({ createdAt: z.number(), initialFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), days: z.array(z.object({ day: z.string(), csv: z.string(), fileHash: z.string() })) })
const bindingSchema = z.object({ hashValue: z.string().regex(/^[A-Za-z0-9_-]+$/), label: z.string(), syncFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
// Comma-separated serialization matches the primary schwab-py client:
// https://github.com/alexgolec/schwab-py/blob/master/schwab/client/base.py#L329-L385
const TYPES = 'TRADE,RECEIVE_AND_DELIVER,DIVIDEND_OR_INTEREST,ACH_RECEIPT,ACH_DISBURSEMENT,CASH_RECEIPT,CASH_DISBURSEMENT,ELECTRONIC_FUND,WIRE_OUT,WIRE_IN,JOURNAL,MEMORANDUM,MARGIN_CALL,MONEY_MARKET,SMA_ADJUSTMENT'

// All writers (including refresh, reconnect and disconnect) take this same
// transaction lock. This protects rotating refresh tokens and disconnect races
// across processes; an account ledger lock also coordinates CSV imports.
export async function withConnection<T>(userId: string, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    const key = `schwab:${userId}`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
    return action(tx)
  }, { timeout: 300000, maxWait: 10000 })
}

export async function beginConnection(userId: string) {
  const config = configuration()
  const state = randomBytes(32).toString('base64url')
  await withConnection(userId, async tx => {
    const data = { oauthState: hash(state), oauthExpiresAt: new Date(Date.now() + 600000) }
    await tx.schwabConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data })
  })
  const url = new URL('https://api.schwabapi.com/v1/oauth/authorize')
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callback, response_type: 'code', state }).toString()
  return { url: url.toString(), state }
}

export async function finishConnection(userId: string, state: string, cookie: string | undefined, code: string) {
  if (!state || state !== cookie || !code || code.length > 4096) throw new SchwabError(400, 'Invalid or expired connection request. Start again.')
  await withConnection(userId, async tx => {
    const connection = await tx.schwabConnection.findUnique({ where: { userId } })
    if (!connection || connection.oauthState !== hash(state) || !connection.oauthExpiresAt || connection.oauthExpiresAt.getTime() < Date.now()) throw new SchwabError(400, 'Invalid or expired connection request. Start again.')
    const tokens = await exchange(new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: configuration().callback }))
    const raw = z.array(z.object({ accountNumber: z.string().min(4), hashValue: z.string().regex(/^[A-Za-z0-9_-]+$/) })).min(1).max(100).parse(await brokerGet(tokens.access_token, 'accounts/accountNumbers'))
    const accounts = raw.map(a => ({ hashValue: a.hashValue, label: `Schwab ••••${a.accountNumber.slice(-4)}` }))
    // A reconnect must explicitly select a freshly authorized account again;
    // never silently rebind existing history to a different brokerage account.
    await tx.schwabConnection.update({ where: { userId }, data: {
      tokens: seal(userId, 'tokens', tokens), accounts: seal(userId, 'accounts', accounts),
      oauthState: null, oauthExpiresAt: null, refreshExpiresAt: new Date(Date.now() + 7 * 86400000),
      preview: null, previewHash: null, autoSync: false, message: 'Choose your Schwab account to continue.',
    } })
  })
}

async function accessToken(tx: Prisma.TransactionClient, userId: string) {
  const connection = await tx.schwabConnection.findUnique({ where: { userId } })
  if (!connection?.tokens || !connection.refreshExpiresAt || connection.refreshExpiresAt.getTime() < Date.now()) throw new SchwabError(409, 'Reconnect Schwab to renew account access.')
  let tokens = tokensSchema.parse(unseal(userId, 'tokens', connection.tokens))
  if (tokens.expiresAt < Date.now() + 60000) {
    tokens = await exchange(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }), tokens.refresh_token)
    await tx.schwabConnection.update({ where: { userId }, data: { tokens: seal(userId, 'tokens', tokens) } })
  }
  return tokens.access_token
}

export async function connectionStatus(userId: string) {
  let configured = true
  try { configuration() } catch { configured = false }
  const c = await prisma.schwabConnection.findUnique({ where: { userId } })
  const accounts = c?.accounts ? accountsSchema.parse(unseal(userId, 'accounts', c.accounts)).map((a, index) => ({ index, label: a.label })) : []
  const localAccounts = await prisma.tradingAccount.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } })
  const preview = c?.preview ? previewSchema.parse(unseal(userId, 'preview', c.preview)) : null
  return { configured, connected: !!c?.tokens, needsReconnect: !!c?.tokens && (!c.refreshExpiresAt || c.refreshExpiresAt.getTime() < Date.now()),
    accounts, localAccounts, accountId: c?.accountId, bound: !!c?.binding, autoSync: c?.autoSync ?? false,
    refreshExpiresAt: c?.refreshExpiresAt, lastSyncAt: c?.lastSyncAt, message: c?.message,
    syncFrom: c?.binding ? bindingSchema.parse(unseal(userId, 'binding', c.binding)).syncFrom : undefined,
    preview: preview ? { hash: c!.previewHash, initialFrom: preview.initialFrom, days: preview.days.length, rows: preview.days.reduce((n, d) => n + analyzeApiCsv(d.csv, d.day).totalRows, 0), from: preview.days[0]?.day, to: preview.days.at(-1)?.day,
      transactions: preview.days.flatMap(d => analyzeApiCsv(d.csv, d.day).rows.map(r => ({ day: d.day, action: r.action, symbol: r.symbol, quantity: r.quantity, price: r.price, fees: r.fees }))).slice(0, 500) } : null }
}

export async function bindAccount(userId: string, index: number, accountId: string) {
  await withConnection(userId, async tx => {
    const c = await tx.schwabConnection.findUnique({ where: { userId } })
    const selected = c?.accounts ? accountsSchema.parse(unseal(userId, 'accounts', c.accounts))[index] : null
    if (!c || !selected) throw new SchwabError(400, 'Choose an authorized Schwab account.')
    const account = accountId === '__new__'
      ? await tx.tradingAccount.create({ data: { userId, name: 'Schwab Account', broker: 'Schwab', startingBalance: 0 } })
      : await tx.tradingAccount.findFirst({ where: { id: accountId, userId } })
    if (!account) throw new SchwabError(404, 'Trading account not found.')
    // Binding is permanent until disconnect: account history must never be
    // silently switched to another broker account by a later reconnect.
    if (c.binding && (bindingSchema.parse(unseal(userId, 'binding', c.binding)).hashValue !== selected.hashValue || c.accountId !== accountId)) throw new SchwabError(409, 'Disconnect before changing the account mapping. Keep separate broker accounts in separate AuraTrade accounts.')
    const previous = c.binding ? bindingSchema.parse(unseal(userId, 'binding', c.binding)) : null
    await tx.schwabConnection.update({ where: { userId }, data: { accountId: account.id, binding: seal(userId, 'binding', { ...selected, ...(previous?.syncFrom ? { syncFrom: previous.syncFrom } : {}) }), accounts: null, preview: null, previewHash: null, message: 'Account linked. Fetch a preview before importing.' } })
  })
}

export function completedDays(now: Date, lastSyncAt: Date | null): string[] {
  const today = formatInTimeZone(now, 'America/New_York', 'yyyy-MM-dd')
  const end = new Date(`${today}T00:00:00Z`).getTime() - 86400000
  const gap = lastSyncAt ? Math.ceil((now.getTime() - lastSyncAt.getTime()) / 86400000) + 7 : 59
  const count = Math.min(59, Math.max(7, gap))
  return Array.from({ length: count }, (_, i) => new Date(end - (count - i - 1) * 86400000).toISOString().slice(0, 10))
}

async function collectPreview(tx: Prisma.TransactionClient, userId: string, initialFrom?: string) {
  const c = await tx.schwabConnection.findUniqueOrThrow({ where: { userId } })
  if (!c.binding || !c.accountId || c.accounts) throw new SchwabError(409, 'Select and link your Schwab account first.')
  const window = completedDays(new Date(), c.lastSyncAt)
  // Narrowing is an explicit first-sync choice only. Later syncs must keep the
  // overlap window intact so a custom date cannot conceal a broker correction.
  if (initialFrom && (c.lastSyncAt || !window.includes(initialFrom))) throw new SchwabError(422, 'Choose a completed date within the first-sync window (the past 59 days). A start date cannot change the overlap after a successful sync.')
  const binding = bindingSchema.parse(unseal(userId, 'binding', c.binding))
  // Refresh was committed in a separate, serialized transaction before any
  // source validation. A rejected import must not roll back a rotated token.
  const access = tokensSchema.parse(unseal(userId, 'tokens', c.tokens!)).access_token
  const days: z.infer<typeof previewSchema>['days'] = []
  // One complete trading-date request at a time: below Schwab's request budget,
  // with a strict size/count ceiling instead of assuming truncated data complete.
  const from = initialFrom ?? binding.syncFrom
  for (const day of window.filter(day => !from || day >= from)) {
    const next = new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
    const startDate = fromZonedTime(`${day}T00:00:00`, 'America/New_York').toISOString()
    const endDate = new Date(fromZonedTime(`${next}T00:00:00`, 'America/New_York').getTime() - 1).toISOString()
    const params = new URLSearchParams({ startDate, endDate, types: TYPES })
    const raw = await brokerGet(access, `accounts/${binding.hashValue}/transactions?${params}`)
    let csv: string
    try { csv = transactionsToCsv(raw, day) } catch (error) {
      if (error instanceof SchwabError && error.status === 422) throw new SchwabError(422, `Schwab preview blocked on ${day}. ${error.message}`)
      throw error
    }
    const marker = `Schwab API content SHA-256: ${hash(csv)}`
    const latest = await tx.brokerStatementImport.findFirst({ where: { userId, accountId: c.accountId, sourceFormat: 'SCHWAB_API', fileName: `Schwab API ${day}.csv`, confirmedAt: { not: null } }, orderBy: { createdAt: 'desc' }, select: { assumptions: true } })
    // Compare with the CURRENT snapshot, not any historic matching hash. If the
    // broker changes A → B → A, A is a new observation, not a duplicate of old A.
    // Immutable observations keep createdAt ordering and annotation identities.
    if (!latest?.assumptions.includes(marker)) {
      const fileHash = hash(`schwab-api:${binding.hashValue}:${day}:${csv}:${randomBytes(16).toString('hex')}`)
      days.push({ day, csv, fileHash })
    }
  }
  const preview = { createdAt: Date.now(), ...(initialFrom ? { initialFrom } : {}), days }
  await tx.schwabConnection.update({ where: { userId }, data: { preview: seal(userId, 'preview', preview), previewHash: hash(JSON.stringify(preview)), lastAttemptAt: new Date(), message: 'Preview ready. Review and confirm before changing your trades.' } })
}

async function applyPreview(tx: Prisma.TransactionClient, userId: string, expectedHash: string, autoSync: boolean, background = false) {
  const c = await tx.schwabConnection.findUniqueOrThrow({ where: { userId } })
  if (!c.preview || !c.accountId || c.previewHash !== expectedHash) throw new SchwabError(409, 'Preview changed. Fetch and review it again.')
  const preview = previewSchema.parse(unseal(userId, 'preview', c.preview))
  if (Date.now() - preview.createdAt > 30 * 60000) throw new SchwabError(409, 'Preview expired. Fetch it again.')
  const account = await tx.tradingAccount.findFirst({ where: { id: c.accountId, userId } })
  if (!account) throw new SchwabError(404, 'Trading account not found.')
  await lockAccountLedger(tx, account.id)
  let changed = false
  for (const day of preview.days) {
    const dryRun = analyzeApiCsv(day.csv, day.day)
    dryRun.assumptions.push(`Schwab API content SHA-256: ${hash(day.csv)}`)
    const previousApiDay = await tx.brokerStatementImport.findFirst({ where: { userId, accountId: account.id, sourceFormat: 'SCHWAB_API', fileName: `Schwab API ${day.day}.csv`, confirmedAt: { not: null }, fileHash: { not: day.fileHash } }, select: { id: true } })
    if (previousApiDay && (background || dryRun.totalRows === 0)) throw new SchwabError(422, 'Schwab revised a previously synced day. Automatic sync is paused; review the correction against a broker CSV before continuing.')
    if (dryRun.totalRows === 0) {
      // An empty broker response cannot erase a previously imported day. A
      // cancellation/reversal requires a CSV review rather than silent removal.
      continue
    }
    const support = evaluateStatementImportSupport(dryRun)
    if (!support.supported) throw new SchwabError(422, 'These transactions require a CSV review. No trades were changed.')
    const { statementImportId } = await persistBrokerStatementImport(tx, { userId, accountId: account.id, fileHash: day.fileHash, fileName: `Schwab API ${day.day}.csv`, dryRun, ledger: buildBrokerPositionLedger(dryRun.rows) })
    const statement = await tx.brokerStatementImport.findFirstOrThrow({ where: { id: statementImportId, userId, accountId: account.id } })
    const impact = await previewStatementImport(tx, account.id, { id: statement.id, createdAt: statement.createdAt, sourceFormat: dryRun.sourceFormat, coverageFrom: dryRun.coverage!.from, coverageTo: dryRun.coverage!.to, rows: dryRun.rows })
    if (impact.warnings.length > 0) throw new SchwabError(422, 'The account ledger has unresolved positions. Import earlier CSV history and review this batch again.')
    await tx.brokerStatementImport.update({ where: { id: statement.id, userId }, data: { confirmedAt: new Date() } })
    changed = true
  }
  if (changed) {
    await rebuildLedgerTradesForAccount(tx, account.id)
    await rebuildDailySnapshotsForAccount(tx, account.id, account.startingBalance.toNumber())
  }
  // Persist the owner's reviewed first-sync boundary only on confirmation, so
  // later overlap does not silently backfill the explicitly excluded history.
  const binding = preview.initialFrom && c.binding && !c.lastSyncAt
    ? seal(userId, 'binding', { ...bindingSchema.parse(unseal(userId, 'binding', c.binding)), syncFrom: preview.initialFrom }) : undefined
  await tx.schwabConnection.update({ where: { userId }, data: { ...(binding ? { binding } : {}), preview: null, previewHash: null, lastSyncAt: new Date(), lastAttemptAt: new Date(), autoSync, message: changed ? 'Sync complete. Transactions reconciled with uploaded statements.' : 'Sync complete. No new supported trades.' } })
  return { accountId: account.id, changed }
}

export async function syncAction(userId: string, action: 'preview' | 'confirm' | 'disconnect' | 'pause', previewHash?: string, autoSync = false, initialFrom?: string) {
  if (action === 'preview') await withConnection(userId, tx => accessToken(tx, userId))
  const result = await withConnection(userId, async tx => {
    if (action === 'disconnect') { await tx.schwabConnection.deleteMany({ where: { userId } }); return }
    if (action === 'pause') { await tx.schwabConnection.updateMany({ where: { userId }, data: { autoSync: false } }); return }
    if (action === 'preview') await collectPreview(tx, userId, initialFrom)
    else return applyPreview(tx, userId, previewHash ?? '', autoSync)
  })
  // A ledger rebuild invalidates derived contexts/classifications. Start the
  // existing pipeline only after commit, never against uncommitted trade IDs.
  if (result?.changed) startEnrichment(result.accountId, prisma)
}

export async function runDailySync() {
  const now = new Date()
  if (Number(formatInTimeZone(now, 'America/New_York', 'HH')) < 6) return
  const today = fromZonedTime(`${formatInTimeZone(now, 'America/New_York', 'yyyy-MM-dd')}T00:00:00`, 'America/New_York')
  const connections = await prisma.schwabConnection.findMany({ where: { autoSync: true, OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: today } }] }, select: { userId: true } })
  for (const { userId } of connections) {
    try {
      await withConnection(userId, tx => accessToken(tx, userId))
      const result = await withConnection(userId, async tx => {
        const c = await tx.schwabConnection.findUnique({ where: { userId } })
        if (!c?.autoSync || (c.lastAttemptAt && c.lastAttemptAt >= today)) return
        await collectPreview(tx, userId)
        const preview = await tx.schwabConnection.findUniqueOrThrow({ where: { userId } })
        return applyPreview(tx, userId, preview.previewHash!, true, true)
      })
      if (result?.changed) startEnrichment(result.accountId, prisma)
    } catch {
      // Fail closed; no private upstream diagnostics. Preserve last successful
      // sync watermark and stop automatic imports until a person reviews.
      await withConnection(userId, async tx => {
        await tx.schwabConnection.updateMany({ where: { userId, autoSync: true }, data: { autoSync: false, lastAttemptAt: new Date(), message: 'Automatic sync paused. Reconnect if needed, then fetch and review a fresh preview.' } })
      }).catch(() => {})
    }
  }
}
