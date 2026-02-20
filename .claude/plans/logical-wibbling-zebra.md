# Plan: Add PR Workflow Support to verify-work Skill

## Problem

The **execute path** (`/kata-execute-phase`) has comprehensive PR workflow support:
- Step 1.5: Create phase branch
- Step 4.5: Open draft PR after first wave
- Step 10.5: Mark PR ready after phase completion
- Step 10.6-10.7: Run PR review, handle findings
- offer_next Route A: Ask about merging PR before continuing

The **verify path** (`/kata-verify-work`) has **none of this**:
- No branch awareness
- No commit/push of changes made during UAT
- No PR ready/merge handling
- Just "commit, present summary" in step 7

**Current state:** We just verified Phase 07, made fixes during UAT (Skill() format), but:
- 28 files are uncommitted
- PR #39 exists but doesn't have these changes
- verify-work didn't offer to commit, push, or merge

## Solution

Add PR workflow handling to `skills/verifying-work/SKILL.md` that mirrors the execute path.

### Changes to SKILL.md

**After step 7 (completion), before offer_next:**

Add new step 7.5: **Finalize Changes (pr_workflow only)**

```markdown
7.5. **Finalize Changes (pr_workflow only)**

Read pr_workflow config:
```bash
PR_WORKFLOW=$(cat .planning/config.json 2>/dev/null | grep -o '"pr_workflow"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

**If PR_WORKFLOW=false:** Skip to offer_next.

**If PR_WORKFLOW=true:**

1. Check for uncommitted changes:
   ```bash
   git status --porcelain
   ```

2. If changes exist, commit them:
   ```bash
   git add -u
   git commit -m "fix({phase}): UAT fixes"
   ```

3. Push to branch:
   ```bash
   BRANCH=$(git branch --show-current)
   git push origin "$BRANCH"
   ```

4. Check if PR exists:
   ```bash
   PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null)
   ```

5. If PR exists, mark ready (if still draft):
   ```bash
   gh pr ready "$PR_NUMBER" 2>/dev/null || true
   PR_URL=$(gh pr view --json url --jq '.url')
   ```

Store PR_NUMBER and PR_URL for offer_next.
```

**Update offer_next Routes A and B:**

Add merge prompt before showing completion (same pattern as execute path):

```markdown
**Step 1: If PR_WORKFLOW=true, STOP and ask about merge.**

Use AskUserQuestion:
- header: "PR Ready for Merge"
- question: "PR #{pr_number} is ready. Merge before continuing?"
- options:
  - "Yes, merge now" — merge PR, then show completion
  - "No, continue without merging" — show completion with PR status

**Step 2: Handle merge response**

If user chose "Yes, merge now":
```bash
gh pr merge "$PR_NUMBER" --squash --delete-branch
git checkout main && git pull
```
Set MERGED=true for output.
```

**Update completion output to show PR status:**

```markdown
{If PR_WORKFLOW and MERGED: PR: #{pr_number} — merged ✓}
{If PR_WORKFLOW and not MERGED: PR: #{pr_number} ({pr_url}) — ready for review}
```

## Files to Modify

| File | Change |
|------|--------|
| `skills/verifying-work/SKILL.md` | Add step 7.5 (PR workflow finalization), update offer_next routes |

## Verification

1. Run `npm run build:plugin`
2. Create test scenario with uncommitted changes and open PR
3. Run `/kata-verify-work`
4. Confirm it offers to commit, push, and merge
