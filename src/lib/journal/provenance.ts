import { Prisma } from '@/generated/prisma'
import { selectAccountLedgerRows, LEGACY_EXECUTIONS_STATEMENT_ID, type LedgerStatementInput } from '@/lib/engine/account-ledger-rebuild'
import { buildBrokerPositionLedger, type BrokerLedgerFill } from '@/lib/engine/broker-position-ledger'

type StoredFill = Omit<BrokerLedgerFill, 'rowIndex' | 'posEffect' | 'kind'> & { posEffect: string; kind: string }
/** Match only the stable opening-row identity; never guess from price/date. */
export function traceTradeRows(statements: LedgerStatementInput[], legacyIds: string[], sourceKey: string | null, storedFills: StoredFill[]) {
  const selection = selectAccountLedgerRows(statements)
  const positions = buildBrokerPositionLedger(selection.rows).positions
  const matches = positions.filter(position => {
    const origin = selection.rowOrigins[position.openRows[0] ?? position.closeRows[0]]
    if (!origin) return false
    const key = origin.statementId === LEGACY_EXECUTIONS_STATEMENT_ID ? `exec:${legacyIds[origin.rowIndex]}` : `${origin.statementId}:${origin.rowIndex}`
    return key === sourceKey
  })
  if (matches.length !== 1) return null
  const position = matches[0]
  const equal = (left: number | null, right: number | null) => left == null || right == null ? left === right : new Prisma.Decimal(left).toDecimalPlaces(4).equals(new Prisma.Decimal(right).toDecimalPlaces(4))
  if (!storedFills.length || position.fills.length !== storedFills.length || position.fills.some((fill, index) => {
    const stored = storedFills[index]
    return fill.time.getTime() !== stored.time.getTime() || fill.kind !== stored.kind || fill.side !== stored.side || fill.posEffect !== stored.posEffect || !equal(fill.qty, stored.qty) || !equal(fill.price, stored.price) || !equal(fill.fees, stored.fees)
  })) return null
  return position.fills.map(fill => ({ fill, origin: selection.rowOrigins[fill.rowIndex] }))
}

export type ProvenanceView = {
  available: boolean; message: string; riskSource: string | null; inferredSetup: string | null; confidence: number | null; personalSetup: string | null
  rows: Array<{ statementId: string; fileName: string; sourceFormat: string; rowIndex: number; precision: string; feeSource: string; rawDate: string | null; action: string; quantityRaw: string | null; priceRaw: string | null; feesRaw: string | null; notes: string[]; time: string; kind: string; qty: number; price: number | null; fees: number }>
}
