---
id: T02
parent: S02
milestone: M002
provides:
  - Centralized workflow/Linear config resolution helpers plus structured live validation results for downstream mode-aware callers
key_files:
  - src/resources/extensions/kata/linear-config.ts
  - src/resources/extensions/kata/tests/linear-config.test.ts
  - src/resources/extensions/kata/tests/linear-config.integration.test.ts
key_decisions:
  - Validation returns a stable redacted result shape with explicit diagnostic codes instead of surfacing raw Linear client errors directly
patterns_established:
  - Downstream code can ask `linear-config.ts` for mode/config state first, then branch on machine-readable validation diagnostics
observability_surfaces:
  - `validateLinearProjectConfig()` returns stable codes: `missing_linear_api_key`, `missing_linear_team`, `invalid_linear_team`, `invalid_linear_project`, `linear_auth_error`, `linear_network_error`
  - Validation results expose resolved team/project summaries and `apiKeyPresent` without ever including the raw API key value
duration: 45m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T02: Build centralized Linear config resolution and live validation helpers

**Added `linear-config.ts` as the single workflow/mode resolver, plus structured unit and live integration coverage for Linear project validation.**

## What Happened

Created `src/resources/extensions/kata/linear-config.ts` as the centralized seam for workflow mode and Linear binding resolution. The module now loads effective preferences, normalizes workflow mode with a safe default back to `file`, and exports the promised helpers: `getWorkflowMode()`, `isLinearMode()`, `getLinearTeamId()`, and `getLinearProjectId()`.

The module also exposes `loadEffectiveLinearProjectConfig()` for callers that need the full effective config shape, including `linear.teamKey`, and `validateLinearProjectConfig()` for live validation against the real S01 `LinearClient`.

`validateLinearProjectConfig()` returns a structured redacted result with explicit status (`valid` / `invalid` / `skipped`), `apiKeyPresent`, resolved team/project summaries, and stable diagnostic codes for missing config, invalid bindings, auth failures, and network/service failures. It reuses `LinearClient` plus `classifyLinearError()` rather than duplicating GraphQL logic.

Added `src/resources/extensions/kata/tests/linear-config.test.ts` to cover mode fallback, helper behavior, missing API key/team classification, invalid team/project classification, auth/network classification, and a valid resolved configuration path without network access by injecting a small fake client.

Added `src/resources/extensions/kata/tests/linear-config.integration.test.ts` to prove the validator resolves a real Linear team by both ID and key, and resolves a real Linear project when `LINEAR_API_KEY` is present.

## Verification

Passed task-level verification:
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.test.ts`
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.integration.test.ts` (with `LINEAR_API_KEY` present in the environment)
- `npx tsc --noEmit`

Slice-level verification status after T02:
- Passed: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs src/resources/extensions/kata/tests/linear-config.test.ts src/resources/extensions/kata/tests/mode-switching.test.ts`
- Passed: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.integration.test.ts` (with `LINEAR_API_KEY` present in the environment)
- Passed: `npx tsc --noEmit`
- Not run yet: `/kata prefs status` verification (T03 not implemented yet)

## Diagnostics

- Call `validateLinearProjectConfig()` to get structured validation status, resolved team/project summaries, and stable diagnostic codes.
- Inspect `src/resources/extensions/kata/tests/linear-config.test.ts` for executable examples of every diagnostic code branch.
- Inspect `src/resources/extensions/kata/tests/linear-config.integration.test.ts` for the live-resolution path against a real Linear workspace.

## Deviations

- Exported an additional `getLinearTeamKey()` helper alongside the required roadmap helpers so downstream code can consume a human-readable team binding without reparsing preferences.

## Known Issues

- `/kata prefs status` does not yet consume the new validator or surface mode/config health; that wiring remains for T03.
- Mode-aware entrypoint branching still remains for T04.

## Files Created/Modified

- `src/resources/extensions/kata/linear-config.ts` — added centralized workflow/mode resolution plus structured live Linear config validation
- `src/resources/extensions/kata/tests/linear-config.test.ts` — added local coverage for helper behavior and all diagnostic-code branches without network access
- `src/resources/extensions/kata/tests/linear-config.integration.test.ts` — added live validation coverage for real team/key/project resolution against Linear
