---
phase: 02-github-issue-sync
plan: 02
subsystem: check-issues
tags: [github, gh-cli, issues, deduplication, provenance]
requires:
  - 02-01 (GitHub sync for add-issue)
provides:
  - Unified issue view from local and GitHub sources
  - Pull-to-local action for GitHub Issues
  - Provenance-based deduplication
affects:
  - 02-03 (execution linking may use similar patterns)
tech_stack:
  added: []
  patterns: [gh-cli-json-query, provenance-tracking, dedupe-by-field]
key_files:
  created: []
  modified:
    - skills/check-issues/SKILL.md
decisions:
  - "GitHub-only issues marked with [GH] indicator"
  - "Deduplication via provenance field (github:owner/repo#N)"
  - "Pull to local creates file in open/ directory"
metrics:
  duration: 5 min
  completed: 2026-02-01
---

# Phase 02 Plan 02: GitHub Issue Pull for check-issues Summary

**GitHub Issues with `backlog` label now appear in unified check-issues display with [GH] indicator; pull-to-local creates provenance-tracked local files.**

## What Was Done

### Task 1: GitHub Issue Query (7baaaee)
Added GitHub integration to the `list_issues` step:
- Config check: `GITHUB_ENABLED` from `.planning/config.json`
- Dedupe list: Extract GitHub issue numbers from local files' `provenance` fields
- GitHub query: `gh issue list --label "backlog"` when enabled
- Merge display: Local issues show area, GitHub-only issues show `[GH]` indicator

### Task 2: Pull-to-Local Action (6a7129c)
Added GitHub-specific actions in `offer_actions` and `execute_action`:
- "Pull to local" creates `.planning/issues/open/` file with provenance
- "Work on it now" for GitHub issues: pull + move to closed
- "View on GitHub" opens issue in browser via `gh issue view --web`
- Load context fetches GitHub issue details for [GH] issues

### Task 3: Metadata Updates (3a9ee67)
Updated skill metadata:
- Description: Added "github issues", "backlog issues", "pull issues" triggers
- Output: Added "Pull to local" artifact
- Success criteria: Added GitHub-specific checks (deduplication, [GH] indicator)

## Key Patterns

### Provenance Tracking
```yaml
provenance: github:owner/repo#42
```
This field in local issue files enables deduplication. When listing issues, the skill extracts all GitHub issue numbers from local provenance fields and excludes them from the GitHub query results.

### Conditional GitHub Integration
```bash
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```
GitHub features only activate when `github.enabled=true` in config.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- [x] GitHub config check pattern present
- [x] `gh issue list --label "backlog"` query present  
- [x] Deduplication logic using provenance field
- [x] [GH] indicator for GitHub-only issues
- [x] "Pull to local" action creates file with provenance
- [x] No old "todo" vocabulary introduced

## Next Phase Readiness

Plan 02-03 (execution linking) can proceed. This plan establishes:
- The `provenance` field pattern for tracking GitHub references
- The `gh issue view` pattern for fetching issue details
- The dual-source display pattern (local + GitHub)
