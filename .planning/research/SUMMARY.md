# Research Summary: v1.6.0 Skills-Native Subagents

**Project:** Kata v1.6.0 Milestone
**Synthesized:** 2026-02-04
**Overall Confidence:** HIGH

---

## Executive Summary

**Goal:** Deprecate custom subagent types to make Kata portable across Agent Skills-compatible platforms.

**Problem:** Kata currently uses custom subagent types (`subagent_type="kata:kata-planner"`). Claude Code looks up `agents/kata-planner.md` and uses it as the subagent's system prompt. This pattern is Claude Code-specific and not portable.

**Solution:** Eliminate custom subagent types. Move agent instructions to skill resources. Skills inline instructions into Task prompts and spawn standard subagents (`general-purpose`, `Explore`, etc.).

**Key insight:** Agent Skills spec does not support custom subagent types. For Kata to be portable, it must use only standard subagent types with instructions passed via prompt content.

---

## Architecture Change

### Current Architecture (Custom Subagents)

```
# Skill invocation
Task(
  prompt="Research how to implement [feature]...",
  subagent_type="kata-phase-researcher",
  model="{researcher_model}"
)

# Claude Code automatically loads agents/kata-phase-researcher.md as system prompt
```

**Components:**
- `agents/kata-*.md` — Agent definitions with frontmatter + instructions
- Skills reference agents by custom subagent_type
- Claude Code performs automatic lookup and system prompt injection

**Limitation:** Only works on Claude Code. Not portable to other Agent Skills platforms.

### Target Architecture (Standard Subagents + Inlined Instructions)

```
# Agent instructions stored as skill resource
skills/kata-research-phase/references/researcher-instructions.md

# Skill reads resource and inlines into prompt
Task(
  prompt="
    <agent-instructions>
    [Contents of researcher-instructions.md]
    </agent-instructions>

    <task>
    Research how to implement [feature]...
    </task>
  ",
  subagent_type="general-purpose",
  model="{researcher_model}"
)
```

**Components:**
- `skills/*/references/*-instructions.md` — Agent instructions as skill resources
- Skills read instruction files and inline them into Task prompts
- Only standard subagent types used (general-purpose, Explore, etc.)

**Benefit:** Portable to any platform supporting Agent Skills + standard subagent spawning.

---

## What Changes

| Component | Current | Target |
|-----------|---------|--------|
| Agent definitions | `agents/kata-*.md` (19 files) | `skills/*/references/*-instructions.md` |
| Task invocation | `subagent_type="kata-*"` | `subagent_type="general-purpose"` |
| System prompt source | Automatic lookup by Claude Code | Inlined by skill from resource file |
| Portability | Claude Code only | Any Agent Skills platform |

---

## Files Affected

### Agent Files to Migrate (19 total)

```
agents/
├── kata-codebase-mapper.md
├── kata-debugger.md
├── kata-entity-generator.md
├── kata-executor.md
├── kata-integration-checker.md
├── kata-phase-researcher.md
├── kata-plan-checker.md
├── kata-planner.md
├── kata-project-researcher.md
├── kata-research-synthesizer.md
├── kata-roadmapper.md
├── kata-verifier.md
└── ... (review agents, etc.)
```

### Skills That Spawn Agents

Each skill that uses Task tool with custom subagent_type needs updating:

| Skill | Agents Spawned |
|-------|----------------|
| kata-plan-phase | kata-planner, kata-plan-checker |
| kata-execute-phase | kata-executor |
| kata-verify-work | kata-verifier, kata-debugger |
| kata-new-project | kata-project-researcher, kata-roadmapper |
| kata-add-milestone | kata-project-researcher, kata-research-synthesizer, kata-roadmapper |
| kata-research-phase | kata-phase-researcher |
| kata-track-progress | kata-debugger, kata-codebase-mapper |

---

## Migration Strategy

### Phase 1: Proof of Concept

**Goal:** Validate the pattern works with 2 agents before full conversion.

**Scope:**
- Select kata-planner and kata-executor
- Move instructions to skill resources
- Update invoking skills to inline instructions
- Change subagent_type to general-purpose
- Validate behavior is identical

**Go/No-Go gate:** If POC succeeds, proceed to full conversion.

### Phase 2: Full Conversion (if POC succeeds)

**Goal:** Migrate all 19 agent files to skill resources.

**Scope:**
- Move all agent instruction content to appropriate skill resources
- Update all skills to inline instructions
- Change all subagent_type to standard types
- Test each agent's behavior

### Phase 3: Cleanup

**Goal:** Remove old infrastructure and update documentation.

**Scope:**
- Remove `agents/` directory
- Update build system (remove agent copying)
- Update CLAUDE.md and KATA-STYLE.md
- Update any references to old pattern

---

## Technical Considerations

### Prompt Structure

Agent instructions will be wrapped and combined with task-specific content:

```xml
<agent-instructions>
[Role, philosophy, detailed instructions from resource file]
</agent-instructions>

<context>
[Project context, @-references resolved by skill]
</context>

<task>
[Specific task for this invocation]
</task>
```

### Tool Restrictions

Current agent frontmatter includes tool restrictions:
```yaml
tools: Read, Write, Bash, Glob, Grep
```

**Options:**
1. Move tool restrictions to skill-level logic
2. Include tool guidance in instructions (agents honor instructions)
3. Accept that general-purpose has all tools (rely on instruction following)

**Recommendation:** Option 2 for POC. Agents follow their instructions about which tools to use.

### Model Selection

Current: Model specified in Task() call based on config.json model_profile.

**No change needed.** Model selection stays in orchestrator logic.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Prompt too long after inlining | Context budget exceeded | Keep instructions concise; progressive disclosure |
| Behavior changes | Agents don't work as expected | Side-by-side testing during POC |
| Missing context | Agents lack needed information | Ensure @-references resolved before inlining |
| Tool restrictions ignored | Agents use wrong tools | Include explicit tool guidance in instructions |
| Build system breaks | Plugin doesn't work | Feature branch for safe experimentation |

---

## Portability Benefits

After migration, Kata works on any platform that supports:

1. **Agent Skills spec** — SKILL.md format for skill definitions
2. **Standard subagent spawning** — general-purpose, Explore, or similar
3. **Task tool or equivalent** — For spawning subagents with prompts

No custom agent type registration required. No platform-specific agent lookup.

---

## Open Questions

1. **Prompt size:** Will inlined instructions fit within context budget? (Test in POC)
2. **Tool restrictions:** Best approach for enforcing tool limits without frontmatter? (Test option 2 in POC)
3. **Resource location:** Should each skill have its own agent instructions, or centralized? (Decide during POC)

---

## Ready for Requirements

Research complete. Scope is clear:

**Must have:**
- Deprecate custom subagent types
- Move agent instructions to skill resources
- Inline instructions into Task prompts
- Use only standard subagent types
- Identical behavior after migration

**Phased approach:**
- POC first (2 agents) with go/no-go gate
- Full conversion if POC succeeds
- Cleanup and documentation

**Experimental nature:** Working on `feat/skills-subagents` branch. Merge if successful.

---
*Research updated: 2026-02-04*
