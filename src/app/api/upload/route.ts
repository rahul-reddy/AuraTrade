import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { analyzeBrokerStatement } from '@/lib/parser/analyze-broker-statement'
import { persistBrokerStatementImport } from '@/lib/parser/broker-statement-store'
import { createOrReusePendingUpload } from '@/lib/upload/pending-upload'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'
import { evaluateStatementImportSupport } from '@/lib/engine/broker-trade-importer'
import {
  findLegacyExecutionOverlap,
  previewStatementImport,
} from '@/lib/engine/account-ledger-rebuild'

/**
 * Upload preview (dry run). Every statement format imports through the
 * account-level broker ledger, so the preview is evaluated against the
 * account's confirmed statements: a statement that only closes positions
 * opened in an earlier statement still previews (and imports) its trades.
 */
export async function POST(req: NextRequest) {
  let session
  try {
    session = await getRequiredSession()
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
  const userId = session.user.id

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'File must be a CSV' }, { status: 400 })
    }

    const content = await file.text()
    const fileHash = createHash('sha256').update(content).digest('hex')

    let account = await prisma.tradingAccount.findFirst({ where: { userId } })
    if (!account) {
      account = await prisma.tradingAccount.create({
        data: { userId, name: 'My Account', startingBalance: 0 },
      })
    }

    const dryRun = analyzeBrokerStatement(content)
    // Per-file ledger: persisted as the statement's own audit trail.
    const fileLedger = buildBrokerPositionLedger(dryRun.rows)
    const importSupport = evaluateStatementImportSupport(dryRun)
    const { statementImportId } = await persistBrokerStatementImport(prisma, {
      userId,
      accountId: account.id,
      fileHash,
      fileName: file.name,
      dryRun,
      ledger: fileLedger,
    })

    if (dryRun.totalRows === 0) {
      return NextResponse.json(
        { error: 'empty_file', message: 'No rows were found in this file.', statementImportId },
        { status: 422 },
      )
    }

    const impact = await previewStatementImport(prisma, account.id, {
      id: statementImportId,
      sourceFormat: dryRun.sourceFormat,
      coverageFrom: dryRun.coverage?.from ?? null,
      coverageTo: dryRun.coverage?.to ?? null,
      rows: dryRun.rows,
    })

    const warnings = [...dryRun.warnings, ...impact.warnings]
    if (impact.transferredPositions > 0) {
      warnings.push(
        `${impact.transferredPositions} position span(s) ended via journal/transfer and were excluded from estimated realized P&L.`,
      )
    }
    if (dryRun.coverage) {
      const overlapping = await prisma.brokerStatementImport.findMany({
        where: {
          accountId: account.id,
          fileHash: { not: fileHash },
          confirmedAt: { not: null },
          coverageFrom: { lte: dryRun.coverage.to },
          coverageTo: { gte: dryRun.coverage.from },
        },
        select: { fileName: true, coverageFrom: true, coverageTo: true },
      })
      for (const statement of overlapping) {
        const from = statement.coverageFrom?.toISOString().slice(0, 10)
        const to = statement.coverageTo?.toISOString().slice(0, 10)
        warnings.push(
          `Overlaps previously imported ${statement.fileName} (${from} → ${to}). Each overlapping day uses one statement's fills (timestamped thinkorswim first, then the newest export), so nothing is double-counted.`,
        )
      }
    }

    const blockers = [...importSupport.reasons]
    const legacyOverlap = dryRun.coverage
      ? await findLegacyExecutionOverlap(prisma, account.id, dryRun.coverage)
      : null
    if (legacyOverlap) {
      blockers.push(
        `This account already has ${legacyOverlap.count} fill(s) from the older import path between ${legacyOverlap.first.toISOString().slice(0, 10)} and ${legacyOverlap.last.toISOString().slice(0, 10)}. Importing this statement would count them twice.`,
      )
    }

    const touchedTrades = impact.closedTradeLikePositions + impact.openPositions + impact.transferredPositions
    const canImport = blockers.length === 0 && dryRun.importableTradeRows > 0 && touchedTrades > 0
    const summary = {
      canImport,
      totalRows: dryRun.totalRows,
      totalExecutions: dryRun.importableTradeRows,
      importableTradeRows: dryRun.importableTradeRows,
      blockedTradeRows: dryRun.blockedTradeRows,
      nonTradeRows: dryRun.nonTradeRows,
      positionAffectingNonTradeRows: dryRun.positionAffectingNonTradeRows,
      optionRows: dryRun.optionRows,
      skippedRows: dryRun.skippedRows,
      newTrades: impact.closedTradeLikePositions,
      openPositions: impact.openPositions,
      dateRange: dryRun.dateRange,
      symbols: dryRun.symbols,
      estimatedPnl: Math.round(impact.estimatedPnl * 100) / 100,
      warnings,
      assumptions: dryRun.assumptions,
      blockers,
      actionBreakdown: dryRun.actions,
    }

    if (dryRun.importableTradeRows === 0 || touchedTrades === 0) {
      return NextResponse.json(
        {
          error: 'no_supported_trades',
          message: 'No importable trades were found in this statement.',
          statementImportId,
          uploadId: null,
          accountId: account.id,
          summary,
        },
        { status: 422 },
      )
    }

    if (!canImport) {
      return NextResponse.json({ statementImportId, uploadId: null, accountId: account.id, summary })
    }

    const duplicate = await prisma.upload.findFirst({
      where: { accountId: account.id, fileHash, status: 'COMPLETE' },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: 'duplicate_file', message: 'This exact file has already been imported.' },
        { status: 409 },
      )
    }

    const upload = await createOrReusePendingUpload(prisma, {
      userId,
      accountId: account.id,
      fileHash,
      fileName: file.name,
      status: 'PENDING',
      totalRows: dryRun.totalRows,
      newRows: touchedTrades,
      skippedRows: dryRun.skippedRows,
      dateFrom: dryRun.dateRange?.from ?? null,
      dateTo: dryRun.dateRange?.to ?? null,
      warnings,
    })

    return NextResponse.json({ statementImportId, uploadId: upload.id, accountId: account.id, summary })
  } catch (err) {
    console.error('[POST /api/upload]', err)
    return NextResponse.json({ error: 'internal_error', message: String(err) }, { status: 500 })
  }
}
