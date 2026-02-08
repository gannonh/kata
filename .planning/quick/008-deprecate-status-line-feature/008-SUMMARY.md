---
phase: quick
plan: "008"
status: complete
started: 2026-02-08
completed: 2026-02-08
commits:
  - hash: 3c233ac
    message: "chore(quick-008): delete statusline hooks and clean infrastructure"
  - hash: 09f3ea2
    message: "chore(quick-008): remove statusline from skills and config docs"
deviations:
  - "Removed stale build artifacts from hooks/dist/ (3 files: kata-statusline.js, kata-plugin-statusline.js, kata-setup-statusline.js). Only kata-statusline.js was git-tracked but gitignored, so no additional commit needed."
---

# Quick Task 008: Remove Statusline Feature

## What Changed

Removed the deprecated statusline feature from the Kata codebase.

### Files Deleted (3)
- `hooks/kata-setup-statusline.js` — SessionStart hook
- `hooks/kata-plugin-statusline.js` — Plugin statusline hook
- `.claude/hooks/kata-statusline.js` — Project-local copy

### Files Edited (8)
- `hooks/hooks.json` — Removed kata-setup-statusline.js entry from SessionStart array
- `hooks/kata-config-validator.js` — Removed `display.statusline` from KNOWN_KEYS
- `scripts/build-hooks.cjs` — Removed 3 statusline entries from HOOKS_TO_COPY
- `skills/kata-configure-settings/SKILL.md` — Removed statusline read-pref, settings UI question, set-config call, side-effects sections, summary table row, success criterion
- `skills/kata-configure-settings/scripts/read-pref.sh` — Removed `display.statusline` default
- `skills/kata-new-project/SKILL.md` — Removed `display.statusline` from config schema, removed statusline setup section
- `skills/kata-execute-phase/references/planning-config.md` — Removed `display.statusline` from schema, reference table, and `<display_settings>` section
- `.planning/config.json` — Removed `"display": { "statusline": false }` block

### Build Artifacts Cleaned
- `hooks/dist/kata-statusline.js` — Removed (was git-tracked, gitignored)
- `hooks/dist/kata-plugin-statusline.js` — Removed (untracked)
- `hooks/dist/kata-setup-statusline.js` — Removed (untracked)

## Verification

All checks passed:
- Zero statusline references in hooks/, scripts/, skills/, .planning/config.json, .claude/
- hooks.json valid JSON
- config.json valid JSON
- `npm run build:plugin` succeeds
