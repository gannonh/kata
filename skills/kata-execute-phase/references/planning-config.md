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
  "github": {
    "enabled": true|false,
    "issueMode": "auto|ask|never"
  },
  "display": {
    "statusline": true|false
  },
  "workflow": {
    "research": true|false,
    "plan_check": true|false,
    "verifier": true|false
  }
}
```

| Option                | Default    | Description                                                    |
| --------------------- | ---------- | -------------------------------------------------------------- |
| `mode`                | `yolo`     | `yolo` = auto-approve, `interactive` = confirm at each step    |
| `depth`               | `standard` | `quick` (3-5 phases), `standard` (5-8), `comprehensive` (8-12) |
| `parallelization`     | `true`     | Run independent plans simultaneously                           |
| `model_profile`       | `balanced` | Which AI models for agents (see model-profiles.md)             |
| `commit_docs`         | `true`     | Whether to commit planning artifacts to git                    |
| `pr_workflow`         | `true`     | Use PR-based release workflow vs direct commits                |
| `github.enabled`      | `false`    | Create GitHub Milestones/Issues when true                      |
| `github.issueMode`    | `never`    | Issue creation mode: `auto`, `ask`, `never`                    |
| `display.statusline`  | `true`     | Enable Kata custom statusline in Claude Code                   |
| `workflow.research`   | `true`     | Spawn researcher before planning each phase                    |
| `workflow.plan_check` | `true`     | Verify plans achieve phase goals before execution              |
| `workflow.verifier`   | `true`     | Confirm deliverables after phase execution                     |

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

### Branch Types

| Branch Type        | Pattern                              | Purpose                          |
| ------------------ | ------------------------------------ | -------------------------------- |
| **Phase branch**   | `{type}/v{milestone}-{phase}-{slug}` | Code work for one phase          |
| **Release branch** | `release/v{milestone}`               | Version bump, changelog, archive |

**Phase branch examples:**
- `feat/v0.1.9-01-plugin-structure-validation`
- `fix/v0.1.9-01.1-document-pr-workflow`
- `docs/v0.2.0-03-api-reference`

**Release branch examples:**
- `release/v0.1.9`
- `release/v0.2.0`

**Type prefixes** (for phase branches):
- `feat/` — New features
- `fix/` — Bug fixes
- `docs/` — Documentation changes
- `refactor/` — Code restructuring
- `chore/` — Maintenance tasks

**Branch timing:**
- Phase branches: Create after planning, before execution
- Release branch: Create when starting `/kata-complete-milestone`

### PR Granularity & Lifecycle

**Two PR types:**
- **Phase PRs** — One per phase, contains code work
- **Release PR** — One per milestone, contains version bump and archive

#### Phase PR Lifecycle

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

#### Release PR Lifecycle

1. **Create branch** — When starting `/kata-complete-milestone`
2. **Make release commits** — Version bump, CHANGELOG, milestone archive
3. **Open PR** — Ready for review (not draft)
4. **Merge** — Triggers GitHub Action → creates tag → publishes

**PR title format:** `Release v{milestone}`
- Example: `Release v0.1.9`

**PR body format:**
```markdown
## Release v{milestone}

**Milestone:** {Milestone Name}

### Changes
- [Summary of what shipped in this milestone]

### Release Checklist
- [x] Version bumped in package.json
- [x] CHANGELOG.md updated
- [x] Milestone archived

After merge, GitHub Action will:
- Create tag v{milestone}
- Publish to npm (if configured)
```

### Release-Milestone Relationship

**Release = milestone** — Only one release per milestone (1:1 mapping).

**Milestone name IS the version:**
- v0.1.9 milestone produces v0.1.9 release
- No mid-milestone releases
- No version number mismatch

**Release flow:**
1. All phase PRs merged to main (code complete)
2. `/kata-complete-milestone` creates release branch
3. Version bump, changelog, archive committed to release branch
4. Release PR merged to main
5. GitHub Action detects version change → creates tag → publishes

**Release trigger:** Merge of release PR to main. The `publish.yml` workflow detects version changes in package.json and triggers the release.

**Version bump timing:** Version bump happens ON the release branch, as part of `/kata-complete-milestone`.

### Workflow Timing

**Phase workflow:**

| Step          | When                             | What Happens                                         |
| ------------- | -------------------------------- | ---------------------------------------------------- |
| Create branch | After planning, before execution | `git checkout -b {type}/v{milestone}-{phase}-{slug}` |
| Open draft PR | At first commit                  | `gh pr create --draft`                               |
| Execute plans | During phase                     | Each plan commits to branch                          |
| Mark ready    | All plans complete               | `gh pr ready`                                        |
| Merge         | After approval                   | Merge to main                                        |

**Release workflow (after all phases complete):**

| Step            | When                        | What Happens                                  |
| --------------- | --------------------------- | --------------------------------------------- |
| Create branch   | Start of milestone-complete | `git checkout -b release/v{milestone}`        |
| Release commits | During milestone-complete   | Version bump, changelog, archive              |
| Open PR         | After commits               | `gh pr create --title "Release v{milestone}"` |
| Merge           | After approval              | Merge to main                                 |
| GitHub Action   | After merge                 | Creates tag, publishes to npm                 |

### Integration Points

Commands that check `pr_workflow` and change behavior:

| Command            | pr_workflow: false | pr_workflow: true                      |
| ------------------ | ------------------ | -------------------------------------- |
| project-new        | Asks about config  | Offers GitHub Actions scaffold         |
| settings           | Allows toggle      | Same                                   |
| phase-execute      | Commits to main    | Create phase branch, open draft PR     |
| milestone-complete | Creates local tag  | Create release branch, open release PR |
| progress           | Phase status only  | Show PR status (phase and release)     |

**Usage in kata-execute-phase:**

```bash
if [ "$PR_WORKFLOW" = "true" ]; then
  # Create phase branch and PR
  git checkout -b "feat/v${MILESTONE}-${PHASE}-${SLUG}"
  # ... execute plans ...
  gh pr create --draft --title "v${MILESTONE} Phase ${PHASE}: ${NAME}"
else
  # Commit directly to main
  git add . && git commit -m "feat(${PHASE}): ..."
fi
```

**Usage in kata-complete-milestone:**

```bash
if [ "$PR_WORKFLOW" = "true" ]; then
  # Create release branch
  git checkout -b "release/v${VERSION}"
  # ... bump version, update changelog, archive milestone ...
  git push -u origin "release/v${VERSION}"
  gh pr create --title "Release v${VERSION}" --body "..."
  echo "Merge the release PR to trigger GitHub Action"
else
  # Create tag locally
  git tag -a "v${VERSION}" -m "Release v${VERSION}"
  echo "Push tag: git push origin v${VERSION}"
fi
```

</pr_workflow_behavior>

<github_integration>

## GitHub Integration

When `github.enabled: true`, Kata creates GitHub Milestones and Issues to mirror your planning structure.

### Reading Config Values

```bash
# Read github.enabled (default: false)
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")

# Read github.issueMode (default: never)
GITHUB_ISSUE_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"issueMode"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "never")
```

**Note:** The `head -1` in `GITHUB_ENABLED` ensures we get the `github.enabled` value, not a similarly-named key in another namespace.

### Conditional Execution

```bash
if [ "$GITHUB_ENABLED" = "true" ]; then
  # GitHub operations here
  gh milestone create "v${MILESTONE}" --description "..."
fi

if [ "$GITHUB_ENABLED" = "true" ] && [ "$GITHUB_ISSUE_MODE" = "auto" ]; then
  # Auto-create issue
  gh issue create --title "Phase ${PHASE}: ${NAME}" --milestone "v${MILESTONE}"
fi

if [ "$GITHUB_ENABLED" = "true" ] && [ "$GITHUB_ISSUE_MODE" = "ask" ]; then
  # Check cached decision, prompt if needed
  # See github-integration.md for ask mode implementation
fi
```

### Issue Mode Values

| Value   | Behavior                                                               |
| ------- | ---------------------------------------------------------------------- |
| `auto`  | Create Issues automatically for each phase                             |
| `ask`   | Prompt once per milestone; decision applies to all phases in milestone |
| `never` | Never create phase Issues (Milestones still created if enabled)        |

**Detailed integration points:** See [github-integration.md](github-integration.md)

</github_integration>

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

<display_settings>

## Display Settings

### `display.statusline` (default: `true`)

Controls whether Kata's custom statusline is enabled in Claude Code.

**When `true`:**
- Shows current model, context usage %, and Kata update availability
- Configures `.claude/settings.json` with statusLine hook
- Copies `kata-statusline.js` to `.claude/hooks/`

**When `false`:**
- Uses Claude Code's default statusline
- No `.claude/settings.json` modification

**Note:** Statusline changes take effect on next Claude Code session start.

**Checking the config:**

```bash
STATUSLINE=$(cat .planning/config.json 2>/dev/null | grep -o '"statusline"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
```

</display_settings>

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

Run `/kata-configure-settings` to update config preferences interactively.

The settings skill will:
1. Detect any missing config keys from schema evolution
2. Prompt for preferences on new options
3. Preserve existing values for unchanged settings
4. Update `.planning/config.json` with merged config

</updating_settings>

</planning_config>
