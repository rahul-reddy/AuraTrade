import YahooFinance from "yahoo-finance2";

export const SUPPORTED_TIMEFRAMES = ["1d", "1h", "15m", "5m", "1m"] as const;

export type MarketDataTimeframe = (typeof SUPPORTED_TIMEFRAMES)[number];
export const INTRADAY_FALLBACK_MESSAGE =
  "Intraday data not available for this date range. Showing daily.";

export interface MarketDataCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FetchYahooMarketDataOptions {
  symbol: string;
  timeframe: MarketDataTimeframe;
  from: Date;
  to: Date;
  now?: Date;
  client?: YahooFinanceClient;
}

export interface FetchYahooMarketDataResult {
  provider?: "finviz" | "yahoo";
  symbol: string;
  requestedTimeframe: MarketDataTimeframe;
  effectiveTimeframe: MarketDataTimeframe;
  candles: MarketDataCandle[];
  fallbackMessage: string | null;
}

type ChartQuoteRow = {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

type ChartInterval = "1d" | "1h" | "15m" | "5m" | "1m";

export interface YahooFinanceClient {
  chart(
    symbol: string,
    options: {
      period1: Date;
      period2: Date;
      interval: ChartInterval;
      includePrePost: boolean;
      return: "array";
    },
  ): Promise<{ quotes: ChartQuoteRow[] }>;
}

const yahooFinance = new YahooFinance() as unknown as YahooFinanceClient;

const INTRADAY_TIMEFRAMES = new Set<MarketDataTimeframe>(["1h", "15m", "5m", "1m"]);
const MAX_INTRADAY_RANGE_DAYS = 60;
const MAX_INTRADAY_LOOKBACK_DAYS = 730;

export function isMarketDataTimeframe(value: string): value is MarketDataTimeframe {
  return SUPPORTED_TIMEFRAMES.includes(value as MarketDataTimeframe);
}

export function normalizeMarketDataSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function getDefaultMarketDataRange(
  timeframe: MarketDataTimeframe,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const days =
    timeframe === "1d" ? 365 : timeframe === "1h" ? 30 : timeframe === "15m" ? 10 : 5;

  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    to: now,
  };
}

export function getTimeframeDurationMs(timeframe: MarketDataTimeframe): number {
  switch (timeframe) {
    case "1d":
      return 24 * 60 * 60 * 1000;
    case "1h":
      return 60 * 60 * 1000;
    case "15m":
      return 15 * 60 * 1000;
    case "5m":
      return 5 * 60 * 1000;
    case "1m":
      return 60 * 1000;
  }
}

function shouldFallbackToDaily(
  timeframe: MarketDataTimeframe,
  from: Date,
  to: Date,
  now: Date,
): boolean {
  if (!INTRADAY_TIMEFRAMES.has(timeframe)) {
    return false;
  }

  const rangeMs = Math.max(to.getTime() - from.getTime(), 0);
  if (rangeMs > MAX_INTRADAY_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    return true;
  }

  const lookbackMs = Math.max(now.getTime() - to.getTime(), 0);
  return lookbackMs > MAX_INTRADAY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
}

export function resolvePreferredMarketDataTimeframe(
  timeframe: MarketDataTimeframe,
  from: Date,
  to: Date,
  now: Date = new Date(),
): MarketDataTimeframe {
  return shouldFallbackToDaily(timeframe, from, to, now) ? "1d" : timeframe;
}

function normalizeChartRows(rows: ChartQuoteRow[]): MarketDataCandle[] {
  return rows
    .filter((row) => {
      return row.open != null
        && row.high != null
        && row.low != null
        && row.close != null
        && row.volume != null;
    })
    .map((row) => ({
      time: row.date.toISOString(),
      open: row.open as number,
      high: row.high as number,
      low: row.low as number,
      close: row.close as number,
      volume: Math.max(0, Math.trunc(row.volume as number)),
    }))
    .sort((left, right) => left.time.localeCompare(right.time));
}

async function fetchDailyCandles(
  client: YahooFinanceClient,
  symbol: string,
  from: Date,
  to: Date,
): Promise<MarketDataCandle[]> {
  const result = await client.chart(symbol, {
    period1: from,
    period2: to,
    interval: "1d",
    includePrePost: false,
    return: "array",
  });

  return normalizeChartRows(result.quotes);
}

async function fetchIntradayCandles(
  client: YahooFinanceClient,
  symbol: string,
  timeframe: ChartInterval,
  from: Date,
  to: Date,
): Promise<MarketDataCandle[]> {
  const result = await client.chart(symbol, {
    period1: from,
    period2: to,
    interval: timeframe,
    includePrePost: false,
    return: "array",
  });

  return normalizeChartRows(result.quotes);
}

export async function fetchYahooMarketData(
  options: FetchYahooMarketDataOptions,
): Promise<FetchYahooMarketDataResult> {
  const { timeframe, from, to } = options;
  const symbol = normalizeMarketDataSymbol(options.symbol);
  const client = options.client ?? yahooFinance;
  const now = options.now ?? new Date();

  if (from.getTime() > to.getTime()) {
    throw new Error("market_data_invalid_range");
  }

  if (shouldFallbackToDaily(timeframe, from, to, now)) {
    return {
      symbol,
      requestedTimeframe: timeframe,
      effectiveTimeframe: "1d",
      candles: await fetchDailyCandles(client, symbol, from, to),
      fallbackMessage: INTRADAY_FALLBACK_MESSAGE,
    };
  }

  if (!INTRADAY_TIMEFRAMES.has(timeframe)) {
    return {
      symbol,
      requestedTimeframe: timeframe,
      effectiveTimeframe: "1d",
      candles: await fetchDailyCandles(client, symbol, from, to),
      fallbackMessage: null,
    };
  }

  const intradayCandles = await fetchIntradayCandles(
    client,
    symbol,
    timeframe as ChartInterval,
    from,
    to,
  );

  if (intradayCandles.length > 0) {
    return {
      symbol,
      requestedTimeframe: timeframe,
      effectiveTimeframe: timeframe,
      candles: intradayCandles,
      fallbackMessage: null,
    };
  }

  return {
    symbol,
    requestedTimeframe: timeframe,
    effectiveTimeframe: "1d",
    candles: await fetchDailyCandles(client, symbol, from, to),
    fallbackMessage: INTRADAY_FALLBACK_MESSAGE,
  };
}
