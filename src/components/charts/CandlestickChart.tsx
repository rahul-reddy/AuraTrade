"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type SeriesMarker,
  type Time,
  type ISeriesMarkersPluginApi,
} from "lightweight-charts";
import type { MarketDataCandle, MarketDataTimeframe } from "@/lib/market-data/yahoo-client";

// ─── Shared types (exported for page / workspace) ────────────────────────────

export interface ChartFill {
  id: string;
  side: string; // "BUY" | "SELL" | "SELL_SHORT" | "BUY_TO_COVER"
  qty: number;
  price: number;
  time: string; // ISO date
}

export interface ChartTrade {
  id: string;
  direction: string; // "LONG" | "SHORT"
  entryTime: string; // ISO
  exitTime: string | null;
  entryPrice: number;
  exitPrice: number | null;
  totalQty: number;
  netPnl: number | null;
  isOpen: boolean;
  durationSeconds: number | null;
  setup: string | null;
  fills: ChartFill[];
}

// ─── Internals ────────────────────────────────────────────────────────────────

interface OhlcPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ApiMarketDataResponse {
  candles: MarketDataCandle[];
  effectiveTimeframe: MarketDataTimeframe;
  fallbackMessage: string | null;
}

const TIMEFRAME_OPTIONS: ReadonlyArray<MarketDataTimeframe> = ["1d", "1h", "15m", "5m", "1m"];

const TIMEFRAME_LABELS: Record<MarketDataTimeframe, string> = {
  "1d": "1D",
  "1h": "1H",
  "15m": "15M",
  "5m": "5M",
  "1m": "1M",
};

/** Duration of one candle bar in milliseconds per timeframe. Used for volume lookup. */
const TF_DURATION_MS: Record<MarketDataTimeframe, number> = {
  "1d": 86_400_000,
  "1h": 3_600_000,
  "15m": 900_000,
  "5m": 300_000,
  "1m": 60_000,
};

function toUTCTimestamp(isoString: string): UTCTimestamp {
  return Math.floor(new Date(isoString).getTime() / 1000) as UTCTimestamp;
}

/** Pick ideal timeframe from visible duration in days. */
function getPreferredTimeframe(visibleDays: number): MarketDataTimeframe {
  if (visibleDays < 0.08) return "1m";
  if (visibleDays < 0.5) return "5m";
  if (visibleDays < 2) return "15m";
  if (visibleDays < 14) return "1h";
  return "1d";
}

/**
 * Build LWC markers from trade fills. Size scales with qty relative to maxQty.
 *
 * Color semantics:
 *   green  = opening a long position (BUY)
 *   red    = opening a short position (SELL_SHORT)
 *   amber  = closing any position (SELL, BUY_TO_COVER)
 *
 * This prevents BUY_TO_COVER from appearing identical to a long entry.
 */
function buildMarkers(trades: ChartTrade[], maxQty: number): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];

  for (const trade of trades) {
    for (const fill of trade.fills) {
      const isBuyAction = fill.side === "BUY" || fill.side === "BUY_TO_COVER";
      const isOpen = fill.side === "BUY" || fill.side === "SELL_SHORT";
      const relSize = maxQty > 0 ? fill.qty / maxQty : 1;
      const markerSize = Math.max(1, Math.round(relSize * 3));

      // Entry fills: green (long open) or red (short open)
      // Exit fills: amber for both long-close and short-close
      const color = isOpen ? (isBuyAction ? "#22c55e" : "#ef4444") : "#f59e0b";

      markers.push({
        time: toUTCTimestamp(fill.time),
        position: isBuyAction ? "belowBar" : "aboveBar",
        color,
        shape: isBuyAction ? "arrowUp" : "arrowDown",
        text: `${isBuyAction ? "+" : "−"}${fill.qty}@${fill.price.toFixed(2)}`,
        size: markerSize,
      });
    }
  }

  return markers.sort((a, b) => (a.time as number) - (b.time as number));
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CandlestickChartProps {
  initialCandles: MarketDataCandle[];
  initialTimeframe: MarketDataTimeframe;
  initialFallbackMessage: string | null;
  trades: ChartTrade[];
  symbol: string;
  focusTradeId: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CandlestickChart({
  initialCandles,
  initialTimeframe,
  initialFallbackMessage,
  trades,
  symbol,
  focusTradeId,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const autoSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTfRef = useRef<MarketDataTimeframe>(initialTimeframe);
  const isFetchingRef = useRef(false);
  const candlesRef = useRef<MarketDataCandle[]>(initialCandles);

  const [timeframe, setTimeframe] = useState<MarketDataTimeframe>(initialTimeframe);
  const [isLoading, setIsLoading] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(initialFallbackMessage);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hoveredOhlcv, setHoveredOhlcv] = useState<OhlcPoint | null>(null);

  // #3 fix: use reduce instead of spread to avoid call-stack overflow on large fill arrays
  const maxQty = useMemo(() => {
    let max = 1;
    for (const t of trades) {
      for (const f of t.fills) {
        if (f.qty > max) max = f.qty;
      }
    }
    return max;
  }, [trades]);

  // ─── Fetch candles from API ─────────────────────────────────────────────────

  const fetchCandles = useCallback(
    async (
      tf: MarketDataTimeframe,
      from: Date,
      to: Date,
    ): Promise<{ candles: MarketDataCandle[]; effectiveTf: MarketDataTimeframe; fallback: string | null } | null> => {
      if (isFetchingRef.current) return null;
      isFetchingRef.current = true;

      try {
        const params = new URLSearchParams({
          symbol,
          timeframe: tf,
          from: from.toISOString(),
          to: to.toISOString(),
        });
        const res = await fetch(`/api/market-data?${params.toString()}`);
        if (!res.ok) return null;
        const data = (await res.json()) as ApiMarketDataResponse;
        return {
          candles: data.candles,
          effectiveTf: data.effectiveTimeframe,
          fallback: data.fallbackMessage,
        };
      } catch {
        return null;
      } finally {
        isFetchingRef.current = false;
      }
    },
    [symbol],
  );

  // ─── Switch timeframe (manual or auto) ─────────────────────────────────────

  const switchTimeframe = useCallback(
    async (tf: MarketDataTimeframe, opts?: { from?: Date; to?: Date }) => {
      if (!chartRef.current || !seriesRef.current) return;

      const visibleRange = chartRef.current.timeScale().getVisibleRange();
      const visFromMs = visibleRange
        ? (visibleRange.from as number) * 1000
        : Date.now() - 90 * 86_400_000;
      const visToMs = visibleRange ? (visibleRange.to as number) * 1000 : Date.now();
      const durationMs = Math.max(visToMs - visFromMs, 7 * 86_400_000);

      const from = opts?.from ?? new Date(visFromMs - durationMs);
      const to = opts?.to ?? new Date(visToMs + durationMs);

      setIsLoading(true);
      setFetchError(null);
      const result = await fetchCandles(tf, from, to);
      setIsLoading(false);

      if (!result) {
        setFetchError("Failed to fetch market data");
        // Still update TF state to reflect the user's explicit choice
        currentTfRef.current = tf;
        setTimeframe(tf);
        return;
      }

      if (!seriesRef.current || !chartRef.current) return;

      const { candles, effectiveTf, fallback } = result;

      // #2 fix: zero candles is a meaningful failure — surface it and update TF state
      if (candles.length === 0) {
        setFetchError("No data available for this timeframe");
        currentTfRef.current = tf;
        setTimeframe(tf);
        return;
      }

      candlesRef.current = candles;
      currentTfRef.current = effectiveTf;
      setTimeframe(effectiveTf);
      setFallbackMessage(fallback);
      setFetchError(null);

      const chartData = candles.map((c) => ({
        time: toUTCTimestamp(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      seriesRef.current.setData(chartData);

      if (markersRef.current) {
        markersRef.current.setMarkers(buildMarkers(trades, maxQty));
      }

      // Restore visible range so user stays at the same window
      if (visibleRange) {
        try {
          chartRef.current.timeScale().setVisibleRange(visibleRange);
        } catch {
          // Out of new data bounds — ignore
        }
      }
    },
    [fetchCandles, trades, maxQty],
  );

  // ─── Chart initialization (runs once on mount) ──────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#101217" },
        textColor: "#a5adbd",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1b1f28" },
        horzLines: { color: "#1b1f28" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: "#282d38",
        textColor: "#a5adbd",
      },
      timeScale: {
        borderColor: "#282d38",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    // Load initial candle data
    const chartData = candlesRef.current.map((c) => ({
      time: toUTCTimestamp(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    series.setData(chartData);

    // Trade fill markers
    const markersPlugin = createSeriesMarkers(series, buildMarkers(trades, maxQty));

    // Crosshair OHLCV info panel
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHoveredOhlcv(null);
        return;
      }
      const raw = param.seriesData.get(series) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      if (!raw) {
        setHoveredOhlcv(null);
        return;
      }
      const tMs = (param.time as number) * 1000;
      // #9 fix: use per-timeframe tolerance instead of a hardcoded 60s
      const tolerance = TF_DURATION_MS[currentTfRef.current] ?? 86_400_000;
      const candle = candlesRef.current.find(
        (c) => Math.abs(new Date(c.time).getTime() - tMs) <= tolerance,
      );
      setHoveredOhlcv({
        time: new Date(tMs).toISOString(),
        open: raw.open,
        high: raw.high,
        low: raw.low,
        close: raw.close,
        volume: candle?.volume ?? 0,
      });
    });

    // Auto-timeframe switching on zoom (debounced 700ms)
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (autoSwitchTimerRef.current) clearTimeout(autoSwitchTimerRef.current);
      autoSwitchTimerRef.current = setTimeout(() => {
        const vr = chart.timeScale().getVisibleRange();
        if (!vr) return;
        const durationDays = ((vr.to as number) - (vr.from as number)) / 86_400;
        const idealTf = getPreferredTimeframe(durationDays);
        if (idealTf !== currentTfRef.current) {
          void switchTimeframe(idealTf);
        }
      }, 700);
    });

    // Responsive resize
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    resizeObserver.observe(containerRef.current);

    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = markersPlugin;

    return () => {
      if (autoSwitchTimerRef.current) clearTimeout(autoSwitchTimerRef.current);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once — chart is controlled imperatively via refs

  // ─── Zoom to focused trade (or zoom out to all-trades view on deselect) ─────

  useEffect(() => {
    if (!chartRef.current) return;

    if (!focusTradeId) {
      // #13 fix: deselecting a trade zooms out to the full symbol view
      if (trades.length > 0) {
        // Use reduce to avoid Math.min/max spread stack overflow on large arrays (#3)
        const earliestMs = trades.reduce(
          (min, t) => Math.min(min, new Date(t.entryTime).getTime()),
          Infinity,
        );
        const latestMs = trades.reduce(
          (max, t) => Math.max(max, t.exitTime ? new Date(t.exitTime).getTime() : Date.now()),
          -Infinity,
        );
        const spanMs = Math.max(latestMs - earliestMs, 30 * 86_400_000);
        const padMs = spanMs * 0.15;
        try {
          chartRef.current.timeScale().setVisibleRange({
            from: toUTCTimestamp(new Date(earliestMs - padMs).toISOString()),
            to: toUTCTimestamp(new Date(latestMs + padMs).toISOString()),
          });
        } catch {
          chartRef.current.timeScale().fitContent();
        }
      } else {
        chartRef.current.timeScale().fitContent();
      }
      return;
    }

    const trade = trades.find((t) => t.id === focusTradeId);
    if (!trade) return;

    const entryMs = new Date(trade.entryTime).getTime();
    const exitMs = trade.exitTime ? new Date(trade.exitTime).getTime() : Date.now();
    const durationMs = Math.max(exitMs - entryMs, 86_400_000);
    const paddingMs = Math.max(durationMs * 0.5, 5 * 86_400_000);

    try {
      chartRef.current.timeScale().setVisibleRange({
        from: toUTCTimestamp(new Date(entryMs - paddingMs).toISOString()),
        to: toUTCTimestamp(new Date(exitMs + paddingMs).toISOString()),
      });
    } catch {
      // Out of data bounds — ignore
    }
  }, [focusTradeId, trades]);

  // ─── Price lines for focused trade ─────────────────────────────────────────

  useEffect(() => {
    if (!seriesRef.current) return;
    const trade = focusTradeId ? trades.find((t) => t.id === focusTradeId) : null;
    if (!trade) return;

    const entryLine = seriesRef.current.createPriceLine({
      price: trade.entryPrice,
      color: "#3b82f6",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: `Entry ${trade.direction}`,
    });

    // #11 fix: use $ prefix and remove no-op /1 division
    const exitLine =
      trade.exitPrice != null
        ? seriesRef.current.createPriceLine({
            price: trade.exitPrice,
            color: (trade.netPnl ?? 0) >= 0 ? "#22c55e" : "#ef4444",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `Exit ${(trade.netPnl ?? 0) >= 0 ? "+$" : "-$"}${Math.abs(trade.netPnl ?? 0).toFixed(0)}`,
          })
        : null;

    return () => {
      seriesRef.current?.removePriceLine(entryLine);
      if (exitLine) seriesRef.current?.removePriceLine(exitLine);
    };
  }, [focusTradeId, trades]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const closeIsUp = hoveredOhlcv != null && hoveredOhlcv.close >= hoveredOhlcv.open;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar: TF buttons + OHLCV panel + status */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-3 border-b border-zinc-800 bg-zinc-950 shrink-0">
        {/* Timeframe buttons */}
        <div className="flex items-center gap-0.5">
          {TIMEFRAME_OPTIONS.map((tf) => (
            <button
              key={tf}
              onClick={() => void switchTimeframe(tf)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                timeframe === tf
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent"
              }`}
            >
              {TIMEFRAME_LABELS[tf]}
            </button>
          ))}
        </div>

        {/* OHLCV info (updates on crosshair move) */}
        <div className="border-l border-zinc-800 pl-3 ml-1 flex flex-wrap items-center gap-2.5 text-xs font-mono min-w-0">
          {hoveredOhlcv ? (
            <>
              <span className="text-zinc-600">O</span>
              <span className="text-zinc-300">{hoveredOhlcv.open.toFixed(2)}</span>
              <span className="text-zinc-600">H</span>
              <span className="text-green-400">{hoveredOhlcv.high.toFixed(2)}</span>
              <span className="text-zinc-600">L</span>
              <span className="text-red-400">{hoveredOhlcv.low.toFixed(2)}</span>
              <span className="text-zinc-600">C</span>
              <span className={closeIsUp ? "text-green-400" : "text-red-400"}>
                {hoveredOhlcv.close.toFixed(2)}
              </span>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-500">
                {hoveredOhlcv.volume === 0
                  ? "—"
                  : hoveredOhlcv.volume >= 1_000_000
                    ? `${(hoveredOhlcv.volume / 1_000_000).toFixed(2)}M`
                    : hoveredOhlcv.volume >= 1_000
                      ? `${(hoveredOhlcv.volume / 1_000).toFixed(0)}K`
                      : hoveredOhlcv.volume.toLocaleString()}
              </span>
            </>
          ) : (
            <span className="text-zinc-700">hover for OHLCV</span>
          )}
        </div>

        {/* Status indicators */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {isLoading && (
            <div className="w-3 h-3 rounded-full border border-blue-400 border-t-transparent animate-spin" />
          )}
          {fetchError && <span className="text-xs text-red-400">{fetchError}</span>}
          {fallbackMessage && !isLoading && (
            <span className="text-xs text-amber-400">{fallbackMessage}</span>
          )}
        </div>
      </div>

      {/* Lightweight Charts container — fills remaining space */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
