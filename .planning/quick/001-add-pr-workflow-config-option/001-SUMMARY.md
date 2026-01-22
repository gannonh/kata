---
quick_task: 001
description: Add PR workflow config option to milestone completion
status: complete
started: 2026-01-22
completed: 2026-01-22
duration_minutes: 10

delivers:
  - pr_workflow config option in config.json schema
  - PR workflow question in project setup (kata-starting-projects)
  - PR workflow toggle in settings (kata-configuring-settings)
  - Skip git tag when pr_workflow=true (kata-completing-milestones)
  - Pre-flight changelog/version bump reminder

commits:
  - 61aefe9: feat(quick-001) add PR workflow support to milestone completion
  - f8869c4: feat(quick-001) add PR workflow config to project setup
  - 975f1d3: feat(quick-001) add PR workflow toggle to settings

files_modified:
  - skills/kata-completing-milestones/SKILL.md
  - skills/kata-starting-projects/SKILL.md
  - skills/kata-configuring-settings/SKILL.md
---

# Quick Task 001 Summary

**One-liner:** Added `pr_workflow` config option enabling PR-based release workflow with deferred GitHub Release tagging

## Changes Made

### kata-completing-milestones/SKILL.md
- Added pre-flight step (step 0) to check CHANGELOG.md and package.json are updated
- Modified step 7 to check `pr_workflow` config before creating git tag
- If `pr_workflow=true`: skip local tag, guide user to create GitHub Release after PR merge
- If `pr_workflow=false`: existing behavior (create tag locally)

### kata-starting-projects/SKILL.md
- Added "PR Workflow" question to Round 1 workflow settings
- Updated config.json schema to include `pr_workflow: true|false`
- Recommended default: Yes (PR-based workflow)

### kata-configuring-settings/SKILL.md
- Added `pr_workflow` to parsed config values
- Added "PR Workflow" toggle to settings presentation
- Updated config update logic to include pr_workflow
- Updated confirmation display to show PR Workflow status

## Workflow Impact

**New project setup flow:**
```
Mode → Depth → Execution → Git Tracking → PR Workflow → [agents...]
```

**Milestone completion flow (pr_workflow=true):**
```
Pre-flight → Audit → Readiness → Stats → Accomplishments → Archive → Commit (no tag) → Next steps
```

**Post-merge:**
1. Create GitHub Release with tag v{version}
2. GitHub Actions publishes to npm (if configured)
