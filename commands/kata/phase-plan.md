---
name: kata:phase-plan
description: Create PLAN.md files for a phase with task breakdown and dependency analysis
argument-hint: "<phase-number>"
allowed-tools: [Read, Task]
disable-model-invocation: true
---

<objective>
Create executable PLAN.md files for a phase by delegating to the kata-planning-phases skill.

**When to use:** When you need to plan a phase, create task breakdown, or prepare for execution.
**Output:** One or more PLAN.md files in `.planning/phases/XX-name/` directory
</objective>

<execution_context>
@~/.claude/skills/kata-planning-phases/SKILL.md
</execution_context>

<context>
Phase number: $ARGUMENTS

If no phase specified, kata-planning-phases will detect the next unplanned phase from ROADMAP.md.
</context>

<process>
## Step 1: Validate Environment

Check for Kata project structure:

```bash
ls .planning/ 2>/dev/null
```

If not found, user should run `/kata:new-project` first.

## Step 2: Delegate to Skill

Invoke kata-planning-phases skill with phase number from $ARGUMENTS:

```
Use kata-planning-phases skill to plan phase $ARGUMENTS
```

The skill will:
1. Validate phase exists in ROADMAP.md
2. Research domain (if needed)
3. Create PLAN.md files with task breakdown
4. Verify plans meet criteria
5. Present results with next action

## Step 3: Pass Through Results

Return the skill's output directly to user without modification.
</process>

<success_criteria>
- [ ] kata-planning-phases skill invoked
- [ ] Skill results passed through to user
- [ ] No additional processing or modification
</success_criteria>
