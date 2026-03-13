import { parseSchwabCSV } from '@/lib/parser/tos-csv-parser'

// ─── helpers ─────────────────────────────────────────────────────────

function makeTdaCsv(rows: string[]): string {
  const header = '"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"'
  return [header, ...rows].join('\n')
}

function makeSchawbCsv(rows: string[]): string {
  const header = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount'
  return [header, ...rows].join('\n')
}

// ─── 1. Action classification ─────────────────────────────────────────

describe('action classification', () => {
  test('Buy → LONG_OPEN', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Buy","BROS","TDA TRAN - Bought 100 (BROS) @60.25","100","$60.25","","-$6025.00"',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions).toHaveLength(1)
    expect(executions[0]).toMatchObject({ side: 'BUY', posEffect: 'OPEN', direction: 'LONG' })
  })

  test('Sell → LONG_CLOSE', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Sell","BROS","TDA TRAN - Sold 100 (BROS) @62.25","100","$62.25","$0.04","$6220.96"',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions).toHaveLength(1)
    expect(executions[0]).toMatchObject({ side: 'SELL', posEffect: 'CLOSE', direction: 'LONG' })
  })

  test('Sell Short → SHORT_OPEN', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Sell Short","SPY","TDA TRAN - Sold Short 50 (SPY) @446.50","50","$446.50","$0.12","$22324.88"',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions).toHaveLength(1)
    expect(executions[0]).toMatchObject({ side: 'SELL', posEffect: 'OPEN', direction: 'SHORT' })
  })

  test('Buy + "to Cover" in description → SHORT_CLOSE', () => {
    const csv = makeTdaCsv([
      '"02/08/2022","Buy","SPY","TDA TRAN - Bought to Cover 50 (SPY) @446.81","50","$446.81","","-$22340.50"',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions).toHaveLength(1)
    expect(executions[0]).toMatchObject({ side: 'BUY', posEffect: 'CLOSE', direction: 'SHORT' })
  })

  test('Journaled Shares → skipped', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Journaled Shares","","TDA TRAN - MARK TO THE MARKET","","","","-$171.45"',
    ])
    const { executions, skippedRows } = parseSchwabCSV(csv)
    expect(executions).toHaveLength(0)
    expect(skippedRows).toHaveLength(1)
    expect(skippedRows[0].reason).toContain('empty symbol')
  })

  test('Unknown action → skipped with reason', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Wire Transfer","CASH","Some description","","","","$10000.00"',
    ])
    const { executions, skippedRows } = parseSchwabCSV(csv)
    expect(executions).toHaveLength(0)
    // "CASH" symbol is not empty so it gets to classifyAction
    expect(skippedRows[0].reason).toContain('Wire Transfer')
  })
})

// ─── 2. Commission parsing ────────────────────────────────────────────

describe('commission parsing', () => {
  test('empty Fees → $0 commission on buy', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Buy","BROS","TDA TRAN - Bought 200 (BROS) @60.25","200","$60.25","","-$12050.00"',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions[0].commission).toBe(0)
  })

  test('$0.08 fee on sell', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Sell","BROS","TDA TRAN - Sold 200 (BROS) @62.25","200","$62.25","$0.08","$12449.92"',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions[0].commission).toBeCloseTo(0.08)
  })

  test('$0.24 fee on Sell Short', () => {
    const csv = makeTdaCsv([
      '"02/08/2022","Sell Short","SPY","TDA TRAN - Sold Short 100 (SPY) @449.69","100","$449.69","$0.24","$44968.76"',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions[0].commission).toBeCloseTo(0.24)
  })

  // Schwab format with trailing space
  test('Schwab format: "$0.10 " (trailing space) → 0.10', () => {
    const csv = makeSchawbCsv([
      '3/12/2026,Sell,RXRX,RECURSION PHARMACEUTICALS,500,"$3.23 ","$0.10 ","$1,614.90 "',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions[0].commission).toBeCloseTo(0.10)
  })
})

// ─── 3. Amount parsing ────────────────────────────────────────────────

describe('amount parsing', () => {
  test('TDA negative amount: "-$12050.00"', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Buy","BROS","TDA TRAN - Bought 200 (BROS) @60.25","200","$60.25","","-$12050.00"',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions[0].amount).toBeCloseTo(-12050)
  })

  test('Schwab parentheses negative: "($1,072.29)"', () => {
    const csv = makeSchawbCsv([
      '3/12/2026,Buy,NBIS,NEBIUS GROUP,10,"$107.23 ",,"($1,072.29)"',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions[0].amount).toBeCloseTo(-1072.29)
  })

  test('Schwab positive amount with commas: "$1,614.90 "', () => {
    const csv = makeSchawbCsv([
      '3/12/2026,Sell,RXRX,RECURSION PHARMACEUTICALS,500,"$3.23 ","$0.10 ","$1,614.90 "',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions[0].amount).toBeCloseTo(1614.90)
  })
})

// ─── 4. Date parsing ─────────────────────────────────────────────────

describe('date parsing', () => {
  test('TDA format "02/07/2022" (leading zeros)', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Buy","BROS","desc","100","$60.25","","-$6025.00"',
    ])
    const { executions } = parseSchwabCSV(csv)
    const d = executions[0].date
    expect(d.getFullYear()).toBe(2022)
    expect(d.getMonth()).toBe(1) // 0-indexed: February
    expect(d.getDate()).toBe(7)
  })

  test('Schwab format "3/12/2026" (no leading zeros)', () => {
    const csv = makeSchawbCsv([
      '3/12/2026,Sell,RXRX,RECURSION PHARMACEUTICALS,500,"$3.23 ","$0.10 ","$1,614.90 "',
    ])
    const { executions } = parseSchwabCSV(csv)
    const d = executions[0].date
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2) // March
    expect(d.getDate()).toBe(12)
  })

  test('invalid date → skipped row', () => {
    const csv = makeTdaCsv([
      '"not-a-date","Buy","BROS","desc","100","$60.25","","-$6025.00"',
    ])
    const { executions, skippedRows } = parseSchwabCSV(csv)
    expect(executions).toHaveLength(0)
    expect(skippedRows[0].reason).toContain('unparseable date')
  })
})

// ─── 5. Row ordering (intra-day tie-breaker) ─────────────────────────

describe('row ordering', () => {
  test('rowIndex increases monotonically across all rows (including skipped)', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Buy","BROS","desc","200","$60.25","","-$12050.00"',
      '"02/07/2022","Journaled Shares","","MARK TO MARKET","","","","-$5.00"', // skipped (empty symbol)
      '"02/07/2022","Sell","BROS","desc","200","$62.25","$0.08","$12449.92"',
    ])
    const { executions } = parseSchwabCSV(csv)
    // rowIndex 0 = Buy, rowIndex 1 = Journaled (skipped), rowIndex 2 = Sell
    expect(executions[0].rowIndex).toBe(0)
    expect(executions[1].rowIndex).toBe(2)
  })
})

// ─── 6. BOM stripping ────────────────────────────────────────────────

describe('BOM handling', () => {
  test('strips UTF-8 BOM \\uFEFF from start of file', () => {
    const csv = '\uFEFF' + makeTdaCsv([
      '"02/07/2022","Buy","BROS","desc","100","$60.25","","-$6025.00"',
    ])
    const { executions } = parseSchwabCSV(csv)
    expect(executions).toHaveLength(1)
    expect(executions[0].symbol).toBe('BROS')
  })
})

// ─── 7. dateRange + symbols aggregation ──────────────────────────────

describe('result aggregation', () => {
  const csv = makeTdaCsv([
    '"02/07/2022","Buy","BROS","desc","100","$60.25","","-$6025.00"',
    '"02/09/2022","Buy","TNA","desc","100","$64.51","","-$6451.00"',
    '"02/09/2022","Sell","BROS","desc","100","$62.25","$0.04","$6220.96"',
  ])

  test('dateRange from/to are correct', () => {
    const { dateRange } = parseSchwabCSV(csv)
    expect(dateRange).not.toBeNull()
    expect(dateRange!.from.getDate()).toBe(7)   // Feb 7
    expect(dateRange!.to.getDate()).toBe(9)     // Feb 9
  })

  test('symbols are unique and sorted', () => {
    const { symbols } = parseSchwabCSV(csv)
    expect(symbols).toEqual(['BROS', 'TNA'])
  })

  test('empty CSV returns null dateRange and empty symbols', () => {
    const { dateRange, symbols } = parseSchwabCSV(makeTdaCsv([]))
    expect(dateRange).toBeNull()
    expect(symbols).toEqual([])
  })
})

// ─── 8. Real-world sample rows ───────────────────────────────────────

describe('real-world sample rows', () => {
  test('2022 TDA: full session with short positions', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Buy","BROS","TDA TRAN - Bought ...200 (BROS) @60.2500","200","$60.25","","-$12050.00"',
      '"02/07/2022","Sell","BROS","TDA TRAN - Sold ...200 (BROS) @62.2500","200","$62.25","$0.08","$12449.92"',
      '"02/07/2022","Sell Short","SPY","TDA TRAN - Sold Short 50 (SPY) @446.5022","50","$446.5022","$0.12","$22324.99"',
      '"02/08/2022","Buy","SPY","TDA TRAN - Bought to Cover 50 (SPY) @446.8085","50","$446.8085","","-$22340.43"',
      '"02/07/2022","Journaled Shares","","TDA TRAN - MARK TO THE MARKET","","","","-$171.45"',
    ])
    const result = parseSchwabCSV(csv)

    expect(result.executions).toHaveLength(4)
    expect(result.skippedRows).toHaveLength(1)

    const [buy, sell, short, cover] = result.executions
    expect(buy).toMatchObject({ symbol: 'BROS', side: 'BUY', posEffect: 'OPEN', direction: 'LONG', qty: 200, price: 60.25, commission: 0 })
    expect(sell).toMatchObject({ symbol: 'BROS', side: 'SELL', posEffect: 'CLOSE', direction: 'LONG', qty: 200, price: 62.25, commission: 0.08 })
    expect(short).toMatchObject({ symbol: 'SPY', side: 'SELL', posEffect: 'OPEN', direction: 'SHORT', qty: 50 })
    expect(cover).toMatchObject({ symbol: 'SPY', side: 'BUY', posEffect: 'CLOSE', direction: 'SHORT', qty: 50 })
  })

  test('2026 Schwab: parentheses negatives + commas + trailing spaces', () => {
    const csv = makeSchawbCsv([
      '3/12/2026,Sell,RXRX,RECURSION PHARMACEUTICALS,500,"$3.23 ","$0.10 ","$1,614.90 "',
      '3/12/2026,Buy,NBIS,NEBIUS GROUP N V A,10,"$107.23 ",,"($1,072.29)"',
    ])
    const { executions } = parseSchwabCSV(csv)

    expect(executions).toHaveLength(2)
    expect(executions[0]).toMatchObject({
      symbol: 'RXRX',
      side: 'SELL',
      posEffect: 'CLOSE',
      direction: 'LONG',
      qty: 500,
      commission: 0.10,
      amount: 1614.90,
    })
    expect(executions[1]).toMatchObject({
      symbol: 'NBIS',
      side: 'BUY',
      posEffect: 'OPEN',
      direction: 'LONG',
      qty: 10,
      commission: 0,
      amount: -1072.29,
    })
  })
})

// ─── 9. Reverse-chronological detection (Schwab 2026) ─────────────────

describe('reverse-chronological file detection', () => {
  test('Schwab newest-to-oldest: sell before buy in file → buy gets lower rowIndex after reversal', () => {
    // Real Schwab pattern: sell (exit) appears first in file, buy (entry) appears after
    // This means the trade happened chronologically as: buy → sell (a loss)
    // but the file records it sell → buy (newest first)
    const csv = makeSchawbCsv([
      '3/11/2026,Sell,AMDL,GRANITESHARES 2X LONG AMD,500,"$12.65 ","$0.10 ","$6,324.90 "',  // appears first in file
      '3/11/2026,Buy,AMDL,GRANITESHARES 2X LONG AMD,500,"$13.05 ",,"($6,524.95)"',          // appears second
      '3/6/2026,Sell,ONDS,ONDAS INC,500,"$10.10 ","$0.10 ","$5,049.90 "',
      '3/6/2026,Buy,ONDS,ONDAS INC,300,"$11.26 ",,"($3,376.50)"',
    ])
    // First row date (3/11) > last row date (3/6) → reverse-chronological detected
    const { executions, assumptions } = parseSchwabCSV(csv)

    // After reversal: oldest date (3/6) rows come first, then 3/11 rows
    // Within 3/6: buy (was last in original) now has lower rowIndex than sell
    // Within 3/11: buy (was second in original) now has lower rowIndex than sell
    const amdlBuy  = executions.find((e) => e.symbol === 'AMDL' && e.posEffect === 'OPEN')!
    const amdlSell = executions.find((e) => e.symbol === 'AMDL' && e.posEffect === 'CLOSE')!
    expect(amdlBuy).toBeDefined()
    expect(amdlSell).toBeDefined()
    // Buy must sort before sell (lower rowIndex within same date)
    expect(amdlBuy.rowIndex).toBeLessThan(amdlSell.rowIndex)

    // Assumption A7 should be recorded
    expect(assumptions.some((a) => a.includes('newest-to-oldest'))).toBe(true)
  })

  test('2022 TDA oldest-to-newest: buy before sell → no reversal applied', () => {
    const csv = makeTdaCsv([
      '"02/07/2022","Buy","BROS","desc","200","$60.25","","-$12050.00"',
      '"02/07/2022","Sell","BROS","desc","200","$62.25","$0.08","$12449.92"',
      '"02/08/2022","Buy","TNA","desc","100","$60.54","","-$6054.00"',
    ])
    // First date (02/07) <= last date (02/08) → chronological, no reversal
    const { executions, assumptions } = parseSchwabCSV(csv)
    const buy  = executions.find((e) => e.symbol === 'BROS' && e.posEffect === 'OPEN')!
    const sell = executions.find((e) => e.symbol === 'BROS' && e.posEffect === 'CLOSE')!
    // Buy should still have lower rowIndex than sell (original order preserved)
    expect(buy.rowIndex).toBeLessThan(sell.rowIndex)
    expect(assumptions.some((a) => a.includes('newest-to-oldest'))).toBe(false)
  })
})
