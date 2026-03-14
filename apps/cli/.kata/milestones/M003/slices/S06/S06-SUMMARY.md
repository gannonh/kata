---
id: S06
milestone: M003
provides:
  - shouldCrossLink() gate — true only when pr.linear_link AND linear mode
  - buildLinearReferencesSection() — markdown section with Closes KAT-N lines
  - resolveSliceLinearIdentifier() — finds active slice issue in Linear by title pattern
  - postPrLinkComment() — posts PR URL as comment on Linear issue
  - advanceSliceIssueState() — advances issue to completed workflow state
  - composePRBody extended with optional linearReferences parameter
  - kata_create_pr resolves Linear identifier → injects into body → posts comment
  - kata_merge_pr advances slice Linear issue to done after merge
  - /kata pr status includes linear_link status line
  - PrStatusDependencies extended with optional getLinearLinkStatus accessor
slices_complete: [S01, S02, S03, S04, S05, S06]
key_files:
  - src/resources/extensions/kata/linear-crosslink.ts
  - src/resources/extensions/pr-lifecycle/pr-body-composer.ts
  - src/resources/extensions/pr-lifecycle/pr-runner.ts
  - src/resources/extensions/pr-lifecycle/index.ts
  - src/resources/extensions/kata/pr-command.ts
  - src/resources/extensions/kata/commands.ts
key_decisions:
  - "D053: Linear cross-linking is best-effort — failures reported in structured return values, never block PR operations"
  - "D054: PrStatusDependencies.getLinearLinkStatus is optional — backward-compatible"
patterns_established:
  - "Best-effort cross-service integration: catch errors, return structured {ok, error}, include status in tool return"
  - "Optional options parameter for backward-compatible function extension (ComposePRBodyOptions)"
observability_surfaces:
  - "/kata pr status — linear_link: active | disabled | requires linear mode"
  - "kata_create_pr return — linearComment: added | failed | skipped"
  - "kata_merge_pr return — linearStateAdvance: done | failed | skipped"
drill_down_paths:
  - .kata/milestones/M003/slices/S06/tasks/T01-SUMMARY.md
  - .kata/milestones/M003/slices/S06/tasks/T02-SUMMARY.md
  - .kata/milestones/M003/slices/S06/tasks/T03-SUMMARY.md
verification_result: passed
completed_at: 2026-03-13T12:55:00Z
proof_level: contract + integration (unit tests for pure logic; tool loads, TypeScript compiles, 158/158 tests pass)
---

# S06: Linear Cross-linking

**Linear issue references in PR bodies, PR URL comments on Linear issues, state advance on merge — 158/158 tests pass, TypeScript clean.**

## What Was Delivered

S06 completes M003 by wiring Linear and GitHub PR lifecycle together.

**T01** established 12 test cases covering the cross-linking gate, reference formatting, and composePRBody integration.

**T02** built the core helpers: `shouldCrossLink` (gate that requires both `pr.linear_link: true` and `workflow.mode: linear`), `buildLinearReferencesSection` (markdown formatter), `resolveSliceLinearIdentifier` (GraphQL query matching slice by title pattern), `postPrLinkComment` (creates comment with PR URL), and `advanceSliceIssueState` (resolves completed state and updates issue). Extended `composePRBody` with an optional `linearReferences` parameter.

**T03** wired everything into the PR tool handlers: `kata_create_pr` resolves the slice's Linear identifier, includes it in the PR body, and posts a comment after creation. `kata_merge_pr` advances the slice issue to done after merge. Both operations are best-effort — structured return values report success/failure without blocking the primary operation. Updated `/kata pr status` to show `linear_link` configuration state and removed all "pending S06" notes from docs.
