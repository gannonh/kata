---
id: S01
parent: M003
milestone: M003
provides:
  - pr-lifecycle extension with kata_create_pr tool (pre-flight checks + artifact composition + file-backed body creation)
  - gh-utils.ts — 5 pure detection/parsing functions (isGhInstalled, isGhAuthenticated, getCurrentBranch, parseBranchToSlice, detectGitHubRepo)
  - pr-body-composer.ts — composePRBody async function producing ## What Changed / ## Must-Haves / ## Tasks from slice artifacts
  - KataPrPreferences interface + normalizePrPreferences + validatePreferences/mergePreferences wiring in preferences.ts
  - create_pr_safe.py and fetch_comments.py bundled verbatim in scripts/
  - pr-lifecycle entry point wired into KATA_BUNDLED_EXTENSION_PATHS in loader.ts
requires: []
affects:
  - S02 — consumes extension scaffold, gh-utils, PR diff fetching
  - S03 — consumes fetch_comments.py, extension scaffold, gh-utils
  - S04 — consumes extension scaffold, gh-utils, slice status interface
key_files:
  - src/resources/extensions/pr-lifecycle/index.ts
  - src/resources/extensions/pr-lifecycle/gh-utils.ts
  - src/resources/extensions/pr-lifecycle/pr-body-composer.ts
  - src/resources/extensions/pr-lifecycle/scripts/create_pr_safe.py
  - src/resources/extensions/pr-lifecycle/scripts/fetch_comments.py
  - src/resources/extensions/kata/preferences.ts
  - src/resources/extensions/kata/tests/pr-preferences.test.mjs
  - src/resources/extensions/kata/tests/pr-body-composer.test.ts
  - src/loader.ts
key_decisions:
  - D016 — file-backed PR body creation via create_pr_safe.py prevents shell interpolation corruption
  - D036 — pr-lifecycle tests live in kata/tests/ to reuse existing npm test glob
  - D037 — kata_create_pr returns structured { ok, phase, error, hint, url } — never throws
  - D038 — shell argument escaping via single-quote-wrapped shellEscape helper
patterns_established:
  - gh-utils functions use try/catch with execSync + piped stdio; never throw — return null/false on error
  - kata_create_pr phase enum (gh-missing | gh-unauth | python3-missing | branch-parse-failed | artifact-error | create-failed) routes agents to exact remediation without prose parsing
  - temp body file written before execSync, cleaned up in finally block regardless of success or failure
  - composePRBody degrades gracefully: missing summary → fallback prose; no task files → slice plan task entries
  - pr preference sub-object follows the normalizeX / validatePreferences / mergePreferences pattern from Linear prefs
observability_surfaces:
  - kata_create_pr returns { ok: false, phase, error, hint } for every pre-flight failure — machine-readable; agent branches on phase
  - phase field distinguishes 6 failure modes without prose parsing
  - create-failed phase surfaces Python script stderr verbatim in error field
  - normalizePrPreferences emits named validation errors (e.g. "pr.enabled must be a boolean") visible via /kata prefs status
drill_down_paths:
  - .kata/milestones/M003/slices/S01/tasks/T01-SUMMARY.md
  - .kata/milestones/M003/slices/S01/tasks/T02-SUMMARY.md
  - .kata/milestones/M003/slices/S01/tasks/T03-SUMMARY.md
  - .kata/milestones/M003/slices/S01/tasks/T04-SUMMARY.md
duration: ~2h (4 tasks × 15–60m each)
verification_result: passed
completed_at: 2026-03-12
---

# S01: PR Creation & Body Composition

**Delivered the foundational pr-lifecycle extension: `kata_create_pr` tool with structured pre-flight errors, artifact-driven PR body composition, file-backed `gh` invocation via bundled Python scripts, and `KataPrPreferences` schema wired into the existing preferences system.**

## What Happened

Four tasks built the slice in sequence:

**T01 (Scaffold + failing tests):** Created the pr-lifecycle extension directory with a no-op `index.ts` stub and `scripts/.gitkeep` placeholder. Wrote `pr-preferences.test.mjs` following the `preferences-frontmatter.test.mjs` pattern — three tests that call `loadEffectiveKataPreferences()` and assert on the `pr` field; all fail until T02. Wrote `pr-body-composer.test.ts` with a top-level `await import` that fails immediately with `ERR_MODULE_NOT_FOUND` until T03. Corrected the import path: the task plan specified a double `extensions/` segment; correct path from `kata/tests/` is `../../pr-lifecycle/pr-body-composer.js`.

**T02 (KataPrPreferences schema):** Extended `preferences.ts` with `KataPrPreferences` (5 optional fields), added `pr?: KataPrPreferences` to `KataPreferences`, and implemented `normalizePrPreferences` following the `normalizeLinearPreferences` guard-then-iterate pattern. Wired `pr` through `validatePreferences` (errors emitted with named paths) and `mergePreferences` (override-wins spread). All 3 `pr-preferences.test.mjs` tests now pass.

**T03 (gh-utils + pr-body-composer):** Implemented `gh-utils.ts` with 5 pure detection/parsing functions. Each uses `execSync` with piped stdio and returns `null`/`false` on any error — no throws propagate. `parseBranchToSlice` regex matches `kata/M001/S01` format (uppercase letter + digits only). Implemented `pr-body-composer.ts` importing from `../kata/paths.js` and `../kata/files.js`: reads slice plan for title + must-haves, optional slice summary for one-liner, task plan files for titles via `resolveTasksDir` + `resolveTaskFiles(tasksDir, "PLAN")`. Key discovery: `resolveTaskFiles` takes `(tasksDir, suffix)` — not `(milestoneId, sliceId, cwd)` as implied by the plan. All 4 `pr-body-composer.test.ts` assertions pass.

**T04 (kata_create_pr tool + scripts + loader wiring):** Replaced the stub `index.ts` with the full extension. `kata_create_pr` tool registered via `pi.addTool` performs 3 pre-flight checks (gh installed, gh authenticated, python3 present), auto-detects milestone/slice from branch via `parseBranchToSlice(getCurrentBranch(cwd))`, calls `composePRBody`, writes body to a temp file, delegates to `create_pr_safe.py` via `shellEscape`-wrapped execSync, and cleans up in `finally`. Ported `create_pr_safe.py` and `fetch_comments.py` verbatim from the pull-requests skill. Added pr-lifecycle entry to `KATA_BUNDLED_EXTENSION_PATHS` in `loader.ts`.

## Verification

- `npx tsc --noEmit` — exits 0, no errors
- `node --import resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` — prints `ok`
- `ls src/resources/extensions/pr-lifecycle/scripts/` — `create_pr_safe.py` and `fetch_comments.py` present
- Unit tests: 7/7 pass (4 pr-body-composer + 3 pr-preferences), all existing 87 tests still pass

## Requirements Advanced

- R200 — PR creation as part of slice completion: `kata_create_pr` tool delivers full create flow; `pr.auto_create` preference gates auto-invocation at slice completion (S05 wires the hook)
- R204 — PR lifecycle preferences: `KataPrPreferences` schema validated and round-trips through `loadEffectiveKataPreferences()`
- R206 — PR body composition from slice artifacts: `composePRBody` reads plan, task summaries, slice summary and composes structured markdown

## Requirements Validated

- R204 — `KataPrPreferences` schema (`enabled`, `auto_create`, `base_branch`, `review_on_create`, `linear_link`) validated by unit tests; `normalizePrPreferences` emits named errors; full round-trip through preferences pipeline confirmed
- R206 — `composePRBody` tested against real slice artifact fixtures; produces structured PR body with `## What Changed`, `## Must-Haves`, `## Tasks` sections; graceful fallback on missing artifacts confirmed

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **Import path correction (T01):** Task plan specified `../../extensions/pr-lifecycle/pr-body-composer.js` from `kata/tests/`; correct path is `../../pr-lifecycle/pr-body-composer.js` (double `extensions/` segment in plan). Fixed without impact on other work.
- **resolveTaskFiles signature (T03):** Task plan described `resolveTaskFiles(milestoneId, sliceId, cwd)` but actual signature is `(tasksDir: string, suffix: string)`. Used `resolveTasksDir(cwd, milestoneId, sliceId)` first then passed result to `resolveTaskFiles`. No behavior difference.

## Known Limitations

- **No resource-loader sync for scripts/:** The `cpSync` call in `resource-loader.ts` is not yet updated to sync `pr-lifecycle/scripts/` to `~/.kata-cli/agent/extensions/pr-lifecycle/scripts/`. Script path resolution uses `dirname(fileURLToPath(import.meta.url))` so it works from `src/` at dev time; the sync step is needed before production use. Deferred to S05 (onboarding + preferences wiring slice).
- **UAT not yet run:** Real `gh` invocation against a GitHub repo is a UAT requirement. The tool pre-flight and body composition are contract-tested; live PR creation confirmed only by the UAT checklist.
- **pr.auto_create hook not wired:** The preference exists and round-trips; the slice-completion hook that calls `kata_create_pr` when `pr.auto_create: true` is deferred to S05.

## Follow-ups

- S05: wire `resource-loader.ts` cpSync for `scripts/` directory; add slice-completion hook for `pr.auto_create`; add `/kata pr` command surface
- S05: add GitHub remote detection in `/kata` wizard onboarding
- S02: consume `gh-utils.ts` for PR diff fetching

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/index.ts` — full extension; registers kata_create_pr tool
- `src/resources/extensions/pr-lifecycle/gh-utils.ts` — 5 pure detection/parsing functions
- `src/resources/extensions/pr-lifecycle/pr-body-composer.ts` — composePRBody async function
- `src/resources/extensions/pr-lifecycle/scripts/create_pr_safe.py` — verbatim port from pull-requests skill
- `src/resources/extensions/pr-lifecycle/scripts/fetch_comments.py` — verbatim port from pull-requests skill
- `src/resources/extensions/kata/preferences.ts` — KataPrPreferences interface + normalize/validate/merge
- `src/resources/extensions/kata/tests/pr-preferences.test.mjs` — preference schema tests (3 tests, all pass)
- `src/resources/extensions/kata/tests/pr-body-composer.test.ts` — body composer tests (4 tests, all pass)
- `src/loader.ts` — pr-lifecycle entry added to KATA_BUNDLED_EXTENSION_PATHS

## Forward Intelligence

### What the next slice should know
- `gh-utils.ts` is fully self-contained and ready for S02 consumption — `isGhInstalled`, `isGhAuthenticated`, `getCurrentBranch`, `parseBranchToSlice`, `detectGitHubRepo` are all safe no-throw wrappers
- `create_pr_safe.py` and `fetch_comments.py` are verbatim from the user's existing pull-requests skill — do not modify them; they are the battle-tested implementations
- `composePRBody` degrades gracefully — it will never return an empty string even if all artifact reads fail; safe to call unconditionally

### What's fragile
- `scripts/` not synced by resource-loader — if kata_create_pr is called after resource-loader syncs the extension to `~/.kata-cli/`, the scripts won't be present there yet. S05 must add the cpSync call before the feature goes into production auto-mode use.
- `shellEscape` wraps args in single quotes — paths with embedded single quotes would break. Acceptable for temp file paths (UUID-based) and titles (user-supplied strings; edge case but worth noting for S05 robustness hardening).

### Authoritative diagnostics
- `kata_create_pr` tool return value: inspect `phase` field for pre-flight failures; `error` field for create-failed stderr; `url` field for success
- `loadEffectiveKataPreferences().preferences.pr` — canonical inspection surface for active PR config
- `/kata prefs status` — surfaces named validation errors for malformed pr.* fields

### What assumptions changed
- `resolveTaskFiles` signature: plan assumed `(milestoneId, sliceId, cwd)` — actual is `(tasksDir, suffix)`; callers must call `resolveTasksDir` first (same pattern used in composePRBody)
- test import paths: plan had a double `extensions/` segment; all pr-lifecycle test imports use `../../pr-lifecycle/` not `../../extensions/pr-lifecycle/`
