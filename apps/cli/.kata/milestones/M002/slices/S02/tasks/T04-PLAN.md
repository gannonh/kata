---
estimated_steps: 5
estimated_files: 6
---

# T04: Wire centralized mode detection into Kata entrypoints without breaking file mode

**Slice:** S02 — Project Configuration & Mode Switching
**Milestone:** M002

## Description

Replace ad hoc file-mode assumptions at the main Kata entrypoints with explicit mode checks that consume the shared resolver. This closes the slice’s wiring loop: configuration now affects the actual command/runtime surfaces, while file-mode projects keep their current behavior unchanged.

## Steps

1. Audit the entrypoints that currently assume file mode (`src/resources/extensions/kata/index.ts`, `guided-flow.ts`, `commands.ts`, and any `auto.ts` preflight that needs mode awareness) and route them through `getWorkflowMode()` / `isLinearMode()` instead of direct preference parsing or implicit `.kata`-file assumptions.
2. Add centralized helper usage where mode-aware branching is required, keeping the branching explicit in code so downstream slices can swap in Linear-backed behavior without changing every caller again.
3. For Linear-configured projects, surface clear notices or guarded behavior where file-backed workflow actions are not yet implemented in S02; do not silently run the file-mode path on a Linear project.
4. Preserve current file-mode behavior exactly for non-Linear projects and cover that with regression tests.
5. Add `src/resources/extensions/kata/tests/mode-switching.test.ts` proving that entrypoints detect Linear mode through the shared resolver and that file mode remains the default/fallback path.

## Must-Haves

- [ ] Relevant Kata entrypoints consult the centralized mode resolver instead of duplicating preference parsing
- [ ] Linear-configured projects are detected before the code commits to file-mode workflow behavior
- [ ] File-mode projects remain on the current path with no regression in default behavior
- [ ] The S02 wiring is explicit enough that S06 can plug in LINEAR-WORKFLOW dispatch without redoing the config layer
- [ ] Tests prove both Linear-mode detection and safe file-mode fallback

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/mode-switching.test.ts`
- `npx tsc --noEmit`
- Manual smoke check: on a project with `workflow.mode: linear`, invoke the relevant entrypoints and confirm they recognize Linear mode rather than blindly following the file-mode path

## Observability Impact

- Signals added/changed: Entry points now expose mode-aware notices/branches instead of hiding the workflow choice behind file-mode assumptions.
- How a future agent inspects this: Check `mode-switching.test.ts` or invoke `/kata` / `/kata prefs status` to confirm which workflow path the project is on.
- Failure state exposed: Misconfigured Linear projects fail early with an explicit mode/config reason instead of drifting into confusing file-mode errors.

## Inputs

- `src/resources/extensions/kata/linear-config.ts` — centralized mode/config resolver from T02
- `src/resources/extensions/kata/index.ts` — system-prompt injection path that currently assumes the file workflow doc
- `src/resources/extensions/kata/guided-flow.ts` — workflow dispatch helper currently hard-codes `KATA-WORKFLOW.md`
- `src/resources/extensions/kata/commands.ts` — `/kata` command entrypoints and doctor dispatch
- `src/resources/extensions/kata/auto.ts` — any startup/preflight logic that must know the active mode
- Boundary map S02 → S06 — this task provides the reusable mode-aware seam that later prompt/auto-mode slices will consume

## Expected Output

- `src/resources/extensions/kata/index.ts` — mode-aware entrypoint wiring
- `src/resources/extensions/kata/guided-flow.ts` — shared resolver used before workflow dispatch
- `src/resources/extensions/kata/commands.ts` — command-layer mode-aware branching or notices
- `src/resources/extensions/kata/auto.ts` — mode-aware preflight where needed
- `src/resources/extensions/kata/linear-config.ts` — any helper additions needed by callers
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — regression coverage for both Linear mode and file mode
