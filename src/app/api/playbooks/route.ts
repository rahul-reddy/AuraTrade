import { NextRequest, NextResponse } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { lockAccountLedger } from '@/lib/engine/account-ledger-rebuild'
import { JournalError } from '@/lib/journal/contracts'
import { playbookSchema, type PlaybookView } from '@/lib/journal/playbooks'
import { assertSameOrigin, readJson, journalResponseError } from '@/lib/journal/http'

export async function GET(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
    const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: session.user.id }, select: { id: true } })
    if (!account) throw new JournalError(404, 'not_found', 'Trading account not found.')
    const rows = await prisma.playbook.findMany({ where: { accountId, account: { userId: session.user.id } }, orderBy: [{ archived: 'asc' }, { name: 'asc' }], include: {
      journals: { where: { isExample: true, journal: { accountId, account: { userId: session.user.id } } }, include: { journal: { select: { symbol: true, thesis: true, trade: { select: { id: true } } } } } },
    } })
    const playbooks: PlaybookView[] = rows.map(row => ({ id: row.id, name: row.name, description: row.description, entryCriteria: row.entryCriteria, exitCriteria: row.exitCriteria, invalidation: row.invalidation, archived: row.archived, version: row.version,
      examples: row.journals.map(link => ({ journalId: link.journalId, symbol: link.journal.symbol, thesis: link.journal.thesis, tradeId: link.journal.trade?.id ?? null })) }))
    return NextResponse.json({ playbooks }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return journalResponseError(error) }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    assertSameOrigin(request)
    const input = playbookSchema.parse(await readJson(request))
    const account = await prisma.tradingAccount.findFirst({ where: { id: input.accountId, userId: session.user.id }, select: { id: true } })
    if (!account) throw new JournalError(404, 'not_found', 'Trading account not found.')
    const result = await prisma.$transaction(async tx => {
      await lockAccountLedger(tx, account.id)
      const current = input.id ? await tx.playbook.findFirst({ where: { id: input.id, accountId: account.id, account: { userId: session.user.id } } }) : null
      if (input.id && !current) throw new JournalError(404, 'not_found', 'Playbook not found.')
      if (input.version !== (current?.version ?? 0)) throw new JournalError(409, 'conflict', 'This playbook changed in another tab. Reload the saved version before editing.')
      const data = { name: input.name, description: input.description, entryCriteria: input.entryCriteria, exitCriteria: input.exitCriteria, invalidation: input.invalidation, archived: input.archived }
      return current ? tx.playbook.update({ where: { id: current.id, accountId: account.id, account: { userId: session.user.id } }, data: { ...data, version: { increment: 1 } }, select: { id: true, version: true } })
        : tx.playbook.create({ data: { ...data, accountId: account.id }, select: { id: true, version: true } })
    })
    return NextResponse.json(result)
  } catch (error) { return journalResponseError(error) }
}
