import { NextRequest, NextResponse } from 'next/server'
import { fillTradingDay } from '@/lib/charts/chart-model'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { lockAccountLedger } from '@/lib/engine/account-ledger-rebuild'
import { tradingDayKey, tradingDayRangeWhere } from '@/lib/trades/trading-date'
import { dailyReviewSchema, daySchema, JournalError } from '@/lib/journal/contracts'
import { assertSameOrigin, journalResponseError, readJson } from '@/lib/journal/http'
import { fillDayWhere, fillOccursOnDay, reviewSummary, todayTradingDay, type DailyReviewData } from '@/lib/journal/review'

export async function GET(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    const params = new URL(request.url).searchParams
    const date = daySchema.parse(params.get('date') || todayTradingDay())
    const account = await prisma.tradingAccount.findFirst({ where: { id: params.get('accountId') ?? '', userId: session.user.id } })
    if (!account) throw new JournalError(404, 'no_account', 'Trading account not found.')
    const owned = { accountId: account.id, account: { userId: session.user.id } }
    const [trades, reflection, recoveredJournals, latestEntry, latestExit, latestFill] = await Promise.all([
      prisma.roundTripTrade.findMany({ where: { ...owned, OR: [tradingDayRangeWhere('entry', date, date)!, tradingDayRangeWhere('exit', date, date)!, { fills: { some: fillDayWhere(date) } }] },
        include: { journal: { select: { reviewedAt: true, setup: true } }, classification: { select: { setup: true } }, fills: { where: fillDayWhere(date), select: { time: true } } }, orderBy: [{ entryTime: 'asc' }, { id: 'asc' }] }),
      prisma.dailyReview.findFirst({ where: { ...owned, tradingDate: new Date(`${date}T00:00:00Z`) } }),
      prisma.tradeJournal.findMany({ where: { ...owned, trade: null, entryTradingDate: new Date(`${date}T00:00:00Z`) }, select: { id: true, symbol: true, reviewedAt: true }, orderBy: { createdAt: 'asc' } }),
      prisma.roundTripTrade.findFirst({ where: owned, orderBy: { entryTime: 'desc' }, select: { entryTime: true, entryTradingDate: true } }),
      prisma.roundTripTrade.findFirst({ where: { ...owned, exitTime: { not: null } }, orderBy: { exitTime: 'desc' }, select: { exitTime: true, exitTradingDate: true } }),
      prisma.tradeFill.findFirst({ where: { trade: owned }, orderBy: { time: 'desc' }, select: { time: true } }),
    ])
    const relevant = trades.filter(trade => tradingDayKey(trade.entryTradingDate, trade.entryTime) === date || (trade.exitTime && tradingDayKey(trade.exitTradingDate, trade.exitTime) === date) || trade.fills.some(fill => fillOccursOnDay(fill.time, date)))
    const days = [latestEntry && tradingDayKey(latestEntry.entryTradingDate, latestEntry.entryTime), latestExit?.exitTime && tradingDayKey(latestExit.exitTradingDate, latestExit.exitTime), latestFill && fillTradingDay(latestFill.time.toISOString())].filter((day): day is string => !!day).sort()
    const result: DailyReviewData = {
      date, latestDay: days.at(-1) ?? null,
      trades: relevant.map(trade => ({ id: trade.id, symbol: trade.symbol, direction: trade.direction, entryDay: tradingDayKey(trade.entryTradingDate, trade.entryTime), exitDay: trade.exitTime ? tradingDayKey(trade.exitTradingDate, trade.exitTime) : null, isOpen: trade.isOpen, netPnl: trade.netPnl?.toNumber() ?? null, reviewed: trade.journal?.reviewedAt != null, setup: trade.classification?.setup ?? null, personalSetup: trade.journal?.setup || null })),
      summary: reviewSummary(relevant.map(trade => ({ ...trade, netPnl: trade.netPnl?.toNumber() ?? null, totalFees: trade.totalFees.toNumber(), reviewed: trade.journal?.reviewedAt != null })), date),
      reflection: reflection ? { version: reflection.version, whatWorked: reflection.whatWorked, toImprove: reflection.toImprove, nextFocus: reflection.nextFocus, notes: reflection.notes, reviewed: reflection.reviewedAt != null } : { version: 0, whatWorked: '', toImprove: '', nextFocus: '', notes: '', reviewed: false },
      recoveredJournals: recoveredJournals.map(journal => ({ id: journal.id, symbol: journal.symbol, reviewed: journal.reviewedAt != null })),
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return journalResponseError(error) }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    assertSameOrigin(request)
    const input = dailyReviewSchema.parse(await readJson(request))
    const result = await prisma.$transaction(async tx => {
      const account = await tx.tradingAccount.findFirst({ where: { id: input.accountId, userId: session.user.id } })
      if (!account) throw new JournalError(404, 'no_account', 'Trading account not found.')
      await lockAccountLedger(tx, account.id)
      const where = { accountId: account.id, account: { userId: session.user.id }, tradingDate: new Date(`${input.date}T00:00:00Z`) }
      const current = await tx.dailyReview.findFirst({ where })
      if ((current?.version ?? 0) !== input.version) throw new JournalError(409, 'conflict', 'This reflection changed in another tab. Reload the saved version before editing again.')
      const data = { whatWorked: input.whatWorked, toImprove: input.toImprove, nextFocus: input.nextFocus, notes: input.notes, reviewedAt: input.reviewed ? current?.reviewedAt ?? new Date() : null }
      return current ? tx.dailyReview.update({ where: { ...where, id: current.id }, data: { ...data, version: { increment: 1 } } }) : tx.dailyReview.create({ data: { accountId: account.id, tradingDate: where.tradingDate, ...data } })
    })
    return NextResponse.json({ version: result.version, reviewed: result.reviewedAt != null })
  } catch (error) { return journalResponseError(error) }
}
