# Trade-review chart

The default view is a complete year of daily candles. A linked historical closed
trade gets a year ending 30 days after its close (capped at today), so the trade is
visible in its historical market context. Open trades and symbols without a selected
trade open at the latest year. The toolbar always displays the actual date window.

- **3M / 6M / 1Y:** explicit daily windows ending at the current review date.
- **Latest 1Y:** return to current market context and clear the selection.
- **All trades:** load from the first entry through today.
- **Focus trade:** deliberately zoom around the selected position's entry and exit.
- **1D / 1H / 15M / 5M / 1M:** explicit candle intervals. Wheel zoom and pan never
  change them. Unsupported historical intraday ranges report a daily fallback, and
  the active interval reflects the candles actually returned.
- **Display:** toggle annotations, moving averages, volume, RSI and broker price levels.
  Price/volume/RSI share one time scale; their price scales remain independent.
- **Inspector:** filter the trade list, select a position and examine its original fills.
  Compact E/X markers group crowded fills; selecting a marker opens its trade. A
  keyboard-accessible annotations list provides the same selection outside the canvas.

A failed range request preserves the previous chart. Retry repeats the failed request.
Pending requests are aborted when superseded, and late responses cannot overwrite the
latest view. Price loading happens after the trade page renders, so a slow provider
cannot block the inspector or navigation.

## Data assumptions

Finviz daily export was verified directly against the official
`https://elite.finviz.com/quote_export` endpoint using the owner's token. It returns
`Date,Open,High,Low,Close,Volume` CSV with MM/DD/YYYY dates. The canonical URL avoids
redirects; token-bearing requests disable HTTP redirects and the Next.js fetch cache.
The token stays in the server environment. Errors are replaced with fixed messages
before logging or returning an API response. HTML/login responses, duplicate dates,
invalid OHLC/volume values and malformed dates fail validation.

Daily quotes may be split-adjusted. Broker fill prices are preserved; no chart action
rewrites trades, fees or P&L. Exact broker price levels are optional because they may
not share a historical quote's adjustment basis. Markers attach to actual candle dates
above/below bars rather than forcing the price axis to include unadjusted fill prices.

Daily fill dates use known exchange trading dates at position boundaries. Legacy
UTC-midnight fills represent date-only exports; other timestamps use America/New_York.
TradeFill does not store a precision field per fill: unknown UTC-midnight fills are
conservatively excluded from intraday markers. Missing sessions are never snapped to
an adjacent trading day. The footer reports mapped fills against all fills, including
those outside the loaded window.

The existing shared OHLCV cache retains its schema. Its `cache` label does not claim
provider provenance for older records. Finviz is preferred for new daily fetches when
configured; Yahoo supplies intraday and daily fallback. No quote data is presented as
a guaranteed live execution feed.

Daily cache timestamps are normalized to UTC midnight. Legacy rows from different
providers on the same date collapse to the most recently fetched quote without
deleting stored data. Current daily views reuse a recently refreshed latest session
over weekends/holidays, within the existing three-day coverage tolerance.

## Indicators

- SMA(n): mean of the latest n values; no value before n observations.
- EMA(n): alpha = 2/(n+1), seeded with SMA(n), then
  EMA = alpha * close + (1-alpha) * previous EMA.
- Volume SMA 50: the same SMA applied to volume.
- RSI 14: seed average gain/loss from 14 price changes; Wilder smoothing is
  (previous average * 13 + current gain/loss) / 14. RSI = 100 - 100/(1+gain/loss).
  No losses means 100; a flat series means neutral 50. Its signal is SMA 5 of RSI.

Unit tests cover these formulas, timezone alignment, marker grouping and missing bars,
Finviz validation/fallback and secret-safe errors. Browser tests use synthetic prices
and broker statements to exercise a full-year view, annotations, inspector selection,
interval stability, indicator toggles, focus/reset, retry, symbol navigation and mobile.
