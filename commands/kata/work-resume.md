---
name: kata:work-resume
description: Resume work from saved state in STATE.md
argument-hint: ""
allowed-tools: [Read, Task]
disable-model-invocation: true
---

<objective>
Resume work from previous session using saved context by delegating to kata-providing-progress-and-status-updates skill.

**When to use:** When you want to continue from where you left off.
**Output:** Resume context and next action instructions
</objective>

<execution_context>
@~/.claude/skills/kata-providing-progress-and-status-updates/SKILL.md
</execution_context>

<context>
Operation: RESUME

No arguments required - skill will read resume point from STATE.md.
</context>

<process>
## Step 1: Validate Environment

Check for Kata project structure:

```bash
ls .planning/ 2>/dev/null
```

If not found, this is not a Kata project.

## Step 2: Delegate to Skill

Invoke kata-providing-progress-and-status-updates skill with operation="resume":

```
Use kata-providing-progress-and-status-updates skill to resume work
```

The skill will:
1. Read STATE.md resume context
2. Load relevant planning files
3. Present current position
4. Recommend next action
5. Update STATE.md with resume timestamp

## Step 3: Pass Through Results

Return the skill's output directly to user without modification.
</process>

<success_criteria>
- [ ] kata-providing-progress-and-status-updates skill invoked
- [ ] Skill results passed through to user
- [ ] No additional processing or modification
</success_criteria>
