import {
  buildEdgeAnalysis,
  calculateOneSampleTTestPValue,
  calculateWilsonInterval,
  estimateExpectedValue,
  scoreSetupFit,
  type EdgeTradeInput,
} from '@/lib/engine/edge-analysis'
import type { SetupCategory } from '@/lib/engine/classifier'

function makeTrade(overrides: Partial<EdgeTradeInput> = {}): EdgeTradeInput {
  return {
    id: `trade-${Math.random().toString(36).slice(2, 8)}`,
    setup: 'BREAKOUT',
    secondarySetup: null,
    marketRegime: 'TRENDING_UP',
    direction: 'LONG',
    entryTime: '2024-01-01T00:00:00.000Z',
    exitTime: '2024-01-02T00:00:00.000Z',
    netPnl: 100,
    totalFees: 5,
    entryPrice: 100,
    totalQty: 100,
    durationSeconds: 24 * 60 * 60,
    ...overrides,
  }
}

describe('calculateWilsonInterval', () => {
  it('returns the expected 95% Wilson interval for 6 wins in 10 trades', () => {
    const interval = calculateWilsonInterval(6, 10)
    expect(interval.lower).toBeCloseTo(0.3127, 4)
    expect(interval.upper).toBeCloseTo(0.8318, 4)
  })

  it('returns zero bounds for an empty sample', () => {
    expect(calculateWilsonInterval(0, 0)).toEqual({ lower: 0, upper: 0 })
  })
})

describe('calculateOneSampleTTestPValue', () => {
  it('returns null for fewer than two samples', () => {
    expect(calculateOneSampleTTestPValue([10])).toBeNull()
  })

  it('returns 1 for a zero-variance sample with zero mean', () => {
    expect(calculateOneSampleTTestPValue([0, 0, 0, 0])).toBe(1)
  })

  it('returns 0 for a zero-variance sample with non-zero mean', () => {
    expect(calculateOneSampleTTestPValue([5, 5, 5, 5])).toBe(0)
  })

  it('returns a small p-value for a clearly positive sample', () => {
    const pValue = calculateOneSampleTTestPValue([120, 110, 130, 125, 140, 115])
    expect(pValue).not.toBeNull()
    expect(pValue!).toBeLessThan(0.001)
  })
})

describe('buildEdgeAnalysis', () => {
  it('builds style profile, category stats, regime stats, persistence, and recommendations', () => {
    const trades: EdgeTradeInput[] = [
      makeTrade({ id: 'b1', setup: 'BREAKOUT', exitTime: '2024-01-02T00:00:00.000Z', netPnl: 200 }),
      makeTrade({ id: 'b2', setup: 'BREAKOUT', exitTime: '2024-01-03T00:00:00.000Z', netPnl: 150 }),
      makeTrade({ id: 'b3', setup: 'BREAKOUT', exitTime: '2024-01-04T00:00:00.000Z', netPnl: 100 }),
      makeTrade({ id: 'b4', setup: 'BREAKOUT', exitTime: '2024-01-05T00:00:00.000Z', netPnl: 50 }),
      makeTrade({ id: 'b5', setup: 'BREAKOUT', exitTime: '2024-01-06T00:00:00.000Z', netPnl: -25, marketRegime: 'CHOPPY' }),
      makeTrade({ id: 'p1', setup: 'PULLBACK', exitTime: '2024-01-07T00:00:00.000Z', netPnl: -75, marketRegime: 'CHOPPY' }),
      makeTrade({ id: 'p2', setup: 'PULLBACK', exitTime: '2024-01-08T00:00:00.000Z', netPnl: -50, marketRegime: 'CHOPPY' }),
      makeTrade({ id: 'p3', setup: 'PULLBACK', exitTime: '2024-01-09T00:00:00.000Z', netPnl: -25, marketRegime: 'TRENDING_DOWN' }),
      makeTrade({ id: 'p4', setup: 'PULLBACK', exitTime: '2024-01-10T00:00:00.000Z', netPnl: 10, marketRegime: 'TRENDING_DOWN' }),
      makeTrade({ id: 'p5', setup: 'PULLBACK', exitTime: '2024-01-11T00:00:00.000Z', netPnl: -20, marketRegime: 'TRENDING_DOWN' }),
    ]

    const analysis = buildEdgeAnalysis({
      trades,
      startingBalance: 100_000,
      persistenceWindow: 3,
    })

    expect(analysis.styleProfile).toEqual([
      { setup: 'BREAKOUT', tradeCount: 5, share: 0.5 },
      { setup: 'PULLBACK', tradeCount: 5, share: 0.5 },
    ])

    const breakout = analysis.perCategory.find((entry) => entry.setup === 'BREAKOUT')
    const pullback = analysis.perCategory.find((entry) => entry.setup === 'PULLBACK')
    expect(breakout).toMatchObject({
      tradeCount: 5,
      winRate: 0.8,
      averageTrade: 95,
      expectancy: 95,
    })
    expect(pullback).toMatchObject({
      tradeCount: 5,
      averageTrade: -32,
      expectancy: -32,
    })

    const breakoutPersistence = analysis.persistence.find((entry) => entry.setup === 'BREAKOUT')
    const pullbackPersistence = analysis.persistence.find((entry) => entry.setup === 'PULLBACK')
    expect(breakoutPersistence?.points.map((point) => point.expectancy)).toEqual([200, 175, 150, 100, 41.666666666666664])
    expect(breakoutPersistence?.trend).toBe('DECAYING')
    expect(pullbackPersistence?.trend).toBe('STRENGTHENING')

    expect(analysis.regimeCrossReference).toContainEqual(
      expect.objectContaining({
        setup: 'BREAKOUT',
        regime: 'TRENDING_UP',
        tradeCount: 4,
        winRate: 1,
      }),
    )

    expect(analysis.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'STRONGEST_EDGE', setup: 'BREAKOUT' }),
        expect.objectContaining({ kind: 'WEAKEST_EDGE', setup: 'PULLBACK' }),
      ]),
    )
  })

  it('ignores open or unclassified trades', () => {
    const analysis = buildEdgeAnalysis({
      trades: [
        makeTrade({ id: 'closed', setup: 'BREAKOUT', netPnl: 100 }),
        makeTrade({ id: 'open', setup: 'BREAKOUT', exitTime: null, netPnl: null }),
        makeTrade({ id: 'unknown', setup: null }),
      ],
      startingBalance: 100_000,
    })

    expect(analysis.styleProfile).toEqual([
      { setup: 'BREAKOUT', tradeCount: 1, share: 1 },
    ])
    expect(analysis.perCategory).toHaveLength(1)
  })
})

describe('opportunity helpers', () => {
  const analysis = buildEdgeAnalysis({
    trades: [
      makeTrade({ id: 'e1', setup: 'EARNINGS_PLAY', netPnl: 300, marketRegime: 'TRENDING_UP' }),
      makeTrade({ id: 'e2', setup: 'EARNINGS_PLAY', netPnl: 250, marketRegime: 'TRENDING_UP' }),
      makeTrade({ id: 'e3', setup: 'EARNINGS_PLAY', netPnl: 200, marketRegime: 'TRENDING_UP' }),
      makeTrade({ id: 'e4', setup: 'EARNINGS_PLAY', netPnl: -50, marketRegime: 'TRENDING_UP' }),
      makeTrade({ id: 'e5', setup: 'EARNINGS_PLAY', netPnl: 100, marketRegime: 'TRENDING_UP' }),
    ],
    startingBalance: 200_000,
  })

  it('estimates expected value and suggested notional for a setup', () => {
    const estimate = estimateExpectedValue({
      analysis,
      setup: 'EARNINGS_PLAY',
      accountBalance: 200_000,
    })

    expect(estimate).toMatchObject({
      setup: 'EARNINGS_PLAY',
      similarTradeCount: 5,
      expectedPnl: 160,
      confidenceOfProfit: 0.8,
    })
    expect(estimate?.suggestedKellyFraction).toBeCloseTo(0.3764705882, 6)
    expect(estimate?.suggestedNotional).toBeCloseTo(75294.1176, 3)
  })

  it('scores setup fit on a 1-10 scale', () => {
    const fit = scoreSetupFit({ analysis, setup: 'EARNINGS_PLAY' })
    expect(fit).toEqual({
      setup: 'EARNINGS_PLAY',
      score: 8,
      reason: 'EARNINGS_PLAY is aligned with your demonstrated edge profile.',
    })
  })

  it('returns null when the setup has no history', () => {
    expect(estimateExpectedValue({ analysis, setup: 'SCALP' as SetupCategory })).toBeNull()
    expect(scoreSetupFit({ analysis, setup: 'SCALP' as SetupCategory })).toBeNull()
  })
})
