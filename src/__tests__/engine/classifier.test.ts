import {
  calculateSetupScores,
  classifyTrade,
  type ClassifierContext,
  type ClassifierExecution,
  type ClassifierTrade,
} from '@/lib/engine/classifier'

function makeTrade(overrides: Partial<ClassifierTrade> = {}): ClassifierTrade {
  return {
    id: 'trade-1',
    symbol: 'AAPL',
    direction: 'LONG',
    entryPrice: 100,
    totalQty: 100,
    durationSeconds: 2 * 24 * 60 * 60,
    isOpen: false,
    ...overrides,
  }
}

function makeContext(overrides: Partial<ClassifierContext> = {}): ClassifierContext {
  return {
    sma20: 98,
    sma50: 95,
    sma200: 90,
    ema20: 99,
    atr14: 2,
    rsi14: 62,
    adx14: 18,
    bbUpper: 104,
    bbLower: 94,
    highN52w: 101,
    lowN52w: 70,
    gapPercent: 0.005,
    daysToEarnings: 10,
    marketRegime: 'TRENDING_UP',
    ...overrides,
  }
}

function makeExecutions(overrides: Partial<ClassifierExecution>[] = []): ClassifierExecution[] {
  return [
    {
      posEffect: 'OPEN',
      side: 'BUY',
      execTime: new Date('2023-01-01T00:00:00.000Z'),
      price: 100,
      qty: 100,
      daySeq: 0,
    },
    ...overrides.map((override, index) => ({
      posEffect: 'OPEN' as const,
      side: 'BUY' as const,
      execTime: new Date(`2023-01-0${index + 2}T00:00:00.000Z`),
      price: 100,
      qty: 50,
      daySeq: index + 1,
      ...override,
    })),
  ]
}

describe('calculateSetupScores', () => {
  it('scores a trend continuation breakout highly', () => {
    const trade = makeTrade({ entryPrice: 100 })
    const context = makeContext({
      highN52w: 101,
      atr14: 1.6,
      rsi14: 64,
      marketRegime: 'TRENDING_UP',
    })

    const scores = calculateSetupScores(trade, context, makeExecutions())
    expect(scores.scores.BREAKOUT.score).toBeGreaterThanOrEqual(85)
    expect(scores.derivedSignals.trendAligned).toBe(true)
  })

  it('recognizes a pullback entry near the 20 EMA in an uptrend', () => {
    const trade = makeTrade({ entryPrice: 99.4 })
    const context = makeContext({
      sma20: 99,
      sma50: 97,
      sma200: 92,
      ema20: 99.1,
      atr14: 1.4,
      rsi14: 50,
      highN52w: 110,
    })

    const scores = calculateSetupScores(trade, context, makeExecutions())
    expect(scores.scores.PULLBACK.score).toBeGreaterThanOrEqual(80)
  })

  it('recognizes a long mean-reversion setup at an oversold lower-band stretch', () => {
    const trade = makeTrade({ entryPrice: 90 })
    const context = makeContext({
      sma20: 98,
      sma50: 96,
      sma200: 94,
      ema20: 97,
      atr14: 3,
      rsi14: 28,
      bbUpper: 106,
      bbLower: 90.5,
      marketRegime: 'CHOPPY',
    })

    const scores = calculateSetupScores(trade, context, makeExecutions())
    expect(scores.scores.MEAN_REVERSION.score).toBeGreaterThanOrEqual(75)
  })

  it('recognizes a momentum hold when ADX and duration are both strong', () => {
    const trade = makeTrade({ durationSeconds: 3 * 24 * 60 * 60, entryPrice: 120 })
    const context = makeContext({
      sma20: 116,
      sma50: 112,
      sma200: 105,
      ema20: 117,
      atr14: 3,
      adx14: 32,
      rsi14: 68,
      highN52w: 125,
      marketRegime: 'TRENDING_UP',
    })

    const scores = calculateSetupScores(trade, context, makeExecutions())
    expect(scores.scores.MOMENTUM.score).toBeGreaterThanOrEqual(75)
  })

  it('recognizes a reversal attempt near an exhaustion low', () => {
    const trade = makeTrade({ entryPrice: 72 })
    const context = makeContext({
      sma20: 78,
      sma50: 85,
      sma200: 92,
      ema20: 77,
      atr14: 4,
      rsi14: 24,
      bbUpper: 96,
      bbLower: 72.3,
      highN52w: 130,
      lowN52w: 70,
      marketRegime: 'TRENDING_DOWN',
    })

    const scores = calculateSetupScores(trade, context, makeExecutions())
    expect(scores.scores.REVERSAL.score).toBeGreaterThanOrEqual(75)
  })

  it('recognizes average-down behavior from worsening opening fills', () => {
    const trade = makeTrade()
    const executions = makeExecutions([
      { execTime: new Date('2023-01-02T00:00:00.000Z'), price: 98, qty: 50 },
      { execTime: new Date('2023-01-03T00:00:00.000Z'), price: 95, qty: 50 },
    ])

    const scores = calculateSetupScores(trade, makeContext(), executions)
    expect(scores.scores.AVERAGE_DOWN.score).toBeGreaterThanOrEqual(85)
    expect(scores.derivedSignals.worseningOpenAdds).toBe(2)
  })

  it('treats same-day trades as scalp candidates under the date-only export assumption', () => {
    const trade = makeTrade({ durationSeconds: 0 })
    const scores = calculateSetupScores(trade, makeContext(), makeExecutions())
    expect(scores.scores.SCALP.score).toBeGreaterThanOrEqual(65)
    expect(scores.derivedSignals.sameDayCandidate).toBe(true)
  })

  it('recognizes gap plays with a directional opening gap and short hold', () => {
    const trade = makeTrade({ durationSeconds: 0, entryPrice: 105 })
    const context = makeContext({
      sma20: 100,
      sma50: 98,
      sma200: 94,
      ema20: 101,
      gapPercent: 0.035,
      highN52w: 108,
    })

    const scores = calculateSetupScores(trade, context, makeExecutions())
    expect(scores.scores.GAP_PLAY.score).toBeGreaterThanOrEqual(80)
  })

  it('recognizes earnings plays when the catalyst is within two days', () => {
    const trade = makeTrade()
    const context = makeContext({
      gapPercent: 0.025,
      daysToEarnings: 1,
    })

    const scores = calculateSetupScores(trade, context, makeExecutions())
    expect(scores.scores.EARNINGS_PLAY.score).toBeGreaterThanOrEqual(85)
  })
})

describe('classifyTrade', () => {
  it('assigns a secondary setup when two categories are both strong', () => {
    const trade = makeTrade({ durationSeconds: 0, entryPrice: 100 })
    const context = makeContext({
      highN52w: 101,
      atr14: 1.4,
      rsi14: 63,
      gapPercent: 0.03,
      marketRegime: 'TRENDING_UP',
    })

    const result = classifyTrade(trade, context, makeExecutions())
    expect(result.setup).toBe('BREAKOUT')
    expect(result.secondarySetup).toBe('GAP_PLAY')
    expect(result.confidence).toBeGreaterThanOrEqual(85)
  })

  it('falls back to OTHER when no setup reaches the minimum threshold', () => {
    const trade = makeTrade({ direction: 'SHORT', entryPrice: 100, durationSeconds: 5 * 24 * 60 * 60 })
    const context = makeContext({
      sma20: 103,
      sma50: 101,
      sma200: 99,
      ema20: 115,
      atr14: 8,
      rsi14: 50,
      adx14: 10,
      bbUpper: 110,
      bbLower: 90,
      highN52w: 130,
      lowN52w: 70,
      gapPercent: 0,
      daysToEarnings: 20,
      marketRegime: 'CHOPPY',
    })

    const result = classifyTrade(trade, context, [
      {
        posEffect: 'OPEN',
        side: 'SELL_SHORT',
        execTime: new Date('2023-01-01T00:00:00.000Z'),
        price: 100,
        qty: 100,
        daySeq: 0,
      },
    ])

    expect(result.setup).toBe('OTHER')
    expect(result.secondarySetup).toBeNull()
    expect(result.confidence).toBeLessThanOrEqual(50)
  })

  it('uses exact threshold math for breakout ATR scoring', () => {
    const trade = makeTrade({ entryPrice: 100 })
    const baseContext = makeContext({
      highN52w: 101,
      rsi14: 64,
      marketRegime: 'TRENDING_UP',
    })

    const atThreshold = calculateSetupScores(
      trade,
      { ...baseContext, atr14: 4 },
      makeExecutions(),
    )
    const justAboveThreshold = calculateSetupScores(
      trade,
      { ...baseContext, atr14: 4.004 },
      makeExecutions(),
    )

    expect(atThreshold.scores.BREAKOUT.score).toBe(100)
    expect(justAboveThreshold.scores.BREAKOUT.score).toBe(85)
  })

  it('requires a score of at least 55 to avoid the OTHER fallback', () => {
    const executions = makeExecutions()
    const belowThreshold = classifyTrade(
      makeTrade({ entryPrice: 90 }),
      makeContext({
        sma20: 92,
        sma50: 91,
        sma200: 90,
        ema20: 91,
        atr14: 4,
        rsi14: 65,
        highN52w: 130,
        bbLower: 90.5,
        marketRegime: 'CHOPPY',
      }),
      executions,
    )
    const atThreshold = classifyTrade(
      makeTrade({ durationSeconds: 2 * 60 * 60 }),
      makeContext({
        sma20: 101,
        sma50: 100,
        sma200: 99,
        ema20: 120,
        atr14: 6,
        rsi14: 70,
        highN52w: 130,
        bbUpper: 130,
        bbLower: 80,
        marketRegime: 'CHOPPY',
      }),
      executions,
    )

    expect(belowThreshold.setup).toBe('OTHER')
    expect(belowThreshold.confidence).toBe(50)
    expect(atThreshold.setup).toBe('SCALP')
    expect(atThreshold.confidence).toBe(55)
  })

  it('only assigns a secondary setup when the second score is at least 55', () => {
    const trade = makeTrade({ durationSeconds: 0, entryPrice: 100 })
    const withSecondary = classifyTrade(
      trade,
      makeContext({
        highN52w: 101,
        atr14: 1.4,
        rsi14: 63,
        gapPercent: 0.03,
        marketRegime: 'TRENDING_UP',
      }),
      makeExecutions(),
    )
    const withoutSecondary = classifyTrade(
      trade,
      makeContext({
        highN52w: 101,
        atr14: 1.4,
        rsi14: 63,
        gapPercent: 0.019,
        marketRegime: 'TRENDING_UP',
      }),
      makeExecutions(),
    )

    expect(withSecondary.secondarySetup).toBe('GAP_PLAY')
    expect(withoutSecondary.secondarySetup).toBeNull()
  })
})
