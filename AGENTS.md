# AuraTrade Agent Coordination

This file is the shared coordination guide for Codex and Claude working in this repository.

## Source Of Truth

Read these first at the start of any meaningful task:
- `CLAUDE.md` - project-specific rules, constraints, and key file map
- `PLAN.md` - living implementation spec and build order
- `STATUS.md` - current state, completed phases, pending actions, and next target

If this file conflicts with `CLAUDE.md` on product or implementation details, follow `CLAUDE.md`.

## Roles

- `CLAUDE.md` is the project spec and standing-rules document
- `PLAN.md` is the current intended implementation plan
- `STATUS.md` is the current execution snapshot
- `AGENTS.md` is the collaboration contract for shared agent behavior

## Shared Working Rules

- Do not guess project state from docs alone. Verify against the code before updating docs.
- Do not overwrite or revert user changes unless explicitly asked.
- Keep changes scoped. If you notice unrelated problems, mention them separately instead of folding them into the current task.
- Before making architecture or workflow changes, check whether they should also be reflected in `CLAUDE.md`, `PLAN.md`, or `STATUS.md`.
- Prefer updating docs in the same task when the code materially changes project reality.
- Do not treat a meaningful feature, bug fix, or phase as done until both tester and reviewer duties are completed, or the missing verification is explicitly called out.

## Coordination Workflow

When starting work:
- Read `CLAUDE.md`, `PLAN.md`, and `STATUS.md`
- Check `git status`
- Inspect the files relevant to the task before proposing or making changes

When finishing work:
- Update `STATUS.md` if a phase, meaningful sub-task, or important decision changed
- Update `PLAN.md` if the real implementation diverged from the planned spec
- Update `CLAUDE.md` only when a standing rule, tech decision, or key file map changed
- Report any build, lint, test, or runtime blockers that remain

## Local Agent Tooling

Local agent command files may exist in agent-specific config folders, but they are intentionally
kept out of git. Do not rely on repo-committed command files as the source of truth.

If local command workflows are updated, mirror them across agents outside the repo and keep this
file focused on the shared process rather than local tooling paths.

## Peer Review Workflow

Use a two-agent workflow for non-trivial work when possible:
- Builder agent: implements the change, runs checks, and prepares a concise handoff
- Reviewer agent: performs an independent review of the diff and changed files, with findings first
- Tester agent: runs the relevant local verification, prioritizing Playwright for user-facing flows and targeted type/lint/test checks for the touched code

Rules:
- The reviewer should not be primed with the intended answer or a desired approval outcome
- The reviewer should focus on bugs, regressions, auth/data-scope mistakes, missing tests, broken navigation, and stale docs
- The tester should choose the smallest test scope that still proves the change works, then expand if the change is risky
- The builder should address findings, rerun relevant checks, and only then treat the work as ready
- If true subagents are unavailable, emulate this with a fresh agent/chat using the same handoff notes

## Doc Sync Commands

Use the matching command file for doc synchronization:
- Claude: `.claude/commands/sync-docs.md`
- Codex: `.codex/commands/sync-docs.md`

These command files should stay functionally aligned so both agents maintain the same project truth.

## Handoff Notes

When handing off between agents, include:
- what changed
- what was verified
- what is still broken or unverified
- what the next recommended step is

Prefer concrete references to files, routes, commands, and exact blockers over general summaries.
