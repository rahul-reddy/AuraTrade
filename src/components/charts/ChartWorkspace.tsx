'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpRight, PanelRightClose, PanelRightOpen, Search, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { ChartTrade, ChartRange } from '@/lib/charts/chart-model'
import { fillTradingDay } from '@/lib/charts/chart-model'
import type { MarketDataCandle, MarketDataTimeframe } from '@/lib/market-data/yahoo-client'
import { formatCurrency, formatDuration, formatPrice, formatTradingDay } from '@/lib/format'

const DynamicChart = dynamic(() => import('./CandlestickChart'), { ssr: false, loading: () => <div className="flex flex-1 flex-col gap-4 p-5"><Skeleton className="h-8 w-64" /><Skeleton className="min-h-[360px] flex-1" /><Skeleton className="h-24 w-full" /></div> })
interface Props {
  symbol: string
  accountId: string
  trades: ChartTrade[]
  initialCandles: MarketDataCandle[]
  initialTimeframe: MarketDataTimeframe
  initialFallbackMessage: string | null
  initialSource?: string
  initialRange: ChartRange
  initialFocusTradeId: string | null
  totalNetPnl: number
  winRate: number | null
  openCount: number
}
export default function ChartWorkspace(props: Props) {
  const { symbol, accountId, trades, totalNetPnl, winRate, openCount } = props
  const router = useRouter()
  const [focusTradeId, setFocusTradeId] = useState(props.initialFocusTradeId)
  const [inspector, setInspector] = useState(true)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const select = useCallback((id: string | null) => { setFocusTradeId(id); if (id) setInspector(true) }, [])
  const selected = trades.find(t => t.id === focusTradeId)
  const shownTrades = trades.filter(t => filter === 'all' || (filter === 'open' ? t.isOpen : !t.isOpen))
  function jump(event: React.FormEvent) {
    event.preventDefault()
    const ticker = query.trim().toUpperCase()
    if (/^[A-Z0-9][A-Z0-9.^=\-]{0,14}$/.test(ticker)) router.push(`/chart/${encodeURIComponent(ticker)}?accountId=${encodeURIComponent(accountId)}`)
  }
  return (
    <div className="chart-review flex h-auto min-h-[740px] min-w-0 flex-col bg-[#10141c] text-zinc-200 lg:h-full lg:min-h-0" data-testid="chart-workspace" data-fill-count={trades.reduce((sum, t) => sum + t.fills.length, 0)}>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 bg-[#151b26] px-5 py-3">
        <div className="flex items-center gap-4"><Link className="text-xs text-zinc-400 hover:text-white" href={`/trades?accountId=${encodeURIComponent(accountId)}`}>← Trades</Link><span className="h-5 w-px bg-zinc-700" /><div className="flex items-center gap-3"><h1 className="font-mono text-xl font-semibold tracking-tight text-white">{symbol}</h1><span className="rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400">Trade review</span></div></div>
        <div className="flex flex-wrap items-center gap-5 text-xs"><div><span className="mr-2 text-zinc-400">Net P&L</span><span className={`font-mono ${totalNetPnl >= 0 ? 'text-teal-300' : 'text-rose-400'}`}>{formatCurrency(totalNetPnl)}</span></div><div><span className="mr-2 text-zinc-400">Win Rate</span><span className="font-mono">{winRate == null ? '—' : `${winRate.toFixed(1)}%`}</span></div><span className="text-zinc-400">{trades.length} trades · {openCount} open</span></div>
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <form onSubmit={jump} role="search" aria-label="Search chart symbols" className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="chart-symbol-search" className="text-[10px] font-medium text-zinc-400">Symbol search</label>
            <div className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-zinc-600 bg-zinc-950 px-3 focus-within:border-blue-400">
              <Search size={14} className="shrink-0 text-zinc-400" />
              <input id="chart-symbol-search" aria-label="Jump to symbol" placeholder="Search any symbol…" value={query} onChange={e => setQuery(e.target.value)} maxLength={15} pattern="[A-Za-z0-9][A-Za-z0-9.^=\-]{0,14}" required className="w-28 min-w-0 bg-transparent text-xs uppercase outline-none sm:w-36" />
              <button type="submit" aria-label="Open symbol chart" className="flex shrink-0 items-center gap-1 border-l border-zinc-700 pl-3 text-xs font-medium text-blue-300 hover:text-blue-200">Open chart<ArrowUpRight size={13} /></button>
            </div>
          </form>
          <button type="button" onClick={() => setInspector(!inspector)} aria-label={inspector ? 'Hide trade inspector' : 'Show trade inspector'} aria-expanded={inspector} className="rounded-md border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-800">{inspector ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}</button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <DynamicChart key={symbol} initialCandles={props.initialCandles} initialTimeframe={props.initialTimeframe} initialFallbackMessage={props.initialFallbackMessage} initialSource={props.initialSource} initialRange={props.initialRange} trades={trades} symbol={symbol} focusTradeId={focusTradeId} onSelectTrade={select} />
        {inspector && <aside aria-label="Trade inspector" className="flex max-h-[660px] w-full shrink-0 flex-col overflow-hidden border-t border-zinc-800 bg-[#151b26] lg:max-h-none lg:w-[288px] lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4"><h2 className="text-xs font-medium">Trades · {symbol}</h2><span className="font-mono text-[10px] text-zinc-400">{trades.length} total</span></div>
          <div className="flex gap-1 border-b border-zinc-800 px-3 py-2" role="group" aria-label="Filter chart trades">{['all', 'closed', 'open'].map(value => <button type="button" key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`flex-1 rounded px-2 py-1.5 text-[11px] capitalize ${filter === value ? 'bg-blue-500/15 text-blue-300' : 'text-zinc-400 hover:bg-zinc-800'}`}>{value}</button>)}</div>
          <div className="min-h-[100px] flex-1 overflow-y-auto" aria-label="Trade list">
            {!shownTrades.length && <p className="p-5 text-xs leading-6 text-zinc-400">No {filter === 'all' ? '' : filter} trades for {symbol}.</p>}
            {shownTrades.map(trade => <button type="button" key={trade.id} onClick={() => select(trade.id)} aria-label={`Inspect ${trade.direction.toLowerCase()} trade ${formatTradingDay(trade.entryDay ?? fillTradingDay(trade.entryTime))}`} aria-pressed={trade.id === focusTradeId} className={`w-full border-b border-l-2 border-b-zinc-800 px-4 py-3 text-left transition-colors ${trade.id === focusTradeId ? 'border-l-blue-400 bg-blue-500/10' : 'border-l-transparent hover:bg-white/5'}`}><div className="mb-2 flex items-center justify-between"><span className="text-xs text-zinc-300">{formatTradingDay(trade.entryDay ?? fillTradingDay(trade.entryTime))}</span><span className={`text-[9px] uppercase tracking-wider ${trade.direction === 'LONG' ? 'text-teal-300' : 'text-rose-300'}`}>{trade.direction}</span></div><div className="flex items-center justify-between"><span className="font-mono text-[10px] text-zinc-400">{trade.totalQty.toLocaleString()} peak · {formatDuration(trade.durationSeconds)}</span><span className={`font-mono text-xs ${trade.isOpen ? 'text-blue-300' : (trade.netPnl ?? 0) >= 0 ? 'text-teal-300' : 'text-rose-400'}`}>{trade.isOpen ? 'OPEN' : formatCurrency(trade.netPnl)}</span></div></button>)}
          </div>
          <section className="max-h-[52%] min-h-[160px] shrink-0 overflow-y-auto border-t border-zinc-700 p-4" aria-label="Selected trade details">
            {selected ? <><div className="mb-4 flex items-center justify-between"><p className="text-xs font-semibold">Selected trade</p><button type="button" aria-label="Clear selected trade" onClick={() => select(null)} className="text-zinc-400 hover:text-white"><X size={14} /></button></div><dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[11px]">{[{ label: 'Entry price', value: formatPrice(selected.entryPrice) }, { label: 'Exit price', value: selected.exitPrice == null ? 'Open' : formatPrice(selected.exitPrice) }, { label: 'Peak quantity', value: selected.totalQty.toLocaleString() }, { label: 'Holding time', value: formatDuration(selected.durationSeconds) }].map(item => <div key={item.label}><dt className="mb-1 text-zinc-400">{item.label}</dt><dd className="font-mono text-zinc-100">{item.value}</dd></div>)}</dl>{selected.setup && <p className="mt-4 text-[10px] text-blue-300">Setup · {selected.setup}</p>}<p className="mb-2 mt-5 text-[10px] uppercase tracking-wider text-zinc-400">Broker fills · {selected.fills.length}</p><div className="space-y-2">{selected.fills.map(fill => <div key={fill.id} className="rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-[10px]"><div className="flex justify-between text-zinc-400"><span>{formatTradingDay(fill.day ?? fillTradingDay(fill.time))}</span><span className={fill.kind === 'CLOSE' ? 'text-amber-300' : 'text-teal-300'}>{fill.side.replaceAll('_', ' ')}</span></div><p className="mt-1 font-mono text-zinc-200">{fill.qty.toLocaleString()} @ {formatPrice(fill.price)}</p></div>)}</div></> : <div className="py-4"><p className="text-sm font-medium text-zinc-200">See the trade behind the marker.</p><p className="mt-2 text-xs leading-6 text-zinc-400">Select a trade or click an entry/exit on the chart. Inspect exact broker fills, then use Focus trade for a closer view.</p></div>}
          </section>
        </aside>}
      </div>
    </div>
  )
}
