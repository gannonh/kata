---
name: kata:todo-check
description: Review pending todos with action options
argument-hint: ""
allowed-tools: [Read, Task, AskUserQuestion]
disable-model-invocation: true
---

<objective>
Review pending todos by delegating to kata-managing-todos skill.

**When to use:** When you want to see what todos are pending and take action on them.
**Output:** Todo list with action options (plan, complete, defer, delete)
</objective>

<execution_context>
@~/.claude/skills/kata-managing-todos/SKILL.md
</execution_context>

<context>
Operation: CHECK

No arguments required - skill will list all pending todos.
</context>

<process>
## Step 1: Validate Environment

Check for Kata project structure:

```bash
ls .planning/todos/pending/ 2>/dev/null
```

If not found, no todos exist.

## Step 2: Delegate to Skill

Invoke kata-managing-todos skill with operation="check":

```
Use kata-managing-todos skill to check todos
```

The skill will:
1. Read all todos from `.planning/todos/pending/`
2. Group by area
3. Present list with metadata
4. Offer action options via AskUserQuestion
5. Execute selected actions
6. Update STATE.md

## Step 3: Pass Through Results

Return the skill's output directly to user without modification.
</process>

<success_criteria>
- [ ] kata-managing-todos skill invoked
- [ ] Skill results passed through to user
- [ ] No additional processing or modification
</success_criteria>
