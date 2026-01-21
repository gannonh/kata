---
name: kata-debugging-kata-workflow-issues
description: Use this skill when Kata workflows fail or get stuck. Triggers include "plan failed", "execution stuck", "kata error", "phase not working", "workflow issue", "kata broken", "plan won't complete", "executor failed", and "why did the plan fail". This skill spawns kata-debugger to investigate Kata-specific issues using scientific method. NOT for debugging your project code - this debugs Kata itself.
user-invocable: false
---

# Kata Workflow Debugging

Systematic debugging of Kata workflow issues with persistent state across context resets.

## When to Use

- A Kata plan failed or won't complete
- Execution got stuck or produced unexpected results
- A phase workflow isn't working correctly
- Kata commands or skills aren't behaving as expected

## When NOT to Use

- Debugging your project's code (use general debugging tools)
- Investigating application bugs unrelated to Kata
- Performance issues in your application

## Operation Detection

| Trigger Keywords                                                                                                                                                                                                      | Operation  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| "plan failed", "execution stuck", "kata error", "phase not working", "workflow issue", "kata broken", "plan won't complete", "executor failed", "why did the plan fail", "kata isn't working", "skill not triggering" | DEBUG-KATA |

## DEBUG-KATA Operation

### Step 1: Check Active Debug Sessions

```bash
ls .planning/debug/*.md 2>/dev/null | grep -v resolved | head -5
```

If active sessions exist AND no issue specified:
- Display sessions with status, hypothesis, next action
- Wait for user to select session or describe new issue

### Step 2: Gather Symptoms (if new issue)

Collect from user:
1. **Expected behavior** - What should Kata have done?
2. **Actual behavior** - What happened instead?
3. **Error messages** - Any errors from Kata?
4. **Context** - Which command/skill/plan was running?
5. **Reproduction** - How to trigger it?

### Step 3: Spawn kata-debugger

```
Task(
  prompt=debug_prompt,
  subagent_type="kata-debugger",
  description="Debug Kata: {slug}"
)
```

Debug prompt:
```markdown
<objective>
Investigate Kata workflow issue: {slug}

**Summary:** {trigger}
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
context: {context}
reproduction: {reproduction}
</symptoms>

<mode>
symptoms_prefilled: true
goal: find_and_fix
scope: kata_workflow
</mode>

<debug_file>
Create: .planning/debug/{slug}.md
</debug_file>
```

### Step 4: Handle Agent Return

**If `## ROOT CAUSE FOUND`:**
- Display root cause and evidence
- Offer: "Fix now", "Plan fix", "Manual fix"

**If `## CHECKPOINT REACHED`:**
- Present checkpoint to user
- Get response, spawn continuation agent

**If `## INVESTIGATION INCONCLUSIVE`:**
- Show what was checked
- Offer: "Continue investigating", "Manual investigation", "Add more context"

### Step 5: Spawn Continuation (After Checkpoint)

```markdown
<objective>
Continue debugging Kata issue {slug}. Evidence is in debug file.
</objective>

<prior_state>
Debug file: @.planning/debug/{slug}.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>

<mode>
goal: find_and_fix
scope: kata_workflow
</mode>
```

## Key References

- **Debugging workflow:** See `./references/debugging-workflow.md`

## Sub-Agent Summary

| Agent         | Purpose                                      | When Spawned         |
| ------------- | -------------------------------------------- | -------------------- |
| kata-debugger | Investigate Kata bugs with scientific method | DEBUG-KATA operation |

## Quality Standards

- [ ] Issue correctly identified as Kata workflow problem
- [ ] kata-debugger spawned with full context
- [ ] Checkpoints handled correctly
- [ ] Debug state preserved in .planning/debug/
- [ ] Clear resolution path offered to user
