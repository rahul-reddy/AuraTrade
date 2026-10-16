import {
  analyzeTosAccountStatement,
  isTosAccountStatement,
} from '@/lib/parser/tos-account-statement-parser'
import { analyzeBrokerStatement } from '@/lib/parser/analyze-broker-statement'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'
import { evaluateStatementImportSupport } from '@/lib/engine/broker-trade-importer'

const TRADE_HEADER =
  ',Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type'
const CASH_HEADER =
  'DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE'

/** Builds a thinkorswim Account Statement with the real section layout. */
function makeStatement(args: { fills: string[]; cash: string[] }): string {
  return [
    '﻿Account Statement for 00000000SCHW (Individual) since 1/1/26 through 12/31/26',
    '',
    'Cash Balance',
    CASH_HEADER,
    '1/2/26,01:00:00,BAL,,Cash balance at the start of business day 02.01 CST,,,,"10,000.00"',
    ...args.cash,
    '',
    'Account Order History',
    'Notes,,Time Placed,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,,TIF,Status',
    ',,1/15/26 09:30:00,STOCK,BUY,+100,TO OPEN,ABC,,,STOCK,~,MKT,DAY,FILLED',
    '',
    'Account Trade History',
    TRADE_HEADER,
    ...args.fills,
    '',
    'Equities',
    'Symbol,Description,Qty,Trade Price',
    '',
  ].join('\n')
}

describe('isTosAccountStatement', () => {
  test('detects the Account Statement title line (with BOM)', () => {
    expect(isTosAccountStatement(makeStatement({ fills: [], cash: [] }))).toBe(true)
  })

  test('rejects Schwab Transaction History exports', () => {
    expect(
      isTosAccountStatement('Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount'),
    ).toBe(false)
  })
})

describe('analyzeTosAccountStatement', () => {
  test('reads fills chronologically and converts ET wall clock to UTC across DST', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [
          // newest first, as exported
          ',6/15/26 09:30:00,STOCK,SELL,-100,TO CLOSE,ABC,,,STOCK,11.00,11.00,MKT',
          ',1/15/26 09:30:00,STOCK,BUY,+100,TO OPEN,ABC,,,STOCK,10.00,10.00,MKT',
        ],
        cash: [
          '1/15/26,09:30:00,TRD,="1",BOT +100 ABC @10.00,,,"-1,000.00","9,000.00"',
          '6/15/26,09:30:00,TRD,="2",SOLD -100 ABC @11.00,-0.05,,"1,100.00","10,099.95"',
        ],
      }),
    )

    expect(dryRun.sourceFormat).toBe('TOS_ACCOUNT_STATEMENT')
    expect(dryRun.rows.map((row) => row.action)).toEqual(['Buy', 'Sell'])
    // January is EST (UTC-5), June is EDT (UTC-4)
    expect(dryRun.rows[0].date?.toISOString()).toBe('2026-01-15T14:30:00.000Z')
    expect(dryRun.rows[1].date?.toISOString()).toBe('2026-06-15T13:30:00.000Z')
    expect(dryRun.rows.map((row) => row.rowIndex)).toEqual([0, 1])
  })

  test('honors an explicit time-zone override', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [',1/15/26 08:30:00,STOCK,BUY,+1,TO OPEN,ABC,,,STOCK,10.00,10.00,MKT'],
        cash: [],
      }),
      { timeZone: 'America/Chicago' },
    )
    expect(dryRun.rows[0].date?.toISOString()).toBe('2026-01-15T14:30:00.000Z')
  })

  test('reads fees from the matching Cash Balance TRD row on both sides', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [
          ',1/15/26 10:00:00,STOCK,SELL,-100,TO CLOSE,ABC,,,STOCK,11.00,11.00,MKT',
          ',1/15/26 09:30:00,STOCK,BUY,+100,TO OPEN,ABC,,,STOCK,10.00,10.00,MKT',
        ],
        cash: [
          '1/15/26,09:30:00,TRD,="1",BOT +100 ABC @10.00,-0.01,,"-1,000.00","9,000.00"',
          '1/15/26,10:00:00,TRD,="2",SOLD -100 ABC @11.00,-0.05,-0.65,"1,100.00","10,099.95"',
        ],
      }),
    )

    expect(dryRun.rows[0].fees).toBeCloseTo(0.01, 10)
    expect(dryRun.rows[1].fees).toBeCloseTo(0.7, 10)
    expect(dryRun.rows[1].amount).toBe(1100)
    expect(dryRun.rows[1].raw['Ref #']).toBe('2')
  })

  test('matches identical multi-fill rows one-to-one and tolerates a 1s booking lag', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [
          ',1/15/26 09:30:00,STOCK,SELL,-1000,TO CLOSE,ABC,,,ETF,5.00,5.00,STP',
          ',1/15/26 09:30:00,STOCK,SELL,-100,TO CLOSE,ABC,,,ETF,5.00,5.00,STP',
          ',1/15/26 09:30:00,STOCK,SELL,-100,TO CLOSE,ABC,,,ETF,5.00,5.00,STP',
        ],
        cash: [
          '1/15/26,09:30:00,TRD,="7",SOLD -100 ABC @5.00,-0.02,,500.00,"1.00"',
          '1/15/26,09:30:00,TRD,="7",SOLD -100 ABC @5.00,-0.03,,500.00,"1.00"',
          // booked one second after the fill, with a thousands separator
          '1/15/26,09:30:01,TRD,="7","SOLD -1,000 ABC @5.00",-0.20,,"5,000.00","1.00"',
        ],
      }),
    )

    expect(dryRun.rows.map((row) => row.fees)).toEqual([0.02, 0.03, 0.2])
    expect(dryRun.assumptions.some((line) => line.includes('no matching'))).toBe(false)
  })

  test('blocks a fill with no matching cash row instead of assuming a $0 fee', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [
          ',1/15/26 10:00:00,STOCK,SELL,-5,TO CLOSE,ABC,,,STOCK,11.00,11.00,MKT',
          ',1/15/26 09:30:00,STOCK,BUY,+5,TO OPEN,ABC,,,STOCK,10.00,10.00,MKT',
        ],
        // Only the buy has fee evidence; the sell's cash row is missing.
        cash: ['1/15/26,09:30:00,TRD,="1",BOT +5 ABC @10.00,,,-50.00,"1.00"'],
      }),
    )

    const [buy, sell] = dryRun.rows
    expect(buy).toMatchObject({ actionCategory: 'EQUITY_TRADE', blocksCanonicalImport: false })
    expect(sell).toMatchObject({
      action: 'Sell',
      actionCategory: 'UNKNOWN',
      isImportTradeRow: false,
      blocksCanonicalImport: true,
    })
    expect(sell.notes.join(' ')).toContain('broker fee is unknown')
    expect(dryRun.blockers).toHaveLength(1)
    expect(evaluateStatementImportSupport(dryRun).supported).toBe(false)
    expect(dryRun.assumptions.some((line) => line.includes('1 fill(s) had no matching'))).toBe(
      true,
    )
  })

  test('treats blank fee cells as a genuine $0 fee', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [',1/15/26 09:30:00,STOCK,BUY,+5,TO OPEN,ABC,,,STOCK,10.00,10.00,MKT'],
        cash: ['1/15/26,09:30:00,TRD,="1",BOT +5 ABC @10.00,,,-50.00,"1.00"'],
      }),
    )
    expect(dryRun.rows[0]).toMatchObject({ actionCategory: 'EQUITY_TRADE', fees: 0 })
  })

  test.each(['abc', '--', 'n/a'])('blocks a fill whose fee cell is malformed (%s)', (badFee) => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [',1/15/26 09:30:00,STOCK,SELL,-5,TO CLOSE,ABC,,,STOCK,10.00,10.00,MKT'],
        cash: [`1/15/26,09:30:00,TRD,="1",SOLD -5 ABC @10.00,${badFee},,50.00,"1.00"`],
      }),
    )
    expect(dryRun.rows[0]).toMatchObject({ actionCategory: 'UNKNOWN', blocksCanonicalImport: true })
    expect(evaluateStatementImportSupport(dryRun).supported).toBe(false)
  })

  test.each(['Misc Fees', 'Commissions & Fees'])(
    'blocks every fill when the Cash Balance header lacks the %s column',
    (missing) => {
      const statement = makeStatement({
        fills: [',1/15/26 09:30:00,STOCK,SELL,-5,TO CLOSE,ABC,,,STOCK,10.00,10.00,MKT'],
        cash: ['1/15/26,09:30:00,TRD,="1",SOLD -5 ABC @10.00,-0.01,,50.00,"1.00"'],
      }).replace(`${missing},`, 'Other,')
      expect(statement).not.toContain(`${missing},`)

      const dryRun = analyzeTosAccountStatement(statement)
      expect(dryRun.rows[0]).toMatchObject({ actionCategory: 'UNKNOWN', blocksCanonicalImport: true })
      expect(dryRun.importableTradeRows).toBe(0)
    },
  )

  test('blocks every fill when the Cash Balance section is missing entirely', () => {
    const statement = makeStatement({
      fills: [',1/15/26 09:30:00,STOCK,BUY,+5,TO OPEN,ABC,,,STOCK,10.00,10.00,MKT'],
      cash: [],
    }).replace(/Cash Balance\n[^\n]*\n[^\n]*\n\n/, '')
    expect(statement).not.toContain('Cash Balance')

    const dryRun = analyzeTosAccountStatement(statement)
    expect(dryRun.importableTradeRows).toBe(0)
    expect(evaluateStatementImportSupport(dryRun).supported).toBe(false)
  })

  test('joins option fees by full contract identity, not just the underlying', () => {
    // Two ORCL contracts, same second, same side, same quantity, same price. The
    // cash rows list them in the opposite order from the fills.
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [
          ',7/24/26 09:40:31,SINGLE,BUY,+1,TO OPEN,ORCL,15 OCT 27,120,CALL,5.00,5.00,LMT',
          ',7/24/26 09:40:31,SINGLE,BUY,+1,TO OPEN,ORCL,21 AUG 26,150,PUT,5.00,5.00,LMT',
        ],
        cash: [
          '7/24/26,09:40:31,TRD,="1",BOT +1 ORCL 100 15 OCT 27 120 CALL @5.00 CBOE,-0.01,-0.65,-500.00,"1.00"',
          '7/24/26,09:40:31,TRD,="2",BOT +1 ORCL 10 21 AUG 26 150 PUT @5.00 CBOE,-0.02,-1.30,-50.00,"1.00"',
        ],
      }),
    )

    const put = dryRun.rows.find((row) => row.optionContract?.optionType === 'PUT')
    const call = dryRun.rows.find((row) => row.optionContract?.optionType === 'CALL')
    expect(put?.fees).toBeCloseTo(1.32, 10)
    expect(put?.optionContract?.multiplier).toBe(10)
    expect(put?.raw['Ref #']).toBe('2')
    expect(call?.fees).toBeCloseTo(0.66, 10)
    expect(call?.optionContract?.multiplier).toBe(100)
    expect(call?.raw['Ref #']).toBe('1')
  })

  test.each([
    ['FUTURE', 'FUTURE', '/ESZ26'],
    ['STOCK', 'BOND', 'XYZ'],
    ['STOCK', 'FOREX', 'EUR/USD'],
    ['STOCK', 'WIDGET', 'ABC'],
    ['VERTICAL', 'STOCK', 'ABC'],
  ])('blocks unsupported instruments (Spread=%s, Type=%s) instead of importing them as equity', (spread, type, symbol) => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [`,1/15/26 09:30:00,${spread},BUY,+1,TO OPEN,${symbol},,,${type},10.00,10.00,MKT`],
        cash: [`1/15/26,09:30:00,TRD,="1",BOT +1 ${symbol} @10.00,,,-10.00,"1.00"`],
      }),
    )
    expect(dryRun.rows[0]).toMatchObject({ actionCategory: 'UNKNOWN', blocksCanonicalImport: true })
    expect(dryRun.importableTradeRows).toBe(0)
  })

  test.each(['STOCK', 'ETF'])('imports Spread=STOCK fills with Type=%s as equities', (type) => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [`,1/15/26 09:30:00,STOCK,BUY,+1,TO OPEN,ABC,,,${type},10.00,10.00,MKT`],
        cash: ['1/15/26,09:30:00,TRD,="1",BOT +1 ABC @10.00,,,-10.00,"1.00"'],
      }),
    )
    expect(dryRun.rows[0]).toMatchObject({ actionCategory: 'EQUITY_TRADE', instrumentType: 'EQUITY' })
  })

  test('maps option fills to Schwab-style option symbols and reads the multiplier', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [
          ',8/7/26 09:53:50,SINGLE,SELL,-1,TO CLOSE,ORCL,21 AUG 26,150,CALL,4.54,4.54,LMT',
          ',7/24/26 09:40:31,SINGLE,BUY,+1,TO OPEN,ORCL,21 AUG 26,150,CALL,3.00,3.00,LMT',
        ],
        cash: [
          '7/24/26,09:40:31,TRD,="1",BOT +1 ORCL 100 21 AUG 26 150 CALL @3.00 CBOE,-0.01,-0.65,-300.00,"1.00"',
          '8/7/26,09:53:50,TRD,="2",SOLD -1 ORCL 100 21 AUG 26 150 CALL @4.54 CBOE,-0.02,-0.65,454.00,"1.00"',
        ],
      }),
    )

    expect(dryRun.rows.map((row) => row.action)).toEqual(['Buy to Open', 'Sell to Close'])
    expect(dryRun.rows[0].symbol).toBe('ORCL 08/21/2026 150.00 C')
    expect(dryRun.rows[0].optionContract).toEqual({
      underlying: 'ORCL',
      expiration: '08/21/2026',
      strike: 150,
      optionType: 'CALL',
      quantityContracts: 1,
      multiplier: 100,
      underlyingEquivalentQty: 100,
    })
    expect(dryRun.rows[1].fees).toBeCloseTo(0.67, 10)
    expect(dryRun.blockers).toEqual([])
  })

  test('maps equity short sales and covers', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [
          ',1/15/26 10:00:00,STOCK,BUY,+50,TO CLOSE,ABC,,,STOCK,9.00,9.00,MKT',
          ',1/15/26 09:30:00,STOCK,SELL,-50,TO OPEN,ABC,,,STOCK,10.00,10.00,MKT',
        ],
        cash: [],
      }),
    )
    expect(dryRun.rows.map((row) => row.action)).toEqual(['Sell Short', 'Buy to Cover'])
  })

  test('treats money-market FUND rows as cash, not trades', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [',10/8/26 20:19:08,FUND,SELL,-80000.47,TO CLOSE,SNSXX,,,FUND,1.00,1.00,MKT'],
        cash: [],
      }),
    )
    expect(dryRun.rows[0]).toMatchObject({
      action: 'Money Market Sweep',
      instrumentType: 'CASH',
      isImportTradeRow: false,
      blocksCanonicalImport: false,
    })
    expect(dryRun.importableTradeRows).toBe(0)
  })

  test('blocks unrecognized fills instead of guessing', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [',1/15/26 09:30:00,VERTICAL,BUY,+1,TO OPEN,ABC,21 AUG 26,150,CALL,1.00,1.00,LMT'],
        cash: ['1/15/26,09:30:00,TRD,="1",BOT +1 ABC 100 21 AUG 26 150 CALL @1.00 CBOE,,-0.65,-100.65,"1.00"'],
      }),
    )
    // a VERTICAL leg with a parseable contract is still a single option fill
    expect(dryRun.rows[0].actionCategory).toBe('OPTION_TRADE')

    const unknown = analyzeTosAccountStatement(
      makeStatement({
        fills: [',1/15/26 09:30:00,STOCK,BUY,+1,TO EXERCISE,ABC,,,STOCK,1.00,1.00,LMT'],
        cash: [],
      }),
    )
    expect(unknown.rows[0].actionCategory).toBe('UNKNOWN')
    expect(unknown.blockers).toHaveLength(1)
  })

  test('never routes to the legacy Execution import path', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [',1/15/26 09:30:00,STOCK,BUY,+5,TO OPEN,ABC,,,STOCK,10.00,10.00,MKT'],
        cash: ['1/15/26,09:30:00,TRD,="1",BOT +5 ABC @10.00,,,-50.00,"1.00"'],
      }),
    )
    expect(dryRun.importableTradeRows).toBe(1)
    expect(dryRun.importSupported).toBe(false)
  })

  test('reads statement coverage from the "since … through …" header', () => {
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [',1/15/26 09:30:00,STOCK,BUY,+5,TO OPEN,ABC,,,STOCK,10.00,10.00,MKT'],
        cash: [],
      }),
    )
    // header says since 1/1/26 through 12/31/26 — wider than the single fill
    expect(dryRun.coverage?.from.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(dryRun.coverage?.to.toISOString()).toBe('2026-12-31T00:00:00.000Z')
    expect(dryRun.dateRange?.from.toISOString()).toBe('2026-01-15T14:30:00.000Z')
  })

  test('returns an empty dry run when the trade history section is missing', () => {
    const dryRun = analyzeTosAccountStatement('Account Statement for X\n\nCash Balance\n')
    expect(dryRun.totalRows).toBe(0)
    expect(dryRun.sourceFormat).toBe('TOS_ACCOUNT_STATEMENT')
  })
})

describe('analyzeBrokerStatement', () => {
  test('dispatches by format', () => {
    expect(
      analyzeBrokerStatement(makeStatement({ fills: [], cash: [] })).sourceFormat,
    ).toBe('TOS_ACCOUNT_STATEMENT')
    expect(
      analyzeBrokerStatement(
        'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n3/12/2026,Buy,ABC,ABC INC,10,"$1.00 ",,"($10.00)"',
      ).sourceFormat,
    ).toBe('SCHWAB_TRANSACTION_HISTORY')
  })
})

describe('TOS statement through the broker ledger', () => {
  test('builds an intraday round trip with real entry/exit times and net P&L', () => {
    // Scale in 60 @ 10.00 + 40 @ 10.50, exit 100 @ 11.00.
    // VWAP entry = (60×10 + 40×10.5) / 100 = 10.20
    // gross = (11.00 − 10.20) × 100 = 80.00 ; fees = 0.05 ; net = 79.95
    const dryRun = analyzeTosAccountStatement(
      makeStatement({
        fills: [
          ',1/15/26 09:47:12,STOCK,SELL,-100,TO CLOSE,ABC,,,STOCK,11.00,11.00,LMT',
          ',1/15/26 09:31:05,STOCK,BUY,+40,TO OPEN,ABC,,,STOCK,10.50,10.50,MKT',
          ',1/15/26 09:30:02,STOCK,BUY,+60,TO OPEN,ABC,,,STOCK,10.00,10.00,MKT',
        ],
        cash: [
          '1/15/26,09:30:02,TRD,="1",BOT +60 ABC @10.00,,,-600.00,"1.00"',
          '1/15/26,09:31:05,TRD,="2",BOT +40 ABC @10.50,,,-420.00,"1.00"',
          '1/15/26,09:47:12,TRD,="3",SOLD -100 ABC @11.00,-0.05,,"1,100.00","1.00"',
        ],
      }),
    )
    const ledger = buildBrokerPositionLedger(dryRun.rows)

    expect(ledger.warnings).toEqual([])
    expect(ledger.positions).toHaveLength(1)
    const [position] = ledger.positions
    expect(position.side).toBe('LONG')
    expect(position.isOpen).toBe(false)
    expect(position.entryTime.toISOString()).toBe('2026-01-15T14:30:02.000Z')
    expect(position.exitTime?.toISOString()).toBe('2026-01-15T14:47:12.000Z')
    expect(position.entryPrice).toBeCloseTo(10.2, 10)
    expect(position.grossPnl).toBeCloseTo(80, 10)
    expect(position.totalFees).toBeCloseTo(0.05, 10)
    expect(position.netPnl).toBeCloseTo(79.95, 10)
  })
})
