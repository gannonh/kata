# T03: Wire cross-linking into PR creation and merge tool handlers

**Slice:** S06
**Milestone:** M003

## Goal
Connect the cross-linking helpers to the actual PR lifecycle tools and update docs/status surfaces.

## Must-Haves

### Truths
- `kata_create_pr` return value includes `linearComment: "added" | "failed" | "skipped"`
- `kata_merge_pr` return value includes `linearStateAdvance: "done" | "failed" | "skipped"`
- `/kata pr status` output includes `linear_link` line
- Linear API failures don't block PR creation or merge
- Preference docs no longer say "pending S06"

### Artifacts
- `src/resources/extensions/pr-lifecycle/index.ts` — updated `kata_create_pr` and `kata_merge_pr` handlers
- `src/resources/extensions/kata/pr-command.ts` — `buildPrStatusReport` includes `linear_link`
- `src/resources/extensions/kata/docs/preferences-reference.md` — S06 pending note removed
- `src/resources/extensions/kata/templates/preferences.md` — S06 pending note removed

### Key Links
- `pr-lifecycle/index.ts` → `kata/linear-crosslink.ts` via import
- `pr-lifecycle/index.ts` → `kata/linear-config.ts` via import (for `isLinearMode`)
- `pr-command.ts` → `kata/preferences.ts` via import (for `linear_link` field)

## Steps
1. In `kata_create_pr` handler: check `shouldCrossLink`, resolve identifiers, pass to `composePRBody`, call `postPrLinkComment` after success
2. In `kata_merge_pr` handler: check `shouldCrossLink`, call `advanceSliceIssueState` after merge
3. Add `linear_link` status line to `buildPrStatusReport`
4. Remove "pending S06" notes from docs and templates
5. Verify all tests pass and extensions load

## Context
- Cross-linking calls happen after the primary PR operation succeeds
- Structured return fields let the agent see what happened without parsing prose
- `PrStatusDependencies` may need a new accessor for `linear_link` + `workflow.mode`
