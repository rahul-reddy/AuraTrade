import {
  calculatePerformanceMetrics,
  kellyFull,
  kellyHalf,
  kellyQuarter,
  type MetricsTradeInput,
} from '@/lib/engine/metrics'
import type { SetupCategory } from '@/lib/engine/classifier'

export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'CHOPPY'

export interface EdgeTradeInput {
  id: string
  setup: SetupCategory | null
  secondarySetup?: SetupCategory | null
  marketRegime?: MarketRegime | null
  direction: 'LONG' | 'SHORT'
  entryTime: Date | string
  exitTime: Date | string | null
  netPnl: number | null
  totalFees?: number
  entryPrice: number
  totalQty: number
  durationSeconds: number | null
}

export interface WinRateConfidenceInterval {
  lower: number
  upper: number
}

export interface SetupPerformanceSummary {
  setup: SetupCategory
  tradeCount: number
  share: number
  totalNetPnl: number
  averageTrade: number
  averageWin: number
  averageLoss: number
  winRate: number
  winRateConfidenceInterval: WinRateConfidenceInterval
  profitFactor: number | null
  expectancy: number
  kellyFull: number | null
  kellyHalf: number | null
  kellyQuarter: number | null
  pValue: number | null
  isSignificant: boolean
  averageHoldSeconds: number | null
  actualSizeFraction: number | null
  recommendedSizeFraction: number | null
}

export interface StyleProfileEntry {
  setup: SetupCategory
  tradeCount: number
  share: number
}

export interface RegimePerformanceSummary {
  setup: SetupCategory
  regime: MarketRegime
  tradeCount: number
  winRate: number
  expectancy: number
  profitFactor: number | null
  averageTrade: number
}

export interface PersistencePoint {
  tradeNumber: number
  exitDate: string
  expectancy: number
}

export interface EdgePersistenceSummary {
  setup: SetupCategory
  windowSize: number
  points: PersistencePoint[]
  slope: number
  trend: 'STRENGTHENING' | 'STABLE' | 'DECAYING'
}

export interface KellySizingComparison {
  setup: SetupCategory
  actualSizeFraction: number | null
  recommendedSizeFraction: number | null
  gapFraction: number | null
}

export interface Recommendation {
  kind: 'STRONGEST_EDGE' | 'WEAKEST_EDGE' | 'REGIME_EDGE' | 'SIZE_WARNING'
  setup?: SetupCategory
  regime?: MarketRegime
  message: string
}

export interface ExpectedValueEstimate {
  setup: SetupCategory
  similarTradeCount: number
  expectedPnl: number
  confidenceOfProfit: number
  suggestedKellyFraction: number | null
  suggestedNotional: number | null
  averageHoldSeconds: number | null
}

export interface SetupFitScore {
  setup: SetupCategory
  score: number
  reason: string
}

export interface EdgeAnalysisResult {
  styleProfile: StyleProfileEntry[]
  perCategory: SetupPerformanceSummary[]
  regimeCrossReference: RegimePerformanceSummary[]
  persistence: EdgePersistenceSummary[]
  kellySizing: KellySizingComparison[]
  recommendations: Recommendation[]
}

interface ClosedTrade extends EdgeTradeInput {
  setup: SetupCategory
  exitTime: Date | string
  netPnl: number
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sampleStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const average = mean(values)
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatCurrency(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(value).toFixed(0)}`
}

function toClosedTrade(trade: EdgeTradeInput): ClosedTrade | null {
  if (!trade.setup || !trade.exitTime || trade.netPnl == null) return null
  return {
    ...trade,
    setup: trade.setup,
    exitTime: trade.exitTime,
    netPnl: trade.netPnl,
  }
}

function toMetricsTrades(trades: ClosedTrade[]): MetricsTradeInput[] {
  return trades.map((trade) => ({
    exitTime: trade.exitTime,
    netPnl: trade.netPnl,
    totalFees: trade.totalFees,
  }))
}

function getSizeFraction(trade: ClosedTrade, startingBalance: number): number | null {
  if (startingBalance <= 0) return null
  return (trade.entryPrice * trade.totalQty) / startingBalance
}

function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    0.000009984369578019572,
    0.00000015056327351493116,
  ]

  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z)
  }

  let x = 0.9999999999998099
  let denom = z - 1
  for (let index = 0; index < coefficients.length; index += 1) {
    x += coefficients[index] / (denom + index + 1)
  }

  const t = denom + coefficients.length - 0.5
  return (
    0.5 * Math.log(2 * Math.PI) +
    (denom + 0.5) * Math.log(t) -
    t +
    Math.log(x)
  )
}

function incompleteBetaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 200
  const epsilon = 0.0000003
  const minValue = 1e-30

  let qab = a + b
  let qap = a + 1
  let qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < minValue) d = minValue
  d = 1 / d
  let h = d

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const evenIteration = 2 * iteration
    let numerator = (iteration * (b - iteration) * x) / ((qam + evenIteration) * (a + evenIteration))
    d = 1 + numerator * d
    if (Math.abs(d) < minValue) d = minValue
    c = 1 + numerator / c
    if (Math.abs(c) < minValue) c = minValue
    d = 1 / d
    h *= d * c

    numerator = (-(a + iteration) * (qab + iteration) * x) / ((a + evenIteration) * (qap + evenIteration))
    d = 1 + numerator * d
    if (Math.abs(d) < minValue) d = minValue
    c = 1 + numerator / c
    if (Math.abs(c) < minValue) c = minValue
    d = 1 / d
    const delta = d * c
    h *= delta

    if (Math.abs(delta - 1) < epsilon) {
      break
    }
  }

  return h
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  const logBeta =
    logGamma(a + b) -
    logGamma(a) -
    logGamma(b) +
    a * Math.log(x) +
    b * Math.log(1 - x)
  const front = Math.exp(logBeta)

  if (x < (a + 1) / (a + b + 2)) {
    return (front * incompleteBetaContinuedFraction(a, b, x)) / a
  }

  return 1 - (front * incompleteBetaContinuedFraction(b, a, 1 - x)) / b
}

function studentsTCdf(t: number, degreesOfFreedom: number): number {
  if (degreesOfFreedom <= 0) return 0.5
  if (t === 0) return 0.5

  const x = degreesOfFreedom / (degreesOfFreedom + t ** 2)
  const beta = regularizedIncompleteBeta(x, degreesOfFreedom / 2, 0.5)

  if (t > 0) {
    return 1 - 0.5 * beta
  }

  return 0.5 * beta
}

export function calculateWilsonInterval(
  wins: number,
  total: number,
  z = 1.96,
): WinRateConfidenceInterval {
  if (total <= 0) return { lower: 0, upper: 0 }

  const p = wins / total
  const z2 = z ** 2
  const denom = 1 + z2 / total
  const center = (p + z2 / (2 * total)) / denom
  const margin =
    (z *
      Math.sqrt((p * (1 - p)) / total + z2 / (4 * total ** 2))) /
    denom

  return {
    lower: clamp(center - margin, 0, 1),
    upper: clamp(center + margin, 0, 1),
  }
}

export function calculateOneSampleTTestPValue(samples: number[]): number | null {
  if (samples.length < 2) return null

  const average = mean(samples)
  const deviation = sampleStandardDeviation(samples)

  if (deviation === 0) {
    return average === 0 ? 1 : 0
  }

  const tStatistic = average / (deviation / Math.sqrt(samples.length))
  const cdf = studentsTCdf(Math.abs(tStatistic), samples.length - 1)
  return clamp(2 * (1 - cdf), 0, 1)
}

function buildStyleProfile(trades: ClosedTrade[]): StyleProfileEntry[] {
  const total = trades.length
  const counts = new Map<SetupCategory, number>()

  for (const trade of trades) {
    counts.set(trade.setup, (counts.get(trade.setup) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([setup, tradeCount]) => ({
      setup,
      tradeCount,
      share: total > 0 ? tradeCount / total : 0,
    }))
    .sort((left, right) => right.tradeCount - left.tradeCount)
}

function summarizeSetup(
  setup: SetupCategory,
  trades: ClosedTrade[],
  totalClassifiedTrades: number,
  startingBalance: number,
): SetupPerformanceSummary {
  const summary = calculatePerformanceMetrics(toMetricsTrades(trades), 0).metrics
  const holdTimes = trades
    .map((trade) => trade.durationSeconds)
    .filter((value): value is number => value != null)
  const sizeFractions = trades
    .map((trade) => getSizeFraction(trade, startingBalance))
    .filter((value): value is number => value != null)
  const samples = trades.map((trade) => trade.netPnl)
  const pValue = calculateOneSampleTTestPValue(samples)

  return {
    setup,
    tradeCount: trades.length,
    share: totalClassifiedTrades > 0 ? trades.length / totalClassifiedTrades : 0,
    totalNetPnl: summary.totalNetPnl,
    averageTrade: summary.averageTrade,
    averageWin: summary.avgWin,
    averageLoss: summary.avgLoss,
    winRate: summary.winRate,
    winRateConfidenceInterval: calculateWilsonInterval(summary.winCount, summary.totalTrades),
    profitFactor: summary.profitFactor,
    expectancy: summary.expectancy,
    kellyFull: kellyFull(summary.winRate, summary.avgWin, summary.avgLoss),
    kellyHalf: kellyHalf(summary.winRate, summary.avgWin, summary.avgLoss),
    kellyQuarter: kellyQuarter(summary.winRate, summary.avgWin, summary.avgLoss),
    pValue,
    isSignificant: pValue != null && pValue < 0.05,
    averageHoldSeconds: holdTimes.length > 0 ? mean(holdTimes) : null,
    actualSizeFraction: sizeFractions.length > 0 ? mean(sizeFractions) : null,
    recommendedSizeFraction: kellyHalf(summary.winRate, summary.avgWin, summary.avgLoss),
  }
}

function buildPerCategory(
  trades: ClosedTrade[],
  startingBalance: number,
): SetupPerformanceSummary[] {
  const grouped = new Map<SetupCategory, ClosedTrade[]>()

  for (const trade of trades) {
    const current = grouped.get(trade.setup) ?? []
    current.push(trade)
    grouped.set(trade.setup, current)
  }

  return [...grouped.entries()]
    .map(([setup, setupTrades]) =>
      summarizeSetup(setup, setupTrades, trades.length, startingBalance),
    )
    .sort((left, right) => right.tradeCount - left.tradeCount)
}

function buildRegimeCrossReference(trades: ClosedTrade[]): RegimePerformanceSummary[] {
  const grouped = new Map<string, ClosedTrade[]>()

  for (const trade of trades) {
    if (trade.marketRegime == null) continue
    const regime = trade.marketRegime
    const key = `${trade.setup}:${regime}`
    const current = grouped.get(key) ?? []
    current.push(trade)
    grouped.set(key, current)
  }

  return [...grouped.entries()]
    .map(([key, setupTrades]) => {
      const [setup, regime] = key.split(':') as [SetupCategory, MarketRegime]
      const metrics = calculatePerformanceMetrics(toMetricsTrades(setupTrades), 0).metrics

      return {
        setup,
        regime,
        tradeCount: setupTrades.length,
        winRate: metrics.winRate,
        expectancy: metrics.expectancy,
        profitFactor: metrics.profitFactor,
        averageTrade: metrics.averageTrade,
      }
    })
    .sort((left, right) => right.tradeCount - left.tradeCount)
}

function calculateSlope(values: number[]): number {
  if (values.length < 2) return 0

  const xMean = (values.length + 1) / 2
  const yMean = mean(values)
  let numerator = 0
  let denominator = 0

  for (let index = 0; index < values.length; index += 1) {
    const x = index + 1
    numerator += (x - xMean) * (values[index] - yMean)
    denominator += (x - xMean) ** 2
  }

  return denominator === 0 ? 0 : numerator / denominator
}

function buildPersistence(
  trades: ClosedTrade[],
  windowSize: number,
): EdgePersistenceSummary[] {
  const grouped = new Map<SetupCategory, ClosedTrade[]>()

  for (const trade of trades) {
    const current = grouped.get(trade.setup) ?? []
    current.push(trade)
    grouped.set(trade.setup, current)
  }

  return [...grouped.entries()]
    .map(([setup, setupTrades]) => {
      const sorted = [...setupTrades].sort((left, right) =>
        new Date(left.exitTime).getTime() - new Date(right.exitTime).getTime(),
      )

      const points = sorted.map((trade, index) => {
        const start = Math.max(0, index - windowSize + 1)
        const slice = sorted.slice(start, index + 1)
        return {
          tradeNumber: index + 1,
          exitDate: new Date(trade.exitTime).toISOString().slice(0, 10),
          expectancy: mean(slice.map((entry) => entry.netPnl)),
        }
      })

      const slope = calculateSlope(points.map((point) => point.expectancy))
      const scale = Math.max(Math.abs(mean(points.map((point) => point.expectancy))), 25)
      const trend: EdgePersistenceSummary['trend'] =
        slope > scale * 0.05
          ? 'STRENGTHENING'
          : slope < -scale * 0.05
            ? 'DECAYING'
            : 'STABLE'

      return {
        setup,
        windowSize,
        points,
        slope,
        trend,
      }
    })
    .sort((left, right) => right.points.length - left.points.length)
}

function buildKellySizing(perCategory: SetupPerformanceSummary[]): KellySizingComparison[] {
  return perCategory.map((entry) => ({
    setup: entry.setup,
    actualSizeFraction: entry.actualSizeFraction,
    recommendedSizeFraction: entry.recommendedSizeFraction,
    gapFraction:
      entry.actualSizeFraction != null && entry.recommendedSizeFraction != null
        ? entry.actualSizeFraction - entry.recommendedSizeFraction
        : null,
  }))
}

function buildRecommendations(
  perCategory: SetupPerformanceSummary[],
  regimeCrossReference: RegimePerformanceSummary[],
  kellySizing: KellySizingComparison[],
): Recommendation[] {
  const recommendations: Recommendation[] = []

  const strongest = [...perCategory]
    .filter((entry) => entry.tradeCount >= 5 && entry.expectancy > 0)
    .sort((left, right) => right.expectancy - left.expectancy)[0]
  if (strongest) {
    recommendations.push({
      kind: 'STRONGEST_EDGE',
      setup: strongest.setup,
      message: `Your ${strongest.setup.toLowerCase()} trades are your strongest edge (${formatPercent(strongest.winRate)} WR, expectancy ${formatCurrency(strongest.expectancy)}).`,
    })
  }

  const weakest = [...perCategory]
    .filter((entry) => entry.tradeCount >= 5 && entry.expectancy < 0)
    .sort((left, right) => left.expectancy - right.expectancy)[0]
  if (weakest) {
    recommendations.push({
      kind: 'WEAKEST_EDGE',
      setup: weakest.setup,
      message: `Your ${weakest.setup.toLowerCase()} trades are destroying value (${formatPercent(weakest.winRate)} WR, expectancy ${formatCurrency(weakest.expectancy)}).`,
    })
  }

  const groupedBySetup = new Map<SetupCategory, RegimePerformanceSummary[]>()
  for (const row of regimeCrossReference) {
    const current = groupedBySetup.get(row.setup) ?? []
    current.push(row)
    groupedBySetup.set(row.setup, current)
  }

  for (const [setup, rows] of groupedBySetup.entries()) {
    if (rows.length < 2) continue
    const sorted = [...rows].sort((left, right) => right.winRate - left.winRate)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    if (best.tradeCount >= 3 && worst.tradeCount >= 3 && best.winRate - worst.winRate >= 0.15) {
      recommendations.push({
        kind: 'REGIME_EDGE',
        setup,
        regime: best.regime,
        message: `Your ${setup.toLowerCase()} trades work best in ${best.regime.toLowerCase()} markets (${formatPercent(best.winRate)} WR) and weakest in ${worst.regime.toLowerCase()} markets (${formatPercent(worst.winRate)} WR).`,
      })
      break
    }
  }

  const sizeWarning = [...kellySizing]
    .filter(
      (entry) =>
        entry.actualSizeFraction != null &&
        entry.recommendedSizeFraction != null &&
        entry.actualSizeFraction > entry.recommendedSizeFraction * 1.25,
    )
    .sort((left, right) => (right.gapFraction ?? 0) - (left.gapFraction ?? 0))[0]
  if (sizeWarning) {
    recommendations.push({
      kind: 'SIZE_WARNING',
      setup: sizeWarning.setup,
      message: `You're sizing ${sizeWarning.setup.toLowerCase()} trades above half-Kelly (${formatPercent(sizeWarning.actualSizeFraction ?? 0)} actual vs ${formatPercent(sizeWarning.recommendedSizeFraction ?? 0)} recommended).`,
    })
  }

  return recommendations
}

export function buildEdgeAnalysis(input: {
  trades: EdgeTradeInput[]
  startingBalance: number
  persistenceWindow?: number
}): EdgeAnalysisResult {
  const closedTrades = input.trades
    .map(toClosedTrade)
    .filter((trade): trade is ClosedTrade => trade != null)

  const perCategory = buildPerCategory(closedTrades, input.startingBalance)
  const regimeCrossReference = buildRegimeCrossReference(closedTrades)
  const persistence = buildPersistence(closedTrades, input.persistenceWindow ?? 20)
  const kellySizing = buildKellySizing(perCategory)

  return {
    styleProfile: buildStyleProfile(closedTrades),
    perCategory,
    regimeCrossReference,
    persistence,
    kellySizing,
    recommendations: buildRecommendations(perCategory, regimeCrossReference, kellySizing),
  }
}

export function estimateExpectedValue(input: {
  analysis: EdgeAnalysisResult
  setup: SetupCategory
  accountBalance?: number
}): ExpectedValueEstimate | null {
  const setupStats = input.analysis.perCategory.find((entry) => entry.setup === input.setup)
  if (!setupStats) return null

  return {
    setup: input.setup,
    similarTradeCount: setupStats.tradeCount,
    expectedPnl: setupStats.expectancy,
    confidenceOfProfit: setupStats.winRate,
    suggestedKellyFraction: setupStats.kellyHalf,
    suggestedNotional:
      input.accountBalance != null &&
      setupStats.kellyHalf != null &&
      setupStats.kellyHalf > 0
        ? input.accountBalance * setupStats.kellyHalf
        : null,
    averageHoldSeconds: setupStats.averageHoldSeconds,
  }
}

export function scoreSetupFit(input: {
  analysis: EdgeAnalysisResult
  setup: SetupCategory
}): SetupFitScore | null {
  const setupStats = input.analysis.perCategory.find((entry) => entry.setup === input.setup)
  if (!setupStats) return null

  let score = 5
  if (setupStats.expectancy > 0) score += 2
  else if (setupStats.expectancy < 0) score -= 2

  if (setupStats.profitFactor != null && setupStats.profitFactor >= 1.5) score += 1
  else if (setupStats.profitFactor != null && setupStats.profitFactor < 1) score -= 1

  if (setupStats.isSignificant) score += 1
  if (setupStats.tradeCount < 5) score -= 1

  const clampedScore = clamp(score, 1, 10)
  const reason =
    setupStats.expectancy >= 0
      ? `${input.setup} is aligned with your demonstrated edge profile.`
      : `${input.setup} has negative expectancy in your current history.`

  return {
    setup: input.setup,
    score: clampedScore,
    reason,
  }
}
