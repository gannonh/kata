<planning_config>

Configuration options for Kata projects in `.planning/config.json`.

<config_schema>

**Full schema:**

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

| Option | Default | Description |
|--------|---------|-------------|
| `mode` | `yolo` | `yolo` = auto-approve, `interactive` = confirm at each step |
| `depth` | `standard` | `quick` (3-5 phases), `standard` (5-8), `comprehensive` (8-12) |
| `parallelization` | `true` | Run independent plans simultaneously |
| `model_profile` | `balanced` | Which AI models for agents (see model-profiles.md) |
| `commit_docs` | `true` | Whether to commit planning artifacts to git |
| `pr_workflow` | `false` | Use PR-based release workflow vs direct commits |
| `workflow.research` | `true` | Spawn researcher before planning each phase |
| `workflow.plan_check` | `true` | Verify plans achieve phase goals before execution |
| `workflow.verifier` | `true` | Confirm deliverables after phase execution |

</config_schema>

<reading_config>

**Standard pattern for reading config values:**

```bash
# Read a string value with default
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")

# Read a boolean value with default
PR_WORKFLOW=$(cat .planning/config.json 2>/dev/null | grep -o '"pr_workflow"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")

# Read nested boolean (workflow.*)
RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
```

</reading_config>

<commit_docs_behavior>

**When `commit_docs: true` (default):**
- Planning files committed normally
- SUMMARY.md, STATE.md, ROADMAP.md tracked in git
- Full history of planning decisions preserved

**When `commit_docs: false`:**
- Skip all `git add`/`git commit` for `.planning/` files
- User must add `.planning/` to `.gitignore`
- Useful for: OSS contributions, client projects, keeping planning private

**Checking the config:**

```bash
# Check config.json first
COMMIT_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")

# Auto-detect gitignored (overrides config)
git check-ignore -q .planning 2>/dev/null && COMMIT_DOCS=false
```

**Auto-detection:** If `.planning/` is gitignored, `commit_docs` is automatically `false` regardless of config.json. This prevents git errors.

**Conditional git operations:**

```bash
if [ "$COMMIT_DOCS" = "true" ]; then
  git add .planning/STATE.md
  git commit -m "docs: update state"
fi
```

</commit_docs_behavior>

<pr_workflow_behavior>

**When `pr_workflow: false` (default):**
- Commit directly to main branch
- Create git tags locally after milestone completion
- Push tags to remote when ready

**When `pr_workflow: true`:**
- Work on feature branches
- Create PRs for phase completion
- Create git tags via GitHub Release after merge
- Enables GitHub Actions for CI/CD (e.g., npm publish)

**Checking the config:**

```bash
PR_WORKFLOW=$(cat .planning/config.json 2>/dev/null | grep -o '"pr_workflow"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

**Usage in kata-completing-milestones:**

```bash
if [ "$PR_WORKFLOW" = "true" ]; then
  # Skip git tag, defer to GitHub Release
  echo "Tag will be created via GitHub Release after merge"
else
  # Create tag locally
  git tag -a v1.0.0 -m "Release v1.0.0"
fi
```

</pr_workflow_behavior>

<workflow_agents>

These settings control optional agent spawning during Kata workflows:

**`workflow.research`** — Spawn kata-phase-researcher before kata-planner
- Investigates domain, finds patterns, surfaces gotchas
- Adds tokens/time but improves plan quality

**`workflow.plan_check`** — Spawn kata-plan-checker after kata-planner
- Verifies plan actually achieves the phase goal
- Catches gaps before execution starts

**`workflow.verifier`** — Spawn kata-verifier after kata-executor
- Confirms must-haves were delivered
- Validates phase success criteria

**Checking workflow config:**

```bash
RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
PLAN_CHECK=$(cat .planning/config.json 2>/dev/null | grep -o '"plan_check"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
VERIFIER=$(cat .planning/config.json 2>/dev/null | grep -o '"verifier"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
```

</workflow_agents>

<setup_uncommitted_mode>

To use uncommitted mode (keep planning private):

1. **Set config:**
   ```json
   {
     "commit_docs": false
   }
   ```

2. **Add to .gitignore:**
   ```
   .planning/
   ```

3. **Existing tracked files:** If `.planning/` was previously tracked:
   ```bash
   git rm -r --cached .planning/
   git commit -m "chore: stop tracking planning docs"
   ```

</setup_uncommitted_mode>

<updating_settings>

Run `/kata:settings` to update config preferences interactively.

The settings skill will:
1. Detect any missing config keys from schema evolution
2. Prompt for preferences on new options
3. Preserve existing values for unchanged settings
4. Update `.planning/config.json` with merged config

</updating_settings>

</planning_config>
