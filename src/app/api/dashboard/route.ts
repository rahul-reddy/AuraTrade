import { NextRequest, NextResponse } from 'next/server'
import { exitTradingDayRangeWhere, tradingDayKey } from '@/lib/trades/trading-date'
import { prisma } from '@/lib/prisma'
import { getRequiredSession } from '@/lib/session'
import { calculatePerformanceMetrics } from '@/lib/engine/metrics'
import { buildDashboardInsights } from '@/lib/dashboard/dashboard-data'
import { getSectorInfo } from '@/lib/dashboard/sector-classification'
import type { DashboardPayload, DashboardTradePoint } from '@/lib/dashboard/types'
import type { Prisma } from '@/generated/prisma'

function buildWhere(accountId: string, params: URLSearchParams): Prisma.RoundTripTradeWhereInput {
  const where: Prisma.RoundTripTradeWhereInput = {
    accountId,
    isOpen: false,
  }

  // Filter by the exit trading day, not the raw exit instant (see trading-date.ts).
  const dayRange = exitTradingDayRangeWhere(params.get('dateFrom'), params.get('dateTo'))
  if (dayRange) where.AND = [dayRange]

  return where
}

export async function GET(req: NextRequest) {
  let session
  try {
    session = await getRequiredSession()
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }

  const userId = session.user.id
  const params = new URL(req.url).searchParams

  try {
    const requestedAccountId = params.get('accountId')
    const account = requestedAccountId
      ? await prisma.tradingAccount.findFirst({
          where: { id: requestedAccountId, userId },
          select: { id: true, name: true, startingBalance: true },
        })
      : await prisma.tradingAccount.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, startingBalance: true },
        })

    if (!account) return NextResponse.json({ error: 'no_account' }, { status: 404 })

    const trades = await prisma.roundTripTrade.findMany({
      where: buildWhere(account.id, params),
      select: {
        id: true,
        symbol: true,
        exitTime: true,
        exitTradingDate: true,
        netPnl: true,
        totalQty: true,
        entryPrice: true,
        durationSeconds: true,
        totalFees: true,
      },
      orderBy: { exitTime: 'asc' },
    })

    const symbols = Array.from(new Set(trades.map((trade) => trade.symbol)))
    const sectorEntries = await Promise.all(
      symbols.map(async (symbol) => [symbol, await getSectorInfo(symbol)] as const),
    )
    const sectorBySymbol = new Map(sectorEntries)

    const tradePoints: DashboardTradePoint[] = trades
      .filter((trade) => trade.exitTime !== null && trade.netPnl !== null)
      .map((trade) => {
        const sectorInfo = sectorBySymbol.get(trade.symbol) ?? { sector: null, industry: null }
        return {
          id: trade.id,
          symbol: trade.symbol,
          exitTime: (trade.exitTime as Date).toISOString(),
          exitDate: tradingDayKey(trade.exitTradingDate, trade.exitTime as Date),
          netPnl: trade.netPnl!.toNumber(),
          totalQty: trade.totalQty.toNumber(),
          entryPrice: trade.entryPrice.toNumber(),
          durationSeconds: trade.durationSeconds,
          sector: sectorInfo.sector,
          industry: sectorInfo.industry,
        }
      })

    const summary = calculatePerformanceMetrics(
      trades
        .filter((trade) => trade.exitTime !== null && trade.netPnl !== null)
        .map((trade) => ({
          exitTime: (trade.exitTime as Date).toISOString(),
          exitTradingDate: trade.exitTradingDate,
          netPnl: trade.netPnl!.toNumber(),
          totalFees: trade.totalFees.toNumber(),
        })),
      account.startingBalance.toNumber(),
    )

    const payload: DashboardPayload = {
      account: {
        id: account.id,
        name: account.name,
        startingBalance: account.startingBalance.toNumber(),
      },
      filters: {
        dateFrom: params.get('dateFrom'),
        dateTo: params.get('dateTo'),
      },
      metrics: summary.metrics,
      dailySeries: summary.dailySeries,
      insights: buildDashboardInsights({
        trades: tradePoints,
        dailySeries: summary.dailySeries,
        metrics: summary.metrics,
        startingBalance: account.startingBalance.toNumber(),
      }),
    }

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[GET /api/dashboard]', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'An internal error occurred.' },
      { status: 500 },
    )
  }
}
