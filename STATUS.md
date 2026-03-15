# AuraTrade — Build Status

> Updated as each phase completes. Claude should update this file after finishing each phase or significant sub-task.

## Current Phase
**Phase 9 — Performance Metrics Engine**

## Phase Checklist

| Phase | Description | Status | Notes |
|---|---|---|---|
| 1 | Project bootstrap (deps, shadcn, prisma init) | ✅ Done | |
| 2 | Database schema (`prisma/schema.prisma`) | ✅ Done | Migration applied, all 12 tables created |
| 2b | Auth plumbing (NextAuth v5, middleware, session) | ✅ Done | |
| 3 | TOS CSV parser | ✅ Done | Schwab/TDA format (both 2022 TDA + 2026 Schwab variants). 23 unit tests passing. |
| 4 | Trade grouping engine (FIFO) | ✅ Done | FIFO grouper, VWAP, LONG/SHORT PnL, open positions, 17 tests passing. |
| 5 | Upload flow (two-phase commit) | ✅ Done | Dropzone UI, parse preview, confirm writes to DB. Full trade rebuild on confirm. |
| 6 | Trades list page | ✅ Done | Server-rendered trades page, API filters, CSV export, extracted table component, loading/error states |
| 7 | Market data integration (yahoo-finance2) | ✅ Done | Yahoo client, cache layer, authenticated API route, symbol-page market data preview, loading/error states |
| 7.5 | Trade context enrichment pipeline | ✅ Done | Enrichment engine, /api/enrich route, progress UI on upload page. 23 tests in the enrichment suite; 75 total project tests after the review follow-up, market-data fallback fix, and full-span enrichment fix. |
| 8 | Interactive chart (Lightweight Charts) | ✅ Done | Candlestick chart, trade markers, price lines, auto-TF zoom, OHLCV panel, trade sidebar |
| 9 | Performance metrics engine (Kelly, formulas) | Not started | All formulas verified before implementation |
| 10 | Dashboard | Not started | |
| 11 | Trade classification engine | Not started | |
| 12 | Edge analysis & style profile | Not started | |
| 13 | App shell & auth UI polish | Not started | |
| 14 | Data integrity page + settings | Not started | |

## Decisions & Notes Log
| Date | Note |
|---|---|
| 2026-03-12 | ~~Commission formula: `(Price - NetPrice) × Qty`~~ — superseded by 2026-03-13 finding. Read from `Fees & Comm` column directly. |
| 2026-03-12 | Kelly functions (`kellyFull`, `kellyHalf`, `kellyQuarter`) live in `metrics.ts` only — no separate `kelly.ts`. |
| 2026-03-12 | `create-next-app` already done (initial commit exists). Phase 1 starts from dep install. |
| 2026-03-12 | **Prisma v7 → v6 downgrade**: v7 TS-native client (`provider="prisma-client"`) fails with Turbopack (`node:path` error). Downgraded to Prisma v6.19.2 (`prisma-client-js` + Node-API library engine). No adapter needed. |
| 2026-03-12 | `prisma.config.ts` manages datasource URL for Prisma v6. Schema datasource block also has `url = env("DATABASE_URL")`. Client outputs to `src/generated/prisma`. |
| 2026-03-12 | shadcn v4 — `components.json` written manually (zinc base color). `src/lib/utils.ts` created manually. shadcn init skipped (interactive prompts unbypassable). |
| 2026-03-12 | Fonts: Inter + JetBrains Mono (replaced Geist). Dark-first zinc theme applied to `globals.css`. |
| 2026-03-12 | `jest`, `@types/jest`, `ts-jest` installed. TypeScript clean (no errors). |
| 2026-03-13 | Added `LogoutButton` to dashboard stub (top bar: email + sign out button). Auth flow fully verified: register → login → dashboard → logout. |
| 2026-03-13 | User provided real TOS CSV sample for Phase 3 parser validation. File not yet read/parsed. |
| 2026-03-13 | Phase 3 complete. CSV is Schwab/TDA Transaction History (NOT TOS Activity & Positions). Date-only (no time), commission explicit in "Fees & Comm", two format variants (2022 TDA + 2026 Schwab). Commission formula `(Price - NetPrice) × Qty` does NOT apply. |
| 2026-03-13 | Parser bug fix (A7): 2026 Schwab file is reverse-chronological (newest row first). Parser now detects (first date > last date) and reverses + renumbers rowIndex. Fixes 421 phantom open positions that were really completed intraday trades. 25 parser tests passing. |
| 2026-03-13 | Dedup fix: replaced rowIndex-offset execTime encoding with explicit `daySeq Int` column on Execution. daySeq = 0-based occurrence index within (accountId, execTime, symbol, side, qty, price) group. Unique constraint now includes daySeq. Same execution from two overlapping CSV files always gets same daySeq → correctly deduplicated. Migration: `20260313200000_add_execution_dayseq`. |
| 2026-03-13 | Phase 6 complete. Trades list page now supports URL-synced filters for symbol/direction/status/setup/date/pageSize, CSV export includes notes, and table markup was extracted to `src/components/trades/TradesTable.tsx`. |
| 2026-03-13 | Added route-level loading + error states for `/trades`, plus a temporary `/chart/[symbol]` symbol detail page so trade links resolve before the Phase 8 interactive chart lands. |
| 2026-03-13 | Dashboard stub nav bug fixed: `/dashboard` top bar now links to both `/trades` and `/upload`, so Phase 6 is reachable through the UI instead of only by direct URL entry. |
| 2026-03-13 | Playwright installed for local smoke testing. Added `playwright.config.ts`, auth/navigation smoke test, upload/import smoke test, and a CSV fixture. `npx playwright test` passes locally against the dev server. |
| 2026-03-13 | Adopted feature-branch + PR workflow: meaningful work should land through short-lived branches into `main`, with local tester pass, local reviewer pass, and CodeRabbit PR review as the default merge gate. |
| 2026-03-13 | Tightened the branch workflow: user-facing changes should pass Playwright before commit unless a blocker is explicitly called out. Added a chart-market-data smoke test that covers `/trades` → `/chart/[symbol]` navigation after CSV import. |
| 2026-03-13 | Phase 7 complete. Added `src/lib/market-data/yahoo-client.ts`, `src/lib/market-data/market-data-cache.ts`, and authenticated `GET /api/market-data`. The symbol page at `/chart/[symbol]` now shows timeframe-switched candle previews with fallback messaging, plus route-level loading/error states. |
| 2026-03-13 | Market data cache schema corrected for intraday support: `MarketDataCache.date` now stores candle timestamps (migration `20260313212628_market_data_cache_timestamps`) instead of `@db.Date`, which previously could only store one row per day. |
| 2026-03-13 | `next build` is currently NOT clean: Next.js 16 middleware/proxy edge runtime still imports Prisma via auth middleware. Full-project lint also still fails because ESLint scans `src/generated/prisma`. |
| 2026-03-14 | Phase 7.5 complete. `trade-enrichment.ts` computes all technical context at trade entry date. ADX(14) requires 28 data points minimum (not 20) — `computeIndicators` returns null if idx < 28. Enrichment is fire-and-forget; progress tracked in module-level Map (suitable for local dev, replace with DB-backed job queue for SaaS). `POST /api/enrich` triggers, `GET /api/enrich` polls. Upload page shows live progress bar and completion banner. |
| 2026-03-14 | Note: Playwright smoke tests were NOT re-run for the initial Phase 7.5 implementation pass (enrichment is a background async flow, no new routes that require navigation tests). tsc + jest (68 tests at that point) confirmed clean. |
| 2026-03-14 | Review follow-up for Phase 7.5: enrichment now resolves nearest earnings per trade entry date from a shared per-symbol earnings calendar fetch, and ATR-derived `initialRisk` also sets `riskSource = "ATR"` so the existing trades UI can show the planned estimated-risk indicator. |
| 2026-03-14 | Review follow-up: `/upload` enrichment polling now surfaces non-OK / network failures as a terminal enrichment error instead of silently stalling, `startEnrichment()` queues a rerun when called during an active job, and `/api/enrich` route docs now match the real mounted GET path. |
| 2026-03-14 | Market-data fallback fix: old intraday chart requests now fall back to daily candles when the requested window is outside Yahoo's intraday lookback, which restores the chart preview smoke test for historical trades. |
| 2026-03-14 | Enrichment history-span fix: symbol and SPY daily fetches now cover the earliest-to-latest trade range (plus warmup buffer) so older trades in multi-year accounts are not silently skipped during enrichment. |
| 2026-03-14 | Re-ran local verification after the review fixes: `npx tsc --noEmit` and `npx jest --runInBand` (75 tests) pass. `npm run test:e2e` already passed earlier in the same review-follow-up pass and was not re-run after the final non-UI enrichment-span fix. |
| 2026-03-15 | Phase 8 peer-review pass (11 findings fixed on branch `fix/phase-8-review-findings`): `Math.max(...spread)` → `reduce`, SHORT trade marker color semantics (green=long open, red=short open, amber=all closes), crosshair volume tolerance made timeframe-aware, zero-candle/fetch-failure paths update TF state + show error, deselect-trade zooms out to full history, "round trips" count uses closedTrades, exit price line shows `$`-prefixed P&L, `initialTimeframe` uses server `effectiveTimeframe`, `posEffect` dropped from ChartFill wire format, conflicting commission note removed from STATUS.md, Playwright spec asserts TF switch via fallback message. |
| 2026-03-15 | CodeRabbit follow-up (6 findings fixed, same PR): volume display handles 0/small volumes (`—` for 0, raw integer for <1000), `Math.min/max` spread in page.tsx date-range replaced with reduce, empty catch block now logs dev-mode warning, spinners in `loading.tsx` and `ChartWorkspace` dynamic fallback replaced with candlestick bar skeletons (CLAUDE.md rule: skeleton loaders not spinners), duplicate local formatters removed from ChartWorkspace — now imports `formatCurrency`/`formatDuration`/`formatDate` from `src/lib/format.ts`. |
| 2026-03-15 | Branch workflow violation noted: Phase 8 was committed directly to `main` without Playwright pass or PR. Corrected in the review-fix PR. `gh` CLI path confirmed: `C:\Program Files\GitHub CLI\gh.exe` (not on bash PATH, use full path). |

## Pending User Actions
- [ ] Set a real `NEXTAUTH_SECRET` in `.env.local` (`openssl rand -base64 32`)
- [x] ~~Provide sample TOS CSV export for parser validation~~ — received 2026-03-13

## Where We Stopped (2026-03-15)

### What's complete
- **Phases 1–8 complete.** All DB tables present. Docker container `auratrade-pg` on port 5432.
- **Parser** (`src/lib/parser/tos-csv-parser.ts`): handles both TDA 2022 and Schwab 2026 CSV variants, auto-detects reverse-chronological order, daySeq dedup.
- **Grouper** (`src/lib/engine/trade-grouper.ts`): FIFO VWAP grouper, pure function, no DB calls.
- **Upload flow** (`/upload`, `/api/upload`, `/api/upload/[id]/confirm`): two-phase parse-preview → confirm-write; full trade rebuild on every confirm; enrichment auto-triggered after confirm.
- **Trades list** (`/trades`, `/api/trades`): URL-synced filters, sortable columns, page-size, CSV export, loading/error states.
- **Market data** (`src/lib/market-data/`): Yahoo daily + intraday, DB cache with staleness logic, `GET /api/market-data`.
- **Enrichment** (`src/lib/engine/trade-enrichment.ts`): SMA20/50/200, EMA20, ATR14, RSI14, ADX14, BBands, 52w range, gap %, SPY regime, earnings. `POST /api/enrich` triggers; `GET /api/enrich` polls. Upload page shows live progress bar.
- **Interactive chart** (`/chart/[symbol]`): LWC v5 candlestick chart, fill markers, price lines, auto-TF zoom, OHLCV crosshair panel, trade sidebar with focus/zoom. Fully reviewed (peer-review + CodeRabbit).

### Phase 8 — complete and reviewed (2026-03-15)

**Files (final state after review):**
- `src/components/charts/CandlestickChart.tsx` — LWC v5 chart (ssr:false). Marker color semantics: green=long open (BUY), red=short open (SELL_SHORT), amber=all closes. Volume crosshair uses per-TF tolerance. Deselect zooms out to full history via `reduce`-based min/max.
- `src/components/charts/ChartWorkspace.tsx` — client state wrapper (focusTradeId). Imports shared formatters from `src/lib/format.ts`. Dynamic import fallback is a candlestick skeleton (not spinner).
- `src/app/(app)/chart/[symbol]/page.tsx` — server component. Date-range uses reduce (no spread). Dev-mode warning on market data fetch failure.
- `src/app/(app)/chart/[symbol]/loading.tsx` — candlestick bar skeleton (not spinner).

**Open PR:** `fix/phase-8-review-findings` — passes tsc, jest 75/75, playwright 3/3.

**Known build issues (pre-existing):**
- `next build` fails: auth middleware imports Prisma into the edge runtime.
- `npm run lint` fails: ESLint scans `src/generated/prisma`.

### Verification state
- `npx tsc --noEmit` — clean
- `npx jest --runInBand` — 75 tests passing
- `npx playwright test` — 3/3 passing
- Branch: `fix/phase-8-review-findings` (open PR, awaiting merge)

### Next: Phase 9 — Performance Metrics Engine
Target file: `src/lib/engine/metrics.ts`

Key formulas (from PLAN.md, must be verified before implementation):
- Kelly criterion: `f* = winRate - (lossRate / payoffRatio)`
- Profit factor, expectancy, Sharpe approx, max drawdown
- API route: `GET /api/metrics?accountId&dateFrom&dateTo`
