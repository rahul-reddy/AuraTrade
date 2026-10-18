# AuraTrade

A private trading analytics workspace for Schwab and thinkorswim statement imports,
trade review, performance analysis and account integrity checks.

## Local startup

Use Node.js 24 and PostgreSQL 16. Create a development database, then set
`DATABASE_URL` and a randomly generated `AUTH_SECRET` in the ignored `.env` file.
The Prisma CLI reads `.env`; Next.js reads `.env` and `.env.local` (which takes
precedence). Keep both pointed at the intended development database.

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Open `http://localhost:3000`. The root URL leads to the dashboard after sign-in.
Registration is available locally by default; `AURATRADE_REGISTRATION=closed`
disables it. The hosted deployment always closes public registration.

## Trade-review charts

Chart pages default to one year of daily candles, with trade annotations, EMA 8/21,
SMA 50, separate volume and RSI panes, and a broker-fill inspector. Intervals change
only through the toolbar; zooming does not switch data feeds or candle intervals.

Set `AURATRADE_FINVIZ_TOKEN` in the ignored `.env` for Finviz daily price exports.
The key is optional and server-only. Daily requests fall back to Yahoo if Finviz is
unavailable; intraday requests use Yahoo. Hosted deployment passes the key at runtime
through the server's `.env`, never a build argument or browser request. See
[chart behavior and data assumptions](docs/CHARTS.md).

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests create synthetic accounts and import synthetic statements. Use a
separate test database. `PLAYWRIGHT_BASE_URL` targets an already running server;
otherwise Playwright starts the development server. The new workspace browser test
captures desktop and mobile screenshots under the ignored `test-results/` folder.

## Project guides

- [Contributor contract](AGENTS.md) — boundaries, testing and independent review.
- [Current handoff](STATUS.md) — deployment state, verification and next action.
- [UI design](docs/UI-DESIGN.md) — visual system and main workflows.
- [Implementation plan](docs/PLAN.md) — architecture and calculation rules.
- [Deployment runbook](docs/DEPLOYMENT.md) — the private Lightsail deployment,
  backups and guarded delivery.

Real broker statements belong in the ignored `documents/` directory. Never commit
credentials, account numbers or real statements.
