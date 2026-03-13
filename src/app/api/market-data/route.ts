import { NextRequest, NextResponse } from "next/server";
import { getRequiredSession } from "@/lib/session";
import {
  getDefaultMarketDataRange,
  isMarketDataTimeframe,
  normalizeMarketDataSymbol,
} from "@/lib/market-data/yahoo-client";
import { getMarketData } from "@/lib/market-data/market-data-cache";

export const runtime = "nodejs";

function parseDateParam(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(req: NextRequest) {
  try {
    await getRequiredSession();
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }

  const params = new URL(req.url).searchParams;
  const symbolParam = params.get("symbol");
  const timeframeParam = params.get("timeframe") ?? "1d";

  if (!symbolParam) {
    return NextResponse.json({ error: "symbol_required" }, { status: 400 });
  }

  if (!isMarketDataTimeframe(timeframeParam)) {
    return NextResponse.json({ error: "invalid_timeframe" }, { status: 400 });
  }

  const from = parseDateParam(params.get("from"));
  const to = parseDateParam(params.get("to"));
  const range = from && to ? { from, to } : getDefaultMarketDataRange(timeframeParam);

  if (range.from.getTime() > range.to.getTime()) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  try {
    const result = await getMarketData({
      symbol: normalizeMarketDataSymbol(symbolParam),
      timeframe: timeframeParam,
      from: range.from,
      to: range.to,
    });

    return NextResponse.json({
      symbol: result.symbol,
      requestedTimeframe: result.requestedTimeframe,
      effectiveTimeframe: result.effectiveTimeframe,
      source: result.source,
      stale: result.stale,
      fallbackMessage: result.fallbackMessage,
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      candles: result.candles,
    });
  } catch (error) {
    console.error("[GET /api/market-data]", error);
    return NextResponse.json(
      { error: "market_data_fetch_failed", message: String(error) },
      { status: 500 },
    );
  }
}
