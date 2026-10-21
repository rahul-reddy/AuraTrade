# Security

Report vulnerabilities privately through GitHub's **Security → Report a
vulnerability** when available. Do not post credentials, statements or private
financial data in an issue, PR, Actions log or AI review prompt.

The owner may switch this repository between public and private for Actions
usage. Treat all committed files and workflow output as public in either state.
Making the repository private does not recall earlier clones, forks or logs.

CI rejects tracked private file categories and scans full Git history with a
version- and checksum-pinned Gitleaks binary, including documentation-only changes.
These checks run inside `Verify AuraTrade` and require no paid scanning service or
organization license. Synthetic fixtures belong under `playwright/fixtures/`.
Keep real statements under ignored `documents/`; runtime secrets stay in ignored
environment files or GitHub Actions secrets, never image build arguments.
Docker context and standalone tracing also exclude private files; CI checks the
built standalone bundle before running browser tests.
Next.js deliberately copies local `.env` files into standalone output even when
they are excluded from tracing. Do not distribute local standalone bundles:
hosted builds use a clean Git checkout without environment files, and the bundle
check rejects copied environment files. Runtime configuration is supplied by the
server. Docker also excludes local validation builds and AI-tool directories.
Production builds explicitly use Webpack because the tested Turbopack path does
not apply instrumentation tracing exclusions. The CI canaries protect this
boundary when changing bundlers or upgrading Next.js.

The owner enables GitHub secret scanning, push protection, Dependabot alerts and
security updates where the plan and visibility support them. Native secret
scanning may be unavailable while private; the CI scanner remains mandatory.
Dependency advisories remain visible without automatically forcing major-version
migrations. Review and test security updates before merging.

`main` requires a PR and `Verify AuraTrade`, linear history, and disallows force
pushes and deletion. No separate approving GitHub review or merge queue is
required: independent AI approvals are SHA-bound comments published by the
owner's authenticated account and enforced by
`scripts/merge-pr.ps1`, not formal GitHub approving reviews. Always use that script.
Private branch-rule enforcement requires an eligible GitHub plan; after switching
visibility, verify enforcement and native scanning in repository Settings. Local
review/merge guards and CI remain in place but cannot replace server enforcement.

If sensitive data was committed, stop adding copies and rotate exposed
credentials first. History cleanup changes commit SHAs and must be coordinated
separately with open PRs, other clones, CI/review evidence and deployment revision
references. A normal deletion commit does not remove historical data. Never
force-push `main` as part of ordinary maintenance.

On 2026-10-21 the owner authorized a one-time history rewrite to remove real
broker statements. All nine published branches were rewritten; their tip file
trees were preserved. The three local worktrees were moved onto sanitized
history, and force-push protection was restored immediately. Old commit IDs in
earlier release/review records refer to the history before this cleanup.

For any other checkout created before this cleanup, preserve uncommitted work
privately and use a fresh clone. Do not merge or push an old branch into the
rewritten history: that can republish the removed records. Reapply only reviewed
changes onto the new base. Private local backups/reflogs may retain old objects;
do not publish them. GitHub PR refs and cached commit views need a separate
GitHub Support purge; rewriting branch history alone does not remove those
copies. The private support-request draft is prepared but has not been sent.
