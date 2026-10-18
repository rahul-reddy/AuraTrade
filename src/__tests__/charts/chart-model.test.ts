import { buildTradeMarkers, normalizeCandles, ema, sma, rsi, fillTradingDay, yearRange, tradeYearRange, type ChartTrade } from '@/lib/charts/chart-model'
import type { MarketDataCandle } from '@/lib/market-data/yahoo-client'
const candle = (time: string): MarketDataCandle => ({ time, open: 100, high: 105, low: 98, close: 103, volume: 1000 })
const trade: ChartTrade = { id: 'long', direction: 'LONG', entryTime: '2026-03-13T14:31:00Z', exitTime: '2026-03-13T19:59:00Z', entryPrice: 100, exitPrice: 104, totalQty: 10, netPnl: 40, isOpen: false, durationSeconds: 120, setup: null, fills: [ { id: 'entry', side: 'BUY', kind: 'OPEN', qty: 10, price: 100, time: '2026-03-13T14:31:00Z' }, { id: 'exit', side: 'SELL', kind: 'CLOSE', qty: 10, price: 104, time: '2026-03-13T19:59:00Z' } ] }

describe('chart indicators', () => {
  it('does not invent moving-average history before the warm-up', () => {
    expect(sma([1,2,3,10], 3)).toEqual([null, null, 2, 5])
    expect(ema([1,2,3,10], 3)).toEqual([null, null, 2, 6])
    expect(ema([1,2], 8)).toEqual([null, null])
  })
  it('matches Wilder RSI reference values and smooths subsequent changes', () => {
    const values = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03]
    const result = rsi(values)
    expect(result.slice(0,14)).toEqual(Array(14).fill(null))
    expect(result[14]).toBeCloseTo(70.4641, 3)
    expect(result[15]).toBeCloseTo(66.2496, 3)
    expect(result[16]).toBeCloseTo(66.4809, 3)
  })
  it('handles zero losses, zero gains and flat prices without division artifacts', () => {
    expect(rsi(Array.from({length: 20}, (_, i) => i + 1)).at(-1)).toBe(100)
    expect(rsi(Array.from({length: 20}, (_, i) => 30 - i)).at(-1)).toBe(0)
    expect(rsi(Array(20).fill(100)).at(-1)).toBe(50)
  })
})
describe('chart trading days and annotations', () => {
  it('keeps legacy UTC-midnight dates and resolves after-hours timestamps in New York', () => {
    expect(fillTradingDay('2026-03-13T00:00:00.000Z')).toBe('2026-03-13')
    expect(fillTradingDay('2026-01-14T00:30:00.000Z')).toBe('2026-01-13')
    expect(fillTradingDay('2026-07-14T00:30:00.000Z')).toBe('2026-07-13')
    expect(fillTradingDay('2026-07-14T00:00:00.000Z', '2026-07-13')).toBe('2026-07-13')
  })
  it('normalizes Yahoo daily timestamps and maps timestamped fills to actual daily bars', () => {
    const candles = normalizeCandles([candle('2026-03-13T13:30:00Z')], '1d')
    const result = buildTradeMarkers([trade], candles, '1d')
    expect(result.mapped).toBe(2)
    expect(result.markers.every(m => m.time === Date.parse('2026-03-13T00:00:00Z') / 1000)).toBe(true)
    expect(result.markers.map(m => m.text)).toEqual(['E', 'X'])
  })
  it('maps intraday fills within their candle interval, never across session gaps', () => {
    const fills = [trade.fills[0], { ...trade.fills[1], time: '2026-03-13T14:45:00Z' }, { ...trade.fills[0], id: 'missing', time: '2026-03-13T18:00:00Z' }]
    const result = buildTradeMarkers([{...trade, fills}], [candle('2026-03-13T14:30:00Z'), candle('2026-03-13T14:45:00Z')], '15m')
    expect(result.mapped).toBe(2)
    expect(result.markers[0].time).toBe(Date.parse('2026-03-13T14:30:00Z') / 1000)
    expect(result.markers[1].time).toBe(Date.parse('2026-03-13T14:45:00Z') / 1000)
  })
  it('does not invent intraday execution times for date-only statements or snap missing days', () => {
    const dateOnly = {...trade, fills: [{...trade.fills[0], time: '2026-03-13T00:00:00.000Z'}]}
    expect(buildTradeMarkers([dateOnly], [candle('2026-03-13T14:30:00Z')], '1h').mapped).toBe(0)
    expect(buildTradeMarkers([trade], [candle('2026-03-12T00:00:00Z')], '1d').mapped).toBe(0)
  })
  it('groups crowded markers without losing fills or trade identities', () => {
    const result = buildTradeMarkers([trade, {...trade, id: 'other', fills: [{...trade.fills[0], id: 'second'}]}], [candle('2026-03-13T00:00:00Z')], '1d')
    expect(result.mapped).toBe(3)
    expect(result.markers[0].text).toBe('E×2')
    expect(result.markers[0].tradeIds).toEqual(['long', 'other'])
    expect(result.markers[0].fillIds).toEqual(['entry', 'second'])
  })
  it('distinguishes short opens from covers, retaining broker prices', () => {
    const short = {...trade, direction: 'SHORT', fills: [{...trade.fills[0], side: 'SELL_SHORT'},{...trade.fills[1], side: 'BUY_TO_COVER'}]}
    const markers = buildTradeMarkers([short], [candle('2026-03-13T00:00:00Z')], '1d').markers
    expect(markers[0]).toMatchObject({shape:'arrowDown', color:'#fb7185',text:'E'})
    expect(markers[1]).toMatchObject({shape:'arrowUp', color:'#fbbf24',text:'X'})
    expect(short.fills[0].price).toBe(100)
  })
  it('orders and deduplicates candles and excludes invalid price data', () => {
    const rows = normalizeCandles([candle('2026-03-14T14:30:00Z'), candle('2026-03-13T14:30:00Z'), candle('2026-03-13T13:30:00Z'), {...candle('2026-03-15T00:00:00Z'), close: 999}], '1d')
    expect(rows.map(c => c.time.slice(0,10))).toEqual(['2026-03-13','2026-03-14'])
  })
  it('defaults to a full year and provides historical context without zooming to one trade', () => {
    expect(yearRange('2026-10-18T00:00:00Z')).toEqual({from:'2025-10-18', to:'2026-10-18'})
    const range = tradeYearRange(trade, new Date('2027-10-18T00:00:00Z'))
    expect(Date.parse(range.to) - Date.parse(range.from)).toBeGreaterThanOrEqual(365 * 86400000)
    expect(tradeYearRange({...trade,isOpen:true},new Date('2027-10-18T00:00:00Z')).to).toBe('2027-10-18')
  })
})
