import type { AnalyzedStatementRow } from '@/lib/parser/schwab-statement-analyzer'

export type BrokerPositionSide = 'LONG' | 'SHORT'
export type BrokerPositionCloseKind = 'TRADE' | 'EXPIRATION' | 'TRANSFER' | 'MIXED'

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

    const leftPriority = getSameDayActionPriority(left)
    const rightPriority = getSameDayActionPriority(right)
    if (leftPriority !== rightPriority) return leftPriority - rightPriority

    return left.rowIndex - right.rowIndex
  })
}

function getSameDayActionPriority(row: AnalyzedStatementRow): number {
  if (
    row.action === 'Buy' ||
    row.action === 'Buy to Open' ||
    row.action === 'Sell Short' ||
    row.action === 'Sell to Open'
  ) {
    return 0
  }

  if (row.action === 'Journaled Shares') {
    const transferDirection = inferTransferDirection(row.description)
    if (transferDirection === 'OUT') return 1
    if (transferDirection === 'IN') return 3
  }

  if (row.action === 'Stock Merger') {
    if ((row.quantity ?? 0) < 0) return 1
    if ((row.quantity ?? 0) > 0) return 3
  }

  if (
    row.action === 'Sell' ||
    row.action === 'Sell to Close' ||
    row.action === 'Buy to Cover' ||
    row.action === 'Buy to Close' ||
    row.action === 'Expired'
  ) {
    return 2
  }

  return 1
}

function inferInstrumentType(row: AnalyzedStatementRow): 'EQUITY' | 'OPTION' | null {
  if (row.optionContract) return 'OPTION'
  if (row.symbol) return 'EQUITY'
  return null
}

function getInstrumentKey(row: AnalyzedStatementRow): string | null {
  const instrumentType = inferInstrumentType(row)
  if (!instrumentType || !row.symbol) return null
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

  let exitPrice: number | null = null
  let grossPnl: number | null = null

  if (!isOpen && pos.closingEvents.length > 0 && !hasTransferClose) {
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
  active.closingEvents.push(event)
  active.totalFees += event.fees

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

  return active.fifoQueue.length === 0
}

export function buildBrokerPositionLedger(
  rows: AnalyzedStatementRow[],
): BrokerLedgerResult {
  const positions: BrokerLedgerPosition[] = []
  const warnings: BrokerLedgerWarning[] = []
  const activeByInstrumentSide = new Map<string, ActivePosition>()
  const orderedRows = sortRows(rows)

  for (const row of orderedRows) {
    if (!row.date) {
      warnings.push({
        message: 'Skipped row with no parsed date.',
        rowIndex: row.rowIndex,
      })
      continue
    }

    const instrumentKey = getInstrumentKey(row)
    if (!instrumentKey) continue

    const openSide =
      row.action === 'Buy' || row.action === 'Buy to Open' ? 'LONG'
      : row.action === 'Sell Short' || row.action === 'Sell to Open' ? 'SHORT'
      : null

    if (openSide) {
      const event = buildOpenEvent(row, openSide)
      if (!event) continue
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
        continue
      }

      if (!active) {
        activeByInstrumentSide.set(
          getActiveKey(instrumentKey, openSide),
          createActivePosition(event),
        )
        continue
      }

      active.openingEvents.push(event)
      active.fifoQueue.push({ qty: event.qty, event })
      active.peakQty = Math.max(
        active.peakQty,
        active.fifoQueue.reduce((sum, lot) => sum + lot.qty, 0),
      )
      active.totalFees += event.fees
      continue
    }

    let closeSide: BrokerPositionSide | null = null
    let closeKind: 'CLOSE' | 'EXPIRATION' | 'TRANSFER_OUT' | null = null
    let active = activeByInstrumentSide.get(getActiveKey(instrumentKey, 'LONG'))
    let oppositeActive = activeByInstrumentSide.get(getActiveKey(instrumentKey, 'SHORT'))

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
        if (!event) continue
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
        continue
      } else {
        continue
      }
    } else if (row.action === 'Journaled Shares') {
      const transferDirection = inferTransferDirection(row.description)
      if (transferDirection === 'IN') {
        const sameSideActive = activeByInstrumentSide.get(
          getActiveKey(instrumentKey, 'LONG'),
        )
        const event = buildOpenEvent(row, sameSideActive?.side ?? 'LONG')
        if (!event) continue
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
        continue
      }

      if (transferDirection === 'OUT') {
        closeSide = 'LONG'
        closeKind = 'TRANSFER_OUT'
      } else {
        continue
      }
    }

    if (!closeSide || !closeKind) continue

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
      continue
    }

    if (resolvedActive.side !== closeSide) {
      warnings.push({
        message: `Direction mismatch on ${instrumentKey}: active=${resolvedActive.side}, row=${row.action}.`,
        rowIndex: row.rowIndex,
        instrumentKey,
      })
      continue
    }

    const openQty = resolvedActive.fifoQueue.reduce((sum, lot) => sum + lot.qty, 0)
    const event = buildCloseEvent(row, closeSide, closeKind, openQty)
    if (!event) continue

    const fullyClosed = consumeCloseEvent(resolvedActive, event, warnings)
    if (fullyClosed) {
      positions.push(finalizePosition(resolvedActive, false))
      activeByInstrumentSide.delete(
        getActiveKey(resolvedActive.instrumentKey, resolvedActive.side),
      )
    }
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
