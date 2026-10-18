'use client'

import Link from 'next/link'
import { ArrowUpRight, ArrowRight, SlidersHorizontal } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton'
import { formatCurrency, formatDuration, formatTradingDay } from '@/lib/format'
import type { DashboardPayload, HeatmapMonth } from '@/lib/dashboard/types'

interface DashboardClientProps {
  accountId: string
  accountName: string
  userEmail: string
  userName?: string | null
  initialDateFrom?: string
  initialDateTo?: string
}

/**
 * Equity curve with running-peak drawdown:
 *   equity_t   = startingBalance + cumulativePnl_t
 *   peak_t     = max(startingBalance, equity_1..t)
 *   drawdown_t = peak_t − equity_t ; drawdownPct_t = drawdown_t / peak_t × 100
 * A pure function so the component render has no mutable closure state.
 */
function buildEquityCurve(
  startingBalance: number,
  dailySeries: DashboardPayload['dailySeries'],
) {
  const curve: Array<{
    date: string
    cumulativePnl: number
    drawdown: number
    drawdownPct: number
  }> = []
  let peakEquity = startingBalance
  for (const point of dailySeries) {
    const equity = startingBalance + point.cumulativePnl
    peakEquity = Math.max(peakEquity, equity)
    const drawdown = peakEquity - equity
    curve.push({
      date: point.date,
      cumulativePnl: point.cumulativePnl,
      drawdown,
      drawdownPct: peakEquity > 0 ? (drawdown / peakEquity) * 100 : 0,
    })
  }
  return curve
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

function buildTradesHref(
  accountId: string,
  options: {
    dateFrom?: string | null
    dateTo?: string | null
    status?: 'closed'
  } = {},
): string {
  const params = new URLSearchParams({ accountId })
  if (options.status) params.set('status', options.status)
  if (options.dateFrom) params.set('dateFrom', options.dateFrom)
  if (options.dateTo) params.set('dateTo', options.dateTo)
  return `/trades?${params.toString()}`
}

async function fetchDashboardData(
  accountId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<DashboardPayload> {
  const params = new URLSearchParams({ accountId })
  if (dateFrom) params.set('dateFrom', dateFrom)
  if (dateTo) params.set('dateTo', dateTo)

  const res = await fetch(`/api/dashboard?${params.toString()}`, { credentials: 'include' })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? 'Dashboard request failed.')
  }

  return (await res.json()) as DashboardPayload
}

function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean
  payload?: Array<{
    color?: string
    dataKey?: string
    name?: string
    value?: number | string
    payload?: Record<string, unknown>
  }>
  label?: string | number
  formatValue?: (
    value: number | string,
    entry: {
      color?: string
      dataKey?: string
      name?: string
      value?: number | string
      payload?: Record<string, unknown>
    },
  ) => string
}) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-950/95 px-3 py-2 shadow-xl backdrop-blur">
      {label != null && <p className="mb-2 text-xs text-zinc-400">{label}</p>}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={`${entry.dataKey ?? entry.name ?? 'row'}-${index}`} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color ?? '#71717a' }}
            />
            <span className="text-zinc-400">{entry.name ?? entry.dataKey}</span>
            <span className="font-mono text-zinc-100">
              {entry.value != null
                ? formatValue
                  ? formatValue(entry.value, entry)
                  : typeof entry.value === 'number'
                    ? formatCurrency(entry.value)
                    : String(entry.value)
                : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Panel({
  title,
  subtitle,
  children,
  className = '',
  id,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={`surface scroll-mt-6 p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-100">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function SummaryCard({
  href,
  label,
  value,
  sub,
  tone = 'neutral',
  primary = false,
}: {
  href: string
  label: string
  value: string
  sub?: string
  tone?: 'neutral' | 'profit' | 'loss'
  primary?: boolean
}) {
  const toneClass =
    tone === 'profit'
      ? 'text-green-400'
      : tone === 'loss'
        ? 'text-red-400'
        : 'text-zinc-100'

  return (
    <Link
      href={href}
      className={`surface metric-card group p-5 transition-colors hover:border-blue-500/50 ${primary ? 'metric-primary' : ''}`}
    >
      <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">{label}</p><ArrowUpRight size={14} className="text-zinc-500 transition-colors group-hover:text-blue-400" /></div>
      <p className={`mt-4 font-mono text-2xl font-medium tracking-tight ${toneClass}`}>{value}</p>
      {sub && <p className="mt-2 text-xs text-zinc-500 group-hover:text-zinc-400">{sub}</p>}
    </Link>
  )
}

function Heatmap({ months }: { months: HeatmapMonth[] }) {
  if (months.length === 0) {
    return <p className="text-sm text-zinc-500">No daily history yet.</p>
  }

  return (
    <div className="space-y-4">
      {months.map((month) => (
        <div key={month.monthKey}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-zinc-300">{month.monthLabel}</p>
            <p className={`font-mono text-xs ${month.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(month.totalPnl)}
            </p>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {month.days.map((day) => {
              const bg =
                day.pnl > 0
                  ? `rgba(34, 197, 94, ${0.12 + day.intensity * 0.55})`
                  : day.pnl < 0
                    ? `rgba(239, 68, 68, ${0.12 + day.intensity * 0.55})`
                    : 'rgba(63, 63, 70, 0.45)'

              return (
                <div
                  key={day.date}
                  className="rounded-xl border border-zinc-800 p-2 text-center"
                  style={{ backgroundColor: bg }}
                  title={`${day.date}: ${formatCurrency(day.pnl)} (${day.tradeCount} trades)`}
                >
                  <p className="font-mono text-xs text-zinc-200">{day.day}</p>
                  <p className="mt-1 text-[10px] text-zinc-400">{formatCurrency(day.pnl)}</p>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DashboardClient({
  accountId,
  accountName,
  userEmail,
  userName,
  initialDateFrom,
  initialDateTo,
}: DashboardClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [dateFromInput, setDateFromInput] = useState(initialDateFrom ?? '')
  const [dateToInput, setDateToInput] = useState(initialDateTo ?? '')

  // When the URL filters change (navigation, Clear), reset the inputs to match.
  // Done during render per React's "adjusting state when a prop changes"
  // pattern, which avoids an extra effect-driven render pass.
  const [syncedFilters, setSyncedFilters] = useState({
    from: initialDateFrom,
    to: initialDateTo,
  })
  if (syncedFilters.from !== initialDateFrom || syncedFilters.to !== initialDateTo) {
    setSyncedFilters({ from: initialDateFrom, to: initialDateTo })
    setDateFromInput(initialDateFrom ?? '')
    setDateToInput(initialDateTo ?? '')
  }

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', accountId, initialDateFrom ?? '', initialDateTo ?? ''],
    queryFn: () => fetchDashboardData(accountId, initialDateFrom, initialDateTo),
  })

  if (dashboardQuery.isPending) {
    return <DashboardSkeleton />
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <div className="flex items-center justify-center p-8 py-24 text-white">
        <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 text-center">
          <h1 className="text-xl font-semibold">Dashboard unavailable</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {dashboardQuery.error instanceof Error
              ? dashboardQuery.error.message
              : 'We could not load your dashboard data.'}
          </p>
          <button
            type="button"
            onClick={() => dashboardQuery.refetch()}
            className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const data = dashboardQuery.data
  const metrics = data.metrics
  const insights = data.insights

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    params.set('accountId', accountId)

    if (dateFromInput) params.set('dateFrom', dateFromInput)
    else params.delete('dateFrom')

    if (dateToInput) params.set('dateTo', dateToInput)
    else params.delete('dateTo')

    router.replace(`/dashboard?${params.toString()}`)
  }

  const clearFilters = () => {
    setDateFromInput('')
    setDateToInput('')
    router.replace(`/dashboard?accountId=${accountId}`)
  }

  const equityCurve = buildEquityCurve(data.account.startingBalance, data.dailySeries)

  const currentAvgSizeLabel =
    insights.avgPositionSizeFraction != null
      ? formatPercent(insights.avgPositionSizeFraction, 2)
      : formatCurrency(insights.avgPositionNotional, { signed: false })

  const baseTradesHref = buildTradesHref(accountId, {
    status: 'closed',
    dateFrom: data.filters.dateFrom,
    dateTo: data.filters.dateTo,
  })

  return (
    <div className="text-white">
      <div className="workspace-page">
        <PageHeader eyebrow="Performance / Overview" title="Performance Dashboard" description={<>Welcome back, {userName?.trim().split(/\s+/)[0] || userEmail.split('@')[0]}. Here’s your trading performance at a glance.</>}>
          <Link href={baseTradesHref} className="action-secondary">Review trades<ArrowUpRight size={15} /></Link>
        </PageHeader>
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4 border-y border-zinc-800 py-4">
          <div className="flex items-center gap-3"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" /><span className="text-xs font-medium text-zinc-300">{accountName}</span><span className="text-xs text-zinc-500">/ {metrics.totalTrades.toLocaleString()} closed trades</span></div>
          <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-zinc-500">
              From
              <input
                type="date"
                value={dateFromInput}
                onChange={(event) => setDateFromInput(event.target.value)}
                className="mt-1 block rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
              />
            </label>
            <label className="text-xs text-zinc-500">
              To
              <input
                type="date"
                value={dateToInput}
                onChange={(event) => setDateToInput(event.target.value)}
                className="mt-1 block rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              Clear
            </button>
          </form>
        </div>

        {metrics.totalTrades === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-10 text-center">
            <h2 className="text-xl font-semibold text-white">No realized trades in this window</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Adjust the date filters or upload more history to populate the dashboard.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/upload"
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Upload trades
              </Link>
              <Link
                href={buildTradesHref(accountId, { status: 'closed' })}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                View trade history
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                href={baseTradesHref}
                primary
                label="Total P&L"
                value={formatCurrency(metrics.totalNetPnl)}
                sub={`${metrics.totalTrades} closed trades`}
                tone={metrics.totalNetPnl >= 0 ? 'profit' : 'loss'}
              />
              <SummaryCard
                href={baseTradesHref}
                label="Win Rate"
                value={formatPercent(metrics.winRate)}
                sub={`${metrics.winCount} wins · ${metrics.lossCount} losses`}
              />
              <SummaryCard
                href={baseTradesHref}
                label="Profit Factor"
                value={metrics.profitFactor != null ? metrics.profitFactor.toFixed(2) : '—'}
                sub={`Expectancy ${formatCurrency(metrics.expectancy)}`}
                tone={metrics.profitFactor != null && metrics.profitFactor >= 1 ? 'profit' : 'neutral'}
              />
              <SummaryCard
                href={baseTradesHref}
                label="Kelly Half"
                value={formatPercent(metrics.kellyHalf)}
                sub={`Current avg size ${currentAvgSizeLabel}`}
              />
            </div>
            <details className="mb-5 rounded-lg border border-zinc-800 bg-zinc-900/30">
              <summary className="cursor-pointer px-4 py-3 text-xs text-zinc-300">More performance statistics · best/worst day, streak, drawdown</summary>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 [&_.metric-card]:py-4 [&_.metric-card_p.font-mono]:text-xl">
              <SummaryCard
                href={insights.bestDay ? buildTradesHref(accountId, { status: 'closed', dateFrom: insights.bestDay.date, dateTo: insights.bestDay.date }) : baseTradesHref}
                label="Best Day"
                value={insights.bestDay ? formatCurrency(insights.bestDay.pnl) : '—'}
                sub={insights.bestDay ? formatTradingDay(insights.bestDay.date) : 'No day data'}
                tone={insights.bestDay ? insights.bestDay.pnl > 0 ? 'profit' : insights.bestDay.pnl < 0 ? 'loss' : 'neutral' : 'neutral'}
              />
              <SummaryCard
                href={insights.worstDay ? buildTradesHref(accountId, { status: 'closed', dateFrom: insights.worstDay.date, dateTo: insights.worstDay.date }) : baseTradesHref}
                label="Worst Day"
                value={insights.worstDay ? formatCurrency(insights.worstDay.pnl) : '—'}
                sub={insights.worstDay ? formatTradingDay(insights.worstDay.date) : 'No day data'}
                tone={insights.worstDay ? insights.worstDay.pnl > 0 ? 'profit' : insights.worstDay.pnl < 0 ? 'loss' : 'neutral' : 'neutral'}
              />
              <SummaryCard
                href={baseTradesHref}
                label="Current Streak"
                value={insights.streak.label}
                sub={`Avg trade ${formatCurrency(metrics.averageTrade)}`}
                tone={insights.streak.direction === 'WIN' ? 'profit' : insights.streak.direction === 'LOSS' ? 'loss' : 'neutral'}
              />
              <SummaryCard
                href={baseTradesHref}
                label="Max Drawdown"
                value={formatPercent(metrics.maxDrawdown)}
                sub={formatCurrency(-metrics.maxDrawdownAmount)}
                tone="loss"
              />
            </div>
            </details>

            <nav aria-label="Dashboard sections" className="mb-5 flex flex-wrap items-center gap-5 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-2 font-medium text-zinc-200"><SlidersHorizontal size={14} />Explore your performance</span>
              <a className="hover:text-blue-300" href="#equity">Equity & sizing</a>
              <a className="hover:text-blue-300" href="#patterns">Trading patterns</a>
              <a className="hover:text-blue-300" href="#calendar">Trading calendar</a>
              <a className="hover:text-blue-300" href="#position-sizing">Position analysis<ArrowRight className="ml-1 inline" size={12} /></a>
            </nav>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              <Panel
                id="equity"
                title="Equity Curve"
                subtitle="Daily cumulative P&L with drawdown overlay"
                className="xl:col-span-8"
              >
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={equityCurve}>
                      <defs>
                        <linearGradient id="equityFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="drawdownFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                      <YAxis
                        yAxisId="left"
                        tick={{ fill: '#a1a1aa', fontSize: 12 }}
                        tickFormatter={(value: number) => formatCurrency(value)}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fill: '#a1a1aa', fontSize: 12 }}
                        tickFormatter={(value: number) => `${value.toFixed(0)}%`}
                      />
                      <Tooltip
                        content={
                          <ChartTooltip
                            formatValue={(value, entry) =>
                              entry.dataKey === 'drawdownPct'
                                ? `${Number(value).toFixed(2)}%`
                                : formatCurrency(Number(value))
                            }
                          />
                        }
                      />
                      <Legend />
                      <ReferenceLine y={0} yAxisId="left" stroke="#52525b" />
                      <Area
                        type="monotone"
                        yAxisId="right"
                        dataKey="drawdownPct"
                        name="Drawdown %"
                        stroke="#ef4444"
                        fill="url(#drawdownFill)"
                      />
                      <Area
                        type="monotone"
                        yAxisId="left"
                        dataKey="cumulativePnl"
                        name="Cumulative P&L"
                        stroke="#3b82f6"
                        fill="url(#equityFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel
                title="Kelly Sizing"
                subtitle="Fractional Kelly versus current average position size"
                className="xl:col-span-4"
              >
                <div className="space-y-4">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Current Average</p>
                    <p className="mt-2 font-mono text-3xl text-zinc-100">{currentAvgSizeLabel}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Based on average entry notional versus starting balance.
                    </p>
                  </div>
                  {[
                    { label: 'Full Kelly', value: formatPercent(metrics.kellyFull), tone: 'text-blue-400' },
                    { label: 'Half Kelly', value: formatPercent(metrics.kellyHalf), tone: 'text-green-400' },
                    { label: 'Quarter Kelly', value: formatPercent(metrics.kellyQuarter), tone: 'text-zinc-200' },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-xl border border-zinc-800 px-4 py-3">
                      <span className="text-sm text-zinc-400">{row.label}</span>
                      <span className={`font-mono text-lg ${row.tone}`}>{row.value}</span>
                    </div>
                  ))}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-400">
                    Expectancy {formatCurrency(metrics.expectancy)} · Sharpe approx{' '}
                    {metrics.sharpeApprox != null ? metrics.sharpeApprox.toFixed(2) : '—'}
                  </div>
                </div>
              </Panel>

              <Panel
                id="patterns"
                title="P&L Distribution"
                subtitle="Histogram of trade outcomes with a normal overlay"
                className="xl:col-span-6"
              >
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={insights.pnlDistribution}>
                      <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="midpoint" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                      <Tooltip
                        content={
                          <ChartTooltip
                            formatValue={(value) =>
                              typeof value === 'number'
                                ? Number.isInteger(value)
                                  ? value.toLocaleString('en-US')
                                  : value.toFixed(2)
                                : String(value)
                            }
                          />
                        }
                      />
                      <Legend />
                      <Bar dataKey="count" name="Trades" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                      <Line
                        type="monotone"
                        dataKey="normalCount"
                        name="Normal curve"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel
                title="Rolling Win Rate"
                subtitle="Trailing 20-trade hit rate"
                className="xl:col-span-6"
              >
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={insights.rollingWinRate}>
                      <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="tradeNumber" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} domain={[0, 100]} />
                      <Tooltip
                        content={
                          <ChartTooltip
                            formatValue={(value) =>
                              typeof value === 'number' ? `${value.toFixed(1)}%` : String(value)
                            }
                          />
                        }
                        labelFormatter={(label) => `Trade #${label}`}
                      />
                      <ReferenceLine y={50} stroke="#52525b" strokeDasharray="4 4" />
                      <Line
                        type="monotone"
                        dataKey="winRate"
                        name="Win rate %"
                        stroke="#22c55e"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel
                title="P&L By Day Of Week"
                subtitle="Which sessions are adding the most value"
                className="xl:col-span-4"
              >
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={insights.dayOfWeek}>
                      <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                      <Tooltip
                        content={
                          <ChartTooltip
                            formatValue={(value, entry) =>
                              entry.dataKey === 'pnl'
                                ? formatCurrency(Number(value))
                                : typeof value === 'number'
                                  ? value.toLocaleString('en-US')
                                  : String(value)
                            }
                          />
                        }
                      />
                      <Bar dataKey="pnl" name="P&L" radius={[6, 6, 0, 0]}>
                        {insights.dayOfWeek.map((entry) => (
                          <Cell key={entry.day} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel
                title="Sector Breakdown"
                subtitle="Performance by resolved Yahoo sector"
                className="xl:col-span-4"
              >
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={insights.sectorBreakdown.slice(0, 6)} layout="vertical">
                      <CartesianGrid stroke="#27272a" strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="sector"
                        tick={{ fill: '#a1a1aa', fontSize: 12 }}
                        width={100}
                      />
                      <Tooltip
                        content={
                          <ChartTooltip
                            formatValue={(value, entry) =>
                              entry.dataKey === 'pnl'
                                ? formatCurrency(Number(value))
                                : typeof value === 'number'
                                  ? value.toLocaleString('en-US')
                                  : String(value)
                            }
                          />
                        }
                      />
                      <Bar dataKey="pnl" name="P&L" radius={[0, 6, 6, 0]}>
                        {insights.sectorBreakdown.slice(0, 6).map((entry) => (
                          <Cell key={entry.sector} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel
                title="Hour Of Day"
                subtitle="Unavailable for this broker export format"
                className="xl:col-span-4"
              >
                <div className="flex h-[260px] flex-col justify-between rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/50 p-5">
                  <div>
                    <p className="text-lg font-semibold text-zinc-100">Date-only source data</p>
                    <p className="mt-2 text-sm text-zinc-400">
                      Schwab/TDA Transaction History exports do not include intraday execution timestamps,
                      so hour-of-day analysis would be fabricated. We surface the limitation instead of
                      guessing.
                    </p>
                  </div>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    `hourOfDayAvailable = false`
                  </p>
                </div>
              </Panel>

              <Panel
                id="calendar"
                title="Monthly Heatmap"
                subtitle="Daily realized P&L intensity across each month"
                className="xl:col-span-6"
              >
                <Heatmap months={insights.monthlyHeatmap} />
              </Panel>

              <Panel
                id="position-sizing"
                title="Position Size Scatter"
                subtitle="Average size versus outcome"
                className="xl:col-span-6"
              >
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Size"
                        tick={{ fill: '#a1a1aa', fontSize: 12 }}
                        tickFormatter={(value: number) =>
                          insights.avgPositionSizeFraction != null ? `${value.toFixed(1)}%` : `$${Math.round(value)}`
                        }
                      />
                      <YAxis
                        type="number"
                        dataKey="pnl"
                        name="P&L"
                        tick={{ fill: '#a1a1aa', fontSize: 12 }}
                        tickFormatter={(value: number) => formatCurrency(value)}
                      />
                      <Tooltip
                        content={
                          <ChartTooltip
                            formatValue={(value, entry) => {
                              if (entry.dataKey === 'x') {
                                return insights.avgPositionSizeFraction != null
                                  ? `${Number(value).toFixed(2)}%`
                                  : formatCurrency(Number(value), { signed: false })
                              }
                              return formatCurrency(Number(value))
                            }}
                          />
                        }
                        cursor={{ strokeDasharray: '4 4' }}
                      />
                      <ReferenceLine y={0} stroke="#52525b" />
                      <Scatter name="Trades" data={insights.sizeScatter} fill="#3b82f6" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel
                title="Holding Duration Scatter"
                subtitle="Are long holds earning their keep?"
                className="xl:col-span-12"
              >
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Duration"
                        tick={{ fill: '#a1a1aa', fontSize: 12 }}
                        tickFormatter={(value: number) => formatDuration(value)}
                      />
                      <YAxis
                        type="number"
                        dataKey="pnl"
                        name="P&L"
                        tick={{ fill: '#a1a1aa', fontSize: 12 }}
                        tickFormatter={(value: number) => formatCurrency(value)}
                      />
                      <Tooltip
                        content={
                          <ChartTooltip
                            formatValue={(value, entry) =>
                              entry.dataKey === 'x'
                                ? formatDuration(Number(value))
                                : formatCurrency(Number(value))
                            }
                          />
                        }
                        cursor={{ strokeDasharray: '4 4' }}
                      />
                      <ReferenceLine y={0} stroke="#52525b" />
                      <Scatter name="Trades" data={insights.durationScatter} fill="#22c55e" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
