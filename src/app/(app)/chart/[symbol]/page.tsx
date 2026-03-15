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

  // ── Fetch trades with executions ──────────────────────────────────────────

  const rawTrades = await prisma.roundTripTrade.findMany({
    where: { accountId: account.id, symbol },
    include: {
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
    fills: trade.executions.map((ex) => ({
      id: ex.id,
      side: ex.side,
      qty: ex.qty.toNumber(),
      price: ex.price.toNumber(),
      time: ex.execTime.toISOString(),
    })),
  }));

  // ── Compute date range for initial market data ─────────────────────────────

  let from: Date;
  let to: Date;

  if (rawTrades.length > 0) {
    const entryTimes = rawTrades.map((t) => t.entryTime.getTime());
    const exitTimes = rawTrades.map((t) => t.exitTime?.getTime() ?? Date.now());
    const earliest = Math.min(...entryTimes);
    const latest = Math.max(...exitTimes);
    const spanMs = Math.max(latest - earliest, 30 * 86_400_000);
    const padMs = Math.max(spanMs * 0.3, 30 * 86_400_000);
    from = new Date(earliest - padMs);
    to = new Date(Math.min(latest + padMs, Date.now() + 86_400_000));
  } else {
    const defaultRange = getDefaultMarketDataRange("1d");
    from = defaultRange.from;
    to = defaultRange.to;
  }

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
  } catch {
    // No market data available: chart renders empty, client can retry via TF buttons
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
