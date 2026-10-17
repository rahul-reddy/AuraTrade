import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/lib/session";
import { getMarketData } from "@/lib/market-data/market-data-cache";
import { getDefaultMarketDataRange } from "@/lib/market-data/yahoo-client";
import ChartWorkspace from "@/components/charts/ChartWorkspace";
import type { ChartTrade } from "@/components/charts/CandlestickChart";

interface ChartPageProps {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v ? v : undefined;
}

/**
 * Market-data window around a symbol's trades: the trade span padded by 30%
 * (min 30 days) on each side, capped at tomorrow. Open trades extend to now.
 * Kept outside the component so render stays pure.
 */
function getChartDateRange(
  trades: Array<{ entryTime: Date; exitTime: Date | null }>,
): { from: Date; to: Date } {
  if (trades.length === 0) return getDefaultMarketDataRange("1d");
  const now = Date.now();
  const earliest = trades.reduce(
    (min, t) => Math.min(min, t.entryTime.getTime()),
    Infinity,
  );
  const latest = trades.reduce(
    (max, t) => Math.max(max, t.exitTime?.getTime() ?? now),
    -Infinity,
  );
  const spanMs = Math.max(latest - earliest, 30 * 86_400_000);
  const padMs = Math.max(spanMs * 0.3, 30 * 86_400_000);
  return {
    from: new Date(earliest - padMs),
    to: new Date(Math.min(latest + padMs, now + 86_400_000)),
  };
}

export default async function SymbolChartPage({ params, searchParams }: ChartPageProps) {
  const session = await getRequiredSession();
  const userId = session.user.id;

  const { symbol: rawSymbol } = await params;
  const sp = await searchParams;
  const symbol = decodeURIComponent(rawSymbol).toUpperCase();
  const tradeId = getParam(sp, "tradeId");
  const requestedAccountId = getParam(sp, "accountId");

  // ── Resolve account ───────────────────────────────────────────────────────

  const account = requestedAccountId
    ? await prisma.tradingAccount.findFirst({ where: { id: requestedAccountId, userId } })
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
          <Link href="/upload" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
            Upload a CSV to get started →
          </Link>
        </div>
      </div>
    );
  }

  // ── Fetch trades with their fills ─────────────────────────────────────────

  const rawTrades = await prisma.roundTripTrade.findMany({
    where: { accountId: account.id, symbol },
    include: {
      fills: { orderBy: { seq: "asc" } },
      executions: { orderBy: [{ execTime: "asc" }, { daySeq: "asc" }] },
      classification: { select: { setup: true } },
    },
    orderBy: { entryTime: "desc" },
  });

  // Serialize Prisma Decimal / Date → plain JS (safe to pass to client components)
  const trades: ChartTrade[] = rawTrades.map((trade) => ({
    id: trade.id,
    direction: trade.direction,
    entryTime: trade.entryTime.toISOString(),
    exitTime: trade.exitTime?.toISOString() ?? null,
    entryPrice: trade.entryPrice.toNumber(),
    exitPrice: trade.exitPrice?.toNumber() ?? null,
    totalQty: trade.totalQty.toNumber(),
    netPnl: trade.netPnl?.toNumber() ?? null,
    isOpen: trade.isOpen,
    durationSeconds: trade.durationSeconds,
    setup: trade.classification?.setup ?? null,
    // Ledger fills are canonical. Executions remain only as a fallback for
    // trades written before fills existed (until the next reprocess).
    fills:
      trade.fills.length > 0
        ? trade.fills
            // Executions only: expirations/transfers have no market price.
            .filter((fill) => (fill.kind === "OPEN" || fill.kind === "CLOSE") && fill.price != null)
            .map((fill) => ({
              id: fill.id,
              side: fill.side,
              qty: fill.qty.toNumber(),
              price: fill.price?.toNumber() ?? 0,
              time: fill.time.toISOString(),
            }))
        : trade.executions.map((ex) => ({
            id: ex.id,
            side: ex.side,
            qty: ex.qty.toNumber(),
            price: ex.price.toNumber(),
            time: ex.execTime.toISOString(),
          })),
  }));

  // ── Compute date range for initial market data ─────────────────────────────

  const { from, to } = getChartDateRange(rawTrades);

  // ── Fetch initial daily candles ───────────────────────────────────────────

  let initialCandles: Awaited<ReturnType<typeof getMarketData>>["candles"] = [];
  let initialFallbackMessage: string | null = null;
  // #8 fix: use the server's effectiveTimeframe (may differ from "1d" due to fallback logic)
  let initialEffectiveTimeframe: import("@/lib/market-data/yahoo-client").MarketDataTimeframe = "1d";

  try {
    const md = await getMarketData({ symbol, timeframe: "1d", from, to });
    initialCandles = md.candles;
    initialFallbackMessage = md.fallbackMessage;
    initialEffectiveTimeframe = md.effectiveTimeframe;
  } catch (err) {
    // No market data available: chart renders empty, client can retry via TF buttons
    if (process.env.NODE_ENV === "development") {
      console.warn(`[SymbolChartPage] Failed to fetch initial candles for ${symbol}:`, err);
    }
  }

  // ── Header stats ──────────────────────────────────────────────────────────

  const closedTrades = rawTrades.filter((t) => !t.isOpen);
  const wins = closedTrades.filter((t) => (t.netPnl?.toNumber() ?? 0) > 0).length;
  const totalNetPnl = closedTrades.reduce((sum, t) => sum + (t.netPnl?.toNumber() ?? 0), 0);
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : null;
  const openCount = rawTrades.filter((t) => t.isOpen).length;

  // Validate requested tradeId belongs to this account + symbol
  const focusTradeId =
    tradeId && rawTrades.some((t) => t.id === tradeId) ? tradeId : null;

  return (
    <ChartWorkspace
      symbol={symbol}
      accountId={account.id}
      trades={trades}
      initialCandles={initialCandles}
      initialTimeframe={initialEffectiveTimeframe}
      initialFallbackMessage={initialFallbackMessage}
      initialFocusTradeId={focusTradeId}
      totalNetPnl={totalNetPnl}
      winRate={winRate}
      openCount={openCount}
    />
  );
}
