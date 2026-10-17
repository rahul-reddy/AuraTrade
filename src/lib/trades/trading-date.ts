import type { Prisma } from '@/generated/prisma'

/**
 * Trading-day bucketing for realized P&L.
 *
 * A trade's entryTime/exitTime order events and can fall on a different UTC
 * date from the session they belong to: the account ledger places a date-only
 * option expiration at the end of its trading day (after 00:00Z), and a winter
 * after-hours fill at 19:30 ET is 00:30Z the next day. The ledger therefore
 * stores the exchange trading date separately (entryTradingDate /
 * exitTradingDate, @db.Date). Every daily aggregate — snapshots, the daily P&L
 * series, day-of-week stats and date-range filters — buckets through here.
 *
 * Trades written before trading dates existed fall back to the UTC date of the
 * instant, which is exact for date-only (UTC-midnight) rows.
 */

/** yyyy-MM-dd bucket for a trade event. */
export function tradingDayKey(
  tradingDate: Date | string | null | undefined,
  instant: Date | string,
): string {
  if (tradingDate != null) {
    return (tradingDate instanceof Date ? tradingDate.toISOString() : tradingDate).slice(0, 10)
  }
  return (instant instanceof Date ? instant : new Date(instant)).toISOString().slice(0, 10)
}

/** Day of week (0 = Sunday) of a yyyy-MM-dd trading day. */
export function tradingDayOfWeek(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00.000Z`).getUTCDay()
}

/**
 * Closed trades whose exit trading day falls in [dateFrom, dateTo] (inclusive
 * yyyy-MM-dd bounds). Returns null when neither bound is set.
 */
export function exitTradingDayRangeWhere(
  dateFrom: string | null,
  dateTo: string | null,
): Prisma.RoundTripTradeWhereInput | null {
  if (!dateFrom && !dateTo) return null
  const day: Prisma.DateTimeNullableFilter = {}
  const instant: Prisma.DateTimeNullableFilter = {}
  if (dateFrom) {
    day.gte = new Date(`${dateFrom}T00:00:00.000Z`)
    instant.gte = new Date(`${dateFrom}T00:00:00.000Z`)
  }
  if (dateTo) {
    day.lte = new Date(`${dateTo}T00:00:00.000Z`)
    instant.lte = new Date(`${dateTo}T23:59:59.999Z`)
  }
  return {
    OR: [
      { exitTradingDate: day },
      { exitTradingDate: null, exitTime: instant },
    ],
  }
}
