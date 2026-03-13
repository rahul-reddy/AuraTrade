import {
  fetchYahooMarketData,
  type YahooFinanceClient,
} from "@/lib/market-data/yahoo-client";

describe("fetchYahooMarketData", () => {
  it("falls back to daily candles when the requested intraday range is too large", async () => {
    const historical = jest.fn<ReturnType<YahooFinanceClient["historical"]>, Parameters<YahooFinanceClient["historical"]>>()
      .mockResolvedValue([
        {
          date: new Date("2026-01-02T00:00:00.000Z"),
          open: 100,
          high: 105,
          low: 99,
          close: 104,
          volume: 1200000,
        },
      ]);
    const chart = jest.fn<ReturnType<YahooFinanceClient["chart"]>, Parameters<YahooFinanceClient["chart"]>>();

    const result = await fetchYahooMarketData({
      symbol: "aapl",
      timeframe: "1h",
      from: new Date("2025-01-01T00:00:00.000Z"),
      to: new Date("2025-04-15T00:00:00.000Z"),
      client: { historical, chart },
    });

    expect(result.symbol).toBe("AAPL");
    expect(result.requestedTimeframe).toBe("1h");
    expect(result.effectiveTimeframe).toBe("1d");
    expect(result.fallbackMessage).toBe(
      "Intraday data not available for this date range. Showing daily.",
    );
    expect(result.candles).toHaveLength(1);
    expect(chart).not.toHaveBeenCalled();
    expect(historical).toHaveBeenCalledTimes(1);
  });

  it("uses intraday chart data when available and filters incomplete candles", async () => {
    const historical = jest.fn<ReturnType<YahooFinanceClient["historical"]>, Parameters<YahooFinanceClient["historical"]>>();
    const chart = jest.fn<ReturnType<YahooFinanceClient["chart"]>, Parameters<YahooFinanceClient["chart"]>>()
      .mockResolvedValue({
        quotes: [
          {
            date: new Date("2026-03-10T14:30:00.000Z"),
            open: 100,
            high: 101,
            low: 99.5,
            close: 100.75,
            volume: 12000,
          },
          {
            date: new Date("2026-03-10T14:45:00.000Z"),
            open: null,
            high: 101,
            low: 99.5,
            close: 100.75,
            volume: 12000,
          },
        ],
      });

    const result = await fetchYahooMarketData({
      symbol: "msft",
      timeframe: "15m",
      from: new Date("2026-03-10T00:00:00.000Z"),
      to: new Date("2026-03-11T00:00:00.000Z"),
      client: { historical, chart },
    });

    expect(result.symbol).toBe("MSFT");
    expect(result.effectiveTimeframe).toBe("15m");
    expect(result.fallbackMessage).toBeNull();
    expect(result.candles).toEqual([
      {
        time: "2026-03-10T14:30:00.000Z",
        open: 100,
        high: 101,
        low: 99.5,
        close: 100.75,
        volume: 12000,
      },
    ]);
    expect(chart).toHaveBeenCalledTimes(1);
    expect(historical).not.toHaveBeenCalled();
  });

  it("filters malformed daily rows instead of surfacing the yahoo historical null-row error", async () => {
    const historical = jest
      .fn<ReturnType<YahooFinanceClient["historical"]>, Parameters<YahooFinanceClient["historical"]>>()
      .mockResolvedValue([
        {
          date: new Date("2026-03-10T00:00:00.000Z"),
          open: 48.1,
          high: 49.2,
          low: 47.9,
          close: 48.7,
          volume: 1500000,
        },
        {
          date: new Date("2026-03-11T00:00:00.000Z"),
          open: null,
          high: 49.5,
          low: 48.4,
          close: 49.1,
          volume: 1100000,
        },
      ]);
    const chart = jest.fn<ReturnType<YahooFinanceClient["chart"]>, Parameters<YahooFinanceClient["chart"]>>();

    const result = await fetchYahooMarketData({
      symbol: "ibit",
      timeframe: "1d",
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-30T00:00:00.000Z"),
      client: { historical, chart },
    });

    expect(result.symbol).toBe("IBIT");
    expect(result.effectiveTimeframe).toBe("1d");
    expect(result.fallbackMessage).toBeNull();
    expect(result.candles).toEqual([
      {
        time: "2026-03-10T00:00:00.000Z",
        open: 48.1,
        high: 49.2,
        low: 47.9,
        close: 48.7,
        volume: 1500000,
      },
    ]);
    expect(historical).toHaveBeenCalledWith(
      "IBIT",
      expect.objectContaining({
        interval: "1d",
      }),
      { validateResult: false },
    );
    expect(chart).not.toHaveBeenCalled();
  });
});
