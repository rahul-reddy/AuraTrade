import { analyzeSchwabStatement } from '@/lib/parser/schwab-statement-analyzer'
import {
  buildBrokerPositionLedger,
  summarizeBrokerLedger,
} from '@/lib/engine/broker-position-ledger'

function makeCsv(rows: string[]): string {
  const header = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount'
  return [header, ...rows].join('\n')
}

describe('buildBrokerPositionLedger', () => {
  test('tracks long option contracts in contracts and closes them on expiration at zero', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '11/21/2024,Buy to Open,RDFN 12/13/2024 11.50 C,CALL REDFIN CORP $11.5 EXP 12/13/24,10,$0.06 ,$6.61 ,($66.61)',
        '12/16/2024 as of 12/13/2024,Expired,RDFN 12/13/2024 11.50 C,CALL REDFIN CORP $11.5 EXP 12/13/24,-10,,,',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toHaveLength(1)

    const position = result.positions[0]
    expect(position.instrumentType).toBe('OPTION')
    expect(position.instrumentKey).toBe('OPTION:RDFN 12/13/2024 11.50 C')
    expect(position.side).toBe('LONG')
    expect(position.totalQty).toBe(10)
    expect(position.multiplier).toBe(100)
    expect(position.underlyingEquivalentQty).toBe(1000)
    expect(position.closeKind).toBe('EXPIRATION')
    expect(position.isOpen).toBe(false)
    expect(position.entryPrice).toBeCloseTo(0.06)
    expect(position.exitPrice).toBeCloseTo(0)
    expect(position.grossPnl).toBeCloseTo(-60)
    expect(position.netPnl).toBeCloseTo(-66.61)
  })

  test('matches short option opens and buy-to-close exits using contracts, not shares', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '11/19/2024,Sell to Open,RDFN 12/20/2024 9.50 C,CALL REDFIN CORP $9.5 EXP 12/20/24,10,$0.26 ,$6.65 ,$255.35',
        '11/20/2024,Buy to Close,RDFN 12/20/2024 9.50 C,CALL REDFIN CORP $9.5 EXP 12/20/24,10,$0.10 ,$6.61 ,($106.61)',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toHaveLength(1)

    const position = result.positions[0]
    expect(position.instrumentType).toBe('OPTION')
    expect(position.side).toBe('SHORT')
    expect(position.totalQty).toBe(10)
    expect(position.multiplier).toBe(100)
    expect(position.underlyingEquivalentQty).toBe(1000)
    expect(position.closeKind).toBe('TRADE')
    expect(position.entryPrice).toBeCloseTo(0.26)
    expect(position.exitPrice).toBeCloseTo(0.1)
    expect(position.grossPnl).toBeCloseTo(160)
    expect(position.netPnl).toBeCloseTo(146.74)
  })

  test('treats journaled transfer-out rows as position exits without realized pnl', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '5/10/2024,Buy,CLSK,CLEANSPARK INC,500,$20.00 ,,($10,000.00)',
        '5/13/2024,Journaled Shares,CLSK,TDA TRAN - TRANSFER OF SECURITY OR OPTION OUT (CLSK),-500,,,',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toHaveLength(1)

    const position = result.positions[0]
    expect(position.instrumentType).toBe('EQUITY')
    expect(position.side).toBe('LONG')
    expect(position.totalQty).toBe(500)
    expect(position.closeKind).toBe('TRANSFER')
    expect(position.isOpen).toBe(false)
    expect(position.grossPnl).toBeNull()
    expect(position.netPnl).toBeNull()
  })

  test('handles explicit buy-to-cover rows as short equity closes', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '3/11/2026,Sell Short,SPY,SPDR S&P 500 ETF,50,$446.50 ,$0.12 ,$22,324.88',
        '3/12/2026,Buy to Cover,SPY,TDA TRAN - Bought to Cover 50 (SPY) @441.2000,50,$441.20 ,,($22,060.00)',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toHaveLength(1)

    const position = result.positions[0]
    expect(position.instrumentType).toBe('EQUITY')
    expect(position.side).toBe('SHORT')
    expect(position.closeKind).toBe('TRADE')
    expect(position.grossPnl).toBeCloseTo(265)
    expect(position.netPnl).toBeCloseTo(264.88)
  })

  test('summarizes realized vs transferred vs open positions for dry-run previews', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '11/21/2024,Buy to Open,RDFN 12/13/2024 11.50 C,CALL REDFIN CORP $11.5 EXP 12/13/24,10,$0.06 ,$6.61 ,($66.61)',
        '12/16/2024 as of 12/13/2024,Expired,RDFN 12/13/2024 11.50 C,CALL REDFIN CORP $11.5 EXP 12/13/24,-10,,,',
        '5/10/2024,Buy,CLSK,CLEANSPARK INC,500,$20.00 ,,($10,000.00)',
        '5/13/2024,Journaled Shares,CLSK,TDA TRAN - TRANSFER OF SECURITY OR OPTION OUT (CLSK),-500,,,',
        '3/11/2026,Sell Short,SPY,SPDR S&P 500 ETF,50,$446.50 ,$0.12 ,$22,324.88',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)
    const summary = summarizeBrokerLedger(result)

    expect(summary.closedTradeLikePositions).toBe(1)
    expect(summary.transferredPositions).toBe(1)
    expect(summary.openPositions).toBe(1)
    expect(summary.estimatedPnl).toBeCloseTo(-66.61)
  })

  test('treats plain buy against an open short as cover-first then long-open remainder', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '3/11/2026,Sell Short,SPY,SPDR S&P 500 ETF,50,$446.50 ,$0.12 ,$22,324.88',
        '3/12/2026,Buy,SPY,SPDR S&P 500 ETF,70,$441.20 ,,($30,884.00)',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toHaveLength(2)

    const closedShort = result.positions[0]
    const openLong = result.positions[1]

    expect(closedShort.side).toBe('SHORT')
    expect(closedShort.isOpen).toBe(false)
    expect(closedShort.closedQty).toBe(50)
    expect(closedShort.grossPnl).toBeCloseTo(265)

    expect(openLong.side).toBe('LONG')
    expect(openLong.isOpen).toBe(true)
    expect(openLong.totalQty).toBe(20)
    expect(openLong.closedQty).toBe(0)
  })

  test('treats sell-short against an open long as close-first then short-open remainder', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '3/11/2026,Buy,TSLA,TESLA INC,100,$250.00 ,,($25,000.00)',
        '3/12/2026,Sell Short,TSLA,TESLA INC,150,$255.00 ,$0.15 ,$38,249.85',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toHaveLength(2)

    const closedLong = result.positions[0]
    const openShort = result.positions[1]

    expect(closedLong.side).toBe('LONG')
    expect(closedLong.isOpen).toBe(false)
    expect(closedLong.closedQty).toBe(100)
    expect(closedLong.grossPnl).toBeCloseTo(500)

    expect(openShort.side).toBe('SHORT')
    expect(openShort.isOpen).toBe(true)
    expect(openShort.totalQty).toBe(50)
    expect(openShort.closedQty).toBe(0)
  })

  test('uses reversed chronological statement order to avoid same-day orphaned closes', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '3/12/2026,Sell,SPY,SPDR S&P 500 ETF,50,$450.00 ,$0.12 ,$22,499.88',
        '3/12/2026,Buy,SPY,SPDR S&P 500 ETF,50,$445.00 ,,($22,250.00)',
        '3/11/2026,Buy,NBIS,NEBIUS GROUP N V,10,$107.23 ,,($1,072.29)',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toHaveLength(2)
    expect(result.positions[1]).toMatchObject({
      instrumentType: 'EQUITY',
      side: 'LONG',
      isOpen: false,
      totalQty: 50,
      closedQty: 50,
    })
    expect(result.positions[1].grossPnl).toBeCloseTo(250)
  })

  test('treats stock merger rows as transfer-style position moves, not realized pnl', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '5/24/2025,Buy,RKLB,ROCKET LAB CORP,300,$20.00 ,,($6,000.00)',
        '5/27/2025,Stock Merger,773122106,ROCKET LAB USA INC XXXNAME CHANGE EFF: 05/27/25,-300,,,',
        '5/27/2025,Stock Merger,RKLB,ROCKET LAB CORP,300,,,',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toHaveLength(2)

    expect(result.positions[0]).toMatchObject({
      symbol: 'RKLB',
      closeKind: 'TRANSFER',
      isOpen: false,
      grossPnl: null,
      netPnl: null,
    })
    expect(result.positions[1]).toMatchObject({
      symbol: 'RKLB',
      isOpen: true,
      totalQty: 300,
      closedQty: 0,
    })
  })

  test('resolves stock merger close rows through same-day paired merger symbol when qty alone is ambiguous', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '5/24/2025,Buy,RKLB,ROCKET LAB USA INC,300,$20.00 ,,($6,000.00)',
        '5/24/2025,Buy,AAPL,APPLE INC,300,$180.00 ,,($54,000.00)',
        '5/27/2025,Stock Merger,773122106,ROCKET LAB USA INC XXXNAME CHANGE EFF: 05/27/25,-300,,,',
        '5/27/2025,Stock Merger,RKLB,ROCKET LAB CORP,300,,,',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toHaveLength(3)

    expect(result.positions[0]).toMatchObject({
      symbol: 'RKLB',
      closeKind: 'TRANSFER',
      isOpen: false,
    })
    expect(result.positions[1]).toMatchObject({
      symbol: 'AAPL',
      isOpen: true,
      totalQty: 300,
    })
    expect(result.positions[2]).toMatchObject({
      symbol: 'RKLB',
      isOpen: true,
      totalQty: 300,
    })
  })

  test('allows simultaneous long and short option legs on the same contract when broker actions are explicit', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '2/4/2026,Sell to Open,ORCL 08/21/2026 150.00 C,CALL ORACLE CORP $150 EXP 08/21/26,1,$25.17 ,$0.66 ,$2,516.34',
        '2/4/2026,Buy to Open,ORCL 08/21/2026 150.00 C,CALL ORACLE CORP $150 EXP 08/21/26,1,$25.00 ,$0.66 ,($2,500.66)',
        '2/4/2026,Buy to Close,ORCL 08/21/2026 150.00 C,CALL ORACLE CORP $150 EXP 08/21/26,1,$24.72 ,$0.66 ,($2,472.66)',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toHaveLength(2)

    expect(result.positions[0]).toMatchObject({
      instrumentType: 'OPTION',
      side: 'SHORT',
      isOpen: false,
      totalQty: 1,
      closedQty: 1,
      closeKind: 'TRADE',
    })
    expect(result.positions[1]).toMatchObject({
      instrumentType: 'OPTION',
      side: 'LONG',
      isOpen: true,
      totalQty: 1,
      closedQty: 0,
    })
  })

  test('prioritizes same-day equity opens before same-day sells when reverse-chronological files would otherwise create an orphaned close', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '3/12/2026,Buy,NBIS,NEBIUS GROUP N V,10,$107.23 ,,($1,072.29)',
        '5/11/2023,Buy,ENTG,TDA TRAN - Bought 50 (ENTG) @92.1850,50,$92.19 ,,($4,609.50)',
        '5/11/2023,Sell,ENTG,TDA TRAN - Sold 50 (ENTG) @92.5638,50,$92.56 ,$0.02 ,$4,627.98',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: 'ENTG',
          isOpen: false,
          totalQty: 50,
          closedQty: 50,
          closeKind: 'TRADE',
        }),
      ]),
    )
  })

  test('nets same-day equity buys before same-day sells for large date-only batches instead of leaving a false open swing position', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '3/12/2026,Buy,NBIS,NEBIUS GROUP N V,10,$107.23 ,,($1,072.29)',
        '7/14/2023,Buy,IOT,TDA TRAN - Bought 4200 (IOT) @28.7600,4200,$28.76 ,,($120,792.00)',
        '7/14/2023,Buy,IOT,TDA TRAN - Bought ...500 (IOT) @28.7300,500,$28.73 ,,($14,365.00)',
        '7/14/2023,Buy,IOT,TDA TRAN - Bought ...200 (IOT) @28.7200,200,$28.72 ,,($5,744.00)',
        '7/14/2023,Buy,IOT,TDA TRAN - Bought ...100 (IOT) @28.7000,100,$28.70 ,,($2,870.00)',
        '7/14/2023,Sell,IOT,TDA TRAN - Sold 5000 (IOT) @28.7612,5000,$28.76 ,$0.90 ,$143,799.10',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)
    const iotPositions = result.positions.filter((position) => position.symbol === 'IOT')

    expect(result.warnings).toHaveLength(0)
    expect(iotPositions).toHaveLength(1)
    expect(iotPositions[0]).toMatchObject({
      symbol: 'IOT',
      isOpen: false,
      totalQty: 5000,
      closedQty: 5000,
      closeKind: 'TRADE',
    })
  })

  test('tracks remaining quantity separately from peak quantity for partially trimmed open positions', () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '12/11/2024,Buy,AMD,ADVANCED MICRO DEVICE IN,100,$129.56 ,,($12,956.00)',
        '12/12/2024,Buy,AMD,ADVANCED MICRO DEVICE IN,250,$128.00 ,,($32,000.00)',
        '12/13/2024,Sell,AMD,ADVANCED MICRO DEVICE IN,108,$130.00 ,$0.02 ,$14,039.98',
      ]),
    )

    const result = buildBrokerPositionLedger(dryRun.rows)

    expect(result.warnings).toHaveLength(0)
    expect(result.positions).toHaveLength(1)
    expect(result.positions[0]).toMatchObject({
      symbol: 'AMD',
      isOpen: true,
      totalQty: 350,
      closedQty: 108,
      remainingQty: 242,
    })
  })
})
