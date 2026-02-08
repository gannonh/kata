---
phase: 41-validation-migration
plan: 01
subsystem: validation
tags: [bash, node, config-validation, template-drift, sibling-discovery]
requires: [40-template-resolution]
provides: [check-config-script, check-template-drift-script]
affects: [41-02, 42-template-customization-skill]
tech-stack:
  added: []
  patterns: [inline-node-heredoc, sibling-discovery]
key-files:
  created:
    - skills/kata-doctor/scripts/check-config.sh
    - skills/kata-doctor/scripts/check-template-drift.sh
  modified: []
key-decisions:
  - Scripts use inline Node.js with single-quoted heredoc (NODE_EOF) for JSON parsing
  - Sibling discovery navigates two levels up from scripts/ to skills/
  - Both scripts always exit 0 (warnings only, never blocking)
  - Config schema matches the 17-key KNOWN_KEYS object from kata-config-validator.js
patterns-established:
  - Validation scripts in kata-doctor/scripts/ as portable alternatives to SessionStart hooks
duration: 4 min
completed: 2026-02-08
---

# Phase 41 Plan 01: Validation Scripts Summary

Bash validation scripts porting SessionStart hook logic to portable scripts using inline Node.js heredocs and sibling discovery.

## Performance

- Duration: 4 min
- Tasks: 3/3 (2 auto + 1 checkpoint)
- Deviations: 0

## Accomplishments

1. Created `check-config.sh` that validates `.planning/config.json` against the 17-key schema from `kata-config-validator.js`
2. Created `check-template-drift.sh` that detects missing required fields in template overrides using sibling skill discovery
3. Both scripts use the inline Node.js heredoc pattern from `read-pref.sh` with single-quoted delimiters
4. Both scripts use the sibling discovery pattern from Phase 40's `resolve-template.sh`
5. Neither script references `CLAUDE_PLUGIN_ROOT`

## Task Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | f4c6464 | Create check-config.sh validation script |
| 2 | dfb2795 | Create check-template-drift.sh validation script |

## Files Created/Modified

**Created:**
- `skills/kata-doctor/scripts/check-config.sh` (87 lines) - Config validation with 17-key schema
- `skills/kata-doctor/scripts/check-template-drift.sh` (106 lines) - Template drift detection with sibling discovery

## Decisions Made

| Decision | Rationale |
| -------- | --------- |
| Inline Node.js for JSON parsing | Pure Bash JSON parsing is fragile; follows established read-pref.sh pattern |
| Single-quoted heredoc delimiter | Prevents Bash variable expansion inside Node.js code |
| Always exit 0 | Validation warnings are informational; scripts run in skill pre-flight where non-zero would abort the skill |
| Sibling discovery for template defaults | Works across all installation layouts (plugin, skills-only, manual) |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Plan 41-02 can proceed immediately. It wires these scripts into skill pre-flight sections and removes the SessionStart hooks.
