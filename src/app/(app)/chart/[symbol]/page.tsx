import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/lib/session";
import { tradeYearRange, fillTradingDay } from "@/lib/charts/chart-model";
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
      <div className="min-h-screen bg-zinc-950 text-foreground flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-3">
            {requestedAccountId ? "Trading account not found." : "No trading account found."}
          </p>
          <Link href="/upload" className="text-primary hover:text-primary text-sm transition-colors">
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
    entryDay: fillTradingDay(trade.entryTime.toISOString(), trade.entryTradingDate?.toISOString()),
    exitTime: trade.exitTime?.toISOString() ?? null,
    exitDay: trade.exitTime ? fillTradingDay(trade.exitTime.toISOString(), trade.exitTradingDate?.toISOString()) : null,
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
              kind: fill.kind === "OPEN" ? "OPEN" as const : "CLOSE" as const,
              day: fillTradingDay(fill.time.toISOString(), fill.time.getTime() === trade.entryTime.getTime() ? trade.entryTradingDate?.toISOString() : fill.time.getTime() === trade.exitTime?.getTime() ? trade.exitTradingDate?.toISOString() : null),
              qty: fill.qty.toNumber(),
              price: fill.price?.toNumber() ?? 0,
              time: fill.time.toISOString(),
            }))
        : trade.executions.map((ex) => ({
            id: ex.id,
            side: ex.side,
            kind: ex.posEffect === "OPEN" ? "OPEN" as const : ex.posEffect === "CLOSE" ? "CLOSE" as const : undefined,
            day: fillTradingDay(ex.execTime.toISOString()),
            qty: ex.qty.toNumber(),
            price: ex.price.toNumber(),
            time: ex.execTime.toISOString(),
          })),
  }));

  // ── Compute date range for initial market data ─────────────────────────────

  const initialRange = tradeYearRange(trades.find(t => t.id === tradeId));
  // Load prices through the authenticated client API. A slow quote provider must
  // not delay the trade inspector or navigation; the chart owns loading/retry.

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
      key={`${symbol}:${account.id}:${focusTradeId ?? "overview"}`}
      symbol={symbol}
      accountId={account.id}
      trades={trades}
      initialCandles={[]}
      initialTimeframe="1d"
      initialFallbackMessage={null}
      initialSource="unavailable"
      initialRange={initialRange}
      initialFocusTradeId={focusTradeId}
      totalNetPnl={totalNetPnl}
      winRate={winRate}
      openCount={openCount}
    />
  );
}
