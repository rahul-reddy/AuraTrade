import { analyzeApiCsv, transactionsToCsv } from '@/lib/brokers/schwab/transactions'
import { seal, unseal } from '@/lib/brokers/schwab/crypto'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'
import { evaluateStatementImportSupport } from '@/lib/engine/broker-trade-importer'
import { selectAccountLedgerRows } from '@/lib/engine/account-ledger-rebuild'

const day = '2026-10-19'
function trade(id: number, amount = 10, price = 100, fee = 0, positionEffect = 'OPENING') {
  return { activityId: id, type: 'TRADE', status: 'VALID', time: `${day}T14:${id === 1 ? '30' : '45'}:00Z`, tradeDate: `${day}T04:00:00Z`, netAmount: -amount * price - fee,
    transferItems: [
      { instrument: { assetType: 'CURRENCY', symbol: 'CURRENCY_USD' }, amount: fee, cost: -fee, feeType: 'COMMISSION' },
      { instrument: { assetType: 'EQUITY', symbol: 'SYN' }, amount, cost: -amount * price, price, positionEffect },
    ] }
}

describe('Schwab conservative transaction adapter', () => {
  test('orders repeated responses deterministically and reads broker fees into the existing ledger', () => {
    const buy = trade(1)
    const sell = trade(2, -10, 110, 0.17, 'CLOSING')
    const csv = transactionsToCsv([sell, buy, buy], day)
    expect(csv).toBe(transactionsToCsv([buy, sell], day))
    const dryRun = analyzeApiCsv(csv, day)
    expect(dryRun.totalRows).toBe(2)
    expect(dryRun.rows.map(r => r.fees)).toEqual([0, 0.17])
    expect(evaluateStatementImportSupport(dryRun).supported).toBe(true)
    const ledger = buildBrokerPositionLedger(dryRun.rows)
    expect(ledger.positions).toHaveLength(1)
    expect(ledger.positions[0].netPnl).toBeCloseTo(99.83, 8)
    expect(dryRun.sourceFormat).toBe('SCHWAB_API')
  })
  test('explicit short opening and cover remain short trades', () => {
    const csv = transactionsToCsv([trade(1, -10, 100, 0.05), trade(2, 10, 90, 0, 'CLOSING')], day)
    const dryRun = analyzeApiCsv(csv, day)
    expect(evaluateStatementImportSupport(dryRun).supported).toBe(true)
    expect(buildBrokerPositionLedger(dryRun.rows).positions[0]).toMatchObject({ side: 'SHORT', netPnl: 99.95, isOpen: false })
  })
  test.each(['OPTION', 'FUTURE', 'UNKNOWN'])('blocks unsupported %s assets', asset => {
    const tx = trade(1); tx.transferItems[1].instrument.assetType = asset
    expect(() => transactionsToCsv([tx], day)).toThrow(/unsupported|ambiguous/)
  })
  test.each(['RECEIVE_AND_DELIVER', 'JOURNAL', 'MEMORANDUM', 'NEW_EVENT'])('blocks %s instead of ignoring position changes', type => {
    expect(() => transactionsToCsv([{ ...trade(1), type }], day)).toThrow()
  })
  test('blocks missing fees, missing price, unknown status, cross-day transactions and conflicting duplicate IDs', () => {
    const tx = trade(1)
    expect(() => transactionsToCsv([{ ...tx, transferItems: [tx.transferItems[1]] }], day)).toThrow()
    expect(() => transactionsToCsv([{ ...tx, status: 'REVERSED' }], day)).toThrow()
    expect(() => transactionsToCsv([tx], '2026-10-18')).toThrow()
    expect(() => transactionsToCsv([tx, { ...tx, netAmount: -2000 }], day)).toThrow()
    expect(() => transactionsToCsv([{ ...tx, netAmount: -1001 }], day)).toThrow()
    expect(() => transactionsToCsv([{ ...tx, netAmount: -1000.01 }], day)).toThrow()
    expect(() => transactionsToCsv([{ ...tx, transferItems: [{ ...tx.transferItems[1], price: undefined }, tx.transferItems[0]] }], day)).toThrow()
  })
  test('blocks non-USD fees, fee layout ambiguity and truncated-size responses', () => {
    const tx = trade(1)
    expect(() => transactionsToCsv([{ ...tx, transferItems: [{ ...tx.transferItems[0], instrument: { assetType: 'CURRENCY', symbol: 'CURRENCY_EUR' } }, tx.transferItems[1]] }], day)).toThrow()
    expect(() => transactionsToCsv([{ ...tx, transferItems: [tx.transferItems[0], tx.transferItems[0], tx.transferItems[1]] }], day)).toThrow()
    expect(() => transactionsToCsv(Array.from({ length: 3000 }, () => tx), day)).toThrow()
  })
  test('ignores recognized cash-only income but blocks security-bearing income', () => {
    const tx = trade(1)
    expect(analyzeApiCsv(transactionsToCsv([{ ...tx, type: 'DIVIDEND_OR_INTEREST', transferItems: [tx.transferItems[0]] }], day), day).rows).toHaveLength(0)
    expect(() => transactionsToCsv([{ ...tx, type: 'DIVIDEND_OR_INTEREST' }], day)).toThrow()
  })
  test('API overlap owns a trading day once and timestamped TOS fills still take precedence', () => {
    const rows = analyzeApiCsv(transactionsToCsv([trade(1), trade(2, -10, 110, 0.17, 'CLOSING')], day), day).rows
    const base = { coverageFrom: new Date(day), coverageTo: new Date(day), rows, sourceFormat: 'SCHWAB_API' as const }
    const old = { ...base, id: 'old', createdAt: new Date('2026-10-19') }
    const fresh = { ...base, id: 'fresh', createdAt: new Date('2026-10-20') }
    // A NEWER mid-session CSV contains only the opening buy. Format priority,
    // not creation time, must keep the complete API day including its close.
    const partialCsv = { ...base, id: 'partial-csv', createdAt: new Date('2026-10-21'), sourceFormat: 'SCHWAB_TRANSACTION_HISTORY' as const, rows: rows.slice(0, 1) }
    const selected = selectAccountLedgerRows([old, fresh, partialCsv])
    expect(selected.rows).toHaveLength(2)
    expect(selected.rowOrigins.map(r => r.statementId)).toEqual(['fresh', 'fresh'])
    expect(buildBrokerPositionLedger(selected.rows).positions[0]).toMatchObject({ isOpen: false, netPnl: 99.83 })
    // Even an OLDER timestamped TOS statement must outrank newer API snapshots.
    const tos = { ...old, id: 'tos', sourceFormat: 'TOS_ACCOUNT_STATEMENT' as const, rows: rows.map((r, i) => ({ ...r, date: new Date(`${day}T14:${i ? '45' : '30'}:00Z`) })) }
    expect(selectAccountLedgerRows([fresh, tos, partialCsv]).rowOrigins.map(r => r.statementId)).toEqual(['tos', 'tos'])
  })
  test('API fills never erase lifecycle events supplied by transaction-history statements', () => {
    const rows = analyzeApiCsv(transactionsToCsv([trade(1)], day), day).rows
    const coverage = { coverageFrom: new Date(day), coverageTo: new Date(day), createdAt: new Date(day) }
    const history = { ...coverage, id: 'history', sourceFormat: 'SCHWAB_TRANSACTION_HISTORY' as const, rows: [{ ...rows[0], action: 'Journaled Shares', actionCategory: 'POSITION_TRANSFER' as const, isImportTradeRow: false }] }
    const api = { ...coverage, id: 'api', sourceFormat: 'SCHWAB_API' as const, rows }
    const selected = selectAccountLedgerRows([history, api])
    expect(selected.rows).toHaveLength(2)
    expect(selected.rowOrigins.map(r => r.statementId).sort()).toEqual(['api', 'history'])
  })
  test('excess precision is rejected before database rounding can alter a fill', () => {
    expect(() => transactionsToCsv([trade(1, 1.00001)], day)).toThrow()
    expect(() => transactionsToCsv([trade(1, 1, 10.00001)], day)).toThrow()
  })
})

describe('Schwab encrypted storage', () => {
  beforeEach(() => { process.env.SCHWAB_TOKEN_KEY = 'ab'.repeat(32) })
  test('authenticates user, purpose and ciphertext; encrypts with a fresh nonce', () => {
    const value = { access_token: 'synthetic-token' }
    const encrypted = seal('owner', 'tokens', value)
    expect(encrypted).not.toContain('synthetic-token')
    expect(unseal('owner', 'tokens', encrypted)).toEqual(value)
    expect(seal('owner', 'tokens', value)).not.toBe(encrypted)
    expect(() => unseal('other', 'tokens', encrypted)).toThrow()
    expect(() => unseal('owner', 'preview', encrypted)).toThrow()
    const [iv, tag, data] = encrypted.split('.')
    expect(() => unseal('owner', 'tokens', `${iv}.${tag}.${data.slice(0, -3)}AAA`)).toThrow()
  })
  test('fails closed with absent encryption key', () => {
    delete process.env.SCHWAB_TOKEN_KEY
    expect(() => seal('owner', 'tokens', {})).toThrow(/not configured/)
  })
})
