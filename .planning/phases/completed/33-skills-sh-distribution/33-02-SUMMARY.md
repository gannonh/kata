---
phase: 33-skills-sh-distribution
plan: 02
subsystem: build-system, ci-pipeline
tags: [skills-sh, distribution, ci, build-target, kata-skills]
requires:
  - spec-compliant-skill-frontmatter
provides:
  - skills-sh-build-target
  - skills-sh-ci-pipeline
affects: []
tech-stack:
  added: []
  patterns: [cross-repo-publish]
key-files:
  created:
    - none
  modified:
    - scripts/build.js
    - package.json
    - tests/build.test.js
    - .github/workflows/plugin-release.yml
decisions:
  - workflow-name-updated: renamed from "Publish Plugin to Marketplace" to "Publish Plugin to Marketplace and Skills Registry"
metrics:
  duration: 5m
  completed: 2026-02-06
---

# Phase 33 Plan 02: Skills-sh Build Target and CI Pipeline Summary

Build system produces `dist/skills-sh/` distribution and CI pipeline pushes it to `gannonh/kata-skills` on release alongside the existing marketplace publish.

## What Was Done

### Task 1: Add buildSkillsSh() to build.js + npm script + build test

Added `buildSkillsSh()` function to `scripts/build.js` that:
- Cleans and creates `dist/skills-sh/`
- Copies `skills/` directory (no transformation needed after Plan 01 normalization)
- Generates `README.md` from skill frontmatter metadata with install instructions and skill table
- Strips "Triggers include..." suffixes from descriptions (Claude Code-specific, not useful for skills.sh)
- Generates MIT `LICENSE` file
- Validates output structure and prints build summary

Added `build:skills-sh` npm script to `package.json`.

Added `Skills-sh build` describe block to `tests/build.test.js` with 9 tests covering: directory creation, skills inclusion (>=29), README/LICENSE presence, excluded files (hooks, .claude-plugin, CHANGELOG, VERSION), and README content validation.

### Task 2: Checkpoint (human-verify)

User created `gannonh/kata-skills` repo (public, empty) and configured `SKILLS_TOKEN` repository secret in `gannonh/kata-orchestrator`.

### Task 3: Extend CI pipeline to build and push skills-sh on release

Added 5 new steps to `.github/workflows/plugin-release.yml` after the existing marketplace push:
1. Build skills.sh distribution (`node scripts/build.js skills-sh`)
2. Validate skills-sh build (check dirs, files, skill count)
3. Checkout `gannonh/kata-skills` using `SKILLS_TOKEN`
4. Update kata-skills with built output (clean + copy)
5. Commit and push to kata-skills

All steps guarded by `steps.check.outputs.should_publish == 'true'`. Pattern mirrors existing marketplace publish flow.

Updated workflow name to "Publish Plugin to Marketplace and Skills Registry".

## Deviations from Plan

None.

## Commits

- `20664ba`: feat(33-02): add skills-sh build target to build system
- `d622f8a`: feat(33-02): extend CI pipeline to build and push skills-sh on release

## Decisions Made

| Decision | Rationale |
| -------- | --------- |
| Updated workflow name | Reflects dual-publish responsibility (marketplace + skills registry) |

## Verification Results

- `npm run build:skills-sh` produces `dist/skills-sh/` with `skills/`, `README.md`, `LICENSE`
- No excluded files (hooks, .claude-plugin, CHANGELOG, VERSION) in output
- README contains install command and skill table, no trigger phrases
- `npm test` passes (44/44 tests)
- YAML validates without errors
- `grep -c "kata-skills"` returns 11 (workflow references)
- `SKILLS_TOKEN` reference present in workflow
