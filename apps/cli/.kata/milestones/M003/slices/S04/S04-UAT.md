# S04: Merge & Slice Completion — UAT

**Milestone:** M003
**Written:** 2026-03-13

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S04 only claims contract proof. The meaningful acceptance signal is that the merge tool, CI parser, and roadmap mutation helpers exist, are wired, and pass their targeted tests.

## Preconditions

- Repository is on the S04 branch with the completed artifacts present
- Node/TypeScript test environment is available
- No live GitHub mutation is required for this UAT pass

## Smoke Test

Run `npm test -- --test-name-pattern "pr-merge"` and confirm all 7 `pr-merge` tests pass.

## Test Cases

### 1. Validate CI parsing behavior

1. Run `npm test -- --test-name-pattern "parseCIChecks"`.
2. Confirm the test output includes the empty-array, all-success, failing-check, and pending-check cases.
3. **Expected:** all `parseCIChecks` assertions pass, proving the helper classifies CI results correctly.

### 2. Validate roadmap completion wiring

1. Run `npm test -- --test-name-pattern "updateSliceInRoadmap"`.
2. Open `src/resources/extensions/pr-lifecycle/pr-merge-utils.ts` and confirm `updateSliceInRoadmap()` uses an anchored multiline regex.
3. **Expected:** the helper flips only the targeted slice checkbox, leaves others untouched, and no-ops when the slice is already done.

### 3. Confirm the merge tool is wired into the extension

1. Run `grep -n "kata_merge_pr" src/resources/extensions/pr-lifecycle/index.ts`.
2. Run `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"`.
3. **Expected:** grep finds the tool registration and the extension import prints `ok`.

## Edge Cases

### No CI configured for the repo

1. Inspect `kata_merge_pr` and `pr-merge-utils.ts`.
2. Confirm the handler treats `gh pr checks` exec failures as "allow merge" while `parseCIChecks()` itself still fails closed on invalid JSON.
3. **Expected:** the no-CI case is an explicit policy choice, not an accidental silent pass.

## Failure Signals

- `npm test` reports any failing `pr-merge` tests
- `npx tsc --noEmit` reports type errors in `pr-merge-utils.ts` or `index.ts`
- `kata_merge_pr` is missing from `index.ts`
- Extension import fails instead of printing `ok`

## Requirements Proved By This UAT

- none — this UAT proves artifact and contract integrity only; it does not validate R203 as a live GitHub merge workflow.

## Not Proven By This UAT

- Live `gh pr merge` execution against a real GitHub PR
- Remote branch deletion and local sync behavior against a real origin
- User-facing `/kata pr merge` command routing or the broader PR lifecycle loop

## Notes for Tester

This UAT is intentionally narrow. If you need confidence in real merge behavior, run a separate live GitHub smoke test after S05 wires the command surface and auto-mode behavior around the merge tool.
