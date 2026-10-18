import type { MarketDataCandle, MarketDataTimeframe } from '@/lib/market-data/yahoo-client'

export interface ChartFill {
  id: string
  side: string
  kind?: 'OPEN' | 'CLOSE'
  qty: number
  price: number
  time: string
  day?: string
}
export interface ChartTrade {
  id: string
  direction: string
  entryTime: string
  exitTime: string | null
  entryDay?: string
  exitDay?: string | null
  entryPrice: number
  exitPrice: number | null
  totalQty: number
  netPnl: number | null
  isOpen: boolean
  durationSeconds: number | null
  setup: string | null
  fills: ChartFill[]
}
export type ChartRange = { from: string; to: string }
export const DAY_MS = 86_400_000
const DURATIONS: Record<MarketDataTimeframe, number> = { '1d': DAY_MS, '1h': 3_600_000, '15m': 900_000, '5m': 300_000, '1m': 60_000 }

/** Legacy date-only fills are stored at UTC midnight. Known entry/exit trading
 * dates override that convention; other timestamped fills use the NY session day.
 * TradeFill has no per-fill precision field, so midnight fills are conservatively
 * excluded from intraday annotations rather than inventing an execution time. */
export function fillTradingDay(instant: string, knownDay?: string | null): string {
  if (knownDay) return knownDay.slice(0, 10)
  if (instant.endsWith('T00:00:00.000Z')) return instant.slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant))
}

export function yearRange(anchor: string = new Date().toISOString()): ChartRange {
  const to = new Date(anchor)
  const from = new Date(to)
  from.setUTCFullYear(from.getUTCFullYear() - 1)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

export function tradeYearRange(trade: ChartTrade | undefined, now = new Date()): ChartRange {
  const latest = yearRange(now.toISOString())
  if (!trade || trade.isOpen || (trade.entryDay ?? fillTradingDay(trade.entryTime)) >= latest.from) return latest
  const end = Math.min(new Date(`${trade.exitDay ?? trade.entryDay ?? fillTradingDay(trade.exitTime ?? trade.entryTime)}T00:00:00Z`).getTime() + 30 * DAY_MS, now.getTime())
  return yearRange(new Date(end).toISOString())
}

export function focusRange(trade: ChartTrade, now = new Date()): ChartRange {
  return {
    from: new Date(new Date(`${trade.entryDay ?? fillTradingDay(trade.entryTime)}T00:00:00Z`).getTime() - 20 * DAY_MS).toISOString().slice(0, 10),
    to: new Date(Math.min(new Date(`${trade.exitDay ?? fillTradingDay(trade.exitTime ?? now.toISOString())}T00:00:00Z`).getTime() + 20 * DAY_MS, now.getTime())).toISOString().slice(0, 10),
  }
}

export function normalizeCandles(candles: MarketDataCandle[], timeframe: MarketDataTimeframe): MarketDataCandle[] {
  const byTime = new Map<string, MarketDataCandle>()
  for (const candle of candles) {
    const values = [candle.open, candle.high, candle.low, candle.close, candle.volume]
    if (!Number.isFinite(Date.parse(candle.time)) || !values.every(Number.isFinite) || candle.low <= 0 || candle.high < Math.max(candle.open, candle.close, candle.low) || candle.low > Math.min(candle.open, candle.close) || candle.volume < 0) continue
    const time = timeframe === '1d' ? `${candle.time.slice(0, 10)}T00:00:00.000Z` : new Date(candle.time).toISOString()
    byTime.set(time, { ...candle, time })
  }
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time))
}

export function sma(values: number[], period: number): Array<number | null> {
  let sum = 0
  return values.map((value, index) => {
    sum += value
    if (index >= period) sum -= values[index - period]
    return index >= period - 1 ? sum / period : null
  })
}
export function ema(values: number[], period: number): Array<number | null> {
  const seed = sma(values, period)
  let previous: number | null = null
  return values.map((value, index) => {
    if (index < period - 1) return null
    previous = previous == null ? seed[index] : value * (2 / (period + 1)) + previous * (1 - 2 / (period + 1))
    return previous
  })
}
/** Wilder RSI: seed with 14 changes, then (previous * 13 + change) / 14.
 * No losses => 100; no gains/losses => neutral 50 (never NaN). */
export function rsi(values: number[], period = 14): Array<number | null> {
  let gains = 0
  let losses = 0
  return values.map((value, index) => {
    if (index === 0) return null
    const change = value - values[index - 1]
    if (index <= period) { gains += Math.max(0, change) / period; losses += Math.max(0, -change) / period }
    else { gains = (gains * (period - 1) + Math.max(0, change)) / period; losses = (losses * (period - 1) + Math.max(0, -change)) / period }
    return index < period ? null : losses === 0 ? gains === 0 ? 50 : 100 : 100 - 100 / (1 + gains / losses)
  })
}

export interface TradeMarker {
  id: string
  time: number
  position: 'aboveBar' | 'belowBar'
  shape: 'arrowUp' | 'arrowDown'
  color: string
  text: string
  tradeIds: string[]
  fillIds: string[]
}
export function buildTradeMarkers(trades: ChartTrade[], candles: MarketDataCandle[], timeframe: MarketDataTimeframe, selectedId: string | null = null) {
  const bars = candles.map(c => Date.parse(c.time))
  const dailyBars = new Map(candles.map((c, i) => [c.time.slice(0, 10), bars[i]]))
  const groups = new Map<string, TradeMarker>()
  let mapped = 0
  let total = 0
  for (const trade of trades) for (const fill of trade.fills) {
    total++
    let bar: number | undefined
    if (timeframe === '1d') bar = dailyBars.get(fill.day ?? fillTradingDay(fill.time))
    else if (!fill.time.endsWith('T00:00:00.000Z')) {
      const time = Date.parse(fill.time)
      // Binary search: match a real bar interval, never snap across missing sessions.
      let low = 0; let high = bars.length - 1
      while (low <= high) { const mid = (low + high) >>> 1; if (bars[mid] <= time) low = mid + 1; else high = mid - 1 }
      if (high >= 0 && time < bars[high] + DURATIONS[timeframe]) bar = bars[high]
    }
    if (bar == null) continue
    mapped++
    const buy = fill.side === 'BUY' || fill.side === 'BUY_TO_COVER'
    const open = fill.kind ? fill.kind === 'OPEN' : trade.direction === 'SHORT' ? fill.side === 'SELL_SHORT' : fill.side === 'BUY'
    const key = `${bar}:${open ? 'entry' : 'exit'}:${buy}:${selectedId === trade.id}`
    const previous = groups.get(key)
    if (previous) { previous.fillIds.push(fill.id); if (!previous.tradeIds.includes(trade.id)) previous.tradeIds.push(trade.id); previous.text = `${open ? 'E' : 'X'}×${previous.fillIds.length}`; continue }
    groups.set(key, { id: `fill:${fill.id}`, time: bar / 1000, position: buy ? 'belowBar' : 'aboveBar', shape: buy ? 'arrowUp' : 'arrowDown', color: selectedId === trade.id ? '#60a5fa' : open ? trade.direction === 'SHORT' ? '#fb7185' : '#2dd4bf' : '#fbbf24', text: open ? 'E' : 'X', tradeIds: [trade.id], fillIds: [fill.id] })
  }
  return { markers: [...groups.values()].sort((a, b) => a.time - b.time), mapped, total }
}
