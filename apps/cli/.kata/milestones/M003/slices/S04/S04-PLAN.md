# S04: Merge & Slice Completion

**Goal:** Deliver a `kata_merge_pr` tool that runs CI checks, squash-merges the PR on GitHub, cleans up the branch locally, and marks the slice done in roadmap.md — closing the PR lifecycle loop from open PR to completed slice.

**Demo:** Agent calls `kata_merge_pr` on the current slice branch; the tool validates CI, calls `gh pr merge --squash`, deletes local and remote branch, flips the slice's `- [ ]` checkbox to `- [x]` in roadmap.md, and returns `{ ok: true, url, branch, milestoneId, sliceId }`.

## Must-Haves

- `kata_merge_pr`: pre-flights gh, auth; detects PR number via `gh pr view`; validates CI via `gh pr checks`; merges via `gh pr merge --squash --delete-branch`; syncs local repo; updates roadmap.md checkbox; returns structured result
- `parseCIChecks`: pure function; empty=allPassing; failure conclusion→failing[]; non-completed status→pending[]; invalid JSON→fail-closed
- `updateSliceInRoadmap`: pure string transform; `^` + `m` anchored regex; no-op when already done
- `markSliceDoneInRoadmap`: reads/writes `.kata/milestones/<M>/M-ROADMAP.md`; returns boolean, never throws
- All tools registered in `index.ts`; TypeScript clean (`npx tsc --noEmit` exits 0); all prior tests still pass

## Proof Level

- This slice proves: contract
- Real runtime required: no (unit tests cover parseCIChecks and updateSliceInRoadmap; merge + sync are integration-only)
- Human/UAT required: no

## Verification

- `npm test` → 112 pass, 0 fail (7 new tests in `pr-merge.test.ts` on top of existing 105)
- `npx tsc --noEmit` → exits 0, no errors
- `grep -n "kata_merge_pr" src/resources/extensions/pr-lifecycle/index.ts` → prints 2+ lines (description comment + name property)
- `grep -n "kata_merge_pr" src/resources/extensions/pr-lifecycle/index.ts | wc -l` → ≥ 2
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` → prints `ok` (extension loads without error)
- All 7 pr-merge tests pass: 4 for `parseCIChecks` (empty, all-success, one-failing, one-pending) + 3 for `updateSliceInRoadmap` (flips target, ignores others, no-op when already done)

## Observability / Diagnostics

- Runtime signals: `kata_merge_pr` returns structured `{ ok, phase, error, hint }` — the `phase` field covers every failure mode without prose parsing; callers branch on `phase` for remediation
- Inspection surfaces: `gh pr checks <number>` for live CI status; `grep '\[x\]\|\ [ \]' .kata/milestones/M003/M003-ROADMAP.md` for roadmap state; `git log --oneline main` to confirm squash commit appeared
- Failure visibility: `phase` enum (`gh-missing` | `gh-unauth` | `pr-detect-failed` | `ci-failing` | `ci-pending` | `merge-failed` | `branch-parse-failed`); `error` carries raw `gh` stderr on merge failures; `hint` maps each phase to the specific remediation
- Redaction constraints: no secrets in tool return values; `gh` stderr may contain repo URLs — acceptable

## Tasks

- [x] **T01: Write failing tests for `pr-merge-utils.ts`** `est:20m`
  - Files: `src/resources/extensions/kata/tests/pr-merge.test.ts`
  - Done: 7 unit tests for parseCIChecks (4) and updateSliceInRoadmap (3); TDD gate works

- [x] **T02: Implement `pr-merge-utils.ts`** `est:45m`
  - Files: `src/resources/extensions/pr-lifecycle/pr-merge-utils.ts`
  - Done: 9 exports, 112/112 tests pass, TypeScript clean

- [x] **T03: Register `kata_merge_pr` tool in `index.ts`** `est:30m`
  - Files: `src/resources/extensions/pr-lifecycle/index.ts`
  - Done: tool registered with 8-phase handler; TypeScript clean; 112/112 tests pass

## Files Likely Touched

- `src/resources/extensions/pr-lifecycle/pr-merge-utils.ts` (new)
- `src/resources/extensions/kata/tests/pr-merge.test.ts` (new)
- `src/resources/extensions/pr-lifecycle/index.ts` (modified — import + kata_merge_pr registration)
