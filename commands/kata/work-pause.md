---
name: kata:work-pause
description: Pause current work and save resume point to STATE.md
argument-hint: ""
allowed-tools: [Read, Task]
disable-model-invocation: true
---

<objective>
Pause current work session and save context for later resumption by delegating to kata-providing-progress-and-status-updates skill.

**When to use:** When you need to stop work temporarily and want to resume later.
**Output:** Updated STATE.md with pause context and resume instructions
</objective>

<execution_context>
@~/.claude/skills/kata-providing-progress-and-status-updates/SKILL.md
</execution_context>

<context>
Operation: PAUSE

No arguments required - skill will detect current position from STATE.md.
</context>

<process>
## Step 1: Validate Environment

Check for Kata project structure:

```bash
ls .planning/ 2>/dev/null
```

If not found, this is not a Kata project.

## Step 2: Delegate to Skill

Invoke kata-providing-progress-and-status-updates skill with operation="pause":

```
Use kata-providing-progress-and-status-updates skill to pause work
```

The skill will:
1. Read current STATE.md
2. Capture current position and context
3. Create resume instructions
4. Update STATE.md with pause details
5. Present confirmation

## Step 3: Pass Through Results

Return the skill's output directly to user without modification.
</process>

<success_criteria>
- [ ] kata-providing-progress-and-status-updates skill invoked
- [ ] Skill results passed through to user
- [ ] No additional processing or modification
</success_criteria>
