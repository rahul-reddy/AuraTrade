import { buildDashboardInsights } from '@/lib/dashboard/dashboard-data'
import type { DailyPerformancePoint } from '@/lib/engine/metrics'

const metrics = {
  totalTrades: 4,
  winCount: 2,
  lossCount: 2,
  breakevenCount: 0,
  grossWins: 900,
  grossLosses: 350,
  totalNetPnl: 550,
  totalFees: 22,
  averageTrade: 137.5,
  avgWin: 450,
  avgLoss: 175,
  winRate: 0.5,
  lossRate: 0.5,
  profitFactor: 2.57,
  payoffRatio: 2.57,
  expectancy: 137.5,
  sharpeApprox: 1.23,
  maxDrawdown: 0.18,
  maxDrawdownAmount: 300,
  kellyFull: 0.305,
  kellyHalf: 0.1525,
  kellyQuarter: 0.07625,
}

const dailySeries: DailyPerformancePoint[] = [
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
    pnl: -300,
    cumulativePnl: 100,
    tradeCount: 1,
    winCount: 0,
    lossCount: 1,
    breakevenCount: 0,
  },
  {
    date: '2026-03-12',
    pnl: 450,
    cumulativePnl: 550,
    tradeCount: 1,
    winCount: 1,
    lossCount: 0,
    breakevenCount: 0,
  },
]

describe('buildDashboardInsights', () => {
  test('builds chart-ready aggregates for the dashboard', () => {
    const insights = buildDashboardInsights({
      trades: [
        {
          id: 't1',
          symbol: 'BROS',
          exitTime: '2026-03-10T00:00:00.000Z',
          exitDate: '2026-03-10',
          netPnl: 500,
          totalQty: 200,
          entryPrice: 60,
          durationSeconds: 0,
          sector: 'Consumer Cyclical',
          industry: 'Restaurants',
        },
        {
          id: 't2',
          symbol: 'AAPL',
          exitTime: '2026-03-10T00:00:00.000Z',
          exitDate: '2026-03-10',
          netPnl: -100,
          totalQty: 50,
          entryPrice: 180,
          durationSeconds: 86_400,
          sector: 'Technology',
          industry: 'Consumer Electronics',
        },
        {
          id: 't3',
          symbol: 'MSFT',
          exitTime: '2026-03-11T00:00:00.000Z',
          exitDate: '2026-03-11',
          netPnl: -300,
          totalQty: 25,
          entryPrice: 400,
          durationSeconds: 172_800,
          sector: 'Technology',
          industry: 'Software',
        },
        {
          id: 't4',
          symbol: 'NVDA',
          exitTime: '2026-03-12T00:00:00.000Z',
          exitDate: '2026-03-12',
          netPnl: 450,
          totalQty: 10,
          entryPrice: 900,
          durationSeconds: 0,
          sector: 'Technology',
          industry: 'Semiconductors',
        },
      ],
      dailySeries,
      metrics,
      startingBalance: 100_000,
    })

    expect(insights.rollingWinRate).toHaveLength(4)
    expect(insights.rollingWinRate[3]?.winRate).toBeCloseTo(50, 5)
    expect(insights.pnlDistribution.length).toBeGreaterThanOrEqual(4)
    expect(insights.dayOfWeek.find((point) => point.day === 'Tue')?.pnl).toBeCloseTo(400, 5)
    expect(insights.bestDay).toEqual({ date: '2026-03-12', pnl: 450 })
    expect(insights.worstDay).toEqual({ date: '2026-03-11', pnl: -300 })
    expect(insights.streak.direction).toBe('WIN')
    expect(insights.streak.count).toBe(1)
    expect(insights.monthlyHeatmap).toHaveLength(1)
    expect(insights.monthlyHeatmap[0]?.days).toHaveLength(3)
    expect(insights.sectorBreakdown.find((point) => point.sector === 'Technology')).toEqual({
      sector: 'Technology',
      pnl: 50,
      tradeCount: 3,
    })
    expect(insights.avgPositionNotional).toBeCloseTo(10_000, 5)
    expect(insights.avgPositionSizeFraction).toBeCloseTo(0.1, 5)
    expect(insights.hourOfDayAvailable).toBe(false)
  })

  test('returns stable empty-state insights', () => {
    const insights = buildDashboardInsights({
      trades: [],
      dailySeries: [],
      metrics: {
        ...metrics,
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        totalNetPnl: 0,
      },
      startingBalance: 100_000,
    })

    expect(insights.rollingWinRate).toEqual([])
    expect(insights.pnlDistribution).toEqual([])
    expect(insights.monthlyHeatmap).toEqual([])
    expect(insights.bestDay).toBeNull()
    expect(insights.worstDay).toBeNull()
    expect(insights.streak.direction).toBe('FLAT')
  })
})
