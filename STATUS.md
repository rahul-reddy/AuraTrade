# AuraTrade — Build Status

> Updated as each phase completes. Claude should update this file after finishing each phase or significant sub-task.

## Current Phase
**Phase 8 — Interactive Chart (Hero Feature)**

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
| 7.5 | Trade context enrichment pipeline | ✅ Done | Enrichment engine, /api/enrich route, progress UI on upload page. 19 new tests (68 total). |
| 8 | Interactive chart (Lightweight Charts) | Not started | Hero feature |
| 9 | Performance metrics engine (Kelly, formulas) | Not started | All formulas verified before implementation |
| 10 | Dashboard | Not started | |
| 11 | Trade classification engine | Not started | |
| 12 | Edge analysis & style profile | Not started | |
| 13 | App shell & auth UI polish | Not started | |
| 14 | Data integrity page + settings | Not started | |

## Decisions & Notes Log
| Date | Note |
|---|---|
| 2026-03-12 | Commission formula corrected: `(Price - NetPrice) × Qty` for BOTH buys and sells. Verify against real TOS CSV. |
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

## Pending User Actions
- [ ] Set a real `NEXTAUTH_SECRET` in `.env.local` (`openssl rand -base64 32`)
- [x] ~~Provide sample TOS CSV export for parser validation~~ — received 2026-03-13

## Where We Stopped (2026-03-13)
- Phases 1, 2, 2b, 3, 4, 5, 6, and 7 complete.
- Docker container `auratrade-pg` running on port 5432, all 12 DB tables present.
- `npx tsc --noEmit` passes. `next build` still fails because auth middleware pulls Prisma into the edge runtime. Full-project `npm run lint` still fails because generated Prisma client files under `src/generated/prisma` are linted.
- Parser exports `parseSchwabCSV()` — handles both TDA (2022) and Schwab (2026) CSV variants.
- Grouper exports `groupTrades(executions)` → `{ trades, warnings }`. Pure function, no DB calls.
- Phase 5 complete. Upload page at `/upload`. Two API routes: POST /api/upload (parse+preview) and POST /api/upload/[id]/confirm (write to DB).
- Confirm step: upserts executions, rebuilds ALL RoundTripTrades from scratch (safe for overlapping re-uploads).
- execTime = pure midnight UTC date. daySeq = content-based intra-day sequence for dedup + FIFO ordering.
- Toaster added to root layout (sonner, dark theme).
- Phase 6 complete. `/trades` now has URL-synced filters, sortable columns, page-size control, CSV export, loading/error states, and a non-404 symbol detail target at `/chart/[symbol]`.
- Phase 7 complete. `/api/market-data` now serves cached Yahoo candles, `MarketDataCache` stores timestamped intraday rows, and `/chart/[symbol]` now has a real market-data preview with timeframe switching and fallback/error states ahead of the Phase 8 interactive chart.
- Verification: `npx tsc --noEmit` passes, `npx jest --runInBand` passes (48 tests), targeted ESLint passes on the modified Phase 7 files, and `npx playwright test` passes with 3 local smoke tests including the chart market-data flow.
- Phase 7.5 complete. `src/lib/engine/trade-enrichment.ts` computes SMA20/50/200, EMA20, ATR14, RSI14, ADX14, Bollinger Bands, 52w range, gap %, SPY market regime, and nearest earnings per trade. `POST /api/enrich` triggers async enrichment; `GET /api/enrich` polls progress. Upload page shows live enrichment banner with progress bar after import.
- 19 new tests — all 68 tests passing. `npx tsc --noEmit` clean.
- **Next: Phase 8 — Interactive Chart** (`src/app/(app)/chart/[symbol]/page.tsx`)
