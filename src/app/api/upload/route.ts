import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { parseSchwabCSV } from '@/lib/parser/tos-csv-parser'
import { analyzeSchwabStatement } from '@/lib/parser/schwab-statement-analyzer'
import { persistBrokerStatementImport } from '@/lib/parser/broker-statement-store'
import { groupTrades } from '@/lib/engine/trade-grouper'
import { createOrReusePendingUpload } from '@/lib/upload/pending-upload'
import {
  buildBrokerPositionLedger,
  summarizeBrokerLedger,
} from '@/lib/engine/broker-position-ledger'
import { evaluateStatementImportSupport } from '@/lib/engine/broker-trade-importer'

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

    const dryRun = analyzeSchwabStatement(content)
    const brokerLedger = buildBrokerPositionLedger(dryRun.rows)
    const brokerLedgerSummary = summarizeBrokerLedger(brokerLedger)
    const importSupport = evaluateStatementImportSupport(dryRun)
    const blockedPreviewWarnings = [
      ...dryRun.warnings,
      ...brokerLedger.warnings.map((warning) => warning.message),
      ...(brokerLedgerSummary.transferredPositions > 0
        ? [
            `${brokerLedgerSummary.transferredPositions} position span(s) ended via journal/transfer and were excluded from estimated realized P&L.`,
          ]
        : []),
    ]
    const { statementImportId } = await persistBrokerStatementImport(prisma, {
      userId,
      accountId: account.id,
      fileHash,
      fileName: file.name,
      dryRun,
      ledger: brokerLedger,
    })

    if (dryRun.totalRows === 0) {
      return NextResponse.json(
        { error: 'empty_file', message: 'No rows were found in this file.', statementImportId },
        { status: 422 },
      )
    }

    if (brokerLedger.positions.length === 0) {
      return NextResponse.json(
        {
          error: 'no_supported_trades',
          message: 'No importable positions were found in this statement.',
          statementImportId,
          uploadId: null,
          accountId: account.id,
          summary: {
            canImport: false,
            totalRows: dryRun.totalRows,
            totalExecutions: 0,
            importableTradeRows: dryRun.importableTradeRows,
            blockedTradeRows: dryRun.blockedTradeRows,
            nonTradeRows: dryRun.nonTradeRows,
            positionAffectingNonTradeRows: dryRun.positionAffectingNonTradeRows,
            optionRows: dryRun.optionRows,
            skippedRows: dryRun.skippedRows,
            newTrades: brokerLedgerSummary.closedTradeLikePositions,
            openPositions: brokerLedgerSummary.openPositions,
            dateRange: dryRun.dateRange,
            symbols: dryRun.symbols,
            estimatedPnl: Math.round(brokerLedgerSummary.estimatedPnl * 100) / 100,
            warnings: blockedPreviewWarnings,
            assumptions: dryRun.assumptions,
            blockers: importSupport.reasons,
            actionBreakdown: dryRun.actions,
          },
        },
        { status: 422 },
      )
    }

    const parseResult = parseSchwabCSV(content)
    const groupResult = groupTrades(parseResult.executions)
    const closedTrades = groupResult.trades.filter((t) => !t.isOpen)
    const openPositions = groupResult.trades.filter((t) => t.isOpen)
    const estimatedPnl = closedTrades.reduce((sum, trade) => sum + (trade.netPnl ?? 0), 0)

    if (!importSupport.supported) {
      return NextResponse.json({
        statementImportId,
        uploadId: null,
        accountId: account.id,
        summary: {
          canImport: false,
          totalRows: dryRun.totalRows,
          totalExecutions: parseResult.executions.length,
          importableTradeRows: dryRun.importableTradeRows,
          blockedTradeRows: dryRun.blockedTradeRows,
          nonTradeRows: dryRun.nonTradeRows,
          positionAffectingNonTradeRows: dryRun.positionAffectingNonTradeRows,
          optionRows: dryRun.optionRows,
          skippedRows: dryRun.skippedRows,
          newTrades: brokerLedgerSummary.closedTradeLikePositions,
          openPositions: brokerLedgerSummary.openPositions,
          dateRange: dryRun.dateRange,
          symbols: dryRun.symbols,
          estimatedPnl: Math.round(brokerLedgerSummary.estimatedPnl * 100) / 100,
          warnings: blockedPreviewWarnings,
          assumptions: [...dryRun.assumptions, ...parseResult.assumptions],
          blockers: importSupport.reasons,
          actionBreakdown: dryRun.actions,
        },
      })
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
      newRows: dryRun.importSupported ? parseResult.executions.length : brokerLedger.positions.length,
      skippedRows: dryRun.importSupported ? parseResult.skippedRows.length : dryRun.skippedRows,
      dateFrom: parseResult.dateRange?.from ?? null,
      dateTo: parseResult.dateRange?.to ?? null,
      warnings: dryRun.importSupported
        ? groupResult.warnings.map((w) => w.message)
        : blockedPreviewWarnings,
    })

    return NextResponse.json({
      statementImportId,
      uploadId: upload.id,
      accountId: account.id,
      summary: {
        canImport: true,
        totalRows: dryRun.totalRows,
        totalExecutions: dryRun.importSupported ? parseResult.executions.length : 0,
        importableTradeRows: dryRun.importableTradeRows,
        blockedTradeRows: dryRun.blockedTradeRows,
        nonTradeRows: dryRun.nonTradeRows,
        positionAffectingNonTradeRows: dryRun.positionAffectingNonTradeRows,
        optionRows: dryRun.optionRows,
        skippedRows: dryRun.importSupported ? parseResult.skippedRows.length : dryRun.skippedRows,
        newTrades: dryRun.importSupported ? closedTrades.length : brokerLedgerSummary.closedTradeLikePositions,
        openPositions: dryRun.importSupported ? openPositions.length : brokerLedgerSummary.openPositions,
        dateRange: dryRun.importSupported ? parseResult.dateRange : dryRun.dateRange,
        symbols: parseResult.symbols,
        estimatedPnl: dryRun.importSupported
          ? Math.round(estimatedPnl * 100) / 100
          : Math.round(brokerLedgerSummary.estimatedPnl * 100) / 100,
        warnings: dryRun.importSupported
          ? [...dryRun.warnings, ...groupResult.warnings.map((w) => w.message)]
          : blockedPreviewWarnings,
        assumptions: [...dryRun.assumptions, ...parseResult.assumptions],
        blockers: importSupport.reasons,
        actionBreakdown: dryRun.actions,
      },
    })
  } catch (err) {
    console.error('[POST /api/upload]', err)
    return NextResponse.json({ error: 'internal_error', message: String(err) }, { status: 500 })
  }
}
