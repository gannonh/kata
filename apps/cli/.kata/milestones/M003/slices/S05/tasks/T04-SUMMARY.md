---
id: T04
parent: S05
milestone: M003
provides:
  - pr: block in templates/preferences.md — enabled/auto_create/base_branch/review_on_create/linear_link with defaults and example
  - pr: block in gitignore.ts ensurePreferences() bootstrap template — new projects always get the pr: block seeded
  - docs/preferences-reference.md — pr.* fields documented with pending note on linear_link; /kata pr status examples added; PR lifecycle example added
  - detectGithubRemote() in guided-flow.ts — execSync git remote get-url origin, checks for github.com
  - enablePrPreferences() in guided-flow.ts — flips pr.enabled to true in preferences.md; appends pr: block if absent
  - PR onboarding hook in guided-flow.ts "roadmap ready" path — adds recommendation to summary and "Set up PR lifecycle" action when GitHub remote present and PR disabled
key_files:
  - src/resources/extensions/kata/templates/preferences.md
  - src/resources/extensions/kata/gitignore.ts
  - src/resources/extensions/kata/docs/preferences-reference.md
  - src/resources/extensions/kata/guided-flow.ts
key_decisions:
  - "PR onboarding fires at 'roadmap ready' decision point — natural moment before 'Go auto'; does not interrupt active execution paths"
  - "enablePrPreferences is best-effort (never throws) — guided-flow must not fail on preference write errors"
  - "detectGithubRemote checks for github.com in remote URL — simple substring check, no gh CLI dependency"
patterns_established:
  - "PR setup action writes preferences directly (enablePrPreferences) rather than directing user to edit a file — matches D037 philosophy of agent-executable actions"
observability_surfaces:
  - "/kata pr status shows pr.enabled/auto_create/base_branch lines — /kata prefs status also shows pr.enabled line via buildPrefsStatusReport (already wired in T02)"
  - "PR onboarding recommendation text is visible in /kata wizard summary when GitHub remote detected and pr.enabled is false"
duration: 20min
verification_result: passed
completed_at: 2026-03-13T22:00:00Z
blocker_discovered: false
---

# T04: Surface PR setup in preferences, status, and onboarding

**`pr:` block seeded in templates and bootstrap; docs updated with PR lifecycle fields; `/kata` wizard offers PR setup when GitHub remote detected and PR lifecycle is unconfigured — 140/140 tests pass.**

## What Happened

**Templates and bootstrap:** Added `pr:` block with all five fields and safe defaults (`enabled: false`) to both `templates/preferences.md` and the inline template in `gitignore.ts`'s `ensurePreferences()`. New projects now always see the PR block on first init.

**Docs:** Updated `docs/preferences-reference.md` with the full `pr.*` field guide, including the `linear_link: pending until S06` note. Added `/kata pr status` output examples and a PR lifecycle example at the bottom.

**guided-flow.ts:** Added two helpers — `detectGithubRemote(basePath)` (checks `git remote get-url origin` for `github.com`) and `enablePrPreferences(basePath)` (flips `enabled: false → true` or appends a default `pr:` block). Wired the PR onboarding check into the "roadmap ready" decision path: imports `getPrOnboardingRecommendation` from `pr-command.ts`, loads effective preferences, appends the recommendation to the summary lines, and conditionally adds a "Set up PR lifecycle" action when the remote is GitHub and PR is disabled. Choosing that action calls `enablePrPreferences` and notifies the user.

`loadEffectiveKataPreferences` and `writeFileSync` were added to the existing imports.

## Verification

- `npx tsc --noEmit` → exits 0
- `npm test` → 140/140 pass

## Diagnostics

- `/kata` with a GitHub remote + `pr.enabled: false` shows "PR lifecycle is disabled. Set `pr.enabled: true`..." in the summary
- Choosing "Set up PR lifecycle" writes `enabled: true` to `.kata/preferences.md` directly

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/kata/templates/preferences.md` — added `pr:` block with defaults and PR lifecycle example
- `src/resources/extensions/kata/gitignore.ts` — added `pr:` block and field docs to `ensurePreferences()` template
- `src/resources/extensions/kata/docs/preferences-reference.md` — added `pr.*` fields, status examples, PR example
- `src/resources/extensions/kata/guided-flow.ts` — `detectGithubRemote`, `enablePrPreferences`, PR onboarding hook in "roadmap ready" path
