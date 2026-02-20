# Plan: Fix Post-Execution Workflow in executing-phases Skill

## Problem

During phase 01 execution, the workflow jumped directly from "Mark PR Ready" (step 10.5) to asking about merge (Route A Step 1), skipping the critical step 10.6 checkpoint entirely. This caused:

1. UAT was never offered before merge
2. PR review was never offered before merge
3. The user had to manually intervene to surface the correct options

## Root Cause

The skill has two separate decision points that should be consolidated:

1. **Step 10.6** — Offers UAT, PR review, or skip
2. **Route A Step 1** — Asks about merge (only for "more phases" scenario)

These create a disjointed experience. The user expects ONE checkpoint with ALL options:
- UAT
- PR review
- Merge (if applicable)
- Skip to completion

## Fix

### Task 1: Update step 10.6 to include merge option

**File:** `skills/executing-phases/SKILL.md` (lines 379-404)

Add merge as the third option in the AskUserQuestion, conditioned on `pr_workflow=true`:

```
Use AskUserQuestion:
- header: "Phase Complete"
- question: "Phase {X} execution complete. What would you like to do?"
- options:
  - "Run UAT (Recommended)" — Walk through deliverables for manual acceptance testing
  - "Run PR review" — 6 specialized agents review code quality
  - "Merge PR" — (pr_workflow only) Squash merge to main, then show completion
  - "Skip to completion" — Trust automated verification, proceed to next phase/milestone
```

Add handling for "Merge PR":
```
**If user chooses "Merge PR":**
1. Execute: `gh pr merge "$PR_NUMBER" --squash --delete-branch`
2. Execute: `git checkout main && git pull`
3. Set MERGED=true
4. Return to this step to ask if user wants UAT or review before continuing
```

### Task 2: Update step 10.7 to return to 10.6 after handling findings

**File:** `skills/executing-phases/SKILL.md` (lines 406-448)

Change all paths that say "Continue to step 11" to instead say "Return to step 10.6 to offer remaining options (UAT, merge, or skip)".

This ensures the checkpoint loop continues until user explicitly chooses "Skip to completion".

### Task 3: Remove duplicate merge question from Route A

**File:** `skills/executing-phases/SKILL.md` (lines 466-478)

Remove "Step 1" and "Step 2" from Route A that ask about merging. Since merge is now handled in step 10.6, Route A should just show the completion output directly.

Change Route A from:
```
**Step 1: If PR_WORKFLOW=true, STOP and ask about merge...**
**Step 2: Handle merge response...**
**Step 3: Show completion output**
```

To:
```
Show completion output (merge status already handled in step 10.6)
```

### Task 4: Update Route B to be consistent

**File:** `skills/executing-phases/SKILL.md` (lines 516-551)

Route B currently just shows "Phase PRs ready — merge to prepare for release" without offering merge. This is now consistent since step 10.6 handles merge.

No changes needed to Route B structure, but update the banner text to reflect that merge may have already happened:

```
{If PR_WORKFLOW and MERGED: All phase PRs merged ✓}
{If PR_WORKFLOW and not MERGED: Phase PRs ready — merge to prepare for release}
```

## Files to Modify

1. `skills/executing-phases/SKILL.md`
   - Step 10.6: Add "Merge PR" option and handling
   - Step 10.7: Change "Continue to step 11" → "Return to step 10.6"
   - Route A: Remove Steps 1-2 (merge question), keep Step 3 (completion output)

## Verification

After the fix:
1. Run `/kata-execute-phase` on a test phase
2. Verify step 10.6 presents: UAT, PR review, Merge PR, Skip
3. Verify choosing "Merge PR" merges then returns to ask about UAT/review
4. Verify choosing "Skip to completion" proceeds to Route A or B without merge question
5. Verify Route A no longer asks about merge separately
