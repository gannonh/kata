---
phase: 41-validation-migration
plan: 02
subsystem: validation
tags: [hooks, pre-flight, config-validation, template-drift, build-system]
requires:
  - "41-01 (validation scripts)"
provides:
  - "Skill-based validation pre-flight for all orchestrator skills"
  - "Hooks system removed"
  - "Clean build pipeline without hooks"
affects:
  - "42 (customization skill may reference validation scripts)"
  - "43 (documentation should cover new validation approach)"
tech-stack:
  added: []
  patterns:
    - "Pre-flight validation via bash scripts in skill orchestration"
    - "${SKILL_BASE_DIR}/../kata-doctor/scripts/ cross-skill script reference pattern"
key-files:
  created: []
  modified:
    - skills/kata-execute-phase/SKILL.md
    - skills/kata-plan-phase/SKILL.md
    - skills/kata-complete-milestone/SKILL.md
    - skills/kata-add-milestone/SKILL.md
    - skills/kata-verify-work/SKILL.md
    - scripts/build.js
    - package.json
    - tests/build.test.js
    - tests/artifact-validation.test.js
  deleted:
    - hooks/hooks.json
    - hooks/kata-template-drift.js
    - hooks/kata-config-validator.js
    - scripts/build-hooks.cjs
decisions:
  - "Template drift check omitted from kata-add-milestone (does not resolve templates)"
  - "kata-verify-work gets new pre_flight section (had no pre-flight before)"
  - "Tests updated to validate new architecture rather than old hooks presence"
metrics:
  duration: "4 min"
  completed: 2026-02-08
---

# Phase 41 Plan 02: Wire validation into skills and remove hooks Summary

Migrated validation from SessionStart hooks to skill pre-flight sections, then removed the entire hooks system and associated build infrastructure.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Add validation pre-flight calls to 5 skills | 75be15f | 5 SKILL.md files updated with check-config.sh and/or check-template-drift.sh calls |
| 2 | Remove hooks and clean up build infrastructure | 35b7034 | hooks/ deleted, build-hooks.cjs deleted, build.js and package.json cleaned, tests updated |
| 3 | End-to-end verification | (checkpoint) | User verified build, dist, tests all clean |

## What Changed

**Task 1: Validation pre-flight calls**

Added validation script calls to 5 orchestrator skills using the existing `${SKILL_BASE_DIR}/../kata-doctor/scripts/` pattern:

- **kata-execute-phase**: check-config.sh + check-template-drift.sh (reads config, resolves templates)
- **kata-plan-phase**: check-config.sh + check-template-drift.sh (reads config, resolves templates)
- **kata-complete-milestone**: check-config.sh + check-template-drift.sh (reads config, resolves templates)
- **kata-add-milestone**: check-config.sh only (reads config, does not resolve templates)
- **kata-verify-work**: check-config.sh + check-template-drift.sh in new `<pre_flight>` section

All calls use `2>/dev/null || true` for defensive execution.

**Task 2: Hooks removal**

Removed:
- `hooks/hooks.json` (hook registry)
- `hooks/kata-template-drift.js` (SessionStart hook)
- `hooks/kata-config-validator.js` (SessionStart hook)
- `scripts/build-hooks.cjs` (dead code referencing nonexistent kata-check-update.js)

Updated:
- `scripts/build.js`: removed 'hooks' from INCLUDES, removed hooks-specific dist exclusion
- `package.json`: removed build:hooks and prepublishOnly scripts
- `tests/build.test.js`: "includes hooks" test flipped to "does NOT include hooks", Hook scripts suite replaced with Validation scripts suite
- `tests/artifact-validation.test.js`: removed 'hooks' from required directories

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed trailing comma in package.json**
- **Found during:** Task 2
- **Issue:** Removing the last two script entries left a trailing comma on the preceding line, producing invalid JSON
- **Fix:** Removed trailing comma from build:skills-sh line
- **Files modified:** package.json
- **Commit:** 35b7034

**2. [Rule 2 - Missing Critical] Updated test assertions for new architecture**
- **Found during:** Task 2
- **Issue:** Existing tests expected hooks directory in dist and validated hook ES module syntax. Removing hooks would break 3 tests.
- **Fix:** Updated build.test.js to assert hooks absence and validate new scripts. Updated artifact-validation.test.js to remove hooks from required dirs.
- **Files modified:** tests/build.test.js, tests/artifact-validation.test.js
- **Commit:** 35b7034

## Decisions Made

1. **Template drift check omitted from kata-add-milestone** - This skill reads config but never resolves templates, so check-template-drift.sh would produce false positives.
2. **kata-verify-work gets a new pre_flight section** - Unlike the other 4 skills that already had a pre-flight section with roadmap format checks, verify-work had none. Added a dedicated `<pre_flight>` block between `</context>` and `<process>`.
3. **Tests updated inline** - Rather than leaving broken tests, updated test expectations to match the new architecture in the same commit as the removal.

## Verification

- 44/44 tests pass
- `npm run build:plugin` succeeds
- `dist/plugin/` contains no hooks directory
- `dist/plugin/skills/kata-doctor/scripts/` contains both validation scripts
- All 5 skills have correct pre-flight calls
- User verified end-to-end at checkpoint

## Next Phase Readiness

Phase 41 (Validation Migration) is complete with both plans executed:
- Plan 01: Created check-config.sh and check-template-drift.sh
- Plan 02: Wired scripts into skills and removed hooks

Phase 42 (Customization Skill) can proceed. No blockers.
