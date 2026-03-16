import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getRequiredSession } from '@/lib/session'
import { calculatePerformanceMetrics } from '@/lib/engine/metrics'
import type { Prisma } from '@/generated/prisma'

function buildWhere(accountId: string, params: URLSearchParams): Prisma.RoundTripTradeWhereInput {
  const where: Prisma.RoundTripTradeWhereInput = {
    accountId,
    isOpen: false,
  }

  const symbol = params.get('symbol')
  if (symbol) where.symbol = { contains: symbol, mode: 'insensitive' }

  // Realized-performance metrics are filtered by close date, not entry date.
  const dateFrom = params.get('dateFrom')
  const dateTo = params.get('dateTo')
  if (dateFrom || dateTo) {
    where.exitTime = {}
    if (dateFrom) where.exitTime.gte = new Date(dateFrom + 'T00:00:00.000Z')
    if (dateTo) where.exitTime.lte = new Date(dateTo + 'T23:59:59.999Z')
  }

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
          select: { id: true, startingBalance: true, name: true },
        })
      : await prisma.tradingAccount.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true, startingBalance: true, name: true },
        })

    if (!account) return NextResponse.json({ error: 'no_account' }, { status: 404 })

    const where = buildWhere(account.id, params)
    const trades = await prisma.roundTripTrade.findMany({
      where,
      select: {
        exitTime: true,
        netPnl: true,
        totalFees: true,
      },
      orderBy: { exitTime: 'asc' },
    })

    const summary = calculatePerformanceMetrics(
      trades
        .filter((trade) => trade.exitTime !== null && trade.netPnl !== null)
        .map((trade) => ({
          exitTime: trade.exitTime as Date,
          netPnl: trade.netPnl!.toNumber(),
          totalFees: trade.totalFees.toNumber(),
        })),
      account.startingBalance.toNumber(),
    )

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        startingBalance: account.startingBalance.toNumber(),
      },
      filters: {
        symbol: params.get('symbol'),
        dateFrom: params.get('dateFrom'),
        dateTo: params.get('dateTo'),
      },
      metrics: summary.metrics,
      dailySeries: summary.dailySeries,
    })
  } catch (err) {
    console.error('[GET /api/metrics]', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'An internal error occurred.' },
      { status: 500 },
    )
  }
}
