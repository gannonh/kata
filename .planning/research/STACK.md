# Technology Stack: Agent Skills Subagent Patterns

**Project:** Kata Subagent Architecture Migration
**Researched:** 2026-02-04
**Confidence:** HIGH (verified with official Claude Code docs and Agent Skills spec)

## Executive Summary

The Agent Skills specification does not define subagent patterns. It is a format specification for skill files (SKILL.md), not an orchestration framework. Subagent instantiation and multi-agent orchestration are **Claude Code implementation details**, not part of the Agent Skills standard.

Kata's current architecture uses Claude Code's native subagent system correctly. The migration question is: should Kata's custom agents (kata-planner, kata-executor, etc.) be distributed as:

1. **Plugin agents** (`.claude-plugin/agents/`) — Claude Code's standard subagent format
2. **Skill resources** (`skills/*/references/`) — Agent prompts loaded by skills on demand

**Recommendation:** Hybrid approach. Convert agents to plugin subagents for first-class Claude Code integration, while skills reference agent prompts via the `skills` frontmatter field for progressive disclosure.

---

## Agent Skills Specification: What It Defines

The [Agent Skills specification](https://agentskills.io/specification.md) defines:

| Component | Purpose | Relevant to Subagents? |
|-----------|---------|------------------------|
| `SKILL.md` format | Frontmatter + markdown instructions | No — skill files, not agent definitions |
| `name`, `description` | Metadata for discovery | No — skill identification |
| `allowed-tools` | Pre-approved tools (experimental) | Partially — tool restrictions |
| `scripts/`, `references/`, `assets/` | Supporting resources | Potentially — agent prompts could live here |

**Critical finding:** Agent Skills spec has no concept of:
- Subagent definition
- Agent spawning
- Task delegation
- Multi-agent orchestration

These are **platform-specific implementations**. Claude Code happens to implement subagents, but another Agent Skills-compatible platform might not.

**Source:** [Agent Skills Specification](https://agentskills.io/specification.md)

---

## Claude Code Subagent Architecture

### How Claude Code Implements Subagents

Claude Code's subagent system is a **proprietary extension** built on top of the Agent Skills standard. Key components:

| Component | Location | Format | Purpose |
|-----------|----------|--------|---------|
| Subagent definitions | `.claude/agents/` or `~/.claude/agents/` | Markdown + YAML frontmatter | Define custom subagents |
| Plugin agents | `<plugin>/agents/` | Same format | Plugin-distributed subagents |
| Task tool | Internal | N/A | Spawns subagents at runtime |
| Built-in agents | Internal | N/A | Explore, Plan, general-purpose |

### Subagent Frontmatter Fields

```yaml
---
name: kata-planner           # Unique identifier (kebab-case)
description: Plans phases    # When to delegate
tools: Read, Write, Bash     # Allowed tools (or inherits all)
disallowedTools: []          # Tools to deny
model: sonnet                # sonnet, opus, haiku, or inherit
permissionMode: default      # Permission handling mode
skills: []                   # Skills to preload into context
hooks: {}                    # Lifecycle hooks
---

[System prompt markdown body]
```

**Source:** [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents)

### Task Tool Parameters

When skills spawn subagents, they use the Task tool:

```
Task(
  prompt="[task instructions]",
  subagent_type="kata-planner",  # References agent by name
  model="sonnet"                  # Optional: override model
)
```

The `subagent_type` parameter references:
1. Built-in agents: `Explore`, `Plan`, `general-purpose`
2. User agents: From `~/.claude/agents/`
3. Project agents: From `.claude/agents/`
4. Plugin agents: Namespaced as `pluginname:agentname`

**Key constraint:** Subagents cannot spawn other subagents. Nested delegation requires skills or chained subagents from the main conversation.

---

## Kata's Current Architecture

### Skills as Orchestrators

Kata follows the pattern where skills ARE orchestrators:

```
skills/kata-plan-phase/SKILL.md    → Orchestrator
  ↓ spawns
agents/kata-phase-researcher.md    → Subagent
agents/kata-planner.md             → Subagent
agents/kata-plan-checker.md        → Subagent
```

### How Kata Currently Spawns Agents

From `skills/kata-plan-phase/SKILL.md`:

```
Task(
  prompt=research_prompt,
  subagent_type="kata-phase-researcher",
  model="{researcher_model}",
  description="Research Phase {phase}"
)
```

### Plugin Namespacing

Kata's build system transforms agent references for plugin distribution:

```javascript
// scripts/build.js line 159
content = content.replace(/subagent_type="kata-/g, 'subagent_type="kata:kata-');
```

This converts `subagent_type="kata-planner"` to `subagent_type="kata:kata-planner"` because Claude Code namespaces plugin agents as `pluginname:agentname`.

---

## Migration Options Analysis

### Option 1: Keep Current Architecture (agents/ directory)

**How it works:**
- Agents remain in `agents/kata-*.md`
- Build copies to `.claude-plugin/agents/`
- Skills reference via `subagent_type="kata:kata-*"`

**Pros:**
- Already working
- Clear separation between skills and agents
- Familiar pattern

**Cons:**
- `agents/` directory is Kata-specific, not Agent Skills standard
- Requires build-time transformation for namespacing
- No progressive disclosure — entire agent prompt loaded at spawn

**Verdict:** Valid but not leveraging new Claude Code features.

### Option 2: Agents as Skill Resources

**How it works:**
- Move agent prompts to `skills/*/references/agent-*.md`
- Skills read agent prompt content and inline into Task calls
- No separate `agents/` directory

**Pros:**
- Aligns with Agent Skills progressive disclosure
- Skills control when/how agent prompts are loaded
- Simpler plugin structure (no agents/ directory)

**Cons:**
- Loss of first-class subagent features (auto-delegation, /agents command)
- Skills must manually inline agent content into Task prompts
- No model/tool restrictions at agent level (must be in Task call)

**Verdict:** Possible but loses Claude Code native features.

### Option 3: Hybrid — Plugin Agents + Skill References (Recommended)

**How it works:**
1. Agents distributed as plugin subagents (`.claude-plugin/agents/`)
2. Skills can preload agent content via `skills` frontmatter field
3. Task tool references agent by name

```yaml
# Subagent definition (agents/kata-planner.md)
---
name: kata-planner
description: Creates executable phase plans
tools: Read, Write, Bash, Glob, Grep, WebFetch
model: opus
skills:
  - kata-plan-format    # Preloads skill content into agent context
---
```

```yaml
# Skill that spawns the agent (skills/kata-plan-phase/SKILL.md)
---
name: kata-plan-phase
allowed-tools: Read, Bash, Task
---

Spawn planner:
Task(prompt="...", subagent_type="kata:kata-planner")
```

**Pros:**
- First-class Claude Code integration
- Agents visible in `/agents` command
- Skills field enables progressive disclosure
- Clean separation of concerns
- No loss of features

**Cons:**
- Requires maintaining both agents/ and skills/
- Plugin namespace prefix required

**Verdict:** Best of both worlds. Recommended approach.

---

## Recommended Stack

### Plugin Structure

```
.claude-plugin/
├── plugin.json          # Plugin manifest
├── skills/              # Agent Skills standard
│   ├── kata-plan-phase/
│   │   └── SKILL.md     # Orchestrator skill
│   └── kata-execute-phase/
│       └── SKILL.md     # Orchestrator skill
└── agents/              # Claude Code subagents
    ├── kata-planner.md
    ├── kata-executor.md
    ├── kata-verifier.md
    └── ...
```

### Agent Definition Pattern

```yaml
---
name: kata-planner
description: Creates executable phase plans with task breakdown, dependency analysis, and goal-backward verification. Spawned by kata-plan-phase orchestrator.
tools: Read, Write, Bash, Glob, Grep, WebFetch, mcp__context7__*
model: opus
---

<role>
[Agent system prompt...]
</role>
```

### Skill Orchestrator Pattern

```yaml
---
name: kata-plan-phase
description: Plan detailed roadmap phases.
allowed-tools: Read, Write, Bash, Task
---

Spawn agents via Task tool:
Task(
  prompt="[context + instructions]",
  subagent_type="kata:kata-planner",
  model="opus"
)
```

### Build System Requirements

1. **Copy agents to plugin:** `agents/*.md` → `.claude-plugin/agents/`
2. **Transform namespaces:** `subagent_type="kata-*"` → `subagent_type="kata:kata-*"`
3. **Validate agent frontmatter:** Ensure required fields present

---

## Skills Field for Agent Knowledge Injection

Claude Code's `skills` frontmatter field allows subagents to preload skill content:

```yaml
# agents/kata-planner.md
---
name: kata-planner
skills:
  - kata-plan-format       # Injects skill content at spawn
  - kata-goal-backward     # Domain knowledge available to agent
---
```

**How it works:**
1. When Task spawns `kata-planner`, Claude Code reads the agent definition
2. The `skills` array is processed
3. Full content of each referenced skill is injected into agent's context
4. Agent has domain knowledge without reading files during execution

**Use cases for Kata:**
- Inject plan format specification into planner
- Inject verification patterns into verifier
- Inject checkpoint protocols into executor

**Constraint:** Skills must be in the same plugin or user-level skills directory.

---

## Task Tool Behavior Deep Dive

### Spawning Syntax

```
Task(
  prompt="[instructions]",           # Required: what the agent should do
  subagent_type="kata:kata-planner", # Required: which agent to use
  model="opus",                      # Optional: override agent's model
  description="Plan Phase 2"         # Optional: short description for UI
)
```

### Content Inlining Requirement

**Critical:** `@` references don't work across Task boundaries. Content must be inlined:

```
# WRONG — @references won't resolve in spawned agent
Task(
  prompt="Read @.planning/STATE.md and plan",
  subagent_type="kata:kata-planner"
)

# CORRECT — read content, inline it
state_content = Read(".planning/STATE.md")
Task(
  prompt="<project_state>\n${state_content}\n</project_state>\n\nPlan the phase.",
  subagent_type="kata:kata-planner"
)
```

### Parallel Spawning

Multiple Task calls in one message spawn parallel agents:

```
Task(prompt="Execute plan 1", subagent_type="kata:kata-executor")
Task(prompt="Execute plan 2", subagent_type="kata:kata-executor")
Task(prompt="Execute plan 3", subagent_type="kata:kata-executor")
# All three run in parallel, Task blocks until all complete
```

---

## Migration Path

### Phase 1: Audit Current Agents

```bash
# Count agents
ls -la agents/kata-*.md | wc -l

# Verify frontmatter format
for f in agents/kata-*.md; do
  head -20 "$f" | grep -E "^(name|description|tools|model):"
done
```

### Phase 2: Align Frontmatter

Ensure all agents use Claude Code's supported fields:

```yaml
---
name: kata-executor                     # Required
description: Executes Kata plans        # Required
tools: Read, Write, Edit, Bash          # Optional, inherits if omitted
model: sonnet                           # Optional, inherits if omitted
---
```

Remove Kata-specific fields that Claude Code doesn't recognize:
- `color` — not standard (cosmetic only, can keep)

### Phase 3: Update Build Script

Verify `scripts/build.js` handles:
1. Copying `agents/` to `.claude-plugin/agents/`
2. Transforming `subagent_type` references
3. Preserving agent file structure

### Phase 4: Test Plugin Distribution

```bash
npm run build:plugin
claude --plugin-dir dist/plugin

# Verify agents load
/agents
# Should show kata:kata-planner, kata:kata-executor, etc.
```

---

## What NOT to Change

### Keep Current Agent Format

Kata's agent files already follow Claude Code's format:

```yaml
---
name: kata-planner
description: Creates executable phase plans...
tools: Read, Write, Bash, Glob, Grep, WebFetch, mcp__context7__*
---
```

This IS the Claude Code subagent format. No migration needed for file structure.

### Keep Task Tool Usage

Kata's current Task() invocations are correct:

```
Task(
  prompt=filled_prompt,
  subagent_type="kata-planner",
  model="{planner_model}"
)
```

The build system already handles `kata:` prefix for plugin distribution.

### Keep Skills as Orchestrators

The pattern where skills ARE orchestrators (not separate orchestrator files) aligns with both:
- Agent Skills progressive disclosure philosophy
- Claude Code's skill + subagent architecture

---

## Open Questions

### 1. Should Agents Preload Skills?

**Question:** Should Kata's agents use the `skills` field to preload domain knowledge?

**Tradeoff:**
- YES: Agent has patterns/formats without reading files at runtime
- NO: Agent stays lean, reads what it needs (current behavior)

**Recommendation:** Evaluate per-agent. Planner might benefit from preloaded plan-format skill. Executor needs fresh context, probably not.

### 2. MCP Tool Access in Agents

**Question:** Kata agents reference `mcp__context7__*` tools. How does plugin distribution handle MCP?

**Finding:** MCP tools are inherited from parent if not restricted. Plugin agents can use MCP tools if:
1. User has MCP server configured
2. Agent's `tools` field includes `mcp__*` or inherits all

**Recommendation:** Keep current MCP tool references. Users without Context7 will simply not have those tools available.

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Agent Skills spec scope | HIGH | Verified directly at agentskills.io |
| Claude Code subagent format | HIGH | Verified at code.claude.com/docs |
| Task tool parameters | HIGH | Verified in official docs |
| Plugin namespacing | HIGH | Validated in Kata codebase (build.js) |
| Skills preloading | HIGH | Documented in Claude Code subagent docs |
| MCP inheritance | MEDIUM | Inferred from tool inheritance docs, not explicit |

---

## Sources

**Agent Skills Specification:**
- [Agent Skills Specification](https://agentskills.io/specification.md)
- [Integrate Skills](https://agentskills.io/integrate-skills.md)

**Claude Code Documentation:**
- [Create Custom Subagents](https://code.claude.com/docs/en/sub-agents)
- [Skills Documentation](https://code.claude.com/docs/en/skills)
- [Plugin Components Reference](https://code.claude.com/docs/en/plugins-reference)

**Kata Codebase:**
- `scripts/build.js` — Plugin build with namespace transformation
- `agents/kata-*.md` — Current agent definitions
- `skills/kata-*/SKILL.md` — Current skill orchestrators

**Community Resources:**
- [Task Tool: Claude Code's Agent Orchestration System](https://dev.to/bhaidar/the-task-tool-claude-codes-agent-orchestration-system-4bf2)
- [Claude Code Customization Guide](https://alexop.dev/posts/claude-code-customization-guide-claudemd-skills-subagents/)
