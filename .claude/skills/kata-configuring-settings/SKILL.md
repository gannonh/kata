---
name: kata-configuring-settings
description: Use this skill when configure kata workflow toggles and model profile. Triggers include "settings".
version: 0.1.0
user-invocable: false
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Allow users to toggle workflow agents on/off and select model profile via interactive settings.

Updates `.planning/config.json` with workflow preferences and model profile selection.

**Handles missing config keys:** If config.json is missing any expected keys (e.g., `pr_workflow`, `commit_docs`), prompts user for preferences and adds them.
</objective>

<process>

## 1. Validate Environment

```bash
ls .planning/config.json 2>/dev/null
```

**If not found:** Error - run `/kata:project-new` first.

## 2. Read Current Config and Detect Missing Keys

```bash
cat .planning/config.json
```

Parse current values with defaults:
- `mode` — yolo or interactive (default: `yolo`)
- `depth` — quick, standard, or comprehensive (default: `standard`)
- `parallelization` — run agents in parallel (default: `true`)
- `model_profile` — which model each agent uses (default: `balanced`)
- `commit_docs` — commit planning artifacts to git (default: `true`)
- `pr_workflow` — use PR-based release workflow (default: `false`)
- `workflow.research` — spawn researcher during phase-plan (default: `true`)
- `workflow.plan_check` — spawn plan checker during phase-plan (default: `true`)
- `workflow.verifier` — spawn verifier during phase-execute (default: `true`)

**Detect missing keys:**

Check if these keys exist in config.json:
- `commit_docs`
- `pr_workflow`

If any are missing, note them for step 3.

## 3. Present Settings (Including New Options)

**If missing keys were detected:**

Display notification:
```
⚠️  New config options available: {list missing keys}
   Adding these to your settings...
```

Use AskUserQuestion with current values shown:

```
AskUserQuestion([
  {
    question: "Which model profile for agents?",
    header: "Model",
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
      { label: "Yes", description: "Protect main, create PRs, tag via GitHub Release" },
      { label: "No (Recommended)", description: "Commit directly to main, create tags locally" }
    ]
  },
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

**Pre-select based on current config values (use defaults for missing keys).**

## 4. Update Config

Merge new settings into existing config.json (preserving existing keys like `mode`, `depth`, `parallelization`):

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

Write updated config to `.planning/config.json`.

**If `commit_docs` changed to `false`:**
- Add `.planning/` to `.gitignore` (create if needed)
- Note: User should run `git rm -r --cached .planning/` if already tracked

## 5. Confirm Changes

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Kata ► SETTINGS UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Setting            | Value                     |
| ------------------ | ------------------------- |
| Model Profile      | {quality/balanced/budget} |
| Commit Docs        | {On/Off}                  |
| PR Workflow        | {On/Off}                  |
| Plan Researcher    | {On/Off}                  |
| Plan Checker       | {On/Off}                  |
| Execution Verifier | {On/Off}                  |

These settings apply to future /kata:phase-plan and /kata:phase-execute runs.

Quick commands:
- /kata:models-config <profile> — switch model profile
- /kata:phase-plan --research — force research
- /kata:phase-plan --skip-research — skip research
- /kata:phase-plan --skip-verify — skip plan check
```

</process>

<success_criteria>
- [ ] Current config read
- [ ] Missing keys detected and user notified
- [ ] User presented with 6 settings (profile + commit_docs + pr_workflow + 3 toggles)
- [ ] Config updated with complete schema
- [ ] Changes confirmed to user
</success_criteria>
