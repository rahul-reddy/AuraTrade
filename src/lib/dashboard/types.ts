import type { DailyPerformancePoint, PerformanceMetrics } from '@/lib/engine/metrics'

export interface DashboardTradePoint {
  id: string
  symbol: string
  exitTime: string
  /** Exchange trading day (yyyy-MM-dd) of the close; daily buckets use this. */
  exitDate: string
  netPnl: number
  totalQty: number
  entryPrice: number
  durationSeconds: number | null
  sector: string | null
  industry: string | null
}

export interface RollingWinRatePoint {
  tradeNumber: number
  exitDate: string
  windowSize: number
  winRate: number
}

export interface HistogramBucket {
  label: string
  start: number
  end: number
  midpoint: number
  count: number
  normalCount: number
}

export interface DayOfWeekPoint {
  day: string
  dayIndex: number
  pnl: number
  tradeCount: number
  winRate: number
}

export interface ScatterPoint {
  tradeId: string
  symbol: string
  exitDate: string
  pnl: number
  x: number
  xLabel: string
}

export interface HeatmapDay {
  date: string
  day: number
  pnl: number
  intensity: number
  tradeCount: number
}

export interface HeatmapMonth {
  monthKey: string
  monthLabel: string
  totalPnl: number
  days: HeatmapDay[]
}

export interface SectorBreakdownPoint {
  sector: string
  pnl: number
  tradeCount: number
}

export interface DaySummary {
  date: string
  pnl: number
}

export interface StreakSummary {
  direction: 'WIN' | 'LOSS' | 'FLAT'
  count: number
  label: string
}

export interface DashboardInsights {
  rollingWinRate: RollingWinRatePoint[]
  pnlDistribution: HistogramBucket[]
  dayOfWeek: DayOfWeekPoint[]
  durationScatter: ScatterPoint[]
  sizeScatter: ScatterPoint[]
  monthlyHeatmap: HeatmapMonth[]
  sectorBreakdown: SectorBreakdownPoint[]
  bestDay: DaySummary | null
  worstDay: DaySummary | null
  streak: StreakSummary
  avgPositionNotional: number
  avgPositionSizeFraction: number | null
  hourOfDayAvailable: boolean
}

export interface DashboardPayload {
  account: {
    id: string
    name: string
    startingBalance: number
  }
  filters: {
    dateFrom: string | null
    dateTo: string | null
  }
  metrics: PerformanceMetrics
  dailySeries: DailyPerformancePoint[]
  insights: DashboardInsights
}
