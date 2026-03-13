import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate, formatDuration, formatPrice } from "@/lib/format";
import {
  getDefaultMarketDataRange,
  isMarketDataTimeframe,
  type MarketDataTimeframe,
} from "@/lib/market-data/yahoo-client";
import { getMarketData } from "@/lib/market-data/market-data-cache";

interface ChartPageProps {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const TIMEFRAME_OPTIONS: readonly MarketDataTimeframe[] = ["1d", "1h", "15m", "5m", "1m"];

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = searchParams[key];
  return typeof value === "string" && value ? value : undefined;
}

function formatCandleTime(value: string, timeframe: MarketDataTimeframe): string {
  const date = new Date(value);

  if (timeframe === "1d") {
    return formatDate(date);
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildFocusRange(
  trade:
    | {
        entryTime: Date;
        exitTime: Date | null;
      }
    | null,
  timeframe: MarketDataTimeframe,
): { from: Date; to: Date } {
  if (!trade) {
    return getDefaultMarketDataRange(timeframe);
  }

  const paddingMs =
    timeframe === "1d" ? 20 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const toBase = trade.exitTime ?? new Date();

  return {
    from: new Date(trade.entryTime.getTime() - paddingMs),
    to: new Date(toBase.getTime() + paddingMs),
  };
}

function buildTimeframeHref(options: {
  accountId: string;
  symbol: string;
  timeframe: MarketDataTimeframe;
  tradeId?: string;
}): string {
  const params = new URLSearchParams({
    accountId: options.accountId,
    timeframe: options.timeframe,
  });

  if (options.tradeId) {
    params.set("tradeId", options.tradeId);
  }

  return `/chart/${encodeURIComponent(options.symbol)}?${params.toString()}`;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <p className="text-lg font-semibold font-mono leading-none text-zinc-100">{value}</p>
    </div>
  );
}

export default async function SymbolChartPage({
  params,
  searchParams,
}: ChartPageProps) {
  const session = await getRequiredSession();
  const userId = session.user.id;
  const { symbol: rawSymbol } = await params;
  const resolvedSearchParams = await searchParams;
  const tradeId = getParam(resolvedSearchParams, "tradeId");
  const requestedAccountId = getParam(resolvedSearchParams, "accountId");
  const timeframeParam = getParam(resolvedSearchParams, "timeframe");
  const timeframe = timeframeParam && isMarketDataTimeframe(timeframeParam) ? timeframeParam : "1d";
  const symbol = decodeURIComponent(rawSymbol).toUpperCase();

  const account = requestedAccountId
    ? await prisma.tradingAccount.findFirst({
        where: { id: requestedAccountId, userId },
      })
    : await prisma.tradingAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });

  if (!account) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-3">
            {requestedAccountId ? "Trading account not found." : "No trading account found."}
          </p>
          {requestedAccountId ? (
            <Link
              href="/trades"
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              View your available accounts →
            </Link>
          ) : (
            <Link
              href="/upload"
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              Upload a CSV to get started →
            </Link>
          )}
        </div>
      </div>
    );
  }

  const trades = await prisma.roundTripTrade.findMany({
    where: { accountId: account.id, symbol },
    include: { classification: { select: { setup: true, confidence: true } } },
    orderBy: { entryTime: "desc" },
  });

  const selectedTrade = trades.find((trade) => trade.id === tradeId) ?? null;
  const focusTrade = selectedTrade ?? trades[0] ?? null;
  const marketDataRange = buildFocusRange(
    focusTrade ? { entryTime: focusTrade.entryTime, exitTime: focusTrade.exitTime } : null,
    timeframe,
  );

  let marketDataError: string | null = null;
  let marketData:
    | Awaited<ReturnType<typeof getMarketData>>
    | null = null;

  try {
    marketData = await getMarketData({
      symbol,
      timeframe,
      from: marketDataRange.from,
      to: marketDataRange.to,
    });
  } catch (error) {
    marketDataError = error instanceof Error ? error.message : String(error);
  }

  const closedTrades = trades.filter((trade) => !trade.isOpen);
  const winCount = closedTrades.filter((trade) => (trade.netPnl?.toNumber() ?? 0) > 0).length;
  const totalNetPnl = closedTrades.reduce((sum, trade) => sum + (trade.netPnl?.toNumber() ?? 0), 0);
  const openPositions = trades.filter((trade) => trade.isOpen).length;
  const winRate = closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 0;
  const latestCandle = marketData?.candles.at(-1) ?? null;
  const firstCandle = marketData?.candles[0] ?? null;
  const priceChange =
    latestCandle && firstCandle ? latestCandle.close - firstCandle.close : null;
  const rangeHigh =
    marketData && marketData.candles.length > 0
      ? Math.max(...marketData.candles.map((candle) => candle.high))
      : null;
  const rangeLow =
    marketData && marketData.candles.length > 0
      ? Math.min(...marketData.candles.map((candle) => candle.low))
      : null;
  const recentCandles = marketData?.candles.slice(-8).reverse() ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="border-b border-zinc-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center">
            <span className="text-white font-bold text-xs">A</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{symbol}</p>
            <p className="text-zinc-500 text-xs">Symbol detail preview</p>
          </div>
        </div>
        <Button
          asChild
          variant="ghost"
          className="text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <Link href={`/trades?accountId=${account.id}&symbol=${encodeURIComponent(symbol)}`}>
            ← Back to trades
          </Link>
        </Button>
      </div>

      <div className="px-8 py-6 max-w-[1600px] space-y-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-zinc-100 text-xl">Market data preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {TIMEFRAME_OPTIONS.map((option) => {
                const isActive = timeframe === option;
                return (
                  <Link
                    key={option}
                    href={buildTimeframeHref({
                      accountId: account.id,
                      symbol,
                      timeframe: option,
                      tradeId: selectedTrade?.id,
                    })}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-blue-500/50 bg-blue-500/15 text-blue-300"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    }`}
                  >
                    {option.toUpperCase()}
                  </Link>
                );
              })}
              <span className="text-xs text-zinc-500 ml-2">
                Window: {formatDate(marketDataRange.from)} to {formatDate(marketDataRange.to)}
              </span>
            </div>

            <p className="text-zinc-400 max-w-3xl">
              Phase 7 wires in real Yahoo market data and caching. Phase 8 will replace this
              preview with the interactive candlestick workspace, but the symbol page is now
              backed by live candle data instead of just static trade rows.
            </p>

            {selectedTrade && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
                <p className="text-blue-300 text-sm font-medium">
                  Selected trade: {formatDate(selectedTrade.entryTime)} to{" "}
                  {selectedTrade.exitTime ? formatDate(selectedTrade.exitTime) : "Open"}
                </p>
                <p className="text-zinc-300 text-sm mt-1">
                  {selectedTrade.direction} ·{" "}
                  {selectedTrade.totalQty.toNumber().toLocaleString()} shares ·{" "}
                  {formatCurrency(selectedTrade.netPnl?.toNumber() ?? null)}
                </p>
              </div>
            )}

            {marketData?.fallbackMessage && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <p className="text-amber-300 text-sm font-medium">{marketData.fallbackMessage}</p>
              </div>
            )}

            {marketDataError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                <p className="text-red-300 text-sm font-medium">
                  Market data failed to load for this symbol.
                </p>
                <p className="text-red-200/80 text-xs mt-1 font-mono">{marketDataError}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-4 gap-4">
          <SummaryCard label="Trades" value={String(trades.length)} />
          <SummaryCard label="Closed Net P&L" value={formatCurrency(totalNetPnl)} />
          <SummaryCard
            label="Win Rate"
            value={closedTrades.length > 0 ? `${winRate.toFixed(1)}%` : "—"}
          />
          <SummaryCard label="Open Positions" value={String(openPositions)} />
        </div>

        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            label="Last Close"
            value={latestCandle ? `$${formatPrice(latestCandle.close)}` : "—"}
          />
          <SummaryCard
            label="Range Change"
            value={priceChange == null ? "—" : formatCurrency(priceChange)}
          />
          <SummaryCard
            label="Range High / Low"
            value={
              rangeHigh == null || rangeLow == null
                ? "—"
                : `$${formatPrice(rangeHigh)} / $${formatPrice(rangeLow)}`
            }
          />
          <SummaryCard
            label="Candles"
            value={
              marketData
                ? `${marketData.candles.length} · ${marketData.effectiveTimeframe.toUpperCase()}`
                : "—"
            }
          />
        </div>

        {recentCandles.length > 0 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-zinc-100 text-base">
                Recent candles
                {marketData && (
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    {marketData.source === "cache"
                      ? "served from cache"
                      : marketData.source === "cache-stale"
                        ? "served from stale cache"
                        : "fresh Yahoo fetch"}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900/60">
                      <TableHead className="text-zinc-500 text-xs uppercase tracking-wider">
                        Time
                      </TableHead>
                      <TableHead className="text-zinc-500 text-xs uppercase tracking-wider text-right">
                        Open
                      </TableHead>
                      <TableHead className="text-zinc-500 text-xs uppercase tracking-wider text-right">
                        High
                      </TableHead>
                      <TableHead className="text-zinc-500 text-xs uppercase tracking-wider text-right">
                        Low
                      </TableHead>
                      <TableHead className="text-zinc-500 text-xs uppercase tracking-wider text-right">
                        Close
                      </TableHead>
                      <TableHead className="text-zinc-500 text-xs uppercase tracking-wider text-right">
                        Volume
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentCandles.map((candle) => (
                      <TableRow
                        key={candle.time}
                        className="border-zinc-800 hover:bg-zinc-900/40 transition-colors"
                      >
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-300">
                          {formatCandleTime(candle.time, marketData?.effectiveTimeframe ?? timeframe)}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-300 text-right">
                          ${formatPrice(candle.open)}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-300 text-right">
                          ${formatPrice(candle.high)}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-300 text-right">
                          ${formatPrice(candle.low)}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-100 text-right">
                          ${formatPrice(candle.close)}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-sm text-zinc-400 text-right">
                          {candle.volume.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {trades.length === 0 ? (
          <div className="border border-zinc-800 rounded-lg p-16 text-center">
            <p className="text-zinc-400 text-base mb-2">No trades found for {symbol}.</p>
            <p className="text-zinc-600 text-sm">
              <Link
                href={`/trades?accountId=${account.id}`}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Return to the trade list
              </Link>
            </p>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900/60">
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                    Entry
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                    Exit
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                    Dir
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                    Entry $
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                    Exit $
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                    Qty
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                    Net P&L
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider text-right">
                    Duration
                  </TableHead>
                  <TableHead className="text-zinc-500 font-medium text-xs uppercase tracking-wider">
                    Setup
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((trade) => {
                  const isSelected = trade.id === tradeId;
                  const pnl = trade.netPnl?.toNumber() ?? null;

                  return (
                    <TableRow
                      key={trade.id}
                      className={`border-zinc-800 hover:bg-zinc-900/40 transition-colors ${
                        isSelected ? "bg-blue-500/5" : ""
                      }`}
                    >
                      <TableCell className="py-2.5 font-mono text-sm text-zinc-300">
                        {formatDate(trade.entryTime)}
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-sm text-zinc-300">
                        {trade.isOpen ? "Open" : formatDate(trade.exitTime)}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge
                          variant="outline"
                          className={
                            trade.direction === "LONG"
                              ? "border-blue-500/40 text-blue-400 bg-blue-500/10 hover:bg-blue-500/10 text-xs px-1.5 py-0"
                              : "border-amber-500/40 text-amber-400 bg-amber-500/10 hover:bg-amber-500/10 text-xs px-1.5 py-0"
                          }
                        >
                          {trade.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-sm text-zinc-300 text-right">
                        ${formatPrice(trade.entryPrice.toNumber())}
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-sm text-zinc-400 text-right">
                        {trade.exitPrice ? `$${formatPrice(trade.exitPrice.toNumber())}` : "—"}
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-sm text-zinc-300 text-right">
                        {trade.totalQty.toNumber().toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={`py-2.5 font-mono text-sm text-right ${
                          pnl != null && pnl > 0
                            ? "text-green-400"
                            : pnl != null && pnl < 0
                              ? "text-red-400"
                              : "text-zinc-500"
                        }`}
                      >
                        {formatCurrency(pnl)}
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-sm text-zinc-400 text-right">
                        {formatDuration(trade.durationSeconds)}
                      </TableCell>
                      <TableCell className="py-2.5">
                        {trade.classification ? (
                          <Badge
                            variant="outline"
                            className="border-zinc-700 text-zinc-400 text-xs px-1.5 py-0"
                          >
                            {trade.classification.setup}
                          </Badge>
                        ) : (
                          <span className="text-zinc-700 text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
