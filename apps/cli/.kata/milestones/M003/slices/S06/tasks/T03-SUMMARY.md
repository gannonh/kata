---
id: T03
parent: S06
milestone: M003
provides:
  - kata_create_pr handler resolves Linear config and passes linearConfig to runCreatePr
  - runCreatePr resolves slice Linear identifier, passes references to composePRBody, posts comment after creation
  - kata_merge_pr handler advances slice Linear issue to done after merge
  - PrStatusDependencies extended with getLinearLinkStatus accessor
  - buildPrStatusReport includes linear_link status line (active/disabled/requires linear mode)
  - buildLivePrStatusDeps wires getLinearLinkStatus from effective prefs + linear config
  - Preference docs and templates remove "pending S06" notes from pr.linear_link
key_files:
  - src/resources/extensions/pr-lifecycle/index.ts
  - src/resources/extensions/pr-lifecycle/pr-runner.ts
  - src/resources/extensions/kata/pr-command.ts
  - src/resources/extensions/kata/commands.ts
  - src/resources/extensions/kata/docs/preferences-reference.md
  - src/resources/extensions/kata/templates/preferences.md
key_decisions:
  - "D053: Linear cross-linking in PR tools is best-effort — failures are reported in structured return values (linearComment, linearStateAdvance) but never block the primary PR operation"
  - "D054: PrStatusDependencies.getLinearLinkStatus is optional — backward-compatible with existing tests that don't provide it"
duration: 30min
verification_result: pass
completed_at: 2026-03-13T12:50:00Z
---

# T03: Wire cross-linking into PR creation and merge tool handlers

**Linear cross-linking wired into kata_create_pr (body references + comment) and kata_merge_pr (state advance), plus status surface and doc updates — 158/158 tests pass**

## What Happened

Extended `kata_create_pr` handler to build `linearConfig` from effective preferences and Linear project config, then pass it through to `runCreatePr`. `runCreatePr` now resolves the slice's Linear identifier when cross-linking is active, passes it to `composePRBody` as `linearReferences`, and posts a comment to the Linear issue after successful PR creation. `kata_merge_pr` handler now advances the slice's Linear issue to the completed workflow state after successful merge. Both operations are best-effort — failures produce structured results (`linearComment: "failed"`, `linearStateAdvance: "failed"`) but never block the PR operation.

Extended `PrStatusDependencies` with an optional `getLinearLinkStatus` accessor and added a `linear_link` status line to `buildPrStatusReport` (shows `active`, `disabled`, or `requires linear mode`). Wired the live accessor in `buildLivePrStatusDeps` via `loadEffectiveLinearProjectConfig`.

Removed "pending S06" notes from `preferences-reference.md` and `templates/preferences.md`.

## Deviations
None.

## Files Created/Modified
- `src/resources/extensions/pr-lifecycle/index.ts` — kata_create_pr + kata_merge_pr handlers extended
- `src/resources/extensions/pr-lifecycle/pr-runner.ts` — Linear resolution + comment posting
- `src/resources/extensions/kata/pr-command.ts` — PrStatusDependencies + status report extended
- `src/resources/extensions/kata/commands.ts` — buildLivePrStatusDeps wires getLinearLinkStatus
- `src/resources/extensions/kata/docs/preferences-reference.md` — S06 pending note removed
- `src/resources/extensions/kata/templates/preferences.md` — S06 pending note removed
