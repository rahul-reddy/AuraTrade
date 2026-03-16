export interface MetricsTradeInput {
  exitTime: Date | string
  netPnl: number
  totalFees?: number
}

export interface DailyPerformancePoint {
  date: string
  pnl: number
  cumulativePnl: number
  tradeCount: number
  winCount: number
  lossCount: number
  breakevenCount: number
}

export interface DrawdownResult {
  amount: number
  ratio: number
}

export interface PerformanceMetrics {
  totalTrades: number
  winCount: number
  lossCount: number
  breakevenCount: number
  grossWins: number
  grossLosses: number
  totalNetPnl: number
  totalFees: number
  averageTrade: number
  avgWin: number
  avgLoss: number
  winRate: number
  lossRate: number
  profitFactor: number | null
  payoffRatio: number | null
  expectancy: number
  sharpeApprox: number | null
  maxDrawdown: number
  maxDrawdownAmount: number
  kellyFull: number | null
  kellyHalf: number | null
  kellyQuarter: number | null
}

export interface PerformanceSummary {
  metrics: PerformanceMetrics
  dailySeries: DailyPerformancePoint[]
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return sum(values) / values.length
}

function dateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString().slice(0, 10)
}

export function calculateWinRate(wins: number, totalTrades: number): number {
  if (totalTrades <= 0) return 0
  return wins / totalTrades
}

export function calculateProfitFactor(grossWins: number, grossLosses: number): number | null {
  if (grossLosses <= 0) return null
  return grossWins / grossLosses
}

export function calculatePayoffRatio(avgWin: number, avgLoss: number): number | null {
  if (avgWin <= 0 || avgLoss <= 0) return null
  return avgWin / avgLoss
}

export function calculateExpectancy(
  winRate: number,
  avgWin: number,
  lossRate: number,
  avgLoss: number,
): number {
  return (winRate * avgWin) - (lossRate * avgLoss)
}

export function kellyFull(winRate: number, avgWin: number, avgLoss: number): number | null {
  const payoffRatio = calculatePayoffRatio(avgWin, avgLoss)
  if (payoffRatio === null) return null

  const lossRate = 1 - winRate
  return winRate - (lossRate / payoffRatio)
}

export function kellyHalf(winRate: number, avgWin: number, avgLoss: number): number | null {
  const full = kellyFull(winRate, avgWin, avgLoss)
  return full === null ? null : full / 2
}

export function kellyQuarter(winRate: number, avgWin: number, avgLoss: number): number | null {
  const full = kellyFull(winRate, avgWin, avgLoss)
  return full === null ? null : full / 4
}

export function calculateSharpeApprox(dailyPnls: number[]): number | null {
  if (dailyPnls.length < 2) return null

  const average = mean(dailyPnls)
  const variance =
    dailyPnls.reduce((total, pnl) => total + (pnl - average) ** 2, 0) / (dailyPnls.length - 1)

  if (variance === 0) return null

  return (average / Math.sqrt(variance)) * Math.sqrt(252)
}

export function calculateMaxDrawdown(
  dailyPnls: number[],
  startingBalance = 0,
): DrawdownResult {
  let equity = startingBalance
  let peakEquity = startingBalance
  let maxDrawdownAmount = 0
  let maxDrawdownRatio = 0

  for (const pnl of dailyPnls) {
    equity += pnl
    peakEquity = Math.max(peakEquity, equity)
    const drawdownAmount = peakEquity - equity
    maxDrawdownAmount = Math.max(maxDrawdownAmount, drawdownAmount)

    if (peakEquity > 0) {
      maxDrawdownRatio = Math.max(maxDrawdownRatio, drawdownAmount / peakEquity)
    }
  }

  return {
    amount: maxDrawdownAmount,
    ratio: maxDrawdownRatio,
  }
}

export function buildDailyPerformanceSeries(
  trades: MetricsTradeInput[],
): DailyPerformancePoint[] {
  const grouped = new Map<string, Omit<DailyPerformancePoint, 'date' | 'cumulativePnl'>>()

  for (const trade of trades) {
    const key = dateKey(trade.exitTime)
    const current = grouped.get(key) ?? {
      pnl: 0,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
      breakevenCount: 0,
    }

    current.pnl += trade.netPnl
    current.tradeCount += 1

    if (trade.netPnl > 0) current.winCount += 1
    else if (trade.netPnl < 0) current.lossCount += 1
    else current.breakevenCount += 1

    grouped.set(key, current)
  }

  let cumulativePnl = 0

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, point]) => {
      cumulativePnl += point.pnl
      return {
        date,
        pnl: point.pnl,
        cumulativePnl,
        tradeCount: point.tradeCount,
        winCount: point.winCount,
        lossCount: point.lossCount,
        breakevenCount: point.breakevenCount,
      }
    })
}

export function calculatePerformanceMetrics(
  trades: MetricsTradeInput[],
  startingBalance = 0,
): PerformanceSummary {
  const pnls = trades.map((trade) => trade.netPnl)
  const wins = pnls.filter((pnl) => pnl > 0)
  const losses = pnls.filter((pnl) => pnl < 0)
  const grossWins = sum(wins)
  const grossLosses = Math.abs(sum(losses))
  const totalTrades = trades.length
  const winCount = wins.length
  const lossCount = losses.length
  const breakevenCount = totalTrades - winCount - lossCount
  const totalNetPnl = sum(pnls)
  const totalFees = sum(trades.map((trade) => trade.totalFees ?? 0))
  const avgWin = winCount > 0 ? grossWins / winCount : 0
  const avgLoss = lossCount > 0 ? grossLosses / lossCount : 0
  const winRate = calculateWinRate(winCount, totalTrades)
  const lossRate = calculateWinRate(lossCount, totalTrades)
  const payoffRatio = calculatePayoffRatio(avgWin, avgLoss)
  const dailySeries = buildDailyPerformanceSeries(trades)
  const dailyPnls = dailySeries.map((point) => point.pnl)
  const drawdown = calculateMaxDrawdown(dailyPnls, startingBalance)

  return {
    metrics: {
      totalTrades,
      winCount,
      lossCount,
      breakevenCount,
      grossWins,
      grossLosses,
      totalNetPnl,
      totalFees,
      averageTrade: totalTrades > 0 ? totalNetPnl / totalTrades : 0,
      avgWin,
      avgLoss,
      winRate,
      lossRate,
      profitFactor: calculateProfitFactor(grossWins, grossLosses),
      payoffRatio,
      expectancy: calculateExpectancy(winRate, avgWin, lossRate, avgLoss),
      sharpeApprox: calculateSharpeApprox(dailyPnls),
      maxDrawdown: drawdown.ratio,
      maxDrawdownAmount: drawdown.amount,
      kellyFull: kellyFull(winRate, avgWin, avgLoss),
      kellyHalf: kellyHalf(winRate, avgWin, avgLoss),
      kellyQuarter: kellyQuarter(winRate, avgWin, avgLoss),
    },
    dailySeries,
  }
}
