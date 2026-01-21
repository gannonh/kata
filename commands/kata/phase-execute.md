---
name: kata:phase-execute
description: Execute all plans in a phase with wave-based parallelization
argument-hint: "<phase-number>"
allowed-tools: [Read, Task]
disable-model-invocation: true
---

<objective>
Execute all plans in a phase by delegating to the kata-executing-project-phases skill.

**When to use:** When you need to execute phase plans, handle checkpoints, or build features.
**Output:** Completed work, SUMMARY.md files, and updated STATE.md
</objective>

<execution_context>
@~/.claude/skills/kata-executing-project-phases/SKILL.md
</execution_context>

<context>
Phase number: $ARGUMENTS

If no phase specified, kata-executing-project-phases will use current phase from STATE.md.
</context>

<process>
## Step 1: Validate Environment

Check for Kata project structure:

```bash
ls .planning/ 2>/dev/null
```

If not found, this is not a Kata project.

## Step 2: Delegate to Skill

Invoke kata-executing-project-phases skill with phase number from $ARGUMENTS:

```
Use kata-executing-project-phases skill to execute phase $ARGUMENTS
```

The skill will:
1. Validate phase exists and has plans
2. Group plans by wave
3. Spawn kata-executor sub-agents in parallel
4. Handle checkpoint returns
5. Verify phase goal achievement
6. Update STATE.md and ROADMAP.md
7. Present results

## Step 3: Pass Through Results

Return the skill's output directly to user without modification.
</process>

<success_criteria>
- [ ] kata-executing-project-phases skill invoked
- [ ] Skill results passed through to user
- [ ] No additional processing or modification
</success_criteria>
