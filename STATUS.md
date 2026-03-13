# AuraTrade — Build Status

> Updated as each phase completes. Claude should update this file after finishing each phase or significant sub-task.

## Current Phase
**Starting Phase 1 — Project Bootstrap**

## Phase Checklist

| Phase | Description | Status | Notes |
|---|---|---|---|
| 1 | Project bootstrap (deps, shadcn, prisma init) | Not started | `create-next-app` already done (initial commit) |
| 2 | Database schema (`prisma/schema.prisma`) | Not started | Show full schema before running migration |
| 2b | Auth plumbing (NextAuth v5, middleware, session) | Not started | |
| 3 | TOS CSV parser | Not started | Awaiting sample CSV from user for validation |
| 4 | Trade grouping engine (FIFO) | Not started | |
| 5 | Upload flow (two-phase commit) | Not started | |
| 6 | Trades list page | Not started | |
| 7 | Market data integration (yahoo-finance2) | Not started | |
| 7.5 | Trade context enrichment pipeline | Not started | |
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

## Pending User Actions
- [ ] Provide sample TOS CSV export for parser validation (Phase 3)
- [ ] Confirm PostgreSQL is running locally at `localhost:5432` before Phase 2 migration
