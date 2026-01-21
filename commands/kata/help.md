---
name: kata:help
description: Show available Kata commands and usage guide
argument-hint: "[command-name]"
disable-model-invocation: true
---

<objective>
Show available Kata commands and usage guide by delegating to the kata-showing-available-commands-and-usage-guides skill.

**When to use:** When you need to see what commands are available, or get detailed help on a specific command.
**Output:** Command reference with categories and usage examples
</objective>

<execution_context>
@~/.claude/skills/kata-showing-available-commands-and-usage-guides/SKILL.md
</execution_context>

<context>
Command name (optional): $ARGUMENTS

If command name provided, show detailed help for that specific command.
If no argument, show full command list organized by category.
</context>

<process>
## Step 1: Delegate to Skill

Invoke kata-showing-available-commands-and-usage-guides skill:

```
Use kata-showing-available-commands-and-usage-guides skill to show help for: $ARGUMENTS
```

If no command specified, the skill will show the full command reference.

The skill will:
1. Parse command argument if provided
2. Route to appropriate help context (list, specific, guide, or features)
3. Display formatted command reference
4. Suggest next actions

## Step 2: Pass Through Results

Return the skill's output directly to user without modification.
</process>

<success_criteria>
- [ ] kata-showing-available-commands-and-usage-guides skill invoked
- [ ] Skill results passed through to user
- [ ] No additional processing or modification
</success_criteria>
