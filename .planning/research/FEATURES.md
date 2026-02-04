# Feature Landscape: Agent Skills Subagent Patterns

**Domain:** Skills-native subagent architecture for orchestrated workflows
**Researched:** 2026-02-04
**Confidence:** HIGH (verified against Claude Code official documentation)

## Table Stakes

Features required for Kata's subagent pattern to work with the Agent Skills standard. Missing these blocks the migration.

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| **Custom subagent definitions** | Kata has 15+ specialized agents (planner, executor, verifier, etc.). Must define each as a subagent file | Low | Claude Code supports `.claude/agents/*.md` files with YAML frontmatter. Kata already uses this format in `agents/` directory |
| **Tool restrictions per agent** | kata-verifier needs read-only tools, kata-executor needs write tools. Must restrict per agent | Low | Frontmatter `tools:` field (allowlist) and `disallowedTools:` field (denylist). Already supported |
| **Model selection per agent** | Different agents need different models (planner → opus, executor → sonnet, verifier → haiku) | Low | Frontmatter `model:` field. Values: `sonnet`, `opus`, `haiku`, or `inherit`. Already supported |
| **Subagent spawning via Task tool** | Skills orchestrators spawn subagents via `Task()` calls. Must continue working | Low | `Task(prompt="...", subagent_type="agent-name", model="...")` already works. Agents in `agents/` directory are recognized |
| **System prompt as markdown body** | Agent behavior defined by markdown content after frontmatter. This is the "specialization" | Low | Already how Kata agents work. Markdown body becomes agent's system prompt |
| **Plugin distribution of agents** | Kata agents must distribute via plugin's `agents/` directory | Low | Claude Code plugin spec supports `<plugin>/agents/` directory. Kata already uses this |
| **Context isolation** | Each subagent gets fresh 200k context, not shared with orchestrator | Low | Built-in behavior of Task tool. Subagents do not inherit conversation history |
| **Description for auto-delegation** | Each agent needs clear description so Claude knows when to use it | Low | Frontmatter `description:` field. Used for Task routing |

## Differentiators

Features that the Agent Skills/Claude Code subagent pattern provides that could improve Kata's architecture.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Skills preloading into subagents** | Inject skill content into agent context at startup. Agent gets domain knowledge without discovering it | Low | Frontmatter `skills:` field lists skills to inject. Could preload planning-principles, checkpoints, etc. into planner |
| **Permission modes** | Control permission prompts per agent: `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan` | Low | Frontmatter `permissionMode:` field. kata-executor could use `acceptEdits`, kata-verifier could use `plan` (read-only) |
| **Lifecycle hooks per agent** | `PreToolUse`, `PostToolUse`, `Stop` hooks scoped to specific agent | Medium | Could add validation hooks to executor (pre-commit checks), logging hooks for debugging |
| **Background execution** | Subagents can run concurrently in background | Medium | Kata's wave parallelism already uses parallel Task() calls. Background mode could allow orchestrator to continue while waiting |
| **Subagent resume** | Continue where agent left off instead of starting fresh | Medium | Could improve checkpoint handling. Instead of spawning new agent with history, resume existing agent |
| **Color coding** | Visual identification of which agent is running | Low | Frontmatter `color:` field. Kata already uses this for some agents |
| **Conditional tool rules via hooks** | PreToolUse hooks can validate/block operations dynamically | Medium | More granular than static tool lists. Could validate file paths, command patterns, etc. |
| **Inheriting parent permissions** | Subagents inherit permission context from main conversation | Low | Reduces permission fatigue. Already default behavior |
| **Auto-compaction** | Subagents auto-compact at ~95% context | Low | Helps long-running agents like executor stay healthy |

## Anti-Features

Patterns that Kata's current architecture uses that do NOT align with Agent Skills standard. Must be addressed in migration.

| Anti-Feature | Why It's a Problem | What Standard Provides |
|--------------|-------------------|------------------------|
| **Agent files in `agents/` not `skills/agents/`** | Agent Skills spec doesn't define subagent location. Claude Code uses `.claude/agents/` (project) or `~/.claude/agents/` (user). Plugins use `<plugin>/agents/` | Move to standard locations. For plugin: `dist/plugin/agents/` is correct |
| **Custom frontmatter fields** | Kata agents use `tools:` (comma-separated), `color:`. Standard uses space-delimited `tools` | Verify format compatibility. Kata's comma format may need adjustment |
| **No `name` field in frontmatter** | Agent Skills requires `name` in frontmatter. Kata agents infer from filename | Add explicit `name:` field to all agent frontmatter |
| **Very long agent prompts** | Some Kata agents (kata-planner, kata-executor) are 1000+ lines. Skills spec recommends < 500 lines | Use `references/` directory for detailed content. Keep main file focused |
| **Inline context injection** | Kata orchestrators read files and inline content in Task prompt. Standard doesn't define this | This is a Kata pattern, not an anti-feature. Works with standard |
| **Subagents spawning subagents** | Kata's plan-check loop has orchestrator spawn multiple agents in sequence, but agents don't spawn agents | Claude Code limitation: "subagents cannot spawn other subagents". Must keep orchestration in skills |
| **No progressive disclosure** | Kata agents put everything in one file. No references/ structure for agents | Add `agents/<name>/references/` for detailed docs. Main agent file stays lean |

## Feature Dependencies

```
Agent Skills Standard Compliance
└── SKILL.md format for skills (already compliant)
    └── Subagent format in .claude/agents/ or plugin/agents/
        ├── Frontmatter fields (name, description, tools, model)
        ├── Markdown body as system prompt
        └── Optional: skills, hooks, permissionMode, color

Kata Subagent Pattern
├── Skill orchestration (SKILL.md invokes Task())
│   └── Task() tool spawns subagent
│       ├── subagent_type parameter references agent name
│       ├── prompt parameter passes task context
│       └── model parameter selects model
└── Agent specialization (agent file defines behavior)
    ├── System prompt specializes for task
    ├── Tool restrictions enforce boundaries
    └── Model selection optimizes cost/quality

Migration Dependencies
├── Verify frontmatter compatibility
│   ├── tools format (space vs comma)
│   └── name field requirement
├── Test Task() with plugin agents
│   └── Confirm subagent_type resolution
└── Validate skill preloading
    └── Test skills field in agent frontmatter
```

## Gap Analysis: Current vs Standard

### Frontmatter Field Comparison

| Field | Kata Agents | Claude Code Subagents | Action |
|-------|-------------|----------------------|--------|
| `name` | Inferred from filename | **Required** | Add to all agents |
| `description` | Present | Required | Keep as-is |
| `tools` | Present (comma-separated) | Present (space-delimited) | Verify format |
| `disallowedTools` | Not used | Optional | Consider using |
| `model` | Not present (passed in Task) | Optional, defaults to inherit | Consider adding |
| `color` | Present for some | Optional | Keep as-is |
| `permissionMode` | Not used | Optional | Consider for verifier, executor |
| `skills` | Not used | Optional | Consider for injecting references |
| `hooks` | Not used | Optional | Consider for validation |

### Location Comparison

| Context | Kata Current | Claude Code Standard | Action |
|---------|--------------|---------------------|--------|
| Plugin agents | `dist/plugin/agents/` | `<plugin>/agents/` | Already correct |
| Project agents | `agents/` (source) | `.claude/agents/` | Build copies to correct location |
| User agents | N/A | `~/.claude/agents/` | N/A (plugin distribution) |

### Orchestration Pattern Comparison

| Aspect | Kata Pattern | Claude Code Pattern | Compatibility |
|--------|--------------|---------------------|---------------|
| Skill invokes Task | Yes | Yes | Compatible |
| Task references agent name | `subagent_type="kata-planner"` | `subagent_type="custom-agent"` | Compatible |
| Agent gets fresh context | Yes | Yes | Compatible |
| Orchestrator stays lean | Yes (~15% context) | Yes (recommended) | Compatible |
| Parallel Task calls | Yes (wave execution) | Yes (supported) | Compatible |
| Agent spawns agent | No (by design) | No (not allowed) | Compatible |

## MVP Recommendation

For v1.6.0 Skills-Native Subagents:

**Must have (table stakes):**
1. **Verify frontmatter compatibility** - Test that current Kata agent files work with Claude Code subagent system
2. **Add `name` field to all agents** - Required by standard, currently inferred
3. **Test Task() spawning** - Confirm `subagent_type` correctly resolves plugin agents
4. **Validate tool restrictions** - Confirm `tools:` field enforced per agent

**Should have (quick wins):**
1. **Add `permissionMode`** to appropriate agents:
   - kata-verifier: `permissionMode: plan` (read-only)
   - kata-executor: `permissionMode: acceptEdits` (auto-approve edits)
2. **Add `model` to agent frontmatter** - Remove from Task() call, put in agent definition
3. **Test `skills` preloading** - Inject references into agents instead of @-loading

**Nice to have (differentiators):**
1. **Lifecycle hooks** for executor - pre-commit validation, post-task logging
2. **Background execution** - Run parallel plans truly concurrently
3. **Resume support** - Improve checkpoint continuation

**Defer:**
- Progressive disclosure (references/ for agents) - Works without it
- Color standardization - Cosmetic, low value
- Hook-based tool validation - Static restrictions sufficient

## Complexity Estimates

| Feature | Complexity | Rationale |
|---------|------------|-----------|
| Add `name` field to agents | Trivial | String addition to frontmatter |
| Verify frontmatter format | Low | Test existing files, adjust if needed |
| Test Task() resolution | Low | Run existing tests, observe behavior |
| Add `permissionMode` | Low | Single field addition |
| Move `model` to agent | Medium | Change all orchestrator Task() calls |
| Test `skills` preloading | Medium | New pattern, needs validation |
| Add lifecycle hooks | Medium | New configuration, testing needed |
| Background execution | High | Changes orchestration model |
| Resume support | High | Changes checkpoint architecture |

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Frontmatter format incompatibility | Low | High | Test early in POC phase |
| Task() doesn't find plugin agents | Low | High | Test with installed plugin, not source |
| Skills preloading bloats context | Medium | Medium | Be selective about which skills to preload |
| permissionMode breaks workflows | Low | Medium | Test in isolation before broad rollout |
| Model in frontmatter conflicts with Task() | Medium | Low | Frontmatter overrides Task() - verify behavior |

## Sources

### Claude Code Official Documentation
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents) - Complete subagent configuration reference
- [Extend Claude with skills](https://code.claude.com/docs/skills) - Skills and their interaction with subagents (from ~/.claude/rules/skills.md)

### Agent Skills Specification
- [Agent Skills Specification](https://agentskills.io/specification.md) - SKILL.md format definition
- [Integrate skills into your agent](https://agentskills.io/integrate-skills.md) - Integration guidance

### Kata Project Context
- Existing agents in `/agents/*.md` - Current frontmatter and structure
- Skills in `/skills/kata-*/SKILL.md` - Current orchestration patterns
- CLAUDE.md and KATA-STYLE.md - Project conventions
