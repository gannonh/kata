---
id: T01
parent: S05
milestone: M003
provides:
  - pr-command.test.ts — failing contract tests for getPrSubcommandCompletions, buildPrStatusReport, getPrOnboardingRecommendation
  - pr-auto.test.ts — failing contract tests for decidePostCompleteSliceAction and formatPrAutoCreateFailure
  - prefs-status.test.ts — 3 new failing assertions pinning PR lifecycle config visibility in /kata prefs status output
  - Pinned API surface for pr-command.ts: getPrSubcommandCompletions, buildPrStatusReport, getPrOnboardingRecommendation, PrStatusDependencies
  - Pinned API surface for pr-auto.ts: decidePostCompleteSliceAction, formatPrAutoCreateFailure, PostCompleteSliceDecision, PrAutoCreateFailure
key_files:
  - src/resources/extensions/kata/tests/pr-command.test.ts
  - src/resources/extensions/kata/tests/pr-auto.test.ts
  - src/resources/extensions/kata/tests/prefs-status.test.ts
key_decisions:
  - "PostCompleteSliceDecision union = 'legacy-squash-merge' | 'auto-create-and-pause' | 'skip-notify'; 'skip-notify' is the safe default for pr.enabled=true without auto_create (don't squash, don't auto-create)"
  - "PrStatusDependencies uses four injected accessors: getCurrentBranch, getOpenPrNumber, getPrEnabled, getPrAutoCreate, getPrBaseBranch — keeps buildPrStatusReport fully testable without filesystem or gh CLI"
  - "prefs-status contract for PR section: 'pr.enabled: <bool>', 'pr.auto_create: <bool>', 'pr.base_branch: <branch>' when enabled; 'pr: disabled' when not configured or disabled"
patterns_established:
  - "Dependency injection via *Dependencies interface (same shape as PrefsStatusDependencies) for all new status reporters"
  - "Contract-first TDD: test files import non-existent modules to pin the expected API before implementing"
observability_surfaces:
  - "Test output shows exactly which command/status/auto-create contract is still missing; run npm test to inspect gaps"
duration: 20min
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Write failing tests for PR command routing and auto-create decisions

**Three contract test files that pin the full `/kata pr` and auto-mode PR decision surface — 5 intentional failures, 112 existing tests unaffected.**

## What Happened

Created `pr-command.test.ts` and `pr-auto.test.ts` as pure contract-first test files. Both import from modules (`../pr-command.js`, `../pr-auto.js`) that do not exist yet, so all tests in each file fail with `ERR_MODULE_NOT_FOUND` — the intended state for a TDD task.

`pr-command.test.ts` pins 9 assertions covering:
- `getPrSubcommandCompletions(prefix)` — completions for status/create/review/address/merge, prefix filtering, determinism
- `buildPrStatusReport(deps)` — branch name and PR number in output, "no open PR" state, disabled-PR level
- `getPrOnboardingRecommendation(prEnabled, hasGithubRemote)` — guidance when disabled or no remote, empty when configured

`pr-auto.test.ts` pins 9 assertions covering the decision matrix (D049):
- `undefined` prefs → `legacy-squash-merge`
- `{ enabled: false }` → `legacy-squash-merge`
- `{ enabled: true, auto_create: true }` → `auto-create-and-pause`
- `{ enabled: true, auto_create: false }` and `{ enabled: true }` → `skip-notify`
- All valid inputs produce one of the three valid decisions (exhaustive safety net)
- `formatPrAutoCreateFailure` produces phase, error, and hint in output

Added 3 new assertions to `prefs-status.test.ts`:
- When `pr.enabled=true`, report includes `pr.enabled: true`, `pr.auto_create: ...`, `pr.base_branch: ...`
- When pr not configured, report includes `pr: disabled`
- When `pr.enabled=false`, report includes `pr: disabled`

These 3 fail with unmet assertions (not syntax errors) because `buildPrefsStatusReport` doesn't yet emit PR lines.

## Verification

```
node --import ... --test 'pr-command.test.ts' 'pr-auto.test.ts'
# → 2 files fail: ERR_MODULE_NOT_FOUND for ../pr-command.ts and ../pr-auto.ts

node --import ... --test 'prefs-status.test.ts'
# → 3 pass, 3 fail: unmet assertions on pr.enabled/pr.auto_create/pr: disabled lines

npm test
# → 112 pass, 5 fail — all failures intentional, no regressions
```

## Diagnostics

Run `npm test` to see exactly which PR command/auto-create contracts are still missing. Each test name is a specific contract obligation for T02 or T03 to fulfill.

## Deviations

None — the three test files match the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/kata/tests/pr-command.test.ts` — contract tests for `/kata pr` completions, status, and onboarding (new)
- `src/resources/extensions/kata/tests/pr-auto.test.ts` — contract tests for post-complete-slice decision matrix (new)
- `src/resources/extensions/kata/tests/prefs-status.test.ts` — 3 new PR lifecycle config visibility assertions (extended)
