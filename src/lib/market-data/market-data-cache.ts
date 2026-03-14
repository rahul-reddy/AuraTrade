import { prisma } from "@/lib/prisma";
import {
  INTRADAY_FALLBACK_MESSAGE,
  fetchYahooMarketData,
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
  source: "cache" | "yahoo" | "cache-stale";
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

function formatCacheRows(rows: CacheRow[]): MarketDataCandle[] {
  return rows.map((row) => ({
    time: row.date.toISOString(),
    open: row.open.toNumber(),
    high: row.high.toNumber(),
    low: row.low.toNumber(),
    close: row.close.toNumber(),
    volume: Number(row.volume),
  }));
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

  return rows.some((row) => {
    return row.date.getTime() >= todayStart.getTime()
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
      const date = new Date(candle.time);
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
  const fetcher = deps.fetcher ?? fetchYahooMarketData;
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
      source: "yahoo",
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
