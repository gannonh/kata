---
name: kata:update
description: Check for Kata updates and show installation command if newer version available
argument-hint: ""
disable-model-invocation: true
---

<objective>
Check for Kata updates and guide installation by delegating to the kata-updating-to-latest-version skill.

**When to use:** When you want to check if a newer version of Kata is available and get update instructions.
**Output:** Version comparison and installation command if update available
</objective>

<execution_context>
@~/.claude/skills/kata-updating-to-latest-version/SKILL.md
</execution_context>

<process>
## Step 1: Delegate to Skill

Invoke kata-updating-to-latest-version skill with UPDATE intent:

```
Use kata-updating-to-latest-version skill to check for updates
```

The skill will:
1. Detect current installed version
2. Check npm registry for latest version
3. Compare versions using semver
4. Show installation command if newer version available
5. Display brief changelog of what's new

## Step 2: Pass Through Results

Return the skill's output directly to user without modification.
</process>

<success_criteria>
- [ ] kata-updating-to-latest-version skill invoked with UPDATE intent
- [ ] Skill results passed through to user
- [ ] No additional processing or modification
</success_criteria>
