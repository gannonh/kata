# Plan: Fix Milestone Completion Workflow

## Overview

Fix the `completing-milestones` workflow to never commit to main when `pr_workflow=true`, then issue patch release v1.3.1.

---

## Step 1: Immediate Cleanup

Recover planning metadata from commit `1c239e9`:

```bash
git show 1c239e9:.planning/milestones/v1.3.0-MILESTONE-AUDIT.md > .planning/milestones/v1.3.0-MILESTONE-AUDIT.md
git show 1c239e9:.planning/milestones/v1.3.0-REQUIREMENTS.md > .planning/milestones/v1.3.0-REQUIREMENTS.md
git show 1c239e9:.planning/milestones/v1.3.0-ROADMAP.md > .planning/milestones/v1.3.0-ROADMAP.md
```

Update `MILESTONES.md` with v1.3.0 completion entry.

---

## Step 2: Fix completing-milestones Workflow

### Files to modify:

1. **`skills/completing-milestones/SKILL.md`**
2. **`skills/completing-milestones/references/milestone-complete.md`**

### The fix:

**Current (broken):**
```
1. Do milestone work
2. Commit to current branch (main)
3. "Oh wait, pr_workflow=true, should we make a branch?" (too late)
```

**Fixed:**
```
1. Check pr_workflow config FIRST
2. IF pr_workflow=true:
   - Create release/vX.Y.Z branch immediately
   - Switch to it
3. Do all milestone work on that branch
4. Create PR
```

### Key changes:

- Add `pr_workflow` check at workflow START, not end
- If enabled, create release branch BEFORE any commits
- Remove any "already on main is fine" logic
- All commits go to release branch, never main

---

## Step 3: Patch Release v1.3.1

1. Bump version to 1.3.1
2. Add CHANGELOG entry for the fix
3. Create release PR
4. Merge and publish

---

## Verification

After fix:
1. Confirm `pr_workflow: true` in `.planning/config.json`
2. Simulate milestone completion flow
3. Verify release branch created FIRST
4. Verify no commits on main until PR merge
