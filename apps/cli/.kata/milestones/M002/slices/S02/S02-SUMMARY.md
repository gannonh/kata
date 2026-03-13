---
id: S02
parent: M002
milestone: M002
provides:
  - Canonical `.kata/preferences.md` workflow/Linear config with legacy uppercase fallback
  - Centralized `linear-config.ts` helpers for workflow mode, Linear team/project lookup, validation, and entrypoint guards
  - `/kata prefs status` as the canonical redacted inspection surface for active workflow mode and Linear binding health
  - Mode-aware gating for file-backed `/kata`, `/kata auto`, `/kata status`, doctor flows, and dashboard surfaces
requires:
  - slice: S01
    provides: LinearClient CRUD + error classification used to validate configured team/project bindings against the live Linear API
affects:
  - S03
  - S04
  - S05
  - S06
key_files:
  - src/resources/extensions/kata/preferences.ts
  - src/resources/extensions/kata/linear-config.ts
  - src/resources/extensions/kata/commands.ts
  - src/resources/extensions/kata/guided-flow.ts
  - src/resources/extensions/kata/auto.ts
  - src/resources/extensions/kata/index.ts
  - src/resources/extensions/kata/docs/preferences-reference.md
  - src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs
  - src/resources/extensions/kata/tests/linear-config.test.ts
  - src/resources/extensions/kata/tests/linear-config.integration.test.ts
  - src/resources/extensions/kata/tests/prefs-status.test.ts
  - src/resources/extensions/kata/tests/mode-switching.test.ts
key_decisions:
  - "D017: store workflow mode and Linear binding in canonical `.kata/preferences.md` with legacy `.kata/PREFERENCES.md` read-only fallback"
  - "D018: centralize mode/config branching in `linear-config.ts`"
  - "D019: `/kata prefs status` is the canonical inspection surface for workflow mode and Linear config health"
  - "D020: workflow-sensitive entrypoints must gate through `linear-config.ts` before touching file-backed Kata state or prompts"
patterns_established:
  - "Normalize workflow/Linear frontmatter before any caller consumes preferences"
  - "Validate Linear bindings through a structured redacted result shape with stable diagnostic codes"
  - "Gate workflow-sensitive entrypoints through `getWorkflowEntrypointGuard()` so Linear mode fails fast instead of silently falling back"
observability_surfaces:
  - "`/kata prefs status`"
  - "`validateLinearProjectConfig()` diagnostic codes"
  - "`getWorkflowEntrypointGuard()` / `resolveWorkflowProtocol()`"
drill_down_paths:
  - .kata/milestones/M002/slices/S02/tasks/T01-SUMMARY.md
  - .kata/milestones/M002/slices/S02/tasks/T02-SUMMARY.md
  - .kata/milestones/M002/slices/S02/tasks/T03-SUMMARY.md
  - .kata/milestones/M002/slices/S02/tasks/T04-SUMMARY.md
duration: ~3h15m
verification_result: passed
completed_at: 2026-03-13T01:20:00Z
---

# S02: Project Configuration & Mode Switching

**Per-project Linear mode configuration now loads through one shared resolver, validates against the live Linear API, surfaces redacted health via `/kata prefs status`, and blocks file-backed entrypoints from silently misrouting Linear projects.**

## What Happened

This slice turned Linear mode from a roadmap idea into a real configuration seam. First, project preferences gained an explicit `workflow.mode` plus a `linear` config block, with new projects bootstrapped onto canonical lowercase `.kata/preferences.md` while still reading legacy `.kata/PREFERENCES.md` for backward compatibility. That removed the path split without breaking existing projects.

Next, the slice created `src/resources/extensions/kata/linear-config.ts` as the one source of truth for workflow mode and Linear binding resolution. It now owns workflow normalization, team/project lookup, live validation through the S01 `LinearClient`, protocol resolution, and entrypoint guards. Validation is deliberately structured and redacted: callers get stable diagnostic codes like `missing_linear_api_key`, `invalid_linear_team`, and `invalid_linear_project` instead of raw API failures.

With that seam in place, `/kata prefs status` became the canonical inspection surface for users and future agents. It reports the effective mode, winning preferences file, configured Linear identifiers, API-key presence, resolved team/project summaries, and actionable diagnostics without exposing secrets. Finally, the slice wired mode-aware gating into the file-backed Kata entrypoints so Linear-configured projects are detected before `/kata`, `/kata auto`, `/kata status`, doctor flows, or the dashboard can silently drift into `.kata`-file assumptions. File mode keeps the existing behavior unchanged.

## Verification

Passed:
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs src/resources/extensions/kata/tests/linear-config.test.ts src/resources/extensions/kata/tests/mode-switching.test.ts src/resources/extensions/kata/tests/prefs-status.test.ts`
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.integration.test.ts`
- `npx tsc --noEmit`

Manual smoke checks passed:
- file-mode config resolved to `mode: file` with `linear: inactive (file mode)`
- Linear-mode config resolved to `mode: linear` with configured team/project identifiers and actionable validation output
- guarded entrypoint checks proved `/kata`, `/kata status`, and `/kata auto` stop early in Linear mode instead of falling back to file-backed behavior

## Requirements Advanced

- R101 — established the per-project mode-switching seam and guarded runtime behavior that later Linear slices will consume
- R107 — introduced protocol resolution and system-prompt awareness so S06 can swap in `LINEAR-WORKFLOW.md` without reworking every caller
- R109 — established the explicit status/dashboard guardrails that prevent misleading file-backed progress output in Linear mode before S05 lands

## Requirements Validated

- R105 — project-level Linear team/project configuration now loads from canonical preferences, validates against the live Linear API, and surfaces actionable diagnostics through `/kata prefs status`

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- None.

## Known Limitations

- Linear mode is still configuration-only at this point; S03–S06 must still map entities, store documents, derive state, and execute the full workflow against Linear.
- `/kata status`, the dashboard, doctor flows, and `/kata auto` intentionally block in Linear mode instead of attempting partial file-backed behavior.

## Follow-ups

- S03 should consume `linear-config.ts` directly when mapping Kata milestones/slices/tasks onto Linear milestones/issues/labels.
- S05 should replace the current Linear-mode status/dashboard guardrails with real Linear-derived progress.
- S06 should add the real `LINEAR-WORKFLOW.md` prompt and swap guarded entrypoints over to Linear-backed execution.

## Files Created/Modified

- `src/resources/extensions/kata/preferences.ts` — added workflow/Linear preference schema, normalization, and canonical-vs-legacy preference loading
- `src/resources/extensions/kata/gitignore.ts` — bootstraps canonical lowercase project preferences
- `src/resources/extensions/kata/templates/preferences.md` — documents workflow mode and Linear config fields in the generated template
- `src/resources/extensions/kata/docs/preferences-reference.md` — documents the new schema and `/kata prefs status` output
- `src/resources/extensions/kata/linear-config.ts` — centralized workflow mode, Linear binding validation, protocol resolution, and entrypoint guards
- `src/resources/extensions/kata/commands.ts` — wired `/kata prefs status` and workflow-sensitive command gating through the centralized config seam
- `src/resources/extensions/kata/guided-flow.ts` — gated wizard/discuss/queue dispatch through workflow-mode guards
- `src/resources/extensions/kata/auto.ts` — blocks file-backed auto-mode startup in Linear mode
- `src/resources/extensions/kata/index.ts` — made dashboard/system prompt mode-aware
- `src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs` — covers nested frontmatter and canonical/legacy preference path compatibility
- `src/resources/extensions/kata/tests/linear-config.test.ts` — covers helper behavior and structured validation diagnostics
- `src/resources/extensions/kata/tests/linear-config.integration.test.ts` — proves live team/project resolution against Linear
- `src/resources/extensions/kata/tests/prefs-status.test.ts` — covers redacted status output for file mode and Linear mode
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — covers file fallback, Linear-mode blocking, and future workflow-protocol readiness

## Forward Intelligence

### What the next slice should know
- `linear-config.ts` is now the single seam for workflow mode, protocol selection, and Linear binding validation — do not re-parse preferences in downstream slices.
- `LINEAR-WORKFLOW.md` does not exist yet, but protocol resolution and system-prompt guidance are already in place so S06 only has to provide the real document and switch call sites from guarded-blocked to guarded-dispatch.

### What's fragile
- Status/dashboard/doctor/auto are intentionally blocked in Linear mode — if a downstream slice partially enables one of these surfaces without full Linear data behind it, users will get misleading state.

### Authoritative diagnostics
- `/kata prefs status` — best user/agent-visible source for the active workflow mode and Linear config health
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — best regression proof that file-mode fallback and Linear-mode blocking stay aligned

### What assumptions changed
- "Mode switching can wait until the real Linear workflow prompt exists" — false; we needed explicit runtime guards now to prevent Linear-configured projects from silently taking the file-backed path and producing confusing `.kata`-file errors
