'use client'
import { useCurrencyFormat } from '@/components/providers/AmountPrivacy'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, ChartNoAxesCombined, Check, NotebookPen } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import JournalEditor from './JournalEditor'
import DailyReflection from './DailyReflection'
import { formatTradingDay } from '@/lib/format'
import { shiftDay, type DailyReviewData } from '@/lib/journal/review'

export default function DailyReviewClient({ accountId, accountName, date }: { accountId: string; accountName: string; date: string }) {
  const formatCurrency = useCurrencyFormat()
  const router = useRouter()
  const search = useSearchParams()
  const client = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'needs-review'>('all')
  const [selected, setSelected] = useState<{ tradeId?: string; journalId?: string } | null>(null)
  const [journalDirty, setJournalDirty] = useState(false)
  const [reflectionDirty, setReflectionDirty] = useState(false)
  const query = useQuery({ queryKey: ['daily-review', accountId, date], queryFn: async (): Promise<DailyReviewData> => {
    const response = await fetch(`/api/review?${new URLSearchParams({ accountId, date })}`, { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || 'Could not load the daily review.')
    return result as DailyReviewData
  } })
  const refreshed = useCallback(() => { void client.invalidateQueries({ queryKey: ['daily-review', accountId, date] }) }, [client, accountId, date])
  function canLeave() { return (!journalDirty && !reflectionDirty) || window.confirm('You have unsaved review changes. Discard them and continue?') }
  function changeDay(next: string) { if (!next || !canLeave()) return; const params = new URLSearchParams(search); params.set('accountId', accountId); params.set('date', next); router.push(`/review?${params}`) }
  const data = query.data
  const trades = data?.trades.filter(trade => filter === 'all' || !trade.reviewed) ?? []
  return <div className="workspace-page"><PageHeader eyebrow="Reflect / Improve" title="Daily Review" description={<>Review the trades behind your results, then choose one focus for tomorrow.</>}><Link href={`/trades?accountId=${encodeURIComponent(accountId)}`} className="action-secondary">All trades</Link></PageHeader>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-muted-foreground">{accountName}</p><div className="flex flex-wrap items-end gap-2"><button type="button" className="action-secondary" aria-label="Previous review day" onClick={() => changeDay(shiftDay(date, -1))}><ArrowLeft size={14} /></button><label className="journal-label">Review date<input type="date" aria-label="Review date" className="journal-field mt-1" value={date} onChange={event => changeDay(event.target.value)} /></label><button type="button" className="action-secondary" aria-label="Next review day" onClick={() => changeDay(shiftDay(date, 1))}><ArrowRight size={14} /></button>{data?.latestDay && data.latestDay !== date && <button type="button" className="action-secondary" onClick={() => changeDay(data.latestDay!)}>Latest trading day</button>}</div></div>
    {query.isPending && <div role="status" aria-label="Loading daily review" className="space-y-5"><Skeleton className="h-28" /><Skeleton className="h-96" /></div>}
    {query.isError && <div role="alert" className="surface p-6"><p>{query.error.message}</p><button type="button" className="action-secondary mt-4" onClick={() => void query.refetch()}>Retry daily review</button></div>}
    {data && <><div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      { label: 'Realized net P&L', value: formatCurrency(data.summary.netPnl), tone: data.summary.netPnl >= 0 ? 'text-profit' : 'text-loss' },
      { label: 'Trades closed', value: String(data.summary.closedCount) }, { label: 'Fees on closed trades', value: formatCurrency(data.summary.fees) },
      { label: 'Review progress', value: `${data.summary.reviewedCount}/${data.trades.length}` },
    ].map(card => <div key={card.label} className="surface p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{card.label}</p><p className={`mt-3 font-mono text-xl ${card.tone ?? ''}`}>{card.value}</p></div>)}</div>
    <p className="mb-6 text-xs leading-6 text-muted-foreground">Results count trades closed on {formatTradingDay(date)}. The list includes trades opened, closed, or filled that day. Open positions contribute no realized P&L.{data.summary.unknownPnlCount > 0 && <span className="text-warning"> {data.summary.unknownPnlCount} closes have unavailable P&L and are excluded.</span>}</p>
    <div className="mb-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]"><section className="surface overflow-hidden" aria-label="Daily trades"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><h2 className="text-sm font-semibold">Trades to review</h2><div className="flex gap-2" role="group" aria-label="Review queue filter">{(['all', 'needs-review'] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-2 text-xs ${filter === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>{value === 'all' ? 'All trades' : `Needs review (${data.summary.needsReviewCount})`}</button>)}</div></div>
    {!trades.length && <div className="p-8 text-center"><NotebookPen className="mx-auto mb-3 text-primary" size={24} /><p className="text-sm">{data.trades.length ? 'Every trade in this session has been reviewed.' : 'No trades for this day.'}</p><p className="mt-2 text-xs text-muted-foreground">{data.trades.length ? 'You can finish your daily reflection below.' : 'Choose another date or use Latest trading day. You can still save a reflection.'}</p></div>}
    {trades.map(trade => <div key={trade.id} className={`border-b border-border p-4 last:border-0 ${selected?.tradeId === trade.id ? 'bg-primary/5' : ''}`}><div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className="text-left" onClick={() => { if (!journalDirty || window.confirm('Discard unsaved journal changes?')) setSelected({ tradeId: trade.id }) }} aria-label={`Review ${trade.symbol} trade`}><span className="font-mono font-semibold">{trade.symbol}</span><span className="ml-3 text-[10px] text-muted-foreground">{trade.direction} · {trade.isOpen ? 'Open' : 'Closed'}</span><p className="mt-1 text-xs text-muted-foreground">{trade.personalSetup || trade.setup || 'No setup assigned'}</p></button><div className="text-right"><p className={`font-mono text-sm ${trade.isOpen || trade.netPnl == null ? 'text-muted-foreground' : trade.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{trade.isOpen ? 'Open position' : formatCurrency(trade.netPnl)}</p><p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">{trade.reviewed && <Check size={11} />}{trade.reviewed ? 'Reviewed' : 'Needs review'}</p></div></div><div className="mt-3 flex items-center gap-4"><button type="button" className="text-xs text-primary hover:underline" onClick={() => { if (!journalDirty || window.confirm('Discard unsaved journal changes?')) setSelected({ tradeId: trade.id }) }}>Edit journal</button><Link className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={`/chart/${encodeURIComponent(trade.symbol)}?${new URLSearchParams({ accountId, tradeId: trade.id, journal: '1', reviewDate: date })}`}><ChartNoAxesCombined size={12} />Open annotated chart</Link></div></div>)}
    {data.recoveredJournals.length > 0 && <div className="border-t border-border p-4"><h3 className="text-xs font-medium">Saved journals awaiting a matching trade</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">These entries were retained after trade history changed.</p>{data.recoveredJournals.map(journal => <button key={journal.id} type="button" className="mt-3 block text-xs text-primary hover:underline" onClick={() => { if (!journalDirty || window.confirm('Discard unsaved journal changes?')) setSelected({ journalId: journal.id }) }}>Open {journal.symbol} journal</button>)}</div>}
    </section><section className="surface p-5" aria-label="Daily trade journal">{selected ? <JournalEditor key={selected.tradeId ?? selected.journalId} {...selected} onDirtyChange={setJournalDirty} onSaved={refreshed} /> : <div className="py-8 text-center"><NotebookPen size={26} className="mx-auto mb-4 text-primary" /><h2 className="text-sm font-medium">Review the decision behind the trade.</h2><p className="mt-3 text-xs leading-6 text-muted-foreground">Choose a trade to capture your thesis, setup, mistakes, and lesson. Mark it reviewed when you are done.</p></div>}</section></div>
    <DailyReflection key={`${accountId}:${date}:${data.reflection.version}`} initial={data.reflection} accountId={accountId} date={date} onSaved={refreshed} onDirtyChange={setReflectionDirty} />
    </>}
  </div>
}
