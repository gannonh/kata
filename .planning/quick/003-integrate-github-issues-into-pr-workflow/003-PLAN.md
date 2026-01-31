---
phase: quick
plan: 003
type: execute
wave: 1
depends_on: []
files_modified:
  - skills/executing-phases/SKILL.md
  - skills/completing-milestones/SKILL.md
  - skills/completing-milestones/references/milestone-complete.md
autonomous: true

must_haves:
  truths:
    - "Phase issues are closed when their PR is merged"
    - "GitHub Milestone is closed when milestone is completed"
  artifacts:
    - path: "skills/executing-phases/SKILL.md"
      provides: "Issue closure after PR merge"
      contains: "gh issue close"
    - path: "skills/completing-milestones/references/milestone-complete.md"
      provides: "GitHub milestone closure step"
      contains: "gh api.*milestones.*closed"
  key_links:
    - from: "skills/executing-phases/SKILL.md step 10.6"
      to: "gh issue close"
      via: "Merge PR path"
      pattern: "gh issue close"
    - from: "skills/completing-milestones/references/milestone-complete.md"
      to: "GitHub Milestone API"
      via: "git_commit_milestone step"
      pattern: "gh api.*milestones"
---

<objective>
Integrate GitHub issues into PR workflows: close phase issues when PRs merge, close GitHub Milestones when completing milestones.

Purpose: Complete the GitHub integration loop. Currently issues are created and linked but not explicitly closed after merge. GitHub Milestones are created but never closed.

Output: Updated skill files with explicit issue/milestone closure commands.
</objective>

<execution_context>
<!-- Executor agent has built-in instructions for plan execution and summary creation -->
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

**Problem Analysis:**
1. Phase issues created by adding-milestones, linked in PR body with `Closes #X`
2. GitHub SHOULD auto-close issues when PR merges (if `Closes #X` is in body)
3. BUT: No explicit closure if auto-close fails; no verification
4. GitHub Milestones never closed by completing-milestones workflow
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add explicit issue closure after PR merge</name>
  <files>skills/executing-phases/SKILL.md</files>
  <action>
In step 10.6, after the "Merge PR" path executes `gh pr merge`, add explicit issue closure:

After the merge command block (lines ~416-418), add:

```bash
# Explicitly close the phase issue (backup in case Closes #X didn't trigger)
if [ -n "$PHASE_ISSUE" ]; then
  gh issue close "$PHASE_ISSUE" --comment "Closed by PR #${PR_NUMBER} merge" 2>/dev/null \
    && echo "Closed issue #${PHASE_ISSUE}" \
    || echo "Note: Issue #${PHASE_ISSUE} may already be closed"
fi
```

The `$PHASE_ISSUE` variable is already available from step 4.5 where it's used to build the `Closes #X` line.

Add a note in step 4.5 to remind that PHASE_ISSUE should be stored for later use:
After line 232 (`[ -n "$PHASE_ISSUE" ] && CLOSES_LINE="Closes #${PHASE_ISSUE}"`), add comment:
`# Store for use in step 10.6 merge path`
  </action>
  <verify>grep -n "gh issue close" skills/executing-phases/SKILL.md</verify>
  <done>executing-phases/SKILL.md contains explicit gh issue close command after PR merge</done>
</task>

<task type="auto">
  <name>Task 2: Add GitHub Milestone closure to milestone-complete workflow</name>
  <files>skills/completing-milestones/references/milestone-complete.md</files>
  <action>
Add a new step `close_github_milestone` before the `git_commit_milestone` step (after `archive_audit`).

Insert this step after line ~769 (end of archive_audit step):

```xml
<step name="close_github_milestone">

Close the GitHub Milestone if github.enabled.

```bash
# Check if GitHub integration is enabled
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")

if [ "$GITHUB_ENABLED" = "true" ]; then
  # Find the milestone by name (v[X.Y])
  VERSION="[X.Y]"  # Replace with actual version variable
  MILESTONE_NUMBER=$(gh api repos/:owner/:repo/milestones --jq ".[] | select(.title == \"v${VERSION}\") | .number" 2>/dev/null)

  if [ -n "$MILESTONE_NUMBER" ]; then
    # Close the milestone
    gh api repos/:owner/:repo/milestones/${MILESTONE_NUMBER} \
      --method PATCH \
      --field state=closed \
      && echo "Closed GitHub Milestone v${VERSION}" \
      || echo "Warning: Failed to close GitHub Milestone v${VERSION}"
  else
    echo "Note: No GitHub Milestone found for v${VERSION}"
  fi
else
  echo "GitHub integration disabled, skipping milestone closure"
fi
```

Confirm:
```
{If closed: ✅ GitHub Milestone v[X.Y] closed}
{If not found: Note: No GitHub Milestone for v[X.Y] (skipped)}
```

</step>
```

The VERSION variable should use the same detection as elsewhere in the workflow (from package.json or user input).
  </action>
  <verify>grep -n "close_github_milestone\|gh api.*milestones.*closed\|state=closed" skills/completing-milestones/references/milestone-complete.md</verify>
  <done>milestone-complete.md contains step to close GitHub Milestone via API</done>
</task>

<task type="auto">
  <name>Task 3: Update SKILL.md success criteria for GitHub Milestone closure</name>
  <files>skills/completing-milestones/SKILL.md</files>
  <action>
In the success_criteria section (around line 323-337), add a new criterion:

After "Git tag v{{version}} created" line, add:
```
- GitHub Milestone v{{version}} closed (if github.enabled)
```

Also add to the process step 7 (Commit and finalize, around line 227) a reference to the new step:

After the PR workflow handling section (around line 286), before step 8, add:
```
7.5. **Close GitHub Milestone:**

   If github.enabled, close the GitHub Milestone for this version.
   See milestone-complete.md `close_github_milestone` step for details.
```
  </action>
  <verify>grep -n "GitHub Milestone.*closed\|close_github_milestone" skills/completing-milestones/SKILL.md</verify>
  <done>completing-milestones/SKILL.md references GitHub Milestone closure in process and success criteria</done>
</task>

</tasks>

<verification>
After all tasks complete:

1. Verify issue closure logic exists:
   ```bash
   grep -A5 "Merge PR" skills/executing-phases/SKILL.md | grep -q "gh issue close"
   ```

2. Verify milestone closure step exists:
   ```bash
   grep -q "close_github_milestone" skills/completing-milestones/references/milestone-complete.md
   ```

3. Verify SKILL.md references the closure:
   ```bash
   grep -q "GitHub Milestone.*closed" skills/completing-milestones/SKILL.md
   ```
</verification>

<success_criteria>
- executing-phases/SKILL.md explicitly closes phase issue after PR merge
- milestone-complete.md has step to close GitHub Milestone via API
- completing-milestones/SKILL.md success criteria includes milestone closure
- All changes are syntactically valid (no broken XML tags)
</success_criteria>

<output>
After completion, create `.planning/quick/003-integrate-github-issues-into-pr-workflow/003-SUMMARY.md`
</output>
