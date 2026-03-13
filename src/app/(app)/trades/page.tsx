import Link from 'next/link'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TradesFilters } from '@/components/trades/TradesFilters'
import { formatCurrency, formatDate, formatDuration, formatPrice } from '@/lib/format'

// ─── Types ───────────────────────────────────────────────────────────────────

type SearchParams = Record<string, string | string[] | undefined>

function str(params: SearchParams, key: string): string | undefined {
  const v = params[key]
  return typeof v === 'string' && v ? v : undefined
}

const ALLOWED_SORT = ['entryTime', 'symbol', 'netPnl', 'durationSeconds', 'rMultiple'] as const
type SortField = (typeof ALLOWED_SORT)[number]

const PAGE_SIZE = 50

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

  const dateFrom = str(p, 'dateFrom')
  const dateTo = str(p, 'dateTo')
  if (dateFrom || dateTo) {
    where.entryTime = {}
    if (dateFrom) where.entryTime.gte = new Date(dateFrom + 'T00:00:00.000Z')
    if (dateTo) where.entryTime.lte = new Date(dateTo + 'T23:59:59.999Z')
  }

  return where
}

function sortableLink(
  field: SortField,
  label: string,
  currentSortBy: SortField,
  currentSortDir: 'asc' | 'desc',
  params: SearchParams,
  className?: string,
) {
  const newDir =
    currentSortBy === field && currentSortDir === 'desc' ? 'asc' : 'desc'
  const sp = new URLSearchParams()
  const s = (k: string) => str(params, k)
  if (s('symbol')) sp.set('symbol', s('symbol')!)
  if (s('direction')) sp.set('direction', s('direction')!)
  if (s('status')) sp.set('status', s('status')!)
  if (s('dateFrom')) sp.set('dateFrom', s('dateFrom')!)
  if (s('dateTo')) sp.set('dateTo', s('dateTo')!)
  sp.set('sortBy', field)
  sp.set('sortDir', newDir)

  const arrow =
    currentSortBy === field ? (currentSortDir === 'asc' ? ' ↑' : ' ↓') : ''
  const isActive = currentSortBy === field

  return (
    <Link
      href={`/trades?${sp.toString()}`}
      className={`flex items-center gap-0.5 hover:text-zinc-200 transition-colors ${isActive ? 'text-blue-400' : ''} ${className ?? ''}`}
    >
      {label}
      {arrow && <span className="text-xs">{arrow}</span>}
      {!arrow && <span className="text-zinc-700 text-xs ml-0.5">↕</span>}
    </Link>
  )
}

function pageLink(targetPage: number, params: SearchParams) {
  const sp = new URLSearchParams()
  const s = (k: string) => str(params, k)
  if (s('symbol')) sp.set('symbol', s('symbol')!)
  if (s('direction')) sp.set('direction', s('direction')!)
  if (s('status')) sp.set('status', s('status')!)
  if (s('dateFrom')) sp.set('dateFrom', s('dateFrom')!)
  if (s('dateTo')) sp.set('dateTo', s('dateTo')!)
  if (s('sortBy')) sp.set('sortBy', s('sortBy')!)
  if (s('sortDir')) sp.set('sortDir', s('sortDir')!)
  sp.set('page', String(targetPage))
  return `/trades?${sp.toString()}`
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

  const account = await prisma.tradingAccount.findFirst({ where: { userId } })
  if (!account) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-3">No trading account found.</p>
          <Link href="/upload" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
            Upload a CSV to get started →
          </Link>
        </div>
      </div>
    )
  }

  const rawSort = str(params, 'sortBy') ?? 'entryTime'
  const sortBy: SortField = (ALLOWED_SORT as readonly string[]).includes(rawSort)
    ? (rawSort as SortField)
    : 'entryTime'
  const sortDir = str(params, 'sortDir') === 'asc' ? ('asc' as const) : ('desc' as const)
  const page = Math.max(1, parseInt(str(params, 'page') ?? '1', 10))

  const where = buildWhere(account.id, params)

  const [trades, totalCount, closedAgg, winAgg, lossAgg] = await Promise.all([
    prisma.roundTripTrade.findMany({
      where,
      include: { classification: { select: { setup: true, confidence: true } } },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
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

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
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
    str(params, 'symbol') ?? '',
    str(params, 'direction') ?? '',
    str(params, 'status') ?? '',
    str(params, 'dateFrom') ?? '',
    str(params, 'dateTo') ?? '',
  ].join('|')

  const hasFilters = !!(
    str(params, 'symbol') ||
    str(params, 'direction') ||
    str(params, 'status') ||
    str(params, 'dateFrom') ||
    str(params, 'dateTo')
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Top bar */}
      <div className="border-b border-zinc-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-xs">A</span>
            </div>
            <span className="text-white font-semibold text-sm">AuraTrade</span>
          </div>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-200 transition-colors">
              Dashboard
            </Link>
            <Link href="/trades" className="text-white font-medium">
              Trades
            </Link>
            <Link href="/upload" className="text-zinc-400 hover:text-zinc-200 transition-colors">
              Upload
            </Link>
          </nav>
        </div>
        <span className="text-zinc-500 text-sm">{session.user.email}</span>
      </div>

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
          initialSymbol={str(params, 'symbol')}
          initialDirection={str(params, 'direction')}
          initialStatus={str(params, 'status')}
          initialDateFrom={str(params, 'dateFrom')}
          initialDateTo={str(params, 'dateTo')}
        />

        {/* Table or empty state */}
        {trades.length === 0 ? (
          <div className="border border-zinc-800 rounded-lg p-16 text-center">
            <p className="text-zinc-400 text-base mb-2">
              {hasFilters ? 'No trades match your filters.' : 'No trades yet.'}
            </p>
            <p className="text-zinc-600 text-sm">
              {hasFilters ? (
                <Link href="/trades" className="text-blue-400 hover:text-blue-300 transition-colors">
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
          <>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900/60">
                    <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider w-[90px]">
                      {sortableLink('symbol', 'Symbol', sortBy, sortDir, params)}
                    </TableHead>
                    <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider w-[52px]">
                      Dir
                    </TableHead>
                    <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                      {sortableLink('entryTime', 'Entry', sortBy, sortDir, params)}
                    </TableHead>
                    <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                      Exit
                    </TableHead>
                    <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                      Entry $
                    </TableHead>
                    <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                      Exit $
                    </TableHead>
                    <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                      Qty
                    </TableHead>
                    <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                      {sortableLink('netPnl', 'Net P&L', sortBy, sortDir, params, 'justify-end')}
                    </TableHead>
                    <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                      {sortableLink('rMultiple', 'R', sortBy, sortDir, params, 'justify-end')}
                    </TableHead>
                    <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                      {sortableLink('durationSeconds', 'Duration', sortBy, sortDir, params, 'justify-end')}
                    </TableHead>
                    <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                      Setup
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map((trade) => {
                    const pnl = trade.netPnl?.toNumber() ?? null
                    const pnlPositive = pnl != null && pnl > 0
                    const pnlNegative = pnl != null && pnl < 0

                    return (
                      <TableRow
                        key={trade.id}
                        className="border-zinc-800 hover:bg-zinc-900/40 transition-colors"
                      >
                        {/* Symbol */}
                        <TableCell className="py-2.5">
                          <Link
                            href={`/chart/${trade.symbol}`}
                            className="font-mono font-semibold text-sm text-zinc-100 hover:text-blue-400 transition-colors"
                          >
                            {trade.symbol}
                          </Link>
                        </TableCell>

                        {/* Direction */}
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className={
                              trade.direction === 'LONG'
                                ? 'border-blue-500/40 text-blue-400 bg-blue-500/10 hover:bg-blue-500/10 text-xs px-1.5 py-0'
                                : 'border-amber-500/40 text-amber-400 bg-amber-500/10 hover:bg-amber-500/10 text-xs px-1.5 py-0'
                            }
                          >
                            {trade.direction === 'LONG' ? 'L' : 'S'}
                          </Badge>
                        </TableCell>

                        {/* Entry date */}
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-300">
                          {formatDate(trade.entryTime)}
                        </TableCell>

                        {/* Exit date */}
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-300">
                          {trade.isOpen ? (
                            <Badge
                              variant="outline"
                              className="border-green-500/40 text-green-400 bg-green-500/10 hover:bg-green-500/10 text-xs px-1.5 py-0"
                            >
                              Open
                            </Badge>
                          ) : (
                            formatDate(trade.exitTime)
                          )}
                        </TableCell>

                        {/* Entry price */}
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-300 text-right">
                          ${formatPrice(trade.entryPrice.toNumber())}
                        </TableCell>

                        {/* Exit price */}
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-400 text-right">
                          {trade.exitPrice ? `$${formatPrice(trade.exitPrice.toNumber())}` : '—'}
                        </TableCell>

                        {/* Qty */}
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-300 text-right">
                          {trade.totalQty.toNumber().toLocaleString()}
                        </TableCell>

                        {/* Net P&L */}
                        <TableCell className="py-2.5 font-mono text-sm font-semibold text-right">
                          <span
                            className={
                              pnlPositive
                                ? 'text-green-400'
                                : pnlNegative
                                ? 'text-red-400'
                                : 'text-zinc-500'
                            }
                          >
                            {formatCurrency(pnl)}
                          </span>
                        </TableCell>

                        {/* R-Multiple */}
                        <TableCell className="py-2.5 font-mono text-sm text-right">
                          {trade.rMultiple != null ? (
                            <span
                              className={
                                trade.rMultiple.toNumber() >= 0
                                  ? 'text-zinc-200'
                                  : 'text-zinc-400'
                              }
                            >
                              {trade.rMultiple.toNumber().toFixed(2)}R
                              {trade.riskSource === 'ATR' && (
                                <span className="text-zinc-600 text-[10px] ml-0.5">est.</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </TableCell>

                        {/* Duration */}
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-400 text-right">
                          {formatDuration(trade.durationSeconds)}
                        </TableCell>

                        {/* Setup */}
                        <TableCell className="py-2.5">
                          {trade.classification ? (
                            <Badge
                              variant="outline"
                              className="border-zinc-700 text-zinc-400 text-xs px-1.5 py-0"
                            >
                              {trade.classification.setup}
                            </Badge>
                          ) : (
                            <span className="text-zinc-700 text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-zinc-500 text-sm">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount).toLocaleString()} of{' '}
                  {totalCount.toLocaleString()} trades
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 && (
                    <Link
                      href={pageLink(page - 1, params)}
                      className="h-8 px-3 flex items-center text-sm rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                    >
                      ← Prev
                    </Link>
                  )}
                  <span className="text-zinc-500 text-sm px-1">
                    {page} / {totalPages}
                  </span>
                  {page < totalPages && (
                    <Link
                      href={pageLink(page + 1, params)}
                      className="h-8 px-3 flex items-center text-sm rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                    >
                      Next →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
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
