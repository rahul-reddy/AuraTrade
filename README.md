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

## Appearance

Espresso & Acid supports light and dark mode. Use the sun/moon button on the
sign-in screen or workspace toolbar; the choice persists in this browser and syncs
across tabs. Dark is the default. Light mode uses parchment, cream and olive; dark
mode uses espresso and citron. Charts and financial colors adapt with the UI.

## Trade-review charts

Chart pages default to one year of daily candles, with trade annotations, EMA 8/21,
SMA 50, separate volume and RSI panes, and a broker-fill inspector. Intervals change
only through the toolbar; zooming does not switch data feeds or candle intervals.

Set `AURATRADE_FINVIZ_TOKEN` in the ignored `.env` for Finviz daily price exports.
The key is optional and server-only. Daily requests fall back to Yahoo if Finviz is
unavailable; intraday requests use Yahoo. Hosted deployment passes the key at runtime
through the server's `.env`, never a build argument or browser request. See
[chart behavior and data assumptions](docs/CHARTS.md).

The dashboard heatmap lists the newest month first. Its year and month selectors
filter only the calendar within the dashboard's date range; Clear calendar filters
restores all available months. Chart symbol search opens another ticker directly,
and the Trades back link returns to all symbols in the current account.

## Review and research workflows

- **Daily Review** lists trades with activity on an exchange session, tracks the
  review queue, and saves a reflection with one focus for the next session.
- **Journal** sits beside the chart: thesis, personal setup, planned stop, plan
  adherence, mistakes, lessons, notes/tags and up to five raster screenshots.
  Journals survive ledger rebuilds; unmatched journals remain discoverable on
  their original review day. Planned stops are journal records, not risk overrides.
- **Playbooks** store entry/exit/invalidation rules and selected example journals.
  Archiving preserves links. Personal labels remain distinct from inferred setups.
- **Edge Analysis** groups known closed results by playbook, personal/inferred
  setup, direction, regime or plan adherence, with sample counts, 95% Wilson
  win-rate intervals and links to the underlying trades. Dates refer to closes.
- **Weekly Review** brings together entry-session journals and daily reflections
  to record one experiment, its success criteria and the later result.
- **Source data & confidence** in the chart inspector traces exact broker rows
  across statement files. Legacy/mismatched raw provenance is explicitly unavailable.
- Trades support browser-local **saved views**. Chart display settings persist;
  **j/k** and previous/next controls move through the current symbol's filtered
  trades. Shortcuts are inactive while typing.
- The toolbar eye masks account P&L, fees and balances for screen sharing. It is
  a presentation preference; data, journals, prices and screenshots remain available.
- **Health** shows account import alerts, daily-cache retrieval age, and hosted
  backup/restore evidence. Missing evidence is unknown; no external notifications
  are configured. See [operational monitoring](docs/DEPLOYMENT.md#operational-health).

Schwab daily synchronization waits for developer access approval. Account security
improvements are deferred until after this non-security roadmap, per the owner.

## Verification commands

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
python3 -m unittest discover -s scripts/tests -p test_operational_scripts.py
```

Browser tests create synthetic accounts and import synthetic statements. Use a
separate test database. `PLAYWRIGHT_BASE_URL` targets an already running server;
otherwise Playwright starts the development server. The new workspace browser test
captures desktop and mobile screenshots under the ignored `test-results/` folder.
The operational script tests run on Linux with stub Docker commands and temporary
directories. On Windows, run them inside a Linux Python container. For production
browser checks alongside a dev server, set `AURATRADE_ISOLATED_BUILD=1` for both
build and start to use `.next-validation` without sharing dev build artifacts.

## Project guides

- [Contributor contract](AGENTS.md) — boundaries, testing and independent review.
- [Current handoff](STATUS.md) — deployment state, verification and next action.
- [UI design](docs/UI-DESIGN.md) — visual system and main workflows.
- [Implementation plan](docs/PLAN.md) — architecture and calculation rules.
- [Deployment runbook](docs/DEPLOYMENT.md) — the private Lightsail deployment,
  backups and guarded delivery.

Real broker statements belong in the ignored `documents/` directory. Never commit
credentials, account numbers or real statements.

## Schwab connection

In Settings → Connections, authorize Schwab, explicitly match the brokerage
account to its AuraTrade account, fetch a preview, inspect transactions/fees and
confirm. Optionally enable daily sync. The persistent hosted Node worker checks
hourly and imports completed days after 06:00 America/New_York. Reconnect about
weekly when Schwab authorization expires. Disconnect deletes stored credentials
and pending previews, retaining imported trades and journals; revoke access at
Schwab separately to remove its authorization.

Server-only environment (never `NEXT_PUBLIC_*`): `SCHWAB_CLIENT_ID`,
`SCHWAB_CLIENT_SECRET`, `SCHWAB_TOKEN_KEY` (64 hexadecimal characters generated
from 32 random bytes), `SCHWAB_REDIRECT_URI` (defaults to
`https://auratrades.quest/api/brokers/schwab/callback`), and
`SCHWAB_AUTO_SYNC_ENABLED=1` on a persistent Node server. The registered callback
must match exactly and use HTTPS. The hosted compose stack supplies these at
runtime, never during image builds. Keep the encryption key stable and back it
up securely with the server configuration: database backups alone cannot decrypt
broker credentials. There is no public scheduler endpoint or order-placement
code. Multi-process workers coordinate through database locks.

First sync requests up to 59 completed days. Later runs recheck at least seven
days, with extra overlap after downtime (capped at 59). Older gaps need CSV
history. Each broker day is fetched separately and normalized through the existing
date-only Schwab statement ledger, so TOS timestamped fills keep precedence and
overlaps do not count twice. Broker posting timestamps are not fill timestamps.
Only ordinary single-leg USD equity trades with explicit, reconcilable broker
fees are currently supported. Options, security transfers, lifecycle events,
unknown types/statuses, missing fees and oversized responses stop the entire
batch. Recognized cash-only activity does not enter trading P&L. Missing earlier
positions also stop confirmation. Previously synced days that change pause
automatic sync for manual review; empty responses never erase prior positions.
Previews expire after 30 minutes. Canonical confirmation and daily snapshots are
one transaction; failed batches retain the prior successful sync watermark.
Changed imports trigger the existing technical-context/classification pipeline
after commit; unchanged or rejected batches do not restart it.

Browser fixture tests require `SCHWAB_TEST_DATABASE_URL` pointing to the same
isolated test database as the test server and the same synthetic
`SCHWAB_TOKEN_KEY` in both processes. They create synthetic broker records without
contacting Schwab. Real brokerage authorization requires the account owner's
interactive consent; tests do not claim to verify a live brokerage response.
