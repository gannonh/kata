---
estimated_steps: 5
estimated_files: 5
---

# T02: Extract shared PR status and orchestration helpers

**Slice:** S05 — Preferences, Onboarding & `/kata pr` Command
**Milestone:** M003

## Description

Create the deterministic seam that both the slash command and auto-mode can share. This task extracts PR creation orchestration out of the tool entry point and introduces reusable status / decision helpers that make the T01 tests pass.

## Steps

1. Add `src/resources/extensions/kata/pr-command.ts` with pure helpers for `/kata pr` subcommand completions, status gathering, and status formatting.
2. Add `src/resources/extensions/kata/pr-auto.ts` with pure helpers describing what should happen after `complete-slice` given branch context, PR preferences, and create-PR results.
3. Extract the current PR creation implementation from `src/resources/extensions/pr-lifecycle/index.ts` into `src/resources/extensions/pr-lifecycle/pr-runner.ts`, preserving the exact structured `{ ok, phase, error, hint, url }` contract from S01.
4. Refactor `kata_create_pr` in `index.ts` to call the shared runner instead of owning the full flow inline, while reusing existing `gh-utils.ts` behavior rather than duplicating shell logic.
5. Make the new T01 tests pass without regressing the existing S01–S04 pr-lifecycle tests.

## Must-Haves

- [ ] `pr-command.ts` provides a deterministic PR status surface that can report repo/auth/branch/PR/preference state without invoking the LLM.
- [ ] `pr-auto.ts` expresses the post-`complete-slice` decision matrix as pure, testable logic instead of embedding it ad hoc in `auto.ts`.
- [ ] `kata_create_pr` still returns the same structured success/failure shape after the refactor.
- [ ] Existing S01–S04 PR tool tests remain green after the extraction.

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-command.test.ts' 'src/resources/extensions/kata/tests/pr-auto.test.ts'`
- `npm test -- --test-name-pattern "pr-preferences|pr-body-composer|pr-review|pr-address|pr-merge|pr-command|pr-auto"`
- `npx tsc --noEmit`

## Observability Impact

- Signals added/changed: deterministic PR lifecycle status fields and explicit auto-mode transition reasons become first-class helper outputs.
- How a future agent inspects this: call the status helper (via `/kata pr status` in T03) or read the pure helper outputs in tests to understand why Kata will create, pause, or legacy-merge.
- Failure state exposed: structured PR runner phases and auto-decision reasons become reusable inputs for command/status/auto-mode surfaces.

## Inputs

- `src/resources/extensions/pr-lifecycle/index.ts` — current inline `kata_create_pr` implementation to extract
- `src/resources/extensions/pr-lifecycle/gh-utils.ts` — canonical GitHub remote / branch / auth primitives
- `src/resources/extensions/kata/tests/pr-command.test.ts` — new contract for status/completions/onboarding
- `src/resources/extensions/kata/tests/pr-auto.test.ts` — new contract for post-`complete-slice` decisions
- `.kata/milestones/M003/slices/S01/S01-SUMMARY.md` — authoritative behavior for the current create-PR tool contract

## Expected Output

- `src/resources/extensions/kata/pr-command.ts` — reusable status/completion helpers for the `/kata pr` surface
- `src/resources/extensions/kata/pr-auto.ts` — reusable auto-mode PR decision helpers
- `src/resources/extensions/pr-lifecycle/pr-runner.ts` — shared PR creation orchestration callable from tools and auto-mode
- `src/resources/extensions/pr-lifecycle/index.ts` — refactored to delegate creation through the shared runner without behavior drift
