## Change
Describe the problem and resulting behavior.

## Verification
- [ ] Relevant tests, lint, typing, build and browser flows pass.
- [ ] Money/data boundaries reviewed: formulas shown and tested, fees read from the broker file, `@db.Decimal` for money, every API query scoped by `userId`, no destructive migration without backup, no secrets or account numbers.
- [ ] STATUS.md and affected documentation updated.
- [ ] `scripts/cross-review.ps1 -Number <this PR>` run, with zero blocking findings on
      the current head (see AGENTS.md "Cross-model code review"). N/A only if every
      commit here is human-authored with no AI Co-Authored-By trailer.

## Limitations
State unimplemented behavior and external prerequisites explicitly.
