# AuraTrade — Build Status

> Updated as each phase completes. Claude should update this file after finishing each phase or significant sub-task.

## Current handoff (2026-10-17): hosted deployment

- **Decision:** owner chose Option A (its own Lightsail server, TenFold's pattern) and the
  domain `auratrades.quest` (Namecheap).
- **Provisioned (live AWS, `us-east-2`):** `auratrade-1` (`small_3_0`, $12/month), static IP
  `auratrade-ip` = `18.226.191.214`, ports 22/80/443 only, daily auto-snapshots 09:00 UTC,
  key `~/.ssh/auratrade-lightsail`. Docker, swap and unattended-upgrades installed.
- **Branch `feat/lightsail-deployment`:** `deploy/` stack (Postgres 16, web, migrate,
  Caddy), Dockerfile `migrate` stage, `scripts/deploy.ps1` (clean worktree, sha on
  origin/main, green `Verify AuraTrade`, typed `DEPLOY <sha7>`, `git archive` over SSH so
  the server holds no GitHub credential), backup before every migrate plus daily dumps,
  `deploy/set-user.mjs` (owner account, password on stdin). Sign-up switch
  `AURATRADE_REGISTRATION` (pinned `closed` on the server; unknown values close it).
  Failed sign-in lockout (5 per email per 15 min). Runbook rewritten: `docs/DEPLOYMENT.md`.
- **Local results on this revision:** lint 0 errors; typecheck clean; `npm test` 261/261
  (adds login-throttle and registration tests); fresh-DB migrate + `npm run build` +
  Playwright 12/12 against `next start` (adds `login-lockout.spec.ts`). The deploy stack
  itself ran locally in Docker with `localhost`: both images build, 12 migrations apply,
  `set-user.mjs` creates an account and refuses a short password, `/login` 200, signed-out
  `/dashboard` 307 → `/login`, register POST 403, `/register` shows "Sign-up is closed",
  no sign-up link on `/login`, HTTP → HTTPS, HSTS/frame headers; a browser signed in, and
  after five wrong passwords the right one was refused.
- **Pending owner actions:** Namecheap DNS `A @ 18.226.191.214` and `CNAME www
  auratrades.quest.`; raise the account-wide $20 "My Monthly Cost Budget" (two servers
  ≈ $26–28/month; the TenFold IAM user cannot edit it); choose whether to copy the
  workstation database to the server or start empty with `set-user.mjs`.
- **Next action:** merge through `scripts/merge-pr.ps1`, then first deploy with
  `scripts/deploy.ps1` once DNS resolves.

## Previous handoff (2026-10-16)

- **Branch / revision:** `feat/tos-account-statement-import`, rebased onto `main` at
  `83fd9eb` (workflow harness, PR #13). Verified locally at the rebased head before push;
  CI results are recorded on the PR.
- **What changed:** thinkorswim Account Statement importer (per-second fill times, fees
  joined from Cash Balance rows); account-level statement ledger (carry-in positions pair
  across files, overlapping statements never double-count, tags/notes survive rebuilds);
  `BrokerStatementImport` gains `sourceFormat`, `coverageFrom/To`, `confirmedAt`; enrichment
  survives a concurrent rebuild. On rebase, the feature migration dropped its two foreign
  keys, which `main` now creates in the guarded `20261016190000` migration.
- **Cross-review round 1 (codex, critical tier):** 5 blocking findings, all fixed:
  (1) legacy Execution-path duplication — one canonical ledger import path; `confirmedAt`
  backfilled only for statements that own ledger trades; statements overlapping legacy
  fills are refused; (2) close-only statements were rejected — preview/confirm now use
  account-level impact; (3) unmatched fee rows became $0 fees — now block import;
  (4) option fee join ignored contract identity — key now includes expiry/strike/type;
  (5) unsupported instrument types imported as equity — only STOCK/ETF allowed.
- **Cross-review round 2 (codex):** 4 blocking findings, all fixed: (1) concurrent
  same-account confirms could rebuild from stale snapshots — account-level Postgres advisory
  lock in confirm and integrity reprocess (verified serializing on Postgres; concurrent
  Playwright test); (2) expiration-/transfer-only follow-up statements were rejected —
  shared `evaluateAccountImport` counts lifecycle rows; (3) date-only Expired rows sorted
  before same-day TOS fills — placed at end of trading day (ET); (4) missing/malformed fee
  columns became $0 — both fee headers required, malformed cells block.
- **Cross-review round 3 (codex):** 3 blocking findings, all fixed: (1) legacy Execution
  inventory could not be closed by new statements — legacy executions now enter the
  account ledger as a synthetic oldest-precedence statement, the ledger owns every trade,
  executions are re-linked to rebuilt trades, the Execution-only rebuild is removed;
  (2) preview stamped the candidate "now" while the rebuild used its stored createdAt —
  both now use the persisted value; (3) tags/notes were lost when a date-only trade became
  a timestamped TOS trade — annotations fall back to (symbol, direction, trading day) when
  unambiguous.
- **Cross-review round 4 (codex):** 2 blocking findings, both fixed: (1) the synthetic
  legacy input could outrank real statements when its coverage ended later — it now ranks
  below every real statement and never owns lifecycle events; (2) statement-imported
  trades had no per-trade fills, so charts lost fill markers and the classifier lost
  scale-in/average-down signals — the ledger now writes `TradeFill` rows (migration
  `20261016210000_trade_fills`) that both consumers read.
- **Cross-review round 5 (codex):** 1 blocking finding, fixed: annotation carry-over keyed
  on (symbol, direction, entry instant) was ambiguous for repeated same-day date-only round
  trips. Trades now store `sourceKey` (migration `20261016220000_trade_source_key`) and
  matching only pairs keys unique on both sides. Real data: 1196/1196 unique identities.
- **Cross-review round 6 (codex):** 1 blocking finding, fixed: expirations ordered at ET
  end-of-day landed on the next UTC date in daily snapshots, the daily series, day-of-week
  stats and date filters. Trades now store `entryTradingDate`/`exitTradingDate` (migration
  `20261016230000_trade_trading_dates`) and all daily aggregates bucket through
  `src/lib/trades/trading-date.ts`. Real data: 4 trades had been bucketed on the wrong day.
- **Cross-review rounds 7–8 (codex):** round 7's output was malformed (not recorded) but
  its finding was fixed — TOS coverage fallback now uses ET trading days; round 8's 2
  findings fixed — truncated cash rows no longer count as $0 fees, and the Trades page/API
  (CSV export) filter by entry trading day. Dashboard best/worst-day labels pinned to UTC.
  Round 9: invalid dates (e.g. 2/30) now block the statement instead of silently dropping a
  fill; TOS dates are validated without calendar rollover.
- **Local results on this revision:** `npm run lint` 0 errors; `npm run typecheck` clean;
  `npm test` 252/252; fresh-DB `prisma migrate deploy` + drift check: no difference;
  `npm run build` passed; Playwright 11/11 with no retries against `next start` (adds a
  two-statement carry-in import and a concurrent two-confirm import). Real 703-fill statement unchanged: 702 importable,
  0 blocked, all option fills matched to their own contract's fee row.
- **Local data:** the owner's database is migrated (checksum of the rebased feature
  migration realigned; the guarded FK migration applied as a no-op; 16 test-account
  statements un-confirmed per the narrowed backfill, owner statements unchanged). After merge, run
  Settings → Data Integrity → Reprocess trades to rebuild trades account-wide.
- **Delivery:** `ghcr.io/rahul-reddy/auratrade-web:83fd9eb35692c0450ccc90b1465c1db0dfc0c592`
  published by the first main run. No hosting target exists yet (`docs/DEPLOYMENT.md`).
- **Next action:** merge this PR through `scripts/merge-pr.ps1`; owner confirms the
  critical-path list in AGENTS.md and chooses a host.

## Current Phase
**Post-phase follow-up: timestamped thinkorswim Account Statement import** (branch `feat/tos-account-statement-import`)

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
| 9 | Performance metrics engine (Kelly, formulas) | ✅ Done | Pure `metrics.ts`, authenticated `GET /api/metrics`, 9 unit tests. Daily performance series is currently derived from closed-trade exit dates rather than `DailySnapshot` rows. |
| 10 | Dashboard | ✅ Done | Query-backed dashboard UI, chart-ready `/api/dashboard`, loading/error states, sector breakdown, and explicit hour-of-day limitation for date-only Schwab exports. |
| 11 | Trade classification engine | ✅ Done | Pure `classifier.ts`, classification upserts during enrichment, 11 unit tests. Same-day `SCALP` tagging is treated as a date-only export candidate, not literal intraday timestamp truth. |
| 12 | Edge analysis & style profile | ✅ Done | Pure `edge-analysis.ts` engine with style profile, per-setup stats, regime cross-reference, persistence trends, Kelly sizing comparison, recommendations, expected-value estimates, and setup-fit scoring. 11 unit tests. |
| 13 | App shell & auth UI polish | ✅ Done | Collapsible sidebar, TopBar, CommandPalette (⌘K), Framer Motion page transitions, global keyboard shortcuts (g d/t/c, u, ⌘K) |
| 14 | Data integrity page + settings | ✅ Done | Settings integrity workspace, repair actions, snapshot rebuild engine, and sidebar/command-palette wiring landed. |

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
| 2026-03-16 | Phase 9 complete on branch `feat/phase-9-metrics-engine`: added `src/lib/engine/metrics.ts` with pure win-rate / PF / expectancy / Sharpe / max-drawdown / Kelly helpers plus `buildDailyPerformanceSeries()` and `calculatePerformanceMetrics()`. Added authenticated `GET /api/metrics` scoped by user/account and filtered by `exitTime` for realized-performance windows. |
| 2026-03-16 | Phase 9 verification: `npx tsc --noEmit` clean, targeted metrics suite 9/9 passing, full `npx jest --runInBand` now 84/84 passing. |
| 2026-03-16 | Merge-gate follow-up for Phase 9: `npm run test:e2e` re-run on branch `feat/phase-9-metrics-engine` and passed 3/3. No checked-in `review-local` command or script exists in the repo today, so the local review pass was performed manually against the diff instead of via an automated command. |
| 2026-03-16 | PR review follow-up for Phase 9: fixed `calculateMaxDrawdown()` to measure ratio against the running peak at the time of each drawdown, changed `/api/metrics` 500 responses to avoid echoing raw internal errors, and added direct unit coverage for the exported metrics helpers plus Sharpe's `<2 samples` edge case. Re-ran `npx tsc --noEmit`, `npx jest --runInBand` (94/94), and `npm run test:e2e` (3/3). |
| 2026-03-16 | Phase 10 complete on branch `feat/phase-10-dashboard`: added `src/app/api/dashboard/route.ts` for chart-ready dashboard data, `src/lib/dashboard/dashboard-data.ts` for pure dashboard aggregates, TanStack Query provider wiring in `src/app/layout.tsx`, and `src/components/dashboard/DashboardClient.tsx` with summary cards, equity/drawdown, histogram + normal overlay, rolling win rate, day-of-week, heatmap, scatter charts, Kelly widget, and sector breakdown. |
| 2026-03-16 | Dashboard limitation decision: hour-of-day analysis is intentionally surfaced as unavailable because the Schwab/TDA Transaction History export is date-only. We show the limitation explicitly instead of fabricating intraday buckets. |
| 2026-03-16 | Phase 10 verification: `npx tsc --noEmit` clean, `npx jest --runInBand` 96/96 passing, `npm run test:e2e` 4/4 passing after adding `playwright/dashboard.spec.ts` and updating the auth-nav smoke test for the new no-account dashboard empty state. |
| 2026-03-16 | Phase 11 complete on branch `feat/phase-11-classifier`: added `src/lib/engine/classifier.ts` with rule-based scoring for BREAKOUT / PULLBACK / MEAN_REVERSION / MOMENTUM / REVERSAL / AVERAGE_DOWN / SCALP / GAP_PLAY / EARNINGS_PLAY plus `OTHER` fallback, and wired `runEnrichment()` to upsert `TradeClassification` alongside `TradeContext`. |
| 2026-03-16 | Classification limitation decision: because Schwab/TDA exports are date-only, same-day trades are tagged as `SCALP` candidates from `durationSeconds === 0` rather than precise intraday timing. Treat `SCALP` as a probabilistic style tag, especially when paired with a stronger primary setup. |
| 2026-03-16 | Phase 11 verification: `npx tsc --noEmit` clean, `npx jest --runInBand` 107/107 passing after adding `src/__tests__/engine/classifier.test.ts`, and `npm run test:e2e` 4/4 passing. |
| 2026-03-16 | PR review follow-up for Phase 11: classifier scoring now keeps raw unrounded inputs for threshold checks, AVERAGE_DOWN ordering uses `execTime` + `daySeq` instead of `daySeq` alone, `secondarySetup` is cleared with `null` when removed on reclassification, and boundary-score tests were added for the 55-point primary cutoff and exact score weights. Re-ran `npx tsc --noEmit`, `npx jest --runInBand` (110/110), and `npm run test:e2e` (4/4). |
| 2026-03-16 | Phase 12 complete on branch `feat/phase-12-edge-analysis`: added `src/lib/engine/edge-analysis.ts` with style-profile aggregation, per-setup performance summaries, Wilson win-rate confidence intervals, one-sample t-test significance checks, regime cross-reference, rolling expectancy persistence, Kelly sizing comparison, recommendations, expected-value estimation, and setup-fit scoring. |
| 2026-03-16 | PR review follow-up for Phase 12: regime cross-reference now excludes trades with missing `marketRegime` instead of folding them into `CHOPPY`, and expected-value sizing now returns `null` rather than a negative suggested notional when Kelly is nonpositive. Re-ran `npx tsc --noEmit`, `npx jest --runInBand` (123/123), and `npm run test:e2e` (4/4). |
| 2026-03-17 | Phase 13 complete on branch `feat/phase-13-app-shell`: added persistent collapsible sidebar (`AppSidebar`), topbar with dynamic page title and ⌘K button (`TopBar`), Cmd+K command palette for page navigation (`CommandPalette`), Framer Motion `AnimatePresence` page transitions, and global keyboard shortcuts (g d/t/c, u, ⌘K) via `AppShell`. Inline nav bars removed from DashboardClient, trades page, and upload page. `(app)/layout.tsx` is a server component that fetches session+first account and wraps all (app) routes in AppShell. `npx tsc --noEmit` clean, `npx jest --runInBand` 123/123. |
| 2026-03-17 | CI review workflow updated: `.github/workflows/claude-code-review.yml` no longer auto-runs on PR open/sync. Claude review now runs only when a PR comment contains `/claude-review` or when the workflow is launched manually via `workflow_dispatch` with a PR number. |
| 2026-03-17 | Phase 14 complete on branch `feat/phase-14-data-integrity`: added `src/app/(app)/settings/integrity/page.tsx`, `src/components/settings/IntegrityClient.tsx`, and authenticated `GET/POST /api/settings/integrity` so the app now shows execution/trade health counts, orphaned execution samples, position mismatch samples, duplicate-candidate clusters, and repair actions for full trade reprocessing or full snapshot rebuilds. |
| 2026-03-17 | Data repair engine extraction: added `src/lib/engine/account-rebuild.ts` and `src/lib/engine/daily-snapshots.ts` as the shared source of truth for account-wide trade regrouping and `DailySnapshot` recomputation. Upload confirmation now reuses these helpers and incrementally rebuilds snapshots from the earliest date in a newly imported file instead of leaving `DailySnapshot` stale. |
| 2026-03-17 | Phase 14 verification: `npx tsc --noEmit` clean, `npx jest --runInBand` 126/126 passing after adding `src/__tests__/engine/daily-snapshots.test.ts`, and focused Playwright smoke `npx playwright test playwright/settings-integrity.spec.ts` passing for the new settings route. |
| 2026-03-17 | Phase 14 merge-gate follow-up: manual local reviewer pass completed with no actionable findings. Full `npm run test:e2e` suite now passes 5/5, including the new integrity settings smoke. |
| 2026-03-17 | PR comment follow-up for Phase 14: added confirmation prompts around both destructive integrity actions, hardened `/api/settings/integrity` against invalid JSON bodies, switched the snapshot engine to Decimal arithmetic with a full-rebuild fallback when incremental history is missing, enabled horizontal scroll for the integrity tables on small screens, aligned the command palette label with Settings, and expanded the Playwright spec to exercise both repair buttons. Re-ran `npx tsc --noEmit`, `npx jest --runInBand` (126/126), and `npm run test:e2e` (5/5). |
| 2026-03-20 | Trade-domain backend reset completed ahead of the parser/grouper rethink: deleted all `Upload`, `Execution`, `RoundTripTrade`, `TradeContext`, `TradeClassification`, and `DailySnapshot` rows while preserving users, sessions, trading accounts, and market-data cache. |
| 2026-03-20 | Upload preview now runs a new dry-run analyzer in `src/lib/parser/schwab-statement-analyzer.ts` before canonical import. The analyzer preserves broker `Action` values, classifies row taxonomy, detects option contracts/multipliers, and blocks canonical import when the statement contains option open/close rows, `Expired` rows, or position-affecting non-trade rows such as `Journaled Shares`. |
| 2026-03-20 | Real statement finding: `Individual_XXX047_Transactions_20260313-091015_updated.csv` contains options (`Buy to Open`, `Sell to Close`, `Sell to Open`, `Buy to Close`, `Expired`) plus `Journaled Shares`, dividends, interest, transfers, and merger/service-fee rows. Example ORCL option rows reconcile at a 100x multiplier, confirming quantities are contracts, not shares. |
| 2026-03-20 | Verification for the dry-run safety gate: `npx tsc --noEmit` clean, `npx jest --runInBand` now 129/129 passing, and focused Playwright `playwright/upload-import.spec.ts` passing on rerun after an initial dev-server compile timeout during login. |
| 2026-03-20 | Added raw broker-statement persistence via `BrokerStatementImport` + `BrokerStatementRow` (migration `20260320160220_add_broker_statement_imports`). `/api/upload` now stores dry-run statement metadata and normalized raw rows even when canonical import is blocked, so mixed statements remain auditable before the option-aware ledger exists. |
| 2026-03-20 | Added Jest coverage for broker-statement persistence mapping/update flow in `src/__tests__/parser/broker-statement-store.test.ts`. Re-ran `npx tsc --noEmit` clean and `npx jest --runInBand` now 131/131 passing. Focused Playwright `playwright/upload-dry-run-blockers.spec.ts` is currently blocked by the pre-existing middleware/Prisma edge-runtime issue that hangs `/upload` under the Playwright web server. |
| 2026-03-20 | Added `src/lib/engine/broker-position-ledger.ts`, a pure instrument-aware dry-run ledger for mixed broker statements. It models equities and options by instrument key, keeps option quantities in contracts with multipliers, supports expirations and transfer-out rows, and summarizes blocked uploads without relying on the equity-only FIFO grouper. |
| 2026-03-20 | Reversal handling added to the dry-run ledger: plain `Buy` rows now cover an open short before opening any remaining long quantity, and `Sell Short` rows now close an open long before opening any remaining short quantity. On the real Schwab statement this reduced ledger warnings from 581 to 164 and reduced unresolved open spans from 490 to 101. |
| 2026-03-20 | Analyzer refinement: empty-symbol `Journaled Shares` mark-to-market / cash-movement rows are now treated as cash entries rather than position-affecting blockers. `/api/upload` blocked previews now use the dry-run ledger summary for `newTrades`, `openPositions`, `estimatedPnl`, and warnings instead of borrowing misleading numbers from the equity-only parser. |
| 2026-03-20 | Added persisted dry-run ledger storage with `BrokerStatementPosition` + `BrokerStatementWarning` (migration `20260320164827_add_broker_statement_ledger_persistence`). `persistBrokerStatementImport()` now stores raw rows, grouped ledger positions, and ledger warnings together for every analyzed statement. |
| 2026-03-20 | Verification after persisted-ledger migration: `npx tsc --noEmit` clean and `npx jest --runInBand` now 139/139 passing. |
| 2026-03-20 | Analyzer ordering fix: `schwab-statement-analyzer.ts` now reverses newest-to-oldest Schwab exports before row indexing, just like the legacy parser. On the real statement this dropped dry-run ledger warnings from 164 to 19 and reduced unresolved open spans from 101 to 19. |
| 2026-03-20 | Added `src/lib/engine/broker-trade-importer.ts` plus RoundTripTrade instrument fields (migration `20260320172953_add_round_trip_trade_instrument_fields`). Supported mixed statements can now confirm/import by creating canonical `RoundTripTrade` rows directly from persisted `BrokerStatementPosition` rows instead of forcing everything through stock-only `Execution` records. |
| 2026-03-20 | Mixed-import safety rails: trade enrichment now only targets `instrumentType = EQUITY` and non-transfer trades; trades table chart links are disabled for option / transfer trades. `UNKNOWN` broker actions remain the canonical-import blocker. |
| 2026-03-20 | Real-statement ledger follow-up: `broker-position-ledger.ts` now keeps active positions by instrument+side, so explicit option rows can represent simultaneous long/short legs on the same contract without false direction-conflict warnings. Stock-merger transfer-outs can also resolve through a same-day paired merger-open row when the close row uses a temporary CUSIP instead of the active trading symbol. |
| 2026-03-20 | Real-statement warning reduction after the ledger follow-up: the Schwab file's ORCL option conflict and RKLB/`773122106` merger orphan are now gone; remaining ledger warnings are down to 17 and are concentrated in early-window orphaned equity closes plus one small META oversized close that likely represent carry-in inventory rather than same-day ordering bugs. |
| 2026-03-20 | Upload retry fix: `/api/upload` now reuses and refreshes an existing non-complete `Upload` row for the same `(accountId, fileHash)` via `src/lib/upload/pending-upload.ts` instead of crashing on the unique `(accountId, fileHash)` constraint when the same file is previewed again before import completes. |
| 2026-03-20 | Same-day ordering fix for date-only broker exports: `broker-position-ledger.ts` now sorts each trading day with opening-style rows before ordinary closes, while keeping transfer/merger close rows ahead of their paired transfer-in/open rows. On the real Schwab statement this removed the false open positions the user flagged for `BILI`, `TQQQ`, `TNA`, `IOT`, and `IONQ`, and cut the warning set further to 13. |
| 2026-03-20 | Confirm/import refresh fix: `/api/upload/[id]/confirm` now re-runs the dry-run analyzer + broker ledger and persists the latest `BrokerStatementImport` snapshot before creating canonical `RoundTripTrade` rows, so confirm can no longer import stale grouped positions from an older preview. |
| 2026-03-20 | Local live-data repair completed after the same-day ordering fix: the currently imported statement was rebuilt from the corrected broker ledger, replacing the stale `RoundTripTrade` rows for that statement and refreshing daily snapshots for the account. |
| 2026-03-20 | Verification after the same-day ordering + confirm refresh fixes: `npx tsc --noEmit` clean and `npx jest --runInBand` now 153/153 passing. |
| 2026-03-20 | Open-quantity model fix: added `remainingQty` to both `BrokerStatementPosition` and `RoundTripTrade` (migration `20260320203759_add_remaining_qty_to_statement_positions_and_trades`). `totalQty` now stays peak position size for analytics, while `/trades` and CSV export can show the true remaining size for open positions such as AMD `242` instead of peak `350`. |
| 2026-03-20 | Live backfill for the current imported statement: recomputed `remainingQty` directly from persisted broker row indices and synced it into canonical trades. Verified current AMD open trade now stores `totalQty=350`, `closedQty=300`, `remainingQty=242`. |
| 2026-03-20 | Verification after the remaining-quantity fix: `npx tsc --noEmit` clean and `npx jest --runInBand` now 157/157 passing. |
| 2026-10-16 | Product review + competitor research (Tradezella/TraderSync via REA + help docs). Key finding: Schwab Transaction History is date-only, so 450/921 imported trades had 0s duration, the classifier labeled only 19 trades (all SCALP), and no trade had tags/notes. Competitors import full history from the thinkorswim **Account Statement → Account Trade History** export (per-second Exec Time) and use Schwab's OAuth Trader API only for incremental sync (60-day history window, 7-day refresh token → weekly re-auth). |
| 2026-10-16 | Added `src/lib/parser/tos-account-statement-parser.ts` + `analyze-broker-statement.ts` format dispatcher. Reads Account Trade History fills (per-second Exec Time, explicit TO OPEN/TO CLOSE) and joins fees/amounts from Cash Balance TRD rows (1:1 per fill; ±2s tolerance because Schwab can book the cash row 1s after the fill). Fee = \|Misc Fees\| + \|Commissions & Fees\|; on this export **buys can carry fees** (option commissions, some misc fees), so fees are read on both sides. Exec Time assumed America/New_York (overridable); the "CST" on BAL rows is boilerplate — verified by the 09:30 fill burst. FUND rows (SNSXX sweeps) are cash, not trades. TOS statements always import through the broker-ledger path (`importSupported=false` gates only the legacy Execution path). |
| 2026-10-16 | Real-file validation (3/13–10/16/26 statement, 703 fills): 702 trade fills + 1 sweep, 0 blockers, 0 unmatched fees, 105 closed round trips + 29 open. Ledger open positions + pre-3/13 DB open positions reproduce the statement's ending Equities section exactly (AMD 242+3=245, EOSE 350+100, FRMI 60+340, NBIS 20+80, NVDA 100+100, NLR, RXRX). Symbols opened/closed inside the window match TOS P/L to within fees (TOS P/L excludes fees). TOS "P/L YTD" is mark-to-market (includes open positions, prior-year carries from 12/31 mark) so it is not a realized-P&L reconciliation target. |
| 2026-10-16 | Known gaps (next): (1) **cross-statement dedup** — ledger-path confirm only replaces trades from the same file hash, so overlapping statements double-count; (2) **carry-in inventory** — positions opened in an earlier statement surface as orphan closes (MRNA/APPS/ORCL calls on the real file); seed the ledger from prior open positions. Pre-existing on main since `8e7247e`: 2 ledger tests asserting same-day opens-before-closes for date-only files fail after that heuristic was removed; `broker-statement-store` tests fixed here (mock lacked `$transaction`). |
| 2026-10-16 | Verification: `npx tsc --noEmit` clean; `npx jest --runInBand` 171/173 (only the 2 pre-existing ledger failures); new `src/__tests__/parser/tos-account-statement-parser.test.ts` 15/15; Playwright `upload-tos-account-statement.spec.ts` + `upload-import.spec.ts` pass (legacy spec needs a warm dev server). |
| 2026-10-16 | **Account-level statement ledger** (`src/lib/engine/account-ledger-rebuild.ts`): confirm and integrity-reprocess now rebuild ALL statement-derived trades for the account from every confirmed `BrokerStatementImport` through one ledger, fixing (1) carry-in — positions opened in an earlier statement pair with closes in a later one (MRNA, APPS, ORCL calls now realize) — and (2) overlap double-counting. Overlap rule: each trading date is owned by one statement per row class; FILL rows prefer TOS (timestamped) > Transaction History, then latest coverage end, then newest upload; EVENT rows (expirations/journals/mergers) always come from Transaction History because TOS Trade History lists fills only. Tags/notes are carried across rebuilds by (symbol, direction, entryTime). |
| 2026-10-16 | Schema: `BrokerStatementImport.sourceFormat`, `coverageFrom/coverageTo` (@db.Date; TOS from the "since … through …" header), `confirmedAt` (previews persist rows but never feed the ledger). Migration `20261016200000_account_level_statement_ledger` also adds the two `RoundTripTrade` → statement FKs that `8e7247e` declared in schema.prisma but never migrated. Backfill marks statements with trades / completed uploads as confirmed. |
| 2026-10-16 | Migration repair: `20260320203759_add_remaining_qty…` used `FROM LATERAL` referencing the UPDATE target (invalid in Postgres), so the chain failed on any fresh DB / shadow DB; rewritten as equivalent correlated subqueries and verified on a scratch DB. That file had also been edited after being applied, so the local `_prisma_migrations` checksum was realigned (otherwise `migrate dev` demands a reset). Local DB backed up before migrating. |
| 2026-10-16 | Ledger same-timestamp ordering: replaced the removed "opens before closes" heuristic with **inventory-aware deferral** — within a group of rows sharing an identical timestamp, a close is deferred after the group's matching opens only when current inventory cannot cover it. Fixes the phantom IOT/IONQ/BILI/TQQQ/TNA positions on date-only files without inverting "close carried position, reopen later". Distinct timestamps are never reordered. Money-market sweep funds (`^[A-Z]{3}XX$`, e.g. SNSXX) are ignored by the ledger (cash, not trades). The 2 previously failing ledger tests now pass. |
| 2026-10-16 | Real-data dry run (rolled back): rebuilt account ends with exactly the broker's 30 equity positions + 1 ORCL call. Net closed P&L moves −$6,139.80 across 8 symbols — mostly removing a phantom **+$7,853.95 RKLB "profit"** in the stored data (pre-`8e7247e` code booked a $0-basis merger-in position's sale as profit) and realizing carry-ins (APPS +$2,180.80, ORCL calls). Known gap: name-change mergers should carry cost basis through (RKLB 5/30/25 true P&L ≈ +$1.2k is currently unrealized/excluded). |
| 2026-10-16 | Enrichment robustness: a trade deleted by a concurrent rebuild used to throw into the job's outer catch and abort enrichment for every remaining trade. Now the vanished trade (P2003/P2025) is skipped and exactly one follow-up run picks up replacement IDs (a vanish-triggered rerun never re-triggers). |
| 2026-10-16 | Verification: `npx tsc --noEmit` clean; `npx jest --runInBand` **187/187** (first fully green run since `8e7247e`); Playwright upload-import, upload-tos-account-statement, settings-integrity, upload-dry-run-blockers pass. |

## Pending User Actions
- [ ] Set a real `NEXTAUTH_SECRET` in `.env.local` (`openssl rand -base64 32`)
- [x] ~~Provide sample TOS CSV export for parser validation~~ — received 2026-03-13

## Where We Stopped (2026-03-17)

### What's complete
- **Phases 1–14 complete.** All DB tables present. Docker container `auratrade-pg` on port 5432.
- **Post-phase import hardening (2026-03-20):** upload preview now acts as a safety-first dry run. Mixed stock/option statements are analyzed and explained before confirm; unsupported `UNKNOWN` action patterns still stay dry-run only.
- **Raw statement persistence (2026-03-20):** every `/api/upload` dry run now writes a `BrokerStatementImport` record plus normalized `BrokerStatementRow` children, even for blocked mixed statements. We can audit broker actions/option metadata safely before canonical executions or trades are created.
- **Instrument-aware dry-run ledger (2026-03-20):** blocked mixed statements now flow through `broker-position-ledger.ts`, which can reason about options, expirations, transfer-outs, and equity reversal rows well enough to produce a safer preview summary before canonical import exists.
- **Persisted ledger audit layer (2026-03-20):** the grouped dry-run output now lives in the database too via `BrokerStatementPosition` and `BrokerStatementWarning`, so statement-level grouping/warnings survive beyond the upload response and can become the bridge into a future canonical mixed import path.
- **Canonical mixed import bridge (2026-03-20):** supported mixed statements can confirm/import into instrument-aware `RoundTripTrade` rows via the persisted ledger path; unsupported `UNKNOWN` actions still keep the statement in dry-run-only mode.
- **Open quantity semantics (2026-03-20):** `totalQty` remains the peak size reached within a trade span, while `remainingQty` is now the source of truth for what is still open after partial trims. The trades list/export uses `remainingQty` for open positions.
- **Parser** (`src/lib/parser/tos-csv-parser.ts`): handles both TDA 2022 and Schwab 2026 CSV variants, auto-detects reverse-chronological order, daySeq dedup.
- **Grouper** (`src/lib/engine/trade-grouper.ts`): FIFO VWAP grouper, pure function, no DB calls.
- **Upload flow** (`/upload`, `/api/upload`, `/api/upload/[id]/confirm`): two-phase parse-preview → confirm-write for equity-safe statements; upload preview now also runs a broker action dry-run analyzer and blocks canonical import when option or position-affecting non-trade actions are present. Full trade rebuild still runs on confirm for supported equity-only statements; daily snapshots rebuild incrementally from the earliest imported date when new executions land.
- **Trades list** (`/trades`, `/api/trades`): URL-synced filters, sortable columns, page-size, CSV export, loading/error states.
- **Market data** (`src/lib/market-data/`): Yahoo daily + intraday, DB cache with staleness logic, `GET /api/market-data`.
- **Enrichment** (`src/lib/engine/trade-enrichment.ts`): SMA20/50/200, EMA20, ATR14, RSI14, ADX14, BBands, 52w range, gap %, SPY regime, earnings. `POST /api/enrich` triggers; `GET /api/enrich` polls. Upload page shows live progress bar.
- **Interactive chart** (`/chart/[symbol]`): LWC v5 candlestick chart, fill markers, price lines, auto-TF zoom, OHLCV crosshair panel, trade sidebar with focus/zoom. Fully reviewed (peer-review + CodeRabbit).
- **Performance metrics** (`src/lib/engine/metrics.ts`, `/api/metrics`): pure metrics engine with Kelly/full-half-quarter, profit factor, expectancy, Sharpe approximation, max drawdown, and close-date daily P&L aggregation for dashboard-ready time series.
- **Dashboard** (`/dashboard`, `/api/dashboard`): TanStack Query-backed analytics page with summary cards, equity/drawdown, distribution + normal overlay, rolling win rate, day-of-week, monthly heatmap, Kelly widget, size/duration scatterplots, sector breakdown, and explicit hour-of-day unavailability for date-only source data.
- **Trade classification** (`src/lib/engine/classifier.ts`): rule-based setup engine assigns primary/secondary tags plus confidence and score breakdown during enrichment. Existing trades UI and chart sidebar now show real setup labels once enrichment has run.
- **Edge analysis** (`src/lib/engine/edge-analysis.ts`): pure analytics engine for style mix, per-setup edge stats, significance, regime cross-reference, persistence trends, Kelly sizing comparison, recommendations, expected-value estimates, and setup-fit scoring.
- **Data integrity/settings** (`/settings/integrity`, `/api/settings/integrity`): TanStack Query-backed integrity workspace with health summary cards, orphaned execution/mismatch/duplicate candidate detail panels, full trade reprocess action, full daily snapshot rebuild action, and route-level loading/error states. Sidebar and command palette now route into settings.

**Known build issues (pre-existing):**
- `next build` fails: auth middleware imports Prisma into the edge runtime.
- `npm run lint` fails: ESLint scans `src/generated/prisma`.

### Verification state
- `npx tsc --noEmit` — clean
- `npx jest --runInBand` — 157 tests passing
- `npm run test:e2e` — 5/5 passing on 2026-03-17
- `npx playwright test playwright/upload-dry-run-blockers.spec.ts` — blocked by the pre-existing middleware/Prisma edge-runtime issue on `/upload`
- `review-local` — no repo-defined script/command exists; manual local review still has to be done without an automated repo command
- Branch: `feat/trade-import-dry-run-redesign`

### Next: Post-Phase Cleanup / Deployment Readiness
- Harden the mixed-import path further, especially same-day close-then-reopen sequencing and execution-rebuild interoperability with broker-ledger trades.
- Fix the pre-existing `next build` middleware/Prisma edge-runtime failure.
- Exclude `src/generated/prisma` from lint so `npm run lint` can become part of the regular merge gate.
