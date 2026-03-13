# AuraTrade — Implementation Plan (v2)

> Last updated: 2026-03-12

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
- `@@unique([accountId, execTime, symbol, side, qty, price])` on Execution = row-level dedup
- DailySnapshot pre-computed, rebuilt incrementally from fromDate (not full rebuild)
- TradeContext stores pre-computed technical indicators per trade (for classification)

### Models

**Auth (NextAuth v5):** User, AuthAccount, Session, VerificationToken

**TradingAccount** — broker, currency, startingBalance, belongs to User

**Upload** — fileHash (SHA-256, unique per user for dedup), status, rowCounts, dateRange

**Execution** — individual TOS fill: execTime, symbol, side, qty, price, netPrice, commission, posEffect, assetType
- `@@unique([accountId, execTime, symbol, side, qty, price])` — row dedup

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

## Phase 3: TOS CSV Parser
File: `src/lib/parser/tos-csv-parser.ts`

TOS headers: `Exec Time, Spread, Side, Qty, Pos Effect, Symbol, Exp, Strike, Type, Price, Net Price, Order Type`

### Flagged Assumptions (verify with real CSV)
- Exec Time format: `MM/DD/YYYY HH:mm:ss` in Eastern Time → UTC via date-fns-tz
- Qty always positive regardless of Side
- Pos Effect values: `"TO OPEN"` → OPEN, `"TO CLOSE"` → CLOSE, `"AUTO"` → AUTO
- TOS wraps trades in multi-section CSV — parser scans for section header, not row 1
- Commission back-calculated: `(Price - NetPrice) × Qty` for **BOTH buys and sells** — TOS NetPrice is always net-of-fees (less favorable than raw Price regardless of side). **ASSUMPTION: verify against real CSV; adjust if sells behave differently.**
  - Unit test: Buy `Price=$150.00, NetPrice=$149.93, Qty=100` → commission=$7.00; Sell same values → commission=$7.00
- Equity filter: `Type.trim().toUpperCase() === 'STOCK'`
- File may have UTF-8 BOM → strip with `.replace(/^\uFEFF/, '')`

Pipeline: Strip BOM → PapaParse (header: true, dynamicTyping: false) → find section start → filter equities → normalize side/posEffect/symbol → parse numerics (strip commas) → parse dates → return `{ executions, skippedRows, assumptions, dateRange, symbols }`

---

## Phase 4: Trade Grouping Engine
File: `src/lib/engine/trade-grouper.ts`

Algorithm: FIFO position tracker per symbol

```
Sort executions ascending by execTime
For each execution:
  If OPENING (or AUTO inferred as open):
    Start or extend activeTrade for symbol
    Push lot to FIFO queue
  If CLOSING (or AUTO inferred as close):
    Consume FIFO lots until closing qty satisfied
    Add to activeTrade.closingFills
    If netPosition == 0: finalize round trip, delete activeTrade
    Else: partial close, trade continues
At end: remaining activeTrades → mark isOpen=true
```

### VWAP Formulas (verified):
```
entryVWAP = Σ(price × qty) / Σ(qty)  [over all opening fills]
exitVWAP  = Σ(price × qty) / Σ(qty)  [over all closing fills]
grossPnl  = (exitVWAP - entryVWAP) × closedQty  [long]
grossPnl  = (entryVWAP - exitVWAP) × closedQty  [short]
netPnl    = grossPnl - totalFees
```

### R-Multiple
- Default initialRisk = 1.5 × ATR(14) at entry (from TradeContext once enriched)
- User can manually override per trade → recalculates rMultiple
- UI indicator: italic "est." label (ATR-estimated) vs normal weight (user-defined)

Edge cases: same-second partial fills, overnight positions, AUTO posEffect inference, direction conflicts → emit open trade and start fresh

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
Files: `src/app/(app)/trades/page.tsx`, `src/app/api/trades/route.ts`, `src/components/trades/TradesTable.tsx`

API: `GET /api/trades?accountId&symbol&direction&dateFrom&dateTo&status&setup&page&pageSize&sortBy&sortDir`

Response: paginated trades + summary stats over full filtered set (two Prisma queries: paginated rows + aggregate).

Table columns: Symbol (→ chart), Direction badge, Entry/Exit Date, Entry/Exit Price, Qty, Net PnL (color-coded), R-Multiple (with est./defined indicator), Duration, Setup badge, Actions

Filter state: URL search params (shareable/bookmarkable)

CSV Export: `Papa.unparse()` on full filtered result set (all pages). Columns: entryDate, exitDate, entryPrice, exitPrice, qty, grossPnl, netPnl, fees, duration, direction, setup, rMultiple, notes.

---

## Phase 7: Market Data Integration
Files: `src/lib/market-data/yahoo-client.ts`, `src/lib/market-data/market-data-cache.ts`

- Daily data: `historical()` — unlimited, no key
- Intraday (1H, 15M, 5M, 1M): `chart()` with interval param — ~60 days of history
- Historical intraday data never expires (immutable). Today's data: 1-hour staleness check.
- Chart UI fallback banner: "Intraday data not available for this date range. Showing daily." — never blank/error.

API route: `GET /api/market-data?symbol&timeframe&from&to`

---

## Phase 7.5: Trade Context Enrichment Pipeline
File: `src/lib/engine/trade-enrichment.ts`

Runs async after upload confirmation. Progress indicator: "Enriching trade context... 12/47 symbols"

Per traded symbol, at each trade's entry date:
- Fetch 1 year of daily OHLCV (yahoo-finance2)
- Compute via `technicalindicators`: SMA 20/50/200, EMA 20, ATR 14, RSI 14, ADX 14, Bollinger Bands (20, 2)
- Derive: 52-week high/low, previous day's close, gap % `((open - prevClose) / prevClose)`
- Market regime: classify SPY trend for that date (TRENDING_UP/DOWN/CHOPPY)
- Fetch earnings dates via `yahoo-finance2.quoteSummary()` → nearestEarningsDate, daysToEarnings

Classifier in Phase 11 reads from this pre-computed TradeContext — no on-the-fly fetching.

---

## Phase 8: Interactive Chart (Hero Feature)
Files: `src/app/(app)/chart/[symbol]/page.tsx`, `src/components/charts/CandlestickChart.tsx`

**Critical:** `"use client"` + `dynamic(() => import(...), { ssr: false })` — Lightweight Charts requires window

Features:
- Multi-timeframe toggle: 1D, 1H, 15M, 5M, 1M (auto-fallback to daily if intraday unavailable)
- Trade markers: green up-triangle (BUY), red down-triangle (SELL), size scales with qty
- Hover tooltip: side, qty, price, time, running P&L
- Position shading: background tint entry→exit, green/red opacity proportional to position size
- Annotations: text labels ("Open +500sh @$142.30", "Trim -300sh @$145.00")
- Auto-navigate from trade list: click trade → chart frames that symbol + time range with padding
- Trade list sidebar: all round-trips for the symbol, click to zoom

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
File: `src/app/(app)/dashboard/page.tsx`

Summary cards: Total P&L (sparkline), Win Rate, Profit Factor, Avg Win/Loss ($+%), Expectancy, Streak, Best/Worst Day

Charts (Recharts):
- Equity curve + drawdown overlay
- P&L distribution histogram
- Rolling 20-trade win rate
- P&L by day-of-week
- P&L by hour of day
- Holding duration scatter
- Monthly P&L heatmap
- Kelly widget (full/half/quarter + vs current avg size)

All charts behind TanStack Query with skeleton loaders. Every metric card clickable → filtered trades view.

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
| SCALP | Duration < 1 hour |
| GAP_PLAY | Entry within first 30 min, gapPercent significant |
| EARNINGS_PLAY | daysToEarnings ≤ 2 |

Assign top 1–2 categories per trade, store with confidence score.

---

## Phase 12: Edge Analysis & Style Profile
File: `src/lib/engine/edge-analysis.ts`

- Style Profile: Aggregate classifications → "40% breakout, 25% pullback..."
- Per-category stats: win rate with confidence interval, profit factor, expectancy, Kelly fraction, statistical significance (t-test: is this edge real or noise?)
- Recommendations panel:
  - "Your breakout trades are your strongest edge (65% WR, 2.1 PF, p < 0.05)..."
  - "Your average-down trades are destroying value (30% WR, -$850 avg loss)..."
  - "Morning trades (9:30–11:00) significantly outperform afternoon..."
- Kelly sizing comparison: recommended vs actual average

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
| `src/lib/engine/classifier.ts` | 11 |
| `src/lib/engine/trade-enrichment.ts` | 7.5 |
| `src/lib/market-data/yahoo-client.ts` | 7 |
| `src/components/charts/CandlestickChart.tsx` | 8 |
| `src/components/layout/AppSidebar.tsx` | 13 |

---

## Parser Validation Checkpoint
User will provide sample TOS CSV. At that point, verify:
- Actual Exec Time format and timezone
- Whether Qty is ever negative
- Actual Side and Pos Effect string values
- Where trade rows actually begin in the multi-section file
- Any additional columns not in the spec
