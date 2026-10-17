import { Prisma } from '@/generated/prisma'
import type { BrokerLedgerPosition } from '@/lib/engine/broker-position-ledger'
import type { StatementDryRun } from '@/lib/parser/schwab-statement-analyzer'

interface ParsedOptionSymbol {
  underlyingSymbol: string
  optionExpiration: Date
  optionStrike: Prisma.Decimal
  optionType: 'CALL' | 'PUT'
}

const OPTION_SYMBOL_RE =
  /^(.+?) (\d{2}\/\d{2}\/\d{4}) (\d+(?:\.\d+)?) ([CP])$/

function parseOptionSymbol(symbol: string): ParsedOptionSymbol | null {
  const match = symbol.match(OPTION_SYMBOL_RE)
  if (!match) return null

  const [, underlying, expiration, strike, type] = match
  const [month, day, year] = expiration.split('/').map(Number)
  return {
    underlyingSymbol: underlying.trim(),
    optionExpiration: new Date(Date.UTC(year, month - 1, day)),
    optionStrike: new Prisma.Decimal(strike),
    optionType: type === 'C' ? 'CALL' : 'PUT',
  }
}

/** "2026-03-20" → 2026-03-20T00:00:00Z, for @db.Date columns. */
function toUtcDate(day: string | null): Date | null {
  return day ? new Date(`${day}T00:00:00.000Z`) : null
}

function toDecimal(value: number | null): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal(value)
}

function durationSeconds(
  entryTime: Date,
  exitTime: Date | null,
): number | null {
  if (!exitTime) return null
  return Math.max(0, Math.round((exitTime.getTime() - entryTime.getTime()) / 1000))
}

export function shouldEnrichTrade(position: BrokerLedgerPosition): boolean {
  return position.instrumentType === 'EQUITY' && position.closeKind !== 'TRANSFER'
}

export function shouldLinkTradeToChart(position: BrokerLedgerPosition): boolean {
  return position.instrumentType === 'EQUITY' && position.closeKind !== 'TRANSFER'
}

/** Row categories that change positions in the account ledger. */
const LEDGER_CATEGORIES = new Set<StatementDryRun['rows'][number]['actionCategory']>([
  'EQUITY_TRADE',
  'OPTION_TRADE',
  'OPTION_LIFECYCLE',
  'POSITION_TRANSFER',
  'CORPORATE_ACTION',
])

export function evaluateStatementImportSupport(
  dryRun: StatementDryRun,
): { supported: boolean; reasons: string[] } {
  const reasons = new Set<string>()

  for (const row of dryRun.rows) {
    if (row.actionCategory === 'UNKNOWN') {
      reasons.add('Unsupported broker action category: UNKNOWN')
    }
    // A position-affecting row the ledger cannot place in time would be
    // dropped silently (e.g. a close lost, leaving its position open).
    if (row.date == null && LEDGER_CATEGORIES.has(row.actionCategory)) {
      reasons.add('A trade or position event has an unreadable date; fix or re-export the statement before importing.')
    }
  }

  return {
    supported: reasons.size === 0 && dryRun.rows.length > 0,
    reasons: [...reasons],
  }
}

export function mapBrokerPositionToTradeCreateInput(
  accountId: string,
  brokerStatementImportId: string | null,
  brokerStatementPositionId: string | null,
  position: BrokerLedgerPosition,
): Prisma.RoundTripTradeUncheckedCreateInput {
  const optionSymbol = position.instrumentType === 'OPTION'
    ? parseOptionSymbol(position.symbol)
    : null

  return {
    accountId,
    symbol: position.symbol,
    instrumentType: position.instrumentType,
    underlyingSymbol: optionSymbol?.underlyingSymbol ?? null,
    optionExpiration: optionSymbol?.optionExpiration ?? null,
    optionStrike: optionSymbol?.optionStrike ?? null,
    optionType: optionSymbol?.optionType ?? null,
    contractMultiplier: position.multiplier,
    underlyingEquivalentQty: new Prisma.Decimal(position.underlyingEquivalentQty),
    direction: position.side === 'LONG' ? 'LONG' : 'SHORT',
    closeKind: position.closeKind,
    brokerStatementImportId,
    brokerStatementPositionId,
    entryPrice: new Prisma.Decimal(position.entryPrice),
    exitPrice: toDecimal(position.exitPrice),
    totalQty: new Prisma.Decimal(position.totalQty),
    closedQty: new Prisma.Decimal(position.closedQty),
    remainingQty: new Prisma.Decimal(position.remainingQty),
    grossPnl: toDecimal(position.grossPnl),
    totalFees: new Prisma.Decimal(position.totalFees),
    netPnl: toDecimal(position.netPnl),
    isOpen: position.isOpen,
    entryTime: position.entryTime,
    exitTime: position.exitTime,
    entryTradingDate: toUtcDate(position.entryTradingDate),
    exitTradingDate: toUtcDate(position.exitTradingDate),
    durationSeconds: durationSeconds(position.entryTime, position.exitTime),
  }
}
