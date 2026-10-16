import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import {
  emptyParseResult,
  parseSchwabCSV,
  type ParsedExecution,
} from '@/lib/parser/tos-csv-parser'
import { analyzeBrokerStatement } from '@/lib/parser/analyze-broker-statement'
import { persistBrokerStatementImport } from '@/lib/parser/broker-statement-store'
import { rebuildTradesForAccount } from '@/lib/engine/account-rebuild'
import { rebuildDailySnapshotsForAccount } from '@/lib/engine/daily-snapshots'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'
import { evaluateStatementImportSupport } from '@/lib/engine/broker-trade-importer'
import { rebuildLedgerTradesForAccount } from '@/lib/engine/account-ledger-rebuild'

/** Map ParsedExecution side/posEffect/direction → Prisma Side enum string. */
function toPrismaside(
  side: string,
  direction: string,
): 'BUY' | 'SELL' | 'SELL_SHORT' | 'BUY_TO_COVER' {
  if (side === 'BUY' && direction === 'LONG') return 'BUY'
  if (side === 'SELL' && direction === 'LONG') return 'SELL'
  if (side === 'SELL' && direction === 'SHORT') return 'SELL_SHORT'
  return 'BUY_TO_COVER'
}

/**
 * Assign a content-based daySeq to each incoming execution.
 *
 * daySeq = 0-based occurrence index within (execTime, symbol, side, qty, price) on a given day.
 * Two files covering the same date range will assign the same daySeq to the same execution,
 * so the DB unique constraint (accountId, execTime, symbol, side, qty, price, daySeq) correctly
 * deduplicates overlapping uploads without double-counting genuinely repeated same-day fills.
 */
function assignDaySeqs(
  executions: ParsedExecution[],
): Array<ParsedExecution & { daySeq: number; execTime: Date }> {
  const seqMap = new Map<string, number>()
  return executions.map((ex) => {
    const prismaside = toPrismaside(ex.side, ex.direction)
    // Key must match the DB unique constraint fields (excluding daySeq itself)
    const key = `${ex.date.toISOString()}|${ex.symbol}|${prismaside}|${ex.qty}|${ex.price}`
    const seq = seqMap.get(key) ?? 0
    seqMap.set(key, seq + 1)
    return {
      ...ex,
      daySeq: seq,
      execTime: ex.date, // pure midnight — no rowIndex offset encoding
    }
  })
}

// ─── route handler ────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await getRequiredSession()
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
  const userId = session.user.id
  const { id: uploadId } = await params

  try {
    // Verify upload belongs to this user
    const upload = await prisma.upload.findFirst({
      where: { id: uploadId, account: { userId } },
    })
    if (!upload) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (upload.status === 'COMPLETE') {
      return NextResponse.json({ error: 'already_confirmed' }, { status: 409 })
    }

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const content = await file.text()
    const fileHash = createHash('sha256').update(content).digest('hex')
    if (fileHash !== upload.fileHash) {
      return NextResponse.json({ error: 'file_mismatch', message: 'File content does not match original upload.' }, { status: 400 })
    }

    const accountId = upload.accountId
    const account = await prisma.tradingAccount.findFirst({
      where: { id: accountId, userId },
      select: { id: true, startingBalance: true },
    })
    if (!account) {
      return NextResponse.json({ error: 'account_not_found' }, { status: 404 })
    }

    // Parse the file
    const dryRun = analyzeBrokerStatement(content)
    const brokerLedger = buildBrokerPositionLedger(dryRun.rows)
    const importSupport = evaluateStatementImportSupport(dryRun)
    const parseResult =
      dryRun.sourceFormat === 'SCHWAB_TRANSACTION_HISTORY'
        ? parseSchwabCSV(content)
        : emptyParseResult()

    await persistBrokerStatementImport(prisma, {
      userId,
      accountId,
      fileHash,
      fileName: file.name,
      dryRun,
      ledger: brokerLedger,
    })

    const statementImport = await prisma.brokerStatementImport.findUnique({
      where: {
        accountId_fileHash: {
          accountId,
          fileHash,
        },
      },
      include: {
        positions: true,
        ledgerWarnings: {
          orderBy: [{ rowIndex: 'asc' }, { createdAt: 'asc' }],
          select: { message: true },
        },
      },
    })

    const useMixedLedgerImport =
      !dryRun.importSupported &&
      importSupport.supported &&
      statementImport != null &&
      statementImport.positions.length > 0

    // Assign content-based daySeq — enables cross-file dedup for overlapping date ranges
    const withSeqs = assignDaySeqs(parseResult.executions)

    const execData = withSeqs.map((ex) => ({
      accountId,
      uploadId,
      execTime: ex.execTime,
      daySeq: ex.daySeq,
      symbol: ex.symbol,
      side: toPrismaside(ex.side, ex.direction),
      qty: ex.qty,
      price: ex.price,
      netPrice: ex.price, // no separate NetPrice in Schwab format — commission is explicit
      commission: ex.commission,
      posEffect: ex.posEffect as 'OPEN' | 'CLOSE',
      assetType: 'STOCK',
    }))

    const result = await prisma.$transaction(
      async (tx) => {
        if (useMixedLedgerImport && statementImport) {
          // Atomically claim the upload so concurrent confirms cannot both run
          // the deleteMany/create sequence and produce duplicate trades.
          const claimed = await tx.upload.updateMany({
            where: { id: uploadId, status: { not: 'COMPLETE' } },
            data: { status: 'COMPLETE', completedAt: new Date() },
          })
          if (claimed.count === 0) {
            // Another request already completed this upload.
            return null
          }

          // Statement trades are rebuilt account-wide from every confirmed
          // statement so carry-in positions pair across files and overlapping
          // statements never double-count (see account-ledger-rebuild.ts).
          await tx.brokerStatementImport.update({
            where: { id: statementImport.id },
            data: { confirmedAt: new Date() },
          })
          const ledgerRebuild = await rebuildLedgerTradesForAccount(tx, accountId)

          const snapshotResult = await rebuildDailySnapshotsForAccount(
            tx,
            accountId,
            account.startingBalance.toNumber(),
          )

          const importedTrades = await tx.roundTripTrade.findMany({
            where: { brokerStatementImportId: statementImport.id },
            select: { isOpen: true, netPnl: true },
          })

          const estimatedPnl = importedTrades.reduce(
            (sum, trade) => sum + (trade.netPnl?.toNumber() ?? 0),
            0,
          )
          const openPositions = importedTrades.filter((trade) => trade.isOpen).length

          return {
            newExecCount: 0,
            skippedExecCount: 0,
            totalTrades: importedTrades.length - openPositions,
            openPositions,
            estimatedPnl: Math.round(estimatedPnl * 100) / 100,
            // Account-level warnings: carry-in closes that pair with an
            // earlier statement no longer appear here.
            warnings: ledgerRebuild.warnings,
            snapshotsRebuilt: snapshotResult.snapshotsWritten,
          }
        }

        // ── 1. Upsert new executions (skipDuplicates deduplicates overlapping uploads) ──
        const beforeCount = await tx.execution.count({ where: { accountId } })
        await tx.execution.createMany({ data: execData, skipDuplicates: true })
        const afterCount = await tx.execution.count({ where: { accountId } })
        const newExecCount = afterCount - beforeCount
        const skippedExecCount = execData.length - newExecCount

        // ── 2. Rebuild round trips from all executions ──
        const rebuildResult = await rebuildTradesForAccount(tx, accountId)

        // ── 3. Rebuild snapshots from the earliest date in this upload when new data landed ──
        const snapshotResult =
          newExecCount > 0 && parseResult.dateRange?.from
            ? await rebuildDailySnapshotsForAccount(
                tx,
                accountId,
                account.startingBalance.toNumber(),
                { fromDate: parseResult.dateRange.from },
              )
            : null

        // ── 4. Mark upload complete ──
        await tx.upload.update({
          where: { id: uploadId },
          data: { status: 'COMPLETE', completedAt: new Date() },
        })

        const closedTrades = await tx.roundTripTrade.findMany({
          where: { accountId, isOpen: false, netPnl: { not: null } },
          select: { netPnl: true },
        })
        const estimatedPnl = closedTrades.reduce((sum, trade) => sum + (trade.netPnl?.toNumber() ?? 0), 0)

        return {
          newExecCount,
          skippedExecCount,
          totalTrades: rebuildResult.closedTrades,
          openPositions: rebuildResult.openPositions,
          estimatedPnl: Math.round(estimatedPnl * 100) / 100,
          warnings: rebuildResult.warnings,
          snapshotsRebuilt: snapshotResult?.snapshotsWritten ?? 0,
        }
      },
      { timeout: 30000 },
    )

    if (result === null) {
      return NextResponse.json({ error: 'already_confirmed' }, { status: 409 })
    }

    return NextResponse.json({ uploadId, ...result })
  } catch (err) {
    console.error('[POST /api/upload/[id]/confirm]', err)
    return NextResponse.json({ error: 'internal_error', message: String(err) }, { status: 500 })
  }
}
