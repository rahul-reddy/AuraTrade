import type { AnalyzedStatementRow } from '@/lib/parser/schwab-statement-analyzer'

export type BrokerPositionSide = 'LONG' | 'SHORT'
export type BrokerPositionCloseKind = 'TRADE' | 'EXPIRATION' | 'TRANSFER' | 'MIXED'

/**
 * One fill (or lifecycle event) as the ledger applied it to a position. Unlike
 * the source row, qty and fees are the portion attributed to THIS position
 * (a reversal row is split between the closed and the newly opened side; an
 * oversized close is capped at the inventory it consumed).
 */
export interface BrokerLedgerFill {
  rowIndex: number
  kind: 'OPEN' | 'CLOSE' | 'EXPIRATION' | 'TRANSFER_IN' | 'TRANSFER_OUT'
  posEffect: 'OPEN' | 'CLOSE'
  side: 'BUY' | 'SELL' | 'SELL_SHORT' | 'BUY_TO_COVER'
  time: Date
  qty: number
  price: number | null
  fees: number
}

export interface BrokerLedgerPosition {
  instrumentKey: string
  instrumentType: 'EQUITY' | 'OPTION'
  symbol: string
  side: BrokerPositionSide
  totalQty: number
  closedQty: number
  remainingQty: number
  multiplier: number
  underlyingEquivalentQty: number
  entryPrice: number
  exitPrice: number | null
  grossPnl: number | null
  totalFees: number
  netPnl: number | null
  isOpen: boolean
  openRows: number[]
  closeRows: number[]
  openingActions: string[]
  closingActions: string[]
  entryTime: Date
  exitTime: Date | null
  closeKind: BrokerPositionCloseKind | null
  /** Opening then closing events, each in the order the ledger applied them. */
  fills: BrokerLedgerFill[]
}

export interface BrokerLedgerWarning {
  message: string
  rowIndex?: number
  instrumentKey?: string
}

export interface BrokerLedgerResult {
  positions: BrokerLedgerPosition[]
  warnings: BrokerLedgerWarning[]
}

export interface BrokerLedgerPreviewSummary {
  closedTradeLikePositions: number
  transferredPositions: number
  openPositions: number
  estimatedPnl: number
}

type EventKind = 'OPEN' | 'CLOSE' | 'EXPIRATION' | 'TRANSFER_IN' | 'TRANSFER_OUT'

interface NormalizedLedgerEvent {
  row: AnalyzedStatementRow
  instrumentKey: string
  instrumentType: 'EQUITY' | 'OPTION'
  side: BrokerPositionSide
  kind: EventKind
  qty: number
  price: number | null
  fees: number
  multiplier: number
}

interface FifoLot {
  qty: number
  event: NormalizedLedgerEvent
}

interface ActivePosition {
  instrumentKey: string
  instrumentType: 'EQUITY' | 'OPTION'
  symbol: string
  side: BrokerPositionSide
  multiplier: number
  openingEvents: NormalizedLedgerEvent[]
  closingEvents: NormalizedLedgerEvent[]
  fifoQueue: FifoLot[]
  peakQty: number
  totalFees: number
}

function getActiveKey(
  instrumentKey: string,
  side: BrokerPositionSide,
): string {
  return `${instrumentKey}:${side}`
}

function sortRows(rows: AnalyzedStatementRow[]): AnalyzedStatementRow[] {
  return [...rows].sort((left, right) => {
    const leftTime = left.date?.getTime() ?? Number.POSITIVE_INFINITY
    const rightTime = right.date?.getTime() ?? Number.POSITIVE_INFINITY
    if (leftTime !== rightTime) return leftTime - rightTime

    // Use original row order within a day — the statement is already reversed to
    // chronological order by analyzeSchwabStatement, so rowIndex is the only
    // reliable same-day sequencing signal. Forcing opens-before-closes breaks
    // real patterns like "close carried position in the morning, reopen later".
    return left.rowIndex - right.rowIndex
  })
}

function inferInstrumentType(row: AnalyzedStatementRow): 'EQUITY' | 'OPTION' | null {
  if (row.optionContract) return 'OPTION'
  if (row.symbol) return 'EQUITY'
  return null
}

/**
 * US money-market fund tickers are five letters ending in "XX" (SNSXX, SWVXX,
 * SPAXX…). They are the account's cash sweep, not trades: Transaction History
 * logs their purchases as "Buy" while the TOS statement logs redemptions as
 * FUND rows, so tracking them would leave phantom open positions.
 */
function isMoneyMarketFund(symbol: string): boolean {
  return /^[A-Z]{3}XX$/.test(symbol)
}

function getInstrumentKey(row: AnalyzedStatementRow): string | null {
  const instrumentType = inferInstrumentType(row)
  if (!instrumentType || !row.symbol) return null
  if (instrumentType === 'EQUITY' && isMoneyMarketFund(row.symbol)) return null
  return `${instrumentType}:${row.symbol}`
}

function getRowQty(row: AnalyzedStatementRow): number {
  if (row.optionContract?.quantityContracts != null) {
    return Math.abs(row.optionContract.quantityContracts)
  }

  if (row.quantity != null) {
    return Math.abs(row.quantity)
  }

  return 0
}

function getMultiplier(row: AnalyzedStatementRow): number {
  return row.optionContract?.multiplier ?? 1
}

function vwap(events: NormalizedLedgerEvent[]): number {
  const priced = events.filter((event) => event.price != null)
  const totalQty = priced.reduce((sum, event) => sum + event.qty, 0)
  if (totalQty === 0) return 0
  const dollarVolume = priced.reduce(
    (sum, event) => sum + (event.price ?? 0) * event.qty,
    0,
  )
  return dollarVolume / totalQty
}

function totalQty(events: NormalizedLedgerEvent[]): number {
  return events.reduce((sum, event) => sum + event.qty, 0)
}

function inferTransferDirection(description: string): 'IN' | 'OUT' | null {
  const normalized = description.toUpperCase()
  if (
    normalized.includes('TRANSFER OF SECURITY OR OPTION OUT') ||
    normalized.includes('TRANSFER OF SECURITY OUT') ||
    normalized.includes(' OPTION OUT') ||
    normalized.includes(' SECURITY OUT')
  ) {
    return 'OUT'
  }

  if (
    normalized.includes('TRANSFER OF SECURITY OR OPTION IN') ||
    normalized.includes('TRANSFER OF SECURITY IN') ||
    normalized.includes(' OPTION IN') ||
    normalized.includes(' SECURITY IN')
  ) {
    return 'IN'
  }

  return null
}

function inferCloseKind(events: NormalizedLedgerEvent[]): BrokerPositionCloseKind | null {
  if (events.length === 0) return null

  const kinds = new Set<BrokerPositionCloseKind>()
  for (const event of events) {
    if (event.kind === 'CLOSE') kinds.add('TRADE')
    if (event.kind === 'EXPIRATION') kinds.add('EXPIRATION')
    if (event.kind === 'TRANSFER_OUT') kinds.add('TRANSFER')
  }

  if (kinds.size === 0) return null
  if (kinds.size === 1) return [...kinds][0]
  return 'MIXED'
}

function finalizePosition(pos: ActivePosition, isOpen: boolean): BrokerLedgerPosition {
  const entryPrice = vwap(pos.openingEvents)
  const closedQty = totalQty(pos.closingEvents)
  const remainingQty = pos.fifoQueue.reduce((sum, lot) => sum + lot.qty, 0)
  const closeKind = isOpen ? null : inferCloseKind(pos.closingEvents)
  const hasTransferClose = pos.closingEvents.some((event) => event.kind === 'TRANSFER_OUT')
  // If every opening event lacks a price (e.g. transfer-in, merger-in), entryPrice
  // is 0 from vwap() and would make the entire sale proceeds look like profit.
  // Guard by checking whether any priced opening event exists.
  const hasPricedOpen = pos.openingEvents.some((event) => event.price != null)

  let exitPrice: number | null = null
  let grossPnl: number | null = null

  if (!isOpen && pos.closingEvents.length > 0 && !hasTransferClose && hasPricedOpen) {
    exitPrice = vwap(pos.closingEvents)
    if (pos.side === 'LONG') {
      grossPnl = (exitPrice - entryPrice) * closedQty * pos.multiplier
    } else {
      grossPnl = (entryPrice - exitPrice) * closedQty * pos.multiplier
    }
  }

  const netPnl = grossPnl == null ? null : grossPnl - pos.totalFees
  const entryTime = pos.openingEvents[0].row.date ?? new Date(0)
  const exitTime = isOpen
    ? null
    : (pos.closingEvents[pos.closingEvents.length - 1]?.row.date ?? null)

  return {
    instrumentKey: pos.instrumentKey,
    instrumentType: pos.instrumentType,
    symbol: pos.symbol,
    side: pos.side,
    totalQty: pos.peakQty,
    closedQty,
    remainingQty,
    multiplier: pos.multiplier,
    underlyingEquivalentQty: pos.peakQty * pos.multiplier,
    entryPrice,
    exitPrice,
    grossPnl,
    totalFees: pos.totalFees,
    netPnl,
    isOpen,
    openRows: pos.openingEvents.map((event) => event.row.rowIndex),
    closeRows: pos.closingEvents.map((event) => event.row.rowIndex),
    openingActions: pos.openingEvents.map((event) => event.row.action),
    closingActions: pos.closingEvents.map((event) => event.row.action),
    entryTime,
    exitTime,
    closeKind,
    fills: [
      ...pos.openingEvents.map((event) => toLedgerFill(event, 'OPEN', pos.side)),
      ...pos.closingEvents.map((event) => toLedgerFill(event, 'CLOSE', pos.side)),
    ],
  }
}

function toLedgerFill(
  event: NormalizedLedgerEvent,
  posEffect: 'OPEN' | 'CLOSE',
  side: BrokerPositionSide,
): BrokerLedgerFill {
  return {
    rowIndex: event.row.rowIndex,
    kind: event.kind,
    posEffect,
    side:
      side === 'LONG'
        ? posEffect === 'OPEN' ? 'BUY' : 'SELL'
        : posEffect === 'OPEN' ? 'SELL_SHORT' : 'BUY_TO_COVER',
    // Undated rows never reach a position (the ledger skips them).
    time: event.row.date ?? new Date(0),
    qty: event.qty,
    price: event.price,
    fees: event.fees,
  }
}

function createActivePosition(event: NormalizedLedgerEvent): ActivePosition {
  return {
    instrumentKey: event.instrumentKey,
    instrumentType: event.instrumentType,
    symbol: event.row.symbol,
    side: event.side,
    multiplier: event.multiplier,
    openingEvents: [event],
    closingEvents: [],
    fifoQueue: [{ qty: event.qty, event }],
    peakQty: event.qty,
    totalFees: event.fees,
  }
}

function buildOpenEvent(
  row: AnalyzedStatementRow,
  side: BrokerPositionSide,
): NormalizedLedgerEvent | null {
  const instrumentKey = getInstrumentKey(row)
  const instrumentType = inferInstrumentType(row)
  const qty = getRowQty(row)
  if (!instrumentKey || !instrumentType || qty <= 0) return null

  return {
    row,
    instrumentKey,
    instrumentType,
    side,
    kind: row.action === 'Journaled Shares' ? 'TRANSFER_IN' : 'OPEN',
    qty,
    price: row.price,
    fees: row.fees,
    multiplier: getMultiplier(row),
  }
}

function withQtyAndFees(
  event: NormalizedLedgerEvent,
  qty: number,
  fees: number,
  kind: EventKind = event.kind,
  side: BrokerPositionSide = event.side,
): NormalizedLedgerEvent {
  return {
    ...event,
    qty,
    fees,
    kind,
    side,
  }
}

function splitFees(totalFees: number, firstQty: number, totalQty: number): [number, number] {
  if (totalQty <= 0) return [0, totalFees]
  const firstFees = totalFees * (firstQty / totalQty)
  return [firstFees, totalFees - firstFees]
}

function buildCloseEvent(
  row: AnalyzedStatementRow,
  side: BrokerPositionSide,
  kind: 'CLOSE' | 'EXPIRATION' | 'TRANSFER_OUT',
  fallbackQty: number,
): NormalizedLedgerEvent | null {
  const instrumentKey = getInstrumentKey(row)
  const instrumentType = inferInstrumentType(row)
  const qty = getRowQty(row) || fallbackQty
  if (!instrumentKey || !instrumentType || qty <= 0) return null

  return {
    row,
    instrumentKey,
    instrumentType,
    side,
    kind,
    qty,
    price: kind === 'EXPIRATION' ? 0 : row.price,
    fees: row.fees,
    multiplier: getMultiplier(row),
  }
}

function consumeCloseEvent(
  active: ActivePosition,
  event: NormalizedLedgerEvent,
  warnings: BrokerLedgerWarning[],
): boolean {
  let remaining = event.qty
  while (remaining > 0 && active.fifoQueue.length > 0) {
    const lot = active.fifoQueue[0]
    if (lot.qty <= remaining) {
      remaining -= lot.qty
      active.fifoQueue.shift()
    } else {
      lot.qty -= remaining
      remaining = 0
    }
  }

  if (remaining > 0) {
    warnings.push({
      message: `Oversized close on ${active.instrumentKey}: close qty ${event.qty} exceeded tracked open qty by ${remaining}.`,
      rowIndex: event.row.rowIndex,
      instrumentKey: active.instrumentKey,
    })
  }

  // Cap the recorded close qty to what was actually consumed from the FIFO queue.
  // Recording the full raw qty when carry-in inventory is smaller overstates
  // closedQty and P&L in finalizePosition.
  const consumedQty = event.qty - remaining
  const [consumedFees] = remaining > 0
    ? splitFees(event.fees, consumedQty, event.qty)
    : [event.fees, 0]
  const recordedEvent = remaining > 0 ? withQtyAndFees(event, consumedQty, consumedFees) : event
  active.closingEvents.push(recordedEvent)
  active.totalFees += recordedEvent.fees

  return active.fifoQueue.length === 0
}

function groupByTimestamp(rows: AnalyzedStatementRow[]): AnalyzedStatementRow[][] {
  const groups: AnalyzedStatementRow[][] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last[0].date?.getTime() === row.date?.getTime()) last.push(row)
    else groups.push([row])
  }
  return groups
}

function closedSideOf(row: AnalyzedStatementRow): BrokerPositionSide | null {
  if (row.action === 'Sell' || row.action === 'Sell to Close') return 'LONG'
  if (row.action === 'Buy to Cover' || row.action === 'Buy to Close') return 'SHORT'
  return null
}

function opensSide(row: AnalyzedStatementRow, side: BrokerPositionSide): boolean {
  return side === 'LONG'
    ? row.action === 'Buy' || row.action === 'Buy to Open'
    : row.action === 'Sell Short' || row.action === 'Sell to Open'
}

/**
 * True when an ordinary close cannot be covered by current inventory but a
 * later row in the same timestamp group opens that instrument/side.
 */
function shouldDeferClose(
  row: AnalyzedStatementRow,
  laterInGroup: AnalyzedStatementRow[],
  activeByInstrumentSide: Map<string, ActivePosition>,
): boolean {
  const side = closedSideOf(row)
  const instrumentKey = getInstrumentKey(row)
  if (!side || !instrumentKey) return false

  const active = activeByInstrumentSide.get(getActiveKey(instrumentKey, side))
  const openQty = active?.fifoQueue.reduce((sum, lot) => sum + lot.qty, 0) ?? 0
  if (openQty >= getRowQty(row)) return false

  return laterInGroup.some(
    (candidate) => getInstrumentKey(candidate) === instrumentKey && opensSide(candidate, side),
  )
}

export function buildBrokerPositionLedger(
  rows: AnalyzedStatementRow[],
): BrokerLedgerResult {
  const positions: BrokerLedgerPosition[] = []
  const warnings: BrokerLedgerWarning[] = []
  const activeByInstrumentSide = new Map<string, ActivePosition>()
  const orderedRows = sortRows(rows)

  const processRow = (row: AnalyzedStatementRow): void => {
    if (!row.date) {
      warnings.push({
        message: 'Skipped row with no parsed date.',
        rowIndex: row.rowIndex,
      })
      return
    }

    const instrumentKey = getInstrumentKey(row)
    if (!instrumentKey) return

    const openSide =
      row.action === 'Buy' || row.action === 'Buy to Open' ? 'LONG'
      : row.action === 'Sell Short' || row.action === 'Sell to Open' ? 'SHORT'
      : null

    if (openSide) {
      const event = buildOpenEvent(row, openSide)
      if (!event) return
      const active = activeByInstrumentSide.get(getActiveKey(instrumentKey, openSide))
      const oppositeSide = openSide === 'LONG' ? 'SHORT' : 'LONG'
      const oppositeActive = activeByInstrumentSide.get(
        getActiveKey(instrumentKey, oppositeSide),
      )

      const isReversalCandidate =
        oppositeActive &&
        ((row.action === 'Buy' && oppositeActive.side === 'SHORT') ||
          (row.action === 'Sell Short' && oppositeActive.side === 'LONG'))

      if (isReversalCandidate && oppositeActive) {
        const openQty = oppositeActive.fifoQueue.reduce((sum, lot) => sum + lot.qty, 0)
        const closingQty = Math.min(event.qty, openQty)
        const remainingQty = event.qty - closingQty
        const [closeFees, openFees] = splitFees(event.fees, closingQty, event.qty)

        const closeEvent = withQtyAndFees(
          event,
          closingQty,
          closeFees,
          'CLOSE',
          oppositeActive.side,
        )
        const fullyClosed = consumeCloseEvent(oppositeActive, closeEvent, warnings)
        if (fullyClosed) {
          positions.push(finalizePosition(oppositeActive, false))
          activeByInstrumentSide.delete(getActiveKey(instrumentKey, oppositeSide))
        }

        if (remainingQty > 0) {
          const openEvent = withQtyAndFees(event, remainingQty, openFees)
          activeByInstrumentSide.set(
            getActiveKey(instrumentKey, openSide),
            createActivePosition(openEvent),
          )
        }
        return
      }

      if (!active) {
        activeByInstrumentSide.set(
          getActiveKey(instrumentKey, openSide),
          createActivePosition(event),
        )
        return
      }

      active.openingEvents.push(event)
      active.fifoQueue.push({ qty: event.qty, event })
      active.peakQty = Math.max(
        active.peakQty,
        active.fifoQueue.reduce((sum, lot) => sum + lot.qty, 0),
      )
      active.totalFees += event.fees
      return
    }

    let closeSide: BrokerPositionSide | null = null
    let closeKind: 'CLOSE' | 'EXPIRATION' | 'TRANSFER_OUT' | null = null
    const active = activeByInstrumentSide.get(getActiveKey(instrumentKey, 'LONG'))
    const oppositeActive = activeByInstrumentSide.get(getActiveKey(instrumentKey, 'SHORT'))

    if (row.action === 'Sell' || row.action === 'Sell to Close') {
      closeSide = 'LONG'
      closeKind = 'CLOSE'
    } else if (row.action === 'Buy to Cover' || row.action === 'Buy to Close') {
      closeSide = 'SHORT'
      closeKind = 'CLOSE'
    } else if (row.action === 'Expired') {
      if (active && !oppositeActive) {
        closeSide = 'LONG'
      } else if (!active && oppositeActive) {
        closeSide = 'SHORT'
      } else {
        closeSide = row.quantity != null && row.quantity < 0 ? 'LONG' : 'SHORT'
      }
      closeKind = 'EXPIRATION'
    } else if (row.action === 'Stock Merger') {
      if ((row.quantity ?? 0) < 0) {
        closeSide = 'LONG'
        closeKind = 'TRANSFER_OUT'
      } else if ((row.quantity ?? 0) > 0) {
        const sameSideActive = activeByInstrumentSide.get(
          getActiveKey(instrumentKey, 'LONG'),
        )
        const event = buildOpenEvent(row, sameSideActive?.side ?? 'LONG')
        if (!event) return
        if (!sameSideActive) {
          activeByInstrumentSide.set(
            getActiveKey(instrumentKey, 'LONG'),
            createActivePosition(event),
          )
        } else {
          sameSideActive.openingEvents.push(event)
          sameSideActive.fifoQueue.push({ qty: event.qty, event })
          sameSideActive.peakQty = Math.max(
            sameSideActive.peakQty,
            sameSideActive.fifoQueue.reduce((sum, lot) => sum + lot.qty, 0),
          )
          sameSideActive.totalFees += event.fees
        }
        return
      } else {
        return
      }
    } else if (row.action === 'Journaled Shares') {
      const transferDirection = inferTransferDirection(row.description)
      if (transferDirection === 'IN') {
        const sameSideActive = activeByInstrumentSide.get(
          getActiveKey(instrumentKey, 'LONG'),
        )
        const event = buildOpenEvent(row, sameSideActive?.side ?? 'LONG')
        if (!event) return
        if (!sameSideActive) {
          activeByInstrumentSide.set(
            getActiveKey(instrumentKey, 'LONG'),
            createActivePosition(event),
          )
        } else {
          sameSideActive.openingEvents.push(event)
          sameSideActive.fifoQueue.push({ qty: event.qty, event })
          sameSideActive.peakQty = Math.max(
            sameSideActive.peakQty,
            sameSideActive.fifoQueue.reduce((sum, lot) => sum + lot.qty, 0),
          )
          sameSideActive.totalFees += event.fees
        }
        return
      }

      if (transferDirection === 'OUT') {
        closeSide = 'LONG'
        closeKind = 'TRANSFER_OUT'
      } else {
        return
      }
    }

    if (!closeSide || !closeKind) return

    let resolvedActive = activeByInstrumentSide.get(getActiveKey(instrumentKey, closeSide))
    if (
      !resolvedActive &&
      row.action === 'Stock Merger' &&
      closeKind === 'TRANSFER_OUT'
    ) {
      const companionRows = orderedRows.filter((candidate) => {
        if (candidate.rowIndex === row.rowIndex || candidate.action !== 'Stock Merger') {
          return false
        }

        return (
          candidate.date?.getTime() === row.date?.getTime() &&
          Math.abs(candidate.quantity ?? 0) === Math.abs(row.quantity ?? 0) &&
          (candidate.quantity ?? 0) > 0 &&
          candidate.symbol !== row.symbol
        )
      })

      if (companionRows.length === 1) {
        resolvedActive = activeByInstrumentSide.get(
          getActiveKey(`EQUITY:${companionRows[0].symbol}`, closeSide),
        )
      }
    }

    if (
      !resolvedActive &&
      row.action === 'Stock Merger' &&
      closeKind === 'TRANSFER_OUT'
    ) {
      const targetQty = Math.abs(row.quantity ?? 0)
      const candidates = [...activeByInstrumentSide.values()].filter((candidate) => {
        if (candidate.instrumentType !== 'EQUITY' || candidate.side !== closeSide) return false
        const openQty = candidate.fifoQueue.reduce((sum, lot) => sum + lot.qty, 0)
        return Math.abs(openQty - targetQty) < 0.0001
      })
      if (candidates.length === 1) {
        resolvedActive = candidates[0]
      }
    }

    if (!resolvedActive) {
      warnings.push({
        message: `Orphaned close on ${instrumentKey}: no open position found for ${row.action}.`,
        rowIndex: row.rowIndex,
        instrumentKey,
      })
      return
    }

    if (resolvedActive.side !== closeSide) {
      warnings.push({
        message: `Direction mismatch on ${instrumentKey}: active=${resolvedActive.side}, row=${row.action}.`,
        rowIndex: row.rowIndex,
        instrumentKey,
      })
      return
    }

    const openQty = resolvedActive.fifoQueue.reduce((sum, lot) => sum + lot.qty, 0)
    const event = buildCloseEvent(row, closeSide, closeKind, openQty)
    if (!event) return

    const fullyClosed = consumeCloseEvent(resolvedActive, event, warnings)
    if (fullyClosed) {
      positions.push(finalizePosition(resolvedActive, false))
      activeByInstrumentSide.delete(
        getActiveKey(resolvedActive.instrumentKey, resolvedActive.side),
      )
    }
  }

  for (const group of groupByTimestamp(orderedRows)) {
    // Rows sharing an identical timestamp have no trustworthy internal order
    // (date-only exports put a whole day on one timestamp, and newest-first
    // files reverse it). A close that the current inventory cannot cover is
    // deferred until after the group's matching opens; a close that it CAN
    // cover runs in file order, so "sell the carried position, rebuy later"
    // is not inverted. Distinct timestamps are never reordered.
    const deferred: AnalyzedStatementRow[] = []
    group.forEach((row, index) => {
      if (shouldDeferClose(row, group.slice(index + 1), activeByInstrumentSide)) {
        deferred.push(row)
      } else {
        processRow(row)
      }
    })
    deferred.forEach(processRow)
  }

  for (const position of activeByInstrumentSide.values()) {
    positions.push(finalizePosition(position, true))
  }

  positions.sort((left, right) => left.entryTime.getTime() - right.entryTime.getTime())

  return { positions, warnings }
}

export function summarizeBrokerLedger(
  result: BrokerLedgerResult,
): BrokerLedgerPreviewSummary {
  const closedTradeLikePositions = result.positions.filter(
    (position) => !position.isOpen && position.closeKind !== 'TRANSFER',
  ).length
  const transferredPositions = result.positions.filter(
    (position) => !position.isOpen && position.closeKind === 'TRANSFER',
  ).length
  const openPositions = result.positions.filter((position) => position.isOpen).length
  const estimatedPnl = result.positions.reduce(
    (sum, position) => sum + (position.netPnl ?? 0),
    0,
  )

  return {
    closedTradeLikePositions,
    transferredPositions,
    openPositions,
    estimatedPnl,
  }
}
