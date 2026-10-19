import { calculatePerformanceMetrics } from '@/lib/engine/metrics'
import { calculateWilsonInterval } from '@/lib/engine/edge-analysis'
import { tradingDayKey } from '@/lib/trades/trading-date'

export type InsightTrade = {
  id: string; symbol: string; direction: string; entryTime: string; exitTime: string | null
  exitTradingDate: string | null; isOpen: boolean; netPnl: number | null; totalFees: number
  inferredSetup: string | null; personalSetup: string | null; regime: string | null
  adherence: string; mistakes: string[]; reviewed: boolean
  playbook?: string | null; playbookId?: string | null
}
export type InsightGrouping = 'personalSetup' | 'inferredSetup' | 'direction' | 'regime' | 'adherence' | 'playbook'

/** All result groups use known, closed P&L and the exchange exit date. */
export function groupInsights(trades: InsightTrade[], grouping: InsightGrouping, from = '', to = '') {
  const eligible = trades.filter(trade => {
    if (trade.isOpen || trade.netPnl == null || !trade.exitTime) return false
    const day = tradingDayKey(trade.exitTradingDate, trade.exitTime)
    return (!from || day >= from) && (!to || day <= to)
  })
  const groups = new Map<string, InsightTrade[]>()
  for (const trade of eligible) {
    const key = grouping === 'playbook' ? trade.playbookId || 'Unlabeled' : trade[grouping]?.trim() || 'Unlabeled'
    const members = groups.get(key)
    if (members) members.push(trade)
    else groups.set(key, [trade])
  }
  return [...groups].map(([key, members]) => {
    const label = grouping === 'playbook' ? members[0].playbook || 'Unlabeled' : key
    const { metrics } = calculatePerformanceMetrics(members.map(trade => ({ exitTime: trade.exitTime!, exitTradingDate: trade.exitTradingDate, netPnl: trade.netPnl!, totalFees: trade.totalFees })))
    return { key, label, trades: members, count: members.length, netPnl: metrics.totalNetPnl, fees: metrics.totalFees,
      average: metrics.averageTrade, winRate: metrics.winRate, interval: calculateWilsonInterval(metrics.winCount, metrics.totalTrades) }
  }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}
