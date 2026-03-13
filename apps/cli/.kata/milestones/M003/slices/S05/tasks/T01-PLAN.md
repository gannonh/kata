---
estimated_steps: 4
estimated_files: 3
---

# T01: Write failing tests for PR command routing and auto-create decisions

**Slice:** S05 — Preferences, Onboarding & `/kata pr` Command
**Milestone:** M003

## Description

Define the contract for S05 before changing any runtime wiring. This task adds failing tests for the new deterministic PR command/status helpers and the auto-mode decision matrix so later tasks can refactor safely.

## Steps

1. Create `src/resources/extensions/kata/tests/pr-command.test.ts` with a top-level import of the not-yet-existing `../pr-command.js` module and assertions for `/kata pr` subcommand completions, deterministic status formatting, and onboarding recommendation text.
2. Create `src/resources/extensions/kata/tests/pr-auto.test.ts` with a top-level import of the not-yet-existing `../pr-auto.js` module and assertions for the post-`complete-slice` decision matrix (`legacy squash merge`, `auto-create + pause`, `create failure surfaces diagnostics`).
3. Extend `src/resources/extensions/kata/tests/prefs-status.test.ts` so PR lifecycle config lines become part of the canonical prefs-status contract.
4. Run the targeted tests and confirm they fail cleanly because the new modules/behavior do not exist yet.

## Must-Haves

- [ ] The new test files exist and are discovered by the project test runner.
- [ ] Failures are intentional contract failures (MODULE_NOT_FOUND or unmet assertions), not syntax or loader errors.
- [ ] The tests pin the real user-facing surfaces: command completions, status output, onboarding guidance, and auto-create behavior.

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-command.test.ts' 'src/resources/extensions/kata/tests/pr-auto.test.ts'`
- `npm test -- --test-name-pattern "prefs status|pr-command|pr-auto"`

## Observability Impact

- Signals added/changed: None — this task only defines the contract for later status and auto-create signals.
- How a future agent inspects this: read the new test files; they become the authoritative specification for the command and auto-mode behavior.
- Failure state exposed: test output shows exactly which command/status/auto-create contract is still missing.

## Inputs

- `src/resources/extensions/kata/commands.ts` — existing `/kata` subcommand pattern to extend with `pr`
- `src/resources/extensions/kata/tests/prefs-status.test.ts` — existing deterministic status testing seam
- `src/resources/extensions/kata/auto.ts` — current post-`complete-slice` squash-merge behavior that the new tests must pin and then replace
- `.kata/milestones/M003/slices/S04/S04-SUMMARY.md` — confirms auto-mode currently bypasses the PR lifecycle after slice completion

## Expected Output

- `src/resources/extensions/kata/tests/pr-command.test.ts` — failing contract tests for `/kata pr` completions, status, and onboarding
- `src/resources/extensions/kata/tests/pr-auto.test.ts` — failing contract tests for auto-create decision behavior
- `src/resources/extensions/kata/tests/prefs-status.test.ts` — expanded assertions covering PR lifecycle config visibility
