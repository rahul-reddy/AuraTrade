import { readFile } from 'node:fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { operationalSignals, type HealthView } from '@/lib/journal/health'
import { JournalError } from '@/lib/journal/contracts'
import { journalResponseError } from '@/lib/journal/http'

export async function GET(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    const requested = request.nextUrl.searchParams.get('accountId')
    const account = await prisma.tradingAccount.findFirst({ where: { userId: session.user.id, ...(requested ? { id: requested } : {}) }, orderBy: { createdAt: 'asc' }, select: { id: true } })
    if (!account) throw new JournalError(404, 'not_found', 'Trading account not found.')
    const now = new Date()
    const ownership = { accountId: account.id, account: { userId: session.user.id } }
    const [failedImports, stuckImports, symbols] = await Promise.all([
      prisma.upload.count({ where: { ...ownership, status: 'FAILED', createdAt: { gte: new Date(now.getTime() - 7 * 86400000) } } }),
      prisma.upload.count({ where: { ...ownership, status: 'PROCESSING', createdAt: { lt: new Date(now.getTime() - 30 * 60000) } } }),
      prisma.roundTripTrade.findMany({ where: { ...ownership, instrumentType: 'EQUITY' }, distinct: ['symbol'], select: { symbol: true } }),
    ])
    // Market caches are shared public prices. Only symbols from this user's
    // account are examined; fetchedAt measures retrieval age, not market latency.
    const cache = symbols.length ? await prisma.marketDataCache.groupBy({ by: ['symbol'], where: { symbol: { in: symbols.map(row => row.symbol) }, timeframe: '1d' }, _max: { fetchedAt: true } }) : []
    const missingSymbols = symbols.filter(row => !cache.some(item => item.symbol === row.symbol)).map(row => row.symbol)
    const staleSymbols = cache.filter(row => !row._max.fetchedAt || now.getTime() - row._max.fetchedAt.getTime() > 48 * 3600000).map(row => row.symbol)
    let evidence: unknown = null
    if (process.env.AURATRADE_HEALTH_FILE) {
      try { evidence = JSON.parse(await readFile(process.env.AURATRADE_HEALTH_FILE, 'utf8')) as unknown } catch { /* Missing/corrupt evidence is unknown, never green. */ }
    }
    const result: HealthView = { ...operationalSignals(evidence, now.getTime()), failedImports, stuckImports, cachedSymbols: cache.length, missingSymbols, staleSymbols, checkedAt: now.toISOString() }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return journalResponseError(error) }
}
