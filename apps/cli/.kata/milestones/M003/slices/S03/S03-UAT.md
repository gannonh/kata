# S03: Address Review Comments — UAT

**Milestone:** M003
**Written:** 2026-03-13

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S03's proof level is "contract" — the slice plan explicitly states "Real runtime required: no" and "Human/UAT required: no". The `summarizeComments` function is fully unit-tested. The GraphQL mutation wrappers (`resolveThread`, `replyToThread`) follow the same pattern as `kata_create_pr`'s `create_pr_safe.py` invocation, which was proven at contract level in S01. Live GitHub calls are integration-only verification, deferred to S05 operational verification.

## Preconditions

- `npm test` passes (112/112)
- `npx tsc --noEmit` exits 0
- Extension loads: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` prints `ok`

## Smoke Test

Run `grep -c '"kata_fetch_pr_comments"\|"kata_resolve_thread"\|"kata_reply_to_thread"' src/resources/extensions/pr-lifecycle/index.ts` → must output `3`. This confirms all three tools are registered and the extension compiles.

## Test Cases

### 1. summarizeComments — empty input

1. Run: `npm test -- --test-name-pattern "summarizeComments returns empty"`
2. **Expected:** 1 test passes — `totalCount === 0`, `actionableCount === 0`, `numbered.length === 0`

### 2. summarizeComments — resolved thread excluded from actionableCount

1. Run: `npm test -- --test-name-pattern "resolved thread"`
2. **Expected:** 1 test passes — entry present in `numbered` with `isResolved: true`; `actionableCount === 0`

### 3. summarizeComments — outdated thread excluded from actionableCount

1. Run: `npm test -- --test-name-pattern "outdated thread"`
2. **Expected:** 1 test passes — entry present in `numbered` with `isOutdated: true`; `actionableCount === 0`

### 4. summarizeComments — sequential numbering across mixed types

1. Run: `npm test -- --test-name-pattern "sequential n"`
2. **Expected:** 1 test passes — `numbered[0].n === 1` (conversation), `numbered[1].n === 2` (review), `numbered[2].n === 3` (unresolved thread); `totalCount === 3`; `actionableCount === 1`

### 5. Full test suite — no regressions

1. Run: `npm test`
2. **Expected:** 112 tests, 112 pass, 0 fail

### 6. TypeScript compilation clean

1. Run: `npx tsc --noEmit`
2. **Expected:** exits 0, no output

### 7. Tool registrations confirmed

1. Run: `grep -n '"kata_fetch_pr_comments"\|"kata_resolve_thread"\|"kata_reply_to_thread"' src/resources/extensions/pr-lifecycle/index.ts`
2. **Expected:** 3 lines printed (one per tool's `name:` property)

## Edge Cases

### kata_fetch_pr_comments gh-missing phase

1. Inspect `index.ts` `kata_fetch_pr_comments` handler — first pre-flight calls `isGhInstalled()`
2. **Expected:** returns `{ ok: false, phase: "gh-missing", error: …, hint: "Install gh CLI…" }` when gh is absent

### kata_resolve_thread gh-unauth phase

1. Inspect `index.ts` `kata_resolve_thread` handler — second pre-flight calls `isGhAuthenticated()`
2. **Expected:** returns `{ ok: false, phase: "gh-unauth", error: …, hint: "Run gh auth login" }` when not authenticated

### replyToThread temp file cleanup

1. Inspect `pr-address-utils.ts` `replyToThread` function
2. **Expected:** `fs.unlinkSync(tmpPath)` is called in a `finally` block — cleanup occurs even if the `gh api graphql` command throws

## Failure Signals

- Any `npm test` failure (especially in `pr-address.test.ts`) indicates `summarizeComments` contract regression
- `npx tsc --noEmit` with output indicates type errors introduced in `pr-address-utils.ts` or `index.ts` imports
- Extension load failing (no `ok` output) indicates a runtime import error in the new module
- `grep -c` returning less than 3 indicates missing tool registrations

## Requirements Proved By This UAT

- R202 — Contract-level proof that the comment-addressing tool surface works: `summarizeComments` correctly numbers, filters, and classifies all three PR comment types; `kata_fetch_pr_comments` has correct pre-flight chain; `kata_resolve_thread` and `kata_reply_to_thread` are registered with correct params and delegate to mutation wrappers. 4/4 unit tests pass; TypeScript clean; extension loads.

## Not Proven By This UAT

- Live GitHub API calls — `kata_fetch_pr_comments` calling real `fetch_comments.py` against a real GitHub PR; `kata_resolve_thread` invoking `gh api graphql resolveReviewThread`; `kata_reply_to_thread` posting a real reply. These require a real open PR and authenticated `gh` session — deferred to S05 operational verification.
- `/kata pr address` command surface — the user-facing command entry point is not yet wired; deferred to S05.
- `resource-loader.ts` cpSync of the `scripts/` subdirectory — verified manually in S01; S05 must confirm it works post-install for `kata_fetch_pr_comments`.

## Notes for Tester

- All 4 `summarizeComments` test names contain distinctive keywords; use `--test-name-pattern` to run them individually.
- The pre-existing smoke test (`kata launches and loads extensions without errors`) validates the full extension bundle loads — its presence in the passing suite is implicit confirmation that `pr-address-utils.ts` imports cleanly.
- `replyToThread` and `resolveThread` have no unit tests — they are thin wrappers over `gh api graphql` and are integration-only. Trust the contract tests for `summarizeComments` and the TypeScript types for the wrappers.
