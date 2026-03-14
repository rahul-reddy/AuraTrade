/**
 * POST /api/enrich — trigger async enrichment for the user's account
 * GET  /api/enrich — poll enrichment progress
 *
 * Both routes are authenticated. Enrichment runs per-account.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { startEnrichment, getEnrichmentProgress } from '@/lib/engine/trade-enrichment'

/** Resolve the first TradingAccount for `userId` (there is currently one per user). */
async function getAccountId(userId: string): Promise<string | null> {
  const account = await prisma.tradingAccount.findFirst({
    where: { userId },
    select: { id: true },
  })
  return account?.id ?? null
}

// ─── POST /api/enrich ─────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  void req // unused but required for Next.js route signature

  let session
  try {
    session = await getRequiredSession()
  } catch (e) {
    if (e instanceof Response) return e as unknown as NextResponse
    throw e
  }

  const userId = session.user.id
  const accountId = await getAccountId(userId)

  if (!accountId) {
    return NextResponse.json({ error: 'no_account' }, { status: 404 })
  }

  startEnrichment(accountId, prisma)

  return NextResponse.json({ started: true, accountId })
}

// ─── GET /api/enrich/status ───────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  void req

  let session
  try {
    session = await getRequiredSession()
  } catch (e) {
    if (e instanceof Response) return e as unknown as NextResponse
    throw e
  }

  const userId = session.user.id
  const accountId = await getAccountId(userId)

  if (!accountId) {
    return NextResponse.json({ error: 'no_account' }, { status: 404 })
  }

  const progress = getEnrichmentProgress(accountId)

  if (!progress) {
    return NextResponse.json({ status: 'idle', accountId })
  }

  return NextResponse.json({
    status: progress.done ? 'done' : 'running',
    accountId,
    total: progress.total,
    enriched: progress.enriched,
    tradesEnriched: progress.tradesEnriched,
    done: progress.done,
    errorCount: progress.errorCount,
    startedAt: progress.startedAt.toISOString(),
    finishedAt: progress.finishedAt?.toISOString() ?? null,
  })
}
