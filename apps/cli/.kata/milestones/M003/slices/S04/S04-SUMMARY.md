---
id: S04
parent: M003
milestone: M003
provides:
  - kata_merge_pr tool with CI gating, merge strategy selection, local branch cleanup, and roadmap checkbox update
  - pr-merge-utils.ts with parseCIChecks, getPRNumber, mergeGitHubPR, syncLocalAfterMerge, updateSliceInRoadmap, and markSliceDoneInRoadmap
  - pr-merge.test.ts with 7 contract tests covering CI parsing and roadmap mutation behavior
requires:
  - slice: S01
    provides: gh-utils.ts pre-flight helpers and the pr-lifecycle extension scaffold
affects:
  - S05
key_files:
  - src/resources/extensions/pr-lifecycle/pr-merge-utils.ts
  - src/resources/extensions/pr-lifecycle/index.ts
  - src/resources/extensions/kata/tests/pr-merge.test.ts
key_decisions:
  - D046 — updateSliceInRoadmap uses ^ + m anchored regex rather than relying on a missing formatter helper
  - D047 — parseCIChecks fails closed on invalid JSON, while gh pr checks exec failures in the tool handler are treated as no-CI / allow-merge
patterns_established:
  - kata_merge_pr follows the same structured phase return pattern as the other pr-lifecycle tools
  - roadmap checkbox updates are isolated in a pure string transform before filesystem writes
  - local post-merge sync is best-effort and never blocks the success return path
observability_surfaces:
  - kata_merge_pr phase enum (gh-missing, gh-unauth, branch-parse-failed, pr-detect-failed, ci-failing, ci-pending, merge-failed)
  - roadmapUpdateFailed: true success flag for non-fatal state divergence after merge
  - gh pr checks <number> and the roadmap checkbox state are the canonical diagnostics
drill_down_paths:
  - .kata/milestones/M003/slices/S04/tasks/T01-SUMMARY.md
  - .kata/milestones/M003/slices/S04/tasks/T02-SUMMARY.md
  - .kata/milestones/M003/slices/S04/tasks/T03-SUMMARY.md
duration: ~1h
verification_result: passed
completed_at: 2026-03-13
---

# S04: Merge & Slice Completion

**Shipped a contract-complete merge tool that validates CI, merges the active PR through gh, cleans up the local branch state, and updates the roadmap via explicit slice-completion wiring.**

## What Happened

S04 closed the PR lifecycle loop at the tool-contract level.

T01 established the public contract with `pr-merge.test.ts`, pinning 7 behaviors before implementation: 4 tests for `parseCIChecks` and 3 tests for `updateSliceInRoadmap`. That gave the slice a hard stopping condition before any merge code existed.

T02 implemented `pr-merge-utils.ts` as the deterministic seam for merge behavior. The module now owns CI status parsing, PR number detection, the actual `gh pr merge` wrapper, best-effort local sync back to the default branch, and the roadmap checkbox mutation helpers. Two structural decisions mattered here: use an anchored regex for roadmap updates (D046), and fail closed on invalid CI JSON while still allowing the tool handler to treat `gh pr checks` exec failures as "no CI configured" rather than a blocker (D047).

T03 registered `kata_merge_pr` in `pr-lifecycle/index.ts` and wired the full eight-phase handler: gh pre-flight, branch parsing, PR detection, CI gating, merge, local sync, roadmap update, and structured success/failure return values. The tool returns explicit phase codes plus raw gh stderr on merge failures, which keeps the merge path inspectable for future agents.

## Verification

- `npm test` → 112/112 pass, including the 7 new pr-merge tests
- `npx tsc --noEmit` → exits 0
- `grep -n "kata_merge_pr" src/resources/extensions/pr-lifecycle/index.ts` → tool registration present
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` → extension loads cleanly

## Requirements Advanced

- R203 — delivered the merge/slice-completion tool surface at contract level: CI parsing, merge orchestration, branch cleanup, and roadmap update behavior all shipped and are test-covered.

## Requirements Validated

- none — live GitHub merge execution and end-to-end slice completion through the user-facing command surface remain outside this slice's proof level.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- T01–T03 were effectively finished in one execution pass because the branch did not yet contain the earlier planned artifacts. The final delivered shape still matches the slice plan's intent and verification targets.

## Known Limitations

- S04 proves the merge workflow at contract level only. It does not yet prove a live `gh pr merge` round-trip against a real GitHub PR.
- Auto-mode in `kata/auto.ts` still squash-merges completed slice branches directly to main after `complete-slice`. That bypasses the PR lifecycle and must be gated in S05 when PR auto-create is enabled.
- The user-facing `/kata pr merge` command surface is not present yet; only the underlying tool is registered.

## Follow-ups

- S05 must add `/kata pr` command routing so users can invoke create/review/address/merge/status from one entry point.
- S05 must gate auto-mode's post-complete-slice squash merge when `pr.enabled && pr.auto_create` is on.
- S05 should expose a deterministic PR status surface so users and future agents can inspect whether a slice is waiting for PR creation, review, or merge.

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/pr-merge-utils.ts` — deterministic merge helpers and roadmap mutation utilities
- `src/resources/extensions/pr-lifecycle/index.ts` — `kata_merge_pr` tool registration and phase-based handler
- `src/resources/extensions/kata/tests/pr-merge.test.ts` — contract tests for CI parsing and roadmap checkbox updates

## Forward Intelligence

### What the next slice should know
- `kata_merge_pr` already returns machine-readable failure phases and a non-fatal `roadmapUpdateFailed` flag. Reuse that shape instead of inventing a parallel status model.
- The biggest remaining integration gap is not the merge tool itself — it is the command/onboarding/auto-mode wiring around it.

### What's fragile
- `auto.ts` currently assumes that a completed slice should be squash-merged to main immediately. That assumption conflicts with D014's PR-first workflow and is the main place S05 can accidentally re-bypass the PR lifecycle.

### Authoritative diagnostics
- `kata_merge_pr` result payload is the first place to look for merge failures; the `phase` field is more trustworthy than parsing console text.
- `.kata/milestones/M003/M003-ROADMAP.md` is the durable source for whether the slice checkbox actually flipped.

### What assumptions changed
- Earlier slice notes assumed script syncing might be missing. The broader extension directory sync already handles nested files; the real S05 work is orchestration, not copy logic.
- Merge completion is no longer the same thing as slice completion in the intended PR workflow; S05 must enforce that distinction in the user-facing loop.
