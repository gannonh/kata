---
estimated_steps: 5
estimated_files: 4
---

# T05: Gate auto-mode slice completion through PR creation when enabled

**Slice:** S05 — Preferences, Onboarding & `/kata pr` Command
**Milestone:** M003

## Description

Close the main workflow gap: when PR lifecycle is enabled, auto-mode must stop bypassing it. This task replaces the unconditional post-`complete-slice` squash merge with a preference-aware decision that creates a PR and pauses for review/merge, while preserving the legacy merge path for projects that do not use PR lifecycle.

## Steps

1. Read the existing post-`complete-slice` merge block in `auto.ts` and replace the hard-coded branch merge path with the pure decision helper from T02.
2. When PR lifecycle is disabled, keep the current `switchToMain()` + `mergeSliceToMain()` behavior exactly as it is now.
3. When `pr.enabled && pr.auto_create`, call the shared PR runner on the slice branch after summary/UAT/commit, surface structured success/failure, and pause auto-mode instead of merging the branch to main.
4. On create failure, stop or pause with the exact runner diagnostics and never fall through to the legacy squash-merge path.
5. Re-run the auto-mode decision tests and the broader PR-related suite to confirm the new path is both test-covered and backward-compatible.

## Must-Haves

- [ ] PR-enabled projects no longer bypass PR creation after `complete-slice`.
- [ ] Legacy projects with PR lifecycle disabled keep the existing squash-merge path unchanged.
- [ ] Create failures remain inspectable through structured diagnostics and do not silently re-enter the old merge path.
- [ ] Auto-mode pauses in a way that makes the next required human/agent action obvious (`review / merge the PR`) rather than leaving the workflow in an implicit state.

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-auto.test.ts'`
- `npm test -- --test-name-pattern "pr-auto|pr-merge|pr-command|pr-preferences"`
- `npx tsc --noEmit`

## Observability Impact

- Signals added/changed: auto-mode gains an explicit PR-auto-create success/failure/pause reason instead of only emitting generic merge notifications.
- How a future agent inspects this: the auto decision helper, `/kata pr status`, and `STATE.md` next action should all agree on whether the slice is waiting for PR review/merge.
- Failure state exposed: create failures surface the shared runner phase/hint pair and block the legacy merge fallback, making the problem localizable instead of hidden behind a successful branch merge.

## Inputs

- `src/resources/extensions/kata/auto.ts` — current unconditional post-`complete-slice` squash-merge path
- `src/resources/extensions/kata/pr-auto.ts` — decision helpers from T02
- `src/resources/extensions/pr-lifecycle/pr-runner.ts` — shared create-PR orchestration from T02
- `src/resources/extensions/kata/tests/pr-auto.test.ts` — contract for the new decision matrix
- `.kata/milestones/M003/slices/S04/S04-SUMMARY.md` — confirms the current workflow gap this task must close

## Expected Output

- `src/resources/extensions/kata/auto.ts` — preference-aware post-`complete-slice` path that either legacy-merges or creates a PR and pauses
- `src/resources/extensions/kata/pr-auto.ts` — reusable auto-create gating and pause-reason helpers consumed by runtime code and tests
- `src/resources/extensions/pr-lifecycle/pr-runner.ts` — shared create path callable from auto-mode without duplicating tool logic
- `src/resources/extensions/kata/tests/pr-auto.test.ts` — passing decision-matrix coverage for both the legacy and PR-enabled paths
