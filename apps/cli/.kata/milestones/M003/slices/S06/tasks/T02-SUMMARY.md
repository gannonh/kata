---
id: T02
parent: S06
milestone: M003
provides:
  - shouldCrossLink() gate — true only when pr.linear_link AND workflow mode is linear
  - buildLinearReferencesSection() — markdown section with Closes lines
  - resolveSliceLinearIdentifier() — queries Linear for slice issue by title pattern
  - postPrLinkComment() — best-effort comment on Linear issue with PR URL
  - advanceSliceIssueState() — best-effort advance to completed workflow state
  - composePRBody extended with optional linearReferences parameter
key_files:
  - src/resources/extensions/kata/linear-crosslink.ts
  - src/resources/extensions/pr-lifecycle/pr-body-composer.ts
key_decisions:
  - "All Linear API helpers are best-effort — catch errors, return structured {ok, error}, never throw"
  - "composePRBody uses options object pattern for backward-compatible extension"
  - "resolveSliceLinearIdentifier matches by [S01] or S01: pattern in issue title"
duration: 25min
verification_result: pass
completed_at: 2026-03-13T12:40:00Z
---

# T02: Implement cross-linking helpers and wire into PR body composition

**Pure cross-linking helpers with best-effort Linear API calls and backward-compatible composePRBody extension — 12/12 tests pass**

## What Happened

Created `linear-crosslink.ts` with five exported functions: `shouldCrossLink` (gate), `buildLinearReferencesSection` (markdown formatter), `resolveSliceLinearIdentifier` (GraphQL query for slice issue matching), `postPrLinkComment` (creates Linear comment with PR URL), and `advanceSliceIssueState` (resolves completed workflow state and updates issue). Extended `composePRBody` with an optional `ComposePRBodyOptions` parameter containing `linearReferences` — when provided, appends a `## Linear Issues` section. All existing pr-body-composer tests pass unchanged.

## Deviations
None.

## Files Created/Modified
- `src/resources/extensions/kata/linear-crosslink.ts` — 5 exported helpers
- `src/resources/extensions/pr-lifecycle/pr-body-composer.ts` — extended with linearReferences option
