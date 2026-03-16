# AuraTrade — Implementation Plan (v2)

> Last updated: 2026-03-16

## Context
- Professional trading analytics platform for a high-frequency discretionary equity trader (ThinkorSwim/Schwab)
- Will become SaaS. Account size: $250K–$1M (fractional Kelly emphasized)
- Running locally for now (local PostgreSQL)
- Market data: yahoo-finance2 only (free, no key)
- User will provide sample TOS CSV after initial build

## Standing Rules (enforced throughout)
- Show every financial formula before implementing — user will verify
- Unit test every calculation in metrics.ts and classifier.ts — trust-critical
- No `any` types anywhere
- Every API route starts with `getRequiredSession()` and scopes all DB queries by userId
- Flag TOS CSV format assumptions explicitly; never guess silently

---

## Phase 1: Project Bootstrap

Commands (run from `c:\dev_projects\AuraTrade`):
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git
npm install @prisma/client next-auth@beta @auth/prisma-adapter zustand @tanstack/react-query @tanstack/react-query-devtools papaparse lightweight-charts recharts yahoo-finance2 framer-motion lucide-react date-fns date-fns-tz zod react-dropzone sonner class-variance-authority clsx tailwind-merge tailwindcss-animate technicalindicators bcryptjs @types/bcryptjs nanoid
npm install -D prisma @types/papaparse @types/node @types/react @types/react-dom
npx shadcn@latest init  # Style: Default, Base color: Zinc, CSS variables: Yes
npx shadcn@latest add button card dialog dropdown-menu input label select separator sheet skeleton table tabs tooltip badge command popover scroll-area switch form
npx prisma init --datasource-provider postgresql
```

`.env.local`:
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/auratrade"
NEXTAUTH_SECRET="<openssl rand -base64 32>"
NEXTAUTH_URL="http://localhost:3000"
```

### Design System
- Dark-first: zinc-900 / zinc-800 backgrounds (not pure black)
- Accent: blue-500 interactive, green-500 profit, red-500 loss
- Fonts: Inter (UI), JetBrains Mono (numbers/data)
- Tailwind config: extend `fontFamily.mono` with JetBrains Mono

---

## Phase 2: Database Schema
File: `prisma/schema.prisma`

### Key Design Decisions
- `@db.Decimal` for ALL financial values — never Float (IEEE 754 binary errors in money)
- Every query scoped by userId — SaaS-ready from day 1
- `Upload.fileHash` unique per user = whole-file dedup
- `@@unique([accountId, execTime, symbol, side, qty, price, daySeq])` on Execution = row-level dedup (daySeq = 0-based intra-day sequence index for content-based dedup across overlapping uploads)
- DailySnapshot pre-computed, rebuilt incrementally from fromDate (not full rebuild)
- TradeContext stores pre-computed technical indicators per trade (for classification)

### Models

**Auth (NextAuth v5):** User, AuthAccount, Session, VerificationToken

**TradingAccount** — broker, currency, startingBalance, belongs to User

**Upload** — fileHash (SHA-256, unique per user for dedup), status, rowCounts, dateRange

**Execution** — individual TOS fill: execTime, symbol, side, qty, price, netPrice, commission, posEffect, assetType, daySeq
- `@@unique([accountId, execTime, symbol, side, qty, price, daySeq])` — row dedup (daySeq = content-based intra-day sequence for cross-file dedup)

**RoundTripTrade** — grouped open→close:
- entryPrice/exitPrice (VWAP-weighted), netPnl, totalQty (peak position), durationSeconds
- direction (LONG/SHORT), isOpen, tags (String[])
- `notes String? @db.Text` — trade journal
- `notesUpdatedAt DateTime?`
- `initialRisk Decimal? @db.Decimal(12,4)` — user-defined or ATR-estimated stop distance in $
- `rMultiple Decimal? @db.Decimal(8,4)` — netPnl / initialRisk

**TradeContext** — pre-computed technical context at trade entry date:
```prisma
model TradeContext {
  id                  String   @id @default(cuid())
  tradeId             String   @unique
  sma20               Decimal  @db.Decimal(12,4)
  sma50               Decimal  @db.Decimal(12,4)
  sma200              Decimal  @db.Decimal(12,4)
  ema20               Decimal  @db.Decimal(12,4)
  atr14               Decimal  @db.Decimal(12,4)
  rsi14               Decimal  @db.Decimal(12,4)
  adx14               Decimal  @db.Decimal(12,4)
  bbUpper             Decimal  @db.Decimal(12,4)
  bbLower             Decimal  @db.Decimal(12,4)
  highN52w            Decimal  @db.Decimal(12,4)
  lowN52w             Decimal  @db.Decimal(12,4)
  prevClose           Decimal  @db.Decimal(12,4)
  gapPercent          Decimal  @db.Decimal(8,4)
  nearestEarningsDate DateTime?
  daysToEarnings      Int?
  marketRegime        String?  // TRENDING_UP | TRENDING_DOWN | CHOPPY
  enrichedAt          DateTime @default(now())
  trade               RoundTripTrade @relation(fields: [tradeId], references: [id])
}
```

**TradeClassification** — setup type (BREAKOUT/PULLBACK/etc), confidence 0–100, scoreBreakdown JSON

**DailySnapshot** — pre-computed: dailyPnl, cumulativePnl, peakEquity, drawdown, maxDrawdown, winCount, lossCount
- `@@unique([accountId, date])`

**MarketDataCache** — OHLCV: `@@unique([symbol, date, timeframe])`. Historical intraday never expires; only "today's" data has staleness check.

---

## Phase 2b: Auth Plumbing
Must be done before any API route is built. Every API route calls `getRequiredSession()` first.

Files:
- `src/lib/auth.ts` — NextAuth v5, Credentials provider (email + bcrypt), PrismaAdapter
- `src/lib/session.ts` — `getRequiredSession()`: calls auth(), throws 401 if no session, returns typed session
- `src/middleware.ts` — protect `/(app)/*` routes, redirect unauthenticated to /login
- `src/app/(auth)/login/page.tsx` — functional login form
- `src/app/(auth)/register/page.tsx` — functional register form

Pattern for every API route:
```ts
const session = await getRequiredSession()  // throws if unauth
const { userId } = session.user
// all Prisma queries include: where: { userId }
```

---

## Phase 3: CSV Parser ✅ COMPLETE
File: `src/lib/parser/tos-csv-parser.ts` — exports `parseSchwabCSV()`

**Actual format: Schwab/TDA Transaction History** (NOT TOS Activity & Positions)

### Actual headers (two variants):
- 2022 TDA: `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"`
- 2026 Schwab: same columns, unquoted, Amount uses `($1,234.56)` parentheses notation

### Confirmed facts (verified against real CSV):
- **Date only** — `MM/DD/YYYY` or `M/D/YYYY`. No time. Row order = intra-day sequence.
- **Commission** is explicit in `Fees & Comm` column. Buys are `$0`. NOT `(Price - NetPrice) × Qty`.
- **Action → side/posEffect/direction:**
  - `Buy` + desc contains "to cover" → SHORT_CLOSE
  - `Buy` (plain) → LONG_OPEN
  - `Sell` → LONG_CLOSE
  - `Sell Short` → SHORT_OPEN
  - `Journaled Shares` / empty symbol → skip
- **execTime dedup**: `Execution.execTime = pure midnight UTC date`. `daySeq Int` = 0-based occurrence index within `(accountId, execTime, symbol, side, qty, price)` group. Unique constraint includes `daySeq`. Same execution from two overlapping CSV files always gets same daySeq → correctly deduplicated. Migration: `20260313200000_add_execution_dayseq`.
- **netPrice** = price (no separate NetPrice in this format; commission is separate)

Pipeline: Strip BOM → PapaParse → classify Action → parse date (`M/d/yyyy`) → parse money (handles `$`, `($)`, commas, trailing spaces) → return `{ executions, skippedRows, assumptions, dateRange, symbols }`

---

## Phase 4: Trade Grouping Engine ✅ COMPLETE
File: `src/lib/engine/trade-grouper.ts` — exports `groupTrades(executions)` → `{ trades, warnings }`

Algorithm: FIFO position tracker per symbol, pure function.

```
Sort: date ASC, rowIndex ASC (intra-day FIFO order preserved)
For each execution:
  OPEN fill → push lot to fifoQueue, extend netPosition, track peakPosition
  CLOSE fill → consume FIFO lots; netPosition=0 → finalize as closed round trip
At end: remaining active positions → isOpen=true
```

### VWAP Formulas (verified, implemented):
```
entryVWAP = Σ(price × qty) / Σ(qty)  [over all opening fills]
exitVWAP  = Σ(price × qty) / Σ(qty)  [over all closing fills]
grossPnl  = (exitVWAP - entryVWAP) × closedQty  [LONG]
grossPnl  = (entryVWAP - exitVWAP) × closedQty  [SHORT]
netPnl    = grossPnl - totalFees
totalFees = Σ(commission) over ALL fills (opens + closes)
totalQty  = peak open position size
durationSeconds = (exitDate - entryDate) × 86400  [same-day = 0, intraday exact unknown]
```

### R-Multiple
- Default initialRisk = 1.5 × ATR(14) at entry (from TradeContext once enriched)
- User can manually override per trade → recalculates rMultiple
- UI indicator: italic "est." label (ATR-estimated) vs normal weight (user-defined)

Edge cases handled: direction conflicts (warn + finalize-as-open + start fresh), orphaned closes (warn + skip), oversized closes (warn + consume all lots), partial closes (position continues).

---

## Phase 5: Upload Flow
Files: `src/app/(app)/upload/page.tsx`, `src/app/api/upload/route.ts`, `src/app/api/upload/[id]/confirm/route.ts`

### Two-phase commit:
1. `POST /api/upload` → parse file, run grouper in-memory only (no DB writes), return confirmation preview
2. `POST /api/upload/[id]/confirm` → write Executions (upsert), write RoundTripTrades, trigger async enrichment pipeline, rebuild DailySnapshots from earliest new execution date

### Confirmation screen data:
```json
{
  "uploadId": "...",
  "summary": {
    "totalExecutions": 0,
    "newExecutions": 0,
    "skippedExecutions": 0,
    "newTrades": 0,
    "openPositions": 0,
    "dateRange": {},
    "symbols": [],
    "estimatedPnl": 0,
    "warnings": []
  }
}
```

### Dedup (3 layers):
1. `Upload.fileHash` unique per user — catches exact re-uploads instantly
2. `@@unique` on Execution — catches partial overlap on row level
3. Date range overlap advisory warning on confirmation screen

Upload UI: react-dropzone drag-and-drop, CSV type validation, progress indicator, confirmation table, sonner toasts

---

## Phase 6: Trades List Page
Files: `src/app/(app)/trades/page.tsx`, `src/app/api/trades/route.ts`, `src/components/trades/TradesFilters.tsx`, `src/components/trades/TradesTable.tsx`, `src/app/(app)/trades/loading.tsx`, `src/app/(app)/trades/error.tsx`

API: `GET /api/trades?accountId&symbol&direction&dateFrom&dateTo&status&setup&page&pageSize&sortBy&sortDir`

Response: paginated trades + summary stats over full filtered set (two Prisma queries: paginated rows + aggregate).

Table columns: Symbol (→ chart), Direction badge, Entry/Exit Date, Entry/Exit Price, Qty, Net PnL (color-coded), R-Multiple (with est./defined indicator), Duration, Setup badge, Actions

Filter state: URL search params (shareable/bookmarkable)

- Support `setup` filter as a case-insensitive classification match
- Support `pageSize` in both the page and API so bookmarked views preserve density
- Add route-level loading and error UI for `/trades`

CSV Export: `Papa.unparse()` on full filtered result set (all pages). Columns: entryDate, exitDate, entryPrice, exitPrice, qty, grossPnl, netPnl, fees, duration, direction, setup, rMultiple, notes.

---

## Phase 7: Market Data Integration
Files: `src/lib/market-data/yahoo-client.ts`, `src/lib/market-data/market-data-cache.ts`, `src/app/api/market-data/route.ts`

- Daily data: `historical()` — unlimited, no key
- Intraday (1H, 15M, 5M, 1M): `chart()` with interval param — ~60 days of history
- Historical intraday data never expires (immutable). Today's data: 1-hour staleness check.
- `MarketDataCache.date` stores the candle timestamp (not `@db.Date`) so intraday rows can be cached distinctly
- Chart UI fallback banner: "Intraday data not available for this date range. Showing daily." — never blank/error.

API route: `GET /api/market-data?symbol&timeframe&from&to`

---

## Phase 7.5: Trade Context Enrichment Pipeline ✅ COMPLETE
Files: `src/lib/engine/trade-enrichment.ts`, `src/app/api/enrich/route.ts`

Runs async after upload confirmation. Progress bar on upload success screen: "Enriching trade context… X/Y symbols".

### Implementation details (as-built):

**Per symbol:** fetches 400 calendar days of daily OHLCV (not 365 — needs buffer for SMA200 + ADX warmup).

**Indicators computed at each trade's entry date** (`computeIndicators(candles, entryDate)`):
- Finds the last trading day at or before `entryDate` in the cached series
- **Minimum input:** index ≥ 28 (ADX(14) requires 28 data points to produce its first value — not 20)
- SMA 20/50/200, EMA 20 — `technicalindicators` SMA/EMA
- ATR 14 — `technicalindicators` ATR (high/low/close inputs)
- RSI 14 — `technicalindicators` RSI
- ADX 14 — `technicalindicators` ADX → `.adx` field (also has `.pdi`, `.mdi`)
- Bollinger Bands (20, 2σ) — `technicalindicators` BollingerBands → `.upper`, `.lower`
- 52w high/low: max/min over `candles[idx-251..idx]`
- prevClose: `candles[idx-1].close`
- gapPercent: `(open[idx] - prevClose) / prevClose`
- SMA50/200 fall back to SMA20 if insufficient data rather than returning null

**Market regime** (`classifyMarketRegime(spyCandles, entryDate)`):
- SPY data fetched once per enrichment run (up to latest entry date)
- TRENDING_UP: SPY close > SMA20 > SMA50
- TRENDING_DOWN: SPY close < SMA20 < SMA50
- CHOPPY: otherwise (including when SPY fetch fails — graceful degradation)

**Earnings:** `yahoo.quoteSummary(symbol, { modules: ['calendarEvents'] })` → `.calendarEvents.earnings.earningsDate[]`. Nearest date by absolute distance to entryDate. Failure is silently ignored (optional data).

**Post-upsert:** sets `RoundTripTrade.initialRisk = 1.5 × ATR14` when `initialRisk` is null.

**Progress tracking:** module-level `Map<accountId, EnrichmentProgress>` (in-process, reset on server restart). For SaaS: replace with DB-backed job queue.

**API:**
- `POST /api/enrich` — triggers `startEnrichment(accountId)` (fire-and-forget), returns `{ started, accountId }`
- `GET /api/enrich` — returns `{ status, total, enriched, tradesEnriched, done, errorCount }`

Classifier in Phase 11 reads from this pre-computed TradeContext — no on-the-fly fetching.

---

## Phase 8: Interactive Chart (Hero Feature) ✅ COMPLETE

**Three-layer architecture** (critical — Lightweight Charts requires window):
1. `src/app/(app)/chart/[symbol]/page.tsx` — server component: fetches trades + market data, serializes Decimal/Date to plain JS
2. `src/components/charts/ChartWorkspace.tsx` — `"use client"` wrapper: manages `focusTradeId` state, two-column layout (256px sidebar + flex-1 chart), header stats
3. `src/components/charts/CandlestickChart.tsx` — loaded via `dynamic(() => import(...), { ssr: false })`: actual LWC v5 chart

**As-built features:**
- Multi-timeframe toggle: 1D/1H/15M/5M/1M buttons — manual or auto-switch on zoom (debounced 700ms via `subscribeVisibleLogicalRangeChange`)
- Auto-TF fallback: intraday requests outside Yahoo's ~60-day lookback fall back to daily with amber banner
- **Trade fill markers** (color semantics confirmed after review): green arrowUp = long open (BUY), red arrowDown = short open (SELL_SHORT), amber = all closes (SELL, BUY_TO_COVER). Size scales with qty/maxQty via reduce (no spread).
- OHLCV crosshair info panel: volume lookup uses per-timeframe tolerance (86_400_000ms for 1d)
- Entry/exit price lines for focused trade: blue dashed entry, green/red dashed exit with `$`-prefixed P&L
- Focus zoom: click sidebar trade → zoom to trade window with 50% padding; deselect → zoom out to full history
- Responsive via ResizeObserver
- Loading/error states: skeleton loaders (candlestick bar shapes), never spinners; fetch errors and zero-candle results surface inline

**Shared formatters:** `src/lib/format.ts` — `formatCurrency`, `formatDuration`, `formatDate`. All display components import from here; no local duplicates.

---

## Phase 9: Performance Metrics Engine
File: `src/lib/engine/metrics.ts` — pure functions only, no side effects, fully unit tested

### Kelly Criterion (VERIFIED — implement exactly this):
```
f* = winRate - (lossRate / payoffRatio)

where:
  payoffRatio = avgWin / |avgLoss|
  winRate     = wins / totalTrades
  lossRate    = 1 - winRate

halfKelly    = f* / 2
quarterKelly = f* / 4
```

Exported functions: `kellyFull`, `kellyHalf`, `kellyQuarter` — all live in `metrics.ts`. No separate `kelly.ts`.

### Unit test cases (must pass before merging):
1. 60% WR, avgWin=$500, avgLoss=$300 → payoffRatio=1.667, f*=0.36, halfKelly=0.18, quarterKelly=0.09
2. 45% WR, avgWin=$200, avgLoss=$300 → payoffRatio=0.667, f*=−0.375 (negative = no edge, bet nothing)
3. 50% WR, avgWin=$400, avgLoss=$400 → payoffRatio=1.0, f*=0.00 (breakeven = no bet)

### Other formulas (verified):
```
winRate      = wins / total
profitFactor = grossWins / |grossLosses|
expectancy   = (winRate × avgWin) - (lossRate × |avgLoss|)
sharpeApprox = mean(dailyPnl) / stddev(dailyPnl) × sqrt(252)
maxDrawdown  = max(peakEquity - trough) / peakEquity  [over full history]
```

API route: `GET /api/metrics?accountId&dateFrom&dateTo`

---

## Phase 10: Dashboard
Files: `src/app/(app)/dashboard/page.tsx`, `src/app/api/dashboard/route.ts`, `src/components/dashboard/DashboardClient.tsx`

Summary cards: Total P&L (sparkline), Win Rate, Profit Factor, Avg Win/Loss ($+%), Expectancy, Streak, Best/Worst Day

Charts (Recharts):
- Equity curve + drawdown overlay
- P&L distribution histogram **with normal distribution curve overlay** (shows skew vs normal)
- Rolling 20-trade win rate
- P&L by day-of-week
- P&L by hour of day
  - **Implementation note:** Schwab/TDA Transaction History exports are date-only, so hour-of-day analysis is unavailable with the current source format. Surface this limitation explicitly in the dashboard rather than fabricating intraday timing buckets.
- Holding duration scatter (X = hold time, Y = P&L — spots overtrading / cutting winners early)
- **Position sizing scatter** (X = position size, Y = P&L — am I sizing up on bad trades?)
- Monthly P&L heatmap (GitHub contribution graph style, green/red intensity by daily P&L)
- Kelly widget (full/half/quarter + vs current avg size, warning if consistently over-sizing)
- **Sector/industry breakdown** — resolve symbols to sectors via yahoo-finance2 `quoteSummary()`, show P&L by sector

All charts behind TanStack Query with skeleton loaders. Every metric card clickable → filtered trades view.
Dashboard API should return chart-ready series (daily equity, histogram bins, rolling win rate, day-of-week, heatmap, scatter datasets, Kelly inputs) so the client page stays presentation-focused.

---

## Phase 11: Trade Classification Engine
File: `src/lib/engine/classifier.ts`

Rule-based scoring (0–100 per category), reads from pre-computed TradeContext (no fetching).

| Category | Primary Signals |
|---|---|
| BREAKOUT | Entry near N-day high, low pre-entry ATR |
| PULLBACK | Above 20 EMA (uptrend), entry on red day(s) |
| MEAN_REVERSION | >2 std dev from 20-day MA at entry |
| MOMENTUM | ADX > 25, multi-day hold, trend direction |
| REVERSAL | Downtrend, entry near 52-week low |
| AVERAGE_DOWN | Multiple adds at progressively lower prices |
| SCALP | Inferred same-day / very-short-hold candidate from `durationSeconds`; exact sub-hour timing is unobservable in date-only Schwab/TDA exports |
| GAP_PLAY | Significant `gapPercent`; exact "first 30 min" entry timing is unobservable in date-only Schwab/TDA exports, so short-hold behavior is inferred probabilistically |
| EARNINGS_PLAY | daysToEarnings ≤ 2 |

Assign top 1–2 categories per trade, store with confidence score.

Implementation note:
- Because the Schwab/TDA export is date-only, `SCALP` is inferred as a same-day / very-short-hold candidate from `durationSeconds`, not from literal intraday timestamps. Treat it as a probabilistic style tag rather than a precise sub-hour measurement.
- Classification is populated during the existing enrichment pass so `TradeContext` and `TradeClassification` stay in sync.

---

## Phase 12: Edge Analysis & Style Profile
File: `src/lib/engine/edge-analysis.ts`

### Style Profile
Aggregate classifications → "40% breakout, 25% pullback, 15% mean reversion, 10% scalp, 10% other"

### Per-Category Stats
Win rate with confidence interval, profit factor, expectancy, Kelly fraction, statistical significance (t-test: is this edge real or noise?)

### Regime Cross-Reference
Cross-reference trade performance vs market regime from TradeContext:
- "Your breakout trades work best in trending markets (72% WR) but poorly in choppy markets (38% WR)"
- Pulled from `marketRegime` field already stored in TradeContext — no new fetching needed

### Edge Persistence Score
For each identified edge, compute a rolling performance metric over time. Is the edge strengthening, stable, or decaying? Show a trend line. Flag if a historically strong edge has degraded in recent N trades.

### Recommendations Panel
- "Your breakout trades are your strongest edge (65% WR, 2.1 PF, p < 0.05). Consider allocating more capital here."
- "Your average-down trades are destroying value (30% WR, -$850 avg loss). Strongly consider eliminating or adding a max-add rule."
- "Your morning trades (9:30–11:00) significantly outperform afternoon. Consider reducing afternoon activity."
- "Based on Kelly, your optimal position size for breakout trades is 8% of capital. You're currently averaging 12%. Size down."

### Kelly Sizing Comparison
Recommended (per Kelly per category) vs actual average size — visual gap indicator

### Expected Value Calculator (forward-looking UI)
Input: symbol, direction, entry price, planned size. System looks at historical performance in similar classified setups and returns:
- "Based on 47 similar breakout trades, your expected P&L is +$420 with 62% confidence of profit"
- Suggested position size per Kelly
- Historical average hold time for this setup type

### Risk Scorecard
For a proposed trade, score it 1–10 on fit with demonstrated edges:
- "This looks like a bottom-fishing trade. Your historical edge in bottom fishing is negative. Risk score: 3/10."
- Reads from style profile + per-category win rates — no external data needed

---

## Phase 13: App Shell & Auth UI Polish
Files: `src/app/(app)/layout.tsx`, `src/components/layout/AppSidebar.tsx`, `src/components/layout/TopBar.tsx`

- Navigation: Left sidebar (Dashboard, Trades, Chart, Upload, Settings), top bar (account selector, date range, Cmd+K search)
- Keyboard shortcuts: j/k navigate trades, g d → dashboard, g t → trades, g c → chart, u → upload
- Framer Motion: page transitions, chart entry animations, metric card count-up on load

---

## Phase 14: Data Integrity Page + Settings
File: `src/app/(app)/settings/integrity/page.tsx`

Shows:
- Total executions, round-trip trades (open + closed)
- Orphaned executions (not linked to any round-trip)
- Position mismatches (closed trades where entry qty ≠ exit qty)
- Suspected duplicates not caught by unique constraint
- "Reprocess All Trades" button → re-runs grouper on all executions
- DailySnapshot rebuild: incremental by default. "Rebuild All Snapshots" button for full recomputation.

---

## Build Order
```
1 → 2 → 2b → 3 → 4 → 5 → 6 → 7 → 7.5 → 8 → 9 → 10 → 11 → 12 → 13 → 14
```

## Critical File Map
| File | Phase |
|---|---|
| `prisma/schema.prisma` | 2 |
| `src/lib/prisma.ts` | 2 |
| `src/lib/auth.ts` | 2b |
| `src/lib/session.ts` | 2b |
| `src/middleware.ts` | 2b |
| `src/lib/parser/tos-csv-parser.ts` | 3 |
| `src/lib/engine/trade-grouper.ts` | 4 |
| `src/lib/engine/metrics.ts` | 9 (includes Kelly: kellyFull, kellyHalf, kellyQuarter — no separate kelly.ts) |
| `src/app/api/dashboard/route.ts` | 10 |
| `src/components/dashboard/DashboardClient.tsx` | 10 |
| `src/lib/engine/classifier.ts` | 11 |
| `src/lib/engine/trade-enrichment.ts` | 7.5 |
| `src/lib/market-data/yahoo-client.ts` | 7 |
| `src/lib/market-data/market-data-cache.ts` | 7 |
| `src/app/api/market-data/route.ts` | 7 |
| `src/components/charts/CandlestickChart.tsx` | 8 — LWC v5 chart (ssr:false) |
| `src/components/charts/ChartWorkspace.tsx` | 8 — client state wrapper (focusTradeId, sidebar) |
| `src/lib/format.ts` | shared display formatters (formatCurrency, formatDuration, formatDate) |
| `src/components/layout/AppSidebar.tsx` | 13 |

---

## Parser Validation Results (complete — verified against real CSV 2026-03-13)
- **Format**: Schwab/TDA Transaction History (NOT TOS Activity & Positions)
- **Date**: `MM/DD/YYYY` or `M/D/YYYY` only — no intraday time. Row order = intra-day sequence.
- **Commission**: explicit in `Fees & Comm` column. `(Price - NetPrice) × Qty` does NOT apply.
- **Qty**: always positive. Side determined by Action field.
- **Action values**: `Buy`, `Sell`, `Sell Short`, `Buy to Cover`, `Journaled Shares` (skip)
- **2026 Schwab variant**: reverse-chronological (newest row first). Parser detects and reverses.
- **Amount**: parentheses notation `($1,234.56)` for negative in Schwab variant.
