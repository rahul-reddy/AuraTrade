/**
 * Phase 7.5 — Trade Context Enrichment Pipeline
 *
 * For each round-trip trade, fetches daily OHLCV across the full trade span for
 * the traded symbol (plus warmup buffer)
 * and computes technical context (SMA/EMA/ATR/RSI/ADX/BBands, 52w range, gap %,
 * market regime via SPY, nearest earnings date) at the trade's entry date.
 *
 * Result is upserted into TradeContext. RoundTripTrade.initialRisk is also set
 * to 1.5 × ATR(14) when not already user-defined.
 *
 * Runs async (fire-and-forget) after upload confirmation. Progress is tracked
 * in module-level state for polling via GET /api/enrich/status.
 */

import YahooFinance from 'yahoo-finance2'
import { SMA, EMA, ATR, RSI, ADX, BollingerBands } from 'technicalindicators'
import { prisma as defaultPrisma } from '@/lib/prisma'
import type { PrismaClient } from '@/generated/prisma'

// ─── types ────────────────────────────────────────────────────────────

export interface DailyCandle {
  date: Date
  open: number
  high: number
  low: number
  close: number
}

export interface IndicatorSnapshot {
  sma20: number
  sma50: number
  sma200: number
  ema20: number
  atr14: number
  rsi14: number
  adx14: number
  bbUpper: number
  bbLower: number
  highN52w: number
  lowN52w: number
  prevClose: number
  gapPercent: number
}

export interface EnrichmentProgress {
  accountId: string
  /** Total symbols to process */
  total: number
  /** Symbols processed (success or skipped) */
  enriched: number
  /** Trades successfully upserted */
  tradesEnriched: number
  done: boolean
  errorCount: number
  startedAt: Date
  finishedAt?: Date
  rerunRequested?: boolean
}

export interface EnrichmentDataSource {
  fetchDailyHistory(symbol: string, startDate: Date, endDate: Date): Promise<DailyCandle[]>
  fetchEarningsDates(symbol: string): Promise<Date[]>
}

// ─── in-process progress store ────────────────────────────────────────
// Suitable for local dev. For SaaS, move to a DB-backed job queue.

const activeJobs = new Map<string, EnrichmentProgress>()

export function getEnrichmentProgress(accountId: string): EnrichmentProgress | null {
  return activeJobs.get(accountId) ?? null
}

// ─── yahoo client singleton ───────────────────────────────────────────

const yahoo = new YahooFinance() as unknown as {
  chart(
    symbol: string,
    opts: { period1: Date; period2: Date; interval: '1d'; includePrePost: boolean; return: 'array' },
  ): Promise<{ quotes: Array<{ date: Date; open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null }> }>
  quoteSummary(
    symbol: string,
    opts: { modules: string[] },
  ): Promise<{
    calendarEvents?: {
      earnings?: {
        earningsDate?: Date[]
      }
    }
  }>
}

// ─── helpers ──────────────────────────────────────────────────────────

/**
 * Fetch daily OHLCV from `startDate` through `endDate` for `symbol`.
 * Returns candles sorted ascending by date.
 */
async function fetchDailyHistory(symbol: string, startDate: Date, endDate: Date): Promise<DailyCandle[]> {
  const result = await yahoo.chart(symbol, {
    period1: startDate,
    period2: endDate,
    interval: '1d',
    includePrePost: false,
    return: 'array',
  })

  return result.quotes
    .filter(
      (q) =>
        q.open != null && q.high != null && q.low != null && q.close != null,
    )
    .map((q) => ({
      date: q.date,
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

async function fetchEarningsDates(symbol: string): Promise<Date[]> {
  const summary = await yahoo.quoteSummary(symbol, { modules: ['calendarEvents'] })
  return summary.calendarEvents?.earnings?.earningsDate ?? []
}

/**
 * Find the index of `target` in `candles` — the last candle whose date is
 * <= target (i.e., the most-recent trading day at or before `target`).
 * Returns -1 if no such candle exists.
 *
 * Exported for unit testing.
 */
export function findDateIndex(candles: DailyCandle[], target: Date): number {
  const targetMs = target.getTime()
  let idx = -1
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].date.getTime() <= targetMs) {
      idx = i
    } else {
      break
    }
  }
  return idx
}

/**
 * Compute technical indicators from OHLCV data at a specific entry date.
 * Returns null if there is insufficient history.
 *
 * Exported for unit testing.
 */
export function computeIndicators(
  candles: DailyCandle[],
  entryDate: Date,
): IndicatorSnapshot | null {
  const idx = findDateIndex(candles, entryDate)
  // Need at least 29 data points: ADX(14) requires 28 to produce its first value
  // (2× the period), and we need 1 extra for prevClose.
  if (idx < 28) return null

  // Slice all data up to and including the entry date
  const slice = candles.slice(0, idx + 1)
  const closes = slice.map((c) => c.close)
  const highs = slice.map((c) => c.high)
  const lows = slice.map((c) => c.low)

  // Helper: last value of indicator output, or null
  function last<T>(arr: T[]): T | null {
    return arr.length > 0 ? arr[arr.length - 1] : null
  }

  const sma20Last = last(SMA.calculate({ period: 20, values: closes }))
  const sma50Last = last(SMA.calculate({ period: 50, values: closes }))
  const sma200Last = last(SMA.calculate({ period: 200, values: closes }))
  const ema20Last = last(EMA.calculate({ period: 20, values: closes }))
  const atrLast = last(ATR.calculate({ period: 14, high: highs, low: lows, close: closes }))
  const rsiLast = last(RSI.calculate({ period: 14, values: closes }))
  const adxResult = last(ADX.calculate({ period: 14, high: highs, low: lows, close: closes }))
  const bbResult = last(BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }))

  // All core indicators must be computable
  if (
    sma20Last == null ||
    ema20Last == null ||
    atrLast == null ||
    rsiLast == null ||
    adxResult == null ||
    bbResult == null
  ) {
    return null
  }

  // 52-week range: look back ~252 trading days from entry
  const lookbackStart = Math.max(0, idx - 251)
  const rangeSlice = candles.slice(lookbackStart, idx + 1)
  const highN52w = Math.max(...rangeSlice.map((c) => c.high))
  const lowN52w = Math.min(...rangeSlice.map((c) => c.low))

  // Previous trading day close
  const prevClose = candles[idx - 1].close

  // Gap percent: (entry day open - prev close) / prev close
  const entryOpen = candles[idx].open
  const gapPercent = prevClose !== 0 ? (entryOpen - prevClose) / prevClose : 0

  return {
    sma20: sma20Last,
    sma50: sma50Last ?? sma20Last,      // fall back to sma20 if insufficient data
    sma200: sma200Last ?? sma20Last,    // fall back to sma20 if insufficient data
    ema20: ema20Last,
    atr14: atrLast,
    rsi14: rsiLast,
    adx14: adxResult.adx,
    bbUpper: bbResult.upper,
    bbLower: bbResult.lower,
    highN52w,
    lowN52w,
    prevClose,
    gapPercent,
  }
}

/**
 * Classify SPY market regime at `entryDate`.
 *
 * TRENDING_UP   — SPY close > SMA20 > SMA50
 * TRENDING_DOWN — SPY close < SMA20 < SMA50
 * CHOPPY        — otherwise
 *
 * Exported for unit testing.
 */
export function classifyMarketRegime(
  spyCandles: DailyCandle[],
  entryDate: Date,
): 'TRENDING_UP' | 'TRENDING_DOWN' | 'CHOPPY' {
  const idx = findDateIndex(spyCandles, entryDate)
  if (idx < 49) return 'CHOPPY'

  const slice = spyCandles.slice(0, idx + 1)
  const closes = slice.map((c) => c.close)

  const sma20s = SMA.calculate({ period: 20, values: closes })
  const sma50s = SMA.calculate({ period: 50, values: closes })

  if (sma20s.length === 0 || sma50s.length === 0) return 'CHOPPY'

  const spyClose = closes[closes.length - 1]
  const sma20 = sma20s[sma20s.length - 1]
  const sma50 = sma50s[sma50s.length - 1]

  if (spyClose > sma20 && sma20 > sma50) return 'TRENDING_UP'
  if (spyClose < sma20 && sma20 < sma50) return 'TRENDING_DOWN'
  return 'CHOPPY'
}

/**
 * Find nearest earnings date to `entryDate` and return days-to-earnings
 * (negative = earnings already passed, positive = upcoming).
 */
export function resolveNearestEarnings(
  earningsDates: Date[],
  entryDate: Date,
): { nearestEarningsDate: Date | null; daysToEarnings: number | null } {
  if (earningsDates.length === 0) {
    return { nearestEarningsDate: null, daysToEarnings: null }
  }

  const entryMs = entryDate.getTime()
  let nearest = earningsDates[0]
  let minDiff = Math.abs(earningsDates[0].getTime() - entryMs)

  for (const d of earningsDates) {
    const diff = Math.abs(d.getTime() - entryMs)
    if (diff < minDiff) {
      minDiff = diff
      nearest = d
    }
  }

  const daysToEarnings = Math.round((nearest.getTime() - entryMs) / (24 * 60 * 60 * 1000))
  return { nearestEarningsDate: nearest, daysToEarnings }
}

const defaultDataSource: EnrichmentDataSource = {
  fetchDailyHistory,
  fetchEarningsDates,
}

// ─── main enrichment runner ───────────────────────────────────────────

async function runEnrichmentJob(
  accountId: string,
  db: PrismaClient,
  dataSource: EnrichmentDataSource,
): Promise<void> {
  const progress = activeJobs.get(accountId)
  if (!progress) return
  progress.rerunRequested = false

  try {
    // Load all closed trades for this account (open trades have no exit, less useful)
    // We enrich both open and closed trades so classifiers can use context even for
    // open positions, but open trades may have incomplete data.
    const trades = await db.roundTripTrade.findMany({
      where: { accountId },
      select: { id: true, symbol: true, entryTime: true, initialRisk: true },
    })

    if (trades.length === 0) {
      progress.done = true
      progress.finishedAt = new Date()
      return
    }

    // Group trades by symbol
    const bySymbol = new Map<string, typeof trades>()
    for (const trade of trades) {
      const existing = bySymbol.get(trade.symbol) ?? []
      existing.push(trade)
      bySymbol.set(trade.symbol, existing)
    }

    const symbols = [...bySymbol.keys()]
    progress.total = symbols.length

    // Fetch SPY data for market regime — use the max entry date as the end date
    const latestEntry = trades.reduce(
      (max, t) => (t.entryTime > max ? t.entryTime : max),
      trades[0].entryTime,
    )
    const earliestEntry = trades.reduce(
      (min, t) => (t.entryTime < min ? t.entryTime : min),
      trades[0].entryTime,
    )
    // Add a few days of buffer for the latest entry
    const spyEnd = new Date(latestEntry)
    spyEnd.setDate(spyEnd.getDate() + 5)
    const spyStart = new Date(earliestEntry)
    spyStart.setDate(spyStart.getDate() - 400)

    let spyCandles: DailyCandle[] = []
    try {
      spyCandles = await dataSource.fetchDailyHistory('SPY', spyStart, spyEnd)
    } catch {
      // SPY fetch failure → all regimes become CHOPPY (graceful degradation)
    }

    // Process each symbol
    for (const symbol of symbols) {
      const symbolTrades = bySymbol.get(symbol)!

      // Latest entry date for this symbol (fetch OHLCV up to that date + buffer)
      const symbolLatest = symbolTrades.reduce(
        (max, t) => (t.entryTime > max ? t.entryTime : max),
        symbolTrades[0].entryTime,
      )
      const symbolEarliest = symbolTrades.reduce(
        (min, t) => (t.entryTime < min ? t.entryTime : min),
        symbolTrades[0].entryTime,
      )
      const fetchStart = new Date(symbolEarliest)
      fetchStart.setDate(fetchStart.getDate() - 400)
      const fetchEnd = new Date(symbolLatest)
      fetchEnd.setDate(fetchEnd.getDate() + 5)

      let candles: DailyCandle[] = []
      try {
        candles = await dataSource.fetchDailyHistory(symbol, fetchStart, fetchEnd)
      } catch {
        progress.errorCount++
        progress.enriched++
        continue
      }

      let earningsDates: Date[] = []
      try {
        earningsDates = await dataSource.fetchEarningsDates(symbol)
      } catch {
        // earnings optional
      }

      // Upsert TradeContext for each trade of this symbol
      for (const trade of symbolTrades) {
        const indicators = computeIndicators(candles, trade.entryTime)
        if (indicators == null) continue

        const regime = classifyMarketRegime(spyCandles, trade.entryTime)
        const earnings = resolveNearestEarnings(earningsDates, trade.entryTime)

        await db.tradeContext.upsert({
          where: { tradeId: trade.id },
          update: {
            sma20: indicators.sma20,
            sma50: indicators.sma50,
            sma200: indicators.sma200,
            ema20: indicators.ema20,
            atr14: indicators.atr14,
            rsi14: indicators.rsi14,
            adx14: indicators.adx14,
            bbUpper: indicators.bbUpper,
            bbLower: indicators.bbLower,
            highN52w: indicators.highN52w,
            lowN52w: indicators.lowN52w,
            prevClose: indicators.prevClose,
            gapPercent: indicators.gapPercent,
            nearestEarningsDate: earnings.nearestEarningsDate ?? undefined,
            daysToEarnings: earnings.daysToEarnings ?? undefined,
            marketRegime: regime,
            enrichedAt: new Date(),
          },
          create: {
            tradeId: trade.id,
            sma20: indicators.sma20,
            sma50: indicators.sma50,
            sma200: indicators.sma200,
            ema20: indicators.ema20,
            atr14: indicators.atr14,
            rsi14: indicators.rsi14,
            adx14: indicators.adx14,
            bbUpper: indicators.bbUpper,
            bbLower: indicators.bbLower,
            highN52w: indicators.highN52w,
            lowN52w: indicators.lowN52w,
            prevClose: indicators.prevClose,
            gapPercent: indicators.gapPercent,
            nearestEarningsDate: earnings.nearestEarningsDate ?? undefined,
            daysToEarnings: earnings.daysToEarnings ?? undefined,
            marketRegime: regime,
          },
        })

        // Set initialRisk = 1.5 × ATR14 if not already user-defined
        if (trade.initialRisk == null) {
          await db.roundTripTrade.update({
            where: { id: trade.id },
            data: { initialRisk: indicators.atr14 * 1.5, riskSource: 'ATR' },
          })
        }

        progress.tradesEnriched++
      }

      progress.enriched++
    }
  } catch (err) {
    progress.errorCount++
    console.error('[trade-enrichment] Unexpected error:', err)
  } finally {
    progress.done = true
    progress.finishedAt = new Date()
    if (progress.rerunRequested) {
      progress.rerunRequested = false
      startEnrichment(accountId, db, dataSource)
    }
  }
}

// ─── public API ───────────────────────────────────────────────────────

/**
 * Start enrichment for `accountId` as a fire-and-forget background task.
 * Returns immediately. Poll `getEnrichmentProgress(accountId)` for status.
 *
 * If enrichment is already running for this account, this is a no-op.
 */
export function startEnrichment(
  accountId: string,
  db: PrismaClient = defaultPrisma,
  dataSource: EnrichmentDataSource = defaultDataSource,
): void {
  const existing = activeJobs.get(accountId)
  if (existing && !existing.done) {
    existing.rerunRequested = true
    return
  }

  const progress: EnrichmentProgress = {
    accountId,
    total: 0,
    enriched: 0,
    tradesEnriched: 0,
    done: false,
    errorCount: 0,
    startedAt: new Date(),
    rerunRequested: false,
  }
  activeJobs.set(accountId, progress)

  // Fire-and-forget — intentionally not awaited
  void runEnrichmentJob(accountId, db, dataSource)
}

/**
 * Run enrichment synchronously (awaitable). Used in tests.
 */
export async function runEnrichment(
  accountId: string,
  db: PrismaClient = defaultPrisma,
  dataSource: EnrichmentDataSource = defaultDataSource,
): Promise<EnrichmentProgress> {
  const progress: EnrichmentProgress = {
    accountId,
    total: 0,
    enriched: 0,
    tradesEnriched: 0,
    done: false,
    errorCount: 0,
    startedAt: new Date(),
    rerunRequested: false,
  }
  activeJobs.set(accountId, progress)
  await runEnrichmentJob(accountId, db, dataSource)
  return progress
}
