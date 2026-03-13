import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { parseSchwabCSV } from '@/lib/parser/tos-csv-parser'
import { groupTrades } from '@/lib/engine/trade-grouper'

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

    // Get or create default trading account
    let account = await prisma.tradingAccount.findFirst({ where: { userId } })
    if (!account) {
      account = await prisma.tradingAccount.create({
        data: { userId, name: 'My Account', startingBalance: 0 },
      })
    }

    // Dedup layer 1: exact file already imported
    const duplicate = await prisma.upload.findFirst({
      where: { accountId: account.id, fileHash, status: 'COMPLETE' },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: 'duplicate_file', message: 'This exact file has already been imported.' },
        { status: 409 },
      )
    }

    // Parse + group entirely in memory — no DB writes yet
    const parseResult = parseSchwabCSV(content)
    if (parseResult.executions.length === 0) {
      return NextResponse.json(
        { error: 'empty_file', message: 'No valid trade executions found in this file.' },
        { status: 422 },
      )
    }
    const groupResult = groupTrades(parseResult.executions)

    const closedTrades = groupResult.trades.filter((t) => !t.isOpen)
    const openPositions = groupResult.trades.filter((t) => t.isOpen)
    const estimatedPnl = closedTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0)

    // Create PENDING upload record to anchor the confirmation step
    const upload = await prisma.upload.create({
      data: {
        userId,
        accountId: account.id,
        fileHash,
        fileName: file.name,
        status: 'PENDING',
        totalRows: parseResult.executions.length + parseResult.skippedRows.length,
        newRows: parseResult.executions.length,
        skippedRows: parseResult.skippedRows.length,
        dateFrom: parseResult.dateRange?.from ?? null,
        dateTo: parseResult.dateRange?.to ?? null,
        warnings: groupResult.warnings.map((w) => w.message),
      },
    })

    return NextResponse.json({
      uploadId: upload.id,
      accountId: account.id,
      summary: {
        totalExecutions: parseResult.executions.length,
        skippedRows: parseResult.skippedRows.length,
        newTrades: closedTrades.length,
        openPositions: openPositions.length,
        dateRange: parseResult.dateRange,
        symbols: parseResult.symbols,
        estimatedPnl: Math.round(estimatedPnl * 100) / 100,
        warnings: groupResult.warnings.map((w) => w.message),
        assumptions: parseResult.assumptions,
      },
    })
  } catch (err) {
    console.error('[POST /api/upload]', err)
    return NextResponse.json({ error: 'internal_error', message: String(err) }, { status: 500 })
  }
}
