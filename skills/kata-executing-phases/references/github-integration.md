<github_integration>

GitHub integration for Kata projects. Documents all integration points and configuration.

<overview>

## Purpose

GitHub integration adds automatic Milestone and Issue creation to Kata workflows. When enabled, Kata mirrors your roadmap structure to GitHub:

- **Milestones** map to Kata milestones (e.g., v1.1.0)
- **Issues** map to Kata phases within milestones

This provides visibility into project progress outside Claude Code and enables stakeholder tracking via GitHub's native tools.

## Relationship to pr_workflow

GitHub integration (`github.*`) and `pr_workflow` are independent but complementary:

| Config Key       | Controls                              | Independent? |
| ---------------- | ------------------------------------- | ------------ |
| `github.enabled` | GitHub Milestone/Issue creation       | Yes          |
| `pr_workflow`    | Branch strategy and PR-based releases | Yes          |

**Recommendation:** Enable both for full GitHub integration:
- `github.enabled: true` — Milestones and Issues track planning
- `pr_workflow: true` — PRs track execution

Either can be used independently:
- `github.enabled: true` + `pr_workflow: false` — Issues without PRs (direct commits)
- `github.enabled: false` + `pr_workflow: true` — PRs without Issues (branch workflow only)

</overview>

<config_keys>

## Configuration Keys

### `github.enabled` (default: `false`)

Master toggle for GitHub Milestone/Issue creation.

**When `true`:**
- Milestones created when starting new Kata milestones
- Issues created/updated based on `issueMode`
- Progress tracking shows GitHub status

**When `false`:**
- No GitHub API calls
- Planning stays local to `.planning/` directory

### `github.issueMode` (default: `never`)

Controls when phase Issues are created.

| Value   | Behavior                                                                 |
| ------- | ------------------------------------------------------------------------ |
| `auto`  | Create Issues automatically for each phase, no prompting                 |
| `ask`   | Prompt once per milestone; decision applies to all phases in milestone   |
| `never` | Never create phase Issues (Milestones still created if `enabled: true`)  |

**The `ask` flow:**

1. When starting first phase in a milestone, user is prompted:
   "Create GitHub Issues for phases in v1.1.0? (y/n)"
2. Response is cached for that milestone
3. All subsequent phases in that milestone follow the cached decision
4. Next milestone prompts again

**Design rationale:**
- `auto` for teams that want full GitHub mirroring
- `ask` for teams that want control per-milestone
- `never` for teams that only want milestone-level tracking (no phase granularity)

</config_keys>

<integration_points>

## Integration Points by Phase

This section documents where GitHub hooks integrate across Kata skills.

### Phase 2: Project/Milestone Setup

#### `kata-starting-projects`

**Hook:** During config onboarding
**Action:** Ask if user wants GitHub integration, set initial `github.*` values
**Config checked:** None (this is where config is created)

```markdown
During project initialization:
1. Ask: "Enable GitHub Milestone/Issue tracking? (y/n)"
2. If yes, ask: "Create Issues automatically, ask per milestone, or never?"
3. Set github.enabled and github.issueMode in config.json
```

#### `kata-starting-milestones`

**Hook:** After milestone directory created, before returning
**Action:** Create GitHub Milestone via `gh` CLI
**Config checked:** `github.enabled`

```bash
if [ "$GITHUB_ENABLED" = "true" ]; then
  gh milestone create "v${MILESTONE}" --description "${MILESTONE_DESCRIPTION}"
fi
```

**Error handling:**
- If milestone exists, continue (idempotent)
- If `gh` auth fails, warn and continue (non-blocking)

#### `kata-configuring-settings`

**Hook:** When displaying/updating settings
**Action:** Include `github.*` settings in configuration UI
**Config checked:** N/A (manages config)

```markdown
GitHub Integration:
- enabled: [true/false]
- issueMode: [auto/ask/never]
```

### Phase 3-4: Planning & Issue Creation

#### `kata-planning-phases`

**Hook:** After phase plan created, before returning
**Action:** Create or update GitHub Issue for the phase
**Config checked:** `github.enabled`, `github.issueMode`

```bash
if [ "$GITHUB_ENABLED" = "true" ] && [ "$ISSUE_MODE" != "never" ]; then
  # For 'ask' mode, check/prompt for milestone decision
  # Create issue with phase objective as body
  gh issue create \
    --title "Phase ${PHASE}: ${PHASE_NAME}" \
    --milestone "v${MILESTONE}" \
    --body "## Objective\n${OBJECTIVE}\n\n## Plans\n- [ ] Plan 01\n- [ ] Plan 02"
fi
```

**Issue body format:**
- Objective from CONTEXT.md
- Checkbox list of plans (unchecked)

### Phase 4-5: Execution & Tracking

#### `kata-executing-phases`

**Hook:** After each plan completes
**Action:** Update Issue checklist, optionally create PR
**Config checked:** `github.enabled`, `github.issueMode`, `pr_workflow`

```bash
if [ "$GITHUB_ENABLED" = "true" ] && [ "$ISSUE_CREATED" = "true" ]; then
  # Update issue body to check off completed plan
  gh issue edit $ISSUE_NUMBER --body "..."
fi

if [ "$PR_WORKFLOW" = "true" ]; then
  # Create/update draft PR (existing behavior)
fi
```

**Checklist update pattern:**
- Read current issue body
- Find matching plan checkbox
- Change `- [ ]` to `- [x]`
- Write updated body

### Phase 5: Progress & Visibility

#### `kata-tracking-progress`

**Hook:** When displaying status
**Action:** Include GitHub Issue/Milestone/PR status
**Config checked:** `github.enabled`, `pr_workflow`

```bash
if [ "$GITHUB_ENABLED" = "true" ]; then
  # Fetch milestone progress
  gh milestone view "v${MILESTONE}" --json title,state,closedIssues,openIssues

  # Fetch phase issues
  gh issue list --milestone "v${MILESTONE}" --json number,title,state
fi

if [ "$PR_WORKFLOW" = "true" ]; then
  # Fetch PR status (existing behavior)
  gh pr list --json number,title,state,mergeable
fi
```

**Display format:**
```
GitHub Status:
  Milestone: v1.1.0 (3/6 issues closed)
  Current Phase Issue: #42 (open)
  Phase PR: #45 (draft, 2 checks passing)
```

</integration_points>

<issue_mode_behavior>

## issueMode Detailed Behavior

### `auto` Mode

Issues created immediately when phase planning completes. No prompts.

**Timeline:**
1. `/kata:plan-phase 1` → Phase 1 planned → Issue #1 created
2. `/kata:plan-phase 2` → Phase 2 planned → Issue #2 created
3. ...

**Use when:** Team wants full GitHub visibility, no manual intervention.

### `ask` Mode

Prompts once per milestone. Decision cached in STATE.md.

**Timeline:**
1. `/kata:plan-phase 1` → "Create Issues for v1.1.0?" → User: "y"
2. Phase 1 planned → Issue #1 created (decision cached)
3. `/kata:plan-phase 2` → Phase 2 planned → Issue #2 created (no prompt, uses cache)
4. New milestone v1.2.0 starts...
5. `/kata:plan-phase 1` → "Create Issues for v1.2.0?" → User: "n"
6. Phase 1 planned → No issue created

**Cache location:** STATE.md under `### GitHub Decisions`

```markdown
### GitHub Decisions

| Milestone | Issues? | Decided    |
| --------- | ------- | ---------- |
| v1.1.0    | yes     | 2026-01-25 |
| v1.2.0    | no      | 2026-01-26 |
```

**Use when:** Team wants control but not per-phase prompts.

### `never` Mode

No phase Issues created. Milestones still created if `github.enabled: true`.

**Timeline:**
1. `/kata:new-milestone v1.1.0` → GitHub Milestone created
2. `/kata:plan-phase 1` → Phase 1 planned → No issue
3. ...

**Use when:** Team wants milestone-level tracking only, or manages Issues manually.

</issue_mode_behavior>

<cli_patterns>

## GitHub CLI Patterns

All GitHub integration uses the `gh` CLI. Authentication handled externally.

### Authentication Check

```bash
# Verify gh is authenticated
if ! gh auth status &>/dev/null; then
  echo "Warning: gh CLI not authenticated. GitHub integration skipped."
  exit 0  # Non-blocking, continue without GitHub
fi
```

### Milestone Operations

```bash
# Create milestone
gh milestone create "v${MILESTONE}" \
  --description "${DESCRIPTION}" \
  --due-date "${DUE_DATE}"  # Optional

# Check if milestone exists
gh milestone list --json title | grep -q "\"v${MILESTONE}\""

# Close milestone
gh milestone edit "v${MILESTONE}" --state closed
```

### Issue Operations

```bash
# Create issue
gh issue create \
  --title "Phase ${PHASE}: ${NAME}" \
  --milestone "v${MILESTONE}" \
  --body "$(cat <<'EOF'
## Objective
${OBJECTIVE}

## Plans
- [ ] Plan 01: ${PLAN_01_NAME}
- [ ] Plan 02: ${PLAN_02_NAME}
EOF
)"

# Update issue body
gh issue edit ${ISSUE_NUMBER} --body "..."

# Close issue
gh issue close ${ISSUE_NUMBER}

# Get issue number by title
ISSUE_NUMBER=$(gh issue list --milestone "v${MILESTONE}" --json number,title \
  | jq -r ".[] | select(.title | contains(\"Phase ${PHASE}:\")) | .number")
```

### Querying Status

```bash
# Milestone progress
gh milestone view "v${MILESTONE}" --json title,state,closedIssues,openIssues

# List phase issues
gh issue list --milestone "v${MILESTONE}" --state all --json number,title,state

# PR status
gh pr list --state open --json number,title,state,mergeable,statusCheckRollup
```

</cli_patterns>

<error_handling>

## Error Handling

GitHub operations are **non-blocking**. Failures warn but do not stop Kata workflows.

### Authentication Failures

```bash
if ! gh auth status &>/dev/null; then
  echo "⚠ GitHub CLI not authenticated. Run 'gh auth login' to enable GitHub integration."
  # Continue without GitHub operations
fi
```

### API Errors

```bash
if ! gh milestone create "v${MILESTONE}" 2>/dev/null; then
  # Milestone may already exist
  if gh milestone list --json title | grep -q "\"v${MILESTONE}\""; then
    echo "Milestone v${MILESTONE} already exists (reusing)"
  else
    echo "⚠ Failed to create milestone. GitHub integration may be unavailable."
  fi
fi
```

### Rate Limiting

If rate limited, warn and continue. GitHub operations can be retried manually.

```bash
if echo "$ERROR" | grep -q "rate limit"; then
  echo "⚠ GitHub API rate limited. Try again later."
fi
```

</error_handling>

<summary>

## Skills Affected Summary

| Skill                      | Phase | GitHub Action                    | Config Keys Checked                    |
| -------------------------- | ----- | -------------------------------- | -------------------------------------- |
| `kata-starting-projects`   | 2     | Config onboarding                | None (creates config)                  |
| `kata-starting-milestones` | 2     | Create GitHub Milestone          | `github.enabled`                       |
| `kata-configuring-settings`| 2     | Display/update github.* settings | N/A                                    |
| `kata-planning-phases`     | 3-4   | Create/update phase Issue        | `github.enabled`, `github.issueMode`   |
| `kata-executing-phases`    | 4-5   | Update Issue checklist, create PR| `github.enabled`, `pr_workflow`        |
| `kata-tracking-progress`   | 5     | Show GH issue/milestone/PR status| `github.enabled`, `pr_workflow`        |

**See:** [planning-config.md](planning-config.md) for config schema and reading patterns.

</summary>

</github_integration>
