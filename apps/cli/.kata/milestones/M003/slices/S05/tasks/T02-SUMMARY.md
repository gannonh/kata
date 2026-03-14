---
id: T02
parent: S05
milestone: M003
provides:
  - pr-command.ts — getPrSubcommandCompletions, buildPrStatusReport, getPrOnboardingRecommendation, PrStatusDependencies interface
  - pr-auto.ts — decidePostCompleteSliceAction, formatPrAutoCreateFailure, PostCompleteSliceDecision type, PrAutoCreateFailure interface
  - pr-runner.ts — runCreatePr() shared PR creation orchestration callable from tool and auto-mode
  - index.ts — kata_create_pr refactored to delegate to runCreatePr; shellEscape, composePRBody, writeFileSync/unlinkSync/tmpdir/randomUUID imports removed
  - commands.ts — buildPrefsStatusReport now emits PR lifecycle config lines (pr.enabled/pr.auto_create/pr.base_branch or pr: disabled)
key_files:
  - src/resources/extensions/kata/pr-command.ts
  - src/resources/extensions/kata/pr-auto.ts
  - src/resources/extensions/pr-lifecycle/pr-runner.ts
  - src/resources/extensions/pr-lifecycle/index.ts
  - src/resources/extensions/kata/commands.ts
key_decisions:
  - "pr-runner.ts owns all PR creation logic: pre-flight checks, branch/slice resolution, body composition, temp-file lifecycle, and create_pr_safe.py invocation — index.ts kata_create_pr is now a thin delegating wrapper"
  - "buildPrefsStatusReport PR section: appends pr.enabled/pr.auto_create/pr.base_branch lines when pr.enabled=true; appends 'pr: disabled' otherwise (covers null prPrefs and prPrefs.enabled=false)"
patterns_established:
  - "Dependency injection via PrStatusDependencies interface (same shape as PrefsStatusDependencies) keeps buildPrStatusReport fully testable without gh CLI or filesystem"
  - "runCreatePr() is the single source of truth for PR creation — both kata_create_pr tool and future auto-mode call it identically"
observability_surfaces:
  - "buildPrStatusReport output: level (info/warning) + multi-line message with branch, base_branch, auto_create, open PR number or 'no open PR' — inspectable via /kata pr status in T03"
  - "formatPrAutoCreateFailure output: structured [phase: X] / Error: Y / Hint: Z block readable by future agents in auto-mode failure paths"
  - "buildPrefsStatusReport now includes pr.* lines — inspectable via /kata prefs status immediately"
duration: 35min
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Extract shared PR status and orchestration helpers

**Five files: two new pure helper modules (pr-command.ts, pr-auto.ts), one new shared runner (pr-runner.ts), kata_create_pr refactored onto the runner, and buildPrefsStatusReport extended with PR lifecycle config lines — all 22 new tests pass, 137 total, TypeScript clean.**

## What Happened

Created `pr-command.ts` with three pure exports:
- `getPrSubcommandCompletions(prefix)` — filters the five PR subcommands (status, create, review, address, merge) by prefix; returns `Array<{ value, label }>`.
- `buildPrStatusReport(deps: PrStatusDependencies)` — async, dependency-injected status reporter that returns `{ level, message }` without touching gh CLI or the filesystem. Reports enabled/disabled state, current branch, base_branch, auto_create flag, and open PR number (or "no open PR").
- `getPrOnboardingRecommendation(prEnabled, hasGithubRemote)` — returns empty string when fully configured; returns targeted guidance when no remote or PR disabled.

Created `pr-auto.ts` with the decision matrix (D049/D051):
- `decidePostCompleteSliceAction(prPrefs)` — pure function mapping PR preferences to `PostCompleteSliceDecision`. `undefined`/`{enabled:false}`/`{}` → `legacy-squash-merge`; `{enabled:true, auto_create:true}` → `auto-create-and-pause`; `{enabled:true}` or `{enabled:true, auto_create:false}` → `skip-notify`.
- `formatPrAutoCreateFailure(failure)` — formats phase/error/hint into a structured multi-line diagnostic string.

Created `pr-runner.ts` by extracting the full `kata_create_pr` implementation out of `index.ts`. The runner owns all pre-flight logic, branch/slice ID resolution, body composition, temp-file lifecycle, and `create_pr_safe.py` invocation. Returns the same `{ ok: true, url } | { ok: false, phase, error, hint }` contract.

Refactored `kata_create_pr` in `index.ts` to a 6-line delegating wrapper calling `runCreatePr`. Removed `composePRBody`, `writeFileSync`, `unlinkSync`, `tmpdir`, `randomUUID`, and `shellEscape` from `index.ts` (all moved to `pr-runner.ts`); imports that other tools still need (`execSync`, `isGhInstalled`, `isGhAuthenticated`, `getCurrentBranch`, `parseBranchToSlice`) remain.

Extended `buildPrefsStatusReport` in `commands.ts` to append PR lifecycle config lines after the skill resolution block:
- When `prPrefs.enabled === true`: emits `pr.enabled: true`, `pr.auto_create: <bool>`, and `pr.base_branch: <branch>` (when set).
- Otherwise: emits `pr: disabled`.

## Verification

```
# New contract tests — all 22 pass
node --import ... --test 'pr-command.test.ts' 'pr-auto.test.ts'
# ✔ 22 tests, 0 fail

# Full suite — 137 pass (was 115 pass + 22 fail-with-MODULE_NOT_FOUND; prefs-status 3 new pass)
npm test
# ✔ 137 tests, 0 fail

# TypeScript
npx tsc --noEmit
# (no output — clean)

# Import smoke test
node --import ... -e "Promise.all([import('./src/resources/extensions/kata/index.ts'), import('./src/resources/extensions/pr-lifecycle/index.ts')]).then(() => console.log('ok'))"
# ok
```

## Diagnostics

- `/kata prefs status` now shows `pr.enabled`/`pr.auto_create`/`pr.base_branch` or `pr: disabled`.
- `/kata pr status` (T03) will call `buildPrStatusReport` with real dependencies to surface live PR health.
- `formatPrAutoCreateFailure` output format: `PR auto-create failed [phase: X]\nError: Y\nHint: Z` — machine-scannable by future agents in auto-mode failure paths.

## Deviations

None — implementation matches the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/kata/pr-command.ts` — pure PR subcommand completions, status report, and onboarding helpers (new)
- `src/resources/extensions/kata/pr-auto.ts` — pure post-complete-slice decision matrix and failure formatter (new)
- `src/resources/extensions/pr-lifecycle/pr-runner.ts` — shared PR creation orchestration extracted from index.ts (new)
- `src/resources/extensions/pr-lifecycle/index.ts` — kata_create_pr refactored to delegate to runCreatePr; unused imports removed
- `src/resources/extensions/kata/commands.ts` — buildPrefsStatusReport extended with PR lifecycle config lines
