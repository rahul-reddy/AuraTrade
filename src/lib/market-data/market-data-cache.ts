import { fetchChartMarketData } from './chart-data-provider';
import { prisma } from "@/lib/prisma";
import {
  INTRADAY_FALLBACK_MESSAGE,
  type FetchYahooMarketDataResult,
  type MarketDataCandle,
  type MarketDataTimeframe,
  resolvePreferredMarketDataTimeframe,
} from "@/lib/market-data/yahoo-client";

export interface GetMarketDataOptions {
  symbol: string;
  timeframe: MarketDataTimeframe;
  from: Date;
  to: Date;
}

export interface GetMarketDataResult extends FetchYahooMarketDataResult {
  source: "cache" | "yahoo" | "finviz" | "cache-stale";
  stale: boolean;
}

type CacheRow = {
  symbol: string;
  date: Date;
  timeframe: string;
  open: { toNumber(): number };
  high: { toNumber(): number };
  low: { toNumber(): number };
  close: { toNumber(): number };
  volume: bigint;
  fetchedAt: Date;
};

interface MarketDataCacheDelegate {
  findMany(args: {
    where: {
      symbol: string;
      timeframe: string;
      date: { gte: Date; lte: Date };
    };
    orderBy: { date: "asc" };
  }): Promise<CacheRow[]>;
  upsert(args: {
    where: {
      symbol_date_timeframe: {
        symbol: string;
        date: Date;
        timeframe: string;
      };
    };
    update: {
      open: number;
      high: number;
      low: number;
      close: number;
      volume: bigint;
      fetchedAt: Date;
    };
    create: {
      symbol: string;
      date: Date;
      timeframe: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: bigint;
      fetchedAt: Date;
    };
  }): Promise<unknown>;
}

interface PrismaLike {
  marketDataCache: MarketDataCacheDelegate;
}

interface GetMarketDataDeps {
  prismaClient?: PrismaLike;
  now?: () => Date;
  fetcher?: (options: GetMarketDataOptions) => Promise<FetchYahooMarketDataResult>;
}

const TODAY_STALE_MS = 60 * 60 * 1000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Daily provider timestamps differ (UTC midnight vs the session open). Collapse
 * legacy duplicates by trading date, choosing the most recently fetched quote.
 * Intraday bars keep their exact instants. No stored row is deleted or rewritten. */
function formatCacheRows(rows: CacheRow[]): MarketDataCandle[] {
  const byTime = new Map<string, CacheRow>()
  for (const row of rows) {
    const time = row.timeframe === '1d' ? `${row.date.toISOString().slice(0, 10)}T00:00:00.000Z` : row.date.toISOString()
    const previous = byTime.get(time)
    if (!previous || row.fetchedAt.getTime() > previous.fetchedAt.getTime()
      || (row.fetchedAt.getTime() === previous.fetchedAt.getTime() && row.date.toISOString() === time)) byTime.set(time, row)
  }
  return [...byTime.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, row]) => ({
    time, open: row.open.toNumber(), high: row.high.toNumber(), low: row.low.toNumber(), close: row.close.toNumber(), volume: Number(row.volume),
  }))
}

function getCoverageToleranceMs(timeframe: MarketDataTimeframe): number {
  switch (timeframe) {
    case "1d":
      return 3 * 24 * 60 * 60 * 1000;
    case "1h":
      return 24 * 60 * 60 * 1000;
    case "15m":
    case "5m":
    case "1m":
      return 24 * 60 * 60 * 1000;
  }
}

export function hasUsableCache(
  rows: CacheRow[],
  timeframe: MarketDataTimeframe,
  from: Date,
  to: Date,
  now: Date,
): boolean {
  if (rows.length === 0) {
    return false;
  }

  const toleranceMs = getCoverageToleranceMs(timeframe);
  const first = rows[0].date.getTime();
  const last = rows[rows.length - 1].date.getTime();
  const coversStart = first <= from.getTime() + toleranceMs;
  const coversEnd = last >= to.getTime() - toleranceMs;

  if (!coversStart || !coversEnd) {
    return false;
  }

  const todayStart = startOfUtcDay(now);
  const includesToday = to.getTime() >= todayStart.getTime();

  if (!includesToday) {
    return true;
  }

  // Daily exports have no weekend/holiday bar. Only freshness of the latest
  // covered session counts; refreshing older history cannot freshen its quote.
  const latestDay = startOfUtcDay(rows[rows.length - 1].date).getTime();
  return rows.some((row) => {
    return (timeframe === "1d" ? startOfUtcDay(row.date).getTime() === latestDay : row.date.getTime() >= todayStart.getTime())
      && now.getTime() - row.fetchedAt.getTime() <= TODAY_STALE_MS;
  });
}

async function persistCandles(
  prismaClient: PrismaLike,
  symbol: string,
  timeframe: MarketDataTimeframe,
  candles: MarketDataCandle[],
  fetchedAt: Date,
): Promise<void> {
  await Promise.all(
    candles.map((candle) => {
      const date = new Date(timeframe === "1d" ? `${candle.time.slice(0,10)}T00:00:00.000Z` : candle.time);
      return prismaClient.marketDataCache.upsert({
        where: {
          symbol_date_timeframe: {
            symbol,
            date,
            timeframe,
          },
        },
        update: {
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: BigInt(candle.volume),
          fetchedAt,
        },
        create: {
          symbol,
          date,
          timeframe,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: BigInt(candle.volume),
          fetchedAt,
        },
      });
    }),
  );
}

export async function getMarketData(
  options: GetMarketDataOptions,
  deps: GetMarketDataDeps = {},
): Promise<GetMarketDataResult> {
  const prismaClient = deps.prismaClient ?? (prisma as unknown as PrismaLike);
  const now = deps.now?.() ?? new Date();
  const fetcher = deps.fetcher ?? fetchChartMarketData;
  const preferredTimeframe = resolvePreferredMarketDataTimeframe(
    options.timeframe,
    options.from,
    options.to,
    now,
  );

  const cachedRows = await prismaClient.marketDataCache.findMany({
    where: {
      symbol: options.symbol,
      timeframe: preferredTimeframe,
      date: {
        gte: options.from,
        lte: options.to,
      },
    },
    orderBy: { date: "asc" },
  });

  if (hasUsableCache(cachedRows, preferredTimeframe, options.from, options.to, now)) {
    return {
      symbol: options.symbol,
      requestedTimeframe: options.timeframe,
      effectiveTimeframe: preferredTimeframe,
      candles: formatCacheRows(cachedRows),
      fallbackMessage:
        preferredTimeframe === options.timeframe ? null : INTRADAY_FALLBACK_MESSAGE,
      source: "cache",
      stale: false,
    };
  }

  try {
    const fetched = await fetcher(options);
    await persistCandles(
      prismaClient,
      fetched.symbol,
      fetched.effectiveTimeframe,
      fetched.candles,
      now,
    );

    return {
      ...fetched,
      source: fetched.provider ?? "yahoo",
      stale: false,
    };
  } catch (error) {
    if (cachedRows.length === 0) {
      throw error;
    }

    return {
      symbol: options.symbol,
      requestedTimeframe: options.timeframe,
      effectiveTimeframe: preferredTimeframe,
      candles: formatCacheRows(cachedRows),
      fallbackMessage: "Live market data refresh failed. Showing cached candles.",
      source: "cache-stale",
      stale: true,
    };
  }
}
