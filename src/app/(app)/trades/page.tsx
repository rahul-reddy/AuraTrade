import Link from 'next/link'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma'
import { TradesFilters } from '@/components/trades/TradesFilters'
import { TradesTable } from '@/components/trades/TradesTable'
import { formatCurrency } from '@/lib/format'

// ─── Types ───────────────────────────────────────────────────────────────────

type SearchParams = Record<string, string | string[] | undefined>

function str(params: SearchParams, key: string): string | undefined {
  const v = params[key]
  return typeof v === 'string' && v ? v : undefined
}

const ALLOWED_SORT = ['entryTime', 'symbol', 'netPnl', 'durationSeconds', 'rMultiple'] as const
type SortField = (typeof ALLOWED_SORT)[number]

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildWhere(
  accountId: string,
  p: SearchParams,
): Prisma.RoundTripTradeWhereInput {
  const where: Prisma.RoundTripTradeWhereInput = { accountId }

  const symbol = str(p, 'symbol')
  if (symbol) where.symbol = { contains: symbol, mode: 'insensitive' }

  const direction = str(p, 'direction')
  if (direction === 'LONG') where.direction = 'LONG'
  else if (direction === 'SHORT') where.direction = 'SHORT'

  const status = str(p, 'status')
  if (status === 'open') where.isOpen = true
  else if (status === 'closed') where.isOpen = false

  const setup = str(p, 'setup')
  if (setup) {
    where.classification = {
      is: {
        setup: { contains: setup, mode: 'insensitive' },
      },
    }
  }

  const dateFrom = str(p, 'dateFrom')
  const dateTo = str(p, 'dateTo')
  if (dateFrom || dateTo) {
    where.entryTime = {}
    if (dateFrom) where.entryTime.gte = new Date(dateFrom + 'T00:00:00.000Z')
    if (dateTo) where.entryTime.lte = new Date(dateTo + 'T23:59:59.999Z')
  }

  return where
}

function parsePageSize(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (Number.isNaN(parsed)) return DEFAULT_PAGE_SIZE
  return Math.min(Math.max(parsed, 25), MAX_PAGE_SIZE)
}

function parsePage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (Number.isNaN(parsed)) return 1
  return Math.max(parsed, 1)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await getRequiredSession()
  const userId = session.user.id
  const params = await searchParams

  const requestedAccountId = str(params, 'accountId')
  const account = requestedAccountId
    ? await prisma.tradingAccount.findFirst({
        where: { id: requestedAccountId, userId },
      })
    : await prisma.tradingAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      })

  if (!account) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-3">
            {requestedAccountId ? 'Trading account not found.' : 'No trading account found.'}
          </p>
          {requestedAccountId ? (
            <Link href="/trades" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
              View your available accounts →
            </Link>
          ) : (
            <Link href="/upload" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
              Upload a CSV to get started →
            </Link>
          )}
        </div>
      </div>
    )
  }

  const rawSort = str(params, 'sortBy') ?? 'entryTime'
  const sortBy: SortField = (ALLOWED_SORT as readonly string[]).includes(rawSort)
    ? (rawSort as SortField)
    : 'entryTime'
  const sortDir = str(params, 'sortDir') === 'asc' ? ('asc' as const) : ('desc' as const)
  const requestedPage = parsePage(str(params, 'page'))
  const pageSize = parsePageSize(str(params, 'pageSize'))

  const where = buildWhere(account.id, params)

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
  const totalNetPnl = closedAgg._sum.netPnl?.toNumber() ?? 0
  const totalFees = closedAgg._sum.totalFees?.toNumber() ?? 0
  const winRate = closedCount > 0 ? winCount / closedCount : 0
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : null
  const avgWin = winCount > 0 ? grossWins / winCount : 0
  const avgLoss = lossCount > 0 ? grossLosses / lossCount : 0

  const filterKey = [
    account.id,
    str(params, 'symbol') ?? '',
    str(params, 'direction') ?? '',
    str(params, 'status') ?? '',
    str(params, 'setup') ?? '',
    str(params, 'dateFrom') ?? '',
    str(params, 'dateTo') ?? '',
    str(params, 'pageSize') ?? String(pageSize),
  ].join('|')

  const hasFilters = !!(
    str(params, 'symbol') ||
    str(params, 'direction') ||
    str(params, 'status') ||
    str(params, 'setup') ||
    str(params, 'dateFrom') ||
    str(params, 'dateTo')
  )

  return (
    <div className="text-white">
      <div className="px-8 py-6 max-w-[1600px]">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Trade History</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {account.name}
            {totalCount > 0 && (
              <>
                {' · '}
                <span className="text-zinc-400">{totalCount.toLocaleString()} trades</span>
                {closedCount !== totalCount && (
                  <span className="text-green-500 ml-2 text-xs font-mono">
                    {totalCount - closedCount} open
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          <SummaryCard
            label="Net P&L"
            value={formatCurrency(totalNetPnl)}
            valueClass={totalNetPnl >= 0 ? 'text-green-400' : 'text-red-400'}
          />
          <SummaryCard
            label="Win Rate"
            value={closedCount > 0 ? `${(winRate * 100).toFixed(1)}%` : '—'}
            sub={closedCount > 0 ? `${winCount}W / ${lossCount}L` : undefined}
          />
          <SummaryCard
            label="Profit Factor"
            value={profitFactor != null ? profitFactor.toFixed(2) : closedCount > 0 ? '∞' : '—'}
            valueClass={
              profitFactor != null && profitFactor >= 1.5
                ? 'text-green-400'
                : profitFactor != null && profitFactor < 1
                ? 'text-red-400'
                : undefined
            }
          />
          <SummaryCard
            label="Avg Win"
            value={avgWin > 0 ? formatCurrency(avgWin) : '—'}
            valueClass="text-green-400"
          />
          <SummaryCard
            label="Avg Loss"
            value={avgLoss > 0 ? formatCurrency(-avgLoss) : '—'}
            valueClass="text-red-400"
          />
          <SummaryCard
            label="Total Fees"
            value={totalFees > 0 ? formatCurrency(totalFees, { signed: false }) : '—'}
          />
        </div>

        {/* Filters */}
        <TradesFilters
          key={filterKey}
          filterKey={filterKey}
          accountId={account.id}
          initialSymbol={str(params, 'symbol')}
          initialDirection={str(params, 'direction')}
          initialStatus={str(params, 'status')}
          initialSetup={str(params, 'setup')}
          initialDateFrom={str(params, 'dateFrom')}
          initialDateTo={str(params, 'dateTo')}
          initialPageSize={pageSize}
        />

        {/* Table or empty state */}
        {trades.length === 0 ? (
          <div className="border border-zinc-800 rounded-lg p-16 text-center">
            <p className="text-zinc-400 text-base mb-2">
              {hasFilters ? 'No trades match your filters.' : 'No trades yet.'}
            </p>
            <p className="text-zinc-600 text-sm">
              {hasFilters ? (
                <Link
                  href={`/trades?accountId=${account.id}`}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Clear all filters
                </Link>
              ) : (
                <>
                  <Link href="/upload" className="text-blue-400 hover:text-blue-300 transition-colors">
                    Upload a CSV
                  </Link>{' '}
                  to populate your trade history.
                </>
              )}
            </p>
          </div>
        ) : (
          <TradesTable
            trades={trades}
            totalCount={totalCount}
            totalPages={totalPages}
            query={{
              accountId: account.id,
              symbol: str(params, 'symbol'),
              direction: str(params, 'direction'),
              status: str(params, 'status'),
              setup: str(params, 'setup'),
              dateFrom: str(params, 'dateFrom'),
              dateTo: str(params, 'dateTo'),
              sortBy,
              sortDir,
              page,
              pageSize,
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  valueClass,
  sub,
}: {
  label: string
  value: string
  valueClass?: string
  sub?: string
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <p className={`text-lg font-semibold font-mono leading-none ${valueClass ?? 'text-zinc-100'}`}>
        {value}
      </p>
      {sub && <p className="text-zinc-600 text-xs font-mono mt-1">{sub}</p>}
    </div>
  )
}
