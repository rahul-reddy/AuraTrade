import { fetchFinvizDaily } from './finviz-client'
import { fetchYahooMarketData, normalizeMarketDataSymbol, resolvePreferredMarketDataTimeframe, INTRADAY_FALLBACK_MESSAGE, type FetchYahooMarketDataOptions, type FetchYahooMarketDataResult } from './yahoo-client'

export async function fetchChartMarketData(options: FetchYahooMarketDataOptions): Promise<FetchYahooMarketDataResult> {
  options = { ...options, symbol: normalizeMarketDataSymbol(options.symbol) }
  const daily = resolvePreferredMarketDataTimeframe(options.timeframe, options.from, options.to, options.now) === '1d'
  if (daily && process.env.AURATRADE_FINVIZ_TOKEN) {
    try {
      const candles = await fetchFinvizDaily(options)
      return { symbol: options.symbol, requestedTimeframe: options.timeframe, effectiveTimeframe: '1d', candles, provider: 'finviz', fallbackMessage: options.timeframe === '1d' ? null : INTRADAY_FALLBACK_MESSAGE }
    } catch {
      const result = await fetchYahooMarketData(options)
      return { ...result, provider: 'yahoo', fallbackMessage: [result.fallbackMessage, 'Finviz unavailable. Showing Yahoo candles.'].filter(Boolean).join(' ') }
    }
  }
  return { ...await fetchYahooMarketData(options), provider: 'yahoo' }
}
