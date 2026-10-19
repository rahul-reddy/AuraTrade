import { NextRequest, NextResponse } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { lockAccountLedger } from '@/lib/engine/account-ledger-rebuild'
import { JournalError } from '@/lib/journal/contracts'
import { playbookLinkSchema } from '@/lib/journal/playbooks'
import { assertSameOrigin, readJson, journalResponseError } from '@/lib/journal/http'

export async function GET(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    const journalId = request.nextUrl.searchParams.get('journalId') ?? ''
    const journal = await prisma.tradeJournal.findFirst({ where: { id: journalId, account: { userId: session.user.id } }, select: { accountId: true, playbookLink: { select: { playbookId: true, isExample: true } } } })
    if (!journal) throw new JournalError(404, 'not_found', 'Journal not found.')
    const playbooks = await prisma.playbook.findMany({ where: { accountId: journal.accountId, account: { userId: session.user.id }, OR: [{ archived: false }, ...(journal.playbookLink ? [{ id: journal.playbookLink.playbookId }] : [])] }, orderBy: { name: 'asc' }, select: { id: true, name: true, archived: true } })
    return NextResponse.json({ accountId: journal.accountId, link: journal.playbookLink, playbooks }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return journalResponseError(error) }
}
export async function PUT(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    assertSameOrigin(request)
    const input = playbookLinkSchema.parse(await readJson(request))
    const journal = await prisma.tradeJournal.findFirst({ where: { id: input.journalId, account: { userId: session.user.id } }, select: { accountId: true } })
    if (!journal) throw new JournalError(404, 'not_found', 'Journal not found.')
    await prisma.$transaction(async tx => {
      await lockAccountLedger(tx, journal.accountId)
      const current = await tx.playbookJournal.findFirst({ where: { journalId: input.journalId, journal: { accountId: journal.accountId, account: { userId: session.user.id } } } })
      if ((current?.playbookId ?? null) !== (input.expectedLink?.playbookId ?? null) || (current?.isExample ?? false) !== (input.expectedLink?.isExample ?? false)) throw new JournalError(409, 'conflict', 'This assignment changed in another tab. Reload playbooks before trying again.')
      if (input.playbookId) {
        const playbook = await tx.playbook.findFirst({ where: { id: input.playbookId, accountId: journal.accountId, account: { userId: session.user.id } } })
        if (!playbook) throw new JournalError(404, 'not_found', 'Playbook not found in this trading account.')
        if (playbook.archived && current?.playbookId !== playbook.id) throw new JournalError(400, 'archived', 'Restore this playbook before assigning a new trade.')
        if (current) await tx.playbookJournal.update({ where: { id: current.id, journal: { account: { userId: session.user.id } } }, data: { playbookId: playbook.id, isExample: input.isExample } })
        else await tx.playbookJournal.create({ data: { journalId: input.journalId, playbookId: playbook.id, isExample: input.isExample } })
      } else await tx.playbookJournal.deleteMany({ where: { journalId: input.journalId, journal: { accountId: journal.accountId, account: { userId: session.user.id } } } })
    })
    return NextResponse.json({ saved: true })
  } catch (error) { return journalResponseError(error) }
}
