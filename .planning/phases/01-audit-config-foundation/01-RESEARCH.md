# Phase 1: Audit & Config Foundation - Research

**Researched:** 2026-01-25
**Domain:** Kata config schema extension, GitHub integration hooks
**Confidence:** HIGH

## Summary

This phase establishes the foundation for GitHub integration by extending the existing config schema and documenting where GitHub-aware logic will hook into existing Kata workflows. The research reveals that Kata already has a well-established pattern for config-driven behavior (see `pr_workflow`, `commit_docs`, `workflow.*` settings) that this phase will follow.

The config schema in `.planning/config.json` is read via bash grep patterns throughout skills, with a standard pattern documented in `planning-config.md`. The phase needs to add a new `github` namespace to the config with `enabled` and `issueMode` keys, following the existing nested config pattern (like `workflow.*` and `display.*`).

**Primary recommendation:** Extend config.json with `github.enabled` and `github.issueMode`, document integration points as a reference file, and add config reading to the skills that will be modified in later phases.

## Standard Stack

This phase is internal to Kata - no external libraries needed.

### Core
| Component     | Version | Purpose        | Why Standard                             |
| ------------- | ------- | -------------- | ---------------------------------------- |
| Bash grep/sed | N/A     | Config reading | Established pattern in all Kata skills   |
| JSON          | N/A     | Config format  | Already used for `.planning/config.json` |

### Supporting
| Component | Purpose           | When to Use                             |
| --------- | ----------------- | --------------------------------------- |
| `gh` CLI  | GitHub API access | Future phases (milestones, issues, PRs) |

### Alternatives Considered
| Instead of  | Could Use | Tradeoff                                                            |
| ----------- | --------- | ------------------------------------------------------------------- |
| Bash grep   | jq        | jq cleaner but adds dependency; grep is already established pattern |
| JSON config | YAML      | JSON matches existing config.json format                            |

## Architecture Patterns

### Config Schema Extension Pattern

**Current config.json structure:**
```json
{
  "mode": "yolo|interactive",
  "depth": "quick|standard|comprehensive",
  "parallelization": true|false,
  "model_profile": "quality|balanced|budget",
  "commit_docs": true|false,
  "pr_workflow": true|false,
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

**Proposed extension (following existing pattern):**
```json
{
  // ... existing keys ...
  "github": {
    "enabled": true|false,
    "issueMode": "auto|ask|never"
  }
}
```

**Rationale:** The `github` namespace mirrors existing nested configs (`display.*`, `workflow.*`). This keeps GitHub-specific settings grouped and allows future expansion (e.g., `github.labels`, `github.projectBoard`).

### Config Reading Pattern

**Standard bash pattern (from planning-config.md):**
```bash
# Read a boolean value with default
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")

# Read a string value with default
GITHUB_ISSUE_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"issueMode"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "never")
```

**Note:** The grep pattern for nested values (like `github.enabled`) will match `"enabled"` anywhere in the file. This works because:
1. The pattern `"enabled"[[:space:]]*:[[:space:]]*[^,}]*` is specific enough
2. Kata config files are small and well-structured
3. Key names like `enabled` under `github` won't conflict with other keys

### Integration Points Documentation Pattern

Create a reference file documenting where GitHub integration hooks:

```
skills/kata-executing-phases/references/github-integration.md
```

**Structure:**
```markdown
<github_integration>

## Integration Points

### /kata:adding-milestones (Phase 2)
**When:** After roadmap created, user approves
**What:** Create GitHub Milestone if `github.enabled`
**Config check:** `github.enabled`, `github.issueMode`

### /kata:planning-phases (Phase 3)
**When:** After plans created
**What:** Create/update phase issue with plan checklist if `github.enabled`
**Config check:** `github.enabled`, `github.issueMode`

### /kata:executing-phases (Phases 4-5)
**When:** After each plan completes
**What:** Update phase issue checklist, create PR at phase completion
**Config check:** `github.enabled`, `pr_workflow`

</github_integration>
```

### Recommended Project Structure

```
skills/kata-executing-phases/
├── SKILL.md
└── references/
    ├── planning-config.md      # Existing - config documentation
    ├── phase-execute.md        # Existing - execution workflow
    ├── execute-plan.md         # Existing - plan execution
    └── github-integration.md   # NEW - GitHub integration points
```

## Don't Hand-Roll

| Problem           | Don't Build       | Use Instead        | Why                                             |
| ----------------- | ----------------- | ------------------ | ----------------------------------------------- |
| JSON parsing      | Custom parser     | Bash grep patterns | Established in 50+ locations across skills      |
| GitHub API        | Custom HTTP calls | `gh` CLI           | Already used in milestone-complete, PR workflow |
| Config validation | Schema validator  | Grep with defaults | Kata pattern - missing keys get defaults        |

**Key insight:** Kata deliberately uses simple bash tools over complex dependencies. The grep-based config reading is battle-tested across the codebase and works reliably.

## Common Pitfalls

### Pitfall 1: Breaking Existing Config Files
**What goes wrong:** Adding required config keys breaks existing projects
**Why it happens:** New keys without defaults cause grep to return empty strings
**How to avoid:** Always provide defaults in config reading patterns (`|| echo "false"`)
**Warning signs:** Skills fail silently when config key is missing

### Pitfall 2: Grep Pattern Collision
**What goes wrong:** Grep matches wrong key in nested JSON
**Why it happens:** Key names not unique enough (e.g., `enabled` appears twice)
**How to avoid:** Use sufficiently unique key names; test with real config files
**Warning signs:** Config reads return unexpected values

### Pitfall 3: Inconsistent Config Reading Locations
**What goes wrong:** Same config read differently in different skills
**Why it happens:** Copy-paste with modifications
**How to avoid:** Document canonical patterns in planning-config.md; reference that file
**Warning signs:** Same config key produces different behavior in different commands

### Pitfall 4: GitHub Integration Without pr_workflow
**What goes wrong:** User enables GitHub integration but not PR workflow
**Why it happens:** Config keys are independent but features overlap
**How to avoid:** Document relationship between `github.enabled` and `pr_workflow`; warn if incompatible combo
**Warning signs:** Phase execution creates issues but not PRs, or vice versa

## Code Examples

### Reading GitHub Config (verified pattern from existing code)
```bash
# Source: skills/kata-executing-phases/references/planning-config.md

# Read github.enabled with default false
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")

# Read github.issueMode with default never
GITHUB_ISSUE_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"issueMode"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "never")

# Conditional execution
if [ "$GITHUB_ENABLED" = "true" ]; then
  # GitHub integration code here
fi
```

### Extending Config in kata-starting-projects
```bash
# After existing workflow preferences, add GitHub section
# Source: skills/kata-starting-projects/SKILL.md Phase 5 pattern

# Add to AskUserQuestion options
{
  header: "GitHub Integration",
  question: "Enable GitHub integration? (milestones, issues, PRs)",
  multiSelect: false,
  options: [
    { label: "Yes", description: "Create GitHub Milestones/Issues/PRs automatically" },
    { label: "No", description: "Local workflow only" }
  ]
}
```

### Config File Template Update
```json
{
  "mode": "yolo",
  "depth": "standard",
  "parallelization": true,
  "commit_docs": true,
  "pr_workflow": true,
  "model_profile": "balanced",
  "display": {
    "statusline": true
  },
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true
  },
  "github": {
    "enabled": false,
    "issueMode": "auto"
  }
}
```

## State of the Art

| Old Approach      | Current Approach          | When Changed | Impact                           |
| ----------------- | ------------------------- | ------------ | -------------------------------- |
| N/A (new feature) | Config-driven integration | v1.1.0       | Allows opt-in GitHub integration |

**Deprecated/outdated:**
- None (this is new feature development)

## Integration Points Summary

Based on codebase analysis, these skills need modification for GitHub integration:

### Phase 1 (This Phase) - Config & Documentation Only

| Skill                       | Current State       | Phase 1 Change                                     |
| --------------------------- | ------------------- | -------------------------------------------------- |
| `kata-starting-projects`    | Creates config.json | Document: will add GitHub options in Phase 2       |
| `kata-starting-milestones`  | Creates milestone   | Document: will create GH Milestone in Phase 2      |
| `kata-configuring-settings` | Edits config.json   | Document: will add GitHub settings in Phase 2      |
| `kata-planning-phases`      | Creates plans       | Document: will create/update issue in Phase 3-4    |
| `kata-executing-phases`     | Executes plans      | Document: will update issue/create PR in Phase 4-5 |
| `kata-tracking-progress`    | Shows status        | Document: will show GH issue/PR status in Phase 5  |

### Files to Create/Modify in This Phase

1. **Create:** `skills/kata-executing-phases/references/github-integration.md`
   - Documents all integration points
   - Describes config keys and their effects
   - Provides code patterns for later phases

2. **Modify:** `skills/kata-executing-phases/references/planning-config.md`
   - Add `github.enabled` and `github.issueMode` to schema
   - Add reading patterns
   - Document relationship with `pr_workflow`

3. **Modify:** `.planning/config.json` (this project's config)
   - Add `github` namespace with defaults
   - Validate existing skills continue to work

## Open Questions

1. **issueMode values clarification**
   - What we know: `auto | ask | never` from requirements
   - What's unclear: Exact behavior of "ask" - per milestone? per phase?
   - Recommendation: Define "ask" as prompting once during milestone creation, applying to all phases in that milestone

2. **pr_workflow interaction**
   - What we know: `pr_workflow` already handles branch/PR creation
   - What's unclear: Should `github.enabled` imply `pr_workflow: true`?
   - Recommendation: Keep independent - `github.enabled` controls issues/milestones, `pr_workflow` controls branching. Document that both should typically be true together.

3. **Existing projects upgrade path**
   - What we know: Config reading uses defaults, so missing keys work
   - What's unclear: Should `/kata:configure-settings` prompt for new keys?
   - Recommendation: Yes - follow existing pattern where settings detects missing keys and prompts (see kata-configuring-settings.md lines 52-59)

## Sources

### Primary (HIGH confidence)
- `/Users/gannonhall/dev/oss/kata/skills/kata-executing-phases/references/planning-config.md` - Canonical config documentation
- `/Users/gannonhall/dev/oss/kata/skills/kata-starting-projects/SKILL.md` - Config creation pattern
- `/Users/gannonhall/dev/oss/kata/skills/kata-configuring-settings/SKILL.md` - Config update pattern
- `/Users/gannonhall/dev/oss/kata/.planning/config.json` - Current config structure

### Secondary (MEDIUM confidence)
- Grep search across skills for `config.json` usage patterns (50+ locations verified)
- `/Users/gannonhall/dev/oss/kata/.planning/ROADMAP.md` - Phase requirements and success criteria

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no external dependencies, all patterns already exist
- Architecture: HIGH - extending existing patterns with documented approach
- Pitfalls: HIGH - based on actual code analysis of existing config usage

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (stable - internal architecture documentation)
