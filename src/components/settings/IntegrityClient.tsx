'use client'

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, DatabaseBackup, RefreshCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate, formatPrice } from '@/lib/format'
import type { IntegrityReport } from '@/lib/settings/integrity'

interface IntegrityClientProps {
  accountId: string
  accountName: string
}

type IntegrityAction = 'reprocess_trades' | 'rebuild_snapshots'

interface IntegrityActionResponse {
  action: IntegrityAction
  accountId: string
  enrichmentStarted?: boolean
  tradeRebuild?: {
    totalExecutions: number
    totalTrades: number
    closedTrades: number
    openPositions: number
    warnings: string[]
  }
  ledgerRebuild?: {
    statementsUsed: number
    closedTrades: number
    openPositions: number
    warnings: string[]
  }
  snapshotRebuild?: {
    snapshotsWritten: number
    tradesProcessed: number
  }
}

function Panel({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
    >
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
  label,
  value,
  href,
  tone = 'neutral',
}: {
  label: string
  value: string
  href?: string
  tone?: 'neutral' | 'profit' | 'warning'
}) {
  const toneClass =
    tone === 'profit'
      ? 'text-green-400'
      : tone === 'warning'
        ? 'text-amber-300'
        : 'text-zinc-100'

  const content = (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 transition-all hover:border-blue-500/40 hover:bg-zinc-900">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className={`mt-3 font-mono text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 p-6 text-sm text-zinc-400">
      {message}
    </div>
  )
}

async function fetchIntegrityReport(accountId: string): Promise<IntegrityReport> {
  const params = new URLSearchParams({ accountId })
  const res = await fetch(`/api/settings/integrity?${params.toString()}`, { credentials: 'include' })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? 'Integrity request failed.')
  }

  return (await res.json()) as IntegrityReport
}

async function runIntegrityAction(
  accountId: string,
  action: IntegrityAction,
): Promise<IntegrityActionResponse> {
  const res = await fetch('/api/settings/integrity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ accountId, action }),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? 'Integrity action failed.')
  }

  return (await res.json()) as IntegrityActionResponse
}

export default function IntegrityClient({ accountId, accountName }: IntegrityClientProps) {
  const queryClient = useQueryClient()

  const integrityQuery = useQuery({
    queryKey: ['integrity', accountId],
    queryFn: () => fetchIntegrityReport(accountId),
  })

  const actionMutation = useMutation({
    mutationFn: ({ action }: { action: IntegrityAction }) => runIntegrityAction(accountId, action),
    onSuccess: async (result) => {
      if (result.action === 'reprocess_trades') {
        const statementTrades =
          (result.ledgerRebuild?.closedTrades ?? 0) + (result.ledgerRebuild?.openPositions ?? 0)
        const totalTrades = (result.tradeRebuild?.totalTrades ?? 0) + statementTrades
        toast.success(
          `Reprocessed ${totalTrades} trades from ${result.ledgerRebuild?.statementsUsed ?? 0} statement(s) and rebuilt ${result.snapshotRebuild?.snapshotsWritten ?? 0} snapshots.`,
        )
      } else {
        toast.success(`Rebuilt ${result.snapshotRebuild?.snapshotsWritten ?? 0} daily snapshots.`)
      }

      await queryClient.invalidateQueries({ queryKey: ['integrity', accountId] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Integrity action failed.')
    },
  })

  const requestAction = (action: IntegrityAction) => {
    const confirmed = window.confirm(
      action === 'reprocess_trades'
        ? 'Reprocess every execution into round trips and rebuild all snapshots for this account?'
        : 'Rebuild every daily snapshot for this account from realized trades?',
    )

    if (!confirmed) return
    actionMutation.mutate({ action })
  }

  if (integrityQuery.isPending) {
    return (
      <div className="mx-auto max-w-[1680px] px-8 py-6 text-white">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/80"
            />
          ))}
        </div>
      </div>
    )
  }

  if (integrityQuery.isError || !integrityQuery.data) {
    return (
      <div className="flex items-center justify-center p-8 py-24 text-white">
        <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 text-center">
          <h1 className="text-xl font-semibold">Integrity page unavailable</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {integrityQuery.error instanceof Error
              ? integrityQuery.error.message
              : 'We could not load the integrity report.'}
          </p>
          <button
            type="button"
            onClick={() => integrityQuery.refetch()}
            className="mt-4 rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const data = integrityQuery.data
  const isHealthy =
    data.counts.orphanedExecutions === 0 &&
    data.counts.positionMismatches === 0 &&
    data.counts.duplicateCandidates === 0

  return (
    <div className="text-white">
      <div className="mx-auto max-w-[1680px] px-8 py-6">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Data Integrity</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {accountName}
              {' · '}
              Inspect execution/trade consistency and run repair jobs when the imported ledger drifts.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => requestAction('reprocess_trades')}
              disabled={actionMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className="h-4 w-4" />
              Reprocess All Trades
            </button>
            <button
              type="button"
              onClick={() => requestAction('rebuild_snapshots')}
              disabled={actionMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <DatabaseBackup className="h-4 w-4" />
              Rebuild All Snapshots
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <div className="flex items-start gap-4">
            <div className={`rounded-2xl p-3 ${isHealthy ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
              {isHealthy ? (
                <ShieldCheck className="h-6 w-6 text-green-400" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-amber-300" />
              )}
            </div>
            <div>
              <p className="text-lg font-semibold text-zinc-100">
                {isHealthy ? 'No integrity issues detected' : 'Integrity review recommended'}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                Execution coverage:{' '}
                {data.dateRange.firstExecution
                  ? `${formatDate(new Date(data.dateRange.firstExecution))} to ${formatDate(new Date(data.dateRange.lastExecution ?? data.dateRange.firstExecution))}`
                  : 'No executions imported yet.'}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Snapshot coverage:{' '}
                {data.dateRange.firstSnapshot
                  ? `${formatDate(new Date(data.dateRange.firstSnapshot))} to ${formatDate(new Date(data.dateRange.lastSnapshot ?? data.dateRange.firstSnapshot))}`
                  : 'No daily snapshots built yet.'}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Executions" value={data.counts.executions.toLocaleString()} />
          <SummaryCard
            label="Round Trips"
            value={data.counts.trades.toLocaleString()}
            href={`/trades?accountId=${accountId}`}
          />
          <SummaryCard
            label="Closed Trades"
            value={data.counts.closedTrades.toLocaleString()}
            href={`/trades?accountId=${accountId}&status=closed`}
          />
          <SummaryCard
            label="Open Positions"
            value={data.counts.openTrades.toLocaleString()}
            href={`/trades?accountId=${accountId}&status=open`}
          />
          <SummaryCard label="Daily Snapshots" value={data.counts.dailySnapshots.toLocaleString()} />
          <SummaryCard
            label="Orphaned Executions"
            value={data.counts.orphanedExecutions.toLocaleString()}
            href="#orphaned-executions"
            tone={data.counts.orphanedExecutions > 0 ? 'warning' : 'profit'}
          />
          <SummaryCard
            label="Qty Mismatches"
            value={data.counts.positionMismatches.toLocaleString()}
            href="#position-mismatches"
            tone={data.counts.positionMismatches > 0 ? 'warning' : 'profit'}
          />
          <SummaryCard
            label="Duplicate Candidates"
            value={data.counts.duplicateCandidates.toLocaleString()}
            href="#duplicate-candidates"
            tone={data.counts.duplicateCandidates > 0 ? 'warning' : 'profit'}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-7">
            <Panel
              id="orphaned-executions"
              title="Orphaned Executions"
              subtitle="Executions with no linked round trip after the latest rebuild."
            >
              {data.orphanedExecutions.length === 0 ? (
                <EmptyState message="Every execution is currently linked to a round trip." />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-950/70 text-xs uppercase tracking-[0.16em] text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Symbol</th>
                        <th className="px-4 py-3">Side</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Price</th>
                        <th className="px-4 py-3 text-right">Seq</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orphanedExecutions.map((execution) => (
                        <tr key={execution.id} className="border-t border-zinc-800">
                          <td className="px-4 py-3 text-zinc-300">
                            {formatDate(new Date(execution.execTime))}
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-100">{execution.symbol}</td>
                          <td className="px-4 py-3 text-zinc-400">{execution.side}</td>
                          <td className="px-4 py-3 text-right font-mono text-zinc-300">
                            {execution.qty.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-zinc-300">
                            ${formatPrice(execution.price)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-zinc-500">
                            {execution.daySeq}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              id="position-mismatches"
              title="Position Mismatches"
              subtitle="Closed trades where peak quantity and total closed quantity diverge."
            >
              {data.positionMismatches.length === 0 ? (
                <EmptyState message="No closed trades currently show quantity mismatches." />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-950/70 text-xs uppercase tracking-[0.16em] text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Trade</th>
                        <th className="px-4 py-3">Entry</th>
                        <th className="px-4 py-3">Exit</th>
                        <th className="px-4 py-3 text-right">Peak Qty</th>
                        <th className="px-4 py-3 text-right">Closed Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.positionMismatches.map((trade) => (
                        <tr key={trade.id} className="border-t border-zinc-800">
                          <td className="px-4 py-3">
                            <Link
                              href={`/chart/${trade.symbol}?accountId=${accountId}&tradeId=${trade.id}`}
                              className="font-medium text-blue-400 transition hover:text-blue-300"
                            >
                              {trade.symbol}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-zinc-300">
                            {formatDate(new Date(trade.entryTime))}
                          </td>
                          <td className="px-4 py-3 text-zinc-300">
                            {trade.exitTime ? formatDate(new Date(trade.exitTime)) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-zinc-300">
                            {trade.totalQty.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-amber-300">
                            {trade.closedQty.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-4 xl:col-span-5">
            <Panel
              id="duplicate-candidates"
              title="Duplicate Candidates"
              subtitle="Identical execution clusters that slipped past row-level dedup because daySeq intentionally allows same-day repeats."
            >
              {data.duplicateCandidates.length === 0 ? (
                <EmptyState message="No duplicate candidate groups found." />
              ) : (
                <div className="space-y-3">
                  {data.duplicateCandidates.map((candidate) => (
                    <div
                      key={`${candidate.execTime}-${candidate.symbol}-${candidate.side}-${candidate.qty}-${candidate.price}`}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-zinc-100">
                            {candidate.symbol} · {candidate.side}
                          </p>
                          <p className="mt-1 text-sm text-zinc-400">
                            {formatDate(new Date(candidate.execTime))} · qty{' '}
                            <span className="font-mono">
                              {candidate.qty.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                            </span>{' '}
                            @ <span className="font-mono">${formatPrice(candidate.price)}</span>
                          </p>
                        </div>
                        <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-right">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300/80">
                            Cluster size
                          </p>
                          <p className="font-mono text-xl text-amber-300">{candidate.count}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title="Repair Notes"
              subtitle="What each maintenance action actually changes."
            >
              <div className="space-y-3 text-sm text-zinc-400">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <p className="font-medium text-zinc-100">Reprocess All Trades</p>
                  <p className="mt-2">
                    Clears trade links, reruns the FIFO grouper over every execution, recreates round trips,
                    rebuilds daily snapshots from scratch, and then kicks off enrichment again so setup tags and
                    context stay in sync.
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <p className="font-medium text-zinc-100">Rebuild All Snapshots</p>
                  <p className="mt-2">
                    Recomputes the `DailySnapshot` ledger from realized closed trades only. It does not alter
                    execution linkage or trade grouping.
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <p className="font-medium text-zinc-100">Starting balance</p>
                  <p className="mt-2 font-mono text-zinc-200">
                    {formatCurrency(data.account.startingBalance, { signed: false })}
                  </p>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}
