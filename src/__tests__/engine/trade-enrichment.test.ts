import {
  findDateIndex,
  computeIndicators,
  classifyMarketRegime,
  getEnrichmentProgress,
  resolveNearestEarnings,
  runEnrichment,
  startEnrichment,
  type DailyCandle,
  type EnrichmentDataSource,
} from '@/lib/engine/trade-enrichment'
import type { PrismaClient } from '@/generated/prisma'

// ─── helpers ──────────────────────────────────────────────────────────

/** Generate N synthetic daily candles starting from a base price. */
function makeCandles(
  n: number,
  opts: { startDate?: Date; basePrice?: number; trend?: number } = {},
): DailyCandle[] {
  const base = opts.basePrice ?? 100
  const trend = opts.trend ?? 0.1
  const start = opts.startDate ?? new Date('2023-01-01T00:00:00.000Z')

  return Array.from({ length: n }, (_, i) => {
    const date = new Date(start)
    date.setUTCDate(date.getUTCDate() + i)

    const close = base + i * trend
    const open = close - 0.2
    const high = close + 0.5
    const low = close - 0.5

    return { date, open, high, low, close }
  })
}

// ─── findDateIndex ────────────────────────────────────────────────────

describe('findDateIndex', () => {
  const candles = makeCandles(5, { startDate: new Date('2023-01-01T00:00:00.000Z') })
  // dates: Jan 1, Jan 2, Jan 3, Jan 4, Jan 5

  it('returns the exact index when target matches a candle date', () => {
    const target = new Date('2023-01-03T00:00:00.000Z')
    expect(findDateIndex(candles, target)).toBe(2)
  })

  it('returns the last candle before target for a weekend/holiday gap', () => {
    // Jan 3 is at index 2; Jan 3T12:00 is after Jan 3 midnight so still idx 2
    const target = new Date('2023-01-03T12:00:00.000Z')
    expect(findDateIndex(candles, target)).toBe(2)
  })

  it('returns -1 when target is before all candles', () => {
    const target = new Date('2022-12-31T00:00:00.000Z')
    expect(findDateIndex(candles, target)).toBe(-1)
  })

  it('returns last index when target is after all candles', () => {
    const target = new Date('2024-01-01T00:00:00.000Z')
    expect(findDateIndex(candles, target)).toBe(4)
  })
})

// ─── computeIndicators ───────────────────────────────────────────────

describe('computeIndicators', () => {
  // Need at least 21 candles (20 for BBands + 1 for prevClose)
  const candles = makeCandles(300, {
    startDate: new Date('2022-01-01T00:00:00.000Z'),
    basePrice: 100,
    trend: 0.05,
  })

  it('returns null when there are fewer than 29 candles at the target date', () => {
    // Target = 20th candle (index 19) → only 20 candles in slice → < 29
    const target = new Date('2022-01-20T00:00:00.000Z')
    expect(computeIndicators(candles, target)).toBeNull()
  })

  it('returns null when target is before all candles', () => {
    const target = new Date('2021-01-01T00:00:00.000Z')
    expect(computeIndicators(candles, target)).toBeNull()
  })

  it('returns indicator snapshot with all required fields', () => {
    // Use a date far enough in the series for SMA200
    const target = new Date('2022-08-01T00:00:00.000Z')
    const snap = computeIndicators(candles, target)

    expect(snap).not.toBeNull()
    expect(typeof snap!.sma20).toBe('number')
    expect(typeof snap!.sma50).toBe('number')
    expect(typeof snap!.sma200).toBe('number')
    expect(typeof snap!.ema20).toBe('number')
    expect(typeof snap!.atr14).toBe('number')
    expect(typeof snap!.rsi14).toBe('number')
    expect(typeof snap!.adx14).toBe('number')
    expect(typeof snap!.bbUpper).toBe('number')
    expect(typeof snap!.bbLower).toBe('number')
    expect(typeof snap!.highN52w).toBe('number')
    expect(typeof snap!.lowN52w).toBe('number')
    expect(typeof snap!.prevClose).toBe('number')
    expect(typeof snap!.gapPercent).toBe('number')
  })

  it('bbUpper > bbLower', () => {
    const target = new Date('2022-08-01T00:00:00.000Z')
    const snap = computeIndicators(candles, target)!
    expect(snap.bbUpper).toBeGreaterThan(snap.bbLower)
  })

  it('RSI is in 0–100 range', () => {
    const target = new Date('2022-08-01T00:00:00.000Z')
    const snap = computeIndicators(candles, target)!
    expect(snap.rsi14).toBeGreaterThanOrEqual(0)
    expect(snap.rsi14).toBeLessThanOrEqual(100)
  })

  it('ATR14 is positive', () => {
    const target = new Date('2022-08-01T00:00:00.000Z')
    const snap = computeIndicators(candles, target)!
    expect(snap.atr14).toBeGreaterThan(0)
  })

  it('52w high >= 52w low', () => {
    const target = new Date('2022-08-01T00:00:00.000Z')
    const snap = computeIndicators(candles, target)!
    expect(snap.highN52w).toBeGreaterThanOrEqual(snap.lowN52w)
  })

  it('prevClose is the candle before entry date', () => {
    // candles[0] = Jan 1, candles[1] = Jan 2, …
    // Entry = Feb 1 → idx 31 (≥ 28) → prevClose = close of candle at idx 30
    const target = new Date('2022-02-01T00:00:00.000Z')
    const snap = computeIndicators(candles, target)!
    expect(snap).not.toBeNull()
    const entryIdx = candles.findIndex(
      (c) => c.date.getTime() === target.getTime(),
    )
    expect(snap.prevClose).toBeCloseTo(candles[entryIdx - 1].close, 5)
  })

  it('gapPercent = (open - prevClose) / prevClose at entry date', () => {
    const target = new Date('2022-02-01T00:00:00.000Z')
    const snap = computeIndicators(candles, target)!
    expect(snap).not.toBeNull()
    const entryIdx = candles.findIndex(
      (c) => c.date.getTime() === target.getTime(),
    )
    const prevClose = candles[entryIdx - 1].close
    const entryOpen = candles[entryIdx].open
    const expectedGap = (entryOpen - prevClose) / prevClose
    expect(snap.gapPercent).toBeCloseTo(expectedGap, 8)
  })

  it('SMA20 ≈ average of last 20 closes at entry', () => {
    const target = new Date('2022-08-01T00:00:00.000Z')
    const snap = computeIndicators(candles, target)!
    const entryIdx = candles.findIndex(
      (c) => c.date.getTime() === target.getTime(),
    )
    const last20 = candles.slice(entryIdx - 19, entryIdx + 1).map((c) => c.close)
    const manualSMA20 = last20.reduce((a, b) => a + b, 0) / 20
    expect(snap.sma20).toBeCloseTo(manualSMA20, 4)
  })
})

// ─── classifyMarketRegime ─────────────────────────────────────────────

describe('classifyMarketRegime', () => {
  it('returns CHOPPY when there are fewer than 50 candles at the target date', () => {
    const candles = makeCandles(30, { basePrice: 400, trend: 0.5 })
    const target = candles[candles.length - 1].date
    expect(classifyMarketRegime(candles, target)).toBe('CHOPPY')
  })

  it('classifies TRENDING_UP when close > SMA20 > SMA50 on a rising series', () => {
    // Generate 250 candles with a strong uptrend
    const candles = makeCandles(250, { basePrice: 200, trend: 1.0 })
    const target = candles[candles.length - 1].date
    const regime = classifyMarketRegime(candles, target)
    // On a monotonically increasing series: close > SMA20 > SMA50 always holds
    expect(regime).toBe('TRENDING_UP')
  })

  it('classifies TRENDING_DOWN when close < SMA20 < SMA50 on a falling series', () => {
    // Generate 250 candles with a strong downtrend
    const candles = makeCandles(250, { basePrice: 500, trend: -1.0 })
    const target = candles[candles.length - 1].date
    const regime = classifyMarketRegime(candles, target)
    // On a monotonically decreasing series: close < SMA20 < SMA50 always holds
    expect(regime).toBe('TRENDING_DOWN')
  })

  it('classifies CHOPPY on a flat/oscillating series', () => {
    // Generate 250 candles where close oscillates around a fixed value
    const start = new Date('2023-01-01T00:00:00.000Z')
    const candles: DailyCandle[] = Array.from({ length: 250 }, (_, i) => {
      const date = new Date(start)
      date.setUTCDate(date.getUTCDate() + i)
      // Alternate +1 / -1 around 300
      const close = 300 + (i % 2 === 0 ? 1 : -1)
      return { date, open: close - 0.1, high: close + 0.5, low: close - 0.5, close }
    })
    const target = candles[candles.length - 1].date
    const regime = classifyMarketRegime(candles, target)
    // SMA20 ≈ SMA50 ≈ 300, close ≈ 299 or 301 — regime is CHOPPY
    expect(regime).toBe('CHOPPY')
  })

  it('returns CHOPPY when spy candles array is empty', () => {
    const target = new Date('2023-06-01T00:00:00.000Z')
    expect(classifyMarketRegime([], target)).toBe('CHOPPY')
  })
})

// ─── resolveNearestEarnings ───────────────────────────────────────────

describe('resolveNearestEarnings', () => {
  it('returns null fields when the earnings calendar is empty', () => {
    expect(resolveNearestEarnings([], new Date('2023-06-01T00:00:00.000Z'))).toEqual({
      nearestEarningsDate: null,
      daysToEarnings: null,
    })
  })

  it('uses the nearest earnings date for each trade entry date', () => {
    const earningsDates = [
      new Date('2023-03-15T00:00:00.000Z'),
      new Date('2023-08-15T00:00:00.000Z'),
    ]

    expect(
      resolveNearestEarnings(earningsDates, new Date('2023-03-10T00:00:00.000Z')),
    ).toEqual({
      nearestEarningsDate: new Date('2023-03-15T00:00:00.000Z'),
      daysToEarnings: 5,
    })

    expect(
      resolveNearestEarnings(earningsDates, new Date('2023-09-01T00:00:00.000Z')),
    ).toEqual({
      nearestEarningsDate: new Date('2023-08-15T00:00:00.000Z'),
      daysToEarnings: -17,
    })
  })
})

// ─── runEnrichment ────────────────────────────────────────────────────

describe('runEnrichment', () => {
  it('derives earnings per trade date and tags ATR-based initial risk', async () => {
    const symbolCandles = makeCandles(320, {
      startDate: new Date('2023-01-01T00:00:00.000Z'),
      basePrice: 100,
      trend: 0.5,
    })
    const spyCandles = makeCandles(320, {
      startDate: new Date('2023-01-01T00:00:00.000Z'),
      basePrice: 400,
      trend: 1,
    })

    const tradeContextUpsert = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined)
    const roundTripTradeUpdate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined)

    const db = {
      roundTripTrade: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'trade-1',
            symbol: 'AAPL',
            entryTime: new Date('2023-03-10T00:00:00.000Z'),
            initialRisk: null,
          },
          {
            id: 'trade-2',
            symbol: 'AAPL',
            entryTime: new Date('2023-09-01T00:00:00.000Z'),
            initialRisk: 2.5,
          },
        ]),
        update: roundTripTradeUpdate,
      },
      tradeContext: {
        upsert: tradeContextUpsert,
      },
    } as unknown as PrismaClient

    const dataSource: EnrichmentDataSource = {
      fetchDailyHistory: async (symbol) => (symbol === 'SPY' ? spyCandles : symbolCandles),
      fetchEarningsDates: async () => [
        new Date('2023-03-15T00:00:00.000Z'),
        new Date('2023-08-15T00:00:00.000Z'),
      ],
    }

    const progress = await runEnrichment('acct-1', db, dataSource)

    expect(progress.done).toBe(true)
    expect(progress.tradesEnriched).toBe(2)
    expect(tradeContextUpsert).toHaveBeenCalledTimes(2)

    const firstUpsertArg = tradeContextUpsert.mock.calls[0][0] as {
      update: { daysToEarnings?: number; nearestEarningsDate?: Date }
    }
    const secondUpsertArg = tradeContextUpsert.mock.calls[1][0] as {
      update: { daysToEarnings?: number; nearestEarningsDate?: Date }
    }

    expect(firstUpsertArg.update.nearestEarningsDate?.toISOString()).toBe('2023-03-15T00:00:00.000Z')
    expect(firstUpsertArg.update.daysToEarnings).toBe(5)
    expect(secondUpsertArg.update.nearestEarningsDate?.toISOString()).toBe('2023-08-15T00:00:00.000Z')
    expect(secondUpsertArg.update.daysToEarnings).toBe(-17)

    expect(roundTripTradeUpdate).toHaveBeenCalledTimes(1)
    expect(roundTripTradeUpdate).toHaveBeenCalledWith({
      where: { id: 'trade-1' },
      data: expect.objectContaining({
        riskSource: 'ATR',
      }),
    })
  })

  it('fetches candle history across the full symbol trade span instead of only the latest trade window', async () => {
    const symbolCandles = makeCandles(1200, {
      startDate: new Date('2020-01-01T00:00:00.000Z'),
      basePrice: 100,
      trend: 0.2,
    })
    const spyCandles = makeCandles(1200, {
      startDate: new Date('2020-01-01T00:00:00.000Z'),
      basePrice: 300,
      trend: 0.3,
    })

    const fetchDailyHistory = jest.fn(async (symbol: string, startDate: Date, endDate: Date) => {
      if (symbol === 'SPY') {
        return spyCandles
      }
      expect(startDate.toISOString()).toBe('2019-09-19T00:00:00.000Z')
      expect(endDate.toISOString()).toBe('2022-09-06T00:00:00.000Z')
      return symbolCandles
    })

    const db = {
      roundTripTrade: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'trade-old',
            symbol: 'AAPL',
            entryTime: new Date('2020-10-23T00:00:00.000Z'),
            initialRisk: null,
          },
          {
            id: 'trade-new',
            symbol: 'AAPL',
            entryTime: new Date('2022-09-01T00:00:00.000Z'),
            initialRisk: null,
          },
        ]),
        update: jest.fn().mockResolvedValue(undefined),
      },
      tradeContext: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as PrismaClient

    const dataSource: EnrichmentDataSource = {
      fetchDailyHistory,
      fetchEarningsDates: async () => [],
    }

    const progress = await runEnrichment('acct-span', db, dataSource)

    expect(progress.tradesEnriched).toBe(2)
    expect(fetchDailyHistory).toHaveBeenCalledWith(
      'AAPL',
      new Date('2019-09-19T00:00:00.000Z'),
      new Date('2022-09-06T00:00:00.000Z'),
    )
  })

  it('queues a rerun when startEnrichment is called during an active job', async () => {
    let releaseFirstRun: (() => void) | null = null
    const firstRun = new Promise<[] | never[]>((resolve) => {
      releaseFirstRun = () => resolve([])
    })

    const findMany = jest
      .fn<Promise<[]>, []>()
      .mockImplementationOnce(() => firstRun as Promise<[]>)
      .mockResolvedValue([])

    const db = {
      roundTripTrade: {
        findMany,
        update: jest.fn().mockResolvedValue(undefined),
      },
      tradeContext: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as PrismaClient

    const dataSource: EnrichmentDataSource = {
      fetchDailyHistory: async () => [],
      fetchEarningsDates: async () => [],
    }

    startEnrichment('acct-rerun', db, dataSource)
    await Promise.resolve()

    startEnrichment('acct-rerun', db, dataSource)
    expect(getEnrichmentProgress('acct-rerun')?.rerunRequested).toBe(true)

    expect(releaseFirstRun).not.toBeNull()
    releaseFirstRun!()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(findMany).toHaveBeenCalledTimes(2)
    expect(getEnrichmentProgress('acct-rerun')?.done).toBe(true)
  })
})
