---
id: T05
parent: S05
milestone: M003
provides:
  - auto.ts post-complete-slice block replaced with decidePostCompleteSliceAction — three-branch preference-aware dispatch
  - legacy-squash-merge path: pr disabled → existing switchToMain + mergeSliceToMain behavior preserved exactly
  - auto-create-and-pause path: pr.enabled + pr.auto_create → runCreatePr; success → notify URL + stopAuto; failure → formatPrAutoCreateFailure + stopAuto (never falls through to legacy merge)
  - skip-notify path: pr.enabled without auto_create → notify user to /kata pr create manually, no squash-merge
  - imports: decidePostCompleteSliceAction, formatPrAutoCreateFailure from pr-auto.ts; runCreatePr from pr-lifecycle/pr-runner.ts
key_files:
  - src/resources/extensions/kata/auto.ts
key_decisions:
  - "D049 (implemented): auto-create-and-pause is the new path; legacy-squash-merge preserved for pr.enabled=false; skip-notify is safe default for pr.enabled=true without auto_create"
  - "PR create failure calls stopAuto — never falls through to the legacy squash-merge path; creates an explicit inspectable stop point"
  - "postPrefs loaded fresh via loadEffectiveKataPreferences() at decision time — consistent with buildLivePrStatusDeps pattern (no caching)"
patterns_established:
  - "post-complete-slice dispatch: read decision from pure helper, branch on three cases — eliminates ad hoc conditional growth in auto.ts"
  - "PR failure in auto-mode: formatPrAutoCreateFailure → ctx.ui.notify error + stopAuto — same stop-with-diagnostics pattern as blocked state"
observability_surfaces:
  - "auto-create-and-pause: notifies PR URL; auto-mode stops cleanly — user knows the next required action (review/merge the PR)"
  - "create failure: formatPrAutoCreateFailure output in ui.notify error — phase + error + hint all visible without log scraping"
  - "skip-notify: explicit 'run /kata pr create' instruction — no silent no-op"
duration: 15min
verification_result: passed
completed_at: 2026-03-13T22:15:00Z
blocker_discovered: false
---

# T05: Gate auto-mode slice completion through PR creation when enabled

**auto.ts post-complete-slice block replaced with preference-aware three-branch dispatch (legacy-squash-merge / auto-create-and-pause / skip-notify) — 140/140 tests pass, TypeScript clean.**

## What Happened

Replaced the hard-coded squash-merge block in `dispatchNextUnit` with a preference-aware dispatch using `decidePostCompleteSliceAction` from `pr-auto.ts` (built in T02).

**Three paths:**

`legacy-squash-merge` (pr disabled): identical behavior to the old code — `switchToMain` + `mergeSliceToMain` + error recovery. The existing test coverage still applies.

`auto-create-and-pause` (pr.enabled + auto_create): calls `runCreatePr` from `pr-runner.ts` with `cwd`, `milestoneId`, `sliceId`, and `baseBranch` from prefs. On success: notifies the PR URL and calls `stopAuto` — auto-mode pauses cleanly with a clear "review and merge the PR, then run /kata auto" instruction. On failure: calls `formatPrAutoCreateFailure` to build the phase/error/hint diagnostic string, notifies as error, and calls `stopAuto`. The legacy merge path is never reached on failure.

`skip-notify` (pr.enabled, auto_create absent/false): emits an info notification telling the user to run `/kata pr create` manually. No squash-merge.

Added two imports at the top of `auto.ts`: `{ decidePostCompleteSliceAction, formatPrAutoCreateFailure }` from `./pr-auto.js` and `{ runCreatePr }` from `../pr-lifecycle/pr-runner.js`.

## Verification

- `npx tsc --noEmit` → exits 0
- `npm test` → 140/140 pass
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-auto.test.ts'` → 12/12 pass

## Diagnostics

- `auto-create-and-pause` success: `ctx.ui.notify` shows PR URL + pause reason
- `auto-create-and-pause` failure: `ctx.ui.notify` error shows `PR auto-create failed [phase: X]\nError: Y\nHint: Z`
- `skip-notify`: `ctx.ui.notify` info shows "run /kata pr create" instruction

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/kata/auto.ts` — replaced hard-coded merge block with three-branch preference-aware dispatch; added imports for decidePostCompleteSliceAction, formatPrAutoCreateFailure, runCreatePr
