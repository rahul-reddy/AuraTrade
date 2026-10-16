# AuraTrade contributor contract

Trade analytics platform for a discretionary equity trader: imports Schwab/thinkorswim statements, rebuilds round-trip trades and reports P&L, fees, Kelly sizing and setups. Read docs/PLAN.md and STATUS.md before changing behavior; CLAUDE.md holds the standing product rules and key file map.

## Layout
- src/app/: Next.js routes: (app)/ pages, (auth)/ pages, api/ route handlers.
- src/components/: UI components (shadcn primitives in ui/).
- src/lib/: engine/ (ledger, P&L, metrics, classifier), parser/ (broker statements), market-data/, auth, session and Prisma client.
- src/__tests__/: Jest unit tests; playwright/: browser tests and synthetic fixtures.
- prisma/: schema and migrations; scripts/: cross-review and merge harness.
- docs/: plan and harness docs; .github/workflows/: CI and delivery; .agents/skills/: repository skill.

## Workflow
- main is the integration branch. Use feat/<topic>, fix/<topic>, or docs/<topic> branches and focused commits.
- Open a PR, run CI, review the diff, then squash merge. Never force-push main.
- The current GitHub plan does not support branch protection on this private repository. Keep it private. After reviewing the diff, use scripts/merge-pr.ps1 to require successful CI and match the reviewed head SHA.
- Preserve unrelated changes. Coordinate file ownership before multiple agents edit the same files.
- Update STATUS.md with evidence, remaining work and next action in every meaningful handoff.
- Do not claim tests passed unless you ran them on the current revision.

## Cross-model code review
Multiple AI agents work on this repository, sequentially or simultaneously. No commit
merges on its own model's approval alone.

- Every commit trailer must name its authoring model: `Co-Authored-By: Claude ... <noreply@anthropic.com>`,
  `Co-Authored-By: Codex ... <noreply@openai.com>` or `Co-Authored-By: Gemini ... <noreply@google.com>`.
  Commits with no such trailer are human-authored, are not required to go through this
  gate, and may still be reviewed on request with `-Reviewer`.
- **The reviewer pool is `gemini`, `codex`, `claude`, `grok`** (tried in that order). Gemini goes
  first because commits here are authored by Claude or Codex, never Gemini, so it always
  gives an independent third opinion instead of one authoring model reviewing the other.
  The rule is "reviewed by a model that did not write it", never "reviewed by one specific
  model": any pool member that did not co-author the commits may satisfy the gate, and if
  Gemini is unavailable the fallback is whichever of Codex/Claude did NOT write the commit.
  Pinning this to a single provider meant one usage limit blocked every PR that model
  had written.
- Before merging, run `scripts/cross-review.ps1 -Number <PR>`. It reads the trailers,
  excludes the authoring model(s), and tries the remaining reviewers in pool order until
  one completes a review, posting its verdict as a marker comment that records which
  model gave it. A reviewer that cannot run — usage limit, crash, unparseable output —
  is neither an approval nor a rejection: the script says so and falls through to the
  next. If none can run, nothing is approved and the gate stays shut.
- A completed review **stops the search**, whether it approves or rejects. Re-running to
  find a friendlier model is not a way past a rejection.
- `scripts/merge-pr.ps1` merges only when some eligible reviewer has approved the exact
  current head **and** no eligible reviewer has an unresolved blocking finding on it.
  One reviewer's approval never overrides another's rejection. Pushing a fix moves the
  head, which retires the old rejection — so the way past a rejection is to address it.
- Findings are `blocking` (a correctness bug, a violation of a boundary in this file, a
  security issue, or a missing test for money- or data-affecting behavior — must be fixed, or
  rebutted and re-reviewed, before merge) or `advisory` (style/simplification — worth
  reading, never blocking). Never hand-edit or delete a review comment to open the gate.
- If a finding is a false positive, reply in the PR thread with the reasoning, then
  re-run with `-Rebuttal "<why it doesn't apply>"`. The reviewing model reconsiders and
  issues a fresh verdict; nothing bypasses this locally.
- **Grok is the last-resort backup** (owner decision, 2026-09-30): it is tried only when
  every other eligible reviewer is unavailable, so one provider's outage or quota never
  leaves the gate with nobody to ask. It is pinned to `grok-4.7` (xAI's newest, frontier
  model) and takes `reasoning_effort` (`high` for critical/standard, `low` for low tier,
  confirmed live), so it is eligible on critical diffs too. It runs through the xAI API,
  not a CLI: it has no repository access at all and reviews from AGENTS.md plus the full
  diff in the prompt. `scripts/cross-review.ps1` reads `XAI_API_KEY` from the environment
  or this repository's `.env` (never echoed) and fails closed if the response names any
  model other than the pinned one. Commits co-authored by Grok/xAI exclude it as usual.
- Keep every pool member frontier-class. A weak reviewer that rubber-stamps is worse
  than a blocked PR: it launders false confidence into the audit trail while catching
  nothing. Waiting for a usage limit to reset is an acceptable outcome; lowering the bar
  to avoid waiting is not. If a weaker model is ever added, gate it so it cannot be the
  sole reviewer for changes touching any critical path listed below.
- **Blast-radius tiering** (`Get-BlastRadiusTier` in `scripts/lib/cross-review.ps1`)
  classifies the changed files into `critical` / `standard` / `low`, which
  `Get-ReviewerEffort` and `Get-ReviewerModel` both key off (below). `critical` (any of
  `src/lib/engine/`, `src/lib/parser/`, `src/lib/upload/`, `src/lib/trades/`, `src/lib/dashboard/`, `src/lib/settings/`, `src/lib/auth.ts`, `src/lib/auth.config.ts`, `src/lib/session.ts`, `src/lib/prisma.ts`, `src/middleware.ts`, `src/app/api/`, `prisma/`, `prisma.config.ts`) is meant to
  get each CLI's highest effort, though the owner-chosen per-tier settings below (see
  `Get-ReviewerEffort`) may deliberately fall short of that ceiling for cost reasons —
  `Get-BlastRadiusTier` only computes the tier, it does not guarantee an effort level.
  Critical additionally **excludes Gemini from eligibility**: its CLI has no
  reasoning-effort control (see below), and with Gemini tried first a completed review
  stops the search, so critical diffs would otherwise be normally decided by the one
  reviewer that never gets escalated. `low` (prose-only: `*.md`,
  `docs/`, `*.css`, non-workflow `.github/`, or an ADDITIVE-only diff to `src/__tests__/` or
  `playwright/`) gets reduced effort. A test-path file with ANY deleted line — a
  removed or weakened test — is never `low`: that is exactly the "missing test for
  money- or data-affecting behavior" category this contract calls blocking, so lowering scrutiny
  on it would be self-defeating. A file the deletion count could not be confirmed for
  is treated the same way, per this project's own rule against trusting missing data.
  Everything else is `standard`. The computed tier and per-reviewer effort are printed
  and recorded in the posted PR comment.
- **The model is pinned per reviewer per tier** in `$script:ReviewerModels`, because none
  of these CLIs guarantee a specific model on their own: Gemini reads `GEMINI_MODEL` and
  auto-routes simple prompts to Flash, and Codex takes its default from a mutable
  `~/.codex/config.toml`. Either could silently answer with a different model than
  intended, whose APPROVE would still satisfy the gate. Command-line arguments outrank
  both. A pinned model the account cannot use makes the CLI fail, so the reviewer reports
  unavailable and the pool falls past it — fail-closed. Update the pins when a provider
  renames a model.
- **Reasoning effort is tuned by tier** (owner decision, 2026-09-14; a same-day
  critical-tier `gpt-5.6-sol`/`high` experiment for Codex was reverted the same day as
  overkill in the other direction):
  - **Codex** stays on `gpt-6-astra` (OpenAI's most capable) at every tier, but runs it
    at `low` ("light") effort across the board — including the **critical** tier. This
    means Codex gives critical-path changes no more scrutiny than a docs-only diff;
    the owner made this call explicitly, aware that it flattens the tiering's effect for
    Codex specifically. If review quality on critical-path changes ever looks weaker than
    expected, this is the first thing to reconsider.
  - **Claude** stays on `opus` at every tier; effort is `medium` for critical
    (previously `max`), unchanged `medium`/`low` for standard/low.
  - Both `-c model_reasoning_effort=<level>` (Codex) and `--effort <level>` (Claude) were
    confirmed live for every level used, including that `gpt-6-astra` accepts up to
    `ultra` and Claude's `opus` accepts up to `max` — those ceilings are documented, not
    currently used.
  - **Gemini's CLI exposes no reasoning-effort flag in this version**, so it always runs
    at its own default regardless of tier; `Get-ReviewerEffort` returns `$null` for it
    and the invocation omits the flag rather than guess at one. This is one reason
    critical-tier diffs exclude Gemini from eligibility (above) instead of trusting it
    to escalate on its own.
- Reviewer setup: `codex` and `claude` authenticate through their own CLIs; `grok` needs
  only `XAI_API_KEY` (environment or `.env`). `gemini`
  needs `npm i -g @google/gemini-cli` and `GEMINI_API_KEY` (generate at
  aistudio.google.com) plus `"security":{"auth":{"selectedType":"gemini-api-key"}}` in
  `~/.gemini/settings.json`. **"Login with Google" (`oauth-personal`) no longer works**:
  Google discontinued that path for individual/Pro accounts on 2026-06-18
  (`IneligibleTierError`, pointing at Antigravity CLI instead); do not re-attempt it.
  A fresh API key may also report a 429 with zero free-tier quota specifically for the
  pinned frontier model even once auth succeeds — that needs Cloud Billing enabled on
  the key's Google Cloud project, confirmed separately from getting the key itself
  (a cheaper model like `gemini-2.5-flash` succeeding while the pinned model 429s is the
  signature of this, not a config problem). Until both auth and quota are resolved,
  `gemini` reports unavailable and the pool falls past it, same as any other outage.
- Known limitation: Codex CLI's sandbox backend is currently disabled on Windows, so
  reviewing as Codex requires `--dangerously-bypass-approvals-and-sandbox` to read the
  repository at all. It is scoped by instructing the reviewer that it is read-only and
  must not modify, stage, commit or push anything; that instruction is not sandbox-enforced
  the way Claude's `--restricted` and Gemini's `--approval-mode plan` are. Revisit once
  Codex ships Windows sandboxing.
- **Reviewers run with no MCP servers** (`Get-ReviewerNoMcpArguments`). The owner's
  everyday MCP registrations (REA, claude.ai connectors such as Gmail) would otherwise
  load into every review: extra startup time, an extra way for a reviewer to report
  unavailable, and tools that reach outside the repository. Claude gets
  `--strict-mcp-config`, Gemini an allow-list naming no real server, and Codex
  `-c mcp_servers.<name>.enabled=false` for each server `codex mcp list --json` reports
  (`-c mcp_servers={}` merges and disables nothing). If that listing cannot be read,
  Codex reports unavailable rather than review with servers that may still load.

## Commands
- pwsh -NoProfile -File scripts/cross-review-selftest.ps1; uv run --no-project --with pyyaml python scripts/validate_skills.py
- docker run --name auratrade-pg -e POSTGRES_PASSWORD=password -e POSTGRES_DB=auratrade -p 5432:5432 -d postgres:16
- npm ci; npx prisma generate; npx prisma migrate deploy
- npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <empty database URL> --exit-code (drift check)
- npm run lint; npm run typecheck (no formatter is configured; ESLint is the style gate)
- npm test (Jest; add -- --coverage for a report)
- npm run build; npm run start
- npm run test:e2e (needs DATABASE_URL and AUTH_SECRET; set PLAYWRIGHT_BASE_URL to test an already-running server, otherwise it starts the dev server)
- npm run dev (local start; DATABASE_URL, AUTH_SECRET/NEXTAUTH_SECRET in .env.local)

## Boundaries and definition of done
- Show every financial formula (P&L, fees, Kelly, drawdown, expectancy) before implementing it, and unit test it; metrics.ts, classifier.ts and the broker ledger are trust-critical.
- Read fees from the broker file (Fees & Comm, or the TOS Cash Balance row); never derive them. Store money as `@db.Decimal`, never Float. No `any` types.
- Every API route starts with `getRequiredSession()` and scopes every query by the signed-in user's id.
- State broker CSV format assumptions in code comments; never guess silently. Unrecognized broker actions block import instead of being guessed.
- Statements that move positions outside ordinary buys/sells (options lifecycle, journals, mergers) go through the dry-run preview before canonical import.
- Real broker statements stay out of git (`documents/` is ignored); fixtures are synthetic. No account numbers in fixtures, commits or logs.
- No destructive migration without a backup and explicit permission. Do not edit an applied migration except to fix one that fails on a fresh database, and record why in STATUS.md.
- Changes to critical paths require tests that exercise their boundaries.
- UI flows require real browser tests.
- No credentials, account numbers or tokens in commits or logs.
- Never claim tests passed unless they ran on the current revision.
- Done means documented startup, passing relevant tests/types/lint, reviewed diff and truthful limitations.
