---
phase: 59-brownfield-intel-gap-closure
plan: 01
subsystem: codebase-intelligence
tags: [bugfix, brownfield, staleness-detection]
requires: []
provides: [oldest-commit-fallback]
affects: [detect-stale-intel.cjs]
tech-stack: [node, git]
key-files:
  - skills/kata-map-codebase/scripts/detect-stale-intel.cjs
  - tests/scripts/detect-stale-intel.test.js
decisions: []
duration: 2 min
completed: 2026-02-18T15:15:45Z
---

# 59-01 Summary

detectBrownfieldDocStaleness now falls back to repo oldest commit via `git rev-list --max-parents=0 HEAD` when Analysis Date predates all git history, replacing the silent `no_commit_at_date` early return.

## Changes

### detect-stale-intel.cjs (lines 225-238)
Replaced the `if (!baseCommit) return { brownfieldDocStale: false, reason: 'no_commit_at_date' }` block with a fallback that queries the repo's oldest commit. Handles multiple root commits (orphan branches) by taking the first. Gracefully degrades to original behavior when `git rev-list` fails or returns empty.

### detect-stale-intel.test.js (2 new tests)
- **Fallback stale case:** Analysis Date `2020-01-01` predates repo, 4/10 source files modified after initial commit, returns `brownfieldDocStale: true` with `changePct > 0.3`
- **Fallback fresh case:** Analysis Date `2020-01-01` predates repo, no source modifications after initial commit, returns `brownfieldDocStale: false`

## Deviations

### Cherry-picked Phase 58 commits (auto-fix: blocking)
The current branch did not contain the `detectBrownfieldDocStaleness` function (added in Phase 58 on a separate unmerged branch). Cherry-picked 3 commits (`8ac5cbd`, `ce9626d`, `c8e9074`) from `docs/v1.12.0-58-brownfield-doc-auto-refresh` to unblock execution.

## Verification

- 7/7 tests pass (5 existing + 2 new)
- `npm run build:plugin` succeeds
- `npm test` passes (44/44 build tests)
- No behavioral changes to other code paths

## Commits

- `4cd79b4`: fix(59-01): add oldest-commit fallback in detectBrownfieldDocStaleness
- `b2ae6e9`: test(59-01): add fallback path tests for predated Analysis Date
