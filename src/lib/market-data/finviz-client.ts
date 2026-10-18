import Papa from 'papaparse'
import type { MarketDataCandle } from './yahoo-client'

/** Finviz's daily export uses Date,Open,High,Low,Close,Volume with MM/DD/YYYY
 * dates; prices may be split-adjusted. Never treat an HTML/login response as prices.
 * Broker fill prices are not adjusted here or overwritten with quote prices. */
export function parseFinvizDailyCsv(csv: string): MarketDataCandle[] {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy' })
  const required = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
  if (parsed.errors.length || !required.every(key => parsed.meta.fields?.includes(key))) throw new Error('finviz_invalid_export')
  const byDay = new Map<string, MarketDataCandle>()
  for (const row of parsed.data) {
    const date = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(row.Date.trim())
    const day = date ? `${date[3]}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}` : row.Date.trim()
    const time = `${day}T00:00:00.000Z`
    const instant = new Date(time)
    const values = required.slice(1).map(key => row[key]?.trim() ? Number(row[key]) : NaN)
    const [open, high, low, close, volume] = values
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(instant.getTime()) || instant.toISOString() !== time
      || !values.every(Number.isFinite) || Math.min(open, low, close) <= 0 || high < Math.max(open, close, low)
      || low > Math.min(open, close) || !Number.isSafeInteger(volume) || volume < 0 || byDay.has(day)) throw new Error('finviz_invalid_candle')
    byDay.set(day, { time, open, high, low, close, volume })
  }
  if (!byDay.size) throw new Error('finviz_empty_export')
  return [...byDay.values()].sort((a, b) => a.time.localeCompare(b.time))
}

export async function fetchFinvizDaily(options: { symbol: string; from: Date; to: Date }, deps: { token?: string; fetcher?: typeof fetch } = {}): Promise<MarketDataCandle[]> {
  const token = deps.token ?? process.env.AURATRADE_FINVIZ_TOKEN
  if (!token) throw new Error('finviz_not_configured')
  // Canonical URL: the old .ashx URL redirects. Refuse redirects to avoid sending
  // the private token to an unexpected host. Never log this URL or upstream errors.
  const url = new URL('https://elite.finviz.com/quote_export')
  url.searchParams.set('t', options.symbol)
  url.searchParams.set('p', 'd')
  url.searchParams.set('auth', token)
  try {
    const response = await (deps.fetcher ?? fetch)(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) })
    if (!response.ok) throw new Error('upstream_failed')
    const candles = parseFinvizDailyCsv(await response.text())
    const from = options.from.toISOString().slice(0, 10)
    const to = options.to.toISOString().slice(0, 10)
    const inRange = candles.filter(c => c.time.slice(0, 10) >= from && c.time.slice(0, 10) <= to)
    if (!inRange.length) throw new Error('empty_range')
    return inRange
  } catch {
    // Fetch exceptions can contain the URL (and token). Discard the entire cause.
    throw new Error('finviz_market_data_unavailable')
  }
}
