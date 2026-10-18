import { getMarketData, hasUsableCache } from "@/lib/market-data/market-data-cache";
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
  it("reuses recently refreshed daily history on a weekend without inventing a weekend bar", () => {
    const rows = [makeCacheRow({ time: "2026-10-16T00:00:00Z", fetchedAt: "2026-10-18T14:00:00Z", timeframe: "1d" })];
    expect(hasUsableCache(rows, "1d", new Date("2026-10-15"), new Date("2026-10-18T23:59:59Z"), new Date("2026-10-18T14:30:00Z"))).toBe(true);
  });

  it("does not treat a refreshed older daily bar as a fresh latest session", () => {
    const rows = [
      makeCacheRow({ time: "2026-10-15T00:00:00Z", fetchedAt: "2026-10-18T14:00:00Z", timeframe: "1d" }),
      makeCacheRow({ time: "2026-10-16T00:00:00Z", fetchedAt: "2026-10-18T12:00:00Z", timeframe: "1d" }),
    ];
    expect(hasUsableCache(rows, "1d", new Date("2026-10-15"), new Date("2026-10-18T23:59:59Z"), new Date("2026-10-18T14:30:00Z"))).toBe(false);
  });

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

  it("prefers daily cache for stale intraday lookback requests", async () => {
    const findMany = jest.fn().mockResolvedValue([
      makeCacheRow({
        time: "2022-02-06T00:00:00.000Z",
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
        from: new Date("2022-02-05T00:00:00.000Z"),
        to: new Date("2022-02-07T00:00:00.000Z"),
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
    expect(result.effectiveTimeframe).toBe("1d");
    expect(result.fallbackMessage).toBe(
      "Intraday data not available for this date range. Showing daily.",
    );
    expect(fetcher).not.toHaveBeenCalled();
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


it('collapses legacy daily cache timestamps by newest fetch rather than provider clock time', async () => {
  const findMany = jest.fn().mockResolvedValue([
    makeCacheRow({time:'2026-10-16T00:00:00.000Z',timeframe:'1d',fetchedAt:'2026-10-18T12:00:00Z',close:104}),
    makeCacheRow({time:'2026-10-16T13:30:00.000Z',timeframe:'1d',fetchedAt:'2026-10-16T20:00:00Z',close:99}),
  ])
  const result = await getMarketData({symbol:'AAPL',timeframe:'1d',from:new Date('2026-10-16'),to:new Date('2026-10-16T23:59:59Z')}, {prismaClient:{marketDataCache:{findMany,upsert:jest.fn()}},now:()=>new Date('2026-10-18T12:30:00Z'),fetcher:jest.fn()})
  expect(result.candles).toHaveLength(1)
  expect(result.candles[0]).toMatchObject({time:'2026-10-16T00:00:00.000Z',close:104})
})

it('writes new daily cache keys at calendar midnight while retaining intraday instants', async () => {
  const upsert = jest.fn().mockResolvedValue(undefined)
  const options = {symbol:'AAPL',timeframe:'1d' as const,from:new Date('2026-10-16'),to:new Date('2026-10-16T23:59:59Z')}
  const fetcher = jest.fn().mockResolvedValue({symbol:'AAPL',requestedTimeframe:'1d',effectiveTimeframe:'1d',provider:'finviz',fallbackMessage:null,candles:[{time:'2026-10-16T13:30:00Z',open:100,high:105,low:99,close:104,volume:1000}]})
  await getMarketData(options,{prismaClient:{marketDataCache:{findMany:jest.fn().mockResolvedValue([]),upsert}},fetcher})
  expect(upsert.mock.calls[0][0].where.symbol_date_timeframe.date.toISOString()).toBe('2026-10-16T00:00:00.000Z')
})
