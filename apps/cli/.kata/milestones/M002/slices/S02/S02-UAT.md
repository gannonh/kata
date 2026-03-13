# S02: Project Configuration & Mode Switching — UAT

**Milestone:** M002
**Written:** 2026-03-13

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This slice changes configuration loading, CLI status output, and entrypoint dispatch logic. The strongest proof is automated contract/integration coverage plus a small CLI smoke check; there is no end-user GUI flow that requires human-experience validation yet.

## Preconditions

- Repo checked out on the S02 branch
- Node dependencies installed
- `LINEAR_API_KEY` set in the environment for the live integration check

## Smoke Test

Run:

`node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/mode-switching.test.ts`

**Expected:** file mode remains allowed, Linear mode blocks file-backed entrypoints, and protocol resolution points at `LINEAR-WORKFLOW.md` when configured.

## Test Cases

### 1. Canonical preferences + legacy fallback both parse

1. Run:
   `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs`
2. Confirm the tests covering lowercase `preferences.md` preference and uppercase `PREFERENCES.md` fallback pass.
3. **Expected:** workflow and Linear fields load from canonical lowercase config, with legacy uppercase fallback still accepted.

### 2. `/kata prefs status` surfaces mode and config health without leaking secrets

1. Run:
   `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/prefs-status.test.ts`
2. Inspect the assertions for file mode, valid Linear mode, and missing-key output.
3. **Expected:** status output shows `mode`, preference path, Linear identifiers, and validation diagnostics, but never prints raw secret values.

### 3. Live Linear binding validates against the real API

1. Ensure `LINEAR_API_KEY` is present.
2. Run:
   `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.integration.test.ts`
3. **Expected:** the configured team resolves by both ID and key, and project validation succeeds against the real Linear workspace.

### 4. Type safety stays clean after mode-aware wiring

1. Run:
   `npx tsc --noEmit`
2. **Expected:** no TypeScript errors.

## Edge Cases

### Linear mode without an API key

1. Configure a project for `workflow.mode: linear` with a `linear.teamKey` or `linear.teamId`.
2. Run `/kata prefs status` without `LINEAR_API_KEY`.
3. **Expected:** status reports `LINEAR_API_KEY: missing`, `validation: invalid`, and a remediation action instead of a crash or secret leak.

### File-mode project after Linear-mode changes land

1. Configure a project with `workflow.mode: file`.
2. Run `/kata prefs status`.
3. **Expected:** status reports `mode: file` and `linear: inactive (file mode)`.

## Failure Signals

- File-mode projects start showing Linear-only diagnostics or blocked commands
- Linear-mode projects silently enter the file-backed wizard/status/auto path
- `/kata prefs status` prints a raw API key or omits the actual validation error
- Integration test cannot resolve a known team/project despite a valid `LINEAR_API_KEY`
- TypeScript errors in `linear-config.ts`, `commands.ts`, `guided-flow.ts`, `auto.ts`, or `index.ts`

## Requirements Proved By This UAT

- R105 — proves per-project Linear team/project configuration loads, validates, and surfaces usable diagnostics

## Not Proven By This UAT

- Full Linear-backed artifact storage and state derivation (S04/S05)
- Full Linear-mode auto execution and prompt dispatch (S06)

## Notes for Tester

This slice intentionally blocks several file-backed surfaces in Linear mode. That is the expected behavior right now — it prevents misleading fallback until the Linear runtime is fully wired in later slices.
