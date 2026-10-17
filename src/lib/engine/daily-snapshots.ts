import { Prisma } from '@/generated/prisma'
import { tradingDayKey } from '@/lib/trades/trading-date'

export interface SnapshotTradeInput {
  exitTime: Date | string
  /** Exchange trading date of the close; buckets the trade when present. */
  exitTradingDate?: Date | string | null
  netPnl: Prisma.Decimal
  totalFees: Prisma.Decimal
}

export interface SnapshotSeed {
  cumulativePnl: Prisma.Decimal
  peakEquity: Prisma.Decimal
  maxDrawdown: Prisma.Decimal
}

export interface BuiltDailySnapshot {
  date: Date
  dailyPnl: Prisma.Decimal
  cumulativePnl: Prisma.Decimal
  peakEquity: Prisma.Decimal
  drawdown: Prisma.Decimal
  maxDrawdown: Prisma.Decimal
  winCount: number
  lossCount: number
  tradeCount: number
  grossPnl: Prisma.Decimal
  totalFees: Prisma.Decimal
}

export interface SnapshotRebuildResult {
  fromDate: string | null
  snapshotsWritten: number
  tradesProcessed: number
  lastSnapshotDate: string | null
}

interface DailyBucket {
  date: Date
  dailyPnl: Prisma.Decimal
  grossPnl: Prisma.Decimal
  totalFees: Prisma.Decimal
  tradeCount: number
  winCount: number
  lossCount: number
}

const ZERO = new Prisma.Decimal(0)

function decimalMax(left: Prisma.Decimal, right: Prisma.Decimal): Prisma.Decimal {
  return left.greaterThan(right) ? left : right
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
    const key = tradingDayKey(trade.exitTradingDate, trade.exitTime)
    const current = grouped.get(key) ?? {
      date: new Date(`${key}T00:00:00.000Z`),
      dailyPnl: ZERO,
      grossPnl: ZERO,
      totalFees: ZERO,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
    }

    current.dailyPnl = current.dailyPnl.plus(trade.netPnl)
    current.grossPnl = current.grossPnl.plus(trade.netPnl).plus(trade.totalFees)
    current.totalFees = current.totalFees.plus(trade.totalFees)
    current.tradeCount += 1

    if (trade.netPnl.greaterThan(ZERO)) current.winCount += 1
    else if (trade.netPnl.lessThan(ZERO)) current.lossCount += 1

    grouped.set(key, current)
  }

  const startingBalanceDecimal = new Prisma.Decimal(startingBalance)
  let cumulativePnl = seed?.cumulativePnl ?? ZERO
  let peakEquity = seed?.peakEquity ?? startingBalanceDecimal
  let maxDrawdown = seed?.maxDrawdown ?? ZERO

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) => {
      cumulativePnl = cumulativePnl.plus(bucket.dailyPnl)
      const equity = startingBalanceDecimal.plus(cumulativePnl)
      peakEquity = decimalMax(peakEquity, equity)
      const drawdown = peakEquity.minus(equity)
      maxDrawdown = decimalMax(maxDrawdown, drawdown)

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
  let rebuildFromDate = normalizedFromDate

  if (rebuildFromDate) {
    const previousSnapshot = await tx.dailySnapshot.findFirst({
      where: {
        accountId,
        date: { lt: rebuildFromDate },
      },
      orderBy: { date: 'desc' },
    })

    if (previousSnapshot) {
      seed = {
        cumulativePnl: previousSnapshot.cumulativePnl,
        peakEquity: previousSnapshot.peakEquity,
        maxDrawdown: previousSnapshot.maxDrawdown,
      }
    } else {
      rebuildFromDate = null
    }
  }

  await tx.dailySnapshot.deleteMany({
    where: rebuildFromDate
      ? {
          accountId,
          date: { gte: rebuildFromDate },
        }
      : { accountId },
  })

  const trades = await tx.roundTripTrade.findMany({
    where: {
      accountId,
      isOpen: false,
      exitTime: { not: null },
      ...(rebuildFromDate
        ? {
            OR: [
              { exitTradingDate: { gte: rebuildFromDate } },
              { exitTradingDate: null, exitTime: { gte: rebuildFromDate } },
            ],
          }
        : {}),
      netPnl: { not: null },
    },
    select: {
      exitTime: true,
      exitTradingDate: true,
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
        exitTradingDate: trade.exitTradingDate,
        netPnl: trade.netPnl!,
        totalFees: trade.totalFees,
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
    fromDate: rebuildFromDate ? rebuildFromDate.toISOString() : null,
    snapshotsWritten: snapshots.length,
    tradesProcessed: trades.length,
    lastSnapshotDate: snapshots.at(-1)?.date.toISOString() ?? null,
  }
}
