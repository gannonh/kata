---
phase: 00-develop-robust-testing-suite
plan: 01
subsystem: testing
tags: [testing, harness, git, assertions, ci]
completed: 2026-01-25

dependency-graph:
  requires: []
  provides:
    - affected-test-detection
    - skill-specific-assertions
    - integration-test-patterns
  affects:
    - 00-02 (may use affected detection)
    - 00-07 (CI workflow uses affected detection)

tech-stack:
  added: []
  patterns:
    - git-diff-parsing
    - agent-skill-tracing

key-files:
  created:
    - tests/harness/affected.js
  modified:
    - tests/harness/assertions.js
    - tests/README.md

decisions:
  - id: affected-detection-via-git-diff
    choice: Use git diff with branch comparison for affected skill detection
    reason: Enables CI cost control by running only relevant tests

metrics:
  duration: 3 min
  tasks: 3
  commits: 3
---

# Phase 00 Plan 01: Extend Test Harness Summary

Extended test harness with affected-test detection and skill-specific assertions.

## One-liner

Git-diff-based affected skill detection and assertNextStepProposed/assertFileStructure assertions for deterministic skill output testing.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Create affected.js for git-diff-based test filtering | bcf97e3 | New file with getAffectedSkills(), getAffectedTestFiles(), getSkillsUsingAgent() |
| 2 | Extend assertions.js with skill-specific assertions | 419d465 | Added assertNextStepProposed(), assertFileStructure() |
| 3 | Update tests/README.md with new patterns | 9f82976 | Added Affected Test Detection, CI Integration, Integration Testing Patterns sections |

## Key Outputs

### tests/harness/affected.js

New file providing:
- `getAffectedSkills(baseBranch)` - Parses git diff to identify changed skills
- `getAffectedTestFiles(baseBranch)` - Maps affected skills to test file paths
- `getSkillsUsingAgent(agentName)` - Traces agent changes to dependent skills (cached)

Detection logic:
- Direct skill changes: `skills/kata-{name}/` -> skill affected
- Agent changes: `agents/kata-{agent}.md` -> scans SKILL.md files for spawning references

### tests/harness/assertions.js

Extended with:
- `assertNextStepProposed(result, expectedCommand)` - Validates Kata's "Next Up" section contains expected `/kata:` command
- `assertFileStructure(basePath, expectedPaths)` - Verifies all expected relative paths exist

### tests/README.md

Comprehensive documentation update:
- Affected Test Detection with usage examples
- CI Integration patterns and cost control guidance
- Writing Skill Tests best practices
- Integration Testing Patterns for orchestrator skills
- Fixture hierarchy recommendations

## Decisions Made

1. **Git diff strategy**: Use `git diff --name-only ${baseBranch}...HEAD` with fallback to `HEAD` for uncommitted changes
2. **Agent-to-skill mapping**: Scan SKILL.md files for `subagent_type` and `agent` references, cache for efficiency
3. **Test file convention**: `kata-{name}` maps to `tests/skills/{name}.test.js`

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `node -e "import('./tests/harness/affected.js').then(m => console.log('affected.js OK'))"` - PASSED
- `node -e "import('./tests/harness/assertions.js').then(m => console.log('assertions.js OK', Object.keys(m)))"` - PASSED (7 exports)
- tests/README.md contains "Affected Test Detection" section - PASSED
- tests/README.md contains "Integration Testing Patterns" section - PASSED

## Next Phase Readiness

Ready for Plan 02: Test fixtures and helper utilities. The affected detection and assertions created here will be used by actual skill tests.
