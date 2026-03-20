import { groupTrades, type GroupedTrade } from '@/lib/engine/trade-grouper'
import { type ParsedExecution } from '@/lib/parser/tos-csv-parser'

// ─── helpers ─────────────────────────────────────────────────────────

let _rowIndex = 0
function resetIdx() { _rowIndex = 0 }

function exec(
  overrides: Partial<Omit<ParsedExecution, 'date'>> & {
    date: string
    symbol: string
    side: ParsedExecution['side']
    posEffect: ParsedExecution['posEffect']
    direction: ParsedExecution['direction']
    qty: number
    price: number
  },
): ParsedExecution {
  const { date: dateStr, ...rest } = overrides
  return {
    rowIndex: _rowIndex++,
    action: rest.side === 'SELL' && rest.posEffect === 'OPEN' ? 'Sell Short'
           : rest.side === 'BUY' && rest.posEffect === 'CLOSE' ? 'Buy'
           : rest.side === 'BUY' ? 'Buy' : 'Sell',
    commission: 0,
    amount: 0,
    description: '',
    ...rest,
    date: new Date(dateStr + 'T00:00:00.000Z'),
  }
}

function longBuy(date: string, symbol: string, qty: number, price: number, commission = 0): ParsedExecution {
  return exec({ date, symbol, side: 'BUY', posEffect: 'OPEN', direction: 'LONG', qty, price, commission })
}
function longSell(date: string, symbol: string, qty: number, price: number, commission = 0.04): ParsedExecution {
  return exec({ date, symbol, side: 'SELL', posEffect: 'CLOSE', direction: 'LONG', qty, price, commission })
}
function shortOpen(date: string, symbol: string, qty: number, price: number, commission = 0.12): ParsedExecution {
  return exec({ date, symbol, side: 'SELL', posEffect: 'OPEN', direction: 'SHORT', qty, price, commission })
}
function shortClose(date: string, symbol: string, qty: number, price: number, commission = 0): ParsedExecution {
  return exec({ date, symbol, side: 'BUY', posEffect: 'CLOSE', direction: 'SHORT', qty, price, commission })
}

// ─── 1. Simple long round trip ────────────────────────────────────────

describe('simple long round trip', () => {
  beforeEach(resetIdx)

  test('buy 200 @ $60, sell 200 @ $62 → correct VWAP, PnL, fees', () => {
    const fills = [
      longBuy('2022-02-07', 'BROS', 200, 60.25),
      longSell('2022-02-07', 'BROS', 200, 62.25, 0.08),
    ]
    const { trades, warnings } = groupTrades(fills)

    expect(warnings).toHaveLength(0)
    expect(trades).toHaveLength(1)

    const t = trades[0]
    expect(t.symbol).toBe('BROS')
    expect(t.direction).toBe('LONG')
    expect(t.entryPrice).toBeCloseTo(60.25)
    expect(t.exitPrice).toBeCloseTo(62.25)
    expect(t.totalQty).toBe(200)
    expect(t.closedQty).toBe(200)
    // grossPnl = (62.25 - 60.25) × 200 = $400
    expect(t.grossPnl).toBeCloseTo(400)
    expect(t.totalFees).toBeCloseTo(0.08)
    expect(t.netPnl).toBeCloseTo(399.92)
    expect(t.isOpen).toBe(false)
    expect(t.durationSeconds).toBe(0) // same day
  })
})

// ─── 2. Entry VWAP across multiple opening fills ──────────────────────

describe('VWAP across multiple fills', () => {
  beforeEach(resetIdx)

  test('two buys at different prices → correct VWAP entry', () => {
    // Buy 200 @ $60.25 + Buy 200 @ $60.48 → VWAP = (200×60.25 + 200×60.48) / 400 = 60.365
    const fills = [
      longBuy('2022-02-07', 'BROS', 200, 60.25),
      longBuy('2022-02-07', 'BROS', 200, 60.48),
      longSell('2022-02-07', 'BROS', 200, 62.25, 0.08),
      longSell('2022-02-07', 'BROS', 200, 61.78, 0.08),
    ]
    const { trades } = groupTrades(fills)

    expect(trades).toHaveLength(1)
    const t = trades[0]
    expect(t.entryPrice).toBeCloseTo(60.365)
    expect(t.exitPrice).toBeCloseTo((200 * 62.25 + 200 * 61.78) / 400)
    expect(t.totalQty).toBe(400)
    expect(t.closedQty).toBe(400)
    // grossPnl = (exitVWAP - entryVWAP) × 400
    const expectedGross = (t.exitPrice! - t.entryPrice) * 400
    expect(t.grossPnl).toBeCloseTo(expectedGross)
    expect(t.totalFees).toBeCloseTo(0.16)
    expect(t.netPnl).toBeCloseTo(expectedGross - 0.16)
  })
})

// ─── 3. Partial close → continuation → full close ─────────────────────

describe('partial close then full close', () => {
  beforeEach(resetIdx)

  test('buy 200, sell 100 (partial), sell 100 (full) → one trade', () => {
    const fills = [
      longBuy('2022-02-07',  'BROS', 200, 60.00),
      longSell('2022-02-07', 'BROS', 100, 62.00, 0.04),
      longSell('2022-02-08', 'BROS', 100, 63.00, 0.04),
    ]
    const { trades, warnings } = groupTrades(fills)

    expect(warnings).toHaveLength(0)
    expect(trades).toHaveLength(1)

    const t = trades[0]
    expect(t.closedQty).toBe(200)
    expect(t.totalQty).toBe(200)
    // exitVWAP = (100×62 + 100×63) / 200 = 62.5
    expect(t.exitPrice).toBeCloseTo(62.5)
    // grossPnl = (62.5 - 60) × 200 = $500
    expect(t.grossPnl).toBeCloseTo(500)
    expect(t.totalFees).toBeCloseTo(0.08)
    expect(t.netPnl).toBeCloseTo(499.92)
    expect(t.isOpen).toBe(false)
    // duration: Feb 7 → Feb 8 = 1 day = 86400 seconds
    expect(t.durationSeconds).toBe(86400)
  })
})

// ─── 4. Adding to position (pyramid) ─────────────────────────────────

describe('adding to position', () => {
  beforeEach(resetIdx)

  test('buy 100, add 100, sell 200 → one trade, peak = 200', () => {
    const fills = [
      longBuy('2022-02-07',  'BROS', 100, 60.00),
      longBuy('2022-02-07',  'BROS', 100, 61.00),
      longSell('2022-02-07', 'BROS', 200, 63.00, 0.08),
    ]
    const { trades } = groupTrades(fills)

    expect(trades).toHaveLength(1)
    const t = trades[0]
    expect(t.totalQty).toBe(200)
    expect(t.closedQty).toBe(200)
    // entryVWAP = (100×60 + 100×61) / 200 = 60.5
    expect(t.entryPrice).toBeCloseTo(60.5)
    // grossPnl = (63 - 60.5) × 200 = $500
    expect(t.grossPnl).toBeCloseTo(500)
  })
})

// ─── 5. Two separate trades on same symbol ────────────────────────────

describe('two separate round trips same symbol', () => {
  beforeEach(resetIdx)

  test('buy/sell, then buy/sell again → two separate trades', () => {
    const fills = [
      longBuy('2022-02-07',  'BROS', 100, 60.00),
      longSell('2022-02-07', 'BROS', 100, 62.00, 0.04),
      longBuy('2022-02-09',  'BROS', 100, 57.00),
      longSell('2022-02-09', 'BROS', 100, 56.77, 0.04),
    ]
    const { trades, warnings } = groupTrades(fills)

    expect(warnings).toHaveLength(0)
    expect(trades).toHaveLength(2)
    // Trade 1: profitable
    expect(trades[0].grossPnl).toBeCloseTo((62 - 60) * 100) // $200
    // Trade 2: losing
    expect(trades[1].grossPnl).toBeCloseTo((56.77 - 57) * 100) // -$23
  })
})

// ─── 6. Short round trip ──────────────────────────────────────────────

describe('short round trip', () => {
  beforeEach(resetIdx)

  test('sell short 50 SPY, buy to cover → correct short PnL', () => {
    // Sell Short 50 @ $446.50, Cover @ $441.20 → profit for short
    const fills = [
      shortOpen('2022-02-11',  'SPY', 50, 446.50, 0.12),
      shortClose('2022-02-11', 'SPY', 50, 441.20),
    ]
    const { trades, warnings } = groupTrades(fills)

    expect(warnings).toHaveLength(0)
    expect(trades).toHaveLength(1)

    const t = trades[0]
    expect(t.direction).toBe('SHORT')
    expect(t.entryPrice).toBeCloseTo(446.50)
    expect(t.exitPrice).toBeCloseTo(441.20)
    // grossPnl (SHORT) = (entryVWAP - exitVWAP) × qty = (446.50 - 441.20) × 50 = $265
    expect(t.grossPnl).toBeCloseTo(265)
    expect(t.totalFees).toBeCloseTo(0.12)
    expect(t.netPnl).toBeCloseTo(264.88)
    expect(t.isOpen).toBe(false)
  })

  test('short loss: cover above entry → negative grossPnl', () => {
    const fills = [
      shortOpen('2022-02-11',  'SPY', 100, 449.35, 0.24),
      shortClose('2022-02-11', 'SPY', 100, 450.42),
    ]
    const { trades } = groupTrades(fills)
    const t = trades[0]
    // grossPnl = (449.35 - 450.42) × 100 = -$107
    expect(t.grossPnl).toBeCloseTo(-107)
    expect(t.netPnl).toBeCloseTo(-107 - 0.24)
  })
})

// ─── 7. Open positions ────────────────────────────────────────────────

describe('open positions', () => {
  beforeEach(resetIdx)

  test('buy with no matching sell → isOpen=true, null PnL', () => {
    const fills = [
      longBuy('2022-02-08', 'TNA', 100, 60.54),
      longBuy('2022-02-08', 'TNA', 100, 61.44),
      longBuy('2022-02-08', 'TNA', 100, 62.21),
    ]
    const { trades, warnings } = groupTrades(fills)

    expect(warnings).toHaveLength(0)
    expect(trades).toHaveLength(1)
    const t = trades[0]
    expect(t.isOpen).toBe(true)
    expect(t.exitPrice).toBeNull()
    expect(t.grossPnl).toBeNull()
    expect(t.netPnl).toBeNull()
    expect(t.exitTime).toBeNull()
    expect(t.durationSeconds).toBeNull()
    expect(t.totalQty).toBe(300)
    expect(t.closedQty).toBe(0)
    expect(t.remainingQty).toBe(300)
  })
})

// ─── 8. FIFO lot assignment ───────────────────────────────────────────

describe('FIFO lot consumption', () => {
  beforeEach(resetIdx)

  test('FIFO: first buy lot consumed before second', () => {
    // If PnL is computed per lot, first lot (cheaper) closes first
    // But since we use aggregate VWAP for the whole trade, we just
    // verify the correct qty is consumed and the trade finalizes cleanly
    const fills = [
      longBuy('2022-02-07',  'TNA', 100, 59.34), // lot 1
      longBuy('2022-02-07',  'TNA', 100, 60.17), // lot 2
      longSell('2022-02-07', 'TNA', 100, 59.39, 0.04), // closes lot 1
      // lot 2 remains open
    ]
    const { trades } = groupTrades(fills)

    expect(trades).toHaveLength(1)
    const t = trades[0]
    expect(t.isOpen).toBe(true) // lot 2 still open
    expect(t.closedQty).toBe(100)
    expect(t.totalQty).toBe(200) // peak was 200
  })

  test('FIFO partial lot: close 150 from two lots of 100', () => {
    const fills = [
      longBuy('2022-02-07',  'SYM', 100, 10.00), // lot A: 100
      longBuy('2022-02-07',  'SYM', 100, 11.00), // lot B: 100
      longSell('2022-02-07', 'SYM', 150, 12.00, 0.06), // consumes lot A (100) + 50 from lot B
    ]
    const { trades } = groupTrades(fills)

    expect(trades).toHaveLength(1)
    const t = trades[0]
    expect(t.isOpen).toBe(true) // 50 shares remain from lot B
    expect(t.closedQty).toBe(150)
    // entryVWAP = (100×10 + 100×11) / 200 = 10.5
    expect(t.entryPrice).toBeCloseTo(10.5)
  })
})

// ─── 9. Multi-symbol independence ────────────────────────────────────

describe('multi-symbol independence', () => {
  beforeEach(resetIdx)

  test('interleaved BROS and TNA fills → separate, correct trades', () => {
    const fills = [
      longBuy('2022-02-07',  'BROS', 200, 60.25),
      longBuy('2022-02-07',  'TNA',  100, 59.34),
      longSell('2022-02-07', 'TNA',  100, 59.39, 0.04),
      longSell('2022-02-07', 'BROS', 200, 62.25, 0.08),
    ]
    const { trades, warnings } = groupTrades(fills)

    expect(warnings).toHaveLength(0)
    expect(trades).toHaveLength(2)

    const bros = trades.find((t) => t.symbol === 'BROS')!
    const tna  = trades.find((t) => t.symbol === 'TNA')!

    expect(bros.grossPnl).toBeCloseTo((62.25 - 60.25) * 200) // $400
    expect(tna.grossPnl).toBeCloseTo((59.39 - 59.34) * 100)  // $5
  })
})

// ─── 10. Direction conflict warning ──────────────────────────────────

describe('direction conflict', () => {
  beforeEach(resetIdx)

  test('open LONG then see SHORT_OPEN → warning + two trades', () => {
    const fills = [
      longBuy('2022-02-07',   'SPY', 100, 448.00),
      shortOpen('2022-02-07', 'SPY', 100, 449.00, 0.24),
    ]
    const { trades, warnings } = groupTrades(fills)

    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('Direction conflict')
    // The existing LONG is finalized as open; then SHORT starts
    expect(trades).toHaveLength(2)
    expect(trades.some((t) => t.isOpen)).toBe(true)
  })
})

// ─── 11. Orphaned close warning ──────────────────────────────────────

describe('orphaned close', () => {
  beforeEach(resetIdx)

  test('sell with no prior buy → warning, no trade created', () => {
    const fills = [
      longSell('2022-02-07', 'GHOST', 100, 50.00),
    ]
    const { trades, warnings } = groupTrades(fills)

    expect(trades).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('Orphaned close')
  })
})

// ─── 12. Row ordering: same-date fills sorted by rowIndex ────────────

describe('row ordering within same date', () => {
  beforeEach(resetIdx)

  test('trades sorted by entryTime ASC in output', () => {
    const fills = [
      longBuy('2022-02-09', 'RBLX', 100, 71.25),
      longSell('2022-02-09','RBLX', 100, 68.61, 0.04),
      longBuy('2022-02-07', 'BROS', 100, 60.25),
      longSell('2022-02-07','BROS', 100, 62.25, 0.04),
    ]
    const { trades } = groupTrades(fills)

    expect(trades[0].symbol).toBe('BROS')   // Feb 7 comes first
    expect(trades[1].symbol).toBe('RBLX')   // Feb 9 comes second
  })
})

// ─── 13. Duration calculation ─────────────────────────────────────────

describe('durationSeconds', () => {
  beforeEach(resetIdx)

  test('same-day trade → 0 seconds', () => {
    const fills = [
      longBuy('2022-02-07',  'BROS', 100, 60.00),
      longSell('2022-02-07', 'BROS', 100, 62.00),
    ]
    const { trades } = groupTrades(fills)
    expect(trades[0].durationSeconds).toBe(0)
  })

  test('1-day overnight → 86400 seconds', () => {
    const fills = [
      longBuy('2022-02-07',  'TNA', 100, 60.00),
      longSell('2022-02-08', 'TNA', 100, 62.00),
    ]
    const { trades } = groupTrades(fills)
    expect(trades[0].durationSeconds).toBe(86400)
  })

  test('multi-day → days × 86400', () => {
    const fills = [
      longBuy('2022-02-07',  'NVDA', 100, 260.00),
      longSell('2022-02-11', 'NVDA', 100, 258.96),
    ]
    const { trades } = groupTrades(fills)
    expect(trades[0].durationSeconds).toBe(4 * 86400)
  })
})
