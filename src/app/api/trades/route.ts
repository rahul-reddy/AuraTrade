import { NextRequest, NextResponse } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma'
import Papa from 'papaparse'
import { formatDate, formatDuration } from '@/lib/format'
import { getDisplayTradeQuantity } from '@/lib/trades/trade-quantity'

const ALLOWED_SORT = ['entryTime', 'symbol', 'netPnl', 'durationSeconds', 'rMultiple'] as const
type SortField = (typeof ALLOWED_SORT)[number]
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

function parsePageSize(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (Number.isNaN(parsed)) return DEFAULT_PAGE_SIZE
  return Math.min(Math.max(parsed, 25), MAX_PAGE_SIZE)
}

function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (Number.isNaN(parsed)) return 1
  return Math.max(parsed, 1)
}

function buildWhere(
  accountId: string,
  params: URLSearchParams,
): Prisma.RoundTripTradeWhereInput {
  const where: Prisma.RoundTripTradeWhereInput = { accountId }

  const symbol = params.get('symbol')
  if (symbol) where.symbol = { contains: symbol, mode: 'insensitive' }

  const direction = params.get('direction')
  if (direction === 'LONG') where.direction = 'LONG'
  else if (direction === 'SHORT') where.direction = 'SHORT'

  const status = params.get('status')
  if (status === 'open') where.isOpen = true
  else if (status === 'closed') where.isOpen = false

  const setup = params.get('setup')
  if (setup) {
    where.classification = {
      is: {
        setup: { contains: setup, mode: 'insensitive' },
      },
    }
  }

  const dateFrom = params.get('dateFrom')
  const dateTo = params.get('dateTo')
  if (dateFrom || dateTo) {
    where.entryTime = {}
    if (dateFrom) where.entryTime.gte = new Date(dateFrom + 'T00:00:00.000Z')
    if (dateTo) where.entryTime.lte = new Date(dateTo + 'T23:59:59.999Z')
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
  const isExport = params.get('export') === 'true'

  try {
    const requestedAccountId = params.get('accountId')
    const account = requestedAccountId
      ? await prisma.tradingAccount.findFirst({
          where: { id: requestedAccountId, userId },
        })
      : await prisma.tradingAccount.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        })

    if (!account) return NextResponse.json({ error: 'no_account' }, { status: 404 })

    const where = buildWhere(account.id, params)

    const rawSort = params.get('sortBy') ?? 'entryTime'
    const sortBy: SortField = (ALLOWED_SORT as readonly string[]).includes(rawSort)
      ? (rawSort as SortField)
      : 'entryTime'
    const sortDir = params.get('sortDir') === 'asc' ? ('asc' as const) : ('desc' as const)

    // ── CSV export (full result set, no pagination) ──────────────────────
    if (isExport) {
      const trades = await prisma.roundTripTrade.findMany({
        where,
        include: { classification: { select: { setup: true } } },
        orderBy: { [sortBy]: sortDir },
      })

      const rows = trades.map((t) => ({
        Symbol: t.symbol,
        Direction: t.direction,
        'Entry Date': formatDate(t.entryTime),
        'Exit Date': formatDate(t.exitTime),
        'Entry Price': t.entryPrice.toNumber(),
        'Exit Price': t.exitPrice?.toNumber() ?? '',
        Qty: getDisplayTradeQuantity({
          isOpen: t.isOpen,
          totalQty: t.totalQty.toNumber(),
          remainingQty: t.remainingQty.toNumber(),
        }),
        'Gross P&L': t.grossPnl?.toNumber() ?? '',
        'Net P&L': t.netPnl?.toNumber() ?? '',
        Fees: t.totalFees.toNumber(),
        'R-Multiple': t.rMultiple?.toNumber() ?? '',
        'Risk Source': t.riskSource ?? '',
        Duration: formatDuration(t.durationSeconds),
        Status: t.isOpen ? 'Open' : 'Closed',
        Setup: t.classification?.setup ?? '',
        Notes: t.notes ?? '',
      }))

      const csv = Papa.unparse(rows)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="trades-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      })
    }

    // ── Paginated JSON response ──────────────────────────────────────────
    const requestedPage = parsePage(params.get('page'))
    const pageSize = parsePageSize(params.get('pageSize'))

    const [totalCount, closedAgg, winAgg, lossAgg] = await Promise.all([
      prisma.roundTripTrade.count({ where }),
      prisma.roundTripTrade.aggregate({
        where: { ...where, isOpen: false },
        _sum: { netPnl: true, grossPnl: true, totalFees: true },
        _count: { id: true },
      }),
      prisma.roundTripTrade.aggregate({
        where: { ...where, isOpen: false, netPnl: { gt: 0 } },
        _sum: { netPnl: true },
        _count: { id: true },
      }),
      prisma.roundTripTrade.aggregate({
        where: { ...where, isOpen: false, netPnl: { lte: 0 } },
        _sum: { netPnl: true },
        _count: { id: true },
      }),
    ])
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
    const page = Math.min(requestedPage, totalPages)
    const trades = await prisma.roundTripTrade.findMany({
      where,
      include: { classification: { select: { setup: true, confidence: true } } },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    const closedCount = closedAgg._count.id
    const winCount = winAgg._count.id
    const lossCount = lossAgg._count.id
    const grossWins = winAgg._sum.netPnl?.toNumber() ?? 0
    const grossLosses = Math.abs(lossAgg._sum.netPnl?.toNumber() ?? 0)

    return NextResponse.json({
      trades: trades.map((t) => ({
        id: t.id,
        symbol: t.symbol,
        direction: t.direction,
        entryTime: t.entryTime.toISOString(),
        exitTime: t.exitTime?.toISOString() ?? null,
        entryPrice: t.entryPrice.toNumber(),
        exitPrice: t.exitPrice?.toNumber() ?? null,
        totalQty: t.totalQty.toNumber(),
        remainingQty: t.remainingQty.toNumber(),
        grossPnl: t.grossPnl?.toNumber() ?? null,
        netPnl: t.netPnl?.toNumber() ?? null,
        totalFees: t.totalFees.toNumber(),
        rMultiple: t.rMultiple?.toNumber() ?? null,
        riskSource: t.riskSource,
        durationSeconds: t.durationSeconds,
        isOpen: t.isOpen,
        setup: t.classification?.setup ?? null,
      })),
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages,
      },
      summary: {
        totalTrades: totalCount,
        closedTrades: closedCount,
        openPositions: totalCount - closedCount,
        totalNetPnl: closedAgg._sum.netPnl?.toNumber() ?? 0,
        totalFees: closedAgg._sum.totalFees?.toNumber() ?? 0,
        winCount,
        lossCount,
        winRate: closedCount > 0 ? winCount / closedCount : 0,
        profitFactor: grossLosses > 0 ? grossWins / grossLosses : null,
        avgWin: winCount > 0 ? grossWins / winCount : 0,
        avgLoss: lossCount > 0 ? grossLosses / lossCount : 0,
      },
    })
  } catch (err) {
    console.error('[GET /api/trades]', err)
    return NextResponse.json({ error: 'internal_error', message: String(err) }, { status: 500 })
  }
}
