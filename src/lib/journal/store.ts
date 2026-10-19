import { Prisma, type TradeJournal } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'
import { lockAccountLedger } from '@/lib/engine/account-ledger-rebuild'
import { tradingDayKey } from '@/lib/trades/trading-date'
import { JournalError, type JournalInput, type JournalView, type JournalAttachmentInfo } from './contracts'

export const attachmentSelect = { id: true, contentType: true, byteSize: true } as const
export const journalInclude = { attachments: { select: attachmentSelect, orderBy: { createdAt: 'asc' as const } } }

export function serializeJournal(journal: TradeJournal & { attachments: JournalAttachmentInfo[] }): JournalView {
  return {
    id: journal.id, symbol: journal.symbol, thesis: journal.thesis, setup: journal.setup,
    plannedStop: journal.plannedStop?.toFixed(4) ?? null, mistakes: journal.mistakes,
    lesson: journal.lesson, notes: journal.notes, tags: journal.tags,
    planAdherence: ['FOLLOWED', 'PARTIAL', 'BROKE'].includes(journal.planAdherence) ? journal.planAdherence as 'FOLLOWED' | 'PARTIAL' | 'BROKE' : 'UNASSESSED',
    reviewed: journal.reviewedAt != null, version: journal.version,
    updatedAt: journal.updatedAt.toISOString(), attachments: journal.attachments,
  }
}

export async function loadJournal(userId: string, identity: { tradeId?: string; journalId?: string }): Promise<JournalView> {
  if (identity.journalId) {
    const journal = await prisma.tradeJournal.findFirst({ where: { id: identity.journalId, account: { userId } }, include: journalInclude })
    if (!journal) throw new JournalError(404, 'not_found', 'Journal not found.')
    return serializeJournal(journal)
  }
  const trade = await prisma.roundTripTrade.findFirst({ where: { id: identity.tradeId ?? '', account: { userId } }, include: { journal: { include: journalInclude } } })
  if (!trade) throw new JournalError(404, 'not_found', 'Trade not found. It may have been reprocessed; reload the page.')
  return trade.journal ? serializeJournal(trade.journal) : {
    id: null, symbol: trade.symbol, thesis: '', setup: '', plannedStop: null, mistakes: [], lesson: '',
    notes: trade.notes ?? '', tags: trade.tags, planAdherence: 'UNASSESSED', reviewed: false,
    version: 0, updatedAt: null, attachments: [],
  }
}

export async function saveJournal(userId: string, input: JournalInput): Promise<JournalView> {
  // Lock in the same order as ledger writers, then read the current trade. This
  // prevents a concurrent import/reprocess from discarding a newly saved journal.
  const owner = input.tradeId
    ? await prisma.roundTripTrade.findFirst({ where: { id: input.tradeId, account: { userId } }, select: { accountId: true } })
    : await prisma.tradeJournal.findFirst({ where: { id: input.journalId, account: { userId } }, select: { accountId: true } })
  if (!owner) throw new JournalError(404, 'not_found', 'Trade or journal not found. Reload the page.')
  return prisma.$transaction(async tx => {
    await lockAccountLedger(tx, owner.accountId)
    const trade = input.tradeId ? await tx.roundTripTrade.findFirst({ where: { id: input.tradeId, accountId: owner.accountId, account: { userId } } }) : null
    if (input.tradeId && !trade) throw new JournalError(404, 'not_found', 'This trade was reprocessed. Reload the page before editing.')
    const id = trade?.journalId ?? input.journalId
    const current = id ? await tx.tradeJournal.findFirst({ where: { id, accountId: owner.accountId, account: { userId } } }) : null
    if (input.journalId && !current) throw new JournalError(404, 'not_found', 'Journal not found.')
    if (input.version !== (current?.version ?? 0)) throw new JournalError(409, 'conflict', 'This journal changed in another tab. Reload its saved version before editing again.')
    const data = {
      thesis: input.thesis, setup: input.setup, plannedStop: input.plannedStop == null ? null : new Prisma.Decimal(input.plannedStop),
      mistakes: input.mistakes, lesson: input.lesson, notes: input.notes, tags: input.tags,
      planAdherence: input.planAdherence, reviewedAt: input.reviewed ? current?.reviewedAt ?? new Date() : null,
    }
    const journal = current
      ? await tx.tradeJournal.update({ where: { id: current.id, accountId: owner.accountId, account: { userId } }, data: { ...data, version: { increment: 1 } }, include: journalInclude })
      : await tx.tradeJournal.create({ data: {
        ...data, accountId: owner.accountId, symbol: trade!.symbol, direction: trade!.direction,
        entryTime: trade!.entryTime, entryTradingDate: new Date(`${tradingDayKey(trade!.entryTradingDate, trade!.entryTime)}T00:00:00Z`),
      }, include: journalInclude })
    // Preserve the existing notes/tags export contract for linked trades.
    await tx.roundTripTrade.updateMany({ where: { accountId: owner.accountId, account: { userId }, ...(trade ? { id: trade.id } : { journalId: journal.id }) }, data: {
      journalId: journal.id, notes: input.notes || null, tags: input.tags, notesUpdatedAt: new Date(),
    } })
    return serializeJournal(journal)
  })
}
