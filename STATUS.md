# AuraTrade — Build Status

> Updated as each phase completes. Claude should update this file after finishing each phase or significant sub-task.

## Current handoff (2026-10-22): Custom AuraTrade crest

- Replaced the stock trend-arrow badge with an original vector A crest: an
  orbital aura, rising performance crossbar and goal spark in citron/glacier on
  espresso. Shared by auth screens, expanded/compact sidebar and SVG browser
  icon; matching 16/32/48 px favicon and 180 px Apple touch icon are included.
  The brand exposes one accessible name even without the visible wordmark.
- Public access is limited to the two exact brand asset URLs in the middleware
  matcher. Browser regression checks unauthenticated asset responses, protected
  and lookalike paths, registration/login, both themes, mobile, sidebar collapse,
  successful image loading and favicon metadata/responses. Screenshots from the
  passing focused production-browser test were visually inspected.
- Validation of implementation revision `663451d` (PR #45): `npm run lint`
  passed with two existing warnings; `npm run typecheck`, all 371 units / 35
  suites, and the isolated Webpack production build passed. The focused final
  `brand.spec.ts` passed after correcting its relative-redirect URL assertion.
  The full local browser run passed 21/23: it had loaded the old brand test
  assertion before its fix, and the existing calendar test timed out waiting
  for heatmap months. The final brand test and both calendar tests then passed
  together (3/3), without changing calendar code or tests. Final test-file lint,
  TypeScript, and screenshot inspection passed. Exact-head CI will verify this
  documentation follow-up before independent review and guarded merge.
- Local packaging limitation: the private-file check rejected the reused local
  standalone output (two private files). That workstation artifact is not a
  delivery artifact. Clean CI must pass its standalone private-file gate;
  deployment uses the independently built CI image. Git private-file and
  diff-whitespace checks passed. Next: finish browser regression, exact-head CI,
  independent review, guarded squash merge and automatic delivery verification.

## Previous handoff (2026-10-21): Owner accepted remaining historical-copy limitation

- **Owner decision:** do not submit a GitHub Support ticket for the remaining old
  PR refs/cached views. Those historical copies have not been purged; their
  retention is an accepted limitation, with no pending ticket or owner action.
  The approved branch rewrite and restored protections remain in effect.
- **Verified release:** `a58caacc116970085f1144163c3dc7556cd8701d`, guarded merge
  of PR #43 after head-matched CI and independent Gemini approval. Main CI
  39667671457 passed 371 units / 35 suites, 29 operational checks and all 22
  browsers without retries. Automatic delivery 39668181312 succeeded; live
  CURRENT/image/OCI identity matched, web/DB were healthy, authenticated broker,
  health and CSV checks returned 200, Schwab was connected and all 15 migrations
  were applied. Deployment backup succeeded at `2026-10-21T20:16:09Z`.
- **App improvements complete:** PR #42 preserved chart journal drafts, deferred
  unopened journal queries, protected CSV text and kept trade API exceptions
  private. PR #43 strengthened chart smoke navigation. All three worktrees were
  verified clean; public visibility remains owner-controlled. This documentation
  record follows the normal CI/review/merge/delivery workflow; the live evidence
  above names the verified application/test release, with no behavior change here.

## Previous handoff (2026-10-21): App improvements deployed; chart smoke-test follow-up

- **Live app release:** `fa4326fa54735e6a7f19ba11dd9cfb1dca2f11c4`, guarded
  squash merge of PR #42. Its file tree matches reviewed head `0c72f03` exactly.
  Gemini high-effort independent review approved with zero blocking findings:
  https://github.com/rahul-reddy/AuraTrade/pull/42#issuecomment-6325093933 .
- **Delivered:** hiding the chart inspector or switching its tabs preserves an
  unsaved journal; unopened journals no longer trigger queries. Trade switching
  retains discard confirmation. CSV exports escape formula-leading text while
  preserving numeric losses; trade API failures do not echo/log raw exceptions.
  Financial calculations, canonical imports and schema are unchanged.
- **Validation:** final PR CI 39637022642 passed 371 units / 35 suites, 29
  operational checks and all 22 browsers without retries. Merged-main CI
  39665147371 passed the same checks; one pre-existing chart smoke-test selector
  needed a retry because Next retained a streamed copy outside main content.
  This follow-up scopes that smoke test to active content, requires unique visible
  headings/links, and removes the forced navigation click and first-match heading.
  Three local production-browser repeats passed without retries; the production
  app code is unchanged from the reviewed/live release above. Local lint (two
  existing warnings) and TypeScript passed after the smoke-test change.
- **Deployment verified:** automatic delivery 39665741176 succeeded. Server
  CURRENT, image tag and OCI revision match the live app SHA; web/DB are healthy.
  Authenticated broker, health and CSV-export checks return 200 without exposing
  transaction rows. Schwab remains configured/connected and all 15 migrations are
  applied. Deployment backup succeeded at `2026-10-21T19:59:37Z`; restore evidence
  is from the prior successful check. This test/handoff follow-up must pass its
  own CI, independent review and guarded merge, then triggers automatic delivery.
- **Security cleanup:** all nine remote branches and three local worktrees use
  sanitized history; branch-tip files were preserved. Main protection, secret
  scanning and push protection remain enabled; visibility remains owner-controlled
  and public. Old PR refs/cached views still require a GitHub Support purge. The
  private request draft and affected-ref list are prepared locally; no ticket or
  external message was submitted by this agent. Owner submission is pending.

## Previous handoff (2026-10-21): History cleanup published; app improvements under verification

- **Owner-approved cleanup completed:** the owner explicitly approved the temporary
  exception to the no-force-push rule. All nine remote branches were rewritten
  atomically with individual ref leases; every branch-tip file tree is unchanged.
  `main` is now `dc67e532c205d1e6094581f3eca55ea4ff10c31a`. Main protection and
  automatic delivery were restored immediately and verified. A fresh GitHub clone
  contains no reachable `documents/` history from branch refs. All 13 local
  branches and three clean worktrees now use sanitized history. Old release SHAs
  below describe the history before the rewrite; private reflogs/backups remain.
- **Fresh cleanup validation:** CI 39633798572 passed 358 units, 29 operational
  checks and 21 browser tests; Windows harness 39633798645 passed. Automatic
  delivery 39634351780 succeeded. Server CURRENT, web tag and OCI revision match
  rewritten main; web/DB are healthy and authenticated broker/health APIs return
  200. Schwab is configured and connected; all 15 migrations remain applied.
  The deployment backup succeeded at `2026-10-21T16:27:01Z`. Restore evidence is
  from the prior successful check, not a new restore run.
- **Privacy limitation:** GitHub's internal PR refs and cached views still need a
  Support purge. The final rewrite changes 186 commit mappings and affects 42
  pull refs across 41 PRs. The private Support draft has been updated; contacting
  Support remains separately owner-authorized and no message has been sent.
  GitHub reports zero forks; copies already downloaded cannot be recalled.
- **Prioritized app improvements:** preserve unsaved chart-journal drafts when
  hiding the trade inspector, defer unopened journal requests, escape CSV text
  that spreadsheets interpret as formulas, and suppress raw trade API exception
  details. Financial calculations, schema and canonical imports are unchanged.
  These address reproduced draft loss and concrete export/privacy boundaries.
  Larger edge-analysis queries, safe structured diagnostics and restore-cleanup
  recovery remain follow-ups requiring their own design and verification.
- **Local validation:** 371 unit tests / 35 suites, lint (no errors; two
  pre-existing unused-variable warnings), TypeScript and the Webpack production
  build passed. All 22 Chromium tests passed without retries against that final
  production build and a separate local synthetic database with all 15 migrations
  applied. The new regression covers lazy queries, failed-load retry, panel/tab
  draft preservation, navigation guards and confirmed trade switching. New API
  tests cover CSV formula prefixes/ordinary text, numeric losses, ownership/auth
  boundaries and private errors in both JSON/export requests. Private-file and
  diff-whitespace checks passed. Next: exact-head PR CI, independent review,
  guarded squash merge and automatic deployment verification.
- **CI follow-up:** PR #42's initial head `e2bab60` passed CI 39635842357 (371
  units and 29 operational tests); all 22 browsers completed but an existing chart
  heading assertion needed one retry after Next streamed a duplicate outside the
  active workspace. The assertion now scopes to `#main-content` and requires
  exactly one visible heading, matching the established navigation-test pattern.
  Three local repeats passed without retries against the unchanged production
  app build. This test-only follow-up needs fresh head-matched CI and review.

## Previous handoff (2026-10-21): Security hardening verified in production

- **Verified app release:** `dc77cc1d85e65a503d007a8bb2a35c998be393ba`, guarded
  squash merge of PR #39; its tree matches reviewed head `58ef87f` exactly.
  Gemini high-effort independent review approved with zero blocking findings:
  https://github.com/rahul-reddy/AuraTrade/pull/39#issuecomment-6320139950 .
- **Exact-revision CI:** both final PR CI and merged-main CI passed 358 units /
  34 suites, 29 operational/private-file tests and all 21 Chromium browser tests
  without retries. Lint, types, migrations/drift, full-history secret scanning and
  clean standalone artifact canaries passed. Merged-main CI:
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39629047881 .
- **Automatic delivery verified:** off-host image builds/publishing, integrity,
  backup, migration and service-health gates succeeded without a workstation
  deployment command. Server CURRENT, web image tag and OCI revision match the
  release above; web and DB are healthy and Caddy is running. Delivery:
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39629829823 .
- **Live read-only checks:** authenticated broker and health APIs return 200;
  Schwab configured/connected remain true. All 15 migrations are applied; public
  login returns 200 and invalid registration requests are refused with 403 before
  parsing, proving registration remains closed. Deployment backup succeeded at
  `2026-10-21T16:00:31Z`; prior successful restore evidence remains available.
- **Workflow preserved:** the new server-side PR/CI protections allowed the
  existing guarded merge and automatic deployment. Owner controls visibility;
  native protection availability while private is plan-dependent. Mandatory CI
  secret/private-file checks support either visibility. Dependabot's grouped
  action-update PR #40 is separate work and retains the normal review process.
- **Remaining:** zero critical audit entries; documented tooling advisories remain
  visible without forced major migrations. Historical-data remediation is prepared
  privately, with current-tree equality verified; publication requires coordinated
  approval under the no-force-push contract. No rewrite or support request was sent.
  This handoff-only follow-up will trigger another automatic delivery after its
  merged-main CI; the evidence above names the verified application release.

## Previous handoff (2026-10-21): Public/private repository security hardening

- **Owner scope:** preserve the existing comment-based independent review,
  guarded squash merge and automatic deployment while the owner may toggle
  repository visibility for Actions usage. No visibility change was made.
- **Verified GitHub settings:** secret scanning, push protection, Dependabot
  alerts/security updates and private vulnerability reporting are enabled.
  `main` requires PRs and `Verify AuraTrade`, linear history, and blocks force
  pushes/deletion including admin bypass. No formal approving GitHub review,
  merge queue or deployment approval was added. Native protections while private
  still depend on the owner's GitHub plan; CI/local guards remain available.
- **Branch `fix/public-repository-security`:** mandatory checksum/version-pinned
  full-history secret scan (including docs-only changes), tracked private-file
  guard, standalone artifact guard with synthetic tracing canaries, immutable
  action references and constrained Claude triggers rooted in trusted checkout.
  Review marker comments now require the owner's verified GitHub author identity;
  forged approvals/rejections cannot affect the merge gate. Docker/tracing
  exclusions protect private worktree paths. `SECURITY.md` documents the policy.
  The clean-build canary caught Turbopack's instrumentation exclusion gap;
  production builds now use Webpack, whose generated instrumentation trace was
  verified to contain zero private worktree entries locally. The corrected
  Webpack standalone server also passed all 21 browser tests without retries.
  CI still must verify the final clean artifact and suite on this corrected head.
- **Dependencies:** Next.js 16.4.2, Auth.js beta.32, Prisma adapter 2.11.3,
  React/React DOM 19.3.1 and compatible lockfile security fixes. Prisma remains
  on v6 (6.19.3 client/CLI), with no schema/migration change. Existing ESLint
  configuration and React Hooks 7.0.1 rule policy are retained to avoid unrelated
  UI refactors. Final local audit reports **zero critical**, 8 high and 20
  moderate affected package entries, rooted in braces, deepmerge-ts and sprintf-js
  tooling dependencies. npm's forced fixes would change major tool versions;
  advisories remain visible rather than blocking the existing workflow.
- **Local evidence:** lint (two existing warnings), types, final production build,
  cross-review self-test (including forged/missing publisher cases), skill and
  workflow validation passed. Dependency-updated app passed 358 units / 34 suites
  and all 21 Chromium browser tests without retries, using an isolated synthetic
  DB; all 15 migrations applied fresh. Linux operational/private-file tests passed
  27 checks before two additional standalone guard cases; all five current
  private-file cases pass locally. A synthetic credential was rejected with its
  value redacted. Clean-checkout CI must verify the final artifact canaries: local
  build success alone is not proof that a standalone bundle is safe to distribute.
- **Next:** final-head CI, independent cross-model review, guarded squash merge,
  then observe automatic delivery and verify production health. History rewriting
  is excluded from this PR: preparation/evidence is private and any publication
  must be coordinated with commit/review/deployment references under the no-force-
  push contract. No financial formulas or canonical trade data were changed.

## Previous handoff (2026-10-20): Automatic production deployment verified

- **Verified live release:** `cf1d216c4cbb1d91647e4b5d249beb704d8a4e8b`, guarded
  squash merge of PR #37; its tree matches reviewed head `ca7f465` exactly.
  Gemini high-effort independent review approved with zero blocking findings:
  https://github.com/rahul-reddy/AuraTrade/pull/37#issuecomment-6304084337 .
- **Automatic delivery succeeded:** merged-main CI triggered the off-host build,
  verified artifact transfer, portable image identity, backup, migration and health
  gates without a workstation deployment command. Actual successful run:
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39515763780 .
  Server CURRENT, web image tag and OCI revision all match the release above;
  web, DB and Caddy are healthy. Earlier engine-ID failures stopped safely before
  migration/swap and were corrected without weakening archive integrity checks.
- **Exact-revision CI:** merged CI `39515274367` passed 358 units / 34 suites,
  24 deployment/operational tests and all 21 browser tests without retries;
  lint, types, build and migration/drift checks passed. PR CI also passed but its
  chart-review browser test needed one retry; merged CI passed it first try.
- **Live checks:** authenticated Connections page/API return 200 and configured/
  connected remain true; all 15 migrations applied. Broker credentials still
  match private configuration, callback and daily worker remain enabled. Public
  Chromium desktop/mobile light/dark, reload and cross-tab theme persistence
  passed with zero page errors; registration remains closed. Checks wrote no
  canonical trades. The owner still selects a start date and confirms import.
- **Recovery evidence:** deployment backup at `2026-10-20T23:36:58Z` succeeded;
  restore completed at `23:37:42Z` into a disposable DB, schema/data queries passed,
  and cleanup independently confirmed zero leftover restore DBs.
- **Handoff:** automatic successful-main deployment is enabled under the owner's
  standing authorization. This handoff-only follow-up will itself trigger another
  delivery after merged CI; the evidence above names the last verified app release,
  not a prediction about a future documentation revision. No financial formulas,
  application behavior or schema changed in this follow-up. Account security remains
  deferred. Independent PR #36 reviewer-harness changes are preserved.

## Previous handoff (2026-10-20): Automatic rollout stopped safely; portable identity fix

- **Owner scope:** Schwab correction is live (`022f186`); automatically deploy
  future successful merged-main CI without renewed confirmation. Account-security
  product work remains deferred and repository visibility stays public.
- **Automation merged:** PR #35, release `c5f09d3`, reviewed head `658c24c`,
  independent Claude Opus approval (0 blocking):
  https://github.com/rahul-reddy/AuraTrade/pull/35#issuecomment-6299021453 .
  Final PR CI and merged CI each passed 358 units, 21 deployment/operational
  checks and all 21 browser tests without retries; migration/drift checks passed.
  Main CI: https://github.com/rahul-reddy/AuraTrade/actions/runs/39481230309 .
- **First automatic run:** CI successfully triggered delivery without a workstation
  deploy command. Both images built/published/transferred; source/image archive
  checksums passed. Docker archive import changes `.Id` across GitHub's Docker
  backend and the server's containerd backend. The strict ID check stopped before
  backup/migration/swap. CURRENT stayed `022f186`, healthy; incoming files cleaned.
  Evidence: https://github.com/rahul-reddy/AuraTrade/actions/runs/39481889717 .
- **Correction:** shared, deterministic `deploy/image-identity.py` validates platform,
  revision and allowed image ENV, then hashes runtime configuration and ordered
  uncompressed layer digests. Both runner and server compare this portable content
  identity, retaining exact archive checksums. Engine IDs/creation history are
  excluded; changes to filesystem or runtime configuration remain rejected before
  backup. The validator used for manual rollback follows the executing script.
- **Evidence:** 24 deployment/operational tests passed, including different engine
  IDs with identical content, changed imported filesystem refusal, changed runtime
  settings, corruption, rollback and cleanup. A real disposable image was exported
  as a Docker archive and imported into the production host's image store (never
  run): engine IDs differed while portable identities matched. Probe image/archive
  were removed; the live app was untouched. No broker values or credentials logged.
- **Isolation:** unrelated working edits to the review harness appeared in the
  original checkout. They are preserved. This fix is isolated in a fresh worktree
  based on committed main, and does not modify the review harness.
- **Review update:** prior head passed CI and Claude Opus review (0 blocking). Rebased
  over merged PR #36, preserving its Antigravity harness and handoff; only STATUS
  conflicted. The new head needs fresh CI and independent review.
- **Next:** exact-head CI and independent review, guarded merge, then observe the
  automatic delivery and verify live CURRENT/image revision/public/authenticated
  health. Do not claim automatic rollout complete until that real workflow passes.

## Previous handoff (2026-10-20): Gemini reviewer runs through Antigravity

- **Owner request:** make the Gemini reviewer work through Google Antigravity on the owner's Pro
  login, let it review critical diffs at high effort, and apply it to TenFold, Trading_Strats and
  AuraTrade.
- **Branch `feat/antigravity-gemini-reviewer`:** `gemini` runs `agy` (`~/.gemini/bin`) instead of
  the Gemini CLI: pinned `gemini-3.8-flash-high` (`--effort high`; medium on low tier), plan mode +
  sandbox, prompt on stdin, fail-closed on a model swap, a non-SUCCESS result, or configured MCP
  servers/plugins. Critical exclusion is an explicit, empty `$CriticalTierExcluded` list. Ported
  from rahul-reddy/Trading_Strats#8/#9 and rahul-reddy/TenFold#141; only project lines differ.
- **Verified:** `scripts/cross-review-selftest.ps1` passes. End to end in Trading_Strats, Gemini
  approved a clean change and blocked a planted bug.
- **Deploy note:** review harness and docs only; the automatic post-merge deploy ships unchanged
  app code.

## Previous handoff (2026-10-20): Schwab fix live; automatic deployment in review

- **Owner authorization:** deploy the prepared fix and enable automatic deployment
  after successful merged-main CI (latest instruction, 2026-10-20). AGENTS.md and
  the runbook now record this repository-specific exception to manual confirmation.
  Account-security product work remains deferred; public visibility is preserved.
- **Live fix:** `022f186c978250d4dac0a21fbddd24cfff1a80c5` deployed using verified
  off-host Linux images. Pre-deployment backup `20261020T182556Z-pre-022f186` succeeded;
  all 15 migrations were already applied. Web/DB/Caddy are healthy. Authenticated
  Connections page/API return 200; connected/configured remain true. Live preview
  now returns the actionable mutual-fund/day message, with canonical trade count
  unchanged. The owner chooses the start date and confirms the preview in the UI.
- **Recovery / UI evidence:** fresh backup `20261020T183330Z-daily` restored and
  queried successfully in a disposable DB; cleanup independently confirms zero
  remaining restore DBs. Real Chromium public desktop/mobile light/dark checks,
  theme reload/cross-tab persistence passed with zero page errors; login 200,
  signed-out redirects and registration closed. Runtime broker keys still match.
- **Automation:** delivery builds both web/migrate images off-host, preserves web
  publishing, verifies exact-SHA main CI and artifact/image identity, transfers via
  pinned SSH, backs up then migrates. GitHub serialization plus a server lock avoid
  overlapping swaps; superseded revisions are skipped. Startup/public-health
  failures attempt previous-app rollback without reversing DB migrations. CURRENT
  updates atomically only after health checks; active/previous releases survive
  cleanup. Legacy host builds require explicit opt-in to protect the 2 GB server.
- **Credentials:** dedicated restricted SSH key provisioned, pinned-host login
  verified, repository deployment secrets installed without printing private values.
  No broker/DB credentials enter GitHub or builds. The server holds no GitHub token.
- **Validation:** 358 units / 34 suites and lint/types passed locally (two existing
  lint warnings). All **21** deployment/operational tests passed, including real
  receiver checksum validation, corrupt-transfer refusal, cleanup, retry handling,
  serialized swaps and rollback. Actionlint 1.7.12, shell syntax, cross-review
  self-test and repository skill validation passed. CI now runs deployment tests.
- **Review correction:** first PR #35 review blocked the host-side public DNS/
  hairpin health check. It now uses HTTPS `--resolve <host>:443:127.0.0.1` through
  Caddy, preserving SNI/certificate validation; the runner still probes publicly.
  Both exact loopback probes were exercised on production: login 200, registration
  403. Follow-up tests verify loopback flags and preservation of active/rollback
  releases even outside the newest three. Cache scopes and OCI source labels are
  restored, lock waits time out, image ENV is allowlisted, and synthetic summaries
  stay in test temp directories. Prior review:
  https://github.com/rahul-reddy/AuraTrade/pull/35#issuecomment-6298707059 .
  Final exact-head CI and independent re-review are required before merge.
- **Next:** finish final shell/deployment checks, PR CI and independent review,
  guarded-merge automation, then observe its first real automatic production
  deployment and verify CURRENT/public/authenticated health. No further per-merge
  deployment confirmation is required. Do not claim automation is live until that
  workflow succeeds. No application financial formulas or schema changes.

## Previous handoff (2026-10-20): Schwab preview fix merged; deployment awaits owner

- **Ready release:** `022f186c978250d4dac0a21fbddd24cfff1a80c5`, guarded squash
  merge of PR #33. Its tree matches reviewed head `1eec053` exactly. Independent
  Claude Opus medium critical-tier review approved with **0 blocking findings**:
  https://github.com/rahul-reddy/AuraTrade/pull/33#issuecomment-6297397979 .
- **Delivered in code:** narrowly accept observed USD SMA buying-power bookkeeping
  and explicitly typed single-leg ETFs. Report the day blocking preview and keep
  mutual funds/options/position events blocked. Owner selected the optional
  first-sync date feature: the preview labels its actual saved boundary even after
  input edits or failed refetch; explicit confirmation commits it, daily overlap
  respects it and reconnect preserves it. No schema or financial formula changes.
- **Validation:** final local 358 units / 34 suites, full lint (two existing
  warnings), standalone types, production build and focused real Schwab browser
  test passed. Before the final label clarification, all 21 browser tests passed
  locally without retries. Final PR CI passed all required gates, fresh migration
  and zero drift, 358 units and 20 browsers first attempt plus one unrelated chart
  test on retry; Schwab passed first attempt:
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39468356518 .
  Merged release CI is the separate exact-SHA deployment gate:
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39469424562 .
- **Artifacts / deployment:** Linux/amd64 web and migrate images were built
  off-host from `git archive` of the merged release, with matching revision labels
  and no environment files in the source context. The ignored local packaging
  helper checks exact-main CI and runtime-only environment boundaries before
  exporting/checksumming images. Do not build on the 2 GB production server.
  **Not deployed:** the owner's updated standing workflow requires confirmation
  for manual deployments. Production still reports `57e7c92`; backup/restore
  evidence is successful and there are zero leftover restore-check databases.
- **Limits:** no canonical live import or history exclusion was performed. The
  owner must choose the initial start date and review/confirm the resulting batch;
  mutual-fund history needs separate review. The first review's preview-boundary
  advisory is fixed. Remaining advisories are clearer messaging for alternative
  collective-fund subtypes, optional date-input min/max and the server-local
  variable name `window`; unsupported layouts and invalid dates already fail closed.
  The earlier secret advisory exited unsuccessfully with zero SARIF results;
  this is not evidence of a completed clean secret scan.
- **Next:** obtain owner confirmation for release `022f186`, use the off-host
  checksum/image-identity-checked backup/migrate/swap sequence, then check live
  Connections and the improved preview error. Leave actual history exclusion and
  canonical confirmation to the owner. Account-security product work stays deferred;
  repository visibility remains public.

## Previous handoff (2026-10-20): Schwab live-format preview correction

- **Cause:** owner OAuth/account linking succeeded, but first preview rejected
  valid Schwab `SMA_ADJUSTMENT` buying-power bookkeeping. The live source also
  contains ETFs typed `COLLECTIVE_INVESTMENT / EXCHANGE_TRADED_FUND` and an older
  mutual-fund redemption. Diagnostics emitted structural categories only; no
  broker identifiers, credentials, symbols, prices or amounts were logged/saved.
- **Change:** accept only the observed reconciled USD currency-only SMA layout
  and explicitly typed single-leg ETFs. Existing reported-fee and exact cash
  reconciliation checks remain. Mutual funds, options and position events still
  block the complete preview. Errors now identify the blocked calendar day and
  mutual-fund review requirement without private source values.
- **First-sync choice:** optional start date must be a completed date in the
  initial 59-day window. Excluded history is disclosed in the UI; the boundary
  is encrypted in the pending preview and committed only with explicit review
  confirmation. Future overlap and same-account reconnect preserve the boundary.
  Later syncs cannot narrow their overlap with a custom date. No schema change.
- **Source validation:** privately replayed the adapter against the live window:
  every observed ordinary stock/ETF/SMA layout passed; one mutual-fund day remains
  deliberately blocked. No canonical live import or user-selected exclusion was
  performed. Local fixture sources are entirely synthetic.
- **Validation:** 358 unit tests / 34 suites passed; lint passed (two existing
  warnings), types and isolated production build passed. All **21 Chromium tests**
  passed without retries before the review clarification, including first-sync input/request validation,
  blocked-day recovery, persisted confirmation boundary, fees and both themes.
  PR #33 head `c2d002a` CI passed (358 units, 20 browsers first attempt plus one
  existing chart-heading strict-selector retry; Schwab passed first attempt):
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39455759031 . Fresh database
  migration/drift checks passed. Secret advisory exited unsuccessfully and its
  SARIF contained zero results; do not claim a completed clean secret scan.
  Independent Claude Opus medium review approved that head with zero blocking
  findings: https://github.com/rahul-reddy/AuraTrade/pull/33#issuecomment-6295669682 .
  Its advisory is addressed: the preview now explicitly shows the boundary that
  confirmation will commit, independent of subsequent date-input edits or a failed
  refetch. Final clarification reran 358 units, production build and the focused
  real Schwab browser flow (both themes), all passed. Standalone lint/types and
  final exact-head CI/review must finish before merge.
- **Next:** independently review and guarded-merge
  the fix, prepare Linux images off-host (never build on the 2 GB server), then
  obtain owner confirmation for manual deployment under the updated standing
  workflow. After deployment, verify the live error/connection. Owner chooses whether to exclude older
  history and reviews the resulting preview before importing. Account-security
  product work remains deferred; repository visibility stays public.

## Previous handoff (2026-10-20): Schwab connection deployed

- **Live release:** `57e7c9297aaa9962d2f036094ff2a9a36de70993` at
  https://auratrades.quest. PR #31 was guarded squash-merged after exact-head CI
  and independent Claude Opus approval of `d07e07a` (critical tier, medium effort,
  zero blocking findings). Merged and reviewed file trees match. Review:
  https://github.com/rahul-reddy/AuraTrade/pull/31#issuecomment-6292409300 .
- **Delivered:** Settings → Connections; Schwab OAuth, explicit owned-account
  matching, inspectable fee/transaction preview, atomic ledger/snapshot import,
  opt-in completed-day daily sync after 06:00 New York, pause/reconnect/disconnect.
  Changed imports restart technical context/setup classification after commit.
  Tokens, account identifiers and pending source data are encrypted; app keys stay
  server-only. Existing TOS fills, CSV lifecycle events, journals and fee masking
  retain their safeguards. Espresso & Acid light/dark/mobile UI is verified.
- **Validation:** final local **353 units / 34 suites**, lint (0 errors, two
  existing warnings), types, production build and **21/21 browser tests** passed.
  Fresh deployment of all **15 migrations** and zero drift passed. The fixed
  precedence regression rejects both deliberately inverted API ranks. Final PR CI:
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39433080843 . Exact merged
  release CI independently passed 353 units and all 21 browsers **without retries**:
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39433768487 . Harness and
  skill validation passed. Synthetic light/desktop and dark/mobile images inspected.
- **Rollout incident and recovery:** the normal guarded server build exhausted
  much of the 2 GB host's memory and a public probe returned 502. The build was
  cancelled before backup/migration/swap; CURRENT remained `687011d`, and the old
  release recovered to HTTP 200 without reboot, resource changes or DB restore.
  Both Linux/amd64 images were then built off-host from `git archive` of the same
  CI-green release, with no environment files. Transferred archive checksum and
  exact image IDs were verified before running the reviewed backup/migrate/swap
  sequence with only its build invocation replaced by image identity checks.
  The Linux image build/typecheck passed. No cloud resource upgrade was made.
  **Do not repeat an on-host build on this 2 GB instance; use the documented
  off-host procedure until a dedicated deployment mode is added.**
- **Migration / restore:** pre-migration backup
  `auratrade-20261020T141320Z-pre-57e7c92.dump` (1.1 MB) completed; additive
  `20261020120000_schwab_connection` applied successfully (15 production migrations).
  New backup `auratrade-20261020T141427Z-daily.dump` (1.1 MB) was restored and queried
  in a disposable database. Cleanup succeeded; an independent catalog query
  confirmed **0** remaining restore-check DBs. Backup and restore health evidence
  both show success. Existing weekly restore-check schedule is retained.
- **Live checks:** web/DB/Caddy healthy; CURRENT is `57e7c92`. Read-only authenticated
  Connections page/API returned 200 and configuration was ready. A private value
  comparison confirmed all runtime broker keys match workstation configuration;
  callback and daily worker are configured. **0 application writes/test users**
  were made by release verification. Real Chromium checked public desktop/mobile
  light/dark themes, reload and cross-tab persistence: **0 page errors**. Login 200,
  signed-out root/dashboard redirect, registration closed. Live brokerage consent
  and source payload verification still require the owner's interactive Schwab login.
- **Limits / next action:** owner opens `/settings/connections`, authorizes Schwab,
  matches the brokerage account, reviews the first preview and optionally enables
  daily sync. Supported single-leg USD EQUITY records only; additional instrument
  layouts/options/position events require CSV review. Initial window is up to 59
  completed days; later overlap is at least seven. Older gaps need CSV history,
  and authorization generally needs weekly renewal. Review follow-ups: slow-first-
  sync transaction duration, empty revision recovery, explicit downtime-gap notice,
  transient failure retry policy, preview parsing and Prisma transaction detection.
  Automatic sync pauses on any failure. Account-security product work stays deferred.
  Merge this documentation-only handoff; no application redeploy is needed.
  Repository visibility remains public.

## Previous handoff (2026-10-20): Schwab connection ready for review

- **Owner authorization:** developer access approved, app created, private keys
  supplied in ignored `.env`; proceed with connection and daily sync. Branch
  `feat/schwab-sync`, based on `a52d84c`. Live code remains `687011d` until the
  exact-head CI/review/guarded merge and deployment complete.
- **Implemented:** Settings → Connections with Schwab OAuth, one-use state bound
  to the signed-in user and HttpOnly cookie, explicit owned-account mapping,
  inspectable transaction/fee preview, atomic ledger/snapshot confirmation,
  opt-in daily completed-day sync, pause, reconnect and local disconnect.
  Existing journals/trades survive disconnect. Espresso & Acid themes and fee
  presentation masking are supported. There is no order-placement API client.
- **Data safety:** API snapshots have a separate source type, below timestamped
  TOS fills and above date-only CSV fills. They cannot suppress CSV lifecycle
  events. Stable content comparisons skip unchanged days; immutable observations
  detect A → B → A revisions. Changed prior days pause background importing.
  Source fee costs are summed as absolute broker-reported charges and must
  reconcile exactly with rounded USD cash movement; fees are never inferred.
  Unsupported assets, events, statuses, fee layouts, precision or response sizes
  reject the whole batch. Missing carry-in positions stop confirmation.
- **Credentials:** AES-256-GCM binds encrypted tokens, account identifiers and
  pending source data to user/purpose. Refresh commits separately so rejected
  source data cannot roll back a rotated token. All connection writers serialize
  via DB locks; canonical changes share the existing account ledger lock. Private
  runtime credentials and a stable random encryption key were installed in the
  host environment through SSH stdin, without values in commands, git or logs.
- **Validation on the final implementation working tree:** `npm test` passed
  **352 tests / 34 suites**; lint passed (0 errors, two existing warnings), types
  and isolated production build passed. The prior candidate passed **21/21**
  browser tests; the final Schwab browser regression passed after fee masking and
  immutable-observation fixes. It exercises real APIs/database with synthetic
  previews, fees, failed-save retry, rollback of an earlier day when a later day
  fails, concurrent confirmation, session/origin boundaries, both themes and
  disconnect retaining trades. Full exact-head CI remains required before merge.
- **Migration:** additive `20261020120000_schwab_connection` applied to both local
  databases. All **15** migrations also deployed to a fresh disposable database;
  drift check found no difference. No applied migration was edited. Production
  migration waits for the deployment's pre-migration backup. Harness self-test
  and repository skill validator passed. Public repository visibility retained.
- **Limits / next action:** first sync checks up to 59 completed days, later runs
  recheck at least seven; older gaps need CSV history. Ordinary single-leg USD
  equities only; options, position transfers/lifecycle and ambiguous records
  require CSV review. Approximate weekly authorization renewal remains necessary.
  Live brokerage payloads have NOT been verified: the owner must authorize on
  Schwab and inspect the first preview after deployment. Finish exact-head CI,
  independent cross-model review, guarded merge, deploy, and read-only live smoke.
  Account-security product work remains deferred.
- **PR / CI follow-up:** PR #31 head `3b54c3c` passed the full local 21-browser
  suite. Initial GitHub CI passed migrations/lint/types/352 unit tests/build but
  exposed an ambiguous browser status selector when dummy client credentials
  were absent. The fixture now supplies synthetic credentials and waits for the
  specific completion status. No broker request or import correctness failure
  occurred. Re-run exact-head CI and independent review after this test fix.
- **Final integration correction:** the `5128333` fixture-fix head passed CI
  (352 units; all browsers, one existing chart-review retry) and the original
  application tree received Claude approval with zero blocking findings.
  Final audit identified that a changed ledger rebuild also needs to restart
  existing technical enrichment/classification. Manual and scheduled imports
  now start that pipeline only after successful commit; unchanged/failed batches
  do not. A regression checks the commit boundary and rejection path. Validate,
  commit, re-run CI/review on the new head before release. Review advisories:
  bounded slow-first-sync timeout, supported EQUITY source types only, empty
  revision recovery, immutable-observation retention and explicit callback config.
  Comma-separated types were confirmed against schwab-py's primary source; daily
  content markers prevent unchanged snapshots creating duplicate observations.
- **Blocking review finding addressed:** the exact `5128333` review found that
  the precedence test still labeled its supposed API statements as CSV history.
  The regression now contests an older complete SCHWAB_API day against a newer
  partial CSV and checks the completed round trip/P&L, then contests API against
  an older timestamped TOS statement. This exercises both rank boundaries rather
  than only the pre-existing CSV timestamp tie-break. New head needs fresh review.
- **Fix verification:** 353 units passed, final production build/lint/types passed,
  and the real Schwab browser regression passed after the enrichment change.
  Temporarily inverting API rank below CSV and above TOS each caused the new
  precedence regression to fail as intended; the original engine source was
  restored byte-for-byte and the normal regression passed. No engine ranking
  behavior changed in the fix; the test now guards the intended existing rank.

## Previous handoff (2026-10-19): full non-security roadmap deployed

- **Live release:** `687011de23182e6882e1bd11601594c325c12589` at
  https://auratrades.quest. PR #29 was squash-merged by `scripts/merge-pr.ps1`
  after exact-head CI and independent Claude Opus approval of PR head `b7904c3`
  (critical tier, medium effort, 0 blocking findings). The merged file tree is
  identical to the reviewed head. Server CURRENT matches the live release.
- **Delivered:** chart-side journals and authenticated screenshots; daily review
  queues/reflections; personal playbooks/rules/example trades; edge analysis with
  uncertainty and trade drill-downs; weekly experiments; exact broker-row source
  inspection; browser-local saved views and chart displays; j/k review navigation;
  presentation amount masking; operational import/cache/backup/restore health.
  Espresso & Acid light/dark mode is retained throughout. README.md documents
  startup, workflows, storage limits and source-data limitations.
- **Validation:** local implementation checks passed lint (0 errors, two existing
  warnings), types, production build, **321 unit tests / 31 suites**, **20/20
  browser tests**, eight Linux operational tests, fresh migration deployment and
  zero schema drift. Exact-release main CI independently passed all checks,
  including coverage, all 20 browsers and both advisory scans:
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39250390338 . PR-head CI:
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39248724502 . Windows
  harness passed too. Local synthetic desktop/mobile screenshots were inspected
  and retained under ignored `.local/ui-preview/roadmap/`.
- **Rollout:** `scripts/deploy.ps1 -Revision <full-sha> -Confirm "DEPLOY 687011d"`
  built the images/types successfully while the previous app kept serving.
  Pre-migration backup `auratrade-20261019T122227Z-pre-687011d.dump` completed
  (1.1 MB). Both additive migrations applied successfully; production now has
  **14 applied migrations**. Web, PostgreSQL and Caddy were healthy after the swap.
  Public smoke: login 200, signed-out dashboard redirects, registration closed.
- **Actual restore proof:** a fresh post-deploy backup,
  `auratrade-20261019T122251Z-daily.dump` (1.1 MB), was restored and queried by the
  shipped `restore-check.sh` in a newly created disposable database. Cleanup
  succeeded; a separate catalog query confirmed **0** remaining restore-check
  databases. Backup and restore evidence both show success. The managed cron
  entry runs weekly at **03:45 Sunday, server timezone Etc/UTC**. Job output is
  credential-free; raw dump/restore diagnostics are suppressed. Runbook:
  docs/DEPLOYMENT.md#operational-health.
- **Live application checks:** read-only authenticated checks returned 200 for all
  five new pages and their APIs, plus journal and provenance endpoints. Invalid
  account requests returned 404. The health API reported healthy backup/restore
  evidence and a DB query confirmed 14 migrations. No production test account or
  application data was created. Real Chromium checked login desktop/mobile in
  both modes, reload persistence and cross-tab synchronization: **0 page errors**.
- **Review follow-ups (advisory):** add safe structured failure diagnostics without
  raw row data; bound/aggregate edge-analysis reads for very large accounts;
  provide recovery for a failed disposable-DB cleanup without risking live DBs;
  defer the chart journal's first query until needed while preserving drafts.
  Current restore cleanup passed. Alerts are in-app; no external notifications
  are configured. Restore checks prove queryable restoration, not every business
  invariant or off-host disaster recovery.
- **Next action:** account security remains deferred until the owner starts that
  phase. Schwab synchronization waits for developer approval; no connector was
  built ahead of that approval. Review/merge this documentation-only handoff;
  it requires no application redeploy. Repository visibility remains public.

## Previous handoff (2026-10-19): non-security roadmap ready for review

- **Owner scope:** implement the full non-security roadmap. Account security is
  deferred until last. Schwab daily synchronization waits for developer approval
  (owner has applied; estimated two business days). The hosted release remains
  `300cf90` until this branch passes review, CI, merge and deployment.
- **Branch:** `feat/trade-journal-daily-review`, based on `7f555c4`. Implementation
  is ready for PR/CI/cross-model review and is not deployed yet. It includes chart-side structured journals/screenshots,
  daily review/reflection, playbooks/examples, edge analysis, weekly experiments,
  exact broker-row provenance, saved views/chart preferences/j-k navigation,
  presentation amount masking and operational health/restore verification.
- **Data boundaries:** journals are independent of derived trade rows and retain
  their identity across reprocessing; unmatched journals appear on their original
  entry review day. User writing uses version checks. Planned stops do not change
  initialRisk/rMultiple. Personal labels remain separate from classifier output.
  Daily realized P&L and grouped analysis reuse existing metrics and broker fees,
  counting known closed results by exit trading date. Raw provenance requires a
  stable source identity plus exact stored-fill agreement; no fuzzy matching.
- **Schema:** two additive migrations, `20261018210000_trade_journal_review` and
  `20261018221500_playbooks_weekly_review`, applied successfully to local development
  and isolated `auratrade_ui_test` databases (14 migrations). Production still has
  12. Neither applied migration was edited. Deployment must back up first.
- **Local validation (implementation working tree before the release commit):**
  `npm run lint` (0 errors, two existing warnings), `npm run typecheck`, `npm test`
  (**321 tests / 31 suites**), isolated production build and the complete browser
  suite (**20/20**) passed. Browsers used port 3100 and isolated `auratrade_ui_test`.
  New coverage includes failed-save retention, attachment size/count/type limits,
  pending-save controls, stale-tab conflicts, foreign ownership rejection, ledger
  reprocess preservation, CSV notes, daily/weekly reflections, playbook assignment,
  archiving, analysis drill-downs, source rows, saved views, chart preferences and
  j/k navigation. Light/dark/mobile screenshots were visually inspected and are
  retained in ignored `.local/ui-preview/roadmap/`.
- **Migration validation:** all 14 migrations also applied to a newly created
  disposable local database; `prisma migrate diff --from-migrations ...
  --to-schema-datamodel ... --shadow-database-url ... --exit-code` reported no
  difference. The validation helper dropped only the two databases it created.
- **Operational checks:** eight Linux tests passed with stub Docker calls and
  disposable temp directories. These cover stopped DB/dump failure, finalized
  backups, missing dumps, restore failure, create failure (never drop), cleanup of
  only this invocation's created DB, and atomic health evidence preservation.
  Dump/restore errors suppress raw tool diagnostics; failure tests check that
  synthetic private row content cannot enter stdout or stderr.
  Actual hosted restore proof is pending deployment. Harness self-test and skill
  validator passed. CI now runs the operational tests too.
- **Local verification:** a separately running dev server owns `.next`; optional
  `AURATRADE_ISOLATED_BUILD=1` keeps build/start verification in `.next-validation`.
  Generated build/local artifacts are ignored by ESLint/Jest. Default CI/deploy
  build paths are unchanged. Startup and feature guide: README.md; operations:
  docs/DEPLOYMENT.md. Public repository visibility was verified unchanged. The
  server preflight confirmed Python, flock, cron, healthy services and 45 GB free.
  Next action: record the release commit/PR, pass exact-head CI and cross-model
  review, guarded merge, deploy, run live read-only smoke and a real restore check.

## Previous handoff (2026-10-18): Espresso & Acid deployed and verified live

- **Live release:** `300cf90de329b4b748e52da24c925969c0995a66` at
  https://auratrades.quest. PR #27 was squash-merged through the guarded merge
  script after successful CI and exact-head Claude Opus approval (0 blocking;
  4 advisory cleanup notes). The owner clarified that implementation includes
  deployment. Deployed with `scripts/deploy.ps1 -Revision <full-sha> -Confirm
  "DEPLOY 300cf90"`; the server's CURRENT marker matches this revision.
- **Delivered:** Espresso & Acid throughout the application, with dark espresso/
  citron and light parchment/cream/olive, mode-aware charts and financial colors,
  and persistent sun/moon controls on auth and workspace screens. The selected mode
  applies before hydration, syncs tabs, and retains chart data/selection/zoom.
- **Validation:** application source `454eb43e53421be7befd5c8a6f7e5d81bb732f0d`
  passed local lint (0 errors, two existing warnings), types, build, **298 unit
  tests** and **19/19 browser tests** against the production build and isolated
  test database. Full CI also passed on the exact merged/deployed revision:
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39162848542
  (harness, migrations/drift, lint/types, coverage, build and browsers).
- **Deployment evidence:** server build/types passed. Backup
  `auratrade-20261018T203137Z-pre-300cf90.dump` (1004K) completed before migration
  checks. All 12 migrations were already applied; no schema changes were needed.
  Web, database and Caddy were healthy after the release switch.
- **Live checks:** login 200; signed-out root/dashboard redirect to login;
  registration remains closed. Real Chromium checks exercised dark and light on
  desktop/mobile, the visible mode control, correct background/native color scheme,
  reload persistence and cross-tab synchronization, with **0 page errors** and no
  document overflow. Four live screenshots are in ignored
  `.local/ui-preview/espresso-acid/live/`. A 60-second server-side synthetic session
  verified authenticated root 307 to dashboard and dashboard 200 with the theme
  control rendered. No persistent production test account or owner password used.
- **Scope / next action:** no financial calculation, parser, ledger, API/auth,
  schema or dependency changes. Startup: README.md; appearance: docs/UI-DESIGN.md;
  deployment: docs/DEPLOYMENT.md. Review/merge this documentation-only handoff
  through the normal gate. The application is deployed; no redeploy is needed for
  this status update. Repository visibility remains public.

## Previous handoff (2026-10-18): Espresso & Acid light/dark themes

- **Implemented:** the owner's chosen Espresso & Acid palette across auth, workspace,
  tables, import previews, integrity screens, error/loading states, dialogs, toasts,
  dashboard SVG charts and the trading calendar. Dark uses espresso/citron; light
  uses parchment/cream/olive. Green/rose financial meanings remain consistent.
- **Mode control:** sun/moon buttons on auth and workspace screens persist the
  browser preference, sync tabs, and work when storage is blocked. Dark is the
  default. A head bootstrap applies the saved theme before hydration. Native date
  controls follow the selected color scheme. Canvas charts resolve CSS tokens and
  recolor in place without replacing the canvas or requesting market data.
- **Validation:** application source `454eb43e53421be7befd5c8a6f7e5d81bb732f0d` passed local lint (0 errors,
  two existing unused-variable warnings), typecheck, production build, **298 unit
  tests** and **19/19 Playwright browser tests** against the production build on
  isolated `auratrade_ui_test`. The final browser run includes the last spinner and
  table-placeholder contrast refinements. The two new browser scenarios cover both
  modes, auth/navigation/reload persistence, real cross-tab storage events, bootstrap
  without client bundles, blocked storage, mounted canvas recoloring, preserved
  selection, dialogs and mobile controls. No page errors in either theme scenario.
- **Visual evidence:** inspected desktop dashboard/login/chart and mobile chart
  screenshots. Fourteen synthetic screenshots retained in ignored
  `.local/ui-preview/espresso-acid/`. Calculated key text/semantic/chart colors
  against card surfaces and action ink against button fills: all exceed 4.5:1 in
  both modes. This is a check of these pairings, not a full accessibility audit.
- **Scope / next action:** no financial formula, parser, ledger, API/auth, schema or
  dependency changes. Startup remains README.md. Open the PR, obtain green CI and
  exact-head independent review, then use the guarded merge script. Hosted release
  remains `f73e356` until a deployment is requested.

## Previous handoff (2026-10-18): calendar/navigation follow-up deployed

- **Live release:** `f73e356fc97b8482f4ef0fd253c13d354b736804` at
  https://auratrades.quest. PR #25 was squash-merged through the guarded merge
  script after full CI and exact-head Claude Opus approval with 0 blocking findings.
  Ran `scripts/deploy.ps1 -Revision <full-sha> -Confirm "DEPLOY f73e356"` under the
  owner's existing deployment instruction.
- **Delivered:** newest-first heatmap months with year/month filters, clear and
  empty-period states; filters affect only the calendar within the dashboard date
  range. The chart's Trades link returns all symbols in the same account. The
  chart header has prominent labeled symbol search and an Open chart button;
  Enter and symbols without imported trades work as well.
- **Validation:** application source `4e8fb3e` passed local lint (two existing
  warnings), types, production build and **298 unit tests**. Final PR head
  `03a3cde68b17d115f6e7a95eafe9be2286fccc14` adds documentation and browser-test
  stabilization only; **17/17 browser tests** passed against the production build
  and isolated test database. Final lint/types passed too. Full CI passed on the
  exact merged/deployed SHA (harness, migrations/drift, lint/types, coverage, build,
  browsers): https://github.com/rahul-reddy/AuraTrade/actions/runs/39158269380
- **Deployment evidence:** server build/types passed; backup
  `auratrade-20261018T192839Z-pre-f73e356.dump` (972K) completed before migration
  checks. All 12 migrations were already applied; no schema change was required.
  Web/database healthy and Caddy running after the switch.
- **Live checks:** login 200; signed-out root/dashboard redirect to login;
  registration closed. Desktop/mobile login rendered with 0 page errors and no
  mobile overflow. Ephemeral server-side synthetic session verified authenticated
  root 307 to dashboard and market-data API 200 with 250 Finviz MSFT daily candles.
  Runtime client-bundle checks found both heatmap filter controls and chart symbol
  search. No persistent production test account or owner password was used.
  New UI interactions were exercised with synthetic multi-year history and broker
  statements in the pre-deploy browser suite; screenshots in `.local/ui-preview/`.
- **Scope / next action:** no P&L, ledger, parser, API, auth or schema changes.
  README.md and docs/CHARTS.md explain the controls. Review/merge this docs-only
  handoff through the normal gate; no application redeploy remains. Repository
  visibility remains public as instructed. Runbook: docs/DEPLOYMENT.md.

## Previous handoff (2026-10-18): calendar filters and chart navigation follow-up

- **Implemented:** heatmap months sort newest first, with independent year/month
  selectors, clear and empty-period states. Calendar filters stay local to the
  heatmap within the dashboard date range. The chart's Trades back link preserves
  the account and clears symbol filtering. Chart symbol search now has a visible
  label and explicit Open chart button, while supporting Enter and arbitrary
  tickers without requiring an imported trade.
- **Verified source:** `4e8fb3e06c626e6882e2d46824892bb583a8acc5` passed lint
  (0 errors, two existing warnings), types, production build and **298 unit tests**.
  Two new browser scenarios passed on the production build and isolated
  `auratrade_ui_test` database, covering multi-year ordering/filter combinations,
  no-data/reset, mobile overflow, button/Enter search, account preservation and
  unfiltered return to a multi-symbol trade list. Full 17-test regression is running.
  Desktop/mobile screenshots inspected in `.local/ui-preview/`.
- **Scope / next action:** no P&L, ledger, parser, API, auth or schema changes.
  Open the PR, finish full browser regression/CI, obtain exact-head independent
  review, guarded-merge and deploy under the existing delivery instruction.
  The previous annotated-chart release remains live until that succeeds.
- **Review/test follow-up:** PR #25 head `f29efdd` passed full CI and independent
  Claude Opus review with 0 blocking findings. Local regression exposed transient
  duplicate headings during Next.js streaming. Browser assertions now scope those
  headings to the active main workspace and wait for exactly one, preserving the
  visibility checks. All four affected calendar/navigation/workspace scenarios
  passed together; full regression is rerunning. Application source is unchanged.

## Previous handoff (2026-10-18): annotated chart release deployed

- **Live release:** `36be2af13e400d14aeaab590d52ff4a5331d5c06` at
  https://auratrades.quest. PR #23 was squash-merged through `scripts/merge-pr.ps1`
  after exact-head Claude Opus approval (0 blocking findings) and successful CI.
  Deployed using `scripts/deploy.ps1 -Revision <full-sha> -Confirm "DEPLOY 36be2af"`
  under the owner's existing deployment instruction.
- **Delivered:** one-year daily trade-review charts, grouped candle-aligned entry/
  exit markers, EMA 8/21, SMA 50, volume/SMA 50 and RSI 14/SMA 5 panes; explicit
  intervals/ranges, stable zoom, focus/reset, fill inspector, symbol search,
  indicator toggles, preserved views on errors and mobile stacking. Compact
  navigation and expandable secondary dashboard statistics prioritize the chart.
- **Validation:** final application source `c9e11b259f0397e717f9e60210eb25132aba1898`
  passed local lint (two existing warnings), types, **298 unit tests**, production
  build and **15 browser tests**. The tested PR head `920052f` adds only a status
  update. Full CI also passed on the exact merged/deployed SHA:
  https://github.com/rahul-reddy/AuraTrade/actions/runs/39142057978
  (harness, fresh migrations/drift, lint/types, coverage, build and browsers).
- **Deployment evidence:** server build/types passed; backup
  `auratrade-20261018T155454Z-pre-36be2af.dump` (916K) completed before the migration
  check. All 12 migrations were already applied; no schema change was needed.
  The running web image identifies the release above; web/database healthy and
  Caddy running. Server Finviz token configured privately in mode-600 `.env`, with
  existing environment keys preserved. All 46 client build files scanned: 0 token
  matches; no credential value or real broker statement was committed/logged.
- **Live checks:** `/login` 200; signed-out `/` and `/dashboard` redirect to login;
  public registration remains closed. Desktop/mobile sign-in rendered with **0
  page errors** and no mobile overflow. An ephemeral server-side synthetic session
  confirmed authenticated `/` returns 307 to `/dashboard` and market-data API 200
  with **250 Finviz MSFT daily candles** (2025-10-20 through 2026-10-16). No persistent
  production test account was created and no owner account/password was used.
- **Limits / next action:** daily quotes may be split-adjusted; exact broker fill
  prices remain intact. Date-only fills annotate daily charts. Yahoo intraday
  availability can fail inside the nominal retention window; errors preserve the
  previous chart. Cache freshness reflects retrieval time, not a guaranteed live
  feed. docs/CHARTS.md states these limits and formulas. Review/merge this docs-only
  handoff through the normal gate; no application redeploy is needed. Repository
  remains public as instructed. Startup: README.md; runbook: docs/DEPLOYMENT.md.

## Previous handoff (2026-10-18): functional trade-review chart revision

- **Scope:** owner requested a more useful UI and a proper one-year daily stock
  chart with their trades annotated, using the existing private Finviz token.
  Work is on `feat/trade-review-charts`; the previous release remains live.
- **Implemented:** explicit intervals/ranges, candle-aligned grouped entry/exit
  markers, EMA 8/21 and SMA 50, separate volume/SMA 50 and Wilder RSI 14/SMA 5
  panes, focus/reset controls, original-fill inspector, annotation selection,
  symbol navigation, loading/retry and mobile stacking. Compact app chrome and
  expandable secondary dashboard statistics prioritize review space.
- **Data:** strict server-only Finviz daily CSV adapter; Yahoo intraday/fallback.
  Daily cache keys normalize provider timestamps without deleting stored data.
  Invalid exports fail closed; upstream errors cannot expose token-bearing URLs.
  No ledger, broker prices, fees, money calculations or database schema changed.
  Assumptions, indicator formulas and limitations: docs/CHARTS.md.
- **Verified source:** `07e9f97565c8e895b5d2d31cdcea7161ef41a59f` passed
  `npm run lint` (0 errors, two existing warnings), `npm run typecheck`,
  `npm test` (**297/297**, 24 suites) and `npm run build`. Subsequent commits
  only adapt browser tests to collapsed statistics and wait for active streamed/
  filtered route content; assertions were preserved. Full browser regression on
  `c17ee91674a3f0598c8aa5c0a3f4220ab66ceea9` passed **15/15** against the production
  build and isolated `auratrade_ui_test` database. Final lint also passed.
- **Data/browser evidence:** authenticated API returned 250 MSFT daily candles
  from Finviz over one year. An additional real-Finviz BROS render mapped both
  synthetic broker fills; its 122 available candles reflect post-IPO history.
  Desktop/mobile screenshots inspected under `.local/ui-preview/`; browser test
  covers non-overlap, controls, retry, annotation selection and zoom stability.
  All 46 browser build files scanned: 0 matches for the configured private token.
- **Next action:** open the PR, finish CI and independent review, address any
  blocking findings and use the guarded merge workflow. Optional
  runtime Finviz environment wiring is included; production token provisioning
  and deployment are not yet performed for this revision. Repository stays public.
- **Review follow-up:** PR #23's `39cf886` head passed full GitHub CI and independent
  Claude Opus review with 0 blocking findings. `c9e11b2` addresses all five advisory
  notes: preserve an active interval's range, normalize provider symbols, handle
  missing export dates defensively, derive RSI signal warm-up from actual values
  and align the sidebar brand height with the header. A browser assertion now
  protects active-interval range preservation. Final checks and exact-head review
  must run again on this follow-up before guarded merge/deployment.

## Previous handoff (2026-10-18): UI release deployed and verified

- **Live release:** `8a299fc561af20bee65a9c0793ff5c386dcfbc9e` is deployed at
  https://auratrades.quest. The owner approved deploying the concrete release after
  the prior handoff. Ran `scripts/deploy.ps1 -Revision <full-sha> -Confirm "DEPLOY 8a299fc"`;
  the script verified a clean worktree, main ancestry and successful CI before upload.
- **Server evidence:** production build/types passed; backup
  `auratrade-20261018T143501Z-pre-8a299fc.dump` (852K) completed before migration checks.
  All 12 existing migrations were already applied; no pending migrations. The script
  switched web/Caddy successfully. Server `~/auratrade/CURRENT` and the running web
  image both identify the full release SHA; web and database are healthy, Caddy running.
- **Live checks:** HTTPS `/login` returned 200; signed-out `/` and `/dashboard` returned
  307 to login; registration POST returned 403 and `/register` rendered "Sign-up is
  closed". Playwright rendered the new login design at 1440px and 390px, with no
  mobile document overflow and **0 page errors**. Inspected screenshots saved under
  `.local/ui-preview/live-sign-in-desktop.png` and `live-sign-in-mobile.png`.
- **Original regression verified live:** authenticated `/` returned **307 to
  `/dashboard`**, whose HTML returned **200** and the redesigned empty-account state.
  This read-only check used a 60-second synthetic session for a nonexistent user,
  issued/kept in memory inside an ephemeral server-side tools container. No persistent
  test account was created, no owner account was used, and no secrets/cookies were
  printed or copied off the server. Real credential login is covered by the reviewed
  pre-deploy browser suite rather than a live owner-password test.
- **Prior validation:** the application source in this release passed **267 unit
  tests and 14 browser tests**, lint, types, build, migrations/drift and harness checks
  on [PR #20's final CI](https://github.com/rahul-reddy/AuraTrade/actions/runs/39064900879),
  with independent Claude Opus approval and 0 blocking findings. [PR #21](https://github.com/rahul-reddy/AuraTrade/pull/21)
  only updated AGENTS.md/STATUS.md; it also passed independent review and docs-only CI.
  This post-deploy handoff changes documentation only and needs no application redeploy.
- **Visibility / next action:** repository remains public as the owner instructed.
  No deployment work remains. Review/merge this status-only handoff through the normal
  gate; future releases use scripts/deploy.ps1. Startup/runbook: README.md and
  docs/DEPLOYMENT.md.

## Previous handoff (2026-10-18): public repository decision; UI merged

- **Owner decision:** keep `rahul-reddy/AuraTrade` public; its public visibility is
  intentional. Updated AGENTS.md to reflect this instruction. Repository visibility
  was not changed. This resolves the prior handoff's visibility question.
- **UI delivered to main:** [PR #20](https://github.com/rahul-reddy/AuraTrade/pull/20)
  squash-merged using `scripts/merge-pr.ps1` as
  `2a0ef6ba97f60877c074fdcdbebd329b066a0eda`. Includes the root-to-dashboard fix
  and the workspace redesign described below.
- **Evidence on reviewed PR head `ec5272287dc058b1bcdc121ba9e530e617822420`:**
  [CI](https://github.com/rahul-reddy/AuraTrade/actions/runs/39064900879) passed
  lint, types, migration/harness checks, **267 unit tests**, build and **14 browser
  tests**; [Claude Opus review](https://github.com/rahul-reddy/AuraTrade/pull/20#issuecomment-6240096254)
  approved with **0 blocking findings**. No new application code or tests changed
  in this documentation-only follow-up; it uses the docs-only CI path and requires
  its own head-matched independent review before guarded merge.
- **Production / next action:** production is unchanged. Merge this documentation
  update once its gates pass, then obtain the owner's typed `DEPLOY <release-sha7>`
  confirmation required by `scripts/deploy.ps1` before deploying the CI-green main
  revision. The deploy script backs up the database and runs live smoke checks.
  Screenshots remain under `.local/ui-preview/`; startup and hosting instructions
  are in README.md and docs/DEPLOYMENT.md.

## Previous handoff (2026-10-17): workspace redesign and home routing

- **Implementation / PR:** `4d569a2e35cc35df377bc7ba54ac312f2df63a17` on
  `feat/workspace-redesign`; [PR #20](https://github.com/rahul-reddy/AuraTrade/pull/20).
  The following status-only commit records this tested implementation. The exact CI
  result and independent review verdict are tracked on the PR's final head.
- **Root cause and fix:** `/` still rendered create-next-app's starter page. Middleware
  sent signed-out root visitors to `/login?callbackUrl=/`, and successful login returned
  them to that placeholder. The root now redirects to `/dashboard`; protected deep-link
  callbacks retain their existing behavior.
- **Design:** a shared charcoal/blue system, brand mark, page headers, accessible
  navigation and skip link, split authentication layout with password visibility,
  first-import onboarding, dashboard hierarchy and section navigation, all/closed/open
  trade views preserving other filters, labeled filters, improved table density,
  guided import progress, coherent integrity settings, and responsive chart review.
  Best/worst day colors now follow their displayed P&L sign. Financial calculations,
  parsing, API authorization, schema and migrations are unchanged.
- **Verification on `4d569a2`:** `npm run build` / direct Next build passed; TypeScript
  (`node node_modules/typescript/bin/tsc --noEmit`) passed; ESLint (`npm run lint` and
  final direct ESLint invocation) passed with two pre-existing unused-variable warnings
  (`GroupedTrade`, `IDLE_ENRICHMENT`); Jest **267/267** passed. All **12 existing browser
  tests** passed against the final production build; the final focused
  `workspace-design.spec.ts` run passed **2/2** after adding the new assertions.
  Earlier new-test failures were synchronization issues (dashboard enrichment wait,
  asynchronous view navigation, and hidden streamed headings), corrected in the tests.
- **Browser evidence:** production server on `127.0.0.1:3100` with a separate
  `auratrade_ui_test` database (all 12 existing migrations applied fresh). Synthetic
  users/statements only; the owner's local/hosted data was not touched. Inspected
  desktop and 390px mobile screenshots for sign-in, onboarding, dashboard, trades,
  imports, chart review and integrity settings. Browser checks include root login,
  signed-in root redirect, deep-link login, visibility toggle, import stages, dashboard
  anchors, trade-view filter preservation, and document/main-content overflow.
- **Documentation:** `docs/UI-DESIGN.md` records the design and journeys; `README.md`
  now documents actual local startup and checks instead of create-next-app instructions.
- **CI / independent review:** CI on `42aece9fd574e94d06a44a7ffd18e2821ae6d264`
  passed lint/types, harness checks, fresh migrations/drift, **267 unit tests**, build
  and **14 browser tests** ([run](https://github.com/rahul-reddy/AuraTrade/actions/runs/39064575893)).
  Claude Opus (medium, standard tier) approved that head with **0 blocking findings**
  ([review](https://github.com/rahul-reddy/AuraTrade/pull/20#issuecomment-6240056409)).
  Three advisory notes remain: empty-string greeting fallback, mobile rail overriding
  the desktop collapse preference, and invalid status queries leaving no trade tab
  selected. Gemini had zero quota; Claude's inherited API key had no credit; a retry
  using its existing subscription login completed the review. No credential/settings
  files were changed. The status-only follow-up must receive its own head-matched gate.
- **Delivery / next action:** GitHub reports `rahul-reddy/AuraTrade` as **PUBLIC**, which
  conflicts with AGENTS.md's instruction to keep it private. Visibility was not changed
  in this task. An owner clarification is pending; resolve it before guarded merge.
  Production deployment also remains pending the owner's typed `DEPLOY <merged-sha7>`
  confirmation required by `scripts/deploy.ps1` / `docs/DEPLOYMENT.md`. No production
  deployment is claimed here. Screenshots are saved locally under `.local/ui-preview/`
  and in CI's verification artifact.

## Previous handoff (2026-10-17): hosted deployment

- **Decision:** owner chose Option A (its own Lightsail server, TenFold's pattern) and the
  domain `auratrades.quest` (Namecheap).
- **Provisioned (live AWS, `us-east-2`):** `auratrade-1` (`small_3_0`, $12/month), static IP
  `auratrade-ip` = `18.226.191.214`, ports 22/80/443 only, daily auto-snapshots 09:00 UTC,
  key `~/.ssh/auratrade-lightsail`. Docker, swap and unattended-upgrades installed. Server
  `.env` secrets were generated on the server and never left it.
- **Merged PR #15 (`d5b9043`):** `deploy/` stack (Postgres 16, web, migrate, Caddy),
  `scripts/deploy.ps1` (clean worktree, sha on origin/main, green CI, typed `DEPLOY <sha7>`,
  `git archive` over SSH, so the server has no GitHub credential), backups before every
  migration plus daily dumps, `deploy/set-user.mjs`, sign-up switch pinned `closed` on the
  server, failed sign-in lockout. Codex cross-review: four rounds of blocking findings (a
  lockout race, a deploy redirect check that threw, and two address-spraying lock
  bypasses), all fixed with regression tests, then APPROVE. CI green at every head (267 unit,
  12 Playwright).
- **Deployed `d5b9043`:** 12 migrations applied; db, web and Caddy healthy; daily dump cron
  installed. DNS now resolves to `18.226.191.214`; Let's Encrypt certificates issued for
  `auratrades.quest` and `www`. Live checks: `/login` 200 with a valid certificate,
  signed-out `/dashboard` 307 → `/login`, register POST 403, `www` 301 → bare domain.
- **Workstation data copied (owner request):** the local `auratrade` database was cloned to a
  scratch database, the 191 Playwright `@example.com` users (shared published test
  password) were deleted there, and only that copy was restored on the server (after a
  `pre-restore` dump). Owner data identical on both sides: 1 user, 1,196 trades, net P&L
  −24,367.018, 4,415 statement rows, 4,111 fills, 12 migrations; `migrate status` up to
  date. A live sign-in with the owner's existing credentials reached the dashboard and
  `/api/dashboard` returned data. The local database was not changed.
- **AWS access (done):** separate `AuraTrade` IAM user created by the owner with
  `infra/aws/auratrade-operations.json` (tag boundary `project=auratrade`; no tagging,
  manual-snapshot or add-on rights), CLI profile `auratrade`, budget `AuraTrade monthly`
  ($20, unfiltered). `infra/aws/check-auratrade-access.sh`: 10/10 probes matched as the
  `AuraTrade` user, servers unchanged afterwards. The workstation's default profile is
  `focus-halo-deploy` (admin), not used.
- **Pending owner actions:**
  - Remove the AuraTrade AWS key from this repository's `.env` (it is also in the
    `auratrade` profile, which is where it belongs).
  - Optionally filter `AuraTrade monthly` to `project=auratrade` (activate the cost
    allocation tag first) and raise the account-wide $20 budget.
  - Optionally attach `infra/aws/tenfold-deny-auratrade.json` to `TenFold`.
  - Consider deactivating the `focus-halo-deploy` access key.
  - Change the app password when convenient (`deploy/set-user.mjs`).
- **Next action:** none blocking. Future deploys: `scripts/deploy.ps1`.

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
