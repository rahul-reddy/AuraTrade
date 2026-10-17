"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChartTrade } from "@/components/charts/CandlestickChart";
import type { MarketDataCandle, MarketDataTimeframe } from "@/lib/market-data/yahoo-client";
import { formatCurrency, formatDuration, formatDate as formatDateShared } from "@/lib/format";

// ─── Local thin wrapper: ISO string → shared formatDate (takes Date) ──────────

function formatDate(isoString: string): string {
  return formatDateShared(new Date(isoString));
}

// ─── Skeleton shown while the Lightweight Charts bundle loads ─────────────────

const SKELETON_HEIGHTS = [40, 65, 55, 75, 45, 80, 60, 70, 50, 85, 65, 45, 70, 55, 80, 60];

function ChartLoadingSkeleton() {
  return (
    <div className="flex-1 flex flex-col bg-zinc-950">
      {/* Toolbar skeleton */}
      <div className="h-10 border-b border-zinc-800 flex items-center gap-2 px-3 shrink-0">
        {SKELETON_HEIGHTS.slice(0, 5).map((_, i) => (
          <Skeleton key={i} className="h-6 w-10 bg-zinc-800" />
        ))}
      </div>
      {/* Candlestick bar skeletons */}
      <div className="flex-1 flex items-end gap-1 px-8 pb-8">
        {SKELETON_HEIGHTS.map((h, i) => (
          <Skeleton key={i} className="flex-1 bg-zinc-800 rounded-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

// Load with ssr:false — Lightweight Charts requires window
const DynamicCandlestickChart = dynamic(
  () => import("@/components/charts/CandlestickChart"),
  {
    ssr: false,
    loading: () => <ChartLoadingSkeleton />,
  },
);

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChartWorkspaceProps {
  symbol: string;
  accountId: string;
  trades: ChartTrade[];
  initialCandles: MarketDataCandle[];
  initialTimeframe: MarketDataTimeframe;
  initialFallbackMessage: string | null;
  initialFocusTradeId: string | null;
  totalNetPnl: number;
  winRate: number | null;
  openCount: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChartWorkspace({
  symbol,
  accountId,
  trades,
  initialCandles,
  initialTimeframe,
  initialFallbackMessage,
  initialFocusTradeId,
  totalNetPnl,
  winRate,
  openCount,
}: ChartWorkspaceProps) {
  const [focusTradeId, setFocusTradeId] = useState<string | null>(initialFocusTradeId);

  const closedTrades = trades.filter((t) => !t.isOpen);

  function handleTradeClick(tradeId: string) {
    setFocusTradeId((prev) => (prev === tradeId ? null : tradeId));
  }

  return (
    <div
      className="flex flex-col h-full bg-zinc-950 text-white"
      data-testid="chart-workspace"
      // Fill markers drawn on the canvas, exposed for browser tests.
      data-fill-count={trades.reduce((sum, trade) => sum + trade.fills.length, 0)}
    >
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/trades?accountId=${accountId}&symbol=${encodeURIComponent(symbol)}`}
            className="text-zinc-500 hover:text-zinc-200 text-sm transition-colors"
          >
            ← Trades
          </Link>
          <div className="w-px h-4 bg-zinc-700" />
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg font-mono tracking-tight">{symbol}</span>
            <span className="text-zinc-600 text-xs">
              {closedTrades.length} round {closedTrades.length === 1 ? "trip" : "trips"}
            </span>
          </div>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-6 text-sm font-mono">
          <div className="text-center">
            <div className="text-zinc-600 text-[10px] uppercase tracking-wider mb-0.5">Net P&L</div>
            <div className={totalNetPnl >= 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
              {formatCurrency(totalNetPnl)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-zinc-600 text-[10px] uppercase tracking-wider mb-0.5">Win Rate</div>
            <div className="text-zinc-200">{winRate != null ? `${winRate.toFixed(1)}%` : "—"}</div>
          </div>
          <div className="text-center">
            <div className="text-zinc-600 text-[10px] uppercase tracking-wider mb-0.5">Closed</div>
            <div className="text-zinc-200">{closedTrades.length}</div>
          </div>
          {openCount > 0 && (
            <div className="text-center">
              <div className="text-zinc-600 text-[10px] uppercase tracking-wider mb-0.5">Open</div>
              <div className="text-blue-400">{openCount}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Body: sidebar + chart ───────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Trade list sidebar */}
        <div className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-900 flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-800 shrink-0">
            <p className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider">
              Trades · {symbol}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {trades.length === 0 ? (
              <div className="p-6 text-center text-zinc-600 text-sm">No trades for {symbol}</div>
            ) : (
              trades.map((trade) => {
                const isSelected = trade.id === focusTradeId;
                const pnl = trade.netPnl;

                return (
                  <button
                    key={trade.id}
                    onClick={() => handleTradeClick(trade.id)}
                    className={`w-full text-left px-4 py-3 border-b border-zinc-800/60 transition-colors cursor-pointer group ${
                      isSelected
                        ? "bg-blue-500/10 border-l-2 border-l-blue-500"
                        : "hover:bg-zinc-800/50 border-l-2 border-l-transparent"
                    }`}
                  >
                    {/* Row 1: date + direction badge */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-zinc-300 text-xs font-mono">
                        {formatDate(trade.entryTime)}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          trade.direction === "LONG"
                            ? "border-blue-500/40 text-blue-400 bg-blue-500/10 hover:bg-blue-500/10 text-[10px] px-1.5 py-0"
                            : "border-amber-500/40 text-amber-400 bg-amber-500/10 hover:bg-amber-500/10 text-[10px] px-1.5 py-0"
                        }
                      >
                        {trade.direction}
                      </Badge>
                    </div>

                    {/* Row 2: qty + duration + P&L */}
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-600 text-xs font-mono">
                        {trade.totalQty.toLocaleString()}sh · {formatDuration(trade.durationSeconds)}
                      </span>
                      {trade.isOpen ? (
                        <span className="text-blue-400 text-[10px] font-mono font-medium uppercase tracking-wider">
                          Open
                        </span>
                      ) : (
                        <span
                          className={`text-xs font-mono font-semibold ${
                            pnl != null && pnl > 0
                              ? "text-green-400"
                              : pnl != null && pnl < 0
                                ? "text-red-400"
                                : "text-zinc-500"
                          }`}
                        >
                          {formatCurrency(pnl)}
                        </span>
                      )}
                    </div>

                    {/* Row 3: setup tag if present */}
                    {trade.setup && (
                      <div className="mt-1">
                        <span className="text-zinc-600 text-[10px] font-mono">{trade.setup}</span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chart area — fills remaining space */}
        <div className="flex-1 min-w-0 flex flex-col">
          <DynamicCandlestickChart
            initialCandles={initialCandles}
            initialTimeframe={initialTimeframe}
            initialFallbackMessage={initialFallbackMessage}
            trades={trades}
            symbol={symbol}
            focusTradeId={focusTradeId}
          />
        </div>
      </div>
    </div>
  );
}
