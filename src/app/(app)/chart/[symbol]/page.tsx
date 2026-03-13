import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getRequiredSession } from '@/lib/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate, formatDuration, formatPrice } from '@/lib/format'

interface ChartPageProps {
  params: Promise<{ symbol: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = searchParams[key]
  return typeof value === 'string' && value ? value : undefined
}

export default async function SymbolChartPage({
  params,
  searchParams,
}: ChartPageProps) {
  const session = await getRequiredSession()
  const userId = session.user.id
  const { symbol: rawSymbol } = await params
  const resolvedSearchParams = await searchParams
  const tradeId = getParam(resolvedSearchParams, 'tradeId')
  const requestedAccountId = getParam(resolvedSearchParams, 'accountId')
  const symbol = decodeURIComponent(rawSymbol).toUpperCase()

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

  const trades = await prisma.roundTripTrade.findMany({
    where: { accountId: account.id, symbol },
    include: { classification: { select: { setup: true, confidence: true } } },
    orderBy: { entryTime: 'desc' },
  })

  const selectedTrade = trades.find((trade) => trade.id === tradeId) ?? null
  const closedTrades = trades.filter((trade) => !trade.isOpen)
  const winCount = closedTrades.filter((trade) => (trade.netPnl?.toNumber() ?? 0) > 0).length
  const totalNetPnl = closedTrades.reduce((sum, trade) => sum + (trade.netPnl?.toNumber() ?? 0), 0)
  const openPositions = trades.filter((trade) => trade.isOpen).length
  const winRate = closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 0

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="border-b border-zinc-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center">
            <span className="text-white font-bold text-xs">A</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{symbol}</p>
            <p className="text-zinc-500 text-xs">Symbol detail preview</p>
          </div>
        </div>
        <Button
          asChild
          variant="ghost"
          className="text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <Link href={`/trades?accountId=${account.id}&symbol=${encodeURIComponent(symbol)}`}>
            ← Back to trades
          </Link>
        </Button>
      </div>

      <div className="px-8 py-6 max-w-[1600px] space-y-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-zinc-100 text-xl">Chart workspace placeholder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-zinc-400 max-w-3xl">
              Phase 8 will replace this preview with the interactive candlestick chart. For now,
              this page keeps trade links explorable by showing the selected symbol&apos;s round trips
              and highlighting the trade you navigated from.
            </p>
            {selectedTrade && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
                <p className="text-blue-300 text-sm font-medium">
                  Selected trade: {formatDate(selectedTrade.entryTime)} to{' '}
                  {selectedTrade.exitTime ? formatDate(selectedTrade.exitTime) : 'Open'}
                </p>
                <p className="text-zinc-300 text-sm mt-1">
                  {selectedTrade.direction} · {selectedTrade.totalQty.toNumber().toLocaleString()} shares ·{' '}
                  {formatCurrency(selectedTrade.netPnl?.toNumber() ?? null)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-4 gap-4">
          <SummaryCard label="Trades" value={String(trades.length)} />
          <SummaryCard label="Closed Net P&L" value={formatCurrency(totalNetPnl)} />
          <SummaryCard
            label="Win Rate"
            value={closedTrades.length > 0 ? `${winRate.toFixed(1)}%` : '—'}
          />
          <SummaryCard label="Open Positions" value={String(openPositions)} />
        </div>

        {trades.length === 0 ? (
          <div className="border border-zinc-800 rounded-lg p-16 text-center">
            <p className="text-zinc-400 text-base mb-2">No trades found for {symbol}.</p>
            <p className="text-zinc-600 text-sm">
              <Link
                href={`/trades?accountId=${account.id}`}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Return to the trade list
              </Link>
            </p>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900/60">
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                    Entry
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                    Exit
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                    Dir
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
                    Net P&L
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                    Duration
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                    Setup
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((trade) => {
                  const isSelected = trade.id === tradeId
                  const pnl = trade.netPnl?.toNumber() ?? null

                  return (
                    <TableRow
                      key={trade.id}
                      className={`border-zinc-800 hover:bg-zinc-900/40 transition-colors ${isSelected ? 'bg-blue-500/5' : ''}`}
                    >
                      <TableCell className="py-2.5 font-mono text-sm text-zinc-300">
                        {formatDate(trade.entryTime)}
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-sm text-zinc-300">
                        {trade.isOpen ? 'Open' : formatDate(trade.exitTime)}
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
                          {trade.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-sm text-zinc-300 text-right">
                        ${formatPrice(trade.entryPrice.toNumber())}
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-sm text-zinc-400 text-right">
                        {trade.exitPrice ? `$${formatPrice(trade.exitPrice.toNumber())}` : '—'}
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-sm text-zinc-300 text-right">
                        {trade.totalQty.toNumber().toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={`py-2.5 font-mono text-sm text-right ${pnl != null && pnl > 0 ? 'text-green-400' : pnl != null && pnl < 0 ? 'text-red-400' : 'text-zinc-500'}`}
                      >
                        {formatCurrency(pnl)}
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
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <p className="text-lg font-semibold font-mono leading-none text-zinc-100">{value}</p>
    </div>
  )
}
