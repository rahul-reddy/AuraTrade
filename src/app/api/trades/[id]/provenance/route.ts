import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { mapStoredRowToAnalyzedRow, mapLegacyExecutionsToStatement, type LedgerStatementInput } from '@/lib/engine/account-ledger-rebuild'
import { traceTradeRows, type ProvenanceView } from '@/lib/journal/provenance'
import { JournalError } from '@/lib/journal/contracts'
import { journalResponseError } from '@/lib/journal/http'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession()
    const { id } = await context.params
    const result = await prisma.$transaction(async tx => {
      const trade = await tx.roundTripTrade.findFirst({ where: { id, account: { userId: session.user.id } }, include: { fills: { orderBy: { seq: 'asc' } }, classification: true, journal: { select: { setup: true } } } })
      if (!trade) throw new JournalError(404, 'not_found', 'Trade not found. It may have been reprocessed; reload the page.')
      const [stored, executions] = await Promise.all([
        tx.brokerStatementImport.findMany({ where: { accountId: trade.accountId, userId: session.user.id, confirmedAt: { not: null } }, include: { rows: { orderBy: { rowIndex: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
        tx.execution.findMany({ where: { accountId: trade.accountId, account: { userId: session.user.id } }, select: { id: true, execTime: true, daySeq: true, symbol: true, side: true, qty: true, price: true, commission: true } }),
      ])
      const base: ProvenanceView = { available: false, message: 'Exact source rows are unavailable for this trade. The original opening-row identity and every stored fill must match; source files are never guessed.', riskSource: trade.riskSource, inferredSetup: trade.classification?.setup ?? null, confidence: trade.classification?.confidence ?? null, personalSetup: trade.journal?.setup || null, rows: [] }
      if (stored.some(statement => !['TOS_ACCOUNT_STATEMENT', 'SCHWAB_TRANSACTION_HISTORY'].includes(statement.sourceFormat))) return base
      const statements: LedgerStatementInput[] = stored.map(statement => ({ id: statement.id, sourceFormat: statement.sourceFormat === 'TOS_ACCOUNT_STATEMENT' ? 'TOS_ACCOUNT_STATEMENT' : 'SCHWAB_TRANSACTION_HISTORY', coverageFrom: statement.coverageFrom, coverageTo: statement.coverageTo, createdAt: statement.createdAt, rows: statement.rows.map(mapStoredRowToAnalyzedRow) }))
      const legacy = mapLegacyExecutionsToStatement(executions.map(execution => ({ ...execution, qty: execution.qty.toNumber(), price: execution.price.toNumber(), commission: execution.commission.toNumber() })))
      if (legacy) statements.push(legacy.statement)
      const traced = traceTradeRows(statements, legacy?.executionIds ?? [], trade.sourceKey, trade.fills.map(fill => ({ ...fill, qty: fill.qty.toNumber(), price: fill.price?.toNumber() ?? null, fees: fill.fees.toNumber() })))
      if (!traced) return base
      for (const { fill, origin } of traced) {
        const statement = stored.find(candidate => candidate.id === origin?.statementId)
        const row = statement?.rows.find(candidate => candidate.rowIndex === origin.rowIndex)
        if (!statement || !row) return { ...base, message: 'This trade includes legacy executions without retained raw broker rows. Exact raw-file provenance is unavailable.' }
        base.rows.push({ statementId: statement.id, fileName: statement.fileName, sourceFormat: statement.sourceFormat, rowIndex: row.rowIndex, precision: statement.sourceFormat === 'TOS_ACCOUNT_STATEMENT' ? 'Per-second timestamp (America/New_York)' : 'Date only; no intraday ordering guaranteed', feeSource: statement.sourceFormat === 'TOS_ACCOUNT_STATEMENT' ? 'Broker Cash Balance TRD row: absolute Misc Fees + Commissions & Fees' : 'Broker Fees & Comm column', rawDate: row.rawDate, action: row.action, quantityRaw: row.quantityRaw, priceRaw: row.priceRaw, feesRaw: row.feesRaw, notes: row.notes, time: fill.time.toISOString(), kind: fill.kind, qty: fill.qty, price: fill.price, fees: fill.fees })
      }
      return { ...base, available: true, message: 'Exact broker rows matched through the account ledger, including fills carried across statements. Applied quantity and fees may be a portion of a source row when it spans positions.' }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return journalResponseError(error) }
}
