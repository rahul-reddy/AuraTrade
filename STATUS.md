# AuraTrade — Build Status

> Updated as each phase completes. Claude should update this file after finishing each phase or significant sub-task.

## Current Phase
**Phase 2 — Database Schema**

## Phase Checklist

| Phase | Description | Status | Notes |
|---|---|---|---|
| 1 | Project bootstrap (deps, shadcn, prisma init) | ✅ Done | |
| 2 | Database schema (`prisma/schema.prisma`) | In progress | Show full schema before running migration |
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
| 2026-03-12 | Prisma v6 detected — uses `prisma.config.ts` for datasource URL, client outputs to `src/generated/prisma`. |
| 2026-03-12 | shadcn v4 detected — `components.json` written manually (zinc base color). `src/lib/utils.ts` created manually. |
| 2026-03-12 | Fonts: Inter + JetBrains Mono (replaced Geist). Dark-first zinc theme applied to `globals.css`. |
| 2026-03-12 | `jest`, `@types/jest`, `ts-jest` installed. TypeScript clean (no errors). |

## Pending User Actions
- [ ] Provide sample TOS CSV export for parser validation (Phase 3)
- [ ] **Install Docker Desktop** (docker.com/products/docker-desktop) — then tell Claude to spin up the Postgres container
- [ ] After Docker is running, Claude will run: `docker run --name auratrade-pg -e POSTGRES_PASSWORD=password -e POSTGRES_DB=auratrade -p 5432:5432 -d postgres:16`
- [ ] Then run: `npx prisma migrate dev --name init`
- [ ] Set a real `NEXTAUTH_SECRET` in `.env.local` (`openssl rand -base64 32`)

## Where We Stopped (2026-03-12)
- Phase 1 is fully complete (deps, shadcn, prisma init, utils.ts, globals.css, fonts)
- Phase 2 schema is **written and approved** but migration has NOT been run yet
- Blocked on: PostgreSQL not installed. Decision made to use Docker instead of native install
- Next step: User installs Docker Desktop → Claude spins up container → runs migration → proceeds to Phase 2b (auth)
