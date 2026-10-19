import { NextRequest, NextResponse } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { lockAccountLedger } from '@/lib/engine/account-ledger-rebuild'
import { daySchema, JournalError } from '@/lib/journal/contracts'
import { mondayOf, weeklyReviewSchema } from '@/lib/journal/playbooks'
import { shiftDay, todayTradingDay } from '@/lib/journal/review'
import { assertSameOrigin, readJson, journalResponseError } from '@/lib/journal/http'

export async function GET(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
    const weekStart = mondayOf(daySchema.parse(request.nextUrl.searchParams.get('date') ?? todayTradingDay()))
    const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: session.user.id }, select: { id: true } })
    if (!account) throw new JournalError(404, 'not_found', 'Trading account not found.')
    const [review, journals, daily] = await Promise.all([
      prisma.weeklyReview.findFirst({ where: { accountId, weekStart: new Date(weekStart), account: { userId: session.user.id } } }),
      // Review evidence follows journal entry sessions, including orphaned journals.
      prisma.tradeJournal.findMany({ where: { accountId, account: { userId: session.user.id }, entryTradingDate: { gte: new Date(weekStart), lt: new Date(shiftDay(weekStart, 7)) } }, select: { id: true, symbol: true, planAdherence: true, mistakes: true, lesson: true, trade: { select: { id: true } } } }),
      prisma.dailyReview.findMany({ where: { accountId, account: { userId: session.user.id }, tradingDate: { gte: new Date(weekStart), lt: new Date(shiftDay(weekStart, 7)) } }, select: { tradingDate: true, nextFocus: true, reviewedAt: true }, orderBy: { tradingDate: 'asc' } }),
    ])
    return NextResponse.json({ weekStart, review: { observation: review?.observation ?? '', experiment: review?.experiment ?? '', successCriteria: review?.successCriteria ?? '', result: review?.result ?? '', version: review?.version ?? 0 }, journals, daily: daily.map(day => ({ date: day.tradingDate.toISOString().slice(0, 10), nextFocus: day.nextFocus, reviewed: day.reviewedAt != null })) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return journalResponseError(error) }
}
export async function PUT(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    assertSameOrigin(request)
    const input = weeklyReviewSchema.parse(await readJson(request))
    const account = await prisma.tradingAccount.findFirst({ where: { id: input.accountId, userId: session.user.id }, select: { id: true } })
    if (!account) throw new JournalError(404, 'not_found', 'Trading account not found.')
    const result = await prisma.$transaction(async tx => {
      await lockAccountLedger(tx, account.id)
      const weekStart = new Date(input.weekStart)
      const current = await tx.weeklyReview.findFirst({ where: { accountId: account.id, weekStart, account: { userId: session.user.id } } })
      if (input.version !== (current?.version ?? 0)) throw new JournalError(409, 'conflict', 'This weekly review changed in another tab. Reload the saved version before editing.')
      const data = { observation: input.observation, experiment: input.experiment, successCriteria: input.successCriteria, result: input.result }
      return current ? tx.weeklyReview.update({ where: { id: current.id, account: { userId: session.user.id } }, data: { ...data, version: { increment: 1 } }, select: { version: true } })
        : tx.weeklyReview.create({ data: { ...data, accountId: account.id, weekStart }, select: { version: true } })
    })
    return NextResponse.json(result)
  } catch (error) { return journalResponseError(error) }
}
