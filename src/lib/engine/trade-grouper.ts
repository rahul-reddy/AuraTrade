import { type ParsedExecution } from '@/lib/parser/tos-csv-parser'

// =====================================================================
// FIFO TRADE GROUPING ENGINE
//
// Converts a flat list of ParsedExecutions into GroupedTrades (round trips).
//
// Algorithm:
//   1. Sort executions: date ASC, then rowIndex ASC (preserves intra-day order)
//   2. Maintain one ActivePosition per symbol
//   3. OPENING fill → push lot onto FIFO queue, extend position
//   4. CLOSING fill → consume FIFO lots; when netPosition hits 0 → finalize trade
//   5. Leftover active positions at end → isOpen = true
//
// VWAP formulas (verified):
//   entryVWAP = Σ(price × qty) / Σ(qty)  [over all opening fills]
//   exitVWAP  = Σ(price × qty) / Σ(qty)  [over all closing fills]
//   grossPnl  = (exitVWAP - entryVWAP) × closedQty  [LONG]
//   grossPnl  = (entryVWAP - exitVWAP) × closedQty  [SHORT]
//   netPnl    = grossPnl - totalFees
//   totalFees = Σ(commission) over ALL fills (opens + closes)
//   totalQty  = peak open position size reached
//
// Duration: (exitDate - entryDate) × 86400 seconds. Date-only data means
// same-day trades report 0 seconds — represents "intraday, exact unknown".
// =====================================================================

export interface GroupedTrade {
  symbol: string
  direction: 'LONG' | 'SHORT'
  /** VWAP of all opening fills */
  entryPrice: number
  /** VWAP of all closing fills; null if still open */
  exitPrice: number | null
  /** Peak open position size reached at any point during this trade */
  totalQty: number
  /** Total qty that has been closed/exited */
  closedQty: number
  /** Remaining open qty after any partial trims */
  remainingQty: number
  /** Gross PnL before fees; null if open */
  grossPnl: number | null
  /** Sum of all commissions on opening AND closing fills */
  totalFees: number
  /** netPnl = grossPnl - totalFees; null if open */
  netPnl: number | null
  isOpen: boolean
  /** Date of first opening fill */
  entryTime: Date
  /** Date of last closing fill; null if open */
  exitTime: Date | null
  /**
   * (exitDate - entryDate) in whole seconds (days × 86400).
   * Same-day trades = 0 (intraday, exact duration unknown from date-only data).
   * Null if open.
   */
  durationSeconds: number | null
  openingFills: ParsedExecution[]
  closingFills: ParsedExecution[]
}

export interface GroupWarning {
  message: string
  symbol: string
  rowIndex?: number
}

export interface GroupResult {
  trades: GroupedTrade[]
  warnings: GroupWarning[]
}

// ─── internal state ───────────────────────────────────────────────────

interface FifoLot {
  qty: number
  fill: ParsedExecution
}

interface ActivePosition {
  direction: 'LONG' | 'SHORT'
  openingFills: ParsedExecution[]
  closingFills: ParsedExecution[]
  fifoQueue: FifoLot[]
  netPosition: number
  peakPosition: number
  totalFees: number
}

// ─── helpers ─────────────────────────────────────────────────────────

function vwap(fills: ParsedExecution[]): number {
  const totalQty = fills.reduce((s, f) => s + f.qty, 0)
  if (totalQty === 0) return 0
  const dollarVolume = fills.reduce((s, f) => s + f.price * f.qty, 0)
  return dollarVolume / totalQty
}

function totalFilledQty(fills: ParsedExecution[]): number {
  return fills.reduce((s, f) => s + f.qty, 0)
}

function durationSec(entry: Date, exit: Date): number {
  const ms = exit.getTime() - entry.getTime()
  return Math.max(0, Math.round(ms / 1000))
}

function finalizePosition(
  pos: ActivePosition,
  isOpen: boolean,
): GroupedTrade {
  const entryVWAP = vwap(pos.openingFills)
  const closedQty = totalFilledQty(pos.closingFills)
  const remainingQty = pos.fifoQueue.reduce((s, lot) => s + lot.qty, 0)
  const symbol = pos.openingFills[0].symbol

  let exitPrice: number | null = null
  let grossPnl: number | null = null

  if (!isOpen && pos.closingFills.length > 0) {
    exitPrice = vwap(pos.closingFills)
    if (pos.direction === 'LONG') {
      grossPnl = (exitPrice - entryVWAP) * closedQty
    } else {
      grossPnl = (entryVWAP - exitPrice) * closedQty
    }
  }

  const netPnl = grossPnl !== null ? grossPnl - pos.totalFees : null
  const entryTime = pos.openingFills[0].date
  const lastClose = isOpen ? null : pos.closingFills[pos.closingFills.length - 1]
  const exitTime = lastClose ? lastClose.date : null

  return {
    symbol,
    direction: pos.direction,
    entryPrice: entryVWAP,
    exitPrice,
    totalQty: pos.peakPosition,
    closedQty,
    remainingQty,
    grossPnl,
    totalFees: pos.totalFees,
    netPnl,
    isOpen,
    entryTime,
    exitTime,
    durationSeconds: exitTime ? durationSec(entryTime, exitTime) : null,
    openingFills: pos.openingFills,
    closingFills: pos.closingFills,
  }
}

// ─── main export ─────────────────────────────────────────────────────

export function groupTrades(executions: ParsedExecution[]): GroupResult {
  const trades: GroupedTrade[] = []
  const warnings: GroupWarning[] = []

  // Sort: date ASC, then row position ASC (intra-day FIFO order)
  const sorted = [...executions].sort((a, b) => {
    const timeDiff = a.date.getTime() - b.date.getTime()
    return timeDiff !== 0 ? timeDiff : a.rowIndex - b.rowIndex
  })

  const active = new Map<string, ActivePosition>()

  for (const fill of sorted) {
    const { symbol, posEffect, direction, qty, commission } = fill

    // ── OPENING fill ──────────────────────────────────────────────
    if (posEffect === 'OPEN') {
      const existing = active.get(symbol)

      if (existing && existing.direction !== direction) {
        // Direction conflict: e.g. still have an open LONG but seeing SHORT_OPEN
        // Finalize the existing position as open (data integrity issue)
        warnings.push({
          message: `Direction conflict on ${symbol}: had open ${existing.direction} when ${direction} OPEN arrived. Finalizing existing position as open.`,
          symbol,
          rowIndex: fill.rowIndex,
        })
        trades.push(finalizePosition(existing, true))
        active.delete(symbol)
      }

      if (!active.has(symbol)) {
        active.set(symbol, {
          direction,
          openingFills: [],
          closingFills: [],
          fifoQueue: [],
          netPosition: 0,
          peakPosition: 0,
          totalFees: 0,
        })
      }

      const pos = active.get(symbol)!
      pos.openingFills.push(fill)
      pos.fifoQueue.push({ qty, fill })
      pos.netPosition += qty
      pos.peakPosition = Math.max(pos.peakPosition, pos.netPosition)
      pos.totalFees += commission
      continue
    }

    // ── CLOSING fill ──────────────────────────────────────────────
    if (posEffect === 'CLOSE') {
      const pos = active.get(symbol)

      if (!pos) {
        // Orphaned close — no open position tracked for this symbol
        warnings.push({
          message: `Orphaned close on ${symbol}: no open position found. Fill skipped.`,
          symbol,
          rowIndex: fill.rowIndex,
        })
        continue
      }

      if (pos.direction !== direction) {
        // Closing fill's direction doesn't match the active position direction
        warnings.push({
          message: `Direction mismatch close on ${symbol}: active=${pos.direction}, close direction=${direction}. Fill skipped.`,
          symbol,
          rowIndex: fill.rowIndex,
        })
        continue
      }

      pos.closingFills.push(fill)
      pos.totalFees += commission

      // Consume FIFO lots
      let remaining = qty
      while (remaining > 0 && pos.fifoQueue.length > 0) {
        const lot = pos.fifoQueue[0]
        if (lot.qty <= remaining) {
          remaining -= lot.qty
          pos.fifoQueue.shift()
        } else {
          lot.qty -= remaining
          remaining = 0
        }
      }

      if (remaining > 0) {
        // Closing more shares than we have open — oversized close
        warnings.push({
          message: `Oversized close on ${symbol}: closed ${qty} but only ${qty - remaining} were tracked as open. ${remaining} excess qty ignored.`,
          symbol,
          rowIndex: fill.rowIndex,
        })
      }

      pos.netPosition = pos.fifoQueue.reduce((s, lot) => s + lot.qty, 0)

      if (pos.netPosition <= 0) {
        // Position fully closed → finalize as a completed round trip
        trades.push(finalizePosition(pos, false))
        active.delete(symbol)
      }
      // else: partial close, position continues with remaining lots
    }
  }

  // Any remaining active positions → mark as open
  for (const [, pos] of active) {
    trades.push(finalizePosition(pos, true))
  }

  // Sort final trade list by entryTime ASC
  trades.sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime())

  return { trades, warnings }
}
