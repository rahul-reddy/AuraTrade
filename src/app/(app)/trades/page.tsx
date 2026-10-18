import PageHeader from '@/components/layout/PageHeader'
import { ArrowUpRight } from 'lucide-react'
import EmptyAccountState from '@/components/layout/EmptyAccountState'
import Link from 'next/link'
import { tradingDayRangeWhere } from '@/lib/trades/trading-date'
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
  // Filter by the entry trading day, not the raw entry instant (see trading-date.ts).
  const dayRange = tradingDayRangeWhere('entry', dateFrom ?? null, dateTo ?? null)
  if (dayRange) where.AND = [dayRange]

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
    return <EmptyAccountState missing={!!requestedAccountId} trades />
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
    <div className="text-foreground">
      <div className="workspace-page">
        <PageHeader eyebrow="Workspace / Trade journal" title="Trade History" description={<>{account.name} · {totalCount.toLocaleString()} trades{closedCount !== totalCount && <span className="ml-2 text-primary">{totalCount - closedCount} open</span>}</>}>
          <Link href="/upload" className="action-secondary">Import statement<ArrowUpRight size={15} /></Link>
        </PageHeader>

        <nav aria-label="Trade views" className="mb-6 flex gap-6 border-b border-zinc-800 text-sm">
          {[{ label: 'All trades', value: '' }, { label: 'Closed trades', value: 'closed' }, { label: 'Open positions', value: 'open' }].map(({ label, value }) => {
            const query = new URLSearchParams()
            for (const [key, param] of Object.entries(params)) {
              if (typeof param === 'string' && key !== 'page' && key !== 'status') query.set(key, param)
            }
            query.set('accountId', account.id)
            if (value) query.set('status', value)
            const active = (str(params, 'status') ?? '') === value
            return <Link key={label} href={`/trades?${query.toString()}`} aria-current={active ? 'page' : undefined} className={`border-b-2 pb-3 transition-colors ${active ? 'border-primary text-primary' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>{label}</Link>
          })}
        </nav>

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3 mb-7 lg:grid-cols-3 xl:grid-cols-6">
          <SummaryCard
            label="Net P&L"
            value={formatCurrency(totalNetPnl)}
            valueClass={totalNetPnl >= 0 ? 'text-profit' : 'text-loss'}
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
                ? 'text-profit'
                : profitFactor != null && profitFactor < 1
                ? 'text-loss'
                : undefined
            }
          />
          <SummaryCard
            label="Avg Win"
            value={avgWin > 0 ? formatCurrency(avgWin) : '—'}
            valueClass="text-profit"
          />
          <SummaryCard
            label="Avg Loss"
            value={avgLoss > 0 ? formatCurrency(-avgLoss) : '—'}
            valueClass="text-loss"
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
                  className="text-primary hover:text-primary transition-colors"
                >
                  Clear all filters
                </Link>
              ) : (
                <>
                  <Link href="/upload" className="text-primary hover:text-primary transition-colors">
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
    <div className="surface p-4 sm:p-5">
      <p className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <p className={`text-base sm:text-lg font-semibold font-mono leading-none ${valueClass ?? 'text-zinc-100'}`}>
        {value}
      </p>
      {sub && <p className="text-zinc-600 text-xs font-mono mt-1">{sub}</p>}
    </div>
  )
}
