Review the current state of the AuraTrade project and update STATUS.md, PLAN.md, and CLAUDE.md as needed so Codex and Claude stay aligned on the same project truth. Follow these steps precisely:

## Step 1 - Gather current state

Run these in parallel:
- `git log --oneline -20` - recent commits
- `git status` - any uncommitted changes
- Read `STATUS.md`
- Read `PLAN.md`
- Read `CLAUDE.md`

Also read any source files that have changed recently (from git log) to understand what was actually built.

## Step 2 - Update STATUS.md

STATUS.md needs updating when any of these are true:
- A phase was completed since the last update
- A significant sub-task or bug fix was completed
- A new architectural decision was made
- The "Where We Stopped" section is stale

Rules:
- Mark phases `Done` only when all their deliverables are confirmed built and working
- Add a dated row to the Decisions & Notes Log for any new architectural choices, format discoveries, or bug fixes
- Update "Where We Stopped" to reflect the most recent meaningful state
- Update "Current Phase" and "Next:" pointer
- Do not add speculative notes - only record what actually happened

## Step 3 - Update PLAN.md

PLAN.md needs updating when:
- A phase's implementation details turned out different from the plan
- New phases or sub-phases were added
- Formulas or schema were revised based on real data

Rules:
- PLAN.md is a living spec, not a changelog - rewrite sections to reflect current truth
- Do not add "as of date X we changed this" annotations - just update the content
- Preserve the formula verification sections from `CLAUDE.md`

## Step 4 - Update CLAUDE.md

CLAUDE.md needs updating when:
- A new standing rule should be added based on lessons learned
- A tech decision was revisited
- A key file location changed or was added
- The commission formula or other financial facts were confirmed or corrected

Rules:
- Standing rules are non-negotiable constraints - add new ones sparingly, only for things that burned the project
- Do not remove existing rules unless they are provably wrong
- Keep the file concise - this is loaded frequently

## Step 5 - Commit if changes were made

If any of the three files were modified, create a single git commit:
`docs: sync STATUS/PLAN/CLAUDE to reflect current project state`

Report back with a short summary of what changed in each file and why.
