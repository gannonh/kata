---
name: kata:codebase-map
description: Analyze codebase structure and create documentation in .planning/codebase/
argument-hint: ""
allowed-tools: [Read, Task]
disable-model-invocation: true
---

<objective>
Analyze codebase structure and generate documentation by delegating to kata-providing-progress-and-status-updates skill.

**When to use:** When you need to understand code structure or create architecture documentation.
**Output:** Documentation in `.planning/codebase/` directory
</objective>

<execution_context>
@~/.claude/skills/kata-providing-progress-and-status-updates/SKILL.md
</execution_context>

<context>
Operation: MAP-CODEBASE

No arguments required - skill will analyze current codebase.
</context>

<process>
## Step 1: Validate Environment

Check for Kata project structure:

```bash
ls .planning/ 2>/dev/null
```

If not found, this is not a Kata project.

## Step 2: Delegate to Skill

Invoke kata-providing-progress-and-status-updates skill with operation="map-codebase":

```
Use kata-providing-progress-and-status-updates skill to map the codebase
```

The skill will:
1. Spawn kata-codebase-mapper sub-agent
2. Analyze directory structure
3. Identify key files and patterns
4. Create documentation in `.planning/codebase/`
5. Present summary

## Step 3: Pass Through Results

Return the skill's output directly to user without modification.
</process>

<success_criteria>
- [ ] kata-providing-progress-and-status-updates skill invoked
- [ ] Skill results passed through to user
- [ ] No additional processing or modification
</success_criteria>
