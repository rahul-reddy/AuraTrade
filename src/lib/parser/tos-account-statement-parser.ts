import Papa from 'papaparse'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import {
  buildStatementDryRun,
  type AnalyzedStatementRow,
  type OptionContractDetails,
  type StatementDryRun,
} from '@/lib/parser/schwab-statement-analyzer'

/**
 * Parser for the thinkorswim desktop "Account Statement" export
 * (Monitor → Account Statement → ☰ → Export to File).
 *
 * Unlike Schwab's Transaction History export, this file carries a per-fill
 * Exec Time (to the second) and an explicit Pos Effect (TO OPEN / TO CLOSE).
 *
 * TOS CSV FORMAT ASSUMPTIONS (verified against a real 2026 export):
 * - The file is a stack of sections. Each section is a title line, a header
 *   line, data rows, then a blank line. We read only "Account Trade History"
 *   (fills) and "Cash Balance" (fees + cash amounts).
 * - Account Trade History columns:
 *   ,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type
 *   Rows are newest-first. Exec Time is "M/d/yy HH:mm:ss".
 * - Exec Time is wall-clock time in the TOS desktop's configured time zone.
 *   The export does not state it (the "CST" on Cash Balance BAL rows is Schwab
 *   boilerplate, not the fill time zone). Default is America/New_York — on the
 *   reference file the fill burst sits at 09:30, i.e. the NYSE open in ET.
 * - Trade History has no fee column. Fees live on the matching Cash Balance
 *   TRD row ("BOT +5 NBIS @116.21" / "SOLD -2 ORCL 100 17 JUL 26 175 CALL @30.00").
 *   Fills and TRD rows are 1:1 (multi-fill orders get one TRD row per fill,
 *   sharing a REF #). Fee = |Misc Fees| + |Commissions & Fees|. Buys can carry
 *   fees here (e.g. option commissions), so fees are read on both sides.
 * - Spread FUND / Type FUND rows are money-market sweep moves (e.g. SNSXX) and
 *   are treated as cash, not trades.
 */

export const TOS_ACCOUNT_STATEMENT_DEFAULT_TIME_ZONE = 'America/New_York'

const TRADE_HISTORY_TITLE = 'Account Trade History'
const CASH_BALANCE_TITLE = 'Cash Balance'

const CASH_TRD_DESCRIPTION_RE =
  /^(BOT|SOLD) ([+-]?[\d,]+(?:\.\d+)?) (\S+)(?: (\d+) (\d{1,2} [A-Z]{3} \d{2}) ([\d.]+) (CALL|PUT))?.*?@([\d,]+(?:\.\d+)?)/

/**
 * Account Trade History `Type` values imported as equities (Spread must be
 * STOCK). Observed on real exports: STOCK, ETF. Anything else (futures, bonds,
 * forex, unknown types) is blocked rather than guessed into an equity trade.
 */
const SUPPORTED_EQUITY_TYPES = new Set(['STOCK', 'ETF'])

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

interface Section {
  header: string[]
  rows: string[][]
}

interface CashTradeRow {
  fees: number
  amount: number | null
  multiplier: number | null
  refNumber: string
}

export interface TosAccountStatementOptions {
  timeZone?: string
}

/** Calendar trading date (yyyy-MM-dd) of a fill instant in the statement's time zone. */
export function tosTradingDate(
  instant: Date,
  timeZone: string = TOS_ACCOUNT_STATEMENT_DEFAULT_TIME_ZONE,
): string {
  return formatInTimeZone(instant, timeZone, 'yyyy-MM-dd')
}

/**
 * Strict calendar check: Date.UTC silently rolls invalid dates over (2/30 →
 * 3/2), which would let a malformed fill match a real day's cash row.
 */
function isRealDateTime(
  year: number, month: number, day: number,
  hour = 0, minute = 0, second = 0,
): boolean {
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function parseShortDate(raw: string): Date | null {
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (!match) return null
  const [, month, day, year] = match.map(Number)
  if (!isRealDateTime(2000 + year, month, day)) return null
  return new Date(Date.UTC(2000 + year, month - 1, day))
}

/** Header "Account Statement for … since 3/13/26 through 10/16/26" → UTC-midnight dates. */
function parseCoverage(firstLine: string): { from: Date; to: Date } | null {
  const match = firstLine.match(/since (\d{1,2}\/\d{1,2}\/\d{2}) through (\d{1,2}\/\d{1,2}\/\d{2})/)
  if (!match) return null
  const from = parseShortDate(match[1])
  const to = parseShortDate(match[2])
  return from && to ? { from, to } : null
}

/**
 * Coverage from the first/last fill's TRADING date (exchange time zone), as
 * UTC-midnight dates. The shared fallback would use the raw fill instants,
 * whose UTC date can be a day later than the trading day (a 19:30 EST fill is
 * 00:30Z the next day), putting a statement's own first fill outside it.
 */
function fillTradingDayCoverage(
  rows: AnalyzedStatementRow[],
  timeZone: string,
): { from: Date; to: Date } | null {
  const days = rows
    .map((row) => (row.date ? tosTradingDate(row.date, timeZone) : null))
    .filter((day): day is string => day != null)
    .sort()
  if (days.length === 0) return null
  return {
    from: new Date(`${days[0]}T00:00:00.000Z`),
    to: new Date(`${days[days.length - 1]}T00:00:00.000Z`),
  }
}

export function isTosAccountStatement(rawContent: string): boolean {
  const firstLine = rawContent.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  return firstLine.trim().startsWith('Account Statement for')
}

function extractSection(lines: string[], title: string): Section | null {
  const titleIndex = lines.findIndex((line) => line.trim() === title)
  if (titleIndex === -1 || titleIndex + 1 >= lines.length) return null

  const blockLines: string[] = []
  for (let i = titleIndex + 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) break
    blockLines.push(lines[i])
  }
  if (blockLines.length === 0) return null

  const { data } = Papa.parse<string[]>(blockLines.join('\n'), {
    header: false,
    skipEmptyLines: true,
  })
  const [header, ...rows] = data
  return { header: header.map((cell) => cell.trim()), rows }
}

function column(section: Section, row: string[], name: string): string {
  return presentCell(section, row, name) ?? ''
}

/**
 * The trimmed cell, or null when the column is missing from the header or the
 * row ends before it (a truncated row). Unlike column(), callers can tell an
 * absent cell apart from one that is present but blank.
 */
function presentCell(section: Section, row: string[], name: string): string | null {
  const index = section.header.indexOf(name)
  if (index === -1 || index >= row.length) return null
  return (row[index] ?? '').trim()
}

function parseNumber(raw: string): number | null {
  if (!raw) return null
  // Cash Balance REF # values are wrapped as ="123"; amounts may be "1,234.56"
  const cleaned = raw.replace(/[=",$\s]/g, '')
  if (!cleaned || cleaned === '--' || cleaned === '~') return null
  const parsed = Number(cleaned)
  return Number.isNaN(parsed) ? null : parsed
}

function normalizePrice(value: number): string {
  return String(Number(value.toFixed(6)))
}

/**
 * "M/d/yy HH:mm:ss" → seconds on a naive wall clock. Only used to line up fills
 * with cash rows from the same file, so no time-zone conversion is needed.
 */
function wallClockSeconds(execTime: string): number | null {
  const match = execTime.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, month, day, year, hour, minute, second] = match.map(Number)
  if (!isRealDateTime(2000 + year, month, day, hour, minute, second)) return null
  return Date.UTC(2000 + year, month - 1, day, hour, minute, second) / 1000
}

// Schwab sometimes books the Cash Balance TRD row a second after the fill's
// Exec Time (e.g. fill 09:30:00 → cash 09:30:01). Exact second is tried first.
const CASH_MATCH_OFFSETS_SECONDS = [0, 1, -1, 2, -2]

/**
 * Instrument identity used to join a fill to its cash row. Options include the
 * whole contract, so two contracts on one underlying that trade in the same
 * second at the same price can never swap fees or multipliers.
 */
function instrumentId(args: {
  symbol: string
  expiration?: string
  strike?: string
  optionType?: string
}): string {
  if (!args.expiration || !args.strike || !args.optionType) return args.symbol
  const strike = Number(args.strike)
  return [args.symbol, args.expiration.trim(), String(strike), args.optionType].join(' ')
}

function fillKey(args: {
  wallSeconds: number
  side: 'BUY' | 'SELL'
  qty: number
  instrument: string
  price: number
}): string {
  return [
    String(args.wallSeconds),
    args.side,
    String(Math.abs(args.qty)),
    args.instrument,
    normalizePrice(args.price),
  ].join('|')
}

/** Index Cash Balance TRD rows by fill key; duplicates (identical fills) queue FIFO. */
const FEE_COLUMNS = ['Misc Fees', 'Commissions & Fees'] as const

/**
 * Reads one fee cell. A present-but-blank cell is a genuine $0 fee; anything
 * else must parse as a number. Returns null when the value is not usable
 * evidence, including a cell the row never reached.
 */
function parseFeeCell(raw: string | null): number | null {
  // An absent cell (truncated row) is not evidence of a $0 fee.
  if (raw == null) return null
  if (raw === '') return 0
  const value = parseNumber(raw)
  return value == null ? null : Math.abs(value)
}

function indexCashTrades(section: Section | null): Map<string, CashTradeRow[]> {
  const index = new Map<string, CashTradeRow[]>()
  if (!section) return index
  // Without both fee columns there is no fee evidence for any fill: index
  // nothing, so every fill blocks rather than importing with a $0 fee.
  if (!FEE_COLUMNS.every((name) => section.header.includes(name))) return index

  for (const row of section.rows) {
    if (column(section, row, 'TYPE') !== 'TRD') continue
    const description = column(section, row, 'DESCRIPTION')
    const match = description.match(CASH_TRD_DESCRIPTION_RE)
    if (!match) continue

    const [, verb, qtyRaw, symbol, multiplierRaw, expRaw, strikeRaw, typeRaw, priceRaw] = match
    const qty = parseNumber(qtyRaw)
    const price = parseNumber(priceRaw)
    const wallSeconds = wallClockSeconds(
      `${column(section, row, 'DATE')} ${column(section, row, 'TIME')}`,
    )
    if (qty == null || price == null || wallSeconds == null) continue

    const key = fillKey({
      wallSeconds,
      side: verb === 'BOT' ? 'BUY' : 'SELL',
      qty,
      instrument: instrumentId({
        symbol,
        expiration: expRaw,
        strike: strikeRaw,
        optionType: typeRaw,
      }),
      price,
    })
    const misc = parseFeeCell(presentCell(section, row, 'Misc Fees'))
    const commission = parseFeeCell(presentCell(section, row, 'Commissions & Fees'))
    // A malformed fee cell leaves this fill without a usable cash match, so it
    // blocks import instead of understating fees.
    if (misc == null || commission == null) continue
    const entry: CashTradeRow = {
      fees: misc + commission,
      amount: parseNumber(column(section, row, 'AMOUNT')),
      multiplier: multiplierRaw ? Number(multiplierRaw) : null,
      refNumber: parseNumber(column(section, row, 'REF #'))?.toString() ?? '',
    }
    const queue = index.get(key)
    if (queue) queue.push(entry)
    else index.set(key, [entry])
  }

  return index
}

function takeCashMatch(
  cashTrades: Map<string, CashTradeRow[]>,
  fill: { execTime: string; side: string; qty: number | null; instrument: string; price: number | null },
): CashTradeRow | null {
  const { side, qty, instrument, price } = fill
  const wallSeconds = wallClockSeconds(fill.execTime)
  if (qty == null || price == null || wallSeconds == null) return null
  if (side !== 'BUY' && side !== 'SELL') return null

  for (const offset of CASH_MATCH_OFFSETS_SECONDS) {
    const queue = cashTrades.get(
      fillKey({ wallSeconds: wallSeconds + offset, side, qty, instrument, price }),
    )
    const match = queue?.shift()
    if (match) return match
  }
  return null
}

/** "15 OCT 27" → "10/15/2027" (matches the Schwab option-symbol convention). */
function parseTosExpiration(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2}) ([A-Z]{3}) (\d{2})$/)
  if (!match) return null
  const month = MONTHS[match[2]]
  if (!month) return null
  return `${month}/${match[1].padStart(2, '0')}/20${match[3]}`
}

function parseExecTime(raw: string, timeZone: string): Date | null {
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, month, day, year, hour, minute, second] = match
  if (!isRealDateTime(2000 + Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second))) {
    return null
  }
  const local = `20${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour}:${minute}:${second}`
  const parsed = fromZonedTime(local, timeZone)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function mapAction(args: {
  isOption: boolean
  side: string
  posEffect: string
}): string | null {
  const { isOption, side, posEffect } = args
  if (isOption) {
    if (side === 'BUY' && posEffect === 'TO OPEN') return 'Buy to Open'
    if (side === 'SELL' && posEffect === 'TO CLOSE') return 'Sell to Close'
    if (side === 'SELL' && posEffect === 'TO OPEN') return 'Sell to Open'
    if (side === 'BUY' && posEffect === 'TO CLOSE') return 'Buy to Close'
    return null
  }
  if (side === 'BUY' && posEffect === 'TO OPEN') return 'Buy'
  if (side === 'SELL' && posEffect === 'TO CLOSE') return 'Sell'
  if (side === 'SELL' && posEffect === 'TO OPEN') return 'Sell Short'
  if (side === 'BUY' && posEffect === 'TO CLOSE') return 'Buy to Cover'
  return null
}

export function analyzeTosAccountStatement(
  rawContent: string,
  options: TosAccountStatementOptions = {},
): StatementDryRun {
  const timeZone = options.timeZone ?? TOS_ACCOUNT_STATEMENT_DEFAULT_TIME_ZONE
  const assumptions: string[] = [
    'thinkorswim Account Statement: fills read from "Account Trade History" with per-second Exec Time.',
    `Exec Time interpreted as ${timeZone} wall-clock time.`,
    'Fees read from the matching Cash Balance TRD row (Misc Fees + Commissions & Fees).',
    'Option rows are interpreted in contracts, not underlying shares.',
  ]

  const lines = rawContent.replace(/^﻿/, '').split(/\r?\n/)
  const coverage = parseCoverage(lines[0] ?? '')
  const tradeHistory = extractSection(lines, TRADE_HISTORY_TITLE)
  const cashTrades = indexCashTrades(extractSection(lines, CASH_BALANCE_TITLE))

  if (!tradeHistory) {
    return buildStatementDryRun([], assumptions, {
      sourceFormat: 'TOS_ACCOUNT_STATEMENT',
      coverage,
    })
  }

  // Statement is newest-first; reverse to chronological so rowIndex is a valid
  // same-second tie-breaker for the ledger.
  const chronological = [...tradeHistory.rows].reverse()
  const rows: AnalyzedStatementRow[] = []
  let unmatchedFeeRows = 0
  let defaultedMultiplier = false

  for (const cells of chronological) {
    const raw: Record<string, string> = {}
    tradeHistory.header.forEach((name, index) => {
      if (name) raw[name] = (cells[index] ?? '').trim()
    })

    const execTimeRaw = column(tradeHistory, cells, 'Exec Time')
    const spread = column(tradeHistory, cells, 'Spread')
    const side = column(tradeHistory, cells, 'Side')
    const posEffect = column(tradeHistory, cells, 'Pos Effect')
    const baseSymbol = column(tradeHistory, cells, 'Symbol').toUpperCase()
    const type = column(tradeHistory, cells, 'Type')
    const quantity = parseNumber(column(tradeHistory, cells, 'Qty'))
    const price = parseNumber(column(tradeHistory, cells, 'Price'))
    const isOption = type === 'CALL' || type === 'PUT'
    const notes: string[] = []

    const cashMatch = takeCashMatch(cashTrades, {
      execTime: execTimeRaw,
      side,
      qty: quantity,
      instrument: isOption
        ? instrumentId({
            symbol: baseSymbol,
            expiration: column(tradeHistory, cells, 'Exp'),
            strike: column(tradeHistory, cells, 'Strike'),
            optionType: type,
          })
        : baseSymbol,
      price,
    })

    let symbol = baseSymbol
    let optionContract: OptionContractDetails | null = null
    if (isOption) {
      const expiration = parseTosExpiration(column(tradeHistory, cells, 'Exp'))
      const strike = parseNumber(column(tradeHistory, cells, 'Strike'))
      if (expiration && strike != null) {
        const multiplier = cashMatch?.multiplier ?? 100
        if (cashMatch?.multiplier == null) defaultedMultiplier = true
        const quantityContracts = quantity == null ? null : Math.abs(quantity)
        symbol = `${baseSymbol} ${expiration} ${strike.toFixed(2)} ${type === 'CALL' ? 'C' : 'P'}`
        optionContract = {
          underlying: baseSymbol,
          expiration,
          strike,
          optionType: type === 'CALL' ? 'CALL' : 'PUT',
          quantityContracts,
          multiplier,
          underlyingEquivalentQty:
            quantityContracts == null ? null : quantityContracts * multiplier,
        }
        notes.push('Option contract row detected. Quantity is contracts, not shares.')
      }
    }

    // Audit trail for values joined in from the matching Cash Balance TRD row.
    if (cashMatch) {
      raw['Ref #'] = cashMatch.refNumber
      raw['Cash Fees'] = cashMatch.fees.toFixed(2)
      if (cashMatch.amount != null) raw['Cash Amount'] = cashMatch.amount.toFixed(2)
    }

    const base = {
      rowIndex: rows.length,
      raw,
      date: parseExecTime(execTimeRaw, timeZone),
      symbol,
      description: `${side} ${quantity ?? ''} ${posEffect} ${baseSymbol} @${price ?? ''}`.trim(),
      quantity,
      price,
      amount: cashMatch?.amount ?? null,
      optionContract,
    }

    if (spread === 'FUND' || type === 'FUND') {
      rows.push({
        ...base,
        action: 'Money Market Sweep',
        fees: 0,
        instrumentType: 'CASH',
        actionCategory: 'CASH_TRANSFER',
        isImportTradeRow: false,
        blocksCanonicalImport: false,
        notes: ['Money-market fund sweep treated as cash, not a trade.'],
      })
      continue
    }

    const action = mapAction({ isOption, side, posEffect })
    const supportedInstrument = isOption
      ? optionContract != null
      : SUPPORTED_EQUITY_TYPES.has(type) && spread === 'STOCK'
    if (!action || !supportedInstrument) {
      rows.push({
        ...base,
        action: action ?? `${side} ${posEffect}`.trim(),
        fees: cashMatch?.fees ?? 0,
        instrumentType: isOption ? 'OPTION' : 'UNKNOWN',
        actionCategory: 'UNKNOWN',
        isImportTradeRow: false,
        blocksCanonicalImport: true,
        notes: [`Unrecognized TOS fill: Spread=${spread} Side=${side} Pos Effect=${posEffect} Type=${type}.`],
      })
      continue
    }

    // A fill the ledger cannot place in time must block, never be dropped.
    if (base.date == null) {
      rows.push({
        ...base,
        action,
        fees: 0,
        instrumentType: isOption ? 'OPTION' : 'EQUITY',
        actionCategory: 'UNKNOWN',
        isImportTradeRow: false,
        blocksCanonicalImport: true,
        notes: [...notes, `Exec Time "${execTimeRaw}" is not a valid date.`],
      })
      continue
    }

    // Fees must come from the broker. Without the matching cash row there is
    // no fee evidence, so the fill blocks import instead of assuming $0.
    if (!cashMatch) {
      unmatchedFeeRows += 1
      rows.push({
        ...base,
        action,
        fees: 0,
        instrumentType: isOption ? 'OPTION' : 'EQUITY',
        actionCategory: 'UNKNOWN',
        isImportTradeRow: false,
        blocksCanonicalImport: true,
        notes: [
          ...notes,
          'No matching Cash Balance TRD row, so the broker fee is unknown. Export the full Account Statement (including Cash Balance) to import this fill.',
        ],
      })
      continue
    }

    rows.push({
      ...base,
      action,
      fees: cashMatch.fees,
      instrumentType: isOption ? 'OPTION' : 'EQUITY',
      actionCategory: isOption ? 'OPTION_TRADE' : 'EQUITY_TRADE',
      isImportTradeRow: true,
      blocksCanonicalImport: false,
      notes,
    })
  }

  if (unmatchedFeeRows > 0) {
    assumptions.push(
      `${unmatchedFeeRows} fill(s) had no matching Cash Balance TRD row; import is blocked until their broker fees are available.`,
    )
  }
  if (defaultedMultiplier) {
    assumptions.push('Option multiplier defaulted to 100 where the cash row did not state it.')
  }

  if (!coverage) {
    assumptions.push('Statement header had no "since … through …" period; coverage falls back to first/last fill trading date.')
  }

  const dryRun = buildStatementDryRun(rows, assumptions, {
    sourceFormat: 'TOS_ACCOUNT_STATEMENT',
    coverage: coverage ?? fillTradingDayCoverage(rows, timeZone),
  })
  // The shared builder emits Transaction-History-era blockers for option rows.
  // Here options are explicit TO OPEN / TO CLOSE fills the ledger models
  // directly, so only genuinely unrecognized rows should block.
  return {
    ...dryRun,
    blockers: rows.some((row) => row.actionCategory === 'UNKNOWN')
      ? ['This statement contains unrecognized fills that must be classified before import.']
      : [],
  }
}
