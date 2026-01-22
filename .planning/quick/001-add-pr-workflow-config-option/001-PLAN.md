# Quick Task 001: Add PR Workflow Config Option

## Objective

Update milestone completion workflow to support PR-based releases where:
- Tags are NOT created during `/kata:complete-milestone` when `pr_workflow: true`
- Instead, tags are created via GitHub Release after PR merge
- Config option is set during project setup and available in settings

## Tasks

### Task 1: Update kata-completing-milestones skill

**Files:** `skills/kata-completing-milestones/SKILL.md`

**Changes:**
1. Add pre-flight checklist for changelog/version bump (step 0.5)
2. In step 7 (Commit and tag), check `config.pr_workflow`
3. If `pr_workflow: true`: skip git tag, note that tag will be created via GitHub Release
4. If `pr_workflow: false` (default): existing behavior (create tag locally)

### Task 2: Update kata-starting-projects skill

**Files:** `skills/kata-starting-projects/SKILL.md`

**Changes:**
1. Add `pr_workflow` question to Round 1 workflow settings
2. Update config.json schema to include `pr_workflow: true|false`
3. Default to `false` for backward compatibility

### Task 3: Update kata-configuring-settings skill

**Files:** `skills/kata-configuring-settings/SKILL.md`

**Changes:**
1. Add `pr_workflow` toggle to settings presentation
2. Include in config update logic
3. Show current value in confirmation display

## Success Criteria

- [ ] `pr_workflow` config option exists in schema
- [ ] New projects prompt for PR workflow preference
- [ ] Settings skill allows toggling PR workflow
- [ ] Complete-milestone skips tag when pr_workflow is true
- [ ] Changelog/version bump reminder added to completion workflow
