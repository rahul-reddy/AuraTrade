import { fromZonedTime } from 'date-fns-tz'
import type { Prisma } from '@/generated/prisma'
import { calculatePerformanceMetrics } from '@/lib/engine/metrics'
import { fillTradingDay } from '@/lib/charts/chart-model'
import { tradingDayKey } from '@/lib/trades/trading-date'

export function todayTradingDay() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
export function shiftDay(day: string, amount: number) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10) }

export function fillDayWhere(day: string): Prisma.TradeFillWhereInput {
  // Timestamped fills use Eastern sessions. Legacy date-only fills are midnight
  // UTC; include that exact instant separately, including around DST changes.
  return { OR: [
    { time: { gte: fromZonedTime(`${day}T00:00:00`, 'America/New_York'), lt: fromZonedTime(`${shiftDay(day, 1)}T00:00:00`, 'America/New_York') } },
    { time: new Date(`${day}T00:00:00Z`) },
  ] }
}

export interface ReviewTradeInput {
  isOpen: boolean; exitTime: Date | string | null; exitTradingDate?: Date | string | null
  netPnl: number | null; totalFees: number; reviewed: boolean
}

export function reviewSummary(trades: ReviewTradeInput[], day: string) {
  // Realized P&L = sum(netPnl) for known closed trades on this exit trading date.
  // Fees = sum(broker fees) for those same trades. Never include open-position P&L.
  const closed = trades.filter(trade => !trade.isOpen && trade.exitTime != null && trade.netPnl != null && tradingDayKey(trade.exitTradingDate, trade.exitTime) === day)
  const { metrics } = calculatePerformanceMetrics(closed.map(trade => ({ exitTime: trade.exitTime!, exitTradingDate: trade.exitTradingDate, netPnl: trade.netPnl!, totalFees: trade.totalFees })))
  return { closedCount: closed.length, netPnl: metrics.totalNetPnl, fees: metrics.totalFees, winRate: closed.length ? metrics.winRate : null,
    reviewedCount: trades.filter(trade => trade.reviewed).length, needsReviewCount: trades.filter(trade => !trade.reviewed).length,
    unknownPnlCount: trades.filter(trade => !trade.isOpen && trade.exitTime != null && trade.netPnl == null && tradingDayKey(trade.exitTradingDate, trade.exitTime) === day).length }
}

export function fillOccursOnDay(time: Date, day: string) { return fillTradingDay(time.toISOString()) === day }

export type DailyReviewTrade = {
  id: string; symbol: string; direction: string; entryDay: string; exitDay: string | null
  isOpen: boolean; netPnl: number | null; reviewed: boolean; setup: string | null; personalSetup: string | null
}
export type DailyReviewData = {
  date: string; latestDay: string | null; trades: DailyReviewTrade[]; summary: ReturnType<typeof reviewSummary>
  reflection: import('./contracts').DailyReviewDraft
  recoveredJournals: Array<{ id: string; symbol: string; reviewed: boolean }>
}
