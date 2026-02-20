# Plan: Fix Agent Reference Path Resolution

## Problem

During phase execution, the `kata-executor` agent fails to find `summary-template.md`:

```
Read(/Users/gannonhall/dev/oss/kata-burner/test-uat/.planning/references/summary-template.md)
Error: File does not exist.
```

**Root cause:** Claude Code's `@./references/` resolution in agents doesn't work like it does for skills. Skills are directories, so `@./references/` resolves relative to the skill folder. Agents are flat `.md` files, and `@./` appears to resolve relative to some context (possibly the surrounding content mentioning `.planning/`).

## Analysis

**Current broken references in agents:**
| File | Line | Broken Path |
|------|------|-------------|
| `agents/kata-executor.md` | 356 | `@./references/checkpoints.md` (1078 lines) |
| `agents/kata-executor.md` | 613 | `@./references/summary-template.md` (269 lines) |
| `agents/kata-planner.md` | 410 | `@./references/execute-plan.md` (1874 lines) |
| `agents/kata-planner.md` | 411 | `@./references/summary-template.md` (269 lines) |

**Key constraint:** Claude Code's `@` reference system is a STATIC file path parser that does NOT support variable substitution like `${CLAUDE_PLUGIN_ROOT}`.

## Options Considered

| Option | Description | Verdict |
|--------|-------------|---------|
| A. Skill-based loading | Skill loads refs, spawns general-purpose agent | Loses custom agent config |
| B. Inline at build | Build replaces @refs with content | Build complexity, duplication |
| C. Canonical paths | Use @~/.claude/skills/... with transforms | Complex, plugin transforms tricky |
| D. Install agents/refs/ | Copy agents/references/ to install location | **Tested: Plugin already has refs, still fails** |
| **E. Orchestrator passes content** | **Skill passes content via Task prompt** | **✓ Clean, works, no transforms** |

**Key finding:** Plugin build already includes `dist/plugin/agents/references/` with all files, but `@./references/` in agents still resolves to `.planning/references/`. Claude Code's `@./` resolution for agents doesn't work like it does for skills - it appears to resolve based on surrounding context rather than the agent file location.

## Recommended Solution: Orchestrator passes resources to subagent

**Key insight:** The orchestrator (skill) already has working access to `@./references/`. Instead of the subagent trying to load references itself, the skill should pass the content via the Task prompt.

### Architecture

**Current (broken):**
```
Skill → spawns → kata-executor (tries to @./references/... → fails)
```

**Fixed:**
```
Skill (loads @./references/...) → spawns → kata-executor (receives content in prompt)
```

### Changes Required

1. **Remove @-references from agent system prompts**
   - `agents/kata-executor.md`: Remove `@./references/checkpoints.md` and `@./references/summary-template.md`
   - `agents/kata-planner.md`: Remove `@./references/execute-plan.md` and `@./references/summary-template.md`
   - Agent system prompts describe behavior only, no external file loading

2. **Update skill to pass resources in Task prompt**
   - `skills/kata-executing-phases/SKILL.md`: When spawning kata-executor, include necessary reference content in the prompt
   - The skill already loads `@./references/...` successfully

3. **Delete duplicate agents/references/ directory**
   - No longer needed since agents don't load references directly
   - Skills have canonical copies in `skills/kata-executing-phases/references/`

### Benefits

- Custom subagents preserved (tools, color, name in UI)
- No path resolution complexity
- No build system changes needed
- Clean separation: orchestrator gathers resources, executor executes
- Works identically for NPX and plugin

### Files to Modify

1. `agents/kata-executor.md` - Remove 2 @-references, describe expected input instead
2. `agents/kata-planner.md` - Remove 2 @-references, describe expected input instead
3. `skills/kata-executing-phases/SKILL.md` - Pass reference content in Task prompts
4. `skills/kata-planning-phases/SKILL.md` - Pass reference content in Task prompts (if applicable)
5. Delete `agents/references/` directory (no longer needed)
6. `bin/install.js` - Update to copy `agents/references/` for NPX parity (optional cleanup, not required for fix)

### Verification

1. Run a phase execution via plugin and confirm summary template content is available to executor
2. Run a phase execution via NPX install and confirm same
3. Verify agent can create SUMMARY.md using the template
4. Verify checkpoints content is available when needed
