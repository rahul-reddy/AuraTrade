import { getMarketData } from "@/lib/market-data/market-data-cache";
import type { MarketDataTimeframe } from "@/lib/market-data/yahoo-client";

function decimal(value: number) {
  return {
    toNumber: () => value,
  };
}

function makeCacheRow(options: {
  time: string;
  fetchedAt: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: bigint;
  timeframe?: MarketDataTimeframe;
}) {
  return {
    symbol: "AAPL",
    date: new Date(options.time),
    timeframe: options.timeframe ?? "1h",
    open: decimal(options.open ?? 100),
    high: decimal(options.high ?? 101),
    low: decimal(options.low ?? 99),
    close: decimal(options.close ?? 100.5),
    volume: options.volume ?? BigInt(1000),
    fetchedAt: new Date(options.fetchedAt),
  };
}

describe("getMarketData", () => {
  it("returns fresh cache data without refetching", async () => {
    const findMany = jest.fn().mockResolvedValue([
      makeCacheRow({
        time: "2026-03-13T13:00:00.000Z",
        fetchedAt: "2026-03-13T13:15:00.000Z",
      }),
      makeCacheRow({
        time: "2026-03-13T14:00:00.000Z",
        fetchedAt: "2026-03-13T13:15:00.000Z",
      }),
      makeCacheRow({
        time: "2026-03-13T15:00:00.000Z",
        fetchedAt: "2026-03-13T15:20:00.000Z",
      }),
    ]);
    const upsert = jest.fn();
    const fetcher = jest.fn();

    const result = await getMarketData(
      {
        symbol: "AAPL",
        timeframe: "1h",
        from: new Date("2026-03-13T13:00:00.000Z"),
        to: new Date("2026-03-13T15:00:00.000Z"),
      },
      {
        prismaClient: {
          marketDataCache: { findMany, upsert },
        },
        now: () => new Date("2026-03-13T15:30:00.000Z"),
        fetcher,
      },
    );

    expect(result.source).toBe("cache");
    expect(result.stale).toBe(false);
    expect(result.candles).toHaveLength(3);
    expect(fetcher).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("fetches and persists candles when the cache is empty", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const upsert = jest.fn().mockResolvedValue(undefined);
    const fetcher = jest.fn().mockResolvedValue({
      symbol: "AAPL",
      requestedTimeframe: "15m",
      effectiveTimeframe: "15m",
      candles: [
        {
          time: "2026-03-13T14:30:00.000Z",
          open: 100,
          high: 101,
          low: 99.5,
          close: 100.75,
          volume: 12000,
        },
      ],
      fallbackMessage: null,
    });

    const result = await getMarketData(
      {
        symbol: "AAPL",
        timeframe: "15m",
        from: new Date("2026-03-13T14:30:00.000Z"),
        to: new Date("2026-03-13T15:00:00.000Z"),
      },
      {
        prismaClient: {
          marketDataCache: { findMany, upsert },
        },
        now: () => new Date("2026-03-13T15:05:00.000Z"),
        fetcher,
      },
    );

    expect(result.source).toBe("yahoo");
    expect(result.stale).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          symbol: "AAPL",
          timeframe: "15m",
          volume: BigInt(12000),
        }),
      }),
    );
  });

  it("reuses cached daily candles for intraday requests that must fall back", async () => {
    const findMany = jest.fn().mockResolvedValue([
      makeCacheRow({
        time: "2025-01-02T00:00:00.000Z",
        fetchedAt: "2026-03-13T15:00:00.000Z",
        timeframe: "1d",
      }),
      makeCacheRow({
        time: "2025-04-15T00:00:00.000Z",
        fetchedAt: "2026-03-13T15:00:00.000Z",
        timeframe: "1d",
      }),
    ]);
    const upsert = jest.fn();
    const fetcher = jest.fn();

    const result = await getMarketData(
      {
        symbol: "AAPL",
        timeframe: "1h",
        from: new Date("2025-01-01T00:00:00.000Z"),
        to: new Date("2025-04-15T00:00:00.000Z"),
      },
      {
        prismaClient: {
          marketDataCache: { findMany, upsert },
        },
        now: () => new Date("2026-03-13T15:30:00.000Z"),
        fetcher,
      },
    );

    expect(result.source).toBe("cache");
    expect(result.requestedTimeframe).toBe("1h");
    expect(result.effectiveTimeframe).toBe("1d");
    expect(result.fallbackMessage).toBe(
      "Intraday data not available for this date range. Showing daily.",
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          timeframe: "1d",
        }),
      }),
    );
  });

  it("falls back to stale cache when live refresh fails", async () => {
    const findMany = jest.fn().mockResolvedValue([
      makeCacheRow({
        time: "2026-03-13T14:00:00.000Z",
        fetchedAt: "2026-03-13T12:00:00.000Z",
      }),
    ]);
    const upsert = jest.fn();
    const fetcher = jest.fn().mockRejectedValue(new Error("upstream_unavailable"));

    const result = await getMarketData(
      {
        symbol: "AAPL",
        timeframe: "1h",
        from: new Date("2026-03-13T13:00:00.000Z"),
        to: new Date("2026-03-13T15:00:00.000Z"),
      },
      {
        prismaClient: {
          marketDataCache: { findMany, upsert },
        },
        now: () => new Date("2026-03-13T15:30:00.000Z"),
        fetcher,
      },
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("cache-stale");
    expect(result.stale).toBe(true);
    expect(result.fallbackMessage).toBe(
      "Live market data refresh failed. Showing cached candles.",
    );
  });
});
