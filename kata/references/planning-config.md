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
- Work on feature branches (one branch per phase)
- Create PRs for phase completion
- Create git tags via GitHub Release after merge
- Enables GitHub Actions for CI/CD (e.g., npm publish)

**Checking the config:**

```bash
PR_WORKFLOW=$(cat .planning/config.json 2>/dev/null | grep -o '"pr_workflow"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

### Branch Naming Convention

**Pattern:** `{type}/v{milestone}-{phase}-{slug}`

**Examples:**
- `feat/v0.1.9-01-plugin-structure-validation`
- `fix/v0.1.9-01.1-document-pr-workflow`
- `docs/v0.2.0-03-api-reference`

**Prefix types:** Follow commit type conventions
- `feat/` — New features
- `fix/` — Bug fixes
- `docs/` — Documentation changes
- `refactor/` — Code restructuring
- `chore/` — Maintenance tasks

**Branch timing:** Create after planning complete, before execution. Planning work stays on main.

### PR Granularity & Lifecycle

**Granularity:** One PR per phase (not per-plan, not per-milestone).

**Lifecycle:**
1. **Create branch** — After planning complete, before first execution task
2. **Open draft PR** — At first commit on the branch
3. **Mark ready** — When phase execution complete (all plans done)
4. **Merge** — After review/approval

**PR title format:** `v{milestone} Phase {N}: {Phase Name}`
- Example: `v0.1.9 Phase 1: Plugin Structure & Validation`

**PR body format:**
```markdown
## Phase Goal
[One-line phase objective]

## Plans Completed
- [x] Plan 01: [name]
- [x] Plan 02: [name]

## Test Checklist
- [ ] [Success criterion 1]
- [ ] [Success criterion 2]
```

### Release-Milestone Relationship

**Release = milestone** — Only one release per milestone (1:1 mapping).

**Milestone name IS the version:**
- v0.1.9 milestone produces v0.1.9 release
- No mid-milestone releases
- No version number mismatch

**Release trigger:** Merge to main with version bump. The `publish.yml` workflow detects version changes in package.json and triggers the release.

**Version bump timing:** User bumps version manually before `/kata:complete-milestone`. The workflow verifies the bump is done.

### Workflow Timing

| Step | When | What Happens |
|------|------|--------------|
| Create branch | After planning, before execution | `git checkout -b {type}/v{milestone}-{phase}-{slug}` |
| Open PR | At first commit | Open as draft, set title/body |
| Execute plans | During phase | Each plan commits to branch |
| Mark ready | All plans complete | Convert draft to ready for review |
| Merge | After approval | Merge to main, triggers release if version bumped |

### Integration Points

Commands that check `pr_workflow` and change behavior:

| Command | pr_workflow: false | pr_workflow: true |
|---------|-------------------|-------------------|
| new-project | Asks about config | Offers GitHub Actions scaffold |
| settings | Allows toggle | Same |
| execute-phase | Commits to main | Create branch, open draft PR |
| complete-milestone | Creates local tag | Skips tag, defer to GitHub Release |
| progress | Phase status only | Show PR status |

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
