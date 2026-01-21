---
name: kata:whats-new
description: Show changelog entries since installed version
argument-hint: ""
disable-model-invocation: true
---

<objective>
Show changelog entries since installed version by delegating to the kata-updating-to-latest-version skill.

**When to use:** When you want to see what's changed in Kata since your installed version.
**Output:** Formatted changelog entries from your version to latest
</objective>

<execution_context>
@~/.claude/skills/kata-updating-to-latest-version/SKILL.md
</execution_context>

<process>
## Step 1: Delegate to Skill

Invoke kata-updating-to-latest-version skill with WHATS_NEW intent:

```
Use kata-updating-to-latest-version skill to show what's new
```

The skill will:
1. Detect current installed version
2. Parse CHANGELOG.md
3. Extract entries since your version
4. Format and display release notes
5. Suggest /kata:update if behind

## Step 2: Pass Through Results

Return the skill's output directly to user without modification.
</process>

<success_criteria>
- [ ] kata-updating-to-latest-version skill invoked with WHATS_NEW intent
- [ ] Skill results passed through to user
- [ ] No additional processing or modification
</success_criteria>
