---
estimated_steps: 5
estimated_files: 5
---

# T02: Build centralized Linear config resolution and live validation helpers

**Slice:** S02 — Project Configuration & Mode Switching
**Milestone:** M002

## Description

Create the single mode/config module that every downstream slice will depend on. It should answer whether a project is in file mode or Linear mode, expose the configured team/project IDs, and validate the binding against the live Linear API with structured diagnostics.

## Steps

1. Create `src/resources/extensions/kata/linear-config.ts` with helpers to load the effective project config, normalize `workflow.mode`, and export `getWorkflowMode()`, `isLinearMode()`, `getLinearTeamId()`, and `getLinearProjectId()`.
2. Add structured validation types and diagnostic codes for missing API key, missing team config, invalid team, invalid project, auth errors, and network failures. Keep the result machine-readable so commands and tests can branch on it.
3. Implement `validateLinearProjectConfig()` using the S01 `LinearClient`: resolve the configured team by UUID or key, resolve the configured project if present, and return a redacted validation result that never includes the raw API key.
4. Add unit tests in `src/resources/extensions/kata/tests/linear-config.test.ts` covering normalization, mode fallback, and diagnostic-code behavior without network access.
5. Add live integration coverage in `src/resources/extensions/kata/tests/linear-config.integration.test.ts` that proves a configured team/project can be resolved against a real Linear workspace when `LINEAR_API_KEY` is present.

## Must-Haves

- [ ] `linear-config.ts` exports the exact helper names promised in the roadmap boundary map
- [ ] Mode resolution defaults safely to file mode when the project has not opted into Linear mode
- [ ] Validation results are structured, redacted, and stable enough for downstream command/status surfaces
- [ ] Validation uses the real S01 `LinearClient` rather than duplicating Linear API logic
- [ ] Unit tests cover local parsing behavior and integration tests cover real Linear team/project resolution

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.test.ts`
- `LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.integration.test.ts`

## Observability Impact

- Signals added/changed: Structured validation result with stable diagnostic codes (`missing_linear_api_key`, `missing_linear_team`, `invalid_linear_team`, `invalid_linear_project`, `linear_auth_error`, `linear_network_error`).
- How a future agent inspects this: Call `validateLinearProjectConfig()` or inspect its test snapshots/assertions to see exactly how mode/config failures are classified.
- Failure state exposed: The specific missing or invalid config field, plus auth/network distinction, becomes explicit instead of being inferred from ad hoc command output.

## Inputs

- `src/resources/extensions/kata/preferences.ts` — supplies the parsed project preference data from T01
- `src/resources/extensions/linear/linear-client.ts` — real Linear API client to reuse for validation
- `.kata/milestones/M002/slices/S01/S01-SUMMARY.md` — confirms the Linear client and document/project/issue operations are already proven against the live API
- `.kata/DECISIONS.md` D004, D008, D009 — mode is per-project, auth is API-key-based, and Linear mode treats Linear as source of truth

## Expected Output

- `src/resources/extensions/kata/linear-config.ts` — centralized mode/config loading and validation helpers
- `src/resources/extensions/kata/tests/linear-config.test.ts` — local unit coverage for normalization and diagnostics
- `src/resources/extensions/kata/tests/linear-config.integration.test.ts` — live validation proof against the Linear API
- `src/resources/extensions/kata/preferences.ts` — any supporting exports needed by the config module
- `src/resources/extensions/linear/linear-client.ts` — only if a small validation-facing helper export is needed; avoid duplicating client logic elsewhere
