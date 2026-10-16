import { Prisma, type BrokerStatementRow } from '@/generated/prisma'
import {
  evaluateAccountImport,
  findLegacyExecutionOverlap,
  mapStoredRowToAnalyzedRow,
  rebuildLedgerTradesForAccount,
  selectAccountLedgerRows,
  summarizeStatementImpact,
  tradingDateOf,
  type LedgerStatementInput,
} from '@/lib/engine/account-ledger-rebuild'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'
import { evaluateStatementImportSupport } from '@/lib/engine/broker-trade-importer'
import { analyzeSchwabStatement } from '@/lib/parser/schwab-statement-analyzer'
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

describe('date-only expirations next to timestamped fills', () => {
  const contract = {
    underlying: 'ORCL',
    expiration: '03/20/2026',
    strike: 150,
    optionType: 'CALL' as const,
    quantityContracts: 2,
    multiplier: 100,
    underlyingEquivalentQty: 200,
  }
  const optionRow = (args: { date: Date; action: string; quantity: number; price: number | null; fees?: number; category: StatementActionCategory }) => ({
    ...row({ ...args, symbol: 'ORCL 03/20/2026 150.00 C' }),
    instrumentType: 'OPTION' as const,
    optionContract: contract,
  })

  test('a contract bought on expiration day (TOS) expires after the fill, realizing the full loss', () => {
    const selection = selectAccountLedgerRows([
      // Transaction History covering the day supplies the expiration (date-only).
      statement('th', 'SCHWAB_TRANSACTION_HISTORY', ['2026-03-20', '2026-03-20'], '2026-03-21', [
        optionRow({ date: utcDay('2026-03-20'), action: 'Expired', quantity: -2, price: null, category: 'OPTION_LIFECYCLE' }),
      ]),
      // TOS owns that day's fills: bought 2 contracts at 10:15 ET for $0.40.
      statement('tos', 'TOS_ACCOUNT_STATEMENT', ['2026-03-20', '2026-03-20'], '2026-03-21', [
        optionRow({ date: new Date('2026-03-20T14:15:00Z'), action: 'Buy to Open', quantity: 2, price: 0.4, fees: 1.3, category: 'OPTION_TRADE' }),
      ]),
    ])

    expect(selection.rows.map((r) => r.action)).toEqual(['Buy to Open', 'Expired'])
    // 23:59:59.999 America/New_York on 3/20 (EDT, UTC-4)
    expect(selection.rows[1].date?.toISOString()).toBe('2026-03-21T03:59:59.999Z')

    const ledger = buildBrokerPositionLedger(selection.rows)
    expect(ledger.warnings).toEqual([])
    expect(ledger.positions).toHaveLength(1)
    const [position] = ledger.positions
    expect(position).toMatchObject({ isOpen: false, closeKind: 'EXPIRATION' })
    // (0 − 0.40) × 2 contracts × 100 − 1.30
    expect(position.netPnl).toBeCloseTo(-81.3, 10)
  })

  test('leaves date-only fills and non-expiration events at their stored date', () => {
    const selection = selectAccountLedgerRows([
      statement('th', 'SCHWAB_TRANSACTION_HISTORY', ['2026-03-20', '2026-03-20'], '2026-03-21', [
        row({ date: utcDay('2026-03-20'), action: 'Buy', quantity: 1 }),
        row({ date: utcDay('2026-03-20'), action: 'Journaled Shares', quantity: 1, price: null, category: 'POSITION_TRANSFER' }),
      ]),
    ])
    expect(selection.rows.map((r) => r.date?.toISOString())).toEqual([
      '2026-03-20T00:00:00.000Z',
      '2026-03-20T00:00:00.000Z',
    ])
  })
})

describe('summarizeStatementImpact', () => {
  test('credits a close-only statement with the carry-in trade it completes', () => {
    const selection = selectAccountLedgerRows([
      statement('opens', 'TOS_ACCOUNT_STATEMENT', ['2026-03-01', '2026-03-12'], '2026-03-13', [
        row({ date: new Date('2026-03-10T14:00:00Z'), action: 'Buy', quantity: 10, price: 50 }),
      ]),
      statement('closes', 'TOS_ACCOUNT_STATEMENT', ['2026-03-13', '2026-03-31'], '2026-04-01', [
        row({ date: new Date('2026-03-20T14:00:00Z'), action: 'Sell', quantity: 10, price: 55, fees: 0.05 }),
      ]),
    ])
    const ledger = buildBrokerPositionLedger(selection.rows)

    const closes = summarizeStatementImpact(selection, ledger, 'closes')
    // (55 − 50) × 10 − 0.05
    expect(closes).toMatchObject({ closedTradeLikePositions: 1, openPositions: 0, warnings: [] })
    expect(closes.estimatedPnl).toBeCloseTo(49.95, 10)

    // The same position also belongs to the statement that opened it.
    expect(summarizeStatementImpact(selection, ledger, 'opens').closedTradeLikePositions).toBe(1)
    expect(summarizeStatementImpact(selection, ledger, 'unrelated').closedTradeLikePositions).toBe(0)
  })

  test('reports only warnings raised on its own rows', () => {
    const selection = selectAccountLedgerRows([
      statement('a', 'TOS_ACCOUNT_STATEMENT', ['2026-03-01', '2026-03-12'], '2026-03-13', [
        row({ date: new Date('2026-03-10T14:00:00Z'), action: 'Sell', symbol: 'ORPHAN', quantity: 5 }),
      ]),
      statement('b', 'TOS_ACCOUNT_STATEMENT', ['2026-03-13', '2026-03-31'], '2026-04-01', [
        row({ date: new Date('2026-03-20T14:00:00Z'), action: 'Buy', quantity: 1 }),
      ]),
    ])
    const ledger = buildBrokerPositionLedger(selection.rows)
    expect(summarizeStatementImpact(selection, ledger, 'a').warnings).toEqual([
      'Orphaned close on EQUITY:ORPHAN: no open position found for Sell.',
    ])
    expect(summarizeStatementImpact(selection, ledger, 'b').warnings).toEqual([])
  })
})

describe('rebuildLedgerTradesForAccount ownership', () => {
  test('reads only confirmed statements and never deletes Execution-backed trades', async () => {
    const findStatements = jest.fn().mockResolvedValue([])
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 })
    const tx = {
      brokerStatementImport: { findMany: findStatements },
      roundTripTrade: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany,
        createMany: jest.fn(),
      },
    } as unknown as Prisma.TransactionClient

    const result = await rebuildLedgerTradesForAccount(tx, 'acct_1', { impactFor: 'stmt_1' })

    expect(findStatements).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acct_1', confirmedAt: { not: null } } }),
    )
    // Legacy trades have brokerStatementImportId = null and must survive.
    expect(deleteMany).toHaveBeenCalledTimes(1)
    expect(deleteMany).toHaveBeenCalledWith({
      where: { accountId: 'acct_1', brokerStatementImportId: { not: null } },
    })
    expect(result.impact).toMatchObject({ closedTradeLikePositions: 0, openPositions: 0 })
  })
})

describe('findLegacyExecutionOverlap', () => {
  const coverage = { from: utcDay('2026-03-13'), to: utcDay('2026-03-31') }

  test('returns null when no legacy executions fall in the coverage window', async () => {
    const count = jest.fn().mockResolvedValue(0)
    const db = { execution: { count, findFirst: jest.fn() } } as unknown as Prisma.TransactionClient
    expect(await findLegacyExecutionOverlap(db, 'acct_1', coverage)).toBeNull()
    // The window includes the whole last coverage day.
    expect(count).toHaveBeenCalledWith({
      where: {
        accountId: 'acct_1',
        execTime: { gte: utcDay('2026-03-13'), lt: utcDay('2026-04-01') },
      },
    })
  })

  test('reports the count and span of overlapping legacy executions', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ execTime: utcDay('2026-03-14') })
      .mockResolvedValueOnce({ execTime: utcDay('2026-03-20') })
    const db = {
      execution: { count: jest.fn().mockResolvedValue(3), findFirst },
    } as unknown as Prisma.TransactionClient
    expect(await findLegacyExecutionOverlap(db, 'acct_1', coverage)).toEqual({
      count: 3,
      first: utcDay('2026-03-14'),
      last: utcDay('2026-03-20'),
    })
  })
})

describe('evaluateAccountImport', () => {
  const header = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount'
  const csv = (rows: string[]) => [header, ...rows].join('\n')

  function decide(earlier: string[], followUp: string[], legacyOverlap: Parameters<typeof evaluateAccountImport>[0]['legacyOverlap'] = null) {
    const first = analyzeSchwabStatement(csv(earlier))
    const second = analyzeSchwabStatement(csv(followUp))
    const selection = selectAccountLedgerRows([
      { id: 'earlier', sourceFormat: 'SCHWAB_TRANSACTION_HISTORY', coverageFrom: first.coverage?.from ?? null, coverageTo: first.coverage?.to ?? null, createdAt: new Date('2026-01-01'), rows: first.rows },
      { id: 'followUp', sourceFormat: 'SCHWAB_TRANSACTION_HISTORY', coverageFrom: second.coverage?.from ?? null, coverageTo: second.coverage?.to ?? null, createdAt: new Date('2026-02-01'), rows: second.rows },
    ])
    const ledger = buildBrokerPositionLedger(selection.rows)
    return {
      ledger,
      decision: evaluateAccountImport({
        dryRun: second,
        impact: summarizeStatementImpact(selection, ledger, 'followUp'),
        supportReasons: evaluateStatementImportSupport(second).reasons,
        legacyOverlap,
      }),
    }
  }

  const openCall = '2/04/2026,Buy to Open,ORCL 02/20/2026 150.00 C,CALL ORACLE CORP $150 EXP 02/20/26,1,"$2.00 ","$0.66 ","($200.66)"'

  test('an expiration-only follow-up statement imports and closes the earlier option', () => {
    const { ledger, decision } = decide(
      [openCall],
      ['2/23/2026 as of 2/20/2026,Expired,ORCL 02/20/2026 150.00 C,CALL ORACLE CORP $150 EXP 02/20/26,-1,,,'],
    )
    expect(decision).toMatchObject({ canImport: true, ledgerRows: 1, touchedPositions: 1, blockers: [] })
    expect(ledger.warnings).toEqual([])
    expect(ledger.positions[0]).toMatchObject({ isOpen: false, closeKind: 'EXPIRATION' })
    // (0 − 2.00) × 1 contract × 100 − 0.66
    expect(ledger.positions[0].netPnl).toBeCloseTo(-200.66, 10)
  })

  test('a transfer-only follow-up statement imports and closes the earlier position', () => {
    const { ledger, decision } = decide(
      ['2/04/2026,Buy,CLSK,CLEANSPARK INC,10,"$10.00 ",,"($100.00)"'],
      ['2/10/2026,Journaled Shares,CLSK,TDA TRAN - TRANSFER OF SECURITY OR OPTION OUT (CLSK),10,,,'],
    )
    expect(decision).toMatchObject({ canImport: true, ledgerRows: 1, touchedPositions: 1 })
    expect(ledger.positions[0]).toMatchObject({ isOpen: false, closeKind: 'TRANSFER' })
  })

  test('a statement that touches no position cannot be imported', () => {
    const { decision } = decide([openCall], ['2/10/2026,Credit Interest,,SCHWAB1 INT,,,,"$0.88 "'])
    expect(decision).toMatchObject({ canImport: false, ledgerRows: 0, touchedPositions: 0 })
  })

  test('unknown broker actions and legacy overlaps block import with a reason', () => {
    const unknown = decide([openCall], ['2/10/2026,Mystery Action,ORCL,SOMETHING,1,"$1.00 ",,"$1.00 "'])
    expect(unknown.decision.canImport).toBe(false)
    expect(unknown.decision.blockers).toEqual(['Unsupported broker action category: UNKNOWN'])

    const overlap = decide([], [openCall], {
      count: 4,
      first: utcDay('2026-02-03'),
      last: utcDay('2026-02-05'),
    })
    expect(overlap.decision.canImport).toBe(false)
    expect(overlap.decision.blockers[0]).toContain('4 fill(s) from the older import path between 2026-02-03 and 2026-02-05')
  })
})
