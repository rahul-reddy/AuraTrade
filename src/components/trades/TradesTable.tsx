import Link from 'next/link'
import type { Prisma } from '@/generated/prisma'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate, formatDuration, formatPrice } from '@/lib/format'
import { getDisplayTradeQuantity } from '@/lib/trades/trade-quantity'

type SortField = 'entryTime' | 'symbol' | 'netPnl' | 'durationSeconds' | 'rMultiple'

type TradeRow = Prisma.RoundTripTradeGetPayload<{
  include: { classification: { select: { setup: true, confidence: true } } }
}>

interface TradesQueryState {
  accountId: string
  symbol?: string
  direction?: string
  status?: string
  setup?: string
  dateFrom?: string
  dateTo?: string
  sortBy: SortField
  sortDir: 'asc' | 'desc'
  page: number
  pageSize: number
}

interface TradesTableProps {
  trades: TradeRow[]
  totalCount: number
  totalPages: number
  query: TradesQueryState
}

function buildTradesHref(
  query: TradesQueryState,
  overrides: Partial<TradesQueryState>,
): string {
  const next = { ...query, ...overrides }
  const params = new URLSearchParams()

  params.set('accountId', next.accountId)
  params.set('pageSize', String(next.pageSize))
  params.set('sortBy', next.sortBy)
  params.set('sortDir', next.sortDir)
  params.set('page', String(next.page))

  if (next.symbol) params.set('symbol', next.symbol)
  if (next.direction) params.set('direction', next.direction)
  if (next.status) params.set('status', next.status)
  if (next.setup) params.set('setup', next.setup)
  if (next.dateFrom) params.set('dateFrom', next.dateFrom)
  if (next.dateTo) params.set('dateTo', next.dateTo)

  return `/trades?${params.toString()}`
}

function buildChartHref(trade: TradeRow): string {
  const params = new URLSearchParams({
    tradeId: trade.id,
    accountId: trade.accountId,
  })
  params.set('from', trade.entryTime.toISOString().split('T')[0])
  params.set('to', (trade.exitTime ?? trade.entryTime).toISOString().split('T')[0])
  return `/chart/${encodeURIComponent(trade.symbol)}?${params.toString()}`
}

function canLinkToChart(trade: TradeRow): boolean {
  return trade.instrumentType === 'EQUITY' && trade.closeKind !== 'TRANSFER'
}

function SortableHeading({
  field,
  label,
  query,
  className,
}: {
  field: SortField
  label: string
  query: TradesQueryState
  className?: string
}) {
  const nextDir =
    query.sortBy === field && query.sortDir === 'desc' ? 'asc' : 'desc'
  const arrow =
    query.sortBy === field ? (query.sortDir === 'asc' ? '↑' : '↓') : '↕'

  return (
    <Link
      href={buildTradesHref(query, { sortBy: field, sortDir: nextDir, page: 1 })}
      className={`flex items-center gap-1 hover:text-zinc-200 transition-colors ${query.sortBy === field ? 'text-blue-400' : ''} ${className ?? ''}`}
    >
      <span>{label}</span>
      <span className={`text-xs ${query.sortBy === field ? '' : 'text-zinc-700'}`}>{arrow}</span>
    </Link>
  )
}

export function TradesTable({
  trades,
  totalCount,
  totalPages,
  query,
}: TradesTableProps) {
  return (
    <>
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900/60">
              <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider w-[90px]">
                <SortableHeading field="symbol" label="Symbol" query={query} />
              </TableHead>
              <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider w-[52px]">
                Dir
              </TableHead>
              <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                <SortableHeading field="entryTime" label="Entry" query={query} />
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
                <SortableHeading
                  field="netPnl"
                  label="Net P&L"
                  query={query}
                  className="justify-end"
                />
              </TableHead>
              <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                <SortableHeading field="rMultiple" label="R" query={query} className="justify-end" />
              </TableHead>
              <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                <SortableHeading
                  field="durationSeconds"
                  label="Duration"
                  query={query}
                  className="justify-end"
                />
              </TableHead>
              <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                Setup
              </TableHead>
              <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                Actions
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
                  <TableCell className="py-2.5">
                    {canLinkToChart(trade) ? (
                      <Link
                        href={buildChartHref(trade)}
                        className="font-mono font-semibold text-sm text-zinc-100 hover:text-blue-400 transition-colors"
                      >
                        {trade.symbol}
                      </Link>
                    ) : (
                      <span className="font-mono font-semibold text-sm text-zinc-100">
                        {trade.symbol}
                      </span>
                    )}
                  </TableCell>

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

                  <TableCell className="py-2.5 font-mono text-sm text-zinc-300">
                    {formatDate(trade.entryTime)}
                  </TableCell>

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

                  <TableCell className="py-2.5 font-mono text-sm text-zinc-300 text-right">
                    ${formatPrice(trade.entryPrice.toNumber())}
                  </TableCell>

                  <TableCell className="py-2.5 font-mono text-sm text-zinc-400 text-right">
                    {trade.exitPrice ? `$${formatPrice(trade.exitPrice.toNumber())}` : '—'}
                  </TableCell>

                  <TableCell className="py-2.5 font-mono text-sm text-zinc-300 text-right">
                    {getDisplayTradeQuantity({
                      isOpen: trade.isOpen,
                      totalQty: trade.totalQty.toNumber(),
                      remainingQty: trade.remainingQty.toNumber(),
                    }).toLocaleString()}
                  </TableCell>

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

                  <TableCell className="py-2.5 font-mono text-sm text-right">
                    {trade.rMultiple != null ? (
                      <span className={trade.rMultiple.toNumber() >= 0 ? 'text-zinc-200' : 'text-zinc-400'}>
                        {trade.rMultiple.toNumber().toFixed(2)}R
                        {trade.riskSource === 'ATR' && (
                          <span className="text-zinc-600 text-[10px] ml-0.5">est.</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </TableCell>

                  <TableCell className="py-2.5 font-mono text-sm text-zinc-400 text-right">
                    {formatDuration(trade.durationSeconds)}
                  </TableCell>

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

                  <TableCell className="py-2.5 text-right">
                    {canLinkToChart(trade) ? (
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-zinc-300 hover:text-white hover:bg-zinc-800"
                      >
                        <Link href={buildChartHref(trade)}>View</Link>
                      </Button>
                    ) : (
                      <span className="text-xs text-zinc-600">No chart</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-zinc-500 text-sm">
            {(query.page - 1) * query.pageSize + 1}–
            {Math.min(query.page * query.pageSize, totalCount).toLocaleString()} of{' '}
            {totalCount.toLocaleString()} trades
          </p>
          <div className="flex items-center gap-2">
            {query.page > 1 && (
              <Link
                href={buildTradesHref(query, { page: query.page - 1 })}
                className="h-8 px-3 flex items-center text-sm rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
              >
                ← Prev
              </Link>
            )}
            <span className="text-zinc-500 text-sm px-1">
              {query.page} / {totalPages}
            </span>
            {query.page < totalPages && (
              <Link
                href={buildTradesHref(query, { page: query.page + 1 })}
                className="h-8 px-3 flex items-center text-sm rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  )
}
