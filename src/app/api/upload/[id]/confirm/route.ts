import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { analyzeBrokerStatement } from '@/lib/parser/analyze-broker-statement'
import { persistBrokerStatementImport } from '@/lib/parser/broker-statement-store'
import { rebuildDailySnapshotsForAccount } from '@/lib/engine/daily-snapshots'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'
import { evaluateStatementImportSupport } from '@/lib/engine/broker-trade-importer'
import {
  findLegacyExecutionOverlap,
  rebuildLedgerTradesForAccount,
} from '@/lib/engine/account-ledger-rebuild'

/**
 * Confirms a previewed upload. Every statement format imports the same way:
 * the statement is marked confirmed and all statement-derived trades for the
 * account are rebuilt through the account-level ledger (carry-in positions
 * pair across files; overlapping statements never double-count).
 *
 * The legacy Execution import path no longer accepts new files. Accounts that
 * still hold Execution-backed trades keep them; a statement overlapping those
 * dates is refused so the same fills cannot be counted twice.
 */
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

    // Re-analyze and re-persist so confirm never imports a stale preview.
    const dryRun = analyzeBrokerStatement(content)
    const importSupport = evaluateStatementImportSupport(dryRun)
    const { statementImportId } = await persistBrokerStatementImport(prisma, {
      userId,
      accountId,
      fileHash,
      fileName: file.name,
      dryRun,
      ledger: buildBrokerPositionLedger(dryRun.rows),
    })

    // Option rows from Transaction History count as "blocked" only for the
    // retired Execution path; importSupport reports rows that truly block.
    const tradeRows = dryRun.importableTradeRows + dryRun.blockedTradeRows
    if (!importSupport.supported || tradeRows === 0) {
      return NextResponse.json(
        {
          error: 'not_importable',
          message: 'This statement has no importable trades or contains rows that block import.',
          blockers: importSupport.reasons,
        },
        { status: 422 },
      )
    }

    if (dryRun.coverage) {
      const legacyOverlap = await findLegacyExecutionOverlap(prisma, accountId, dryRun.coverage)
      if (legacyOverlap) {
        return NextResponse.json(
          {
            error: 'overlaps_legacy_import',
            message: `This account already has ${legacyOverlap.count} fill(s) from the older import path in this statement's date range. Importing it would count them twice.`,
          },
          { status: 409 },
        )
      }
    }

    const result = await prisma.$transaction(
      async (tx) => {
        // Atomically claim the upload so concurrent confirms cannot both run
        // the rebuild and produce duplicate trades.
        const claimed = await tx.upload.updateMany({
          where: { id: uploadId, status: { not: 'COMPLETE' } },
          data: { status: 'COMPLETE', completedAt: new Date() },
        })
        if (claimed.count === 0) {
          return null
        }

        await tx.brokerStatementImport.update({
          where: { id: statementImportId },
          data: { confirmedAt: new Date() },
        })
        const ledgerRebuild = await rebuildLedgerTradesForAccount(tx, accountId, {
          impactFor: statementImportId,
        })

        const snapshotResult = await rebuildDailySnapshotsForAccount(
          tx,
          accountId,
          account.startingBalance.toNumber(),
        )

        const impact = ledgerRebuild.impact
        return {
          newExecCount: 0,
          skippedExecCount: 0,
          // Trades this statement opened or closed, including closes of
          // positions opened in an earlier statement.
          totalTrades: impact?.closedTradeLikePositions ?? 0,
          openPositions: impact?.openPositions ?? 0,
          estimatedPnl: Math.round((impact?.estimatedPnl ?? 0) * 100) / 100,
          // Account-level warnings: carry-in closes that pair with an earlier
          // statement no longer appear here.
          warnings: ledgerRebuild.warnings,
          snapshotsRebuilt: snapshotResult.snapshotsWritten,
        }
      },
      { timeout: 60_000 },
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
