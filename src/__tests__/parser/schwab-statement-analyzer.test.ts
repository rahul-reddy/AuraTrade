import { analyzeSchwabStatement } from '@/lib/parser/schwab-statement-analyzer'

function makeCsv(rows: string[]): string {
  const header = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount'
  return [header, ...rows].join('\n')
}

describe('analyzeSchwabStatement', () => {
  test('marks plain equity-only statements as importable', () => {
    const csv = makeCsv([
      '3/12/2026,Sell,RXRX,RECURSION PHARMACEUTICALS,500,"$3.23 ","$0.10 ","$1,614.90 "',
      '3/12/2026,Buy,NBIS,NEBIUS GROUP N V,10,"$107.23 ",,"($1,072.29)"',
      '3/11/2026,Sell Short,SPY,SPDR S&P 500 ETF,50,"$446.50 ","$0.12 ","$22,324.88 "',
    ])

    const dryRun = analyzeSchwabStatement(csv)

    expect(dryRun.importSupported).toBe(true)
    expect(dryRun.importableTradeRows).toBe(3)
    expect(dryRun.blockedTradeRows).toBe(0)
    expect(dryRun.positionAffectingNonTradeRows).toBe(0)
    expect(dryRun.optionRows).toBe(0)
    expect(dryRun.blockers).toHaveLength(0)
  })

  test('detects option actions and infers a 100x multiplier from statement cash flow', () => {
    const csv = makeCsv([
      '2/4/2026,Buy to Open,ORCL 08/21/2026 150.00 C,CALL ORACLE CORP $150 EXP 08/21/26,1,"$25.00 ","$0.66 ","($2,500.66)"',
      '2/4/2026,Sell to Open,ORCL 08/21/2026 150.00 C,CALL ORACLE CORP $150 EXP 08/21/26,1,"$25.17 ","$0.66 ","$2,516.34 "',
    ])

    const dryRun = analyzeSchwabStatement(csv)

    expect(dryRun.importSupported).toBe(false)
    expect(dryRun.blockedTradeRows).toBe(2)
    expect(dryRun.optionRows).toBe(2)
    expect(dryRun.blockers.some((blocker) => blocker.includes('option opening/closing'))).toBe(
      true,
    )
    expect(dryRun.rows[0].optionContract).toMatchObject({
      underlying: 'ORCL',
      expiration: '08/21/2026',
      strike: 150,
      optionType: 'CALL',
      quantityContracts: 1,
      multiplier: 100,
      underlyingEquivalentQty: 100,
    })
  })

  test('treats expired and journaled rows as position-affecting blockers', () => {
    const csv = makeCsv([
      '12/16/2024 as of 12/13/2024,Expired,RDFN 12/13/2024 11.50 C,CALL REDFIN CORP $11.5 EXP 12/13/24,-10,,,',
      '5/14/2024,Journaled Shares,CLSK,TDA TRAN - TRANSFER OF SECURITY OR OPTION OUT (CLSK),10,,,',
    ])

    const dryRun = analyzeSchwabStatement(csv)

    expect(dryRun.importSupported).toBe(false)
    expect(dryRun.positionAffectingNonTradeRows).toBe(2)
    expect(dryRun.blockers.some((blocker) => blocker.includes('expiration'))).toBe(true)
    expect(dryRun.blockers.some((blocker) => blocker.includes('transfer/journal'))).toBe(true)
    expect(dryRun.rows.map((row) => row.date?.toISOString())).toEqual([
      '2024-05-14T00:00:00.000Z',
      '2024-12-16T00:00:00.000Z',
    ])
  })

  test('treats empty-symbol journal mark-to-market rows as non-position cash entries', () => {
    const csv = makeCsv([
      '5/10/2024,Journaled Shares,,TDA TRAN - MARK TO THE MARKET,,,,$258.33',
      '5/10/2024,Journaled Shares,,TDA TRAN - MARK TO THE MARKET,,,,($258.33)',
    ])

    const dryRun = analyzeSchwabStatement(csv)

    expect(dryRun.importSupported).toBe(false)
    expect(dryRun.positionAffectingNonTradeRows).toBe(0)
    expect(dryRun.blockers).toHaveLength(0)
    expect(dryRun.rows[0]).toMatchObject({
      instrumentType: 'CASH',
      actionCategory: 'CASH_TRANSFER',
      blocksCanonicalImport: false,
    })
  })

  test('reverses newest-to-oldest statement rows so same-day sequencing is chronological', () => {
    const csv = makeCsv([
      '3/12/2026,Sell,SPY,SPDR S&P 500 ETF,50,"$450.00 ","$0.12 ","$22,499.88"',
      '3/12/2026,Buy,SPY,SPDR S&P 500 ETF,50,"$445.00 ",,"($22,250.00)"',
      '3/11/2026,Buy,NBIS,NEBIUS GROUP N V,10,"$107.23 ",,"($1,072.29)"',
    ])

    const dryRun = analyzeSchwabStatement(csv)

    expect(dryRun.rows.map((row) => `${row.action}:${row.symbol}`)).toEqual([
      'Buy:NBIS',
      'Buy:SPY',
      'Sell:SPY',
    ])
    expect(dryRun.rows.map((row) => row.rowIndex)).toEqual([0, 1, 2])
    expect(dryRun.assumptions.some((assumption) => assumption.includes('newest-to-oldest'))).toBe(
      true,
    )
  })
})
