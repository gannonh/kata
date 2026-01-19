# Phase 1: Audit & Config Foundation - Research

**Researched:** 2026-01-19
**Domain:** Kata GitHub Integration - Configuration & Integration Points
**Confidence:** HIGH

## Summary

This research identifies where GitHub integration hooks into existing Kata workflows and defines the config schema for enabling/disabling GitHub features. The investigation examined all 8 skills, 24 commands, and 12 workflows to map integration points.

**Key finding:** Kata already has a config system at `.planning/config.json` with established patterns for mode, depth, and parallelization. GitHub settings should extend this existing schema rather than creating parallel config mechanisms.

**Integration points are concentrated in 3 skills:** kata-milestone-management (milestone creation), kata-execution (phase completion/PR creation), and kata-project-initialization (onboarding config). The commands/workflows delegate to these skills, so modifications focus on skill-level changes.

**Primary recommendation:** Extend existing `.planning/config.json` with a `github` object containing `enabled` (boolean) and `issueMode` (`auto` | `ask` | `never`). Add conditional GitHub logic to skills at natural workflow boundaries (after milestone creation, after phase completion).

## Standard Stack

The established tools/patterns for this domain:

### Core
| Component | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| config.json | `.planning/config.json` | Project configuration | Already exists, establishes pattern |
| Skills | `skills/kata-*/SKILL.md` | Orchestrators with workflow logic | Phase 0 established skills as orchestrators |
| Workflows | `kata/workflows/*.md` | Detailed process logic | Skills reference these for execution details |

### Supporting
| Component | Location | Purpose | When to Use |
|-----------|----------|---------|-------------|
| Templates | `kata/templates/config.json` | Default config structure | New project initialization |
| References | `skills/kata-*/references/` | Progressive disclosure | Deep implementation details |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending config.json | New github-config.json | Fragmented config, more files to manage |
| Skill-level integration | Command-level integration | Would duplicate logic across commands |
| Conditional logic | Separate GitHub skill | Overhead of new skill for simple branching |

## Architecture Patterns

### Current Config Structure

Existing `.planning/config.json` template:

```json
{
  "mode": "interactive",
  "depth": "standard",
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_plans_for_parallel": 2
  },
  "gates": {
    "confirm_project": true,
    "confirm_phases": true,
    "confirm_roadmap": true,
    "confirm_breakdown": true,
    "confirm_plan": true,
    "execute_next_plan": true,
    "issues_review": true,
    "confirm_transition": true
  },
  "safety": {
    "always_confirm_destructive": true,
    "always_confirm_external_services": true
  }
}
```

### Proposed GitHub Extension

```json
{
  "mode": "yolo",
  "depth": "standard",
  "parallelization": true,
  "github": {
    "enabled": false,
    "issueMode": "ask"
  }
}
```

**Design decisions:**
- `github.enabled`: Boolean toggle for all GitHub features
- `github.issueMode`: Controls issue creation behavior
  - `auto`: Create issues automatically
  - `ask`: Prompt user before creating issues
  - `never`: Never create issues (milestones and PRs only)

### Config Read Pattern

Skills already read config via:

```bash
cat .planning/config.json 2>/dev/null
```

Pattern for GitHub checks:

```bash
# Check if GitHub integration enabled
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*true' | head -1)
if [ -n "$GITHUB_ENABLED" ]; then
  # GitHub integration logic
fi
```

Or in skill workflow logic:

```markdown
**If github.enabled = true:**
- Create GitHub Milestone after local milestone creation
- Present success/failure
- Store GitHub milestone URL in STATE.md

**If github.enabled = false:**
- Skip GitHub operations
- Continue with local-only workflow
```

## Integration Point Inventory

### Files Requiring Modification

| File | Integration Type | Hook Location | What Happens |
|------|------------------|---------------|--------------|
| `skills/kata-milestone-management/SKILL.md` | READ config | After NEW MILESTONE step 9 (roadmap creation) | If enabled, create GitHub Milestone |
| `skills/kata-milestone-management/references/milestone-creation.md` | READ config | After step 10 (completion) | If enabled, create GitHub Milestone |
| `skills/kata-execution/SKILL.md` | READ config | Step 10 (present results) | If enabled AND milestone complete, create PR |
| `skills/kata-project-initialization/SKILL.md` | WRITE config | Step 5 (workflow preferences) | Ask about GitHub integration, write to config |
| `kata/templates/config.json` | Schema | Default structure | Add github object with defaults |
| `commands/kata/new-project.md` | WRITE config | Phase 5 (workflow preferences) | Add GitHub preferences question |
| `commands/kata/new-milestone.md` | READ config | Phase 9 (done) | If enabled, create GitHub Milestone |

### Integration Hook Details

**1. kata-project-initialization (CONFIG WRITE)**

Location: Step 5 "Configure Workflow Preferences"

Current flow asks about:
- Mode (yolo/interactive)
- Depth (quick/standard/comprehensive)
- Execution (parallel/sequential)

**Add:**
```markdown
**GitHub Integration:**
- "Enable GitHub integration (Recommended)" - Sync milestones, issues, PRs to GitHub
- "Disable GitHub integration" - Local planning only

**If enabled, Issue Creation Mode:**
- "Auto" - Create issues automatically when milestones/phases defined
- "Ask" - Prompt before creating each issue
- "Never" - Milestones and PRs only, no issues
```

**2. kata-milestone-management (MILESTONE CREATION)**

Location: NEW MILESTONE Workflow, Step 10 "Present completion"

Current flow ends with:
```
KATA > MILESTONE INITIALIZED
...
Next: /kata:plan-phase [N]
```

**Add conditional hook:**
```markdown
**If github.enabled = true:**
1. Read github.enabled from config
2. If true, create GitHub Milestone:
   - Title: "v[X.Y] [Name]"
   - Description: From ROADMAP.md milestone section
   - Due date: Optional
3. Store GitHub milestone number in STATE.md
4. Present: "GitHub Milestone created: #N"
```

**3. kata-execution (PR CREATION at phase completion)**

Location: Step 10 "Present Results"

Current flow checks if milestone complete:
```
**If milestone complete:**
KATA > MILESTONE COMPLETE
...
/kata:complete-milestone
```

**Add conditional hook:**
```markdown
**If github.enabled = true AND milestone complete:**
1. Create PR with:
   - Title: "Phase N: [Phase Name]"
   - Body: Summary from phase SUMMARY.md
   - Closes #X (phase issue number from STATE.md, if exists)
2. Present PR URL
```

### Files NOT Needing Modification

| File | Reason |
|------|--------|
| `kata/workflows/execute-plan.md` | Plan-level execution, no GitHub hooks needed |
| `kata/workflows/verify-phase.md` | Verification only, no GitHub sync |
| `skills/kata-planning/SKILL.md` | Planning only, issues created at milestone level |
| `skills/kata-verification/SKILL.md` | Verification only, no external services |
| `skills/kata-research/SKILL.md` | Research only, no GitHub integration |
| `skills/kata-utility/SKILL.md` | Utilities, no workflow changes needed |
| `skills/kata-roadmap-management/SKILL.md` | Roadmap management, issues at milestone level |

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config parsing | Custom JSON parser | `cat` + `grep` pattern | Already used throughout codebase |
| Config schema validation | JSON schema validator | Convention + documentation | Kata uses convention over enforcement |
| GitHub API calls | Custom HTTP client | `gh` CLI | Claude Code has gh available, simpler |
| Config defaults | Inline defaults everywhere | Template file defaults | Single source of truth in templates |

**Key insight:** Kata intentionally uses simple bash commands and CLI tools rather than complex libraries. GitHub integration should use `gh` CLI for all GitHub operations, not build custom API clients.

## Common Pitfalls

### Pitfall 1: Config Schema Inflation
**What goes wrong:** Adding too many GitHub config options, creating complexity
**Why it happens:** Trying to anticipate all use cases upfront
**How to avoid:** Start with minimal schema (enabled, issueMode), extend later as needed
**Warning signs:** More than 5 config keys for GitHub

### Pitfall 2: Duplicating Logic Across Commands and Skills
**What goes wrong:** Same GitHub check written in command AND skill AND workflow
**Why it happens:** Not recognizing that skills ARE the orchestrators now
**How to avoid:** Put all GitHub logic in skills only, commands delegate to skills
**Warning signs:** `gh` commands appearing in multiple files

### Pitfall 3: Blocking on GitHub Failures
**What goes wrong:** Local workflow fails when GitHub API is unavailable
**Why it happens:** Making GitHub success required for local operations
**How to avoid:** GitHub operations should be additive, never blocking
**Warning signs:** Local milestone creation failing due to GitHub errors

### Pitfall 4: Config Read Without Fallback
**What goes wrong:** Code assumes config.json exists and has github section
**Why it happens:** Not handling migration from pre-GitHub config files
**How to avoid:** Always use `2>/dev/null` and default to disabled
**Warning signs:** Errors in projects initialized before GitHub integration

## Code Examples

### Config Read Pattern (Verified from codebase)

```bash
# From kata/workflows/execute-plan.md line 82
cat .planning/config.json 2>/dev/null
```

### Config Conditional Pattern (Derived from execute-plan.md)

```markdown
<config-check>
```bash
cat .planning/config.json 2>/dev/null
```
</config-check>

<if github.enabled="true">
GitHub integration logic here
</if>

<if github.enabled="false">
Skip GitHub operations
</if>
```

### Skill Routing Pattern (From kata-milestone-management/SKILL.md)

```markdown
### Step N: GitHub Integration (Conditional)

**Read config:**
```bash
cat .planning/config.json 2>/dev/null
```

**If github.enabled = true:**

1. Create GitHub Milestone via gh CLI:
   ```bash
   gh milestone create "$MILESTONE_TITLE" --description "$DESCRIPTION"
   ```

2. Store milestone number in STATE.md

3. Report success:
   ```
   GitHub Milestone created: #[NUMBER]
   ```

**If github.enabled = false:**
Skip to next step.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Commands do everything | Skills are orchestrators | Phase 0 (2026-01-19) | GitHub logic goes in skills, not commands |
| Simple config (mode/depth/parallel) | Extended config with feature flags | This phase | Enables modular integrations |

**Current state:**
- Config system exists and is established
- Skills architecture just completed in Phase 0
- No GitHub integration exists yet
- `gh` CLI available in Claude Code environment

## Open Questions

Things that couldn't be fully resolved:

1. **GitHub Milestone due dates**
   - What we know: `gh milestone create` supports `--due-on` flag
   - What's unclear: Should Kata prompt for due dates? Derive from some source?
   - Recommendation: Defer to Phase 2 (Onboarding & Milestones), make it optional

2. **Issue number storage format**
   - What we know: Need to store GitHub issue/milestone numbers for later reference
   - What's unclear: Where exactly in STATE.md? Separate section? Inline?
   - Recommendation: Add `## GitHub State` section to STATE.md template

3. **Migration path for existing projects**
   - What we know: Existing projects have config.json without github section
   - What's unclear: Should we prompt to enable on next command run?
   - Recommendation: Default to disabled, users enable via `/kata:new-milestone` or manual config edit

## Sources

### Primary (HIGH confidence)
- `/Users/gannonhall/dev/oss/kata/kata/templates/config.json` - Current config schema
- `/Users/gannonhall/dev/oss/kata/.planning/config.json` - Real-world config example
- `/Users/gannonhall/dev/oss/kata/skills/kata-milestone-management/SKILL.md` - Milestone workflow
- `/Users/gannonhall/dev/oss/kata/skills/kata-execution/SKILL.md` - Execution workflow
- `/Users/gannonhall/dev/oss/kata/skills/kata-project-initialization/SKILL.md` - Onboarding workflow
- `/Users/gannonhall/dev/oss/kata/commands/kata/new-project.md` - Config write location
- `/Users/gannonhall/dev/oss/kata/commands/kata/new-milestone.md` - Milestone command

### Secondary (MEDIUM confidence)
- Grep results for "config.json" across codebase - 40+ references verified
- Analysis of execute-plan.md and execute-phase.md for config read patterns

### Tertiary (LOW confidence)
- None - all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Integration Points: HIGH - Direct file examination, grep verification
- Config Schema: HIGH - Template file exists, pattern established
- Implementation Notes: HIGH - Consistent patterns found in codebase

**Research date:** 2026-01-19
**Valid until:** 60 days (stable codebase patterns, no external dependencies)
