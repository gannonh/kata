---
phase: 07
plan: 04
subsystem: documentation
tags: [docs, readme, claude-md, style-guide, plugin-only]
requires: [07-01]
provides: [plugin-only-documentation]
affects: [user-onboarding, developer-documentation]
key-files:
  created: []
  modified:
    - README.md
    - CLAUDE.md
    - KATA-STYLE.md
decisions: []
metrics:
  duration: 3 min
  completed: 2026-01-27
---

# Phase 07 Plan 04: Update Documentation Summary

**One-liner:** Updated all user-facing documentation to reflect plugin-only distribution

## What Was Done

### Task 1: Update README.md

Removed all NPX-related content from README.md:
- Removed npm version badge from badge section
- Removed "Or install via NPM" / `npx @gannonh/kata` from quick install
- Renamed "Recommended: Plugin Install" to "Install as Claude Code Plugin"
- Removed "Alternative: NPM Install" collapsible section
- Simplified "Staying Updated" section (removed NPX update commands)
- Removed "Non-interactive Install" section (Docker, CI, Scripts)

Commit: `32b2943`

### Task 2: Update CLAUDE.md and KATA-STYLE.md

CLAUDE.md updates:
- Updated skills path reference from `skills/kata-*/SKILL.md` to `skills/*/SKILL.md`
- Removed NPX row from Invocation Syntax table
- Removed NPX verification commands from Installation and Testing section
- Removed NPX paths from Available Skills section
- Simplified table headers (removed "Invocation (plugin)" to just "Invocation")

KATA-STYLE.md updates:
- Removed NPM row from build target transformation table

Commit: `8ae10a6`

## Deviations from Plan

None - plan executed exactly as written.

## Files Modified

| File | Changes |
| ---- | ------- |
| README.md | Removed npm badge, NPX installation, NPX update commands |
| CLAUDE.md | Removed NPX invocation syntax, NPX paths |
| KATA-STYLE.md | Removed NPM build target reference |

## Verification Results

- `grep -r "npx @gannonh"` returns nothing in all three files
- README.md installation section shows plugin-only
- CLAUDE.md skills table shows `/kata:` syntax only
- No broken links or references

## Next Phase Readiness

All documentation now reflects plugin-only distribution. Users will see consistent messaging about installing via Claude Code plugin only.
