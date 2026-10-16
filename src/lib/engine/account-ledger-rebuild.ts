import { Prisma, type BrokerStatementRow } from '@/generated/prisma'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'
import { mapBrokerPositionToTradeCreateInput } from '@/lib/engine/broker-trade-importer'
import type {
  AnalyzedStatementRow,
  StatementActionCategory,
  StatementInstrumentType,
  StatementSourceFormat,
} from '@/lib/parser/schwab-statement-analyzer'
import { tosTradingDate } from '@/lib/parser/tos-account-statement-parser'

/**
 * Account-level broker ledger.
 *
 * Every confirmed statement for an account feeds ONE ledger, so a position
 * opened in an earlier statement pairs with its close in a later one
 * (carry-in), and overlapping statements never double-count.
 *
 * Overlap rule — each trading date is owned by exactly one statement per row
 * class, so no fuzzy fill matching across files is needed:
 *   - FILL rows (equity/option trades): thinkorswim Account Statement beats
 *     Schwab Transaction History (per-second times beat date-only), then the
 *     statement whose coverage ends latest, then the most recently created.
 *   - EVENT rows (expirations, journals/transfers, mergers, cash): only
 *     Transaction History carries these — TOS Trade History lists fills only —
 *     so they are always taken from the best Transaction History statement
 *     covering that date, even when a TOS statement owns that day's fills.
 */

export interface LedgerStatementInput {
  id: string
  sourceFormat: StatementSourceFormat
  /** UTC-midnight trading dates; null falls back to the statement's own row span. */
  coverageFrom: Date | null
  coverageTo: Date | null
  createdAt: Date
  rows: AnalyzedStatementRow[]
}

export interface AccountLedgerSelection {
  /** Chronological rows from all statements, renumbered 0..n-1. */
  rows: AnalyzedStatementRow[]
  /** rowOrigins[i] is the source of rows[i]. */
  rowOrigins: Array<{ statementId: string; rowIndex: number }>
  /** Rows dropped because another statement owns that trading date. */
  replacedRows: number
  /** Rows dropped because they have no parseable date. */
  undatedRows: number
}

type RowClass = 'FILL' | 'EVENT'

const FORMAT_RANK: Record<StatementSourceFormat, number> = {
  TOS_ACCOUNT_STATEMENT: 2,
  SCHWAB_TRANSACTION_HISTORY: 1,
}

function rowClass(row: AnalyzedStatementRow): RowClass {
  return row.actionCategory === 'EQUITY_TRADE' || row.actionCategory === 'OPTION_TRADE'
    ? 'FILL'
    : 'EVENT'
}

function canProvide(format: StatementSourceFormat, cls: RowClass): boolean {
  return cls === 'FILL' || format === 'SCHWAB_TRANSACTION_HISTORY'
}

/**
 * Trading date of a row. Transaction History dates are stored as UTC midnight;
 * TOS fills are instants and must be read in the exchange's time zone.
 */
export function tradingDateOf(
  row: AnalyzedStatementRow,
  format: StatementSourceFormat,
): string | null {
  if (!row.date) return null
  return format === 'TOS_ACCOUNT_STATEMENT'
    ? tosTradingDate(row.date)
    : row.date.toISOString().slice(0, 10)
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function selectAccountLedgerRows(
  statements: LedgerStatementInput[],
): AccountLedgerSelection {
  const ranked = statements
    .map((statement) => {
      const days = statement.rows
        .map((row) => tradingDateOf(row, statement.sourceFormat))
        .filter((day): day is string => day != null)
        .sort()
      return {
        statement,
        from: statement.coverageFrom ? isoDay(statement.coverageFrom) : days[0] ?? null,
        to: statement.coverageTo ? isoDay(statement.coverageTo) : days[days.length - 1] ?? null,
      }
    })
    .sort((left, right) => {
      const byFormat =
        FORMAT_RANK[right.statement.sourceFormat] - FORMAT_RANK[left.statement.sourceFormat]
      if (byFormat !== 0) return byFormat
      const byCoverageEnd = (right.to ?? '').localeCompare(left.to ?? '')
      if (byCoverageEnd !== 0) return byCoverageEnd
      const byCreated =
        right.statement.createdAt.getTime() - left.statement.createdAt.getTime()
      if (byCreated !== 0) return byCreated
      return left.statement.id.localeCompare(right.statement.id)
    })

  const ownerCache = new Map<string, string | null>()
  function ownerOf(day: string, cls: RowClass): string | null {
    const key = `${day}|${cls}`
    const cached = ownerCache.get(key)
    if (cached !== undefined) return cached
    const owner =
      ranked.find(
        ({ statement, from, to }) =>
          canProvide(statement.sourceFormat, cls) &&
          from != null &&
          to != null &&
          from <= day &&
          day <= to,
      )?.statement.id ?? null
    ownerCache.set(key, owner)
    return owner
  }

  const createdOrder = new Map(
    [...statements]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map((statement, index) => [statement.id, index]),
  )

  const selected: Array<{ row: AnalyzedStatementRow; statementId: string }> = []
  let replacedRows = 0
  let undatedRows = 0

  for (const statement of statements) {
    for (const row of statement.rows) {
      const day = tradingDateOf(row, statement.sourceFormat)
      if (!day) {
        undatedRows += 1
        continue
      }
      if (ownerOf(day, rowClass(row)) === statement.id) {
        selected.push({ row, statementId: statement.id })
      } else {
        replacedRows += 1
      }
    }
  }

  // Chronological; ties keep each statement's own row order. A date-only EVENT
  // row (UTC midnight) sorts before that day's timestamped TOS fills.
  selected.sort((left, right) => {
    const byTime = (left.row.date?.getTime() ?? 0) - (right.row.date?.getTime() ?? 0)
    if (byTime !== 0) return byTime
    const byStatement =
      (createdOrder.get(left.statementId) ?? 0) - (createdOrder.get(right.statementId) ?? 0)
    if (byStatement !== 0) return byStatement
    return left.row.rowIndex - right.row.rowIndex
  })

  return {
    rows: selected.map(({ row }, index) => ({ ...row, rowIndex: index })),
    rowOrigins: selected.map(({ row, statementId }) => ({
      statementId,
      rowIndex: row.rowIndex,
    })),
    replacedRows,
    undatedRows,
  }
}

// ─── persisted row → analyzed row ───────────────────────────────────

const INSTRUMENT_TYPES = new Set<StatementInstrumentType>([
  'EQUITY', 'OPTION', 'CASH', 'CORPORATE_ACTION', 'UNKNOWN',
])
const ACTION_CATEGORIES = new Set<StatementActionCategory>([
  'EQUITY_TRADE', 'OPTION_TRADE', 'OPTION_LIFECYCLE', 'POSITION_TRANSFER',
  'INCOME', 'CASH_TRANSFER', 'CORPORATE_ACTION', 'FEE', 'UNKNOWN',
])

function asInstrumentType(value: string): StatementInstrumentType {
  return INSTRUMENT_TYPES.has(value as StatementInstrumentType)
    ? (value as StatementInstrumentType)
    : 'UNKNOWN'
}

function asActionCategory(value: string): StatementActionCategory {
  return ACTION_CATEGORIES.has(value as StatementActionCategory)
    ? (value as StatementActionCategory)
    : 'UNKNOWN'
}

export function asSourceFormat(value: string): StatementSourceFormat {
  return value === 'TOS_ACCOUNT_STATEMENT' ? 'TOS_ACCOUNT_STATEMENT' : 'SCHWAB_TRANSACTION_HISTORY'
}

function formatExpiration(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${month}/${day}/${date.getUTCFullYear()}`
}

function toNumber(value: Prisma.Decimal | null): number | null {
  return value == null ? null : value.toNumber()
}

export function mapStoredRowToAnalyzedRow(row: BrokerStatementRow): AnalyzedStatementRow {
  const optionContract =
    row.optionUnderlying && row.optionExpiration && row.optionStrike && row.optionType
      ? {
          underlying: row.optionUnderlying,
          expiration: formatExpiration(row.optionExpiration),
          strike: row.optionStrike.toNumber(),
          optionType: row.optionType === 'PUT' ? ('PUT' as const) : ('CALL' as const),
          quantityContracts: toNumber(row.optionQuantityContracts),
          multiplier: row.optionMultiplier,
          underlyingEquivalentQty: toNumber(row.underlyingEquivalentQty),
        }
      : null

  return {
    rowIndex: row.rowIndex,
    raw: {},
    date: row.parsedDate,
    action: row.action,
    symbol: row.symbol,
    description: row.description,
    quantity: toNumber(row.quantity),
    price: toNumber(row.price),
    fees: toNumber(row.fees) ?? 0,
    amount: toNumber(row.amount),
    instrumentType: asInstrumentType(row.instrumentType),
    actionCategory: asActionCategory(row.actionCategory),
    optionContract,
    isImportTradeRow: row.isImportTradeRow,
    blocksCanonicalImport: row.blocksCanonicalImport,
    notes: row.notes,
  }
}

// ─── database rebuild ───────────────────────────────────────────────

export interface LedgerRebuildResult {
  statementsUsed: number
  rowsUsed: number
  replacedRows: number
  closedTrades: number
  openPositions: number
  annotationsPreserved: number
  warnings: string[]
  earliestEntry: Date | null
}

function annotationKey(symbol: string, direction: string, entryTime: Date): string {
  return `${symbol}|${direction}|${entryTime.toISOString()}`
}

/**
 * Replaces every statement-derived RoundTripTrade for the account with a fresh
 * account-level ledger over all confirmed statements. Execution-backed legacy
 * trades (brokerStatementImportId = null) are left untouched.
 *
 * User annotations (tags, notes) survive the rebuild when a trade keeps the
 * same symbol, direction, and entry time. Derived rows (TradeContext,
 * TradeClassification) cascade-delete and are recreated by enrichment.
 */
export async function rebuildLedgerTradesForAccount(
  tx: Prisma.TransactionClient,
  accountId: string,
): Promise<LedgerRebuildResult> {
  const statements = await tx.brokerStatementImport.findMany({
    where: { accountId, confirmedAt: { not: null } },
    include: { rows: { orderBy: { rowIndex: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  const selection = selectAccountLedgerRows(
    statements.map((statement) => ({
      id: statement.id,
      sourceFormat: asSourceFormat(statement.sourceFormat),
      coverageFrom: statement.coverageFrom,
      coverageTo: statement.coverageTo,
      createdAt: statement.createdAt,
      rows: statement.rows.map(mapStoredRowToAnalyzedRow),
    })),
  )
  const ledger = buildBrokerPositionLedger(selection.rows)

  const existing = await tx.roundTripTrade.findMany({
    where: { accountId, brokerStatementImportId: { not: null } },
    select: { symbol: true, direction: true, entryTime: true, tags: true, notes: true, notesUpdatedAt: true },
  })
  const annotations = new Map(
    existing
      .filter((trade) => trade.tags.length > 0 || trade.notes != null)
      .map((trade) => [annotationKey(trade.symbol, trade.direction, trade.entryTime), trade]),
  )

  await tx.roundTripTrade.deleteMany({
    where: { accountId, brokerStatementImportId: { not: null } },
  })

  let annotationsPreserved = 0
  const data = ledger.positions.map((position) => {
    const firstRow = position.openRows[0] ?? position.closeRows[0]
    const statementId =
      selection.rowOrigins[firstRow]?.statementId ?? statements[0]?.id ?? null
    const input = mapBrokerPositionToTradeCreateInput(accountId, statementId, null, position)
    const annotation = annotations.get(
      annotationKey(position.symbol, input.direction, position.entryTime),
    )
    if (annotation) {
      annotationsPreserved += 1
      return {
        ...input,
        tags: annotation.tags,
        notes: annotation.notes,
        notesUpdatedAt: annotation.notesUpdatedAt,
      }
    }
    return input
  })

  if (data.length > 0) {
    await tx.roundTripTrade.createMany({ data })
  }

  const openPositions = ledger.positions.filter((position) => position.isOpen).length
  const earliestEntry = ledger.positions.reduce<Date | null>(
    (earliest, position) =>
      earliest == null || position.entryTime < earliest ? position.entryTime : earliest,
    null,
  )

  return {
    statementsUsed: statements.length,
    rowsUsed: selection.rows.length,
    replacedRows: selection.replacedRows,
    closedTrades: ledger.positions.length - openPositions,
    openPositions,
    annotationsPreserved,
    warnings: ledger.warnings.map((warning) => warning.message),
    earliestEntry,
  }
}
