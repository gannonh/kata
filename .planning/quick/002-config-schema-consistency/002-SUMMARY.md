# Quick Task 002: Config Schema Consistency & PR Workflow Features

**Date:** 2026-01-22
**Commits:** f41792b, 64036b7, 9161169, 8172949, 325d86c

## What Changed

### 1. Config Schema Consistency

**kata-configuring-settings/SKILL.md**
- Added missing key detection for `commit_docs` and `pr_workflow`
- Display notification when new config options are available
- Added `commit_docs` question to settings flow
- Updated success criteria to include 6 settings

**kata-starting-projects/SKILL.md**
- Aligned PR Workflow default to "No (Recommended)" (direct commits)

**kata/references/planning-config.md**
- Complete rewrite with full config schema
- Documented all 9 config options with defaults
- Added standard patterns for reading config values
- Added `pr_workflow_behavior` section
- Added `workflow_agents` section
- Added `updating_settings` section

### 2. PR Creation in Milestone Completion

**kata-completing-milestones/SKILL.md**
- When `pr_workflow=true`, offer to create PR via `gh pr create`
- Push branch and create PR with milestone summary
- User still manually creates GitHub Release after merge (for now)

### 3. GitHub Actions Scaffolding

**kata-starting-projects/SKILL.md**
- When `pr_workflow=true`, ask if user wants GH Actions release workflow
- If yes, scaffold `.github/workflows/release.yml`
- Workflow auto-publishes to npm when version changes on main
- Creates GitHub Release with tag automatically
- Displays setup instructions for NPM_TOKEN secret

## Config Schema (Complete)

```json
{
  "mode": "yolo|interactive",
  "depth": "quick|standard|comprehensive",
  "parallelization": true|false,
  "model_profile": "quality|balanced|budget",
  "commit_docs": true|false,
  "pr_workflow": true|false,
  "workflow": {
    "research": true|false,
    "plan_check": true|false,
    "verifier": true|false
  }
}
```

## PR Workflow Flow (when enabled)

1. User works on feature branch
2. `/kata:milestone-complete` offers to create PR
3. User merges PR to main
4. GH Actions (if scaffolded):
   - Detects version change in package.json
   - Publishes to npm
   - Creates GitHub Release with tag

## Files Modified

- `skills/kata-configuring-settings/SKILL.md`
- `skills/kata-starting-projects/SKILL.md`
- `skills/kata-completing-milestones/SKILL.md`
- `kata/references/planning-config.md`
- `.planning/todos/pending/2026-01-18-npm-release-workflow-support.md`
