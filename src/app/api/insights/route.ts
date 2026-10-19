import { NextRequest, NextResponse } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { JournalError } from '@/lib/journal/contracts'
import { journalResponseError } from '@/lib/journal/http'
import type { InsightTrade } from '@/lib/journal/insights'

export async function GET(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
    const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: session.user.id }, select: { id: true } })
    if (!account) throw new JournalError(404, 'not_found', 'Trading account not found.')
    const rows = await prisma.roundTripTrade.findMany({ where: { accountId, account: { userId: session.user.id } },
      include: { classification: true, context: true, journal: { select: { setup: true, planAdherence: true, mistakes: true, reviewedAt: true, playbookLink: { select: { playbook: { select: { id: true, name: true } } } } } } }, orderBy: { exitTime: 'desc' } })
    const trades: InsightTrade[] = rows.map(trade => ({
      id: trade.id, symbol: trade.symbol, direction: trade.direction, entryTime: trade.entryTime.toISOString(), exitTime: trade.exitTime?.toISOString() ?? null,
      exitTradingDate: trade.exitTradingDate?.toISOString() ?? null, isOpen: trade.isOpen, netPnl: trade.netPnl?.toNumber() ?? null, totalFees: trade.totalFees.toNumber(),
      inferredSetup: trade.classification?.setup ?? null, personalSetup: trade.journal?.setup || null, regime: trade.context?.marketRegime ?? null,
      adherence: trade.journal?.planAdherence ?? 'UNASSESSED', mistakes: trade.journal?.mistakes ?? [], reviewed: trade.journal?.reviewedAt != null,
      playbook: trade.journal?.playbookLink?.playbook.name ?? null, playbookId: trade.journal?.playbookLink?.playbook.id ?? null,
    }))
    return NextResponse.json({ trades }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return journalResponseError(error) }
}
