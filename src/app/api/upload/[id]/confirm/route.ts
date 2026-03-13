import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { parseSchwabCSV, type ParsedExecution } from '@/lib/parser/tos-csv-parser'
import { groupTrades } from '@/lib/engine/trade-grouper'
import type { Execution } from '@/generated/prisma'

// ─── type helpers ────────────────────────────────────────────────────

// ParsedExecution extended with the DB row's id for relinking after rebuild
type ParsedWithDbId = ParsedExecution & { dbId: string }

/** Map a DB Execution row back to the shape groupTrades() expects. */
function dbExecToParsed(row: Execution): ParsedWithDbId {
  const isShort = row.side === 'SELL_SHORT' || row.side === 'BUY_TO_COVER'
  // daySeq is the 0-based intra-day occurrence index — use directly as rowIndex for FIFO ordering
  return {
    dbId: row.id,
    rowIndex: row.daySeq,
    date: new Date(row.execTime.toISOString().split('T')[0] + 'T00:00:00.000Z'),
    symbol: row.symbol,
    action: row.side,
    side: row.side === 'BUY' || row.side === 'BUY_TO_COVER' ? 'BUY' : 'SELL',
    posEffect: row.posEffect === 'OPEN' ? 'OPEN' : 'CLOSE',
    direction: isShort ? 'SHORT' : 'LONG',
    qty: row.qty.toNumber(),
    price: row.price.toNumber(),
    commission: row.commission.toNumber(),
    amount: 0,
    description: '',
  }
}

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

    // Parse the file
    const parseResult = parseSchwabCSV(content)

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
        // ── 1. Upsert new executions (skipDuplicates deduplicates overlapping uploads) ──
        const beforeCount = await tx.execution.count({ where: { accountId } })
        await tx.execution.createMany({ data: execData, skipDuplicates: true })
        const afterCount = await tx.execution.count({ where: { accountId } })
        const newExecCount = afterCount - beforeCount
        const skippedExecCount = execData.length - newExecCount

        // ── 2. Null out tradeId on all executions (prep for trade rebuild) ──
        await tx.execution.updateMany({ where: { accountId }, data: { tradeId: null } })

        // ── 3. Delete all existing RoundTripTrades for account ──
        await tx.roundTripTrade.deleteMany({ where: { accountId } })

        // ── 4. Load ALL executions and rebuild round trips from scratch ──
        const allDbExecs = await tx.execution.findMany({
          where: { accountId },
          orderBy: [{ execTime: 'asc' }, { daySeq: 'asc' }],
        })
        const allParsed = allDbExecs.map(dbExecToParsed)
        const { trades: grouped, warnings } = groupTrades(allParsed)

        // ── 5. Create RoundTripTrades and link their executions ──
        for (const trade of grouped) {
          const created = await tx.roundTripTrade.create({
            data: {
              accountId,
              symbol: trade.symbol,
              direction: trade.direction,
              entryPrice: trade.entryPrice,
              exitPrice: trade.exitPrice ?? undefined,
              totalQty: trade.totalQty,
              closedQty: trade.closedQty,
              grossPnl: trade.grossPnl ?? undefined,
              totalFees: trade.totalFees,
              netPnl: trade.netPnl ?? undefined,
              isOpen: trade.isOpen,
              entryTime: trade.entryTime,
              exitTime: trade.exitTime ?? undefined,
              durationSeconds: trade.durationSeconds ?? undefined,
            },
          })

          const fillIds = [
            ...trade.openingFills.map((f) => (f as ParsedWithDbId).dbId),
            ...trade.closingFills.map((f) => (f as ParsedWithDbId).dbId),
          ].filter(Boolean)

          if (fillIds.length > 0) {
            await tx.execution.updateMany({
              where: { id: { in: fillIds } },
              data: { tradeId: created.id },
            })
          }
        }

        // ── 6. Mark upload complete ──
        await tx.upload.update({
          where: { id: uploadId },
          data: { status: 'COMPLETE', completedAt: new Date() },
        })

        const closedTrades = grouped.filter((t) => !t.isOpen)
        const openPositions = grouped.filter((t) => t.isOpen)
        const estimatedPnl = closedTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0)

        return {
          newExecCount,
          skippedExecCount,
          totalTrades: closedTrades.length,
          openPositions: openPositions.length,
          estimatedPnl: Math.round(estimatedPnl * 100) / 100,
          warnings: warnings.map((w) => w.message),
        }
      },
      { timeout: 30000 },
    )

    return NextResponse.json({ uploadId, ...result })
  } catch (err) {
    console.error('[POST /api/upload/[id]/confirm]', err)
    return NextResponse.json({ error: 'internal_error', message: String(err) }, { status: 500 })
  }
}
