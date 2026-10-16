---
name: auratrade-change-workflow
description: Implement, verify, review, and hand off code or documentation changes in the AuraTrade repository. Use for AuraTrade development work that should follow its branch, testing, status, cross-model review, and guarded-merge workflow; do not use for trading advice or ordinary questions about the project.
---

# AuraTrade change workflow

Read `AGENTS.md`, `CLAUDE.md`, `docs/PLAN.md`, and the current handoff at the top of `STATUS.md` before changing behavior. Treat the user's current instruction as authoritative within the boundaries in `AGENTS.md`.

Use a focused `feat/`, `fix/`, or `docs/` branch. Inspect the worktree before editing and preserve unrelated changes. When multiple agents work concurrently, declare file ownership before editing shared files.

Keep financial calculations deterministic and explained: show a formula before implementing it, read fees from the broker file instead of deriving them, store money as `@db.Decimal`, and scope every API query by the signed-in user. Changes to P&L, fees, ledger, import or auth behavior need boundary tests; UI flows need a real Playwright test.

Run checks that cover the changed behavior, then the repository-required lint, types, tests, build and browser tests when the change is ready. Do not claim a check passed unless it ran on the current revision. For harness changes, run:

```powershell
pwsh -NoProfile -File scripts/cross-review-selftest.ps1
uv run --no-project --with pyyaml python scripts/validate_skills.py
```

Update the current handoff in `STATUS.md` with the exact revision tested, commands run, results, limitations, and next action. Keep historical narrative below the handoff.

AI-authored commits must carry the appropriate `Co-Authored-By` trailer. When delivery is in scope, open a PR, wait for CI on the final head, run `scripts/cross-review.ps1 -Number <PR>`, address or rebut every blocking finding, and use `scripts/merge-pr.ps1 -Number <PR>` so the reviewed SHA and successful CI are enforced.
