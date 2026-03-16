import type { DailyPerformancePoint, PerformanceMetrics } from '@/lib/engine/metrics'
import type {
  DashboardInsights,
  DashboardTradePoint,
  DayOfWeekPoint,
  DaySummary,
  HeatmapMonth,
  HistogramBucket,
  RollingWinRatePoint,
  ScatterPoint,
  SectorBreakdownPoint,
  StreakSummary,
} from '@/lib/dashboard/types'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const average = mean(values)
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function formatMonthLabel(dateKey: string): string {
  return new Date(dateKey + '-01T00:00:00.000Z').toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function getCurrentStreak(sortedTrades: DashboardTradePoint[]): StreakSummary {
  const latestDirectionalTrade = [...sortedTrades]
    .reverse()
    .find((trade) => trade.netPnl !== 0)

  if (!latestDirectionalTrade) {
    return { direction: 'FLAT', count: 0, label: 'No active streak' }
  }

  const direction = latestDirectionalTrade.netPnl > 0 ? 'WIN' : 'LOSS'
  let count = 0

  for (let index = sortedTrades.length - 1; index >= 0; index -= 1) {
    const trade = sortedTrades[index]
    if (trade.netPnl === 0) continue

    const tradeDirection = trade.netPnl > 0 ? 'WIN' : 'LOSS'
    if (tradeDirection !== direction) break
    count += 1
  }

  return {
    direction,
    count,
    label: `${count} ${direction === 'WIN' ? 'trade win' : 'trade loss'}${count === 1 ? '' : 's'}`,
  }
}

function getBestWorstDay(dailySeries: DailyPerformancePoint[]): {
  bestDay: DaySummary | null
  worstDay: DaySummary | null
} {
  if (dailySeries.length === 0) {
    return { bestDay: null, worstDay: null }
  }

  return dailySeries.reduce(
    (acc, point) => ({
      bestDay:
        acc.bestDay === null || point.pnl > acc.bestDay.pnl
          ? { date: point.date, pnl: point.pnl }
          : acc.bestDay,
      worstDay:
        acc.worstDay === null || point.pnl < acc.worstDay.pnl
          ? { date: point.date, pnl: point.pnl }
          : acc.worstDay,
    }),
    { bestDay: null as DaySummary | null, worstDay: null as DaySummary | null },
  )
}

function buildRollingWinRate(sortedTrades: DashboardTradePoint[]): RollingWinRatePoint[] {
  return sortedTrades.map((trade, index) => {
    const start = Math.max(0, index - 19)
    const window = sortedTrades.slice(start, index + 1)
    const wins = window.filter((entry) => entry.netPnl > 0).length
    return {
      tradeNumber: index + 1,
      exitDate: trade.exitTime.slice(0, 10),
      windowSize: window.length,
      winRate: window.length > 0 ? (wins / window.length) * 100 : 0,
    }
  })
}

function buildHistogram(sortedTrades: DashboardTradePoint[]): HistogramBucket[] {
  if (sortedTrades.length === 0) return []

  const pnls = sortedTrades.map((trade) => trade.netPnl)
  const min = Math.min(...pnls)
  const max = Math.max(...pnls)
  const bucketCount = Math.min(12, Math.max(6, Math.ceil(Math.sqrt(sortedTrades.length))))
  const width = max === min ? 1 : (max - min) / bucketCount
  const average = mean(pnls)
  const stdev = standardDeviation(pnls)

  return Array.from({ length: bucketCount }).map((_, index) => {
    const start = min + width * index
    const end = index === bucketCount - 1 ? max : start + width
    const midpoint = start + (end - start) / 2
    const count = sortedTrades.filter((trade) => {
      if (index === bucketCount - 1) {
        return trade.netPnl >= start && trade.netPnl <= end
      }
      return trade.netPnl >= start && trade.netPnl < end
    }).length

    const normalCount =
      stdev > 0
        ? ((1 / (stdev * Math.sqrt(2 * Math.PI))) *
            Math.exp(-((midpoint - average) ** 2) / (2 * stdev ** 2))) *
          width *
          sortedTrades.length
        : 0

    return {
      label: `${Math.round(start)} to ${Math.round(end)}`,
      start,
      end,
      midpoint,
      count,
      normalCount,
    }
  })
}

function buildDayOfWeek(sortedTrades: DashboardTradePoint[]): DayOfWeekPoint[] {
  const grouped = new Map<number, { pnl: number; tradeCount: number; winCount: number }>()

  for (const trade of sortedTrades) {
    const dayIndex = new Date(trade.exitTime).getUTCDay()
    const current = grouped.get(dayIndex) ?? { pnl: 0, tradeCount: 0, winCount: 0 }
    current.pnl += trade.netPnl
    current.tradeCount += 1
    if (trade.netPnl > 0) current.winCount += 1
    grouped.set(dayIndex, current)
  }

  return [1, 2, 3, 4, 5].map((dayIndex) => {
    const current = grouped.get(dayIndex) ?? { pnl: 0, tradeCount: 0, winCount: 0 }
    return {
      day: DAY_LABELS[dayIndex],
      dayIndex,
      pnl: current.pnl,
      tradeCount: current.tradeCount,
      winRate: current.tradeCount > 0 ? (current.winCount / current.tradeCount) * 100 : 0,
    }
  })
}

function buildMonthlyHeatmap(dailySeries: DailyPerformancePoint[]): HeatmapMonth[] {
  if (dailySeries.length === 0) return []

  const maxAbsPnl = Math.max(...dailySeries.map((point) => Math.abs(point.pnl)), 0)
  const grouped = new Map<string, HeatmapMonth>()

  for (const point of dailySeries) {
    const monthKey = point.date.slice(0, 7)
    const existing = grouped.get(monthKey) ?? {
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      totalPnl: 0,
      days: [],
    }

    existing.totalPnl += point.pnl
    existing.days.push({
      date: point.date,
      day: Number.parseInt(point.date.slice(8, 10), 10),
      pnl: point.pnl,
      intensity: maxAbsPnl > 0 ? Math.abs(point.pnl) / maxAbsPnl : 0,
      tradeCount: point.tradeCount,
    })

    grouped.set(monthKey, existing)
  }

  return Array.from(grouped.values()).sort((left, right) => left.monthKey.localeCompare(right.monthKey))
}

function buildScatterPoints(
  sortedTrades: DashboardTradePoint[],
  type: 'duration' | 'size',
  startingBalance: number,
): ScatterPoint[] {
  return sortedTrades.map((trade) => {
    const notional = trade.entryPrice * trade.totalQty
    const x =
      type === 'duration'
        ? trade.durationSeconds ?? 0
        : startingBalance > 0
          ? (notional / startingBalance) * 100
          : notional

    return {
      tradeId: trade.id,
      symbol: trade.symbol,
      exitDate: trade.exitTime.slice(0, 10),
      pnl: trade.netPnl,
      x,
      xLabel: type === 'duration' ? 'Duration' : startingBalance > 0 ? 'Size %' : 'Notional',
    }
  })
}

function buildSectorBreakdown(sortedTrades: DashboardTradePoint[]): SectorBreakdownPoint[] {
  const grouped = new Map<string, { pnl: number; tradeCount: number }>()

  for (const trade of sortedTrades) {
    const sector = trade.sector ?? 'Unknown'
    const current = grouped.get(sector) ?? { pnl: 0, tradeCount: 0 }
    current.pnl += trade.netPnl
    current.tradeCount += 1
    grouped.set(sector, current)
  }

  return Array.from(grouped.entries())
    .map(([sector, point]) => ({ sector, pnl: point.pnl, tradeCount: point.tradeCount }))
    .sort((left, right) => right.pnl - left.pnl)
}

export function buildDashboardInsights(input: {
  trades: DashboardTradePoint[]
  dailySeries: DailyPerformancePoint[]
  metrics: PerformanceMetrics
  startingBalance: number
}): DashboardInsights {
  const sortedTrades = [...input.trades].sort((left, right) => left.exitTime.localeCompare(right.exitTime))
  const averagePositionNotional =
    sortedTrades.length > 0
      ? sortedTrades.reduce((sum, trade) => sum + trade.entryPrice * trade.totalQty, 0) / sortedTrades.length
      : 0
  const { bestDay, worstDay } = getBestWorstDay(input.dailySeries)

  return {
    rollingWinRate: buildRollingWinRate(sortedTrades),
    pnlDistribution: buildHistogram(sortedTrades),
    dayOfWeek: buildDayOfWeek(sortedTrades),
    durationScatter: buildScatterPoints(sortedTrades, 'duration', input.startingBalance),
    sizeScatter: buildScatterPoints(sortedTrades, 'size', input.startingBalance),
    monthlyHeatmap: buildMonthlyHeatmap(input.dailySeries),
    sectorBreakdown: buildSectorBreakdown(sortedTrades),
    bestDay,
    worstDay,
    streak: getCurrentStreak(sortedTrades),
    avgPositionNotional: averagePositionNotional,
    avgPositionSizeFraction:
      input.startingBalance > 0 ? averagePositionNotional / input.startingBalance : null,
    hourOfDayAvailable: false,
  }
}
