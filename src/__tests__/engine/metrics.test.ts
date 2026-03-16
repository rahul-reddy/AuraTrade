import {
  buildDailyPerformanceSeries,
  calculateExpectancy,
  calculateMaxDrawdown,
  calculatePerformanceMetrics,
  calculatePayoffRatio,
  calculateProfitFactor,
  calculateSharpeApprox,
  calculateWinRate,
  kellyFull,
  kellyHalf,
  kellyQuarter,
} from '@/lib/engine/metrics'

describe('calculateWinRate', () => {
  test('returns zero when there are no trades', () => {
    expect(calculateWinRate(0, 0)).toBe(0)
  })

  test('handles all wins, all losses, and mixed totals', () => {
    expect(calculateWinRate(4, 4)).toBe(1)
    expect(calculateWinRate(0, 4)).toBe(0)
    expect(calculateWinRate(3, 5)).toBeCloseTo(0.6, 5)
  })
})

describe('calculateProfitFactor', () => {
  test('returns the ratio of gross wins to gross losses', () => {
    expect(calculateProfitFactor(750, 400)).toBeCloseTo(1.875, 5)
  })

  test('returns null when there are no losses', () => {
    expect(calculateProfitFactor(750, 0)).toBeNull()
  })
})

describe('calculatePayoffRatio', () => {
  test('returns avgWin divided by avgLoss for valid inputs', () => {
    expect(calculatePayoffRatio(375, 200)).toBeCloseTo(1.875, 5)
  })

  test('returns null when avgWin or avgLoss is zero or negative', () => {
    expect(calculatePayoffRatio(0, 200)).toBeNull()
    expect(calculatePayoffRatio(375, 0)).toBeNull()
    expect(calculatePayoffRatio(375, -1)).toBeNull()
  })
})

describe('calculateExpectancy', () => {
  test('returns the weighted average outcome per trade', () => {
    expect(calculateExpectancy(0.5, 375, 0.5, 200)).toBeCloseTo(87.5, 5)
  })

  test('handles zero win rate and negative expectancy cases', () => {
    expect(calculateExpectancy(0, 300, 1, 150)).toBeCloseTo(-150, 5)
    expect(calculateExpectancy(0.4, 100, 0.6, 150)).toBeCloseTo(-50, 5)
  })
})

describe('Kelly criterion', () => {
  test('60% WR, $500 avg win, $300 avg loss', () => {
    expect(kellyFull(0.6, 500, 300)).toBeCloseTo(0.36, 5)
    expect(kellyHalf(0.6, 500, 300)).toBeCloseTo(0.18, 5)
    expect(kellyQuarter(0.6, 500, 300)).toBeCloseTo(0.09, 5)
  })

  test('45% WR, $200 avg win, $300 avg loss returns negative edge', () => {
    expect(kellyFull(0.45, 200, 300)).toBeCloseTo(-0.375, 5)
  })

  test('50% WR, $400 avg win, $400 avg loss returns zero edge', () => {
    expect(kellyFull(0.5, 400, 400)).toBeCloseTo(0, 5)
  })
})

describe('buildDailyPerformanceSeries', () => {
  test('aggregates same-day trades and sorts by date ascending', () => {
    const series = buildDailyPerformanceSeries([
      { exitTime: '2026-03-12T00:00:00.000Z', netPnl: 250 },
      { exitTime: '2026-03-10T00:00:00.000Z', netPnl: 500 },
      { exitTime: '2026-03-10T00:00:00.000Z', netPnl: -100 },
      { exitTime: '2026-03-11T00:00:00.000Z', netPnl: 0 },
    ])

    expect(series).toEqual([
      {
        date: '2026-03-10',
        pnl: 400,
        cumulativePnl: 400,
        tradeCount: 2,
        winCount: 1,
        lossCount: 1,
        breakevenCount: 0,
      },
      {
        date: '2026-03-11',
        pnl: 0,
        cumulativePnl: 400,
        tradeCount: 1,
        winCount: 0,
        lossCount: 0,
        breakevenCount: 1,
      },
      {
        date: '2026-03-12',
        pnl: 250,
        cumulativePnl: 650,
        tradeCount: 1,
        winCount: 1,
        lossCount: 0,
        breakevenCount: 0,
      },
    ])
  })
})

describe('calculateSharpeApprox', () => {
  test('returns null when fewer than 2 data points are provided', () => {
    expect(calculateSharpeApprox([])).toBeNull()
    expect(calculateSharpeApprox([100])).toBeNull()
  })

  test('returns zero when the average daily pnl is zero', () => {
    expect(calculateSharpeApprox([100, -100, 100, -100])).toBeCloseTo(0, 5)
  })

  test('returns null when volatility is zero', () => {
    expect(calculateSharpeApprox([50, 50, 50])).toBeNull()
  })
})

describe('calculateMaxDrawdown', () => {
  test('tracks drawdown from the running peak equity', () => {
    const drawdown = calculateMaxDrawdown([500, -300, 250, -100], 1000)

    expect(drawdown.amount).toBeCloseTo(300, 5)
    expect(drawdown.ratio).toBeCloseTo(0.2, 5)
  })

  test('measures drawdown ratio against the peak at the time of the drop', () => {
    const drawdown = calculateMaxDrawdown([100, -100, 1000], 100)

    expect(drawdown.amount).toBeCloseTo(100, 5)
    expect(drawdown.ratio).toBeCloseTo(0.5, 5)
  })
})

describe('calculatePerformanceMetrics', () => {
  test('summarizes trade performance and daily series', () => {
    const summary = calculatePerformanceMetrics(
      [
        { exitTime: '2026-03-10T00:00:00.000Z', netPnl: 500, totalFees: 10 },
        { exitTime: '2026-03-11T00:00:00.000Z', netPnl: -300, totalFees: 8 },
        { exitTime: '2026-03-12T00:00:00.000Z', netPnl: 250, totalFees: 6 },
        { exitTime: '2026-03-13T00:00:00.000Z', netPnl: -100, totalFees: 4 },
      ],
      1000,
    )

    expect(summary.metrics.totalTrades).toBe(4)
    expect(summary.metrics.winCount).toBe(2)
    expect(summary.metrics.lossCount).toBe(2)
    expect(summary.metrics.breakevenCount).toBe(0)
    expect(summary.metrics.totalNetPnl).toBeCloseTo(350, 5)
    expect(summary.metrics.totalFees).toBeCloseTo(28, 5)
    expect(summary.metrics.grossWins).toBeCloseTo(750, 5)
    expect(summary.metrics.grossLosses).toBeCloseTo(400, 5)
    expect(summary.metrics.avgWin).toBeCloseTo(375, 5)
    expect(summary.metrics.avgLoss).toBeCloseTo(200, 5)
    expect(summary.metrics.winRate).toBeCloseTo(0.5, 5)
    expect(summary.metrics.lossRate).toBeCloseTo(0.5, 5)
    expect(summary.metrics.profitFactor).toBeCloseTo(1.875, 5)
    expect(summary.metrics.payoffRatio).toBeCloseTo(1.875, 5)
    expect(summary.metrics.expectancy).toBeCloseTo(87.5, 5)
    expect(summary.metrics.maxDrawdown).toBeCloseTo(0.2, 5)
    expect(summary.metrics.maxDrawdownAmount).toBeCloseTo(300, 5)
    expect(summary.metrics.kellyFull).toBeCloseTo(0.2333333333, 5)
    expect(summary.metrics.kellyHalf).toBeCloseTo(0.1166666667, 5)
    expect(summary.metrics.kellyQuarter).toBeCloseTo(0.0583333333, 5)
    expect(summary.dailySeries).toHaveLength(4)
    expect(summary.dailySeries[3]?.cumulativePnl).toBeCloseTo(350, 5)
  })

  test('returns stable empty-state metrics when there are no trades', () => {
    const summary = calculatePerformanceMetrics([], 1000)

    expect(summary.metrics.totalTrades).toBe(0)
    expect(summary.metrics.winRate).toBe(0)
    expect(summary.metrics.profitFactor).toBeNull()
    expect(summary.metrics.kellyFull).toBeNull()
    expect(summary.metrics.sharpeApprox).toBeNull()
    expect(summary.metrics.maxDrawdown).toBe(0)
    expect(summary.dailySeries).toEqual([])
  })
})
