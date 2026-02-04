# Architecture: Subagent Migration to Agent Skills Standard

**Project:** Kata
**Researched:** 2026-02-04
**Dimension:** Architecture (migration path)
**Confidence:** HIGH

## Executive Summary

Kata currently uses a custom subagent architecture with a separate `agents/` directory containing markdown agent definitions. Claude Code's plugin system supports agents via an `agents/` directory at plugin root. The migration path is simpler than anticipated: Kata's existing `agents/` directory structure already aligns with Claude Code's plugin agent format. The primary work involves updating frontmatter fields to match Claude Code's expected schema and renaming the `subagent_type` parameter to `agent` in Task() calls.

## Current Architecture

### Directory Structure

```
kata-orchestrator/
  agents/
    kata-planner.md          # Agent definition
    kata-executor.md
    kata-verifier.md
    kata-debugger.md
    kata-phase-researcher.md
    kata-project-researcher.md
    kata-roadmapper.md
    kata-plan-checker.md
    kata-codebase-mapper.md
    ... (19 total agents)
  skills/
    kata-plan-phase/
      SKILL.md               # Orchestrator
      references/
        ui-brand.md          # Support files
    kata-execute-phase/
      SKILL.md
      references/
        execute-plan.md
        checkpoints.md
        ...
```

### Current Agent Definition Format

```yaml
---
name: kata-planner
description: Creates executable phase plans...
tools: Read, Write, Bash, Glob, Grep, WebFetch, mcp__context7__*
color: green
---

<role>...</role>
<philosophy>...</philosophy>
...
```

### Current Task Invocation Pattern

Skills invoke agents via Task() with `subagent_type`:

```
Task(
  prompt=filled_prompt,
  subagent_type="kata-planner",  # In source
  model="{planner_model}",
  description="Plan Phase {phase}"
)
```

Build system transforms for plugin distribution:

```
subagent_type="kata-planner" -> subagent_type="kata:kata-planner"
```

## Target Architecture (Claude Code Plugin Standard)

### Plugin Agent Standard

From Claude Code documentation, plugin agents live in `agents/` directory:

```
plugin-root/
  .claude-plugin/
    plugin.json
  agents/
    security-reviewer.md
    performance-tester.md
  skills/
    ...
```

### Expected Agent Frontmatter

Claude Code expects these fields:

| Field             | Required | Description                                          |
| ----------------- | -------- | ---------------------------------------------------- |
| `name`            | No       | Display name (defaults to filename)                  |
| `description`     | Yes      | When Claude should delegate to this agent            |
| `tools`           | No       | Tools agent can use (inherits all if omitted)        |
| `disallowedTools` | No       | Tools to deny (removed from inherited list)          |
| `model`           | No       | Model: `sonnet`, `opus`, `haiku`, `inherit`          |
| `permissionMode`  | No       | `default`, `acceptEdits`, `dontAsk`, etc.            |
| `skills`          | No       | Skills to preload into agent context                 |
| `hooks`           | No       | Lifecycle hooks scoped to this agent                 |

### Task Invocation Pattern

Claude Code subagent documentation shows:

```
Task(prompt="...", agent="agent-name")
```

For plugins, agents are namespaced:

```
Task(prompt="...", agent="kata:kata-planner")
```

## Gap Analysis

### Frontmatter Field Mapping

| Kata Current | Claude Code Standard | Action              |
| ------------ | -------------------- | ------------------- |
| `name`       | `name`               | Keep                |
| `description`| `description`        | Keep                |
| `tools`      | `tools`              | Keep (format same)  |
| `color`      | (not standard)       | Move to `metadata`  |
| (missing)    | `model`              | Add where needed    |
| (missing)    | `permissionMode`     | Add where needed    |

### Invocation Parameter Mapping

| Kata Current                    | Claude Code Standard      | Action         |
| ------------------------------- | ------------------------- | -------------- |
| `subagent_type="kata-planner"`  | `agent="kata:kata-planner"` | Rename param |

### Content Compatibility

Agent body content (the markdown after frontmatter) is fully compatible. Claude Code agents accept any markdown content as the system prompt.

## Recommended Architecture

### Directory Structure (No Change Required)

```
kata-orchestrator/
  agents/                    # Already correct location
    kata-planner.md
    kata-executor.md
    ...
  skills/
    kata-plan-phase/
      SKILL.md
      references/
        ...
```

### Updated Agent Frontmatter

```yaml
---
name: kata-planner
description: Creates executable phase plans with task breakdown, dependency analysis, and goal-backward verification. Spawned by /kata:kata-plan-phase orchestrator.
tools: Read, Write, Bash, Glob, Grep, WebFetch, mcp__context7__*
model: inherit
metadata:
  color: green
  kata-version: "1.5.0"
---
```

Changes:
- Add `model: inherit` (or specific model where appropriate)
- Move `color` to `metadata` (non-standard field)
- Add `kata-version` to `metadata` for tracking

### Updated Task Invocation

In SKILL.md files:

```
Task(
  prompt=filled_prompt,
  agent="kata-planner",       # Changed from subagent_type
  model="{planner_model}",
  description="Plan Phase {phase}"
)
```

Build system transform:

```javascript
// Transform agent references: agent="kata-xxx" -> agent="kata:kata-xxx"
content = content.replace(/agent="kata-/g, 'agent="kata:kata-');
```

## Migration Steps

### Phase 1: Update Agent Frontmatter

1. Add `model: inherit` to all agents (or specific model where orchestrator specifies)
2. Move `color` field to `metadata.color`
3. Add `metadata.kata-version` for tracking
4. Validate frontmatter against Claude Code schema

Files to update:
- All 19 files in `agents/`

### Phase 2: Update Task Invocations

1. Replace `subagent_type=` with `agent=` in all SKILL.md files
2. Update build.js transform regex

Files to update:
- All SKILL.md files (scan for `subagent_type=`)
- `scripts/build.js` (update transform function)

### Phase 3: Update Build System

Update `transformPluginPaths()` in `scripts/build.js`:

```javascript
function transformPluginPaths(content) {
  // Transform agent references: agent="kata-xxx" -> agent="kata:kata-xxx"
  content = content.replace(/agent="kata-/g, 'agent="kata:kata-');

  // Keep legacy transform for backwards compatibility during transition
  content = content.replace(/subagent_type="kata-/g, 'subagent_type="kata:kata-');

  return content;
}
```

### Phase 4: Update Tests

1. Update artifact validation tests to check for `agent=` instead of `subagent_type=`
2. Add test for new frontmatter schema
3. Verify build output transforms correctly

### Phase 5: Documentation Updates

1. Update CLAUDE.md to document new invocation pattern
2. Update KATA-STYLE.md with agent definition conventions
3. Update any planning docs that reference the old pattern

## Backwards Compatibility

### During Transition

Keep both transform patterns in build.js to support:
- New `agent=` syntax (preferred)
- Legacy `subagent_type=` syntax (deprecated)

### After Full Migration

Once all files updated:
1. Remove legacy `subagent_type` transform
2. Add validation to fail build if `subagent_type` found
3. Update tests to reject old pattern

## Rollback Strategy

If issues discovered:

1. Revert frontmatter changes (git revert)
2. Revert Task invocation syntax changes (git revert)
3. Restore original build.js transforms
4. Plugin continues to work with original pattern

The existing architecture already works. Migration is additive, not destructive.

## Testing Strategy

### Unit Tests

1. Build system produces correct transforms
2. Agent frontmatter validates against schema
3. No orphaned `subagent_type` references in output

### Integration Tests

1. Plugin loads correctly in Claude Code
2. Skills can spawn agents via Task()
3. Agent tools and permissions work correctly
4. Model selection respects agent/orchestrator settings

### Manual Verification

1. Run `/kata:kata-plan-phase` and verify agent spawns
2. Check agent appears in `/agents` command
3. Verify agent description shown correctly
4. Test model override from orchestrator

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Parameter rename breaks spawning | LOW | HIGH | Test thoroughly before merge |
| Frontmatter validation fails | LOW | MEDIUM | Validate all agents before commit |
| Build transform misses cases | LOW | MEDIUM | Grep for all patterns before deploy |
| Claude Code API changes | LOW | MEDIUM | Pin to known working version |

## Where Agent Instructions Live

**Current:** `agents/kata-*.md` at repository root

**Recommended:** Keep in `agents/` directory

**Rationale:**
- Claude Code plugin standard expects `agents/` at plugin root
- Build system already copies `agents/` to `dist/plugin/agents/`
- No restructuring needed

**Alternative considered:** Move to `skills/*/agents/` subdirectory
- Rejected: Claude Code doesn't support skill-scoped agents
- Rejected: Would require custom loading logic

## How Task Tool Invocation Changes

**Before:**
```
Task(prompt="...", subagent_type="kata-planner", model="opus")
```

**After:**
```
Task(prompt="...", agent="kata-planner", model="opus")
```

**Plugin distribution (after build):**
```
Task(prompt="...", agent="kata:kata-planner", model="opus")
```

## Maintaining Existing Behavior During Transition

1. **Dual transforms in build.js** - Support both `subagent_type` and `agent` during migration
2. **Incremental updates** - Update files one at a time, test between changes
3. **Feature flag** - Could add config to toggle new vs old syntax (probably overkill)
4. **Branch strategy** - Do migration on feature branch, test before merge

## Sources

- Claude Code subagent documentation (embedded in system rules)
- Claude Code plugin reference (embedded in system rules)
- Agent Skills specification: https://agentskills.io/specification.md
- Kata source code analysis: `agents/`, `skills/`, `scripts/build.js`

## Confidence Assessment

| Area | Level | Reason |
| ---- | ----- | ------ |
| Directory structure | HIGH | Already matches Claude Code standard |
| Frontmatter mapping | HIGH | Clear documentation, simple changes |
| Task invocation | HIGH | Parameter rename, well-documented |
| Build transforms | HIGH | Existing pattern, minor modification |
| Backwards compat | HIGH | Additive changes, easy rollback |

## Summary

The migration is straightforward:

1. **No structural changes needed** - `agents/` directory already correct
2. **Frontmatter updates** - Add `model`, move `color` to `metadata`
3. **Parameter rename** - `subagent_type` to `agent`
4. **Build transform update** - Simple regex modification

Estimated effort: 2-3 hours for code changes, 1 hour for testing.

The architecture is already 90% compliant with Claude Code's plugin agent standard. This is a polish pass, not a rewrite.

## Quality Gate Checklist

- [x] Migration path is clear and incremental
- [x] Existing behavior preserved (dual transform support)
- [x] Rollback strategy defined (git revert)
