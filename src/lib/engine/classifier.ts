/**
 * Phase 11 — Trade Classification Engine
 *
 * Rule-based setup classification driven by pre-computed TradeContext plus
 * trade/execution metadata already stored in the database. No external fetching.
 *
 * Important source-data limitation:
 * Schwab/TDA Transaction History exports are date-only. Same-day trades all
 * collapse to midnight timestamps, so `durationSeconds === 0` is treated as a
 * scalp candidate rather than proof of a literal sub-hour hold.
 */

export const SETUP_CATEGORIES = [
  'BREAKOUT',
  'PULLBACK',
  'MEAN_REVERSION',
  'MOMENTUM',
  'REVERSAL',
  'AVERAGE_DOWN',
  'SCALP',
  'GAP_PLAY',
  'EARNINGS_PLAY',
  'OTHER',
] as const

export type SetupCategory = (typeof SETUP_CATEGORIES)[number]

export interface ClassifierTrade {
  id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  entryPrice: number
  totalQty: number
  durationSeconds: number | null
  isOpen: boolean
}

export interface ClassifierExecution {
  posEffect: 'OPEN' | 'CLOSE' | 'AUTO'
  side: 'BUY' | 'SELL' | 'SELL_SHORT' | 'BUY_TO_COVER'
  execTime: Date
  price: number
  qty: number
  daySeq: number
}

export interface ClassifierContext {
  sma20: number
  sma50: number
  sma200: number
  ema20: number
  atr14: number
  rsi14: number
  adx14: number
  bbUpper: number
  bbLower: number
  highN52w: number
  lowN52w: number
  gapPercent: number
  daysToEarnings: number | null
  marketRegime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'CHOPPY' | null
}

export interface ClassificationDetail {
  score: number
  reasons: string[]
}

export interface ClassificationBreakdown {
  scores: Record<SetupCategory, ClassificationDetail>
  derivedSignals: {
    atrPct: number | null
    daysHeld: number | null
    distanceFromHighPct: number | null
    distanceFromLowPct: number | null
    distanceToEmaAtr: number | null
    entryVsSma20Atr: number | null
    openingFillCount: number
    worseningOpenAdds: number
    sameDayCandidate: boolean
    trendAligned: boolean
  }
}

export interface TradeClassificationResult {
  setup: SetupCategory
  confidence: number
  secondarySetup: SetupCategory | null
  scoreBreakdown: ClassificationBreakdown
}

interface SignalSnapshot {
  atrPct: number | null
  daysHeld: number | null
  distanceFromHighPct: number | null
  distanceFromLowPct: number | null
  distanceToEmaAtr: number | null
  entryVsSma20Atr: number | null
  gapAbs: number
  sameDayCandidate: boolean
  trendAligned: boolean
  regimeAligned: boolean
  aboveTrendStack: boolean
  belowTrendStack: boolean
  oversold: boolean
  overbought: boolean
  nearUpperBand: boolean
  nearLowerBand: boolean
  nearHighBreakout: boolean
  nearLowBreakdown: boolean
  nearHighReversal: boolean
  nearLowReversal: boolean
  worseningOpenAdds: number
  openingFillCount: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits))
}

function emptyDetail(): ClassificationDetail {
  return { score: 0, reasons: [] }
}

function addPoints(detail: ClassificationDetail, points: number, reason: string) {
  if (points <= 0) return
  detail.score += points
  detail.reasons.push(reason)
}

function finalizeDetail(detail: ClassificationDetail): ClassificationDetail {
  return {
    score: clamp(Math.round(detail.score), 0, 100),
    reasons: detail.reasons,
  }
}

function analyzeOpeningFills(
  direction: ClassifierTrade['direction'],
  executions: ClassifierExecution[],
): { openingFillCount: number; worseningOpenAdds: number } {
  const opening = executions
    .filter((execution) => execution.posEffect === 'OPEN')
    .sort((a, b) => {
      const timeDiff = a.execTime.getTime() - b.execTime.getTime()
      if (timeDiff !== 0) return timeDiff
      return a.daySeq - b.daySeq
    })

  if (opening.length < 2) {
    return { openingFillCount: opening.length, worseningOpenAdds: 0 }
  }

  let worseningOpenAdds = 0
  for (let i = 1; i < opening.length; i++) {
    const prev = opening[i - 1]
    const curr = opening[i]
    const gotWorseForLong = direction === 'LONG' && curr.price < prev.price
    const gotWorseForShort = direction === 'SHORT' && curr.price > prev.price
    if (gotWorseForLong || gotWorseForShort) {
      worseningOpenAdds++
    }
  }

  return { openingFillCount: opening.length, worseningOpenAdds }
}

function buildSignalSnapshot(
  trade: ClassifierTrade,
  context: ClassifierContext,
  executions: ClassifierExecution[],
): SignalSnapshot {
  const atrPct = trade.entryPrice > 0 ? context.atr14 / trade.entryPrice : null
  const daysHeld =
    trade.durationSeconds != null ? trade.durationSeconds / (24 * 60 * 60) : null
  const distanceFromHighPct =
    context.highN52w > 0 ? (context.highN52w - trade.entryPrice) / context.highN52w : null
  const distanceFromLowPct =
    trade.entryPrice > 0 ? (trade.entryPrice - context.lowN52w) / trade.entryPrice : null
  const distanceToEmaAtr =
    context.atr14 > 0 ? Math.abs(trade.entryPrice - context.ema20) / context.atr14 : null
  const entryVsSma20Atr =
    context.atr14 > 0 ? (trade.entryPrice - context.sma20) / context.atr14 : null
  const sameDayCandidate = trade.durationSeconds != null && trade.durationSeconds <= 3600
  const aboveTrendStack =
    trade.entryPrice >= context.sma20 &&
    context.sma20 >= context.sma50 &&
    context.sma50 >= context.sma200
  const belowTrendStack =
    trade.entryPrice <= context.sma20 &&
    context.sma20 <= context.sma50 &&
    context.sma50 <= context.sma200
  const trendAligned =
    trade.direction === 'LONG' ? aboveTrendStack : belowTrendStack
  const regimeAligned =
    (trade.direction === 'LONG' && context.marketRegime === 'TRENDING_UP') ||
    (trade.direction === 'SHORT' && context.marketRegime === 'TRENDING_DOWN')

  const oversold = trade.direction === 'LONG' ? context.rsi14 <= 35 : context.rsi14 >= 65
  const overbought = trade.direction === 'LONG' ? context.rsi14 >= 65 : context.rsi14 <= 35
  const nearUpperBand =
    trade.direction === 'LONG'
      ? trade.entryPrice >= context.bbUpper * 0.992
      : trade.entryPrice <= context.bbLower * 1.008
  const nearLowerBand =
    trade.direction === 'LONG'
      ? trade.entryPrice <= context.bbLower * 1.008
      : trade.entryPrice >= context.bbUpper * 0.992
  const nearHighBreakout =
    trade.direction === 'LONG'
      ? distanceFromHighPct != null && distanceFromHighPct <= 0.025
      : distanceFromLowPct != null && distanceFromLowPct <= 0.025
  const nearLowBreakdown =
    trade.direction === 'LONG'
      ? distanceFromLowPct != null && distanceFromLowPct <= 0.025
      : distanceFromHighPct != null && distanceFromHighPct <= 0.025
  const nearLowReversal =
    trade.direction === 'LONG'
      ? distanceFromLowPct != null && distanceFromLowPct <= 0.04
      : distanceFromHighPct != null && distanceFromHighPct <= 0.04
  const nearHighReversal =
    trade.direction === 'LONG'
      ? distanceFromHighPct != null && distanceFromHighPct <= 0.04
      : distanceFromLowPct != null && distanceFromLowPct <= 0.04
  const { openingFillCount, worseningOpenAdds } = analyzeOpeningFills(
    trade.direction,
    executions,
  )

  return {
    atrPct,
    daysHeld,
    distanceFromHighPct,
    distanceFromLowPct,
    distanceToEmaAtr,
    entryVsSma20Atr,
    gapAbs: Math.abs(context.gapPercent),
    sameDayCandidate,
    trendAligned,
    regimeAligned,
    aboveTrendStack,
    belowTrendStack,
    oversold,
    overbought,
    nearUpperBand,
    nearLowerBand,
    nearHighBreakout,
    nearLowBreakdown,
    nearHighReversal,
    nearLowReversal,
    worseningOpenAdds,
    openingFillCount,
  }
}

export function calculateSetupScores(
  trade: ClassifierTrade,
  context: ClassifierContext,
  executions: ClassifierExecution[],
): ClassificationBreakdown {
  const signals = buildSignalSnapshot(trade, context, executions)

  const scores: Record<SetupCategory, ClassificationDetail> = {
    BREAKOUT: emptyDetail(),
    PULLBACK: emptyDetail(),
    MEAN_REVERSION: emptyDetail(),
    MOMENTUM: emptyDetail(),
    REVERSAL: emptyDetail(),
    AVERAGE_DOWN: emptyDetail(),
    SCALP: emptyDetail(),
    GAP_PLAY: emptyDetail(),
    EARNINGS_PLAY: emptyDetail(),
    OTHER: emptyDetail(),
  }

  if (signals.nearHighBreakout) {
    addPoints(scores.BREAKOUT, 35, 'Entry is pressing a major breakout level.')
  }
  if (signals.trendAligned) {
    addPoints(scores.BREAKOUT, 25, 'Trend stack is aligned with the trade direction.')
  }
  if (signals.atrPct != null && signals.atrPct <= 0.04) {
    addPoints(scores.BREAKOUT, 15, 'ATR is tight relative to price.')
  }
  if (
    (trade.direction === 'LONG' && context.rsi14 >= 55 && context.rsi14 <= 75) ||
    (trade.direction === 'SHORT' && context.rsi14 <= 45 && context.rsi14 >= 25)
  ) {
    addPoints(scores.BREAKOUT, 10, 'RSI supports a continuation entry.')
  }
  if (signals.regimeAligned) {
    addPoints(scores.BREAKOUT, 15, 'Market regime confirms the continuation thesis.')
  }

  if (signals.trendAligned) {
    addPoints(scores.PULLBACK, 30, 'Primary trend is intact.')
  }
  if (signals.distanceToEmaAtr != null && signals.distanceToEmaAtr <= 1.1) {
    addPoints(scores.PULLBACK, 30, 'Entry is close to the 20 EMA pullback zone.')
  }
  if (context.rsi14 >= 40 && context.rsi14 <= 60) {
    addPoints(scores.PULLBACK, 20, 'RSI has reset into a pullback range.')
  }
  if (signals.regimeAligned) {
    addPoints(scores.PULLBACK, 10, 'Broad market regime supports the setup.')
  }
  if (!signals.nearHighBreakout && !signals.nearLowBreakdown) {
    addPoints(scores.PULLBACK, 10, 'Entry is away from obvious expansion extremes.')
  }

  if (signals.nearLowerBand) {
    addPoints(scores.MEAN_REVERSION, 35, 'Entry is stretched to an outer volatility band.')
  }
  if (
    (trade.direction === 'LONG' && signals.entryVsSma20Atr != null && signals.entryVsSma20Atr <= -1.5) ||
    (trade.direction === 'SHORT' && signals.entryVsSma20Atr != null && signals.entryVsSma20Atr >= 1.5)
  ) {
    addPoints(scores.MEAN_REVERSION, 25, 'Entry is materially stretched from the 20-day mean.')
  }
  if (signals.oversold) {
    addPoints(scores.MEAN_REVERSION, 25, 'RSI is at a mean-reversion extreme.')
  }
  if (context.marketRegime === 'CHOPPY') {
    addPoints(scores.MEAN_REVERSION, 15, 'Choppy regime favors reversion over trend chasing.')
  }

  if (context.adx14 >= 25) {
    addPoints(scores.MOMENTUM, 35, 'ADX shows a directional trend is in force.')
  }
  if (signals.trendAligned) {
    addPoints(scores.MOMENTUM, 25, 'Price structure is aligned with the trend.')
  }
  if (signals.daysHeld != null && signals.daysHeld >= 1) {
    addPoints(scores.MOMENTUM, 25, 'Holding period is long enough to qualify as a momentum hold.')
  }
  if (signals.regimeAligned) {
    addPoints(scores.MOMENTUM, 15, 'Market regime lines up with the trade direction.')
  }

  if (signals.nearLowReversal) {
    addPoints(scores.REVERSAL, 35, 'Entry is near an exhaustion extreme.')
  }
  if (!signals.trendAligned) {
    addPoints(scores.REVERSAL, 25, 'The trade leans against the prevailing price structure.')
  }
  if (signals.oversold || signals.overbought) {
    addPoints(scores.REVERSAL, 20, 'Oscillators show an extended condition.')
  }
  if (
    (trade.direction === 'LONG' && context.marketRegime === 'TRENDING_DOWN') ||
    (trade.direction === 'SHORT' && context.marketRegime === 'TRENDING_UP')
  ) {
    addPoints(scores.REVERSAL, 20, 'Market regime suggests a countertrend reversal attempt.')
  }

  if (signals.openingFillCount >= 2) {
    addPoints(scores.AVERAGE_DOWN, 25, 'The position was built with multiple opening fills.')
  }
  if (signals.worseningOpenAdds > 0) {
    addPoints(scores.AVERAGE_DOWN, 35, 'Adds were made at progressively worse prices.')
  }
  if (signals.openingFillCount >= 3 && signals.worseningOpenAdds >= 2) {
    addPoints(scores.AVERAGE_DOWN, 30, 'Repeated adverse adds strongly fit an average-down pattern.')
  }

  if (signals.sameDayCandidate) {
    addPoints(scores.SCALP, 65, 'Date-only duration marks this as a same-day scalp candidate.')
  } else if (trade.durationSeconds != null && trade.durationSeconds <= 4 * 60 * 60) {
    addPoints(scores.SCALP, 55, 'Short duration fits a scalp-style hold.')
  }
  if (signals.gapAbs >= 0.02) {
    addPoints(scores.SCALP, 10, 'Gap-driven action often compresses the holding window.')
  }

  if (signals.gapAbs >= 0.02) {
    addPoints(scores.GAP_PLAY, 60, 'Gap magnitude is large enough to be a primary driver.')
  }
  if (signals.sameDayCandidate || (signals.daysHeld != null && signals.daysHeld <= 1)) {
    addPoints(scores.GAP_PLAY, 20, 'The holding period matches a gap-driven session trade.')
  }
  if (
    (trade.direction === 'LONG' && context.gapPercent > 0) ||
    (trade.direction === 'SHORT' && context.gapPercent < 0)
  ) {
    addPoints(scores.GAP_PLAY, 20, 'Trade direction follows the opening gap.')
  }

  if (context.daysToEarnings != null && Math.abs(context.daysToEarnings) <= 2) {
    addPoints(scores.EARNINGS_PLAY, 70, 'Trade was entered close to an earnings catalyst.')
  }
  if (signals.gapAbs >= 0.02) {
    addPoints(scores.EARNINGS_PLAY, 15, 'Gap behavior is consistent with earnings volatility.')
  }
  if (context.daysToEarnings != null && Math.abs(context.daysToEarnings) <= 1) {
    addPoints(scores.EARNINGS_PLAY, 15, 'Catalyst timing is extremely close to entry.')
  }

  scores.OTHER = finalizeDetail({
    score: 20,
    reasons: ['Fallback bucket when no single setup is dominant.'],
  })

  for (const setup of SETUP_CATEGORIES) {
    scores[setup] = finalizeDetail(scores[setup])
  }

  return {
    scores,
    derivedSignals: {
      atrPct: signals.atrPct == null ? null : round(signals.atrPct),
      daysHeld: signals.daysHeld == null ? null : round(signals.daysHeld),
      distanceFromHighPct:
        signals.distanceFromHighPct == null ? null : round(signals.distanceFromHighPct),
      distanceFromLowPct:
        signals.distanceFromLowPct == null ? null : round(signals.distanceFromLowPct),
      distanceToEmaAtr:
        signals.distanceToEmaAtr == null ? null : round(signals.distanceToEmaAtr),
      entryVsSma20Atr:
        signals.entryVsSma20Atr == null ? null : round(signals.entryVsSma20Atr),
      openingFillCount: signals.openingFillCount,
      worseningOpenAdds: signals.worseningOpenAdds,
      sameDayCandidate: signals.sameDayCandidate,
      trendAligned: signals.trendAligned,
    },
  }
}

export function classifyTrade(
  trade: ClassifierTrade,
  context: ClassifierContext,
  executions: ClassifierExecution[] = [],
): TradeClassificationResult {
  const scoreBreakdown = calculateSetupScores(trade, context, executions)
  const ranked = SETUP_CATEGORIES
    .filter((setup) => setup !== 'OTHER')
    .map((setup) => ({
      setup,
      score: scoreBreakdown.scores[setup].score,
    }))
    .sort((a, b) => b.score - a.score)

  const top = ranked[0]
  const second = ranked[1]

  if (!top || top.score < 55) {
    return {
      setup: 'OTHER',
      confidence: clamp(top?.score ?? 20, 20, 50),
      secondarySetup: top && top.score >= 45 ? top.setup : null,
      scoreBreakdown,
    }
  }

  const secondarySetup =
    second && second.score >= 55 && top.score - second.score <= 20 ? second.setup : null

  return {
    setup: top.setup,
    confidence: clamp(top.score, 55, 100),
    secondarySetup,
    scoreBreakdown,
  }
}
