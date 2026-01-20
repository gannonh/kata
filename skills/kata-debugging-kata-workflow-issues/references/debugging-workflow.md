# Kata Workflow Debugging

How to diagnose and fix issues with Kata workflows, commands, and skills.

## Common Kata Issues

### Plan Execution Failures

- Plan won't complete
- Executor gets stuck
- Wrong files modified
- Verification fails unexpectedly

### Skill/Command Issues

- Skill not triggering on expected phrases
- Wrong skill invoked
- Command produces unexpected output
- Sub-agent not spawning correctly

### State/Planning Issues

- STATE.md out of sync
- ROADMAP.md inconsistent with work done
- SUMMARY.md not created
- Phase marked complete but isn't

## Debug Information Gathering

### For Plan Failures

```markdown
<symptoms>
expected: {what the plan should have done}
actual: {what happened instead}
errors: {error messages from execution}
context: "Plan: {plan-id}, Phase: {phase}"
reproduction: "Re-run plan execution"
</symptoms>
```

### For Skill/Command Issues

```markdown
<symptoms>
expected: {expected skill to trigger}
actual: {what actually happened}
errors: {any error messages}
context: "Skill: {skill-name}, Trigger: {user phrase}"
reproduction: {exact phrase that should trigger}
</symptoms>
```

### For State Issues

```markdown
<symptoms>
expected: {what state files should show}
actual: {what they actually show}
errors: none
context: "Phase: {phase}, Last action: {what was done}"
reproduction: "Check STATE.md, ROADMAP.md"
</symptoms>
```

## Issue Diagnosis Approach

### Scientific Method

1. Form specific, falsifiable hypothesis
2. Design test to confirm or eliminate
3. Execute test, observe result
4. Update hypothesis based on evidence
5. Repeat until root cause confirmed

### Investigation Techniques

**Binary search:** Cut problem space in half
- Did the skill load? Check `ls ~/.claude/skills/kata-*`
- Is frontmatter valid? Check SKILL.md format

**Trace execution:** Follow the flow
- What loaded? What triggered? Where did it diverge?

**Compare working vs broken:** What's different?
- Similar skill works? Compare descriptions and triggers

### Evidence Quality

**Strong evidence:**
- Directly observable ("ls shows skill missing")
- Repeatable ("same phrase never triggers")
- Unambiguous ("frontmatter has syntax error")

**Weak evidence:**
- Hearsay ("I think it worked before")
- Non-repeatable ("triggered once randomly")
- Ambiguous ("something seems off")

## Debug File Protocol

Create persistent state in `.planning/debug/`:

```markdown
---
status: gathering | investigating | fixing | verifying | resolved
trigger: "[verbatim issue description]"
scope: kata_workflow
created: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Focus
<!-- OVERWRITE on each update -->

hypothesis: [current theory]
test: [how testing it]
expecting: [what result means]
next_action: [immediate next step]

## Symptoms
<!-- IMMUTABLE after gathering -->

expected: [what should happen]
actual: [what actually happens]
errors: [error messages]
context: [which kata component]
reproduction: [how to trigger]

## Eliminated
<!-- APPEND only -->

- hypothesis: [theory that was wrong]
  evidence: [what disproved it]

## Evidence
<!-- APPEND only -->

- timestamp: [when]
  checked: [what examined]
  found: [what observed]
  implication: [what this means]

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: [empty until found]
fix: [empty until applied]
verification: [empty until verified]
files_changed: []
```

## Root Cause Output Format

When root cause is found:

```markdown
## ROOT CAUSE FOUND

**Debug Session:** .planning/debug/{slug}.md

**Root Cause:** {specific cause with evidence}

**Evidence Summary:**
- {key finding 1}
- {key finding 2}

**Files Involved:**
- {file1}: {what's wrong}

**Suggested Fix Direction:** {brief hint, not implementation}
```

For inconclusive investigation:

```markdown
## INVESTIGATION INCONCLUSIVE

**Debug Session:** .planning/debug/{slug}.md

**What Was Checked:**
- {area 1}: {finding}

**Hypotheses Eliminated:**
- {hypothesis}: {why eliminated}

**Remaining Possibilities:**
- {possibility 1}

**Recommendation:** Manual review needed
```

## Common Root Causes

### Skill Not Triggering

- Description missing key trigger words
- Trigger words too generic (collision with built-in)
- Skill not installed (check `ls ~/.claude/skills/`)
- SKILL.md frontmatter syntax error

### Plan Execution Stuck

- Task too large for context window
- Circular dependency in plan
- Missing prerequisite file
- Verification command fails silently

### State Inconsistency

- Plan completed but SUMMARY.md not written
- ROADMAP.md not updated after plan
- STATE.md position doesn't match actual progress
- Multiple sessions edited same files

## Fix Recommendation Format

When root cause is found:

```markdown
**Fix Direction:**

1. {Primary change needed}
2. {Supporting change if any}

**Files to modify:**
- {file}: {what to change}

**Verification:**
- {How to confirm fix works}
```

Document fix direction, then implement.
