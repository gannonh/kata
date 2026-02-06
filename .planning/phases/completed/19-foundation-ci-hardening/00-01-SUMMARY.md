---
phase: 00-foundation-ci-hardening
plan: 01
subsystem: testing
tags: [artifact-validation, ci, tests]
depends_on: []
provides: [artifact-validation-tests, test-artifacts-script]
affects: [00-02, ci-workflow]
tech_stack:
  added: []
  patterns: [recursive-file-scanning, frontmatter-parsing]
key_files:
  created:
    - tests/artifact-validation.test.js
  modified:
    - package.json
decisions: []
metrics:
  duration: 3 min
  completed: 2026-01-28
---

# Phase 00 Plan 01: Create Artifact Validation Test Suite Summary

**One-liner:** Comprehensive test suite validating built plugin artifacts with 13 tests covering structure, path transformations, reference resolution, and frontmatter.

## What Was Built

Created `tests/artifact-validation.test.js` with 4 test sections:

1. **Structure validation** (4 tests)
   - dist/plugin/ directory exists
   - Required directories (.claude-plugin, skills, agents, commands, hooks)
   - VERSION file matches package.json
   - plugin.json has name, version, description

2. **Path transformation validation** (4 tests)
   - All Kata subagent_type attributes have kata: prefix
   - No @~/.claude/ references (except CHANGELOG.md)
   - No @$KATA_BASE/ patterns
   - No @${VAR}/ syntax outside code blocks

3. **Reference resolution validation** (2 tests)
   - @./references/ paths in skills resolve to existing files
   - @./references/ paths in agents resolve to existing files

4. **Frontmatter validation** (3 tests)
   - All SKILL.md files have name and description
   - All agent .md files have description
   - Skill descriptions are meaningful (>= 10 chars)

## Package.json Updates

Added scripts:
- `test:artifacts`: Runs only artifact validation tests
- Updated `test:all`: Now includes artifact-validation.test.js

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 3cd1932 | test | Create artifact validation test suite |
| 86407c6 | chore | Add test:artifacts script |

## Verification Results

All success criteria met:
- [x] `npm run build:plugin` succeeds
- [x] `npm run test:artifacts` runs and passes (13/13 tests)
- [x] Tests fail if a subagent_type is missing kata: prefix (only for Kata agents)
- [x] Tests fail if @~/.claude/ reference exists in built plugin
- [x] Tests fail if @./references/ path doesn't resolve

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed subagent_type validation scope**

- **Found during:** Task 1 verification
- **Issue:** Test flagged `subagent_type="general-purpose"` as missing kata: prefix, but this is a built-in Claude Code agent type, not a Kata agent
- **Fix:** Updated test to only check for Kata agent references (those starting with `kata-`), allowing built-in agents like `general-purpose`, `Explore`, `Plan`
- **Files modified:** tests/artifact-validation.test.js
- **Commit:** 3cd1932 (included in initial commit)

## Next Phase Readiness

Plan 00-02 (CI workflow integration) can proceed. The test:artifacts script is ready to be added to CI.
