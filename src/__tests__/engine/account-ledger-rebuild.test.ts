import { Prisma, type BrokerStatementRow } from '@/generated/prisma'
import {
  mapStoredRowToAnalyzedRow,
  selectAccountLedgerRows,
  tradingDateOf,
  type LedgerStatementInput,
} from '@/lib/engine/account-ledger-rebuild'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'
import type {
  AnalyzedStatementRow,
  StatementActionCategory,
} from '@/lib/parser/schwab-statement-analyzer'

function utcDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

let nextRow = 0
function row(args: {
  date: Date
  action: string
  symbol?: string
  quantity: number
  price?: number | null
  fees?: number
  category?: StatementActionCategory
}): AnalyzedStatementRow {
  const category = args.category ?? 'EQUITY_TRADE'
  return {
    rowIndex: nextRow++,
    raw: {},
    date: args.date,
    action: args.action,
    symbol: args.symbol ?? 'AAA',
    description: `${args.action} ${args.symbol ?? 'AAA'}`,
    quantity: args.quantity,
    price: args.price ?? 10,
    fees: args.fees ?? 0,
    amount: null,
    instrumentType: category === 'OPTION_LIFECYCLE' ? 'OPTION' : 'EQUITY',
    actionCategory: category,
    optionContract: null,
    isImportTradeRow: category === 'EQUITY_TRADE',
    blocksCanonicalImport: false,
    notes: [],
  }
}

function statement(
  id: string,
  sourceFormat: LedgerStatementInput['sourceFormat'],
  coverage: [string, string] | null,
  created: string,
  rows: AnalyzedStatementRow[],
): LedgerStatementInput {
  return {
    id,
    sourceFormat,
    coverageFrom: coverage ? utcDay(coverage[0]) : null,
    coverageTo: coverage ? utcDay(coverage[1]) : null,
    createdAt: new Date(created),
    rows: rows.map((r, index) => ({ ...r, rowIndex: index })),
  }
}

describe('tradingDateOf', () => {
  test('reads Transaction History rows as UTC-midnight dates', () => {
    expect(
      tradingDateOf(row({ date: utcDay('2026-03-12'), action: 'Buy', quantity: 1 }), 'SCHWAB_TRANSACTION_HISTORY'),
    ).toBe('2026-03-12')
  })

  test('reads TOS fills in Eastern time (an evening ET fill is still that ET day)', () => {
    // 2026-03-13T01:30Z = 3/12 21:30 EDT
    expect(
      tradingDateOf(
        row({ date: new Date('2026-03-13T01:30:00Z'), action: 'Buy', quantity: 1 }),
        'TOS_ACCOUNT_STATEMENT',
      ),
    ).toBe('2026-03-12')
  })
})

describe('selectAccountLedgerRows', () => {
  test('pairs a carry-in position opened in an older statement with its close in a newer one', () => {
    const selection = selectAccountLedgerRows([
      statement('th', 'SCHWAB_TRANSACTION_HISTORY', ['2026-03-01', '2026-03-12'], '2026-03-13', [
        row({ date: utcDay('2026-03-10'), action: 'Buy', quantity: 100, price: 50 }),
      ]),
      statement('tos', 'TOS_ACCOUNT_STATEMENT', ['2026-03-13', '2026-03-31'], '2026-04-01', [
        row({ date: new Date('2026-03-20T14:00:00Z'), action: 'Sell', quantity: 100, price: 55, fees: 0.1 }),
      ]),
    ])

    const ledger = buildBrokerPositionLedger(selection.rows)
    expect(ledger.warnings).toEqual([])
    expect(ledger.positions).toHaveLength(1)
    expect(ledger.positions[0].isOpen).toBe(false)
    // (55 − 50) × 100 − 0.10
    expect(ledger.positions[0].netPnl).toBeCloseTo(499.9, 10)
    expect(selection.rowOrigins.map((origin) => origin.statementId)).toEqual(['th', 'tos'])
    expect(selection.rows.map((r) => r.rowIndex)).toEqual([0, 1])
  })

  test('overlapping TOS statements: the one whose coverage ends later owns shared days', () => {
    const sharedFill = () =>
      row({ date: new Date('2026-03-12T14:30:00Z'), action: 'Buy', quantity: 10 })
    const selection = selectAccountLedgerRows([
      statement('older', 'TOS_ACCOUNT_STATEMENT', ['2026-03-01', '2026-03-15'], '2026-03-16', [
        row({ date: new Date('2026-03-05T14:30:00Z'), action: 'Buy', quantity: 5 }),
        sharedFill(),
      ]),
      statement('newer', 'TOS_ACCOUNT_STATEMENT', ['2026-03-10', '2026-03-31'], '2026-04-01', [
        sharedFill(),
        row({ date: new Date('2026-03-20T14:30:00Z'), action: 'Sell', quantity: 15 }),
      ]),
    ])

    // 3/05 only in "older"; 3/12 owned by "newer"; 3/20 only in "newer"
    expect(selection.rowOrigins.map((origin) => origin.statementId)).toEqual([
      'older',
      'newer',
      'newer',
    ])
    expect(selection.replacedRows).toBe(1)
    const ledger = buildBrokerPositionLedger(selection.rows)
    expect(ledger.warnings).toEqual([])
    expect(ledger.positions[0].totalQty).toBe(15)
  })

  test('a newer partial-day export beats an older one for the same day', () => {
    const selection = selectAccountLedgerRows([
      statement('midday', 'TOS_ACCOUNT_STATEMENT', ['2026-03-12', '2026-03-12'], '2026-03-12T17:00:00Z', [
        row({ date: new Date('2026-03-12T14:30:00Z'), action: 'Buy', quantity: 10 }),
      ]),
      statement('eod', 'TOS_ACCOUNT_STATEMENT', ['2026-03-12', '2026-03-12'], '2026-03-12T22:00:00Z', [
        row({ date: new Date('2026-03-12T14:30:00Z'), action: 'Buy', quantity: 10 }),
        row({ date: new Date('2026-03-12T19:00:00Z'), action: 'Sell', quantity: 10 }),
      ]),
    ])
    expect(selection.rowOrigins.every((origin) => origin.statementId === 'eod')).toBe(true)
    expect(selection.rows).toHaveLength(2)
  })

  test('TOS owns fills on overlapping days, but Transaction History still supplies non-fill events', () => {
    const selection = selectAccountLedgerRows([
      statement('th', 'SCHWAB_TRANSACTION_HISTORY', ['2026-03-01', '2026-03-20'], '2026-03-21', [
        row({ date: utcDay('2026-03-02'), action: 'Buy', quantity: 1 }),
        row({ date: utcDay('2026-03-12'), action: 'Buy', quantity: 10 }),
        row({ date: utcDay('2026-03-14'), action: 'Expired', quantity: -1, price: null, category: 'OPTION_LIFECYCLE' }),
      ]),
      statement('tos', 'TOS_ACCOUNT_STATEMENT', ['2026-03-10', '2026-03-31'], '2026-04-01', [
        row({ date: new Date('2026-03-12T14:30:00Z'), action: 'Buy', quantity: 10 }),
      ]),
    ])

    expect(
      selection.rows.map((r, i) => `${selection.rowOrigins[i].statementId}:${r.action}`),
    ).toEqual(['th:Buy', 'tos:Buy', 'th:Expired'])
    expect(selection.replacedRows).toBe(1)
  })

  test('falls back to the row span when a statement has no stored coverage', () => {
    const selection = selectAccountLedgerRows([
      statement('legacy', 'SCHWAB_TRANSACTION_HISTORY', null, '2026-01-01', [
        row({ date: utcDay('2026-02-01'), action: 'Buy', quantity: 1 }),
        row({ date: utcDay('2026-02-03'), action: 'Sell', quantity: 1 }),
      ]),
    ])
    expect(selection.rows).toHaveLength(2)
  })

  test('drops undated rows instead of guessing their position in time', () => {
    const undated = { ...row({ date: utcDay('2026-02-01'), action: 'Buy', quantity: 1 }), date: null }
    const selection = selectAccountLedgerRows([
      statement('s', 'SCHWAB_TRANSACTION_HISTORY', ['2026-02-01', '2026-02-01'], '2026-03-01', [undated]),
    ])
    expect(selection.rows).toHaveLength(0)
    expect(selection.undatedRows).toBe(1)
  })
})

describe('mapStoredRowToAnalyzedRow', () => {
  const base: BrokerStatementRow = {
    id: 'r1',
    statementImportId: 's1',
    rowIndex: 7,
    rawDate: '8/7/26 09:53:50',
    parsedDate: new Date('2026-08-07T13:53:50Z'),
    action: 'Sell to Close',
    symbol: 'ORCL 08/21/2026 150.00 C',
    description: 'SELL -1 TO CLOSE ORCL @4.54',
    quantityRaw: '-1',
    priceRaw: '4.54',
    feesRaw: '0.67',
    amountRaw: '454.00',
    quantity: new Prisma.Decimal(-1),
    price: new Prisma.Decimal('4.54'),
    fees: new Prisma.Decimal('0.67'),
    amount: new Prisma.Decimal(454),
    instrumentType: 'OPTION',
    actionCategory: 'OPTION_TRADE',
    isImportTradeRow: true,
    blocksCanonicalImport: false,
    notes: [],
    optionUnderlying: 'ORCL',
    optionExpiration: new Date('2026-08-21T00:00:00Z'),
    optionStrike: new Prisma.Decimal(150),
    optionType: 'CALL',
    optionQuantityContracts: new Prisma.Decimal(1),
    optionMultiplier: 100,
    underlyingEquivalentQty: new Prisma.Decimal(100),
    createdAt: new Date(),
  }

  test('restores option contracts and numeric fields from persisted rows', () => {
    const mapped = mapStoredRowToAnalyzedRow(base)
    expect(mapped).toMatchObject({
      rowIndex: 7,
      action: 'Sell to Close',
      quantity: -1,
      price: 4.54,
      fees: 0.67,
      instrumentType: 'OPTION',
      actionCategory: 'OPTION_TRADE',
      optionContract: {
        underlying: 'ORCL',
        expiration: '08/21/2026',
        strike: 150,
        optionType: 'CALL',
        quantityContracts: 1,
        multiplier: 100,
        underlyingEquivalentQty: 100,
      },
    })
  })

  test('maps unrecognized stored categories to UNKNOWN', () => {
    const mapped = mapStoredRowToAnalyzedRow({
      ...base,
      instrumentType: 'WIDGET',
      actionCategory: 'SOMETHING_NEW',
      optionUnderlying: null,
    })
    expect(mapped.instrumentType).toBe('UNKNOWN')
    expect(mapped.actionCategory).toBe('UNKNOWN')
    expect(mapped.optionContract).toBeNull()
  })
})
