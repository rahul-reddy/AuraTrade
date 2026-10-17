import { Prisma } from '@/generated/prisma'
import {
  mapBrokerPositionToTradeCreateInput,
  evaluateStatementImportSupport,
  shouldEnrichTrade,
  shouldLinkTradeToChart,
} from '@/lib/engine/broker-trade-importer'
import type { BrokerLedgerPosition } from '@/lib/engine/broker-position-ledger'
import { analyzeSchwabStatement } from '@/lib/parser/schwab-statement-analyzer'

function basePosition(
  overrides: Partial<BrokerLedgerPosition> = {},
): BrokerLedgerPosition {
  return {
    instrumentKey: 'EQUITY:SPY',
    instrumentType: 'EQUITY',
    symbol: 'SPY',
    side: 'LONG',
    totalQty: 50,
    closedQty: 50,
    remainingQty: 0,
    multiplier: 1,
    underlyingEquivalentQty: 50,
    entryPrice: 445,
    exitPrice: 450,
    grossPnl: 250,
    totalFees: 0.12,
    netPnl: 249.88,
    isOpen: false,
    openRows: [0],
    closeRows: [1],
    openingActions: ['Buy'],
    closingActions: ['Sell'],
    entryTime: new Date('2026-03-12T00:00:00.000Z'),
    exitTime: new Date('2026-03-12T00:00:00.000Z'),
    closeKind: 'TRADE',
    entryTradingDate: null,
    exitTradingDate: null,
    fills: [],
    ...overrides,
  }
}

describe('broker trade importer', () => {
  test('treats options, expirations, transfers, and stock mergers as supported under the ledger bridge', () => {
    const dryRun = analyzeSchwabStatement(
      [
        'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount',
        '2/4/2026,Buy to Open,ORCL 08/21/2026 150.00 C,CALL ORACLE CORP $150 EXP 08/21/26,1,$25.00 ,$0.66 ,($2,500.66)',
        '12/16/2024 as of 12/13/2024,Expired,RDFN 12/13/2024 11.50 C,CALL REDFIN CORP $11.5 EXP 12/13/24,-10,,,',
        '5/14/2024,Journaled Shares,CLSK,TDA TRAN - TRANSFER OF SECURITY OR OPTION OUT (CLSK),10,,,',
        '5/27/2025,Stock Merger,RKLB,ROCKET LAB CORP,300,,,',
      ].join('\n'),
    )

    expect(evaluateStatementImportSupport(dryRun)).toEqual({
      supported: true,
      reasons: [],
    })
  })

  test('blocks unknown broker actions from canonical import', () => {
    const dryRun = analyzeSchwabStatement(
      [
        'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount',
        '3/12/2026,Weird Action,ABC,UNKNOWN,10,$10.00 ,,($100.00)',
      ].join('\n'),
    )

    expect(evaluateStatementImportSupport(dryRun)).toEqual({
      supported: false,
      reasons: ['Unsupported broker action category: UNKNOWN'],
    })
  })

  test('maps equity ledger positions into canonical round-trip trade input', () => {
    const input = mapBrokerPositionToTradeCreateInput(
      'acct_1',
      'stmt_1',
      'pos_1',
      basePosition(),
    )

    expect(input).toMatchObject({
      accountId: 'acct_1',
      symbol: 'SPY',
      instrumentType: 'EQUITY',
      underlyingSymbol: null,
      direction: 'LONG',
      closeKind: 'TRADE',
      brokerStatementImportId: 'stmt_1',
      brokerStatementPositionId: 'pos_1',
      contractMultiplier: 1,
    })
    expect((input.entryPrice as Prisma.Decimal).toNumber()).toBeCloseTo(445)
    expect((input.netPnl as Prisma.Decimal).toNumber()).toBeCloseTo(249.88)
    expect((input.remainingQty as Prisma.Decimal).toNumber()).toBe(0)
    expect(input.durationSeconds).toBe(0)
  })

  test('maps option positions with parsed contract metadata', () => {
    const input = mapBrokerPositionToTradeCreateInput(
      'acct_1',
      'stmt_1',
      'pos_2',
      basePosition({
        instrumentKey: 'OPTION:RDFN 12/13/2024 11.50 C',
        instrumentType: 'OPTION',
        symbol: 'RDFN 12/13/2024 11.50 C',
        totalQty: 10,
        closedQty: 10,
        multiplier: 100,
        underlyingEquivalentQty: 1000,
        entryPrice: 0.06,
        exitPrice: 0,
        grossPnl: -60,
        totalFees: 6.61,
        netPnl: -66.61,
        closingActions: ['Expired'],
        closeKind: 'EXPIRATION',
      }),
    )

    expect(input).toMatchObject({
      symbol: 'RDFN 12/13/2024 11.50 C',
      instrumentType: 'OPTION',
      underlyingSymbol: 'RDFN',
      optionType: 'CALL',
      contractMultiplier: 100,
      closeKind: 'EXPIRATION',
    })
    expect((input.optionStrike as Prisma.Decimal).toNumber()).toBeCloseTo(11.5)
    expect((input.underlyingEquivalentQty as Prisma.Decimal).toNumber()).toBe(1000)
    expect((input.netPnl as Prisma.Decimal).toNumber()).toBeCloseTo(-66.61)
  })

  test('marks only equity trade-closed rows as chart/enrichment eligible', () => {
    expect(shouldEnrichTrade(basePosition())).toBe(true)
    expect(shouldLinkTradeToChart(basePosition())).toBe(true)

    const optionPosition = basePosition({
      instrumentType: 'OPTION',
      symbol: 'RDFN 12/13/2024 11.50 C',
    })
    expect(shouldEnrichTrade(optionPosition)).toBe(false)
    expect(shouldLinkTradeToChart(optionPosition)).toBe(false)

    const transferPosition = basePosition({ closeKind: 'TRANSFER' })
    expect(shouldEnrichTrade(transferPosition)).toBe(false)
    expect(shouldLinkTradeToChart(transferPosition)).toBe(false)
  })

  test('maps remaining quantity for open positions into canonical trade input', () => {
    const input = mapBrokerPositionToTradeCreateInput(
      'acct_1',
      'stmt_1',
      'pos_open',
      basePosition({
        symbol: 'AMD',
        totalQty: 350,
        closedQty: 108,
        remainingQty: 242,
        isOpen: true,
        exitPrice: null,
        grossPnl: null,
        netPnl: null,
        exitTime: null,
        closeKind: null,
      }),
    )

    expect((input.totalQty as Prisma.Decimal).toNumber()).toBe(350)
    expect((input.closedQty as Prisma.Decimal).toNumber()).toBe(108)
    expect((input.remainingQty as Prisma.Decimal).toNumber()).toBe(242)
  })
})
