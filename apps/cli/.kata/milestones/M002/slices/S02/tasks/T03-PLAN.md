---
estimated_steps: 4
estimated_files: 4
---

# T03: Expose active mode and config health in `/kata prefs status`

**Slice:** S02 — Project Configuration & Mode Switching
**Milestone:** M002

## Description

Turn the new config helpers into a real user-facing surface by teaching `/kata prefs status` to report whether the project is in file mode or Linear mode and, when Linear mode is configured, whether the team/project binding is valid and ready for later slices.

## Steps

1. Update `src/resources/extensions/kata/commands.ts` so `/kata prefs status` reads the centralized mode/config helper instead of only reporting preference-file presence.
2. Surface the effective workflow mode, the resolved project preference path, configured Linear team/project identifiers, and the validation summary from `validateLinearProjectConfig()`.
3. Make missing-env and invalid-config cases actionable: status output should tell the user whether they are still in file mode, missing `LINEAR_API_KEY`, missing a team binding, or pointing at an invalid team/project.
4. Add command-level coverage in `src/resources/extensions/kata/tests/prefs-status.test.ts` that verifies file-mode reporting, Linear-mode reporting, and redacted failure output.

## Must-Haves

- [ ] `/kata prefs status` explicitly reports `mode: file` or `mode: linear`
- [ ] Linear-mode status includes team/project identifiers and a validation summary, not just “preferences file exists”
- [ ] Missing or invalid Linear config produces actionable, non-secret output
- [ ] File-mode projects keep working and still get useful status output
- [ ] Tests cover both successful and failing status states

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/prefs-status.test.ts`
- Manual smoke check: run `/kata prefs status` in a file-mode project and a Linear-configured project; confirm the mode and validation summary match the configured state without printing secret values

## Observability Impact

- Signals added/changed: `/kata prefs status` becomes the canonical inspection surface for active workflow mode and Linear config health.
- How a future agent inspects this: Run `/kata prefs status` instead of reading raw preference files to determine whether the project is correctly configured for Linear mode.
- Failure state exposed: Users and future agents can immediately see whether the blocker is missing config, bad identifiers, or missing auth.

## Inputs

- `src/resources/extensions/kata/commands.ts` — existing `/kata prefs status` implementation currently only reports file presence
- `src/resources/extensions/kata/linear-config.ts` — validation and mode-resolution helpers from T02
- `src/resources/extensions/kata/docs/preferences-reference.md` — may need examples updated if the status wording establishes new terminology
- Requirement R105 — this is the first direct user-visible proof that per-project team configuration works

## Expected Output

- `src/resources/extensions/kata/commands.ts` — richer `/kata prefs status` output wired to the centralized config helper
- `src/resources/extensions/kata/tests/prefs-status.test.ts` — coverage for file-mode, Linear-mode, and redacted failure cases
- `src/resources/extensions/kata/linear-config.ts` — any formatter/helper additions needed for command output
- `src/resources/extensions/kata/docs/preferences-reference.md` — terminology/examples aligned with the new status surface
