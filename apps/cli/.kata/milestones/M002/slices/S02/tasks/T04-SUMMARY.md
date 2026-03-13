---
id: T04
parent: S02
milestone: M002
provides:
  - Centralized mode-aware guardrails for `/kata`, `/kata auto`, `/kata status`, doctor flows, and the dashboard shortcut
key_files:
  - src/resources/extensions/kata/linear-config.ts
  - src/resources/extensions/kata/guided-flow.ts
  - src/resources/extensions/kata/commands.ts
  - src/resources/extensions/kata/auto.ts
  - src/resources/extensions/kata/index.ts
  - src/resources/extensions/kata/tests/mode-switching.test.ts
key_decisions:
  - "D020: workflow-sensitive entrypoints must ask linear-config.ts for mode gating before touching file-backed Kata state or prompts"
patterns_established:
  - "Entry points branch through getWorkflowEntrypointGuard(); file mode proceeds unchanged, Linear mode fails fast with an explicit notice instead of silently falling back"
observability_surfaces:
  - "getWorkflowEntrypointGuard() and resolveWorkflowProtocol() expose explicit mode/protocol state"
  - "Mode-aware notices on /kata, /kata status, /kata auto, /kata doctor, and the dashboard shortcut"
  - "mode-switching.test.ts covers file-mode fallback, Linear-mode blocking, and future LINEAR-WORKFLOW readiness"
duration: 55m
verification_result: passed
completed_at: 2026-03-13T01:06:28Z
blocker_discovered: false
---

# T04: Wire centralized mode detection into Kata entrypoints without breaking file mode

**Added centralized workflow-mode guards to Kata entrypoints so Linear-configured projects are detected before any file-backed wizard, status, auto-mode, or doctor flow can run.**

## What Happened

Extended `src/resources/extensions/kata/linear-config.ts` with two new seams for downstream slices: `resolveWorkflowProtocol()` chooses the active workflow contract document (`KATA-WORKFLOW.md` vs `LINEAR-WORKFLOW.md`), and `getWorkflowEntrypointGuard()` tells callers whether a workflow-sensitive entrypoint should proceed or stop with a mode-aware notice.

Wired those guards into the main Kata entrypoints that previously assumed file mode: the guided `/kata` wizard and discuss/queue flows in `guided-flow.ts`, `/kata status` and doctor dispatch in `commands.ts`, auto-mode startup in `auto.ts`, and the dashboard/system-prompt surfaces in `index.ts`. File-mode projects still take the existing path, while Linear-configured projects now stop early with explicit messaging instead of drifting into `.kata`-file state and prompt assumptions.

Added `src/resources/extensions/kata/tests/mode-switching.test.ts` to prove three key behaviors: file mode remains the default fallback, Linear mode selects the `LINEAR-WORKFLOW.md` seam and blocks file-backed entrypoints, and the system-prompt seam becomes ready automatically once a Linear workflow prompt exists.

## Verification

Passed:
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.test.ts src/resources/extensions/kata/tests/prefs-status.test.ts src/resources/extensions/kata/tests/mode-switching.test.ts`
- `npx tsc --noEmit`

Manual smoke check passed via a temporary project configured with `workflow.mode: linear`:
- `getWorkflowEntrypointGuard("smart-entry")` returned `allow=false` with a notice explaining that `/kata` stops before falling back to `.kata` files
- `getWorkflowEntrypointGuard("status")` returned `allow=false` with a notice pointing the user to `/kata prefs status`
- `getWorkflowEntrypointGuard("auto")` returned `allow=false` with a notice that Linear auto-mode is deferred to S06

## Diagnostics

- Use `getWorkflowEntrypointGuard()` to inspect whether a surface should continue in file mode or stop early in Linear mode.
- Use `resolveWorkflowProtocol()` to see which workflow contract document is active and whether the expected prompt file actually exists.
- Run `src/resources/extensions/kata/tests/mode-switching.test.ts` for executable proof that file-mode fallback and Linear-mode blocking stay aligned.

## Deviations

- None.

## Known Issues

- Linear mode is intentionally guarded rather than fully supported here; real Linear-backed status derivation and workflow dispatch remain slice/milestone work for S05 and S06.

## Files Created/Modified

- `src/resources/extensions/kata/linear-config.ts` — added shared workflow protocol resolution and entrypoint guard helpers for mode-aware dispatch
- `src/resources/extensions/kata/guided-flow.ts` — gated `/kata`, `/kata queue`, `/kata discuss`, and workflow dispatch against the centralized mode resolver
- `src/resources/extensions/kata/commands.ts` — blocked file-backed status/doctor flows in Linear mode and routed doctor-heal prompt loading through the shared workflow resolver
- `src/resources/extensions/kata/auto.ts` — prevented `/kata auto` from starting the file-backed loop on Linear-configured projects
- `src/resources/extensions/kata/index.ts` — made the dashboard shortcut mode-aware and injected explicit Linear-mode guidance into the Kata system context
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — added regression coverage for file fallback, Linear-mode blocking, and future LINEAR-WORKFLOW readiness
- `.kata/milestones/M002/slices/S02/S02-PLAN.md` — marked T04 complete
- `.kata/DECISIONS.md` — recorded the centralized entrypoint-gating decision as D020
