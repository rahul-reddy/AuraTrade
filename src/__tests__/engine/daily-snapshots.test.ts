import { Prisma } from '@/generated/prisma'
import {
  buildDailySnapshots,
  toUtcDateOnly,
} from '@/lib/engine/daily-snapshots'

function d(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

describe('daily snapshots', () => {
  it('groups realized trades into ordered daily snapshots', () => {
    const snapshots = buildDailySnapshots(
      [
        { exitTime: '2026-03-10T18:00:00.000Z', netPnl: d(150), totalFees: d(5) },
        { exitTime: '2026-03-10T19:00:00.000Z', netPnl: d(-50), totalFees: d(2) },
        { exitTime: '2026-03-11T18:00:00.000Z', netPnl: d(200), totalFees: d(4) },
      ],
      10_000,
    )

    expect(snapshots).toHaveLength(2)
    expect(snapshots[0].date).toEqual(new Date('2026-03-10T00:00:00.000Z'))
    expect(snapshots[0].dailyPnl.toNumber()).toBe(100)
    expect(snapshots[0].cumulativePnl.toNumber()).toBe(100)
    expect(snapshots[0].peakEquity.toNumber()).toBe(10_100)
    expect(snapshots[0].drawdown.toNumber()).toBe(0)
    expect(snapshots[0].maxDrawdown.toNumber()).toBe(0)
    expect(snapshots[0].winCount).toBe(1)
    expect(snapshots[0].lossCount).toBe(1)
    expect(snapshots[0].tradeCount).toBe(2)
    expect(snapshots[0].grossPnl.toNumber()).toBe(107)
    expect(snapshots[0].totalFees.toNumber()).toBe(7)

    expect(snapshots[1].date).toEqual(new Date('2026-03-11T00:00:00.000Z'))
    expect(snapshots[1].dailyPnl.toNumber()).toBe(200)
    expect(snapshots[1].cumulativePnl.toNumber()).toBe(300)
    expect(snapshots[1].peakEquity.toNumber()).toBe(10_300)
    expect(snapshots[1].drawdown.toNumber()).toBe(0)
    expect(snapshots[1].maxDrawdown.toNumber()).toBe(0)
    expect(snapshots[1].winCount).toBe(1)
    expect(snapshots[1].lossCount).toBe(0)
    expect(snapshots[1].tradeCount).toBe(1)
    expect(snapshots[1].grossPnl.toNumber()).toBe(204)
    expect(snapshots[1].totalFees.toNumber()).toBe(4)
  })

  it('continues cumulative pnl and drawdown from a seeded snapshot state', () => {
    const snapshots = buildDailySnapshots(
      [
        { exitTime: '2026-03-12T18:00:00.000Z', netPnl: d(-300), totalFees: d(6) },
        { exitTime: '2026-03-13T18:00:00.000Z', netPnl: d(100), totalFees: d(3) },
      ],
      10_000,
      {
        cumulativePnl: d(500),
        peakEquity: d(10_700),
        maxDrawdown: d(50),
      },
    )

    expect(snapshots).toHaveLength(2)
    expect(snapshots[0].cumulativePnl.toNumber()).toBe(200)
    expect(snapshots[0].peakEquity.toNumber()).toBe(10_700)
    expect(snapshots[0].drawdown.toNumber()).toBe(500)
    expect(snapshots[0].maxDrawdown.toNumber()).toBe(500)

    expect(snapshots[1].cumulativePnl.toNumber()).toBe(300)
    expect(snapshots[1].peakEquity.toNumber()).toBe(10_700)
    expect(snapshots[1].drawdown.toNumber()).toBe(400)
    expect(snapshots[1].maxDrawdown.toNumber()).toBe(500)
  })

  it('normalizes dates to utc midnight', () => {
    expect(toUtcDateOnly('2026-03-17T15:45:12.000Z').toISOString()).toBe('2026-03-17T00:00:00.000Z')
    expect(toUtcDateOnly(new Date('2026-03-18T02:05:00.000Z')).toISOString()).toBe(
      '2026-03-18T00:00:00.000Z',
    )
  })
})
