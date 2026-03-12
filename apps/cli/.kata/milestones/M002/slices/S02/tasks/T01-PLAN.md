---
estimated_steps: 4
estimated_files: 5
---

# T01: Extend project preferences for workflow mode and Linear binding

**Slice:** S02 — Project Configuration & Mode Switching
**Milestone:** M002

## Description

Add the configuration surface that makes mode switching possible: typed preference fields for workflow mode and Linear binding, backward-compatible project preference file loading, and updated docs/templates that show users how to opt a project into Linear mode.

## Steps

1. Extend `KataPreferences` in `src/resources/extensions/kata/preferences.ts` with explicit `workflow` and `linear` sections, including a normalized `workflow.mode` enum (`file` | `linear`) and typed fields for `linear.teamId`, `linear.teamKey`, and `linear.projectId`.
2. Fix project preference-file resolution so the canonical path is `.kata/preferences.md` while still reading legacy `.kata/PREFERENCES.md` when present. Update `gitignore.ts` so newly bootstrapped projects get the canonical filename and do not create fresh uppercase-only files.
3. Update `src/resources/extensions/kata/templates/preferences.md` and `src/resources/extensions/kata/docs/preferences-reference.md` to document the new fields, their allowed values, and the fact that secrets remain in env vars rather than preferences.
4. Add parser/compatibility coverage in `src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs` for nested workflow/linear frontmatter and for lowercase/uppercase filename fallback.

## Must-Haves

- [ ] `KataPreferences` can represent `workflow.mode` and the Linear binding fields needed by the S02→S06 boundary contract
- [ ] Project preference loading accepts `.kata/preferences.md` first and still falls back to `.kata/PREFERENCES.md` for backward compatibility
- [ ] Bootstrapped preference templates show the new workflow/linear config shape
- [ ] Documentation explains how to opt into Linear mode without storing secrets in preferences
- [ ] Parser tests prove nested config loads correctly and the legacy filename still works

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs`
- Read the rendered template/docs and confirm they match the actual TypeScript schema (`workflow.mode`, `linear.teamId|teamKey|projectId`) and avoid secret fields

## Observability Impact

- Signals added/changed: None at runtime yet; this task establishes the durable config fields later tasks will inspect.
- How a future agent inspects this: Open `.kata/preferences.md` and `preferences.ts` to see the exact supported fields; parser tests prove the accepted shapes.
- Failure state exposed: Legacy filename support becomes explicit and test-covered instead of silently depending on one casing.

## Inputs

- `src/resources/extensions/kata/preferences.ts` — Existing preferences schema and frontmatter parser
- `src/resources/extensions/kata/gitignore.ts` — Current project bootstrap writes `PREFERENCES.md`; this task normalizes that behavior
- `src/resources/extensions/kata/templates/preferences.md` — Template users see when creating project preferences
- `src/resources/extensions/kata/docs/preferences-reference.md` — User-facing reference that must reflect the real schema
- `.kata/DECISIONS.md` D004, D008 — per-project mode switch and API-key auth are already locked

## Expected Output

- `src/resources/extensions/kata/preferences.ts` — typed workflow/linear preference support plus lowercase/uppercase file compatibility
- `src/resources/extensions/kata/gitignore.ts` — canonical project preference bootstrap path
- `src/resources/extensions/kata/templates/preferences.md` — template with workflow + linear blocks
- `src/resources/extensions/kata/docs/preferences-reference.md` — documentation for the new config surface
- `src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs` — regression coverage for nested config and filename compatibility
