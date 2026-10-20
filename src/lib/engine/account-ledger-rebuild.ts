import { randomUUID } from 'crypto'
import { Prisma, type BrokerStatementRow } from '@/generated/prisma'
import {
  buildBrokerPositionLedger,
  summarizeBrokerLedger,
  type BrokerLedgerPreviewSummary,
  type BrokerLedgerResult,
} from '@/lib/engine/broker-position-ledger'
import { mapBrokerPositionToTradeCreateInput } from '@/lib/engine/broker-trade-importer'
import type {
  AnalyzedStatementRow,
  StatementDryRun,
  StatementActionCategory,
  StatementInstrumentType,
  StatementSourceFormat,
} from '@/lib/parser/schwab-statement-analyzer'
import { fromZonedTime } from 'date-fns-tz'
import {
  TOS_ACCOUNT_STATEMENT_DEFAULT_TIME_ZONE,
  tosTradingDate,
} from '@/lib/parser/tos-account-statement-parser'

/**
 * Account-level broker ledger.
 *
 * Every confirmed statement for an account feeds ONE ledger, so a position
 * opened in an earlier statement pairs with its close in a later one
 * (carry-in), and overlapping statements never double-count.
 *
 * Overlap rule — each trading date is owned by exactly one statement per row
 * class, so no fuzzy fill matching across files is needed (legacy executions,
 * if any, rank below every real statement and never own events):
 *   - FILL rows (equity/option trades): thinkorswim Account Statement beats
 *     Schwab Transaction History (per-second times beat date-only), then the
 *     API's complete-day transaction snapshot beats a date-only CSV. API
 *     snapshots cannot supply or suppress lifecycle/event rows. Within a format,
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
  /**
   * Synthetic input built from legacy Execution rows. It ranks below every
   * real statement whatever its coverage, and never owns lifecycle events
   * (legacy executions are equity fills only).
   */
  isLegacy?: boolean
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
  SCHWAB_API: 1.5,
  SCHWAB_TRANSACTION_HISTORY: 1,
}

function rowClass(row: AnalyzedStatementRow): RowClass {
  return row.actionCategory === 'EQUITY_TRADE' || row.actionCategory === 'OPTION_TRADE'
    ? 'FILL'
    : 'EVENT'
}

function canProvide(statement: LedgerStatementInput, cls: RowClass): boolean {
  if (cls === 'FILL') return true
  return statement.sourceFormat === 'SCHWAB_TRANSACTION_HISTORY' && !statement.isLegacy
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

/**
 * Transaction History has no time of day, so its rows sit at UTC midnight —
 * before every timestamped TOS fill on the same trading day. An option
 * expiration settles after the close, so a date-only Expired row is placed at
 * the end of its trading day (exchange time). Otherwise a contract bought on
 * expiration day (TOS fill) would be "expired" before it was opened. Other
 * rows keep their stored date.
 */
function placeDateOnlyEvent(
  row: AnalyzedStatementRow,
  format: StatementSourceFormat,
  tradingDay: string,
): AnalyzedStatementRow {
  if (format !== 'SCHWAB_TRANSACTION_HISTORY' || row.actionCategory !== 'OPTION_LIFECYCLE') {
    return row
  }
  return {
    ...row,
    date: fromZonedTime(`${tradingDay}T23:59:59.999`, TOS_ACCOUNT_STATEMENT_DEFAULT_TIME_ZONE),
  }
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
      // Legacy executions only fill days no real statement covers.
      const byLegacy = Number(left.statement.isLegacy ?? false) - Number(right.statement.isLegacy ?? false)
      if (byLegacy !== 0) return byLegacy
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
          canProvide(statement, cls) &&
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
        selected.push({
          row: { ...placeDateOnlyEvent(row, statement.sourceFormat, day), tradingDate: day },
          statementId: statement.id,
        })
      } else {
        replacedRows += 1
      }
    }
  }

  // Chronological; ties keep each statement's own row order. Date-only rows sit
  // at UTC midnight (before that day's timestamped TOS fills), except
  // expirations, which placeDateOnlyEvent moves to the end of the trading day.
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
  if (value === 'SCHWAB_API') return value
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

// ─── statement impact ───────────────────────────────────────────────

export interface StatementImpact extends BrokerLedgerPreviewSummary {
  /** Ledger warnings raised on this statement's own rows. */
  warnings: string[]
}

/**
 * What one statement contributes to the account-level ledger: every position
 * it opens OR closes. A close-only statement (its opens live in an earlier
 * statement) therefore reports the trades it completes, with their realized
 * P&L, instead of looking empty.
 */
export function summarizeStatementImpact(
  selection: AccountLedgerSelection,
  ledger: BrokerLedgerResult,
  statementId: string,
): StatementImpact {
  const ownsRow = (rowIndex: number) => selection.rowOrigins[rowIndex]?.statementId === statementId
  const touched = ledger.positions.filter(
    (position) => position.openRows.some(ownsRow) || position.closeRows.some(ownsRow),
  )
  const warnings = ledger.warnings
    .filter((warning) => warning.rowIndex != null && ownsRow(warning.rowIndex))
    .map((warning) => warning.message)
  return {
    ...summarizeBrokerLedger({ positions: touched, warnings: [] }),
    warnings,
  }
}

export interface AccountImportDecision {
  canImport: boolean
  /** Rows the ledger models: fills plus position-affecting events. */
  ledgerRows: number
  /** Positions this statement opens, closes, expires or transfers. */
  touchedPositions: number
  blockers: string[]
}

/**
 * Whether a statement can be confirmed into the account ledger. Shared by the
 * upload preview and confirm routes so they can never disagree.
 *
 * Counts expirations, transfers and mergers as well as fills, so a follow-up
 * statement holding only an option's Expired row (or only a transfer-out)
 * imports and closes the position opened earlier.
 */
export function evaluateAccountImport(args: {
  dryRun: Pick<
    StatementDryRun,
    'importableTradeRows' | 'blockedTradeRows' | 'positionAffectingNonTradeRows'
  >
  impact: BrokerLedgerPreviewSummary
  supportReasons: string[]
}): AccountImportDecision {
  const { dryRun, impact, supportReasons } = args
  // Transaction History marks option rows "blocked" only for the retired
  // Execution path; rows that truly cannot import arrive via supportReasons.
  const ledgerRows =
    dryRun.importableTradeRows + dryRun.blockedTradeRows + dryRun.positionAffectingNonTradeRows
  const touchedPositions =
    impact.closedTradeLikePositions + impact.openPositions + impact.transferredPositions
  const blockers = [...supportReasons]
  return {
    canImport: blockers.length === 0 && ledgerRows > 0 && touchedPositions > 0,
    ledgerRows,
    touchedPositions,
    blockers,
  }
}

// ─── legacy executions ──────────────────────────────────────────────

/**
 * Accounts imported before the statement ledger hold Execution rows (equity,
 * date-only, from Schwab Transaction History). They enter the account ledger
 * as one synthetic statement so their positions pair with later statements
 * (a legacy buy closed by a new statement's sell) and so every trade in the
 * account comes from one engine. It ranks as the oldest Transaction History
 * input: a real statement covering the same day owns that day's fills.
 */
export const LEGACY_EXECUTIONS_STATEMENT_ID = 'legacy-executions'

const LEGACY_SIDE_ACTIONS: Record<string, string> = {
  BUY: 'Buy',
  SELL: 'Sell',
  SELL_SHORT: 'Sell Short',
  BUY_TO_COVER: 'Buy to Cover',
}

export interface LegacyExecution {
  id: string
  execTime: Date
  daySeq: number
  symbol: string
  side: string
  qty: number
  price: number
  commission: number
}

export function mapLegacyExecutionsToStatement(
  executions: LegacyExecution[],
): { statement: LedgerStatementInput; executionIds: string[] } | null {
  const ordered = [...executions].sort(
    (left, right) =>
      left.execTime.getTime() - right.execTime.getTime() || left.daySeq - right.daySeq,
  )
  if (ordered.length === 0) return null

  const rows: AnalyzedStatementRow[] = ordered.map((execution, rowIndex) => {
    const action = LEGACY_SIDE_ACTIONS[execution.side]
    return {
      rowIndex,
      raw: {},
      date: execution.execTime,
      action: action ?? execution.side,
      symbol: execution.symbol,
      description: `Legacy execution ${execution.side} ${execution.symbol}`,
      quantity: execution.qty,
      price: execution.price,
      fees: execution.commission,
      amount: null,
      instrumentType: 'EQUITY',
      // An unknown side cannot be placed in the ledger: keep it out rather
      // than guess its direction.
      actionCategory: action ? 'EQUITY_TRADE' : 'UNKNOWN',
      optionContract: null,
      isImportTradeRow: action != null,
      blocksCanonicalImport: action == null,
      notes: [],
    }
  })

  return {
    statement: {
      id: LEGACY_EXECUTIONS_STATEMENT_ID,
      sourceFormat: 'SCHWAB_TRANSACTION_HISTORY',
      coverageFrom: ordered[0].execTime,
      coverageTo: ordered[ordered.length - 1].execTime,
      createdAt: new Date(0),
      rows,
      isLegacy: true,
    },
    executionIds: ordered.map((execution) => execution.id),
  }
}

// ─── database access ────────────────────────────────────────────────

type LedgerDb = Prisma.TransactionClient

interface LedgerInputs {
  statements: LedgerStatementInput[]
  /** executionIds[rowIndex] for rows of the synthetic legacy statement. */
  legacyExecutionIds: string[]
  /** Source format per input statement id (for annotation matching). */
  formatById: Map<string, StatementSourceFormat>
}

async function loadLedgerInputs(db: LedgerDb, accountId: string): Promise<LedgerInputs> {
  const [stored, executions] = await Promise.all([
    db.brokerStatementImport.findMany({
      where: { accountId, confirmedAt: { not: null } },
      include: { rows: { orderBy: { rowIndex: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.execution.findMany({
      where: { accountId },
      select: {
        id: true,
        execTime: true,
        daySeq: true,
        symbol: true,
        side: true,
        qty: true,
        price: true,
        commission: true,
      },
    }),
  ])

  const statements: LedgerStatementInput[] = stored.map((statement) => ({
    id: statement.id,
    sourceFormat: asSourceFormat(statement.sourceFormat),
    coverageFrom: statement.coverageFrom,
    coverageTo: statement.coverageTo,
    createdAt: statement.createdAt,
    rows: statement.rows.map(mapStoredRowToAnalyzedRow),
  }))
  const legacy = mapLegacyExecutionsToStatement(
    executions.map((execution) => ({
      id: execution.id,
      execTime: execution.execTime,
      daySeq: execution.daySeq,
      symbol: execution.symbol,
      side: execution.side,
      qty: execution.qty.toNumber(),
      price: execution.price.toNumber(),
      commission: execution.commission.toNumber(),
    })),
  )
  if (legacy) statements.push(legacy.statement)

  return {
    statements,
    legacyExecutionIds: legacy?.executionIds ?? [],
    formatById: new Map(statements.map((statement) => [statement.id, statement.sourceFormat])),
  }
}

/**
 * Previews confirming `candidate` against everything already in the account
 * ledger, without writing. The candidate carries its persisted createdAt so
 * day ownership matches what the confirm-time rebuild will decide.
 */
export async function previewStatementImport(
  db: LedgerDb,
  accountId: string,
  candidate: LedgerStatementInput,
): Promise<StatementImpact> {
  const { statements } = await loadLedgerInputs(db, accountId)
  const selection = selectAccountLedgerRows([
    ...statements.filter((statement) => statement.id !== candidate.id),
    candidate,
  ])
  return summarizeStatementImpact(selection, buildBrokerPositionLedger(selection.rows), candidate.id)
}

/**
 * Serializes account-ledger writers for the rest of the transaction. Every
 * caller that confirms a statement or rebuilds ledger trades takes this lock
 * BEFORE reading confirmed statements, so two concurrent confirmations cannot
 * each rebuild from a snapshot missing the other's statement. Transaction-scoped
 * advisory locks release on commit or rollback; other accounts are unaffected.
 */
export async function lockAccountLedger(tx: LedgerDb, accountId: string): Promise<void> {
  const lockKey = `account-ledger:${accountId}`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
}

// ─── annotations ────────────────────────────────────────────────────

/** A trade being replaced by a rebuild, with whatever the user wrote on it. */
export interface TradeAnnotation {
  /** "<statementId>:<rowIndex>" or "exec:<executionId>"; null before identities existed. */
  sourceKey: string | null
  symbol: string
  direction: string
  entryTime: Date
  /** Format of the input the trade came from; date-only formats store UTC midnight. */
  sourceFormat: StatementSourceFormat
  tags: string[]
  notes: string | null
  notesUpdatedAt: Date | null
  journalId?: string | null
}

export interface RebuiltTradeIdentity {
  sourceKey: string
  symbol: string
  direction: string
  entryTime: Date
  sourceFormat: StatementSourceFormat
}

function entryTradingDay(entryTime: Date, format: StatementSourceFormat): string {
  return format === 'TOS_ACCOUNT_STATEMENT'
    ? tosTradingDate(entryTime)
    : entryTime.toISOString().slice(0, 10)
}

/**
 * Carries tags/notes from the trades a rebuild replaces to the rebuilt ones.
 *
 * `previous` lists EVERY existing trade (annotated or not), so uniqueness is
 * judged against all of them. Matching runs three passes, strongest first,
 * and a pass only pairs a key that is unique on BOTH sides:
 *   1. sourceKey — the statement row (or execution) that opened the trade;
 *   2. symbol + direction + entry instant;
 *   3. symbol + direction + entry trading day — carries annotations across a
 *      format upgrade where a date-only entry becomes a timestamped fill.
 * Repeated same-day round trips with identical keys are left unmatched rather
 * than guessed, so an annotation never moves to a different trade.
 *
 * Returns rebuilt-trade index → annotation, for annotated trades only.
 */
export function matchAnnotations(
  previous: TradeAnnotation[],
  rebuilt: RebuiltTradeIdentity[],
): Map<number, TradeAnnotation> {
  const pairs = new Map<number, TradeAnnotation>()
  const pairedOld = new Set<TradeAnnotation>()

  const pass = (
    oldKey: (trade: TradeAnnotation) => string | null,
    newKey: (trade: RebuiltTradeIdentity) => string,
  ) => {
    const olds = new Map<string, TradeAnnotation[]>()
    for (const trade of previous) {
      if (pairedOld.has(trade)) continue
      const key = oldKey(trade)
      if (key != null) olds.set(key, [...(olds.get(key) ?? []), trade])
    }
    const news = new Map<string, number[]>()
    rebuilt.forEach((trade, index) => {
      if (pairs.has(index)) return
      const key = newKey(trade)
      news.set(key, [...(news.get(key) ?? []), index])
    })
    for (const [key, oldTrades] of olds) {
      const newIndices = news.get(key) ?? []
      if (oldTrades.length === 1 && newIndices.length === 1) {
        pairs.set(newIndices[0], oldTrades[0])
        pairedOld.add(oldTrades[0])
      }
    }
  }

  const instant = (symbol: string, direction: string, entryTime: Date) =>
    `${symbol}|${direction}|${entryTime.toISOString()}`
  const day = (symbol: string, direction: string, entryTime: Date, format: StatementSourceFormat) =>
    `${symbol}|${direction}|${entryTradingDay(entryTime, format)}`

  pass((trade) => trade.sourceKey, (trade) => trade.sourceKey)
  pass(
    (trade) => instant(trade.symbol, trade.direction, trade.entryTime),
    (trade) => instant(trade.symbol, trade.direction, trade.entryTime),
  )
  pass(
    (trade) => day(trade.symbol, trade.direction, trade.entryTime, trade.sourceFormat),
    (trade) => day(trade.symbol, trade.direction, trade.entryTime, trade.sourceFormat),
  )

  const annotated = new Map<number, TradeAnnotation>()
  for (const [index, trade] of pairs) {
    if (trade.tags.length > 0 || trade.notes != null || trade.journalId != null) annotated.set(index, trade)
  }
  return annotated
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
  /** Contribution of `impactFor`'s statement, when requested. */
  impact: StatementImpact | null
}

/**
 * Replaces every RoundTripTrade for the account with a fresh account-level
 * ledger over all confirmed statements plus any legacy executions. Callers
 * must hold lockAccountLedger. Legacy executions are re-linked to the trades
 * rebuilt from them (chart fills and classifier signals use that link).
 *
 * User annotations survive via matchAnnotations. Derived rows (TradeContext,
 * TradeClassification) cascade-delete and are recreated by enrichment.
 */
export async function rebuildLedgerTradesForAccount(
  tx: LedgerDb,
  accountId: string,
  options: { impactFor?: string } = {},
): Promise<LedgerRebuildResult> {
  const { statements, legacyExecutionIds, formatById } = await loadLedgerInputs(tx, accountId)
  const selection = selectAccountLedgerRows(statements)
  const ledger = buildBrokerPositionLedger(selection.rows)

  // Every existing trade: annotation matching judges uniqueness against all.
  const previous = await tx.roundTripTrade.findMany({
    where: { accountId },
    select: {
      sourceKey: true,
      symbol: true,
      direction: true,
      entryTime: true,
      tags: true,
      notes: true,
      notesUpdatedAt: true,
      journalId: true,
      brokerStatementImportId: true,
    },
  })

  const originOf = (position: BrokerLedgerResult['positions'][number]) =>
    selection.rowOrigins[position.openRows[0] ?? position.closeRows[0]]
  // Stable identity of the input row that opened each rebuilt trade.
  const sourceKeyOf = (position: BrokerLedgerResult['positions'][number]): string => {
    const origin = originOf(position)
    if (!origin) return `unknown:${position.instrumentKey}:${position.entryTime.toISOString()}`
    return origin.statementId === LEGACY_EXECUTIONS_STATEMENT_ID
      ? `exec:${legacyExecutionIds[origin.rowIndex]}`
      : `${origin.statementId}:${origin.rowIndex}`
  }

  const annotations = matchAnnotations(
    previous.map((trade) => ({
      sourceKey: trade.sourceKey,
      symbol: trade.symbol,
      direction: trade.direction,
      entryTime: trade.entryTime,
      // Trades with no statement came from legacy executions: date-only.
      sourceFormat:
        formatById.get(trade.brokerStatementImportId ?? '') ?? 'SCHWAB_TRANSACTION_HISTORY',
      tags: trade.tags,
      notes: trade.notes,
      notesUpdatedAt: trade.notesUpdatedAt,
      journalId: trade.journalId,
    })),
    ledger.positions.map((position) => ({
      sourceKey: sourceKeyOf(position),
      symbol: position.symbol,
      direction: position.side,
      entryTime: position.entryTime,
      sourceFormat:
        formatById.get(originOf(position)?.statementId ?? '') ?? 'SCHWAB_TRANSACTION_HISTORY',
    })),
  )

  // The ledger owns every trade in the account; unlink executions first.
  await tx.execution.updateMany({ where: { accountId }, data: { tradeId: null } })
  await tx.roundTripTrade.deleteMany({ where: { accountId } })

  // Ids are assigned here so trades, their fills and legacy execution links
  // can each be written in bulk.
  const trades: Prisma.RoundTripTradeCreateManyInput[] = []
  const fills: Prisma.TradeFillCreateManyInput[] = []
  const executionLinks: Array<{ tradeId: string; executionIds: string[] }> = []
  ledger.positions.forEach((position, index) => {
    const tradeId = randomUUID()
    const statementId = originOf(position)?.statementId ?? null
    const input = mapBrokerPositionToTradeCreateInput(
      accountId,
      statementId === LEGACY_EXECUTIONS_STATEMENT_ID ? null : statementId,
      null,
      position,
    )
    const annotation = annotations.get(index)
    trades.push({
      ...input,
      id: tradeId,
      sourceKey: sourceKeyOf(position),
      ...(annotation
        ? { tags: annotation.tags, notes: annotation.notes, notesUpdatedAt: annotation.notesUpdatedAt, journalId: annotation.journalId }
        : {}),
    })
    position.fills.forEach((fill, seq) => {
      fills.push({
        tradeId,
        seq,
        time: fill.time,
        kind: fill.kind,
        posEffect: fill.posEffect,
        side: fill.side,
        qty: new Prisma.Decimal(fill.qty),
        price: fill.price == null ? null : new Prisma.Decimal(fill.price),
        fees: new Prisma.Decimal(fill.fees),
      })
    })
    const executionIds = [...position.openRows, ...position.closeRows]
      .map((row) => selection.rowOrigins[row])
      .filter((rowOrigin) => rowOrigin?.statementId === LEGACY_EXECUTIONS_STATEMENT_ID)
      .map((rowOrigin) => legacyExecutionIds[rowOrigin.rowIndex])
      .filter((id): id is string => id != null)
    if (executionIds.length > 0) executionLinks.push({ tradeId, executionIds })
  })

  if (trades.length > 0) await tx.roundTripTrade.createMany({ data: trades })
  if (fills.length > 0) await tx.tradeFill.createMany({ data: fills })
  for (const { tradeId, executionIds } of executionLinks) {
    await tx.execution.updateMany({ where: { id: { in: executionIds } }, data: { tradeId } })
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
    annotationsPreserved: annotations.size,
    warnings: ledger.warnings.map((warning) => warning.message),
    earliestEntry,
    impact: options.impactFor
      ? summarizeStatementImpact(selection, ledger, options.impactFor)
      : null,
  }
}
