# T02: Implement cross-linking helpers and wire into PR body composition

**Slice:** S06
**Milestone:** M003

## Goal
Create the pure cross-linking helpers and extend `composePRBody` to accept Linear references.

## Must-Haves

### Truths
- `shouldCrossLink()` returns true only when both `pr.linear_link` and `workflow.mode: linear`
- `buildLinearReferencesSection()` produces valid markdown with `Closes` prefix
- `composePRBody` appends a `## Linear Issues` section when `linearReferences` is provided
- `composePRBody` output is unchanged when `linearReferences` is undefined or empty

### Artifacts
- `src/resources/extensions/kata/linear-crosslink.ts` — pure helpers (min 50 lines)
- `src/resources/extensions/pr-lifecycle/pr-body-composer.ts` — extended with `linearReferences` parameter

### Key Links
- `linear-crosslink.ts` → `linear/linear-client.ts` via import (for type references)
- `pr-body-composer.ts` ← `linear-crosslink.ts` (composer receives pre-built references)

## Steps
1. Create `linear-crosslink.ts` with `shouldCrossLink`, `buildLinearReferencesSection`, `postPrLinkComment`, `advanceSliceIssueState`
2. Extend `composePRBody` signature to accept `linearReferences?: string[]`
3. When `linearReferences` has entries, append `## Linear Issues` section
4. Make T01 tests pass
5. Verify existing pr-body-composer tests still pass

## Context
- All Linear API calls are best-effort (catch errors, return structured result)
- `postPrLinkComment` uses `LinearClient.graphql()` to create a comment
- `advanceSliceIssueState` uses existing workflow state resolution pattern from `linear-state.ts`
