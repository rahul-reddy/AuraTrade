import {
  buildDailySnapshots,
  toUtcDateOnly,
} from '@/lib/engine/daily-snapshots'

describe('daily snapshots', () => {
  it('groups realized trades into ordered daily snapshots', () => {
    const snapshots = buildDailySnapshots(
      [
        { exitTime: '2026-03-10T18:00:00.000Z', netPnl: 150, totalFees: 5 },
        { exitTime: '2026-03-10T19:00:00.000Z', netPnl: -50, totalFees: 2 },
        { exitTime: '2026-03-11T18:00:00.000Z', netPnl: 200, totalFees: 4 },
      ],
      10_000,
    )

    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]).toMatchObject({
      date: new Date('2026-03-10T00:00:00.000Z'),
      dailyPnl: 100,
      cumulativePnl: 100,
      peakEquity: 10_100,
      drawdown: 0,
      maxDrawdown: 0,
      winCount: 1,
      lossCount: 1,
      tradeCount: 2,
      grossPnl: 107,
      totalFees: 7,
    })
    expect(snapshots[1]).toMatchObject({
      date: new Date('2026-03-11T00:00:00.000Z'),
      dailyPnl: 200,
      cumulativePnl: 300,
      peakEquity: 10_300,
      drawdown: 0,
      maxDrawdown: 0,
      winCount: 1,
      lossCount: 0,
      tradeCount: 1,
      grossPnl: 204,
      totalFees: 4,
    })
  })

  it('continues cumulative pnl and drawdown from a seeded snapshot state', () => {
    const snapshots = buildDailySnapshots(
      [
        { exitTime: '2026-03-12T18:00:00.000Z', netPnl: -300, totalFees: 6 },
        { exitTime: '2026-03-13T18:00:00.000Z', netPnl: 100, totalFees: 3 },
      ],
      10_000,
      {
        cumulativePnl: 500,
        peakEquity: 10_700,
        maxDrawdown: 50,
      },
    )

    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]).toMatchObject({
      cumulativePnl: 200,
      peakEquity: 10_700,
      drawdown: 500,
      maxDrawdown: 500,
    })
    expect(snapshots[1]).toMatchObject({
      cumulativePnl: 300,
      peakEquity: 10_700,
      drawdown: 400,
      maxDrawdown: 500,
    })
  })

  it('normalizes dates to utc midnight', () => {
    expect(toUtcDateOnly('2026-03-17T15:45:12.000Z').toISOString()).toBe('2026-03-17T00:00:00.000Z')
    expect(toUtcDateOnly(new Date('2026-03-18T02:05:00.000Z')).toISOString()).toBe(
      '2026-03-18T00:00:00.000Z',
    )
  })
})
