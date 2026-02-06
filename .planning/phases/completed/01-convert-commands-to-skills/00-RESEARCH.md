# Phase 0: Convert Commands to Skills - Research

**Researched:** 2026-01-19 (revised)
**Domain:** Claude Code Skills format, command-to-skill conversion
**Confidence:** HIGH

## Summary

**REVISED STRATEGY** (2026-01-19): Skills are now the standard across IDEs (Claude Code, Antigravity, etc.) and can be invoked via `/skill-name` syntax. This changes our approach significantly.

### Key Strategic Decisions

1. **Skills only** — Create skills containing full workflow logic. Don't update existing commands.
2. **Leave commands for A/B testing** — Keep existing commands unchanged to compare old vs new approach.
3. **No agent-skill binding** — Skills ARE orchestrators that spawn multiple sub-agents via Task tool. Don't bind skills TO agents.
4. **Natural language invocation** — Skills handle variables from context (e.g., "plan phase 2" extracts phase number).
5. **Use `/building-claude-code-skills`** — Follow the official skill-building methodology.

### Architecture

```
Skill (orchestrator)
  └── contains workflow logic
  └── spawns sub-agents via Task tool
      ├── kata-planner
      ├── kata-plan-checker
      └── etc.
```

Skills replace the orchestration role of commands. Agents remain as specialized workers that skills spawn.

**Primary recommendation:** Create 8 skills in `skills/` directory, each containing full workflow logic with progressive disclosure via references/ subdirectories. Leave commands and agents unchanged.

## Standard Stack

The established patterns for Claude Code Skills and command-skill integration:

### Core Format

| Component           | Standard                                                                 | Source         |
| ------------------- | ------------------------------------------------------------------------ | -------------- |
| SKILL.md            | Required file with YAML frontmatter (name, description) + markdown body  | Official docs  |
| Directory structure | `skill-name/SKILL.md` with optional `references/`, `scripts/`, `assets/` | Official docs  |
| Description format  | "This skill should be used when..." (third-person, trigger-focused)      | Best practices |
| Name format         | Gerund form, lowercase, hyphens (e.g., `planning-phases`)                | Best practices |
| Body length         | <500 lines in SKILL.md, details in references/                           | Best practices |

### Frontmatter Fields

Skills support these frontmatter fields (verified from official documentation):

| Field            | Required | Description                                            |
| ---------------- | -------- | ------------------------------------------------------ |
| `name`           | Yes      | Skill identifier (lowercase, hyphens, max 64 chars)    |
| `description`    | Yes      | When to invoke (max 1024 chars)                        |
| `user-invocable` | No       | Controls slash command menu visibility (default: true) |

**Note:** We are NOT using `agent`, `model`, `context`, `allowed-tools`, or `skills` frontmatter fields because Kata skills are orchestrators that spawn multiple sub-agents. These fields are for simpler skills that delegate to a single agent.

### Skill Structure Example

```yaml
# skills/kata-planning-phases/SKILL.md
---
name: kata-planning-phases
description: Use this skill when planning phases, creating execution plans, breaking down work into tasks, or preparing for phase execution. This includes task breakdown, dependency analysis, wave assignment, and goal-backward verification.
---

# Phase Planning

[Workflow that spawns kata-planner, kata-plan-checker via Task tool]
```

## Architecture Patterns

### Recommended Project Structure

**Note:** Skills use flat directory naming (no nested namespacing). The namespace goes in the folder name itself.

```
kata/
├── commands/kata/                    # UNCHANGED - keep for A/B testing
│   ├── phase-plan.md
│   ├── phase-execute.md
│   └── ...
├── skills/
│   ├── kata-planning-phases/                # Flat naming: kata-{domain}
│   │   ├── SKILL.md                  # Full workflow (orchestrator)
│   │   └── references/
│   │       ├── task-breakdown.md
│   │       ├── dependency-graph.md
│   │       └── goal-backward.md
│   ├── kata-execution/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── deviation-rules.md
│   │       └── checkpoint-protocol.md
│   └── ...
├── agents/                           # UNCHANGED - workers spawned by skills
│   ├── kata-executor.md
│   ├── kata-planner.md
│   └── ...
└── workflows/                        # May be absorbed into skills
```

### Pattern 1: Skill as Orchestrator

**What:** Skills contain full workflow logic and spawn sub-agents via Task tool
**When to use:** All Kata workflows

**Skill (full orchestrator):**
```markdown
---
name: kata-planning-phases
description: Use this skill when planning phases, creating execution plans, breaking down work into tasks, or preparing for phase execution. This includes task breakdown, dependency analysis, wave assignment, and goal-backward verification.
---

# Phase Planning

## Workflow

1. Validate phase exists in ROADMAP.md
2. Check for existing research
3. **Spawn researcher if needed:**
   ```
   Task(subagent_type="kata-phase-researcher", prompt="...")
   ```
4. **Spawn planner:**
   ```
   Task(subagent_type="kata-planner", prompt="...")
   ```
5. **Spawn checker for verification:**
   ```
   Task(subagent_type="kata-plan-checker", prompt="...")
   ```
6. Iterate until plans pass or max iterations

## References
- See `./task-breakdown.md` for task sizing
- See `./dependency-graph.md` for wave assignment
```

**Key insight:** The skill IS the orchestrator. It spawns agents, not the other way around.

### Pattern 2: Natural Language Variables

**What:** Extract workflow variables from user's natural language request
**When to use:** Instead of $ARGUMENTS (which skills don't support)

**Example:**
- User says: "plan phase 2 with research"
- Skill extracts: phase=2, research=true
- User says: "execute the next phase"
- Skill queries ROADMAP.md to find next unexecuted phase

### Pattern 3: Progressive Disclosure

**What:** Keep SKILL.md lean, move details to references/
**When to use:** When current command/agent files exceed 500 lines

```
skills/kata-execution/
├── SKILL.md (~200 lines - core workflow)
└── references/
    ├── deviation-rules.md (detailed rule explanations)
    ├── checkpoint-protocol.md (checkpoint handling)
    ├── tdd-execution.md (TDD workflow details)
    └── commit-protocol.md (commit conventions)
```

### Anti-Patterns to Avoid

- **Duplicating content:** Don't copy workflow logic into both command and skill
- **Ignoring $ARGUMENTS:** Skills don't support $ARGUMENTS, so keep commands as the entry point
- **Monolithic skills:** Split skills over 500 lines into SKILL.md + references/
- **Vague descriptions:** Use specific trigger phrases, not generic "helps with planning"
- **Horizontal organization:** Don't create skills by layer (all research in one skill); use vertical slices per workflow

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                  | Don't Build             | Use Instead                      | Why                                    |
| ------------------------ | ----------------------- | -------------------------------- | -------------------------------------- |
| Model invocation control | Custom routing logic    | `disable-model-invocation: true` | Built-in frontmatter field             |
| Tool restrictions        | Runtime checks          | `allowed-tools` frontmatter      | Built-in field for commands and skills |
| Context isolation        | Manual state management | `context: fork`                  | Built-in sub-agent forking             |
| Agent type selection     | Custom agent dispatch   | `agent` frontmatter field        | Built-in agent selection               |
| Skill visibility         | Custom menu logic       | `user-invocable: false`          | Built-in visibility control            |

**Key insight:** Claude Code's frontmatter fields handle most orchestration needs. Kata should leverage these rather than building custom routing.

## Common Pitfalls

### Pitfall 1: Description Mismatch

**What goes wrong:** Skills never trigger because description doesn't match user queries
**Why it happens:** Copying command descriptions verbatim (task-focused instead of trigger-focused)
**How to avoid:**
- Start with "This skill should be used when..."
- Include 5+ specific trigger phrases
- List concrete use cases
- Use third-person voice
**Warning signs:** Skill never auto-invokes, users must always use /command

### Pitfall 2: $ARGUMENTS Loss

**What goes wrong:** Converting commands to skills loses argument handling
**Why it happens:** Skills don't support $ARGUMENTS or positional parameters
**How to avoid:** Keep commands as entry points, have them reference skills
**Warning signs:** Commands that took arguments now require conversation to get same info

### Pitfall 3: Context Bloat

**What goes wrong:** Skills load too much content into context
**Why it happens:** Putting all workflow details in SKILL.md
**How to avoid:**
- Keep SKILL.md under 500 lines
- Move detailed references to references/ directory
- Use progressive disclosure pattern
**Warning signs:** Quality degrades after skill loads, context fills quickly

### Pitfall 4: Missing Agent Binding

**What goes wrong:** Subagents can't access skill knowledge
**Why it happens:** Not adding `skills:` field to agent frontmatter
**How to avoid:** Explicitly list skills in agent `skills:` field
**Warning signs:** Subagents reinvent patterns already documented in skills

### Pitfall 5: Breaking Deterministic Execution

**What goes wrong:** Users lose ability to run specific commands with specific arguments
**Why it happens:** Replacing commands with skills entirely
**How to avoid:** Dual-path approach - commands for deterministic, skills for autonomous
**Warning signs:** Users complain they can't run workflows with specific parameters

## Code Examples

### Example 1: Converting phase-plan Command

**Current command structure:**
```yaml
---
name: kata:phase-plan
description: Create detailed execution plan for a phase
argument-hint: "[phase] [--research] [--gaps]"
agent: kata-planner
allowed-tools: [Read, Write, Bash, Glob, Grep, Task, WebFetch]
---

<objective>
Create executable phase prompts (PLAN.md files)...
</objective>

<execution_context>
@~/.claude/kata/workflows/...
</execution_context>

[~500 lines of workflow]
```

**Converted to skill + thin command:**

**Skill** (`skills/kata-planning-phases/SKILL.md`):
```yaml
---
name: kata-planning-phases
description: This skill should be used when the user asks to "plan a phase", "create execution plan", "break down tasks", "analyze dependencies", or needs guidance on phase planning, task breakdown, goal-backward verification, or TDD integration. Applies when creating PLAN.md files or preparing phases for execution.
---

# Phase Planning

## Overview

Creates executable phase prompts (PLAN.md files) with task breakdown, dependency analysis, and goal-backward verification.

## Core Workflow

[Essential workflow - ~200 lines]

## Additional Resources

### Reference Files

For detailed guidance, consult:
- **`references/task-breakdown.md`** - Task sizing, specificity, TDD detection
- **`references/dependency-graph.md`** - Wave assignment, parallel execution
- **`references/goal-backward.md`** - Must-haves derivation methodology
- **`references/plan-format.md`** - PLAN.md structure and frontmatter

### Quick Reference

- Plans: 2-3 tasks, ~50% context budget
- Tasks: 15-60 min execution time
- Frontmatter: phase, plan, wave, depends_on, files_modified, autonomous, must_haves
```

**Command** (`commands/kata/phase-plan.md`):
```yaml
---
name: kata:phase-plan
description: Create detailed execution plan for a phase
argument-hint: "[phase] [--research] [--gaps]"
context: fork
agent: kata-planner
skills: kata-planning-phases
allowed-tools: [Read, Write, Bash, Glob, Grep, Task, WebFetch]
---

Plan phase: $ARGUMENTS

Load skill context from:
@~/.claude/skills/kata-planning-phases/SKILL.md

Project context:
@.planning/ROADMAP.md
@.planning/STATE.md
```

### Example 2: Agent with Skill Binding

**Agent** (`agents/kata-planner.md`):
```yaml
---
name: kata-planner
description: Creates executable phase plans with task breakdown, dependency analysis, and goal-backward verification.
tools: Read, Write, Bash, Glob, Grep, WebFetch
skills: kata-planning-phases, kata-researching-phases
color: green
---

<role>
You are a Kata planner. You create executable phase plans.
</role>

[Core agent instructions - streamlined since skill provides details]
```

### Example 3: Skill with References

**Structure:**
```
skills/kata-execution/
├── SKILL.md
└── references/
    ├── deviation-rules.md
    ├── checkpoint-protocol.md
    ├── tdd-execution.md
    └── commit-protocol.md
```

**SKILL.md** (~200 lines):
```markdown
---
name: kata-execution
description: This skill should be used when executing plans, running PLAN.md files, handling deviations, managing checkpoints, or creating SUMMARY.md files. Applies during /kata:phase-execute or when Claude needs guidance on plan execution workflow.
---

# Plan Execution

## Overview

Execute PLAN.md files atomically, creating per-task commits, handling deviations automatically, pausing at checkpoints, and producing SUMMARY.md files.

## Execution Flow

1. Load project state (@.planning/STATE.md)
2. Load plan and parse tasks
3. Determine execution pattern (autonomous vs checkpoint)
4. Execute tasks sequentially
5. Create SUMMARY.md
6. Update STATE.md

## Task Execution

For each task:
1. Read task type (auto, checkpoint:*)
2. Execute action
3. Run verification
4. Commit with proper format

## Key References

### Deviation Rules
See `references/deviation-rules.md` for:
- Rule 1: Auto-fix bugs
- Rule 2: Auto-add critical functionality
- Rule 3: Auto-fix blockers
- Rule 4: Ask about architectural changes

### Checkpoint Protocol
See `references/checkpoint-protocol.md` for checkpoint types and return formats.

### TDD Execution
See `references/tdd-execution.md` for RED-GREEN-REFACTOR cycle.
```

## State of the Art

| Old Approach             | Current Approach                     | When Changed     | Impact                                 |
| ------------------------ | ------------------------------------ | ---------------- | -------------------------------------- |
| Commands only            | Skills + Commands                    | Claude Code 2024 | Skills enable autonomous discovery     |
| Single-file commands     | Multi-file skills with references    | Skills spec 2024 | Progressive disclosure reduces context |
| No agent-skill binding   | `skills:` field in agent frontmatter | Skills spec 2024 | Agents can access skill knowledge      |
| Manual tool restrictions | `allowed-tools` frontmatter          | Claude Code 2024 | Declarative tool control               |

**Deprecated/outdated:**
- Putting all workflow in one file: Use progressive disclosure with references/
- Task-focused descriptions: Use trigger-focused descriptions for skills

## Open Questions

Things that couldn't be fully resolved:

1. **Skill loading order with agent binding**
   - What we know: Agents can list skills in `skills:` field
   - What's unclear: Exact loading order when multiple skills overlap
   - Recommendation: Test with simple cases first, document observed behavior

2. **Variable substitution in skills**
   - What we know: Skills support `$ARGUMENTS` and `${CLAUDE_SESSION_ID}`
   - What's unclear: Whether custom variables work
   - Recommendation: Use documented variables only, test edge cases

3. **Hooks in skills vs commands**
   - What we know: Both support hooks in frontmatter
   - What's unclear: Whether hooks cascade when command invokes skill
   - Recommendation: Define hooks at command level for predictability

## Sources

### Primary (HIGH confidence)
- Claude Code Skills documentation (https://code.claude.com/docs/en/skills) - SKILL.md format, frontmatter fields, directory structure, progressive disclosure
- Claude Code Slash Commands documentation (https://code.claude.com/docs/en/slash-commands) - Command format, $ARGUMENTS, frontmatter fields
- Local skill development guides (`~/.claude/skills/building-claude-code-skills/`) - Conversion patterns, best practices

### Secondary (MEDIUM confidence)
- Anthropic skills repository examples (https://github.com/anthropics/skills) - Real-world skill patterns
- Plugin-dev skill-development skill - Plugin-specific skill guidance

### Tertiary (LOW confidence)
- WebSearch results for "Claude Code Skills" - Community patterns, may be outdated

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified against official documentation
- Architecture: HIGH - Based on official documentation and existing patterns
- Pitfalls: MEDIUM - Derived from conversion guides and community experience

**Research date:** 2026-01-19
**Valid until:** 2026-02-19 (30 days - Skills format is stable)

## Conversion Inventory

Kata commands requiring conversion (24 total):

### Core Workflow Commands
| Command       | Current Size | Recommended Skill          | Priority |
| ------------- | ------------ | -------------------------- | -------- |
| project-new   | ~900 lines   | kata-starting-project-news | High     |
| phase-plan    | ~475 lines   | kata-planning-phases       | High     |
| phase-execute | ~300 lines   | kata-execution             | High     |
| phase-verify  | ~250 lines   | kata-verification          | High     |

### Planning Commands
| Command           | Current Size | Recommended Skill             | Priority |
| ----------------- | ------------ | ----------------------------- | -------- |
| phase-discuss     | ~150 lines   | kata-discussion               | Medium   |
| phase-research    | ~200 lines   | kata-researching-phases       | Medium   |
| phase-assumptions | ~75 lines    | Embed in kata-planning-phases | Low      |

### Milestone Commands
| Command            | Current Size | Recommended Skill         | Priority |
| ------------------ | ------------ | ------------------------- | -------- |
| milestone-new      | ~800 lines   | kata-manageing-milestones | High     |
| milestone-complete | ~225 lines   | kata-manageing-milestones | Medium   |
| milestone-audit    | ~350 lines   | kata-manageing-milestones | Medium   |

### Roadmap Commands
| Command             | Current Size | Recommended Skill             | Priority |
| ------------------- | ------------ | ----------------------------- | -------- |
| phase-add           | ~250 lines   | kata-managing-project-roadmap | Medium   |
| phase-insert        | ~285 lines   | kata-managing-project-roadmap | Medium   |
| phase-remove        | ~200 lines   | kata-managing-project-roadmap | Low      |
| milestone-plan-gaps | ~315 lines   | kata-managing-project-roadmap | Low      |

### Utility Commands
| Command         | Current Size | Recommended Skill       | Priority |
| --------------- | ------------ | ----------------------- | -------- |
| progress        | ~300 lines   | kata-progress-tracking  | Medium   |
| phase-resume    | ~150 lines   | kata-session-management | Low      |
| phase-pause     | ~125 lines   | kata-session-management | Low      |
| debug           | ~175 lines   | kata-debugging          | Medium   |
| project-analyze | ~150 lines   | kata-codebase-mapping   | Medium   |
| help            | ~400 lines   | Keep as command only    | Low      |
| whats-new       | ~100 lines   | Keep as command only    | Low      |
| update          | ~100 lines   | Keep as command only    | Low      |

### Todo Commands
| Command     | Current Size | Recommended Skill    | Priority |
| ----------- | ------------ | -------------------- | -------- |
| todos-add   | ~215 lines   | kata-todo-management | Low      |
| todos-lists | ~260 lines   | kata-todo-management | Low      |

### Agents Requiring Skill Binding
| Agent                   | Relevant Skills                               |
| ----------------------- | --------------------------------------------- |
| kata-planner            | kata-planning-phases, kata-researching-phases |
| kata-executor           | kata-execution                                |
| kata-verifier           | kata-verification                             |
| kata-debugger           | kata-debugging                                |
| kata-roadmapper         | kata-managing-project-roadmap                 |
| kata-phase-researcher   | kata-researching-phases                       |
| kata-project-researcher | kata-researching-phases                       |
