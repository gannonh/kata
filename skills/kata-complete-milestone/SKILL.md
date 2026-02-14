---
name: kata-complete-milestone
description: Archive a completed milestone, preparing for the next version, marking a milestone complete, shipping a version, or wrapping up milestone work. Triggers include "complete milestone", "finish milestone", "archive milestone", "ship version", "mark milestone done", "milestone complete", "release version", "create release", and "ship milestone".
metadata:
  version: "0.1.0"
---

<objective>
Mark milestone {{version}} complete, archive to milestones/, and update ROADMAP.md and REQUIREMENTS.md.

Purpose: Create historical record of shipped version, archive milestone artifacts (roadmap + requirements), and prepare for next milestone.
Output: Milestone archived (roadmap + requirements), PROJECT.md evolved, git tagged.
</objective>

<execution_context>
**Load these files NOW (before proceeding):**

- @./references/milestone-complete.md (main workflow)
- @./references/milestone-archive-template.md (archive template)
- @./references/version-detector.md (version detection functions)
- @./references/changelog-generator.md (changelog generation functions)
  </execution_context>

<context>
**Project files:**
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/PROJECT.md`

**User input:**

- Version: {{version}} (e.g., "1.0", "1.1", "2.0")
  </context>

<process>

**Follow milestone-complete.md workflow:**

0. **CRITICAL: Branch setup (if pr_workflow=true)**

   **Check pr_workflow config FIRST before any other work:**

   ```bash
   PR_WORKFLOW=$(bash "../kata-configure-settings/scripts/read-config.sh" "pr_workflow" "false")
   CURRENT_BRANCH=$(git branch --show-current)
   WORKTREE_ENABLED=$(bash "../kata-configure-settings/scripts/read-config.sh" "worktree.enabled" "false")
   ```

   **If `PR_WORKFLOW=true` AND on `main`:**

   You MUST create a release branch BEFORE proceeding. All milestone completion work goes on that branch.

   ```bash
   # Determine version from user input or detect from project files
   # (version-detector.md handles detection across project types)
   VERSION="X.Y.Z"  # Set from user input or detection
   ```

   **Release branches always use the `main/` working directory.** Do NOT create a separate worktree for release work. Milestone completion is sequential admin work with no parallelism — a separate worktree adds complexity with no benefit.

   Create the release branch in the current working directory. In bare repo layout, CWD is already `main/`. In normal repos, CWD is the project root. Both cases use the same command:

   ```bash
   RELEASE_BRANCH="release/v$VERSION"
   git checkout -b "$RELEASE_BRANCH"
   ```

   Display:

   ```
   ⚠ pr_workflow is enabled — creating release branch.

   Branch: $RELEASE_BRANCH

   All milestone completion commits will go to this branch.
   After completion, a PR will be created to merge to main.
   ```

   **If `PR_WORKFLOW=false` OR already on a non-main branch:**

   Proceed with current branch (commits go to main or current branch).

   **GATE: Do NOT proceed until branch is correct:**
   - If pr_workflow=true, you must be on release/vX.Y.Z branch
   - If pr_workflow=false, main branch is OK

   **All subsequent steps work in the current working directory.** Do NOT cd to any other directory.

0.1. **Pre-flight: Check roadmap format (auto-migration)**

Read workflow-specific overrides for milestone completion. Also check and auto-migrate roadmap format if needed:

```bash
if [ -f .planning/ROADMAP.md ]; then
  bash ../kata-doctor/scripts/check-roadmap-format.sh 2>/dev/null
  FORMAT_EXIT=$?
  
  if [ $FORMAT_EXIT -eq 1 ]; then
    echo "Old roadmap format detected. Running auto-migration..."
  fi
fi
```

**If exit code 1 (old format):**

Invoke kata-doctor in auto mode:

```
Skill("kata-doctor", "--auto")
```

Continue after migration completes.

**If exit code 0 or 2:** Continue silently.

```bash
# Validate config and template overrides
bash ../kata-doctor/scripts/check-config.sh 2>/dev/null || true
bash ../kata-doctor/scripts/check-template-drift.sh 2>/dev/null || true
```

0.2. **Read workflow config:**

Read workflow-specific overrides for milestone completion:

```bash
VERSION_FILES_JSON=$(bash ../kata-configure-settings/scripts/read-pref.sh "workflows.complete-milestone.version_files" "[]")
PRE_RELEASE_CMDS_JSON=$(bash ../kata-configure-settings/scripts/read-pref.sh "workflows.complete-milestone.pre_release_commands" "[]")
```

- `version_files`: overrides version-detector.md auto-detection when non-empty
- `pre_release_commands`: run after version bump, before archive (failures blocking)

Store for use in release workflow steps. See milestone-complete.md `read_workflow_config` step.

0.2. **Generate release artifacts:**

Proactively generate changelog and version bump. Use the functions defined in version-detector.md and changelog-generator.md. Run these steps using the exact function definitions from those references:

```bash
# 1. Get current version (version-detector.md: get_current_version)
CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo "0.0.0")

# 2. Get commits since last tag (version-detector.md: commit_parsing)
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  COMMITS=$(git log --oneline --format="%s" "$LAST_TAG"..HEAD)
else
  COMMITS=$(git log --oneline --format="%s")
fi

# 3. Categorize commits
BREAKING=$(echo "$COMMITS" | grep -E "^[a-z]+(\(.+\))?!:|BREAKING CHANGE:" || true)
FEATURES=$(echo "$COMMITS" | grep -E "^feat(\(.+\))?:" || true)
FIXES=$(echo "$COMMITS" | grep -E "^fix(\(.+\))?:" || true)

# 4. Determine bump type
if [ -n "$BREAKING" ]; then BUMP_TYPE="major"
elif [ -n "$FEATURES" ]; then BUMP_TYPE="minor"
elif [ -n "$FIXES" ]; then BUMP_TYPE="patch"
else BUMP_TYPE="none"
fi

echo "CURRENT=$CURRENT_VERSION BUMP=$BUMP_TYPE"
echo "FEATURES: $FEATURES"
echo "FIXES: $FIXES"
```

Calculate next version using `calculate_next_version` from version-detector.md. Generate changelog entry using changelog-generator.md format. Update version in project files using `update_versions` from version-detector.md (if version changed).

Present all proposed changes for review:

```
## Release Preview

**Current version:** $CURRENT_VERSION
**Bump type:** $BUMP_TYPE
**Next version:** $NEXT_VERSION

**Changelog entry:**
## [$NEXT_VERSION] - $DATE

### Added
[feat commits formatted]

### Fixed
[fix commits formatted]

### Changed
[docs/refactor/perf commits formatted]

**Files updated:**
[list each version file detected and updated]
- CHANGELOG.md → new entry prepended
```

Use AskUserQuestion:

- header: "Release Changes"
- question: "Review the release changes above. Approve?"
- options:
  - "Approve" — Keep changes and proceed to verify readiness
  - "Edit changelog first" — Pause for user edits, then confirm
  - "Revert and skip release" — Undo release file changes, proceed to verify readiness without release artifacts

1. **Check for audit:**
   - Look for `.planning/v{{version}}-MILESTONE-AUDIT.md`
   - If missing or stale: recommend `/kata-audit-milestone` first
   - If audit status is `gaps_found`: recommend `/kata-plan-milestone-gaps` first
   - If audit status is `passed`: proceed to step 1

   ```markdown
   ## Pre-flight Check

   {If no v{{version}}-MILESTONE-AUDIT.md:}
   ⚠ No milestone audit found. Run `/kata-audit-milestone` first to verify
   requirements coverage, cross-phase integration, and E2E flows.

   {If audit has gaps:}
   ⚠ Milestone audit found gaps. Run `/kata-plan-milestone-gaps` to create
   phases that close the gaps, or proceed anyway to accept as tech debt.

   {If audit passed:}
   ✓ Milestone audit passed. Proceeding with completion.
   ```

1. **Verify readiness:**
   - Check all phases in milestone have completed plans (SUMMARY.md exists)
   - Present milestone scope and stats
   - Wait for confirmation

1. **Gather stats:**
   - Count phases, plans, tasks
   - Calculate git range, file changes, LOC
   - Extract timeline from git log
   - Present summary, confirm

1. **Extract accomplishments:**
   - Read all phase SUMMARY.md files in milestone range
   - Extract 4-6 key accomplishments
   - Present for approval

1. **Archive milestone:**
   - Create `.planning/milestones/v{{version}}-ROADMAP.md`
   - Extract full phase details from ROADMAP.md
   - Fill milestone-archive.md template
   - Update ROADMAP.md to one-line summary with link

1. **Archive requirements:**
   - Create `.planning/milestones/v{{version}}-REQUIREMENTS.md`
   - Mark all v1 requirements as complete (checkboxes checked)
   - Note requirement outcomes (validated, adjusted, dropped)
   - Delete `.planning/REQUIREMENTS.md` (fresh one created for next milestone)

1. **Update PROJECT.md:**
   - Add "Current State" section with shipped version
   - Add "Next Milestone Goals" section
   - Archive previous content in `<details>` (if v1.1+)

6.5. **Review Documentation (Non-blocking):**

Before committing, offer final README review:

Use AskUserQuestion:

- header: "Final README Review"
- question: "Revise README before completing milestone v{{version}}?"
- options:
  - "Yes, draft an update for my review" — Revise README and present to the user for approval
  - "No, I'll make the edits myself" — Pause for user review, wait for "continue"
  - "Skip for now" — Proceed directly to commit

**If "Yes, I'll review now":**

```
Review README.md for the complete v{{version}} milestone.
Ensure all shipped features are documented.
Say "continue" when ready to proceed.
```

**If "Show README":**
Display README.md, then use AskUserQuestion:

- header: "README Accuracy"
- question: "Does this look accurate for v{{version}}?"
- options:
  - "Yes, looks good" — Proceed to Step 7
  - "Needs updates" — Pause for user edits, wait for "continue"

**If "Skip" or review complete:** Proceed to Step 7.

_Non-blocking: milestone completion continues regardless of choice._

6.7. **Close GitHub Milestone:**

If github.enabled, close the GitHub Milestone for this version.
See milestone-complete.md `close_github_milestone` step for details.

7. **Commit and finalize:**
   - Stage: MILESTONES.md, PROJECT.md, ROADMAP.md, STATE.md, archive files
   - Commit: `chore: complete v{{version}} milestone`

   **PR workflow handling (branch was created in step 0):**

   ```bash
   PR_WORKFLOW=$(bash "../kata-configure-settings/scripts/read-config.sh" "pr_workflow" "false")
   CURRENT_BRANCH=$(git branch --show-current)
   ```

   **If `PR_WORKFLOW=true` (on release/vX.Y.Z branch):**

   Push branch and create PR:

   ```bash
   # Push branch (use --head for bare repo layout where gh can't auto-detect)
   git push -u origin "$CURRENT_BRANCH"

   # Collect all phase issues for this milestone
   GITHUB_ENABLED=$(bash "../kata-configure-settings/scripts/read-config.sh" "github.enabled" "false")
   ISSUE_MODE=$(bash "../kata-configure-settings/scripts/read-config.sh" "github.issue_mode" "never")

   CLOSES_LINES=""
   if [ "$GITHUB_ENABLED" = "true" ] && [ "$ISSUE_MODE" != "never" ]; then
     # Get all phase issue numbers for this milestone
     # --state all includes already-closed issues (GitHub ignores redundant Closes #X,
     # but including them ensures PR body reflects all related work)
     # gh issue list --milestone only searches open milestones; use API to include closed
     REPO_SLUG=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
     MS_NUM=$(gh api "repos/${REPO_SLUG}/milestones?state=all" --jq ".[] | select(.title==\"v{{version}}\") | .number" 2>/dev/null)
     PHASE_ISSUES=""
     if [ -n "$MS_NUM" ]; then
       PHASE_ISSUES=$(gh api "repos/${REPO_SLUG}/issues?milestone=${MS_NUM}&state=all&labels=phase&per_page=100" \
         --jq '.[].number' 2>/dev/null)
     fi

     if [ -z "$PHASE_ISSUES" ]; then
       echo "Note: No phase issues found for milestone v{{version}}. This is expected for milestones without GitHub issues."
     fi

     # Build multi-line closes section
     for num in ${PHASE_ISSUES}; do
       CLOSES_LINES="${CLOSES_LINES}Closes #${num}
   "
     done
   fi

   # Create PR (--head required for bare repo worktree layout)
   gh pr create \
     --head "$CURRENT_BRANCH" \
     --base main \
     --title "v{{version}}: [Milestone Name]" \
     --body "$(cat <<EOF
   ## Summary

   Completes milestone v{{version}}.

   **Key accomplishments:**
   - [accomplishment 1]
   - [accomplishment 2]
   - [accomplishment 3]

   ## Release Files

   [list version files that were updated]
   - `CHANGELOG.md` — v{{version}} entry added

   ## After Merge

   Create GitHub Release with tag `v{{version}}`.

   ## Closes

   ${CLOSES_LINES}
   EOF
   )"
   ```

   Display:

   ```
   ✓ PR created: [PR URL]

   After merge:
   → Create GitHub Release with tag v{{version}}
   ```

   **Offer to merge PR:**

   Use AskUserQuestion:
   - header: "Merge Release PR"
   - question: "PR is ready. Merge now?"
   - options:
     - "Yes, merge now" — merge and return to main
     - "No, I'll merge later" — leave PR open

   **If "Yes, merge now":**

   ```bash
   gh pr merge "$PR_NUMBER" --merge
   ```

   Then update local state:

   ```bash
   if [ "$WORKTREE_ENABLED" = "true" ]; then
     # Bare repo layout: update main/ worktree, reset workspace/ to workspace-base
     git -C main pull
     bash "skills/kata-execute-phase/scripts/manage-worktree.sh" cleanup-phase workspace "$PHASE_BRANCH"
   else
     git checkout main
     git pull
   fi
   ```

   **If `PR_WORKFLOW=false` (on main):**

   Create tag locally:
   - Tag: `git tag -a v{{version}} -m "[milestone summary]"`
   - Ask about pushing tag

8. **Post-release verification:**

   After the release PR is merged (or tag is pushed), offer active verification tasks.

   **Task menu loop:** Present available tasks, execute the selected one, then re-present remaining tasks until the user exits.

   Use AskUserQuestion:
   - header: "Post-Release Tasks"
   - question: "Release committed. What would you like to verify?"
   - options (show only uncompleted tasks):
     - "Run smoke tests" — Execute the project's test suite and report results
     - "Verify release artifacts" — Check version files, changelog entry, and git tag
     - "Check CI/CD status" — Show recent workflow runs and their status
     - "Everything looks good" — Skip remaining verification, proceed to step 9

   **If "Run smoke tests":**

   Execute the project's test suite:

   ```bash
   npm test 2>&1 || echo "SMOKE_TEST_FAILED"
   ```

   Report pass/fail results. If failures found, use AskUserQuestion:
   - header: "Test Failures"
   - question: "Smoke tests reported failures. How to proceed?"
   - options:
     - "Help me fix" — Stop and debug the failing tests
     - "Continue anyway" — Return to task menu

   **If "Help me fix":** Stop milestone completion and help debug.

   **If "Verify release artifacts":**

   Run artifact checks:

   ```bash
   VERSION="{{version}}"

   echo "=== Version File Check ==="
   # Use version-detector.md detected files or workflow config overrides
   for f in $(cat .planning/config.json 2>/dev/null | grep -o '"version_files"[[:space:]]*:[[:space:]]*\[[^]]*\]' | grep -o '"[^"]*"' | tr -d '"' | grep -v version_files); do
     if [ -f "$f" ]; then
       grep -q "$VERSION" "$f" && echo "✓ $f contains $VERSION" || echo "✗ $f missing $VERSION"
     fi
   done

   echo "=== Changelog Check ==="
   grep -q "$VERSION" CHANGELOG.md 2>/dev/null && echo "✓ CHANGELOG.md has $VERSION entry" || echo "✗ CHANGELOG.md missing $VERSION entry"

   echo "=== Git Tag Check ==="
   git tag -l "v$VERSION" | grep -q . && echo "✓ Tag v$VERSION exists" || echo "✗ Tag v$VERSION not found"
   ```

   Report results. If mismatches found, use AskUserQuestion:
   - header: "Artifact Issues"
   - question: "Release artifact issues detected. How to proceed?"
   - options:
     - "Fix issues" — Correct the mismatches (update version files, create missing tag)
     - "Continue anyway" — Return to task menu

   **If "Fix issues":** Apply fixes, commit, then return to task menu.

   **If "Check CI/CD status":**

   Query recent workflow runs:

   ```bash
   gh run list --limit 3 2>/dev/null || echo "No CI/CD runs found (gh CLI not configured or no workflows)"
   ```

   Report status. If failures found, use AskUserQuestion:
   - header: "CI/CD Failures"
   - question: "CI/CD failures detected. How to proceed?"
   - options:
     - "Investigate" — Show logs for the failed run (`gh run view --log-failed`)
     - "Continue anyway" — Return to task menu

   **If "Investigate":** Display failure logs, then return to task menu.

   **If "Everything looks good":** Proceed to step 9.

   **Loop behavior:** After each completed task, remove it from the options and re-present the menu. When all three tasks have been run or user selects "Everything looks good", proceed to step 9.

9. **Offer next steps:**
   - `/kata-add-milestone` — start next milestone (questioning → research → requirements → roadmap)

</process>

<success_criteria>

- Milestone archived to `.planning/milestones/v{{version}}-ROADMAP.md`
- Requirements archived to `.planning/milestones/v{{version}}-REQUIREMENTS.md`
- `.planning/REQUIREMENTS.md` deleted (fresh for next milestone)
- ROADMAP.md collapsed to one-line entry
- PROJECT.md updated with current state
- Git tag v{{version}} created (if pr_workflow=false) OR PR created/instructions given (if pr_workflow=true)
- GitHub Milestone v{{version}} closed (if github.enabled)
- Commit successful
- User knows next steps (including need for fresh requirements)

**If release workflow was run:**

- CHANGELOG.md updated with v{{version}} entry (reviewed and approved)
- Version bumped in all detected project version files
- GitHub Release created (if pr_workflow=false) OR instructions provided (if pr_workflow=true)
  </success_criteria>

<critical_rules>

- **Load workflow first:** Read milestone-complete.md before executing
- **Verify completion:** All phases must have SUMMARY.md files
- **User confirmation:** Wait for approval at verification gates
- **Archive before deleting:** Always create archive files before updating/deleting originals
- **One-line summary:** Collapsed milestone in ROADMAP.md should be single line with link
- **Context efficiency:** Archive keeps ROADMAP.md and REQUIREMENTS.md constant size per milestone
- **Fresh requirements:** Next milestone starts with `/kata-add-milestone` which includes requirements definition
  </critical_rules>
