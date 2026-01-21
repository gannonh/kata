---
name: kata:work-verify
description: Verify built work against plan goals using goal-backward verification
argument-hint: "[phase-number]"
allowed-tools: [Read, Task]
disable-model-invocation: true
---

<objective>
Verify built work against plan goals by delegating to the kata-verifying-work-outcomes-and-user-acceptance-testing skill.

**When to use:** When you need to verify phase completion, check goals, or run UAT.
**Output:** Verification report with pass/fail status and gap diagnosis
</objective>

<execution_context>
@~/.claude/skills/kata-verifying-work-outcomes-and-user-acceptance-testing/SKILL.md
</execution_context>

<context>
Phase number: $ARGUMENTS

If no phase specified, kata-verifying-work-outcomes-and-user-acceptance-testing will detect most recently executed phase.
</context>

<process>
## Step 1: Validate Environment

Check for Kata project structure:

```bash
ls .planning/ 2>/dev/null
```

If not found, this is not a Kata project.

## Step 2: Delegate to Skill

Invoke kata-verifying-work-outcomes-and-user-acceptance-testing skill with mode="verify":

```
Use kata-verifying-work-outcomes-and-user-acceptance-testing skill to verify phase $ARGUMENTS
```

The skill will:
1. Determine verification mode (goal-backward or UAT)
2. Spawn kata-verifier to check must_haves
3. If gaps found, spawn kata-debugger for diagnosis
4. Present results with gap analysis
5. Offer fix planning if needed

## Step 3: Pass Through Results

Return the skill's output directly to user without modification.
</process>

<success_criteria>
- [ ] kata-verifying-work-outcomes-and-user-acceptance-testing skill invoked
- [ ] Skill results passed through to user
- [ ] No additional processing or modification
</success_criteria>
