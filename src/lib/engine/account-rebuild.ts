import { groupTrades } from '@/lib/engine/trade-grouper'
import type { ParsedExecution } from '@/lib/parser/tos-csv-parser'
import type { Execution, Prisma } from '@/generated/prisma'

export type ParsedDbExecution = ParsedExecution & { dbId: string }

export interface TradeRebuildResult {
  totalExecutions: number
  totalTrades: number
  closedTrades: number
  openPositions: number
  warnings: string[]
  earliestExecutionDate: Date | null
}

/** Map a DB execution row back to the shape expected by the FIFO grouper. */
export function executionToParsedExecution(row: Execution): ParsedDbExecution {
  const isShort = row.side === 'SELL_SHORT' || row.side === 'BUY_TO_COVER'

  return {
    dbId: row.id,
    rowIndex: row.daySeq,
    date: new Date(row.execTime.toISOString().split('T')[0] + 'T00:00:00.000Z'),
    symbol: row.symbol,
    action: row.side,
    side: row.side === 'BUY' || row.side === 'BUY_TO_COVER' ? 'BUY' : 'SELL',
    posEffect: row.posEffect === 'OPEN' ? 'OPEN' : 'CLOSE',
    direction: isShort ? 'SHORT' : 'LONG',
    qty: row.qty.toNumber(),
    price: row.price.toNumber(),
    commission: row.commission.toNumber(),
    amount: 0,
    description: '',
  }
}

function normalizeToUtcMidnight(value: Date): Date {
  return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`)
}

export async function rebuildTradesForAccount(
  tx: Prisma.TransactionClient,
  accountId: string,
): Promise<TradeRebuildResult> {
  await tx.execution.updateMany({
    where: { accountId },
    data: { tradeId: null },
  })

  await tx.roundTripTrade.deleteMany({ where: { accountId } })

  const executions = await tx.execution.findMany({
    where: { accountId },
    orderBy: [{ execTime: 'asc' }, { daySeq: 'asc' }],
  })

  if (executions.length === 0) {
    return {
      totalExecutions: 0,
      totalTrades: 0,
      closedTrades: 0,
      openPositions: 0,
      warnings: [],
      earliestExecutionDate: null,
    }
  }

  const parsedExecutions = executions.map(executionToParsedExecution)
  const { trades, warnings } = groupTrades(parsedExecutions)

  for (const trade of trades) {
    const created = await tx.roundTripTrade.create({
      data: {
        accountId,
        symbol: trade.symbol,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice ?? undefined,
        totalQty: trade.totalQty,
        closedQty: trade.closedQty,
        grossPnl: trade.grossPnl ?? undefined,
        totalFees: trade.totalFees,
        netPnl: trade.netPnl ?? undefined,
        isOpen: trade.isOpen,
        entryTime: trade.entryTime,
        exitTime: trade.exitTime ?? undefined,
        durationSeconds: trade.durationSeconds ?? undefined,
      },
    })

    const fillIds = [
      ...trade.openingFills.map((fill) => (fill as ParsedDbExecution).dbId),
      ...trade.closingFills.map((fill) => (fill as ParsedDbExecution).dbId),
    ].filter(Boolean)

    if (fillIds.length > 0) {
      await tx.execution.updateMany({
        where: { id: { in: fillIds } },
        data: { tradeId: created.id },
      })
    }
  }

  const closedTrades = trades.filter((trade) => !trade.isOpen).length
  const openPositions = trades.length - closedTrades

  return {
    totalExecutions: executions.length,
    totalTrades: trades.length,
    closedTrades,
    openPositions,
    warnings: warnings.map((warning) => warning.message),
    earliestExecutionDate: executions[0] ? normalizeToUtcMidnight(executions[0].execTime) : null,
  }
}
