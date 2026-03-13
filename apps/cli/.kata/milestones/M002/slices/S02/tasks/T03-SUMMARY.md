---
id: T03
parent: S02
milestone: M002
provides:
  - `/kata prefs status` as the canonical inspection surface for active workflow mode and Linear config health
key_files:
  - src/resources/extensions/kata/commands.ts
  - src/resources/extensions/kata/linear-config.ts
  - src/resources/extensions/kata/tests/prefs-status.test.ts
  - src/resources/extensions/kata/docs/preferences-reference.md
key_decisions:
  - `/kata prefs status` should report effective mode plus redacted validation diagnostics instead of only file-presence checks
patterns_established:
  - Command surfaces consume `validateLinearProjectConfig()` output directly so downstream UX can stay aligned with the centralized mode/config resolver
observability_surfaces:
  - `/kata prefs status` now reports `mode`, effective/global/project preference paths, `LINEAR_API_KEY` presence, configured Linear identifiers, validation status, resolved team/project summaries, and actionable diagnostic codes without exposing secrets
  - `buildPrefsStatusReport()` provides a dependency-injectable formatter seam for command tests and future callers
duration: 35m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T03: Expose active mode and config health in `/kata prefs status`

**Wired `/kata prefs status` to the centralized Linear config resolver so it now reports active workflow mode, binding health, and redacted remediation guidance.**

## What Happened

Updated `src/resources/extensions/kata/commands.ts` so `/kata prefs status` no longer stops at “preferences file exists.” The command now builds its output from `validateLinearProjectConfig()` and includes the effective workflow mode (`file` or `linear`), effective/global/project preference paths, configured Linear identifiers, API-key presence, validation state, resolved team/project summaries, and actionable diagnostics when configuration is incomplete or invalid.

`src/resources/extensions/kata/linear-config.ts` now formats validation output into user-facing status lines, keeping failures machine-readable and actionable without leaking secrets. File-mode projects still get a useful status surface that explicitly says Linear is inactive.

Added `src/resources/extensions/kata/tests/prefs-status.test.ts` coverage for file mode, valid Linear mode, and redacted missing-auth output. Updated `src/resources/extensions/kata/docs/preferences-reference.md` to document the new status surface and show representative file-mode and Linear-mode output.

This retry also completed the missing Kata artifact work from the previous attempt by writing the task summary and marking T03 complete in the slice plan.

## Verification

Passed task verification:
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/prefs-status.test.ts`

Passed slice-level checks that are currently runnable:
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs src/resources/extensions/kata/tests/linear-config.test.ts src/resources/extensions/kata/tests/mode-switching.test.ts`
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.integration.test.ts`
- `npx tsc --noEmit`

Manual smoke checks passed by executing `buildPrefsStatusReport()` in temporary file-mode and Linear-mode projects:
- file mode reported `mode: file` and `linear: inactive (file mode)`
- Linear mode reported `mode: linear`, the configured team/project identifiers, `validation: valid`, and resolved team/project summaries
- no secret values were printed; only `LINEAR_API_KEY: present|missing`

## Diagnostics

- Run `/kata prefs status` to inspect the active workflow mode, winning preferences file, and Linear binding health.
- Use `buildPrefsStatusReport()` in tests or future command surfaces when you need the same normalized output without going through UI glue.
- Use `validateLinearProjectConfig()` when callers need the structured diagnostic codes behind the user-facing status text.

## Deviations

- None.

## Known Issues

- `src/resources/extensions/kata/tests/mode-switching.test.ts` is still pending T04, so mode-aware entrypoint coverage remains slice work that follows this task.

## Files Created/Modified

- `src/resources/extensions/kata/commands.ts` — added mode-aware `/kata prefs status` reporting via the centralized Linear config validator
- `src/resources/extensions/kata/linear-config.ts` — formatted structured validation results into redacted, actionable status lines
- `src/resources/extensions/kata/tests/prefs-status.test.ts` — added command-level coverage for file mode, valid Linear mode, and missing-auth failure output
- `src/resources/extensions/kata/docs/preferences-reference.md` — documented the richer status surface and example output
- `.kata/milestones/M002/slices/S02/S02-PLAN.md` — marked T03 complete
