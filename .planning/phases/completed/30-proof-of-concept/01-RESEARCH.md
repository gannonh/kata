# Phase 1: Proof of Concept - Research

**Researched:** 2026-02-05
**Domain:** Custom subagent → standard subagent migration (kata-planner, kata-executor)
**Confidence:** HIGH

## Summary

This phase converts two custom subagents (kata-planner, kata-executor) to the "skill resource + general-purpose subagent" pattern. The migration moves agent instruction content from `agents/kata-*.md` files into `skills/*/references/*-instructions.md` files. Orchestrator skills then read those instruction files, inline them into the Task prompt wrapped in `<agent-instructions>` tags, and spawn `general-purpose` subagents instead of custom ones.

The architecture does NOT change how orchestrators work. Skills remain orchestrators. They still spawn subagents via Task(). The only change is: instructions move from implicit system prompt (custom agent lookup) to explicit prompt content (inlined from skill resource). Model selection stays in orchestrator logic. Context inlining stays in orchestrator logic. Structured return contracts stay in agent instructions.

**Primary recommendation:** Extract agent body content (everything after frontmatter) into skill reference files. Update Task() calls to inline instructions and switch subagent_type. Do not restructure the instructions themselves.

## Standard Stack

This migration is a Kata-internal refactoring. No new libraries or tools needed.

### Core

| Component | Current | Target | Purpose |
| --- | --- | --- | --- |
| `agents/kata-planner.md` | Custom subagent definition | Deleted (content moved) | Planner instructions |
| `agents/kata-executor.md` | Custom subagent definition | Deleted (content moved) | Executor instructions |
| `skills/kata-plan-phase/references/planner-instructions.md` | Does not exist | New file | Planner instructions as skill resource |
| `skills/kata-execute-phase/references/executor-instructions.md` | Does not exist | New file | Executor instructions as skill resource |
| `skills/kata-plan-phase/SKILL.md` | Uses `subagent_type="kata-planner"` | Uses `subagent_type="general-purpose"` | Orchestrator |
| `skills/kata-execute-phase/SKILL.md` | Uses `subagent_type="kata-executor"` | Uses `subagent_type="general-purpose"` | Orchestrator |

### What Does NOT Change

| Component | Reason |
| --- | --- |
| Model selection logic | Stays in orchestrator, passed via `model=` parameter |
| Context inlining pattern | Orchestrators already read files and inline content into Task prompts |
| Structured return contracts | Kept in agent instructions verbatim |
| Wave execution pattern | No change to phase-execute.md reference |
| Build system `transformPluginPaths()` | Still needed for remaining agents (Phase 2 scope) |

## Architecture Patterns

### Current Architecture (Custom Subagent)

```
kata-plan-phase SKILL.md (orchestrator)
  │
  ├── Reads context files (STATE.md, ROADMAP.md, etc.)
  ├── Constructs planning_context prompt
  │
  └── Task(
        prompt=planning_context,
        subagent_type="kata-planner",    ← Claude Code looks up agents/kata-planner.md
        model="{planner_model}"            and uses its body as system prompt
      )
```

Claude Code handles two things for the subagent:
1. System prompt = body content of `agents/kata-planner.md`
2. Task prompt = the `prompt` parameter content from the skill

### Target Architecture (Inlined Instructions)

```
kata-plan-phase SKILL.md (orchestrator)
  │
  ├── Reads context files (STATE.md, ROADMAP.md, etc.)
  ├── Reads references/planner-instructions.md           ← NEW
  ├── Constructs combined prompt with instructions + context
  │
  └── Task(
        prompt="<agent-instructions>{instructions}</agent-instructions>
               <planning_context>{context}</planning_context>
               <downstream_consumer>...</downstream_consumer>
               <quality_gate>...</quality_gate>",
        subagent_type="general-purpose",                  ← CHANGED
        model="{planner_model}"
      )
```

The general-purpose subagent receives the full instructions via prompt content instead of system prompt. The subagent follows the instructions because they're in the prompt.

### Key Pattern: Instruction Wrapping

When inlining instructions into Task prompts, wrap in `<agent-instructions>` tags:

```xml
<agent-instructions>
[Full contents of references/planner-instructions.md]
</agent-instructions>

<planning_context>
[Task-specific context that was already being inlined]
</planning_context>
```

This separation allows the subagent to distinguish its persistent role/behavior instructions from the per-invocation task context.

### Anti-Patterns to Avoid

- **Do NOT use `context: fork` on orchestrator skills.** Subagents cannot spawn other subagents. Orchestrator skills must stay inline.
- **Do NOT restructure agent instructions during migration.** The goal is behavior equivalence, not improvement. Copy content verbatim.
- **Do NOT move tool restrictions to a different mechanism.** General-purpose subagents inherit all tools. Agent instructions already contain guidance about which tools to use. This is sufficient for POC validation.
- **Do NOT change the prompt structure beyond wrapping.** The existing planning_context, downstream_consumer, and quality_gate sections stay as-is.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Custom subagent registration | Plugin agent definitions | `general-purpose` subagent + inlined instructions | Portability across Agent Skills platforms |
| Tool restriction enforcement | Permission hooks or skill-level logic | Instruction-based guidance (agent follows instructions about tools) | POC should validate simplest approach first |
| Model selection per agent | Static model field in skill | Keep in orchestrator logic with `model=` param | Dynamic model profiles already work |

## Common Pitfalls

### Pitfall 1: Frontmatter Leakage into Instructions

**What goes wrong:** Copying the entire agent file (including frontmatter) into the instructions resource instead of just the body content.

**Why it happens:** Agent files have YAML frontmatter (name, description, tools, color) followed by markdown body. Only the body content contains the actual instructions.

**How to avoid:** Strip everything between the first `---` and second `---` (the frontmatter block). Copy only content after the closing `---`.

**Warning signs:** Instructions file starts with `---` or contains `tools:`, `color:`, `model:` YAML fields.

### Pitfall 2: Missing Context in Prompt Assembly

**What goes wrong:** The orchestrator inlines instructions but forgets to also inline the task-specific context that was previously in the prompt parameter.

**Why it happens:** In the current pattern, the orchestrator constructs a prompt with planning_context (state, roadmap, requirements, etc.). When adding agent-instructions, the existing prompt content must be preserved alongside the new instructions.

**How to avoid:** The instruction file content gets ADDED to the prompt, not REPLACING it. The final prompt structure is: `<agent-instructions>` + existing prompt sections.

**Warning signs:** Subagent asks for information that should have been provided. Output lacks project context.

### Pitfall 3: Build System Test Regression

**What goes wrong:** The `artifact-validation.test.js` test for "all Kata subagent_type attributes have kata: prefix" fails because the new `subagent_type="general-purpose"` is treated as an untransformed Kata agent.

**Why it happens:** The test checks for `subagent_type="kata-*"` without `kata:` prefix. After migration, we introduce `subagent_type="general-purpose"` which starts with a different prefix and should be allowed.

**How to avoid:** The existing test already handles this correctly. It only flags values starting with `kata-` (line 145 of artifact-validation.test.js: `if (value.startsWith('kata-') && !value.startsWith('kata:kata-'))`). The value `"general-purpose"` does not start with `kata-` and passes validation.

**Warning signs:** CI tests fail after migration.

### Pitfall 4: kata-execute-phase Has Multiple Reference Files

**What goes wrong:** The executor SKILL.md references several files under `references/` (phase-execute.md, execute-plan.md, checkpoints.md, etc.) that also contain `subagent_type="kata-executor"`. These references get stale if not updated.

**Why it happens:** The executor orchestrator has richer reference documentation than the planner. Files like `phase-execute.md` (line 318, 357), `execute-plan.md` (line 240, 392), and the SKILL.md `<wave_execution>` section (lines 671-673) all reference the executor by custom subagent_type.

**How to avoid:** Update ALL occurrences of `subagent_type="kata-executor"` across the skill's reference files too. Grep for the pattern in the entire `skills/kata-execute-phase/` directory.

**Warning signs:** Build test shows untransformed subagent_type references in built artifacts.

### Pitfall 5: Structured Return Parsing Breaks

**What goes wrong:** After switching to general-purpose subagent, the agent does not follow the structured return format (`## PLANNING COMPLETE`, `## CHECKPOINT REACHED`), and the orchestrator cannot parse the response.

**Why it happens:** Custom subagents receive their agent file as a system prompt that shapes behavior across the entire session. General-purpose subagents receive instructions only via the task prompt. The agent may not weight prompt instructions as strongly as system prompt instructions.

**How to avoid:** Include the `<structured_returns>` section in the instructions file. Test that the subagent produces parseable output. This is the core POC validation question.

**Warning signs:** Orchestrator displays raw agent output. "Next Up" sections never appear. State files not updated.

### Pitfall 6: Revision Mode Context

**What goes wrong:** The planner is spawned in multiple modes (standard, gap closure, revision). Each mode inlines different context. When instructions are inlined alongside mode-specific context, the prompt must preserve all modes.

**Why it happens:** The kata-plan-phase SKILL.md spawns the planner in step 8 (standard), step 12 (revision), and potentially gap closure mode. Each has a different prompt structure. All three must include the instructions.

**How to avoid:** Every Task() call that spawns the planner must include the `<agent-instructions>` wrapper. There are at least two planner Task() calls in kata-plan-phase SKILL.md (lines 400-406 and 528-536).

## Code Examples

### Extract Instructions from Agent File

Given `agents/kata-planner.md`:
```yaml
---
name: kata-planner
description: Creates executable phase plans...
tools: Read, Write, Bash, Glob, Grep, WebFetch, mcp__context7__*
color: green
---

<role>
You are a Kata planner...
</role>

<philosophy>
...
</philosophy>
```

The instructions file `skills/kata-plan-phase/references/planner-instructions.md` contains everything after the closing `---`:

```xml
<role>
You are a Kata planner...
</role>

<philosophy>
...
</philosophy>

[... rest of body content ...]
```

### Updated Task() Call in kata-plan-phase SKILL.md

Before (step 8):
```
Task(
  prompt=filled_prompt,
  subagent_type="kata-planner",
  model="{planner_model}",
  description="Plan Phase {phase}"
)
```

After:
```
Task(
  prompt="<agent-instructions>\n{planner_instructions_content}\n</agent-instructions>\n\n" + filled_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Plan Phase {phase}"
)
```

Where `planner_instructions_content` is the content read from `references/planner-instructions.md` using the Read tool (same pattern already used for inlining STATE.md, ROADMAP.md, etc. in step 7).

### Updated Wave Execution in kata-execute-phase SKILL.md

Before (wave_execution section):
```
Task(prompt="Execute plan at {plan_01_path}\n\n<plan>\n{plan_01_content}\n</plan>\n\n<project_state>\n{state_content}\n</project_state>", subagent_type="kata-executor", model="{executor_model}")
```

After:
```
Task(prompt="<agent-instructions>\n{executor_instructions_content}\n</agent-instructions>\n\nExecute plan at {plan_01_path}\n\n<plan>\n{plan_01_content}\n</plan>\n\n<project_state>\n{state_content}\n</project_state>", subagent_type="general-purpose", model="{executor_model}")
```

### Files to Update in kata-execute-phase

All occurrences across the skill directory:

| File | Lines | Change |
| --- | --- | --- |
| `SKILL.md` | 671-673 | Wave execution Task() calls |
| `references/phase-execute.md` | 318, 357 | Task() examples |
| `references/execute-plan.md` | 240, 392 | Task() documentation |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Custom subagent types | Standard subagent + inlined instructions | This migration (v1.6.0) | Portability across Agent Skills platforms |

**Key context:** Claude Code added `skills` field to subagent frontmatter (preload skills into subagent context). This is an alternative to inlining, but the v1.6.0 requirements specify inlining via `<agent-instructions>` tags, so that is the prescribed approach.

## Open Questions

1. **Prompt size impact**
   - What we know: kata-planner.md body is ~1400 lines. kata-executor.md body is ~780 lines. These get inlined into the Task prompt alongside existing context.
   - What's unclear: Whether the combined prompt (instructions + context) exceeds practical limits for general-purpose subagents.
   - Recommendation: Proceed with full instructions for POC. If prompt is too large, trim in Phase 2 based on POC findings.

2. **System prompt vs task prompt behavioral difference**
   - What we know: Custom subagents receive instructions as system prompt. General-purpose subagents receive instructions as task prompt content.
   - What's unclear: Whether prompt-based instructions produce equivalent behavior to system-prompt-based instructions.
   - Recommendation: This is the core question the POC answers. POC-05 validation will determine if behavior matches.

3. **Revision mode prompt assembly**
   - What we know: Step 12 of kata-plan-phase spawns the planner with a revision prompt that's structurally different from step 8. Both need instructions inlined.
   - What's unclear: Whether the revision prompt structure needs adjustment when agent instructions are inlined.
   - Recommendation: Inline instructions identically for both modes. The agent instructions are mode-agnostic (they contain a `<revision_mode>` section that activates based on prompt content).

## Sources

### Primary (HIGH confidence)
- `agents/kata-planner.md` — 1437 lines, full agent definition reviewed
- `agents/kata-executor.md` — 780 lines, full agent definition reviewed
- `skills/kata-plan-phase/SKILL.md` — 700 lines, all Task() calls identified (lines 234, 402, 474, 532)
- `skills/kata-execute-phase/SKILL.md` — 743 lines, all Task() calls identified (lines 671-673)
- `scripts/build.js` — Build transform logic reviewed (line 160: subagent_type transform)
- `tests/artifact-validation.test.js` — Test behavior confirmed (line 145: kata- prefix check)

### Secondary (HIGH confidence)
- `.planning/research/SUMMARY.md` — Prior milestone research (architecture change documented)
- `.planning/research/PITFALLS.md` — Prior milestone pitfall analysis (13 pitfalls catalogued)
- `.planning/research/STACK.md` — Prior milestone technology stack analysis
- `.planning/REQUIREMENTS.md` — POC requirements (POC-01 through POC-06)

### Tertiary (MEDIUM confidence)
- Claude Code subagent documentation (sub-agents.md loaded via rules) — general-purpose behavior confirmed
- Claude Code skills documentation (skills.md loaded via rules) — skill resource pattern confirmed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Direct codebase analysis of exact files being modified
- Architecture: HIGH — Pattern well-understood from existing codebase + prior research
- Pitfalls: HIGH — Prior research + codebase analysis identified specific line numbers
- Code examples: HIGH — Derived from actual current code

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (stable internal migration, no external dependencies)
