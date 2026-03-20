import { parse as parseDate } from 'date-fns'
import { Prisma } from '@/generated/prisma'
import type { PrismaClient } from '@/generated/prisma'
import type { BrokerLedgerResult } from '@/lib/engine/broker-position-ledger'
import type {
  AnalyzedStatementRow,
  StatementDryRun,
} from '@/lib/parser/schwab-statement-analyzer'

interface PersistBrokerStatementArgs {
  userId: string
  accountId: string
  fileHash: string
  fileName: string
  dryRun: StatementDryRun
  ledger: BrokerLedgerResult
}

function toUtcExpiration(value: string | null): Date | null {
  if (!value) return null
  const parsed = parseDate(value, 'MM/dd/yyyy', new Date())
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
  )
}

function toDecimal(value: number | null): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal(value)
}

function mapRowCreateManyInput(
  statementImportId: string,
  row: AnalyzedStatementRow,
): Prisma.BrokerStatementRowCreateManyInput {
  return {
    statementImportId,
    rowIndex: row.rowIndex,
    rawDate: row.raw.Date ?? null,
    parsedDate: row.date ?? null,
    action: row.action,
    symbol: row.symbol,
    description: row.description,
    quantityRaw: row.raw.Quantity ?? null,
    priceRaw: row.raw.Price ?? null,
    feesRaw: row.raw['Fees & Comm'] ?? null,
    amountRaw: row.raw.Amount ?? null,
    quantity: toDecimal(row.quantity),
    price: toDecimal(row.price),
    fees: toDecimal(row.fees),
    amount: toDecimal(row.amount),
    instrumentType: row.instrumentType,
    actionCategory: row.actionCategory,
    isImportTradeRow: row.isImportTradeRow,
    blocksCanonicalImport: row.blocksCanonicalImport,
    notes: row.notes,
    optionUnderlying: row.optionContract?.underlying ?? null,
    optionExpiration: toUtcExpiration(row.optionContract?.expiration ?? null),
    optionStrike: toDecimal(row.optionContract?.strike ?? null),
    optionType: row.optionContract?.optionType ?? null,
    optionQuantityContracts: toDecimal(row.optionContract?.quantityContracts ?? null),
    optionMultiplier: row.optionContract?.multiplier ?? null,
    underlyingEquivalentQty: toDecimal(row.optionContract?.underlyingEquivalentQty ?? null),
  }
}

function mapPositionCreateManyInput(
  statementImportId: string,
  position: BrokerLedgerResult['positions'][number],
): Prisma.BrokerStatementPositionCreateManyInput {
  return {
    statementImportId,
    instrumentKey: position.instrumentKey,
    instrumentType: position.instrumentType,
    symbol: position.symbol,
    side: position.side,
    totalQty: toDecimal(position.totalQty) ?? new Prisma.Decimal(0),
    closedQty: toDecimal(position.closedQty) ?? new Prisma.Decimal(0),
    remainingQty: toDecimal(position.remainingQty) ?? new Prisma.Decimal(0),
    multiplier: position.multiplier,
    underlyingEquivalentQty:
      toDecimal(position.underlyingEquivalentQty) ?? new Prisma.Decimal(0),
    entryPrice: toDecimal(position.entryPrice) ?? new Prisma.Decimal(0),
    exitPrice: toDecimal(position.exitPrice),
    grossPnl: toDecimal(position.grossPnl),
    totalFees: toDecimal(position.totalFees) ?? new Prisma.Decimal(0),
    netPnl: toDecimal(position.netPnl),
    isOpen: position.isOpen,
    openRows: position.openRows,
    closeRows: position.closeRows,
    openingActions: position.openingActions,
    closingActions: position.closingActions,
    entryTime: position.entryTime,
    exitTime: position.exitTime,
    closeKind: position.closeKind,
  }
}

function mapWarningCreateManyInput(
  statementImportId: string,
  warning: BrokerLedgerResult['warnings'][number],
): Prisma.BrokerStatementWarningCreateManyInput {
  return {
    statementImportId,
    rowIndex: warning.rowIndex ?? null,
    instrumentKey: warning.instrumentKey ?? null,
    message: warning.message,
  }
}

export async function persistBrokerStatementImport(
  db: PrismaClient | Prisma.TransactionClient,
  args: PersistBrokerStatementArgs,
): Promise<{ statementImportId: string }> {
  const existing = await db.brokerStatementImport.findUnique({
    where: {
      accountId_fileHash: {
        accountId: args.accountId,
        fileHash: args.fileHash,
      },
    },
    select: { id: true },
  })

  const metadata = {
    userId: args.userId,
    accountId: args.accountId,
    fileHash: args.fileHash,
    fileName: args.fileName,
    totalRows: args.dryRun.totalRows,
    importableTradeRows: args.dryRun.importableTradeRows,
    blockedTradeRows: args.dryRun.blockedTradeRows,
    nonTradeRows: args.dryRun.nonTradeRows,
    positionAffectingNonTradeRows: args.dryRun.positionAffectingNonTradeRows,
    optionRows: args.dryRun.optionRows,
    skippedRows: args.dryRun.skippedRows,
    importSupported: args.dryRun.importSupported,
    dateFrom: args.dryRun.dateRange?.from ?? null,
    dateTo: args.dryRun.dateRange?.to ?? null,
    warnings: args.dryRun.warnings,
    blockers: args.dryRun.blockers,
    assumptions: args.dryRun.assumptions,
  }

  const statementImport = existing
    ? await db.brokerStatementImport.update({
        where: { id: existing.id },
        data: metadata,
        select: { id: true },
      })
    : await db.brokerStatementImport.create({
        data: metadata,
        select: { id: true },
      })

  await db.brokerStatementRow.deleteMany({
    where: { statementImportId: statementImport.id },
  })
  await db.brokerStatementPosition.deleteMany({
    where: { statementImportId: statementImport.id },
  })
  await db.brokerStatementWarning.deleteMany({
    where: { statementImportId: statementImport.id },
  })

  if (args.dryRun.rows.length > 0) {
    await db.brokerStatementRow.createMany({
      data: args.dryRun.rows.map((row) => mapRowCreateManyInput(statementImport.id, row)),
    })
  }

  if (args.ledger.positions.length > 0) {
    await db.brokerStatementPosition.createMany({
      data: args.ledger.positions.map((position) =>
        mapPositionCreateManyInput(statementImport.id, position),
      ),
    })
  }

  if (args.ledger.warnings.length > 0) {
    await db.brokerStatementWarning.createMany({
      data: args.ledger.warnings.map((warning) =>
        mapWarningCreateManyInput(statementImport.id, warning),
      ),
    })
  }

  return { statementImportId: statementImport.id }
}
