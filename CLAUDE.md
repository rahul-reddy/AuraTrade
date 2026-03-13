# AuraTrade — Claude Instructions

## What This Project Is
Professional trading analytics platform for a high-frequency discretionary equity trader (ThinkorSwim/Schwab). Will become SaaS. Built with Next.js 15, Prisma v6, NextAuth v5, PostgreSQL (Docker), yahoo-finance2.

## Always Read First
- `PLAN.md` — full 14-phase implementation plan with formulas, schema, and build order
- `STATUS.md` — current phase, what's done, what's blocked, pending user actions

## Standing Rules (non-negotiable)

1. **Show every financial formula before implementing** — user verifies before code is written
2. **Unit test every calculation** in `metrics.ts` and `classifier.ts` — these are trust-critical
3. **No `any` types** anywhere in the codebase
4. **Every API route** starts with `getRequiredSession()` and scopes all DB queries by `userId`
5. **Flag TOS CSV format assumptions** explicitly in code comments — never guess silently
6. **Kelly functions** (`kellyFull`, `kellyHalf`, `kellyQuarter`) live in `metrics.ts` only — no separate `kelly.ts`
7. **Commission formula**: `(Price - NetPrice) × Qty` for BOTH buys AND sells — verify against real TOS CSV when provided
8. **`@db.Decimal`** for ALL financial values in Prisma — never `Float`
9. **Update `STATUS.md`** after completing each phase or significant sub-task

## Tech Decisions (already made, don't revisit)
- Market data: `yahoo-finance2` only (no API key needed)
- Prisma v6: datasource URL in `prisma.config.ts`, client outputs to `src/generated/prisma`
- shadcn v4: zinc base color, CSS variables on, components in `src/components/ui/`
- Database: PostgreSQL in Docker (`auratrade-pg` container, port 5432)
- Auth: NextAuth v5 beta with Credentials provider + bcrypt

## Design System
- Dark-first: `zinc-900` / `zinc-800` backgrounds (not pure black)
- Accent: `blue-500` interactive, `green-500` profit, `red-500` loss
- Fonts: Inter (UI text), JetBrains Mono (all numbers and data)

## Key File Locations
| File | Purpose |
|---|---|
| `prisma/schema.prisma` | Full DB schema |
| `prisma.config.ts` | Prisma v6 datasource config (reads `DATABASE_URL`) |
| `src/lib/auth.ts` | NextAuth v5 config |
| `src/lib/session.ts` | `getRequiredSession()` helper |
| `src/middleware.ts` | Route protection |
| `src/lib/parser/tos-csv-parser.ts` | TOS CSV parser |
| `src/lib/engine/trade-grouper.ts` | FIFO trade grouping |
| `src/lib/engine/metrics.ts` | All metrics + Kelly (Phase 9) |
| `src/lib/engine/classifier.ts` | Trade classification (Phase 11) |
| `src/lib/market-data/yahoo-client.ts` | Market data fetching |

## Docker DB Command (run when Docker Desktop is open)
```bash
docker run --name auratrade-pg -e POSTGRES_PASSWORD=password -e POSTGRES_DB=auratrade -p 5432:5432 -d postgres:16
```
