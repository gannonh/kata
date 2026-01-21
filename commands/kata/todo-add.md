---
name: kata:todo-add
description: Capture a todo item with area inference and duplicate detection
argument-hint: "<todo-description>"
allowed-tools: [Read, Task, AskUserQuestion]
disable-model-invocation: true
---

<objective>
Capture a todo item by delegating to kata-managing-todos skill.

**When to use:** When you need to capture ideas, track work items, or note tasks for later.
**Output:** Todo markdown file in `.planning/todos/pending/` with updated STATE.md count
</objective>

<execution_context>
@~/.claude/skills/kata-managing-todos/SKILL.md
</execution_context>

<context>
Todo description: $ARGUMENTS

If no description provided, skill will use AskUserQuestion to get details.
</context>

<process>
## Step 1: Validate Environment

Check for Kata project structure:

```bash
ls .planning/ 2>/dev/null
```

If not found, skill will create necessary directories.

## Step 2: Delegate to Skill

Invoke kata-managing-todos skill with operation="add":

```
Use kata-managing-todos skill to add todo: $ARGUMENTS
```

The skill will:
1. Parse or prompt for todo description
2. Infer area from context (planning, execution, testing, etc.)
3. Check for duplicates
4. Create markdown file in `.planning/todos/pending/`
5. Update STATE.md todo count
6. Present confirmation

## Step 3: Pass Through Results

Return the skill's output directly to user without modification.
</process>

<success_criteria>
- [ ] kata-managing-todos skill invoked
- [ ] Skill results passed through to user
- [ ] No additional processing or modification
</success_criteria>
