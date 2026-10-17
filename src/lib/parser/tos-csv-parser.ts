import Papa from 'papaparse'
import { parse as parseDate } from 'date-fns'

// =====================================================================
// SCHWAB / TDA TRANSACTION HISTORY PARSER
//
// Two format variants supported (auto-detected):
//   2022 TDA:    quoted headers, Amount as "-$12050.00", Date as "MM/DD/YYYY"
//   2026 Schwab: unquoted headers, Amount as "($1,234.56)", Date as "M/D/YYYY"
//
// CONFIRMED ASSUMPTIONS (verified against real CSV samples):
//   A1. Date only — no time. Row order in file = intra-day execution sequence.
//   A2. "Fees & Comm" is the authoritative commission. Buys are $0 (empty field).
//       Commission formula (Price - NetPrice) × Qty does NOT apply here.
//   A3. "Buy" + description contains "to cover" (case-insensitive) → SHORT_CLOSE.
//       Plain "Buy" → LONG_OPEN.
//   A4. "Sell Short" action → SHORT_OPEN. Plain "Sell" → LONG_CLOSE.
//   A5. "Journaled Shares" and rows with empty Symbol → skipped (non-trade rows).
//   A6. Price column may be rounded; Amount = precise cash flow. We use Price for
//       VWAP calculations (inherent Schwab export limitation).
// =====================================================================

export type ExecutionSide = 'BUY' | 'SELL'
export type PosEffect = 'OPEN' | 'CLOSE'
export type Direction = 'LONG' | 'SHORT'

export interface ParsedExecution {
  /** 0-based row index preserving intra-day file order — used as FIFO tie-breaker */
  rowIndex: number
  date: Date
  symbol: string
  /** Raw action value from CSV — kept for audit */
  action: string
  side: ExecutionSide
  posEffect: PosEffect
  direction: Direction
  /** Always positive */
  qty: number
  /** Fill price from Price column */
  price: number
  /** From "Fees & Comm" column. 0 for buys. */
  commission: number
  /** Signed cash flow: negative = buy, positive = sell */
  amount: number
  /** Raw description — kept for audit */
  description: string
}

export interface ParseResult {
  executions: ParsedExecution[]
  skippedRows: Array<{ rowIndex: number; reason: string; raw: Record<string, string> }>
  dateRange: { from: Date; to: Date } | null
  symbols: string[]
  /** Human-readable list of parser assumptions applied */
  assumptions: string[]
}

/** Result for statement formats that never use the legacy Execution path. */
export function emptyParseResult(): ParseResult {
  return { executions: [], skippedRows: [], dateRange: null, symbols: [], assumptions: [] }
}

// ─── helpers ─────────────────────────────────────────────────────────

/**
 * Parse a money string in either format:
 *   "-$12,050.00" → -12050
 *   "($1,234.56)"  → -1234.56   (Schwab parentheses = negative)
 *   "$0.08 "       → 0.08
 *   ""             → 0
 */
function parseMoney(raw: string): number {
  if (!raw || !raw.trim()) return 0
  const s = raw.trim()
  const isParenNegative = s.startsWith('(') && s.endsWith(')')
  const cleaned = s.replace(/[()$,\s]/g, '')
  const n = parseFloat(cleaned)
  if (isNaN(n)) return 0
  // Either explicit minus sign already in cleaned, or parens notation
  if (isParenNegative) return -Math.abs(n)
  return n
}

function parseQty(raw: string): number {
  const n = parseFloat(raw.replace(/[,\s]/g, '').trim())
  return isNaN(n) ? 0 : Math.abs(n)
}

type ClassifyResult =
  | { skip: true }
  | { skip: false; side: ExecutionSide; posEffect: PosEffect; direction: Direction }

function classifyAction(action: string, description: string): ClassifyResult {
  const a = action.trim()
  const d = description.toLowerCase()

  if (!a || a === 'Journaled Shares') return { skip: true }

  if (a === 'Buy') {
    if (d.includes('to cover')) {
      // e.g. "TDA TRAN - Bought to Cover 50 (SPY) @446.8085"
      return { skip: false, side: 'BUY', posEffect: 'CLOSE', direction: 'SHORT' }
    }
    return { skip: false, side: 'BUY', posEffect: 'OPEN', direction: 'LONG' }
  }

  if (a === 'Sell') {
    return { skip: false, side: 'SELL', posEffect: 'CLOSE', direction: 'LONG' }
  }

  if (a === 'Sell Short') {
    return { skip: false, side: 'SELL', posEffect: 'OPEN', direction: 'SHORT' }
  }

  // Unknown action (e.g. dividends, transfers) — skip and log
  return { skip: true }
}

// ─── main export ─────────────────────────────────────────────────────

export function parseSchwabCSV(rawContent: string): ParseResult {
  const assumptions: string[] = [
    'A1: Date only (no time) — row order used as intra-day execution sequence',
    'A2: Commission from "Fees & Comm" column directly; buys are $0',
    'A3: "Buy" + "to cover" in description → SHORT_CLOSE; plain "Buy" → LONG_OPEN',
    'A4: "Sell Short" action → SHORT_OPEN; plain "Sell" → LONG_CLOSE',
    'A5: "Journaled Shares" and empty-Symbol rows skipped',
    'A6: Price column used for VWAP (may be rounded vs Amount — Schwab limitation)',
  ]

  // Strip BOM (UTF-8 with BOM: \uFEFF)
  const content = rawContent.replace(/^\uFEFF/, '')

  const { data } = Papa.parse<Record<string, string>>(content, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  })

  const executions: ParsedExecution[] = []
  const skippedRows: ParseResult['skippedRows'] = []

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex]
    const symbol = (row['Symbol'] ?? '').trim().toUpperCase()
    const action = (row['Action'] ?? '').trim()

    if (!symbol) {
      skippedRows.push({ rowIndex, reason: 'empty symbol', raw: row })
      continue
    }

    const classified = classifyAction(action, row['Description'] ?? '')
    if (classified.skip) {
      skippedRows.push({ rowIndex, reason: `skipped action: "${action}"`, raw: row })
      continue
    }

    const dateRaw = (row['Date'] ?? '').trim()
    let date: Date
    try {
      // date-fns 'M/d/yyyy' handles both "2/7/2022" and "02/07/2022"
      date = parseDate(dateRaw, 'M/d/yyyy', new Date())
      if (isNaN(date.getTime())) throw new Error('invalid')
    } catch {
      skippedRows.push({ rowIndex, reason: `unparseable date: "${dateRaw}"`, raw: row })
      continue
    }

    const qty = parseQty(row['Quantity'] ?? '')
    if (qty <= 0) {
      skippedRows.push({ rowIndex, reason: 'zero or invalid qty', raw: row })
      continue
    }

    const price = parseMoney(row['Price'] ?? '')
    const commission = parseMoney(row['Fees & Comm'] ?? '')
    const amount = parseMoney(row['Amount'] ?? '')

    executions.push({
      rowIndex,
      date,
      symbol,
      action,
      ...classified,
      qty,
      price,
      commission,
      amount,
      description: (row['Description'] ?? '').trim(),
    })
  }

  // ── Detect reverse-chronological ordering (Schwab 2026 format) ────────
  // The Schwab export lists transactions newest-to-oldest. Within the same
  // date this means exits appear before entries, which breaks FIFO grouping.
  // Detect by comparing the date of the first vs last parsed execution.
  // If newer rows appear first, reverse the array and reassign rowIndex so
  // that chronologically earlier fills always have a lower sort key.
  if (executions.length > 1) {
    const firstDate = executions[0].date.getTime()
    const lastDate = executions[executions.length - 1].date.getTime()
    if (firstDate > lastDate) {
      // Reverse-chronological → flip and renumber
      executions.reverse()
      executions.forEach((ex, i) => { ex.rowIndex = i })
      assumptions.push('A7: File is newest-to-oldest (Schwab format) — reversed for correct FIFO ordering')
    }
  }

  const timestamps = executions.map((e) => e.date.getTime())
  const dateRange =
    timestamps.length > 0
      ? { from: new Date(Math.min(...timestamps)), to: new Date(Math.max(...timestamps)) }
      : null

  const symbols = [...new Set(executions.map((e) => e.symbol))].sort()

  return { executions, skippedRows, dateRange, symbols, assumptions }
}
