import type { Prisma } from '@/generated/prisma'

export interface SnapshotTradeInput {
  exitTime: Date | string
  netPnl: number
  totalFees: number
}

export interface SnapshotSeed {
  cumulativePnl: number
  peakEquity: number
  maxDrawdown: number
}

export interface BuiltDailySnapshot {
  date: Date
  dailyPnl: number
  cumulativePnl: number
  peakEquity: number
  drawdown: number
  maxDrawdown: number
  winCount: number
  lossCount: number
  tradeCount: number
  grossPnl: number
  totalFees: number
}

export interface SnapshotRebuildResult {
  fromDate: string | null
  snapshotsWritten: number
  tradesProcessed: number
  lastSnapshotDate: string | null
}

interface DailyBucket {
  date: Date
  dailyPnl: number
  grossPnl: number
  totalFees: number
  tradeCount: number
  winCount: number
  lossCount: number
}

function dateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString().slice(0, 10)
}

export function toUtcDateOnly(value: Date | string): Date {
  const key = dateKey(value)
  return new Date(`${key}T00:00:00.000Z`)
}

export function buildDailySnapshots(
  trades: SnapshotTradeInput[],
  startingBalance: number,
  seed?: Partial<SnapshotSeed>,
): BuiltDailySnapshot[] {
  const grouped = new Map<string, DailyBucket>()

  for (const trade of trades) {
    const key = dateKey(trade.exitTime)
    const current = grouped.get(key) ?? {
      date: toUtcDateOnly(trade.exitTime),
      dailyPnl: 0,
      grossPnl: 0,
      totalFees: 0,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
    }

    current.dailyPnl += trade.netPnl
    current.grossPnl += trade.netPnl + trade.totalFees
    current.totalFees += trade.totalFees
    current.tradeCount += 1

    if (trade.netPnl > 0) current.winCount += 1
    else if (trade.netPnl < 0) current.lossCount += 1

    grouped.set(key, current)
  }

  let cumulativePnl = seed?.cumulativePnl ?? 0
  let peakEquity = seed?.peakEquity ?? startingBalance
  let maxDrawdown = seed?.maxDrawdown ?? 0

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) => {
      cumulativePnl += bucket.dailyPnl
      const equity = startingBalance + cumulativePnl
      peakEquity = Math.max(peakEquity, equity)
      const drawdown = peakEquity - equity
      maxDrawdown = Math.max(maxDrawdown, drawdown)

      return {
        date: bucket.date,
        dailyPnl: bucket.dailyPnl,
        cumulativePnl,
        peakEquity,
        drawdown,
        maxDrawdown,
        winCount: bucket.winCount,
        lossCount: bucket.lossCount,
        tradeCount: bucket.tradeCount,
        grossPnl: bucket.grossPnl,
        totalFees: bucket.totalFees,
      }
    })
}

export async function rebuildDailySnapshotsForAccount(
  tx: Prisma.TransactionClient,
  accountId: string,
  startingBalance: number,
  options: { fromDate?: Date | null } = {},
): Promise<SnapshotRebuildResult> {
  const normalizedFromDate = options.fromDate ? toUtcDateOnly(options.fromDate) : null

  let seed: SnapshotSeed | undefined
  if (normalizedFromDate) {
    const previousSnapshot = await tx.dailySnapshot.findFirst({
      where: {
        accountId,
        date: { lt: normalizedFromDate },
      },
      orderBy: { date: 'desc' },
    })

    if (previousSnapshot) {
      seed = {
        cumulativePnl: previousSnapshot.cumulativePnl.toNumber(),
        peakEquity: previousSnapshot.peakEquity.toNumber(),
        maxDrawdown: previousSnapshot.maxDrawdown.toNumber(),
      }
    }
  }

  await tx.dailySnapshot.deleteMany({
    where: normalizedFromDate
      ? {
          accountId,
          date: { gte: normalizedFromDate },
        }
      : { accountId },
  })

  const trades = await tx.roundTripTrade.findMany({
    where: {
      accountId,
      isOpen: false,
      exitTime: normalizedFromDate ? { gte: normalizedFromDate } : { not: null },
      netPnl: { not: null },
    },
    select: {
      exitTime: true,
      netPnl: true,
      totalFees: true,
    },
    orderBy: { exitTime: 'asc' },
  })

  const snapshots = buildDailySnapshots(
    trades
      .filter((trade) => trade.exitTime !== null && trade.netPnl !== null)
      .map((trade) => ({
        exitTime: trade.exitTime as Date,
        netPnl: trade.netPnl!.toNumber(),
        totalFees: trade.totalFees.toNumber(),
      })),
    startingBalance,
    seed,
  )

  if (snapshots.length > 0) {
    await tx.dailySnapshot.createMany({
      data: snapshots.map((snapshot) => ({
        accountId,
        date: snapshot.date,
        dailyPnl: snapshot.dailyPnl,
        cumulativePnl: snapshot.cumulativePnl,
        peakEquity: snapshot.peakEquity,
        drawdown: snapshot.drawdown,
        maxDrawdown: snapshot.maxDrawdown,
        winCount: snapshot.winCount,
        lossCount: snapshot.lossCount,
        tradeCount: snapshot.tradeCount,
        grossPnl: snapshot.grossPnl,
        totalFees: snapshot.totalFees,
      })),
    })
  }

  return {
    fromDate: normalizedFromDate ? normalizedFromDate.toISOString() : null,
    snapshotsWritten: snapshots.length,
    tradesProcessed: trades.length,
    lastSnapshotDate: snapshots.at(-1)?.date.toISOString() ?? null,
  }
}
