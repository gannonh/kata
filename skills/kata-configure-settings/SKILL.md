---
name: kata-configure-settings
description: Configure kata session settings and workflow variants. Triggers include "settings", "configure", "preferences", "workflow config", "workflow variants".
metadata:
  version: "0.2.0"
---

<objective>
Allow users to configure all Kata settings through a single skill: session settings and workflow variants.

Updates `.planning/config.json` using accessor scripts.
</objective>

<process>

## 1. Validate Environment

```bash
ls .planning/config.json 2>/dev/null
```

**If not found:** Error - run `/kata-new-project` first.

## 2. Read Current Values via Accessor Scripts

```bash
SCRIPT_DIR="../kata-configure-settings/scripts"

# Session settings
MODE=$(bash "$SCRIPT_DIR/read-pref.sh" "mode" "yolo")
DEPTH=$(bash "$SCRIPT_DIR/read-pref.sh" "depth" "standard")
MODEL_PROFILE=$(bash "$SCRIPT_DIR/read-pref.sh" "model_profile" "balanced")
COMMIT_DOCS=$(bash "$SCRIPT_DIR/read-pref.sh" "commit_docs" "true")
PR_WORKFLOW=$(bash "$SCRIPT_DIR/read-pref.sh" "pr_workflow" "false")
RESEARCH=$(bash "$SCRIPT_DIR/read-pref.sh" "workflow.research" "true")
PLAN_CHECK=$(bash "$SCRIPT_DIR/read-pref.sh" "workflow.plan_check" "true")
VERIFIER=$(bash "$SCRIPT_DIR/read-pref.sh" "workflow.verifier" "true")
WORKTREE_ENABLED=$(bash "$SCRIPT_DIR/read-pref.sh" "worktree.enabled" "false")
PR_WORKFLOW_VAL=$(bash "$SCRIPT_DIR/read-pref.sh" "pr_workflow" "false")

# Workflow variants
EXEC_POST_TASK=$(bash "$SCRIPT_DIR/read-pref.sh" "workflows.execute-phase.post_task_command" "")
EXEC_COMMIT_STYLE=$(bash "$SCRIPT_DIR/read-pref.sh" "workflows.execute-phase.commit_style" "conventional")
EXEC_SCOPE_FMT=$(bash "$SCRIPT_DIR/read-pref.sh" "workflows.execute-phase.commit_scope_format" "{phase}-{plan}")
VERIFY_EXTRA_CMDS=$(bash "$SCRIPT_DIR/read-pref.sh" "workflows.verify-work.extra_verification_commands" "[]")
MILESTONE_VERSION_FILES=$(bash "$SCRIPT_DIR/read-pref.sh" "workflows.complete-milestone.version_files" "[]")
MILESTONE_PRE_RELEASE=$(bash "$SCRIPT_DIR/read-pref.sh" "workflows.complete-milestone.pre_release_commands" "[]")
```

## 3. Present Settings in Two Sections

Present each section to the user via AskUserQuestion. Pre-select current values.

### Section A: Session Settings (config.json)

```
AskUserQuestion([
  {
    question: "Which model profile for agents?",
    header: "Model Profile",
    multiSelect: false,
    options: [
      { label: "Quality", description: "Opus everywhere except verification (highest cost)" },
      { label: "Balanced (Recommended)", description: "Opus for planning, Sonnet for execution/verification" },
      { label: "Budget", description: "Sonnet for writing, Haiku for research/verification (lowest cost)" }
    ]
  },
  {
    question: "Commit planning docs to git?",
    header: "Commit Docs",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Track planning artifacts in git history" },
      { label: "No", description: "Keep planning private (add .planning/ to .gitignore)" }
    ]
  },
  {
    question: "Use PR-based release workflow?",
    header: "PR Workflow",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Protect main, create PRs, tag via GitHub Release" },
      { label: "No", description: "Commit directly to main, create tags locally" }
    ]
  },
  // If PR_WORKFLOW_VAL = "true", include the Git Worktrees question:
  {
    question: "Enable git worktree isolation per plan?",
    header: "Git Worktrees",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Each plan gets isolated worktree and branch" },
      { label: "No", description: "Plans share the working directory (standard)" }
    ]
  },
  // If PR_WORKFLOW_VAL = "false", omit the Git Worktrees question entirely.
  <!-- If pr_workflow is false, skip Git Worktrees question — worktrees require PR workflow -->
  {
    question: "Spawn Plan Researcher? (researches domain before planning)",
    header: "Research",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Research phase goals before planning" },
      { label: "No", description: "Skip research, plan directly" }
    ]
  },
  {
    question: "Spawn Plan Checker? (verifies plans before execution)",
    header: "Plan Check",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify plans meet phase goals" },
      { label: "No", description: "Skip plan verification" }
    ]
  },
  {
    question: "Spawn Execution Verifier? (verifies phase completion)",
    header: "Verifier",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify must-haves after execution" },
      { label: "No", description: "Skip post-execution verification" }
    ]
  }
])
```

### Section B: Workflow Variants (config.json workflows section)

Present workflow variant settings. For text inputs, show current value and ask if user wants to change.

```
AskUserQuestion([
  {
    question: "Commit style for execute-phase?",
    header: "Commit Style",
    multiSelect: false,
    options: [
      { label: "conventional", description: "Conventional Commits (default)" },
      { label: "semantic", description: "Semantic commit messages" },
      { label: "simple", description: "Plain descriptive messages" }
    ]
  }
])
```

For the remaining text-input workflow variant settings, display current values and ask user:

```
Current workflow variant settings:

| Setting                 | Current Value                         |
| ----------------------- | ------------------------------------- |
| Post-task Command       | {EXEC_POST_TASK or "none"}            |
| Commit Scope Format     | {EXEC_SCOPE_FMT}                      |
| Extra Verification Cmds | {VERIFY_EXTRA_CMDS or "none"}         |
| Version Files           | {MILESTONE_VERSION_FILES or "auto"}   |
| Pre-release Commands    | {MILESTONE_PRE_RELEASE or "none"}     |

Enter new values or press Enter to keep current.
```

Use AskUserQuestion to confirm whether the user wants to change any text-input values. If yes, collect new values.

## 4. Write Updates

### Session Settings (via set-config.sh)

```bash
SCRIPT_DIR="../kata-configure-settings/scripts"

bash "$SCRIPT_DIR/set-config.sh" "mode" "$NEW_MODE"
bash "$SCRIPT_DIR/set-config.sh" "depth" "$NEW_DEPTH"
bash "$SCRIPT_DIR/set-config.sh" "model_profile" "$NEW_MODEL_PROFILE"
bash "$SCRIPT_DIR/set-config.sh" "commit_docs" "$NEW_COMMIT_DOCS"
bash "$SCRIPT_DIR/set-config.sh" "pr_workflow" "$NEW_PR_WORKFLOW"
bash "$SCRIPT_DIR/set-config.sh" "worktree.enabled" "$NEW_WORKTREE_ENABLED"
bash "$SCRIPT_DIR/set-config.sh" "workflow.research" "$NEW_RESEARCH"
bash "$SCRIPT_DIR/set-config.sh" "workflow.plan_check" "$NEW_PLAN_CHECK"
bash "$SCRIPT_DIR/set-config.sh" "workflow.verifier" "$NEW_VERIFIER"
```

### Workflow Variants (via set-config.sh)

```bash
bash "$SCRIPT_DIR/set-config.sh" "workflows.execute-phase.post_task_command" "$NEW_POST_TASK_CMD"
bash "$SCRIPT_DIR/set-config.sh" "workflows.execute-phase.commit_style" "$NEW_COMMIT_STYLE"
bash "$SCRIPT_DIR/set-config.sh" "workflows.execute-phase.commit_scope_format" "$NEW_SCOPE_FMT"
bash "$SCRIPT_DIR/set-config.sh" "workflows.verify-work.extra_verification_commands" "$NEW_EXTRA_CMDS"
bash "$SCRIPT_DIR/set-config.sh" "workflows.complete-milestone.version_files" "$NEW_VERSION_FILES"
bash "$SCRIPT_DIR/set-config.sh" "workflows.complete-milestone.pre_release_commands" "$NEW_PRE_RELEASE"
```

## Side-Effects

**If worktree was just enabled (changed from false to true):**

```bash
# setup-worktrees.sh requires a clean working tree.
# Commit all pending config changes first.
git add .planning/config.json 2>/dev/null
git commit -m "chore: update kata settings" 2>/dev/null || true

# Run setup after committing
if ! bash "$SCRIPT_DIR/setup-worktrees.sh"; then
  echo "Error: Worktree setup failed. Reverting worktree.enabled to false."
  bash "$SCRIPT_DIR/set-config.sh" "worktree.enabled" "false"
fi
```

The settings flow continues regardless of setup outcome (non-fatal).

**After successful worktree setup, inform the user:**

> Worktree layout created. `main/` is now your project root. Restart Claude Code from inside `main/` to continue working. All skills, git commands, and file edits run from `main/`.

**If worktree was just disabled (changed from true to false):**

Inform the user:

> Worktree isolation disabled. Phase execution will run all plans in the shared working directory. The bare repo layout is preserved — continue working from `main/`.

**If `commit_docs` changed to `false`:**

- Add `.planning/` to `.gitignore` (create if needed)
- Note: User should run `git rm -r --cached .planning/` if already tracked

## 5. Confirm Changes

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kata > SETTINGS UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Session Settings** (config.json)

| Setting            | Value                     |
| ------------------ | ------------------------- |
| Model Profile      | {quality/balanced/budget} |
| Commit Docs        | {On/Off}                  |
| PR Workflow        | {On/Off}                  |
| Git Worktrees      | {On/Off}                  |
| Plan Researcher    | {On/Off}                  |
| Plan Checker       | {On/Off}                  |
| Execution Verifier | {On/Off}                  |

**Workflow Variants** (config.json)

| Setting                   | Value           |
| ------------------------- | --------------- |
| Post-task Command         | {value or none} |
| Commit Style              | {value}         |
| Commit Scope Format       | {value}         |
| Extra Verification Cmds   | {value or none} |
| Version Files             | {value or auto} |
| Pre-release Commands      | {value or none} |
```

These settings apply to future /kata-plan-phase and /kata-execute-phase runs.

Quick commands:

- /kata-set-profile <profile> - switch model profile
- /kata-plan-phase --research - force research
- /kata-plan-phase --skip-research - skip research
- /kata-plan-phase --skip-verify - skip plan check

**If PR Workflow was just enabled (changed from Off to On), append:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 RECOMMENDED: Enable Branch Protection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PR workflow is enabled. Protect your main branch:

  https://github.com/{owner}/{repo}/settings/branches

Settings for `main`:
  - Require a pull request before merging
  - Do not allow bypassing the above settings
  - Allow force pushes (uncheck)

This ensures ALL changes go through PRs.
```

</process>

<success_criteria>

- [ ] Current config read via read-pref.sh (no inline grep/cat parsing)
- [ ] User presented with 2 config sections: session settings, workflow variants
- [ ] Config written via set-config.sh (no inline node JSON manipulation for config.json)
- [ ] .gitignore updated if commit_docs set to false
- [ ] Changes confirmed to user with two-section display
</success_criteria>
