import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rebuildTradesForAccount } from '@/lib/engine/account-rebuild'
import { rebuildLedgerTradesForAccount } from '@/lib/engine/account-ledger-rebuild'
import { rebuildDailySnapshotsForAccount } from '@/lib/engine/daily-snapshots'
import { startEnrichment } from '@/lib/engine/trade-enrichment'
import { prisma } from '@/lib/prisma'
import { getRequiredSession } from '@/lib/session'
import { buildIntegrityReport, resolveIntegrityAccount } from '@/lib/settings/integrity'

const actionSchema = z.object({
  action: z.enum(['reprocess_trades', 'rebuild_snapshots']),
  accountId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  let session
  try {
    session = await getRequiredSession()
  } catch (error) {
    if (error instanceof Response) return error
    throw error
  }

  const accountId = new URL(req.url).searchParams.get('accountId')

  try {
    const account = await resolveIntegrityAccount(session.user.id, accountId)
    if (!account) {
      return NextResponse.json({ error: 'no_account' }, { status: 404 })
    }

    const report = await buildIntegrityReport(account)
    return NextResponse.json(report)
  } catch (error) {
    console.error('[GET /api/settings/integrity]', error)
    return NextResponse.json(
      { error: 'internal_error', message: 'Could not load data integrity status.' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await getRequiredSession()
  } catch (error) {
    if (error instanceof Response) return error
    throw error
  }

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    const parsed = actionSchema.parse(body)
    const account = await resolveIntegrityAccount(session.user.id, parsed.accountId)
    if (!account) {
      return NextResponse.json({ error: 'no_account' }, { status: 404 })
    }

    if (parsed.action === 'reprocess_trades') {
      const result = await prisma.$transaction(async (tx) => {
        const tradeRebuild = await rebuildTradesForAccount(tx, account.id)
        const ledgerRebuild = await rebuildLedgerTradesForAccount(tx, account.id)
        const snapshotRebuild = await rebuildDailySnapshotsForAccount(
          tx,
          account.id,
          account.startingBalance,
        )

        return { tradeRebuild, ledgerRebuild, snapshotRebuild }
      }, { timeout: 60_000 })

      startEnrichment(account.id)

      return NextResponse.json({
        action: parsed.action,
        accountId: account.id,
        tradeRebuild: result.tradeRebuild,
        ledgerRebuild: result.ledgerRebuild,
        snapshotRebuild: result.snapshotRebuild,
        enrichmentStarted: true,
      })
    }

    const snapshotRebuild = await prisma.$transaction(async (tx) => {
      return rebuildDailySnapshotsForAccount(tx, account.id, account.startingBalance)
    }, { timeout: 60_000 })

    return NextResponse.json({
      action: parsed.action,
      accountId: account.id,
      snapshotRebuild,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    console.error('[POST /api/settings/integrity]', error)
    return NextResponse.json(
      { error: 'internal_error', message: 'Could not complete the integrity action.' },
      { status: 500 },
    )
  }
}
