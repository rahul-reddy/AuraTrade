'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers, createTextWatermark, TickMarkType, type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi, type Time, type UTCTimestamp, type IPriceLine, type ITextWatermarkPluginApi } from 'lightweight-charts'
import { Focus, Maximize2, RefreshCw, Settings2 } from 'lucide-react'
import type { MarketDataCandle, MarketDataTimeframe } from '@/lib/market-data/yahoo-client'
import { buildTradeMarkers, ema, sma, rsi, normalizeCandles, yearRange, tradeYearRange, focusRange, fillTradingDay, DAY_MS, type ChartRange, type ChartTrade } from '@/lib/charts/chart-model'
import { useTheme } from '@/components/providers/useTheme'
import { readChartColors } from '@/lib/theme'
import { formatPrice, formatTradingDay } from '@/lib/format'
export type { ChartTrade, ChartFill } from '@/lib/charts/chart-model'

interface Props {
  initialCandles: MarketDataCandle[]
  initialTimeframe: MarketDataTimeframe
  initialFallbackMessage: string | null
  initialSource?: string
  initialRange: ChartRange
  trades: ChartTrade[]
  symbol: string
  focusTradeId: string | null
  onSelectTrade: (id: string | null) => void
}
interface ChartData { candles: MarketDataCandle[]; timeframe: MarketDataTimeframe; range: ChartRange; source: string; message: string | null }
const stamp = (iso: string) => Math.floor(Date.parse(iso) / 1000) as UTCTimestamp
const LABELS: Record<MarketDataTimeframe, string> = { '1d': '1D', '1h': '1H', '15m': '15M', '5m': '5M', '1m': '1M' }
const lineData = (candles: MarketDataCandle[], values: Array<number | null>) => values.flatMap((value, i) => value == null ? [] : [{ time: stamp(candles[i].time), value }])
const shortVolume = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)

export default function CandlestickChart(props: Props) {
  const { symbol, trades, focusTradeId, onSelectTrade } = props
  const { theme } = useTheme()
  const watermark = useRef<ITextWatermarkPluginApi<Time> | null>(null)
  const rsiLevels = useRef<IPriceLine[]>([])
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const price = useRef<ISeriesApi<'Candlestick', Time> | null>(null)
  const volume = useRef<ISeriesApi<'Histogram', Time> | null>(null)
  const lines = useRef<Record<string, ISeriesApi<'Line', Time>>>({})
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const controller = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const lastRequest = useRef({ range: props.initialRange, timeframe: props.initialTimeframe, label: '1Y' })
  const restoreView = useRef<{ from: Time; to: Time } | null>(null)
  const onSelect = useRef(onSelectTrade)
  onSelect.current = onSelectTrade
  const [data, setData] = useState<ChartData>(() => ({ candles: normalizeCandles(props.initialCandles, props.initialTimeframe), timeframe: props.initialTimeframe, range: props.initialRange, source: props.initialSource ?? 'cache', message: props.initialFallbackMessage }))
  const current = useRef(data)
  current.current = data
  const [busy, setBusy] = useState(props.initialCandles.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<MarketDataCandle | null>(null)
  const [rangeLabel, setRangeLabel] = useState('1Y')
  const [showVolume, setShowVolume] = useState(true)
  const [showRsi, setShowRsi] = useState(true)
  const [showAverages, setShowAverages] = useState(true)
  const [showTrades, setShowTrades] = useState(true)
  const [showLevels, setShowLevels] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const selected = trades.find(t => t.id === focusTradeId)
  useEffect(() => {
    if (!expanded) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [expanded])
  const mapping = useMemo(() => buildTradeMarkers(trades, data.candles, data.timeframe, focusTradeId), [trades, data.candles, data.timeframe, focusTradeId])
  const mappingRef = useRef(mapping)
  mappingRef.current = mapping

  const load = useCallback(async (range: ChartRange, timeframe: MarketDataTimeframe, label: string) => {
    lastRequest.current = { range, timeframe, label }
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const requestId = ++sequence.current
    setBusy(true); setError(null)
    const warmup = timeframe === '1d' ? 120 * DAY_MS : 0
    const params = new URLSearchParams({ symbol, timeframe, from: new Date(Date.parse(range.from) - warmup).toISOString(), to: `${range.to}T23:59:59.999Z` })
    try {
      const response = await fetch(`/api/market-data?${params}`, { signal: abort.signal })
      if (!response.ok) throw new Error('unavailable')
      const payload = await response.json() as { candles: MarketDataCandle[]; effectiveTimeframe: MarketDataTimeframe; source: string; fallbackMessage: string | null }
      const candles = normalizeCandles(payload.candles, payload.effectiveTimeframe)
      if (!candles.some(c => c.time.slice(0,10) >= range.from && c.time.slice(0,10) <= range.to)) throw new Error('empty')
      if (requestId !== sequence.current) return
      restoreView.current = null
      setData({ candles, timeframe: payload.effectiveTimeframe, range, source: payload.source, message: payload.fallbackMessage })
      setRangeLabel(label)
      setHovered(null)
    } catch {
      if (!abort.signal.aborted && requestId === sequence.current) setError('Could not load this view. Your previous chart is preserved. Retry or choose another range.')
    } finally { if (requestId === sequence.current) setBusy(false) }
  }, [symbol])

  useEffect(() => () => { controller.current?.abort(); sequence.current++ }, [])
  useEffect(() => {
    if (!props.initialCandles.length) void load(props.initialRange, props.initialTimeframe, '1Y')
  }, [load, props.initialRange, props.initialTimeframe, props.initialCandles.length])


  // Selecting a historical trade loads its year of context. Selecting inside the
  // current window only highlights it; zooming is always an explicit action.
  useEffect(() => {
    if (!focusTradeId) return
    const trade = trades.find(t => t.id === focusTradeId)
    if (!trade) return
    const day = trade.entryDay ?? fillTradingDay(trade.entryTime)
    if (day < current.current.range.from || day > current.current.range.to) void load(tradeYearRange(trade), '1d', '1Y')
  }, [focusTradeId, trades, load])

  useEffect(() => {
    if (!container.current) return
    const colors = readChartColors()
    const instance = createChart(container.current, {
      autoSize: true,
      layout: { background: { color: colors.background }, textColor: colors.text, fontFamily: 'Inter, sans-serif', fontSize: 11, panes: { separatorColor: colors.border, separatorHoverColor: colors.input, enableResize: true } },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      crosshair: { mode: 0 },
      localization: { timeFormatter: (time: Time) => {
        if (typeof time !== 'number') return ''
        const date = new Date(time * 1000)
        return current.current.timeframe === '1d' ? formatTradingDay(date.toISOString().slice(0,10)) : new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date) + ' ET'
      } },
      rightPriceScale: { borderColor: colors.border, minimumWidth: 72, scaleMargins: { top: .12, bottom: .08 } },
      timeScale: { borderColor: colors.border, timeVisible: true, secondsVisible: false, rightOffset: 8, tickMarkFormatter: (time: Time, type: TickMarkType) => {
        if (current.current.timeframe === '1d' || typeof time !== 'number' || (type !== TickMarkType.Time && type !== TickMarkType.TimeWithSeconds)) return null
        return new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(time * 1000))
      } },
    })
    const candles = instance.addSeries(CandlestickSeries, { upColor: colors.profit, downColor: colors.loss, borderVisible: false, wickUpColor: colors.profit, wickDownColor: colors.loss, priceLineColor: colors.text, priceLineWidth: 1 })
    price.current = candles
    chart.current = instance
    markers.current = createSeriesMarkers(candles, [], { autoScale: false })
    const common = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
    lines.current.ema8 = instance.addSeries(LineSeries, { ...common, color: colors.first, title: '' })
    lines.current.ema21 = instance.addSeries(LineSeries, { ...common, color: colors.second, lineWidth: 2 })
    lines.current.sma50 = instance.addSeries(LineSeries, { ...common, color: colors.third, lineWidth: 2 })
    let pane = 1
    if (showVolume) {
      volume.current = instance.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, title: 'VOL' }, pane++)
      volume.current.priceScale().applyOptions({ scaleMargins: { top: .15, bottom: 0 } })
      lines.current.volume = instance.addSeries(LineSeries, { ...common, color: colors.text, priceFormat: { type: 'volume' } }, pane - 1)
    }
    if (showRsi) {
      lines.current.rsi = instance.addSeries(LineSeries, { ...common, color: colors.third, lastValueVisible: true, title: 'RSI 14', autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) }, pane++)
      lines.current.signal = instance.addSeries(LineSeries, { ...common, color: colors.text }, pane - 1)
      rsiLevels.current = [30, 70].map(level => lines.current.rsi.createPriceLine({ price: level, color: colors.input, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' }))
    }
    instance.panes().forEach((p, index) => p.setStretchFactor(index === 0 ? 6 : 1.15))
    watermark.current = createTextWatermark(instance.panes()[0], { horzAlign: 'center', vertAlign: 'center', lines: [{ text: symbol, color: colors.watermark, fontSize: 100, fontFamily: 'Inter' }] })
    instance.subscribeCrosshairMove(event => {
      if (typeof event.time !== 'number') { setHovered(null); return }
      const point = current.current.candles.find(c => stamp(c.time) === event.time)
      setHovered(point ?? null)
    })
    instance.subscribeClick(event => {
      const match = mappingRef.current.markers.find(marker => marker.id === event.hoveredObjectId)
        ?? mappingRef.current.markers.find(marker => marker.time === event.time)
      if (match) onSelect.current(match.tradeIds[0])
    })
    return () => {
      restoreView.current = instance.timeScale().getVisibleRange()
      instance.remove(); chart.current = null; price.current = null; volume.current = null; markers.current = null; lines.current = {}; watermark.current = null; rsiLevels.current = []
    }
  }, [symbol, showVolume, showRsi])

  useEffect(() => {
    const colors = readChartColors()
    chart.current?.applyOptions({
      layout: { background: { color: colors.background }, textColor: colors.text, panes: { separatorColor: colors.border, separatorHoverColor: colors.input } },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderColor: colors.border }, timeScale: { borderColor: colors.border },
      crosshair: { vertLine: { color: colors.input, labelBackgroundColor: colors.text }, horzLine: { color: colors.input, labelBackgroundColor: colors.text } },
    })
    price.current?.applyOptions({ upColor: colors.profit, downColor: colors.loss, wickUpColor: colors.profit, wickDownColor: colors.loss, priceLineColor: colors.text })
    for (const [name, color] of Object.entries({ ema8: colors.first, ema21: colors.second, sma50: colors.third, volume: colors.text, rsi: colors.third, signal: colors.text })) {
      lines.current[name]?.applyOptions({ color })
    }
    rsiLevels.current.forEach(line => line.applyOptions({ color: colors.input }))
    watermark.current?.applyOptions({ lines: [{ text: symbol, color: colors.watermark, fontSize: 100, fontFamily: 'Inter' }] })
    volume.current?.setData(current.current.candles.map(c => ({ time: stamp(c.time), value: c.volume, color: (c.close >= c.open ? colors.profit : colors.loss) + '65' })))
  }, [theme, symbol, showVolume, showRsi])

  useEffect(() => {
    if (!chart.current || !price.current) return
    const colors = readChartColors()
    const candles = data.candles
    price.current.setData(candles.map(c => ({ ...c, time: stamp(c.time) })))
    const closes = candles.map(c => c.close)
    lines.current.ema8?.setData(lineData(candles, ema(closes, 8)))
    lines.current.ema21?.setData(lineData(candles, ema(closes, 21)))
    lines.current.sma50?.setData(lineData(candles, sma(closes, 50)))
    volume.current?.setData(candles.map(c => ({ time: stamp(c.time), value: c.volume, color: (c.close >= c.open ? colors.profit : colors.loss) + '65' })))
    lines.current.volume?.setData(lineData(candles, sma(candles.map(c => c.volume), 50)))
    const oscillator = rsi(closes)
    lines.current.rsi?.setData(lineData(candles, oscillator))
    const signal = sma(oscillator.filter((value): value is number => value != null), 5)
    const rsiWarmup = Math.max(0, oscillator.findIndex(value => value != null))
    lines.current.signal?.setData(lineData(candles, [...Array<number | null>(rsiWarmup).fill(null), ...signal]))
    chart.current.applyOptions({ timeScale: { timeVisible: data.timeframe !== '1d' } })
    if (candles.length) {
      const view = restoreView.current
      restoreView.current = null
      chart.current.timeScale().setVisibleRange(view ?? { from: stamp(`${data.range.from}T00:00:00Z`), to: stamp(`${data.range.to}T23:59:59Z`) })
    }
  }, [data, showVolume, showRsi])

  useEffect(() => {
    const colors = readChartColors()
    markers.current?.setMarkers(showTrades ? mapping.markers.map(marker => ({ ...marker, color: marker.tradeIds.includes(focusTradeId ?? '') ? colors.primary : marker.text.startsWith('E') ? marker.shape === 'arrowDown' ? colors.loss : colors.profit : colors.fourth, time: marker.time as UTCTimestamp, size: 1 })) : [])
    for (const key of ['ema8', 'ema21', 'sma50']) lines.current[key]?.applyOptions({ visible: showAverages })
  }, [mapping, focusTradeId, showTrades, showAverages, showVolume, showRsi, theme])

  useEffect(() => {
    const colors = readChartColors()
    const series = price.current
    if (!series || !selected || !showLevels) return
    const levels: IPriceLine[] = [series.createPriceLine({ price: selected.entryPrice, color: colors.profit, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Entry' })]
    if (selected.exitPrice != null) levels.push(series.createPriceLine({ price: selected.exitPrice, color: colors.fourth, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Exit' }))
    return () => { if (price.current === series) levels.forEach(line => series.removePriceLine(line)) }
  }, [selected, showLevels, data, showVolume, showRsi, theme])

  function changeTimeframe(timeframe: MarketDataTimeframe) {
    if (timeframe === data.timeframe) return
    if (timeframe === '1d') { void load(yearRange(data.range.to), '1d', '1Y'); return }
    const anchor = selected?.entryDay ?? (selected ? fillTradingDay(selected.entryTime) : data.range.to)
    const end = Math.min(Date.parse(anchor) + 2 * DAY_MS, Date.now())
    void load({ from: new Date(end - (timeframe === '1h' ? 20 : 5) * DAY_MS).toISOString().slice(0, 10), to: new Date(end).toISOString().slice(0, 10) }, timeframe, 'Custom')
  }
  function changeRange(label: string) {
    if (label === 'Latest 1Y') { onSelectTrade(null); void load(yearRange(), '1d', '1Y'); return }
    const end = data.range.to
    const days = label === '3M' ? 90 : label === '6M' ? 180 : 365
    const from = label === 'All trades' && trades.length ? trades.reduce((min, t) => (t.entryDay ?? fillTradingDay(t.entryTime)) < min ? t.entryDay ?? fillTradingDay(t.entryTime) : min, end) : new Date(Date.parse(end) - days * DAY_MS).toISOString().slice(0, 10)
    void load({ from, to: label === 'All trades' ? new Date().toISOString().slice(0, 10) : end }, '1d', label)
  }
  const quote = hovered ?? data.candles.at(-1)
  const inWindow = data.candles.filter(c => c.time.slice(0, 10) >= data.range.from && c.time.slice(0, 10) <= data.range.to)
  return (
    <div className={`chart-terminal flex min-w-0 flex-col ${expanded ? 'fixed inset-0 z-50 min-h-0 bg-zinc-950' : 'h-[820px] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1'}`} data-testid="price-chart" data-timeframe={data.timeframe} data-marker-count={showTrades ? mapping.markers.length : 0} data-mapped-fill-count={mapping.mapped} data-candle-count={inWindow.length} data-range-from={data.range.from} data-range-to={data.range.to}>
      <div className="chart-controls flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Candle interval">
          {(Object.keys(LABELS) as MarketDataTimeframe[]).map(tf => <button type="button" key={tf} aria-pressed={data.timeframe === tf} onClick={() => changeTimeframe(tf)}>{LABELS[tf]}</button>)}
          <span className="mx-2 h-4 w-px bg-zinc-700" />
          {['3M', '6M', '1Y', 'All trades'].map(label => <button type="button" key={label} aria-pressed={data.timeframe === '1d' && rangeLabel === label} onClick={() => changeRange(label)}>{label}</button>)}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => changeRange('Latest 1Y')} title="Return to the latest year">Latest 1Y</button>
          <button type="button" disabled={!selected} onClick={() => selected && void load(focusRange(selected), data.timeframe, 'Trade')}><Focus size={13} />Focus trade</button>
          <button type="button" onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Exit expanded chart' : 'Expand chart'} aria-pressed={expanded}><Maximize2 size={14} /></button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/70 px-4 py-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono" aria-label="Candle values">
          <span className="text-zinc-400">{quote ? (data.timeframe === '1d' ? formatTradingDay(quote.time.slice(0, 10)) : new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(quote.time)) + ' ET') : 'No candles loaded'}</span>
          {quote && <><span>O <b>{formatPrice(quote.open)}</b></span><span>H <b>{formatPrice(quote.high)}</b></span><span>L <b>{formatPrice(quote.low)}</b></span><span>C <b className={quote.close >= quote.open ? 'text-profit' : 'text-loss'}>{formatPrice(quote.close)}</b></span><span>Vol <b>{shortVolume(quote.volume)}</b></span></>}
        </div>
        <span className="text-zinc-400">{formatTradingDay(data.range.from)} — {formatTradingDay(data.range.to)}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[10px]">
        <div className="flex flex-wrap gap-x-4 gap-y-2"><span className="text-chart-1">EMA 8</span><span className="text-chart-2">EMA 21</span><span className="text-chart-3">SMA 50</span>{showVolume && <span className="text-zinc-400">Volume · SMA 50</span>}{showRsi && <span className="text-chart-3">RSI 14 · SMA 5</span>}</div>
        <details className="relative"><summary className="flex cursor-pointer list-none items-center gap-1 text-zinc-300"><Settings2 size={13} />Display</summary><div className="absolute right-0 top-6 z-30 w-48 space-y-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">{[{ label: 'Moving averages', value: showAverages, set: setShowAverages }, { label: 'Volume pane', value: showVolume, set: setShowVolume }, { label: 'RSI pane', value: showRsi, set: setShowRsi }, { label: 'Trade annotations', value: showTrades, set: setShowTrades }, { label: 'Broker price levels', value: showLevels, set: setShowLevels }].map(item => <label key={item.label} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={item.value} onChange={e => item.set(e.target.checked)} />{item.label}</label>)}</div></details>
      </div>
      {(error || data.message) && <div role={error ? 'alert' : 'status'} className="flex flex-wrap items-center justify-between gap-2 border-y border-warning/15 bg-warning/5 px-4 py-2 text-xs text-warning"><span>{error ?? data.message}</span>{error && <button type="button" onClick={() => void load(lastRequest.current.range, lastRequest.current.timeframe, lastRequest.current.label)} className="inline-flex items-center gap-1 underline"><RefreshCw size={12} />Retry</button>}</div>}
      <div className="relative flex min-h-[360px] flex-1 flex-col">
        <div ref={container} className="absolute inset-0" role="img" aria-label={`${symbol} price, volume and RSI chart with trade annotations`} />
        {busy && <div role="status" className="pointer-events-none absolute left-4 top-3 z-20 rounded border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs text-primary">Loading chart…</div>}
        {!data.candles.length && !busy && <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/90"><div className="max-w-xs text-center"><p className="text-sm font-medium">Price history could not be loaded</p><p className="mt-2 text-xs leading-6 text-zinc-400">Your trades are still available in the inspector. Retry to load market context.</p><button type="button" className="action-secondary mt-4" onClick={() => void load(lastRequest.current.range, lastRequest.current.timeframe, lastRequest.current.label)}>Retry chart</button></div></div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-4 py-2 text-[10px] text-zinc-400"><span><span className="text-profit">E</span> Entry · <span className="text-warning">X</span> Exit · Click a marker to inspect a trade</span><span>{mapping.mapped}/{mapping.total} fills mapped to loaded candles · {data.source === 'finviz' ? 'Finviz daily' : data.source === 'yahoo' ? 'Yahoo' : data.source === 'cache-stale' ? 'Cached · stale' : data.source === 'unavailable' ? 'Unavailable' : 'Cached market data'}</span></div>
      <details className="border-t border-zinc-800 px-4 py-2 text-[10px] text-zinc-400"><summary className="cursor-pointer">Chart annotations ({showTrades ? mapping.markers.length : 0})</summary><div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto py-2">{showTrades && mapping.markers.map(marker => <button type="button" key={marker.id} onClick={() => onSelectTrade(marker.tradeIds[0])} className="rounded border border-zinc-700 px-2 py-1 text-left hover:text-foreground" aria-label={`Inspect ${marker.text.startsWith('E') ? 'entry' : 'exit'} marker ${formatTradingDay(new Date(marker.time * 1000).toISOString().slice(0, 10))}`}>{marker.text.startsWith('E') ? 'Entry' : 'Exit'} · {formatTradingDay(new Date(marker.time * 1000).toISOString().slice(0, 10))} · {marker.fillIds.length} fills</button>)}</div></details>
      <p className="px-4 pb-2 text-[10px] leading-5 text-zinc-500">Daily candles may be split-adjusted; the inspector preserves broker fill prices. Date-only fills are annotated on daily charts.</p>
    </div>
  )
}
