import { Prisma, type PrismaClient } from '@/generated/prisma'
import { prisma as defaultPrisma } from '@/lib/prisma'

type DbClient = PrismaClient | Prisma.TransactionClient

interface DuplicateCandidateRow {
  execTime: Date
  symbol: string
  side: string
  qty: Prisma.Decimal | number | string
  price: Prisma.Decimal | number | string
  count: number
}

interface PositionMismatchRow {
  id: string
  symbol: string
  entryTime: Date
  exitTime: Date | null
  totalQty: Prisma.Decimal | number | string
  closedQty: Prisma.Decimal | number | string
}

interface CountRow {
  count: number
}

export interface IntegrityAccount {
  id: string
  name: string
  startingBalance: number
}

export interface IntegrityReport {
  account: IntegrityAccount
  counts: {
    executions: number
    trades: number
    closedTrades: number
    openTrades: number
    dailySnapshots: number
    orphanedExecutions: number
    positionMismatches: number
    duplicateCandidates: number
  }
  dateRange: {
    firstExecution: string | null
    lastExecution: string | null
    firstSnapshot: string | null
    lastSnapshot: string | null
  }
  orphanedExecutions: Array<{
    id: string
    symbol: string
    side: string
    qty: number
    price: number
    execTime: string
    daySeq: number
  }>
  positionMismatches: Array<{
    id: string
    symbol: string
    entryTime: string
    exitTime: string | null
    totalQty: number
    closedQty: number
  }>
  duplicateCandidates: Array<{
    execTime: string
    symbol: string
    side: string
    qty: number
    price: number
    count: number
  }>
}

function toNumber(value: Prisma.Decimal | number | string): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  return value.toNumber()
}

export async function resolveIntegrityAccount(
  userId: string,
  requestedAccountId?: string | null,
  db: DbClient = defaultPrisma,
): Promise<IntegrityAccount | null> {
  const account = requestedAccountId
    ? await db.tradingAccount.findFirst({
        where: { id: requestedAccountId, userId },
        select: { id: true, name: true, startingBalance: true },
      })
    : await db.tradingAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, startingBalance: true },
      })

  if (!account) return null

  return {
    id: account.id,
    name: account.name,
    startingBalance: account.startingBalance.toNumber(),
  }
}

export async function buildIntegrityReport(
  account: IntegrityAccount,
  db: DbClient = defaultPrisma,
): Promise<IntegrityReport> {
  const [
    executions,
    trades,
    closedTrades,
    openTrades,
    dailySnapshots,
    orphanedExecutionsCount,
    firstExecution,
    lastExecution,
    firstSnapshot,
    lastSnapshot,
    orphanedExecutions,
    positionMismatchCountRows,
    positionMismatchRows,
    duplicateCandidateCountRows,
    duplicateCandidateRows,
  ] = await Promise.all([
    db.execution.count({ where: { accountId: account.id } }),
    db.roundTripTrade.count({ where: { accountId: account.id } }),
    db.roundTripTrade.count({ where: { accountId: account.id, isOpen: false } }),
    db.roundTripTrade.count({ where: { accountId: account.id, isOpen: true } }),
    db.dailySnapshot.count({ where: { accountId: account.id } }),
    db.execution.count({ where: { accountId: account.id, tradeId: null } }),
    db.execution.findFirst({
      where: { accountId: account.id },
      orderBy: { execTime: 'asc' },
      select: { execTime: true },
    }),
    db.execution.findFirst({
      where: { accountId: account.id },
      orderBy: { execTime: 'desc' },
      select: { execTime: true },
    }),
    db.dailySnapshot.findFirst({
      where: { accountId: account.id },
      orderBy: { date: 'asc' },
      select: { date: true },
    }),
    db.dailySnapshot.findFirst({
      where: { accountId: account.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
    db.execution.findMany({
      where: { accountId: account.id, tradeId: null },
      orderBy: [{ execTime: 'desc' }, { daySeq: 'desc' }],
      take: 12,
      select: {
        id: true,
        symbol: true,
        side: true,
        qty: true,
        price: true,
        execTime: true,
        daySeq: true,
      },
    }),
    db.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "RoundTripTrade"
      WHERE "accountId" = ${account.id}
        AND "isOpen" = false
        AND "totalQty" <> "closedQty"
    `),
    db.$queryRaw<PositionMismatchRow[]>(Prisma.sql`
      SELECT
        "id",
        "symbol",
        "entryTime",
        "exitTime",
        "totalQty",
        "closedQty"
      FROM "RoundTripTrade"
      WHERE "accountId" = ${account.id}
        AND "isOpen" = false
        AND "totalQty" <> "closedQty"
      ORDER BY "exitTime" DESC NULLS LAST, "entryTime" DESC
      LIMIT 12
    `),
    db.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM (
        SELECT 1
        FROM "Execution"
        WHERE "accountId" = ${account.id}
        GROUP BY "execTime", "symbol", "side", "qty", "price"
        HAVING COUNT(*) > 1
      ) duplicate_groups
    `),
    db.$queryRaw<DuplicateCandidateRow[]>(Prisma.sql`
      SELECT
        "execTime",
        "symbol",
        "side"::text AS "side",
        "qty",
        "price",
        COUNT(*)::int AS "count"
      FROM "Execution"
      WHERE "accountId" = ${account.id}
      GROUP BY "execTime", "symbol", "side", "qty", "price"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, "execTime" DESC
      LIMIT 12
    `),
  ])

  return {
    account,
    counts: {
      executions,
      trades,
      closedTrades,
      openTrades,
      dailySnapshots,
      orphanedExecutions: orphanedExecutionsCount,
      positionMismatches: positionMismatchCountRows[0]?.count ?? 0,
      duplicateCandidates: duplicateCandidateCountRows[0]?.count ?? 0,
    },
    dateRange: {
      firstExecution: firstExecution?.execTime.toISOString() ?? null,
      lastExecution: lastExecution?.execTime.toISOString() ?? null,
      firstSnapshot: firstSnapshot?.date.toISOString() ?? null,
      lastSnapshot: lastSnapshot?.date.toISOString() ?? null,
    },
    orphanedExecutions: orphanedExecutions.map((execution) => ({
      id: execution.id,
      symbol: execution.symbol,
      side: execution.side,
      qty: execution.qty.toNumber(),
      price: execution.price.toNumber(),
      execTime: execution.execTime.toISOString(),
      daySeq: execution.daySeq,
    })),
    positionMismatches: positionMismatchRows.map((trade) => ({
      id: trade.id,
      symbol: trade.symbol,
      entryTime: trade.entryTime.toISOString(),
      exitTime: trade.exitTime?.toISOString() ?? null,
      totalQty: toNumber(trade.totalQty),
      closedQty: toNumber(trade.closedQty),
    })),
    duplicateCandidates: duplicateCandidateRows.map((candidate) => ({
      execTime: candidate.execTime.toISOString(),
      symbol: candidate.symbol,
      side: candidate.side,
      qty: toNumber(candidate.qty),
      price: toNumber(candidate.price),
      count: candidate.count,
    })),
  }
}
