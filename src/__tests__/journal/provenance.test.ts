import { traceTradeRows } from '@/lib/journal/provenance'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'
import { selectAccountLedgerRows, type LedgerStatementInput } from '@/lib/engine/account-ledger-rebuild'
import { analyzeSchwabStatement } from '@/lib/parser/schwab-statement-analyzer'

function statement(id: string, csv: string): LedgerStatementInput {
  const analyzed = analyzeSchwabStatement(csv)
  return { id, sourceFormat: 'SCHWAB_TRANSACTION_HISTORY', coverageFrom: null, coverageTo: null, createdAt: new Date('2026-01-01'), rows: analyzed.rows }
}
const header = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n'
const opening = statement('opening', header + '01/02/2026,Buy,SYN,Synthetic,10,$10.00,$0.00,($100.00)\n')
const closing = statement('closing', header + '01/05/2026,Sell,SYN,Synthetic,10,$12.00,$0.04,$119.96\n')

it('traces carry-in fills to their actual files, rather than the trade opening file', () => {
  const selection = selectAccountLedgerRows([opening, closing])
  const position = buildBrokerPositionLedger(selection.rows).positions[0]
  expect(position.fills).toHaveLength(2)
  const result = traceTradeRows([opening, closing], [], `opening:${opening.rows[0].rowIndex}`, position.fills)
  expect(result?.map(row => row.origin.statementId)).toEqual(['opening', 'closing'])
  expect(result?.[1].fill.fees).toBe(0.04)
})
it('refuses absent identities, changed fills, and source rows replaced by a newer overlapping statement', () => {
  const positions = buildBrokerPositionLedger(selectAccountLedgerRows([opening, closing]).rows).positions
  const key = `opening:${opening.rows[0].rowIndex}`
  expect(traceTradeRows([opening, closing], [], null, positions[0].fills)).toBeNull()
  expect(traceTradeRows([opening, closing], [], key, [])).toBeNull()
  expect(traceTradeRows([opening, closing], [], key, positions[0].fills.map(fill => ({ ...fill, fees: 99 })))).toBeNull()
  const newer = { ...opening, id: 'replacement', createdAt: new Date('2026-02-01') }
  expect(traceTradeRows([opening, closing, newer], [], key, positions[0].fills)).toBeNull()
})
