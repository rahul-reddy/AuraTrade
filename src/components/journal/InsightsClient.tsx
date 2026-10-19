'use client'
import { useCurrencyFormat } from '@/components/providers/AmountPrivacy'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTradingDay } from '@/lib/format'
import { groupInsights, type InsightTrade, type InsightGrouping } from '@/lib/journal/insights'
import { tradingDayKey } from '@/lib/trades/trading-date'

const groupings: Array<[InsightGrouping, string]> = [['playbook', 'Playbooks'], ['personalSetup', 'Your setups'], ['inferredSetup', 'Inferred setups'], ['direction', 'Direction'], ['regime', 'Market regime'], ['adherence', 'Plan adherence']]
const percent = (value: number) => `${(value * 100).toFixed(1)}%`

export default function InsightsClient({ accountId, accountName }: { accountId: string; accountName: string }) {
  const formatCurrency = useCurrencyFormat()
  const [grouping, setGrouping] = useState<InsightGrouping>('personalSetup')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const query = useQuery({ queryKey: ['insights', accountId], queryFn: async () => {
    const response = await fetch(`/api/insights?${new URLSearchParams({ accountId })}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('Could not load edge analysis. Please retry.')
    return (await response.json()) as { trades: InsightTrade[] }
  } })
  const invalidRange = !!from && !!to && from > to
  const groups = invalidRange ? [] : groupInsights(query.data?.trades ?? [], grouping, from, to)
  return <div className="workspace-page space-y-6">
    <header><p className="eyebrow">{accountName} · Research your trading</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Edge analysis</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Compare your own labels with inferred setups. Judge execution separately from the outcome, and inspect the trades behind every result.</p></header>
    <div className="surface flex flex-wrap items-end gap-4 p-4"><label className="journal-label">Group by<select className="journal-field mt-1" value={grouping} onChange={event => { setGrouping(event.target.value as InsightGrouping); setExpanded(null) }}>{groupings.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="journal-label">Closed from<input type="date" className="journal-field mt-1" value={from} onChange={event => setFrom(event.target.value)} /></label><label className="journal-label">Closed through<input type="date" className="journal-field mt-1" value={to} onChange={event => setTo(event.target.value)} /></label><button className="action-secondary" onClick={() => { setFrom(''); setTo('') }}>All dates</button></div>
    {invalidRange && <p role="alert" className="text-sm text-loss">The end date must be on or after the start date.</p>}
    {query.isPending ? <div role="status" aria-label="Loading edge analysis"><Skeleton className="h-72" /></div> : query.isError ? <div role="alert" className="surface p-6"><p>{query.error.message}</p><button className="action-primary mt-4" onClick={() => void query.refetch()}>Retry analysis</button></div> : <>
      <p className="text-xs leading-6 text-muted-foreground">Only closed trades with known net P&amp;L are included, using their exit trading date. Fees are the recorded broker fees. Win-rate ranges are 95% Wilson intervals; small samples remain uncertain. These historical associations do not establish a repeatable edge or predict future returns. Date-only statements cannot establish intraday timing.</p>
      {!groups.length && !invalidRange && <div className="surface p-8"><h2 className="text-lg font-medium">No closed trades in this range</h2><p className="mt-2 text-sm text-muted-foreground">Import a statement or broaden the dates. Label setups in your trade journal to build a personal history.</p><Link href="/review" className="action-secondary mt-4 inline-flex">Open daily review</Link></div>}
      <div className="space-y-3">{groups.map(group => <section key={group.key} className="surface overflow-hidden"><button type="button" aria-expanded={expanded === group.key} onClick={() => setExpanded(expanded === group.key ? null : group.key)} className="w-full p-5 text-left hover:bg-muted/30"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">{group.label.replaceAll('_', ' ')}</h2><span className="text-xs text-primary">{group.count} trades · {expanded === group.key ? 'Hide' : 'Inspect'} trades</span></div><dl className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4"><div><dt className="text-muted-foreground">Net P&amp;L</dt><dd className={`mt-1 font-mono ${group.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatCurrency(group.netPnl)}</dd></div><div><dt className="text-muted-foreground">Average trade</dt><dd className="mt-1 font-mono">{formatCurrency(group.average)}</dd></div><div><dt className="text-muted-foreground">Win rate · 95% range</dt><dd className="mt-1 font-mono">{percent(group.winRate)} <span className="text-muted-foreground">({percent(group.interval.lower)}–{percent(group.interval.upper)})</span></dd></div><div><dt className="text-muted-foreground">Broker fees</dt><dd className="mt-1 font-mono">{formatCurrency(group.fees)}</dd></div></dl></button>
      {expanded === group.key && <ul className="max-h-96 divide-y divide-border overflow-y-auto border-t border-border">{group.trades.map(trade => <li key={trade.id}><Link className="flex flex-wrap justify-between gap-3 px-5 py-3 text-sm hover:bg-muted" href={`/chart/${encodeURIComponent(trade.symbol)}?${new URLSearchParams({ accountId, tradeId: trade.id, journal: '1' })}`}><span>{trade.symbol} · {trade.direction.toLowerCase()} · {formatTradingDay(tradingDayKey(trade.exitTradingDate, trade.exitTime!))}</span><span className={`font-mono ${trade.netPnl! >= 0 ? 'text-profit' : 'text-loss'}`}>{formatCurrency(trade.netPnl)}</span></Link></li>)}</ul>}
      </section>)}</div>
    </>}
  </div>
}
