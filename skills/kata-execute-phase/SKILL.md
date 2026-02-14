---
name: kata-execute-phase
description: Execute all plans in a phase with wave-based parallelization, running phase execution, or completing phase work. Triggers include "execute phase", "run phase", "execute plans", "run the phase", and "phase execution".
metadata:
  version: "0.1.0"
---

<objective>
Execute all plans in a phase using wave-based parallel execution.

Orchestrator stays lean: discover plans, analyze dependencies, group into waves, spawn subagents, collect results. Each subagent loads the full execute-plan context and handles its own plan.

Context budget: ~15% orchestrator, 100% fresh per subagent.
</objective>

<execution_context>
@./references/ui-brand.md
@./references/planning-config.md
@./references/phase-execute.md
</execution_context>

<context>
Phase: $ARGUMENTS

**Flags:**

- `--gaps-only` — Execute only gap closure plans (plans with `gap_closure: true` in frontmatter). Use after phase-verify creates fix plans.

@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>

**Script invocation rule.** Code blocks reference scripts with paths relative to this SKILL.md (e.g., `"./scripts/find-phase.sh"`). Resolve these to absolute paths. Run scripts from the project directory (where `.planning/` lives). If you must run from a different directory, pass the project root via environment variable: `KATA_PROJECT_ROOT=/path/to/project bash "/path/to/script.sh" args`.

0. **Resolve Model Profile**

Read model profile for agent spawning:

```bash
MODEL_PROFILE=$(bash "../kata-configure-settings/scripts/read-config.sh" "model_profile" "balanced")
```

Default to "balanced" if not set.

0.5. **Read Workflow Config**

Read workflow config for executor injection:

```bash
EXEC_POST_TASK_CMD=$(bash "../kata-configure-settings/scripts/read-pref.sh" "workflows.execute-phase.post_task_command" "")
EXEC_COMMIT_STYLE=$(bash "../kata-configure-settings/scripts/read-pref.sh" "workflows.execute-phase.commit_style" "conventional")
EXEC_COMMIT_SCOPE_FMT=$(bash "../kata-configure-settings/scripts/read-pref.sh" "workflows.execute-phase.commit_scope_format" "{phase}-{plan}")
```

Store these three variables for injection into executor prompts in the `<wave_execution>` Task() calls.

0.6. **Read GitHub Config**

```bash
GITHUB_ENABLED=$(bash "../kata-configure-settings/scripts/read-config.sh" "github.enabled" "false")
ISSUE_MODE=$(bash "../kata-configure-settings/scripts/read-config.sh" "github.issue_mode" "never")
```

Store for use in PR creation and issue checkbox updates.

0.7. **Check Worktree and PR Config**

Read worktree and PR workflow configuration for conditional lifecycle:

```bash
WORKTREE_ENABLED=$(bash "../kata-configure-settings/scripts/read-config.sh" "worktree.enabled" "false")
PR_WORKFLOW=$(bash "../kata-configure-settings/scripts/read-config.sh" "pr_workflow" "false")
```

Store `WORKTREE_ENABLED` and `PR_WORKFLOW` for use in steps 1.5, 4, 10, and 10.5. When `WORKTREE_ENABLED=false` (default), plan-level worktree operations are skipped. When `PR_WORKFLOW=false`, all branch/worktree/PR operations are skipped and execution proceeds on the current branch.

**Model lookup table:**

| Agent                      | quality | balanced | budget |
| -------------------------- | ------- | -------- | ------ |
| general-purpose (executor) | opus    | sonnet   | sonnet |
| kata-verifier              | sonnet  | sonnet   | haiku  |
| kata-code-reviewer         | opus    | sonnet   | sonnet |
| kata-\*-analyzer           | sonnet  | sonnet   | haiku  |

_Note: Review agents (kata-code-reviewer, kata-_-analyzer) are spawned by the kata-review-pull-requests skill, which handles its own model selection based on the agents' frontmatter. The table above documents expected model usage for cost planning.\*

Store resolved models for use in Task calls below.

1. **Pre-flight: Check roadmap format (auto-migration)**

   If ROADMAP.md exists, check format and auto-migrate if old:

   ```bash
   if [ -f .planning/ROADMAP.md ]; then
     bash "../kata-doctor/scripts/check-roadmap-format.sh" 2>/dev/null
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
   bash "../kata-doctor/scripts/check-config.sh" 2>/dev/null || true
   bash "../kata-doctor/scripts/check-template-drift.sh" 2>/dev/null || true
   ```

1.1. **Validate phase exists**
Find phase directory using the discovery script:

```bash
bash "./scripts/find-phase.sh" "$PHASE_ARG"
```

Outputs `PHASE_DIR`, `PLAN_COUNT`, and `PHASE_STATE` as key=value pairs. Exit code 1 = not found, 2 = no plans. Parse the output to set these variables for subsequent steps.

1.25. **Move phase to active (state transition)**

```bash
# Move from pending to active when execution begins
# PHASE_STATE is from find-phase.sh output (step 1)
if [ "$PHASE_STATE" = "pending" ]; then
  DIR_NAME=$(basename "$PHASE_DIR")
  mkdir -p ".planning/phases/active"
  mv "$PHASE_DIR" ".planning/phases/active/${DIR_NAME}"
  PHASE_DIR=".planning/phases/active/${DIR_NAME}"
  echo "Phase moved to active/"
fi
```

1.5. **Create phase branch and commit activation changes**

**If PR_WORKFLOW=false:** Skip to step 2.

**If PR_WORKFLOW=true:**

Create the phase branch FIRST. Uncommitted activation changes from step 1.25 float to the new branch via `git checkout -b`. Then commit on the phase branch (not main — respects branch protection).

```bash
if ! BRANCH_OUTPUT=$(bash "./scripts/create-phase-branch.sh" "$PHASE_DIR"); then
  echo "Error: Failed to create phase branch" >&2
  exit 1
fi
eval "$BRANCH_OUTPUT"
# Outputs: WORKSPACE_PATH, BRANCH, BRANCH_TYPE, MILESTONE, PHASE_NUM, SLUG
```

Store WORKSPACE_PATH and PHASE_BRANCH for steps 4 and 10.5.

```bash
WORKSPACE_PATH=$WORKSPACE_PATH
PHASE_BRANCH=$BRANCH
```

Now commit the activation changes on the phase branch. The orchestrator runs from workspace/, so plain git commands work directly. This ensures worktrees branch from a clean state and prevents merge conflicts on STATE.md.

```bash
if [ -n "$(git status --porcelain .planning/)" ]; then
  git add .planning/ && git commit -m "docs(${PHASE_NUM}): activate phase"
fi
```

2. **Discover plans**
   - List all \*-PLAN.md files in phase directory
   - Check which have \*-SUMMARY.md (already complete)
   - If `--gaps-only`: filter to only plans with `gap_closure: true`
   - Build list of incomplete plans

3. **Group by wave**
   - Read `wave` from each plan's frontmatter
   - Group plans by wave number

3.5. **Display execution banner**

Display stage banner and wave structure:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kata ► EXECUTING PHASE {X}: {Phase Name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**{N} plans, {M} waves:**

| Wave | Plans  | Description                   |
| ---- | ------ | ----------------------------- |
| 1    | 01, 02 | {plan names from frontmatter} |
| 2    | 03     | {plan name}                   |

**Model profile:** {profile} (executor → {model})
{If WORKTREE_ENABLED=true: **Worktree isolation:** enabled (each plan gets isolated worktree)}

4. **Execute waves**
   For each wave in order:
   - **Create plan worktrees (if enabled):**
     If `WORKTREE_ENABLED=true` and `PR_WORKFLOW=true`, create a worktree for each plan in the wave, forking from the phase branch:

     ```bash
     if [ "$WORKTREE_ENABLED" = "true" ] && [ "$PR_WORKFLOW" = "true" ]; then
       for plan_num in $WAVE_PLAN_NUMBERS; do
         WT_OUTPUT=$(bash "./scripts/manage-worktree.sh" create "$PHASE_NUM" "$plan_num" "$PHASE_BRANCH")
         eval "$WT_OUTPUT"
         # Stores WORKTREE_PATH, WORKTREE_BRANCH, STATUS for each plan
         # Save per-plan: WORKTREE_PATH_${plan_num}=$WORKTREE_PATH
       done
     fi
     ```

   - Spawn `general-purpose` executor for each plan in wave (parallel Task calls)
   - Wait for completion (Task blocks)

   **IMPORTANT: The remaining post-wave steps are SEQUENTIAL. Do not run them in parallel.**

   - **Merge plan worktrees (if enabled) — do this FIRST:**
     When plan worktrees are enabled, SUMMARYs and code live in the worktree directories until merged into the phase branch. Merge BEFORE checking SUMMARYs or updating issue checkboxes.

     ```bash
     if [ "$WORKTREE_ENABLED" = "true" ] && [ "$PR_WORKFLOW" = "true" ]; then
       for plan_num in $WAVE_PLAN_NUMBERS; do
         MERGE_OUTPUT=$(bash "./scripts/manage-worktree.sh" merge "$PHASE_NUM" "$plan_num" "$PHASE_BRANCH" "$WORKSPACE_PATH")
         eval "$MERGE_OUTPUT"
         if [ "$STATUS" != "merged" ]; then
           echo "Warning: Worktree merge failed for plan $plan_num" >&2
         fi
       done
     fi
     ```

     Merge happens ONCE per wave after all agents complete. This ensures all plan branches are integrated before the next wave starts.

     **If merge fails:** Report the failure but continue. User can resolve merge conflicts manually and re-run. The worktree and branch remain for inspection.

   - **Verify SUMMARYs created:**
     After merge (or directly if worktrees disabled), verify each plan has a SUMMARY.md in the phase directory:

     ```bash
     for plan_num in $WAVE_PLAN_NUMBERS; do
       if ! find "$PHASE_DIR" -maxdepth 1 -name "*-${plan_num}-SUMMARY.md" 2>/dev/null | grep -q .; then
         echo "Warning: No SUMMARY.md found for plan $plan_num" >&2
       fi
     done
     ```

   - **Update GitHub issue checkboxes (if enabled):**

     Build completed plan numbers from SUMMARY.md files created this wave, then update issue checkboxes:

     ```bash
     COMPLETED_PLANS_IN_WAVE=""
     for summary in $(find "${PHASE_DIR}" -maxdepth 1 -name "*-SUMMARY.md" 2>/dev/null); do
       plan_num=$(basename "$summary" | sed -E 's/^[0-9]+-([0-9]+)-SUMMARY\.md$/\1/')
       if echo "${WAVE_PLANS}" | grep -q "plan-${plan_num}"; then
         COMPLETED_PLANS_IN_WAVE="${COMPLETED_PLANS_IN_WAVE} ${plan_num}"
       fi
     done

     bash "./scripts/update-issue-checkboxes.sh" "$PHASE" "$PHASE_DIR" $COMPLETED_PLANS_IN_WAVE
     ```

     This update happens ONCE per wave (after all plans in wave complete), not per-plan, avoiding race conditions.

   - **Open Draft PR (first wave only, pr_workflow only):**

     After first wave completion, commit any remaining uncommitted planning changes in workspace/:

     ```bash
     if [ "$PR_WORKFLOW" = "true" ]; then
       if [ -n "$(git status --porcelain .planning/)" ]; then
         git add .planning/ && git commit -m "docs(${PHASE_NUM}): update planning state"
       fi
     fi
     ```

     Then push and create the draft PR:

     ```bash
     if [ "$PR_WORKFLOW" = "true" ]; then
       # Push from workspace/ (already on the phase branch)
       git push -u origin "$PHASE_BRANCH" 2>/dev/null || \
         git push -u --force-with-lease origin "$PHASE_BRANCH" 2>/dev/null
       if ! PR_OUTPUT=$(bash "./scripts/create-draft-pr.sh" "$PHASE_DIR" "$PHASE_BRANCH"); then
         echo "Error: Failed to create draft PR" >&2
       else
         eval "$PR_OUTPUT"
         # Outputs: PR_NUMBER (and possibly EXISTING_PR)
       fi
     fi
     ```

     Store PR_NUMBER for step 10.5.

     **Note:** PR body checklist items remain unchecked throughout execution. The PR body is static after creation. The GitHub issue (updated after each wave above) is the source of truth for plan progress during execution.

- Proceed to next wave

5. **Aggregate results**
   - Collect summaries from all plans
   - Report phase completion status

6. **Commit any orchestrator corrections**
   Check for uncommitted changes before verification:

   ```bash
   git status --porcelain
   ```

   **If changes exist:** Orchestrator made corrections between executor completions. Commit them:

   ```bash
   git add -u && git commit -m "fix({phase}): orchestrator corrections"
   ```

   **If clean:** Continue to test suite.

6.5. **Run project test suite**

Before verification, run the project's test suite to catch regressions early:

```bash
TEST_SCRIPT=$(cat package.json 2>/dev/null | grep -o '"test"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1)
```

**If package.json has a test script:**

- Run `npm test`
- If tests pass: proceed to step 7
- If tests fail: report test failures, still proceed to step 7

**If no test script detected:**

- Skip this step, proceed to step 7

**Skip for gap phases:** If mode is `gap_closure`, skip test suite

7. **Verify phase goal (automated codebase check — NOT user-facing UAT)**

   Check config: `WORKFLOW_VERIFIER=$(bash "../kata-configure-settings/scripts/read-config.sh" "workflow.verifier" "true")`

   **If `workflow.verifier` is `false`:** Skip to step 8 (treat as passed).

   **Otherwise:** Spawn a Task subagent with verifier instructions inlined. Do NOT invoke `/kata-verify-work` — that is a different skill for interactive user testing.

   Read the verifier instructions file:

   ```
   verifier_instructions_content = Read("references/verifier-instructions.md")
   ```

   Read the phase goal from ROADMAP.md and all SUMMARY.md files in the phase directory.

   Spawn the verifier:

   ```
   Task(
     prompt="<agent-instructions>
   {verifier_instructions_content}
   </agent-instructions>

   Verify phase goal achievement for: {PHASE_DIR}

   PHASE_DIR={PHASE_DIR}
   PHASE_NUM={PHASE_NUM}

   Phase goal: {goal from ROADMAP.md}

   Plan summaries:
   {summary contents from phase directory}

   Return your verification results as structured text. Do NOT write any files.",
     subagent_type="general-purpose",
     model="{verifier_model from model lookup table}"
   )
   ```

   **Create VERIFICATION.md from the verifier's returned text.** The verifier returns structured text with `VERIFICATION_FRONTMATTER` and `VERIFICATION_BODY` sections. Parse these and write to `{PHASE_DIR}/{phase_num}-VERIFICATION.md`:

   ```markdown
   ---
   {content from VERIFICATION_FRONTMATTER section}
   ---

   {content from VERIFICATION_BODY section}
   ```

   If the verifier's output doesn't follow the expected format, extract the status (`passed`/`gaps_found`/`human_needed`), score, and any gap details from whatever text was returned, and construct the VERIFICATION.md yourself.

   Parse the verification status:
   - `passed` → continue to step 8
   - `human_needed` → present items to user, get approval or feedback
   - `gaps_found` → present gaps, offer `/kata-plan-phase {X} --gaps`

7.5. **Validate completion and move to completed**

After verification passes, validate completion artifacts before moving phase to completed:

```bash
# Validate completion artifacts
PLAN_COUNT=$(find "$PHASE_DIR" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null | wc -l | tr -d ' ')
MISSING=""
if [ "$PLAN_COUNT" -eq 0 ]; then
  MISSING="${MISSING}\n- No PLAN.md files found"
fi
for plan in $(find "$PHASE_DIR" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null); do
  plan_id=$(basename "$plan" | sed 's/-PLAN\.md$//')
  [ ! -f "$PHASE_DIR/${plan_id}-SUMMARY.md" ] && MISSING="${MISSING}\n- Missing SUMMARY.md for ${plan_id}"
done
# Non-gap phases require VERIFICATION.md
IS_GAP=$(find "$PHASE_DIR" -maxdepth 1 -name "*-PLAN.md" -exec grep -l "gap_closure: true" {} + 2>/dev/null | head -1)
if [ -z "$IS_GAP" ] && ! find "$PHASE_DIR" -maxdepth 1 -name "*-VERIFICATION.md" 2>/dev/null | grep -q .; then
  MISSING="${MISSING}\n- Missing VERIFICATION.md (required for non-gap phases)"
fi

if [ -z "$MISSING" ]; then
  DIR_NAME=$(basename "$PHASE_DIR")
  mkdir -p ".planning/phases/completed"
  mv "$PHASE_DIR" ".planning/phases/completed/${DIR_NAME}"
  PHASE_DIR=".planning/phases/completed/${DIR_NAME}"
  echo "Phase validated and moved to completed/"
else
  echo "Warning: Phase incomplete:${MISSING}"
fi
```

8. **Update roadmap and state**

   **ROADMAP.md** — two updates:

   a. **Collapse phase detail section:** Remove the completed phase's `#### Phase N:` block (header, goal, requirements, success criteria) from the Current Milestone section. The `- [x]` checklist entry below already captures completion status. Only uncompleted phases keep their detail blocks.

   b. **Update checklist entry:** Change `- [ ] Phase N: Name (X/Y plans)` to `- [x] Phase N: Name (Y/Y plans) — completed YYYY-MM-DD`. Mark each sub-item `[x]` too.

   **STATE.md** — Re-read `.planning/STATE.md` before editing (executors modify it during plan execution, so your initial read is stale). Update current position, phase status, and progress bar.

9. **Update requirements**
   Mark phase requirements as Complete:
   - Read ROADMAP.md, find this phase's `Requirements:` line (e.g., "AUTH-01, AUTH-02")
   - Read REQUIREMENTS.md traceability table
   - For each REQ-ID in this phase: change Status from "Pending" to "Complete"
   - Write updated REQUIREMENTS.md
   - Skip if: REQUIREMENTS.md doesn't exist, or phase has no Requirements line

10. **Commit phase completion**
    Check `COMMIT_PLANNING_DOCS` from config.json (default: true).
    If false: Skip git operations for .planning/ files.
    If true: Bundle all phase metadata updates in one commit:

    ```bash
    DIR_NAME=$(basename "$PHASE_DIR")

    # Stage deletions from previous locations (safe to try both)
    git add ".planning/phases/pending/${DIR_NAME}" 2>/dev/null || true
    git add ".planning/phases/active/${DIR_NAME}" 2>/dev/null || true
    # Stage additions at current (completed) location
    git add "$PHASE_DIR"
    # Stage planning files
    git add .planning/ROADMAP.md .planning/STATE.md
    # Stage REQUIREMENTS.md if updated
    git add .planning/REQUIREMENTS.md 2>/dev/null || true
    # Commit
    git commit -m "docs(${PHASE_NUM}): complete ${PHASE_NAME} phase"
    ```

10.5. **Push and ensure PR exists (pr_workflow only)**

    After phase completion commit, push from workspace/ and finalize the PR:

    ```bash
    if [ "$PR_WORKFLOW" = "true" ]; then
      # Commit any remaining planning changes in workspace/
      if [ -n "$(git status --porcelain .planning/)" ]; then
        git add .planning/
        git commit -m "docs(${PHASE_NUM}): update planning state"
      fi

      # Push from workspace/ (already on the phase branch)
      git push -u origin "$PHASE_BRANCH"

      # Check if draft PR was created earlier
      PR_NUMBER=$(gh pr list --head "$PHASE_BRANCH" --json number --jq '.[0].number' 2>/dev/null)

      if [ -z "$PR_NUMBER" ]; then
        # Draft PR creation failed earlier — create PR now
        PR_OUTPUT=$(bash "./scripts/create-draft-pr.sh" "$PHASE_DIR" "$PHASE_BRANCH" 2>&1) || true
        PR_NUMBER=$(gh pr list --head "$PHASE_BRANCH" --json number --jq '.[0].number' 2>/dev/null)
      fi

      # Mark PR ready for review (if it exists)
      if [ -n "$PR_NUMBER" ]; then
        gh pr ready "$PR_NUMBER" 2>/dev/null || true
        PR_URL=$(gh pr view "$PR_NUMBER" --json url --jq '.url' 2>/dev/null)
        echo "PR #${PR_NUMBER} marked ready: $PR_URL"
      else
        echo "Warning: Could not create or find PR for branch $PHASE_BRANCH" >&2
      fi
    fi
    ```

    Store PR_NUMBER and PR_URL for offer_next output.

    **Note:** Workspace cleanup happens after PR merge, not here. The workspace stays on the phase branch so the PR remains valid. Users clean up after merge via:
    ```bash
    bash "./scripts/manage-worktree.sh" cleanup-phase "$WORKSPACE_PATH" "$PHASE_BRANCH"
    ```

11. **Offer next steps** - Route to next action (see `<offer_next>`)
    </process>

<offer_next>
Output this markdown directly (not as a code block). Route based on status:

| Status                 | Route                                              |
| ---------------------- | -------------------------------------------------- |
| `gaps_found`           | Route C (gap closure)                              |
| `human_needed`         | Present checklist, then re-route based on approval |
| `passed` + more phases | Route A (next phase)                               |
| `passed` + last phase  | Route B (milestone complete)                       |

---

**Route A: Phase verified, more phases remain**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kata ► PHASE {Z} COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {Z}: {Name}**

{Y} plans executed
Goal verified ✓
{If github.enabled: GitHub Issue: #{issue_number} ({checked}/{total} plans checked off)}
{If PR_WORKFLOW: PR: #{pr_number} ({pr_url}) — ready for review}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Walk through deliverables** — conversational acceptance testing

`/kata-verify-work {Z}`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**

- `/kata-review-pull-requests` — automated code review
  - {If PR_WORKFLOW and WORKTREE_ENABLED: `gh pr merge --merge` then `git -C main pull` and `bash skills/kata-execute-phase/scripts/manage-worktree.sh cleanup-phase workspace $PHASE_BRANCH` — merge PR (worktree-safe)}
  - {If PR_WORKFLOW and not WORKTREE_ENABLED: `gh pr merge --merge --delete-branch` then `git checkout main && git pull` — merge PR directly}
- `/kata-discuss-phase {Z+1}` — gather context for next phase (optional)
- `/kata-plan-phase {Z+1}` — plan next phase directly

───────────────────────────────────────────────────────────────

---

**Route B: Phase verified, milestone complete**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kata ► MILESTONE COMPLETE 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**v1.0**

{N} phases completed
All phase goals verified ✓
{If PR_WORKFLOW: Phase PR: #{pr_number} ({pr_url}) — ready for review}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Walk through deliverables** — conversational acceptance testing

`/kata-verify-work {Z}`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**

- `/kata-review-pull-requests` — automated code review
  - {If PR_WORKFLOW and WORKTREE_ENABLED: `gh pr merge --merge` then `git -C main pull` and `bash skills/kata-execute-phase/scripts/manage-worktree.sh cleanup-phase workspace $PHASE_BRANCH` — merge PR (worktree-safe)}
  - {If PR_WORKFLOW and not WORKTREE_ENABLED: `gh pr merge --merge --delete-branch` then `git checkout main && git pull` — merge PR directly}
- `/kata-audit-milestone` — skip UAT, audit directly
- `/kata-complete-milestone` — skip audit, archive directly

───────────────────────────────────────────────────────────────

---

**Route C: Gaps found — need additional planning**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kata ► PHASE {Z} GAPS FOUND ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {Z}: {Name}**

Score: {N}/{M} must-haves verified
Report: .planning/phases/{phase_dir}/{phase}-VERIFICATION.md

### What's Missing

{Extract gap summaries from VERIFICATION.md}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Plan gap closure** — create additional plans to complete the phase

/kata-plan-phase {Z} --gaps

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**

- cat .planning/phases/{phase_dir}/{phase}-VERIFICATION.md — see full report
- /kata-verify-work {Z} — manual testing before planning

───────────────────────────────────────────────────────────────

---

After user runs /kata-plan-phase {Z} --gaps:

1. Planner reads VERIFICATION.md gaps
2. Creates plans 04, 05, etc. to close gaps
3. User runs /kata-execute-phase {Z} again
4. phase-execute runs incomplete plans (04, 05...)
5. Verifier runs again → loop until passed
   </offer_next>

<wave_execution>
**Parallel spawning:**

Before spawning, read file contents using Read tool. The `@` syntax does not work across Task() boundaries - content must be inlined in the Task prompt.

**Read these files:**

- Each plan file in the wave (e.g., `{plan_01_path}`, `{plan_02_path}`, etc.)
- `.planning/STATE.md`
- `references/executor-instructions.md` (relative to skill base directory) — store as `executor_instructions_content`

**Working directory injection (two cases):**

Resolve the `<working_directory>` block per-plan before spawning the Task() subagent. Two cases based on `WORKTREE_ENABLED` (set in step 0.7):

```bash
# Resolve working directory block for this plan's subagent prompt
WORKING_DIR_BLOCK=""
if [ "$PR_WORKFLOW" = "true" ] && [ "$WORKTREE_ENABLED" = "true" ]; then
  # Case 1: Plan has its own worktree — use the plan-specific path
  PLAN_WT_PATH="WORKTREE_PATH_${plan_num}"
  WORKING_DIR_BLOCK="\n<working_directory>${!PLAN_WT_PATH}</working_directory>"
fi
# Case 2: No plan worktrees — agent works in workspace/ (or project root if no PR workflow)
# No working_directory block needed — default behavior
```

Then append `$WORKING_DIR_BLOCK` to the Task() prompt template for each plan.

Spawn all plans in a wave with a single message containing multiple Task calls, with inlined content:

```
Task(prompt="<agent-instructions>\n{executor_instructions_content}\n</agent-instructions>\n\nExecute plan at {plan_01_path}\n\n<plan>\n{plan_01_content}\n</plan>\n\n<project_state>\n{state_content}\n</project_state>\n\n<workflow_config>\npost_task_command: {EXEC_POST_TASK_CMD}\ncommit_style: {EXEC_COMMIT_STYLE}\ncommit_scope_format: {EXEC_COMMIT_SCOPE_FMT}\n</workflow_config>{WORKING_DIR_BLOCK}", subagent_type="general-purpose", model="{executor_model}")
Task(prompt="<agent-instructions>\n{executor_instructions_content}\n</agent-instructions>\n\nExecute plan at {plan_02_path}\n\n<plan>\n{plan_02_content}\n</plan>\n\n<project_state>\n{state_content}\n</project_state>\n\n<workflow_config>\npost_task_command: {EXEC_POST_TASK_CMD}\ncommit_style: {EXEC_COMMIT_STYLE}\ncommit_scope_format: {EXEC_COMMIT_SCOPE_FMT}\n</workflow_config>{WORKING_DIR_BLOCK}", subagent_type="general-purpose", model="{executor_model}")
Task(prompt="<agent-instructions>\n{executor_instructions_content}\n</agent-instructions>\n\nExecute plan at {plan_03_path}\n\n<plan>\n{plan_03_content}\n</plan>\n\n<project_state>\n{state_content}\n</project_state>\n\n<workflow_config>\npost_task_command: {EXEC_POST_TASK_CMD}\ncommit_style: {EXEC_COMMIT_STYLE}\ncommit_scope_format: {EXEC_COMMIT_SCOPE_FMT}\n</workflow_config>{WORKING_DIR_BLOCK}", subagent_type="general-purpose", model="{executor_model}")
```

All three run in parallel. Task tool blocks until all complete.

**No polling.** No background agents. No TaskOutput loops.
</wave_execution>

<checkpoint_handling>
Plans with `autonomous: false` have checkpoints. The phase-execute.md workflow handles the full checkpoint flow:

- Subagent pauses at checkpoint, returns structured state
- Orchestrator presents to user, collects response
- Spawns fresh continuation agent (not resume)

See `@./references/phase-execute.md` step `checkpoint_handling` for complete details.
</checkpoint_handling>

<deviation_rules>
During execution, handle discoveries automatically:

1. **Auto-fix bugs** - Fix immediately, document in Summary
2. **Auto-add critical** - Security/correctness gaps, add and document
3. **Auto-fix blockers** - Can't proceed without fix, do it and document
4. **Ask about architectural** - Major structural changes, stop and ask user

Only rule 4 requires user intervention.
</deviation_rules>

<commit_rules>
**Per-Task Commits:**

After each task completes:

1. Stage only files modified by that task
2. Commit with format: `{type}({phase}-{plan}): {task-name}`
3. Types: feat, fix, test, refactor, perf, chore
4. Record commit hash for SUMMARY.md

**Plan Metadata Commit:**

After all tasks in a plan complete:

1. Stage plan artifacts only: PLAN.md, SUMMARY.md
2. Commit with format: `docs({phase}-{plan}): complete [plan-name] plan`
3. NO code files (already committed per-task)

**Phase Completion Commit:**

After all plans in phase complete (step 7):

1. Stage: ROADMAP.md, STATE.md, REQUIREMENTS.md (if updated), VERIFICATION.md
2. Commit with format: `docs({phase}): complete {phase-name} phase`
3. Bundles all phase-level state updates in one commit

**NEVER use:**

- `git add .`
- `git add -A`
- `git add src/` or any broad directory

**Always stage files individually.**
</commit_rules>

<success_criteria>

- [ ] All incomplete plans in phase executed
- [ ] Each plan has SUMMARY.md
- [ ] Phase goal verified (must_haves checked against codebase)
- [ ] VERIFICATION.md created in phase directory
- [ ] STATE.md reflects phase completion
- [ ] ROADMAP.md updated
- [ ] REQUIREMENTS.md updated (phase requirements marked Complete)
- [ ] GitHub issue checkboxes updated per wave (if github.enabled)
- [ ] User informed of next steps
      </success_criteria>
