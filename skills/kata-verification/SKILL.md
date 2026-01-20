---
name: kata-verification
description: Use this skill when verifying, validating or confirming work against plans, checking phase completion, running goal-backward verification, running user acceptance testing, debugging issues, or diagnosing failures. Triggers include "verify work", "verify the phase", "check phase", "goal verification", "run kata uat", "kata uat", "kata acceptance test", "walk through deliverables", "debug", "diagnose issues", and "did it work". For UAT mode use "run kata uat" or "kata acceptance test" (not just "test" which runs the test suite). This skill orchestrates verification and debugging sub-agents.
---

# Work Verification Orchestrator

Validates built features through goal-backward verification and conversational UAT testing.

## When to Use

- User asks to "verify phase N" or "check if phase worked"
- User wants to run acceptance testing on completed work
- User needs to diagnose issues found during testing
- User asks "did it work?" after execution

## Workflow Overview

```
1. Determine verification mode (goal-backward vs UAT)
2. For goal-backward: spawn kata-verifier to check must_haves
3. For UAT: load SUMMARY.md files, present tests one at a time
4. If gaps found: spawn kata-debugger for diagnosis
5. If gaps diagnosed: offer fix planning
6. Present results
```

## Execution Flow

### Step 1: Validate Environment

Check for Kata project structure:

```bash
ls .planning/ 2>/dev/null
```

If not found, this is not a Kata project.

### Step 2: Parse Context

Extract from user request:
- Phase number (integer or decimal like `2.1`)
- Verification type (goal-backward vs UAT)
- Existing verification state

**If no phase specified:** Detect most recently executed phase.

**Check for active sessions:**

```bash
# Check for active UAT sessions
find .planning/phases -name "*-UAT.md" -type f 2>/dev/null | head -5

# Check for existing VERIFICATION.md
find .planning/phases -name "*-VERIFICATION.md" -type f 2>/dev/null | head -5
```

### Step 3: Determine Verification Mode

**Goal-backward verification (automated):**
- Checks must_haves from PLAN.md frontmatter
- Verifies truths, artifacts, and key_links
- Creates VERIFICATION.md report
- Fast, programmatic checks

**UAT (User Acceptance Testing):**
- Extracts testable deliverables from SUMMARY.md
- Presents tests one at a time to user
- User confirms pass/fail with natural language
- Creates UAT.md tracking document

**Mode selection:**
- If user says "verify", "check", or "goal verification" -> goal-backward
- If user says "test", "UAT", "acceptance test" -> UAT
- If VERIFICATION.md exists with gaps -> re-verification mode
- If UAT.md exists and incomplete -> resume UAT

### Step 4: Goal-Backward Verification

For automated verification against must_haves:

Display stage banner:
```
KATA > VERIFYING PHASE {X}
Spawning verifier...
```

Find phase directory and must_haves:

```bash
PHASE_DIR=$(ls -d .planning/phases/${PHASE}-* 2>/dev/null | head -1)
grep -l "must_haves:" "$PHASE_DIR"/*-PLAN.md 2>/dev/null
```

Spawn kata-verifier:

```
Task(
  prompt=verification_prompt,
  subagent_type="kata-verifier",
  description="Verify Phase {phase}"
)
```

Verification prompt template:
```markdown
<objective>
Verify Phase {phase_number}: {phase_name} achieved its goal.
Check must_haves: truths (observable), artifacts (exist), key_links (wired).
</objective>

<context>
**Phase directory:** {phase_dir}
**Phase goal:** {goal from ROADMAP.md}

@{phase_dir}/*-PLAN.md
@{phase_dir}/*-SUMMARY.md
@.planning/ROADMAP.md
</context>

<output>
Create: {phase_dir}/{phase}-VERIFICATION.md
Return structured result (passed | gaps_found | human_needed)
</output>
```

**Handle verifier return:**

- **passed:** Present success, offer UAT or next phase
- **gaps_found:** Proceed to diagnosis step
- **human_needed:** Present items requiring manual verification

### Step 5: UAT Workflow

For user acceptance testing:

Display stage banner:
```
KATA > USER ACCEPTANCE TESTING
Loading tests from summaries...
```

**Extract tests from SUMMARY.md files:**

```bash
ls "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null
```

Parse accomplishments and user-facing changes. Create testable scenarios.

**Create UAT.md if not exists:**

```markdown
---
status: testing
phase: XX-name
source: [list of SUMMARY.md files]
started: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Test
number: 1
name: [test name]
expected: |
  [observable behavior]
awaiting: user response

## Tests
### 1. [Test Name]
expected: [observable behavior]
result: [pending]

## Summary
total: [N]
passed: 0
issues: 0
pending: [N]
```

**Present tests one at a time:**

```
CHECKPOINT: Verification Required

**Test {N}: {name}**

{expected behavior}

-> Type "pass" or describe what's wrong
```

**Process responses:**
- "yes", "y", "pass", "next" -> mark passed
- "skip", "n/a" -> mark skipped
- Anything else -> mark as issue (infer severity)

**Severity inference:**
| User says                   | Infer    |
| --------------------------- | -------- |
| "crashes", "error", "fails" | blocker  |
| "doesn't work", "wrong"     | major    |
| "works but...", "slow"      | minor    |
| "color", "spacing"          | cosmetic |

**On completion:**
- Commit UAT.md
- If issues found -> proceed to diagnosis
- If all pass -> present success

### Step 6: Diagnosis (When Gaps Found)

If verification or UAT found issues:

Display:
```
KATA > DIAGNOSING ISSUES
Spawning debug agents...
```

For each gap/issue, spawn kata-debugger:

```
Task(
  prompt=debug_prompt,
  subagent_type="kata-debugger",
  description="Debug: {issue_summary}"
)
```

Debug prompt template:
```markdown
<objective>
Investigate issue: {issue_slug}
**Summary:** {issue_description}
</objective>

<symptoms>
expected: {what should happen}
actual: {what happens instead}
errors: {error messages if any}
</symptoms>

<mode>
symptoms_prefilled: true
goal: find_root_cause_only
</mode>

<debug_file>
Create: .planning/debug/{slug}.md
</debug_file>
```

**Handle debugger return:**

- **ROOT CAUSE FOUND:** Add to gap diagnosis
- **INVESTIGATION INCONCLUSIVE:** Note for manual review

### Step 7: Offer Gap Closure

After diagnosis, offer fix planning:

```
KATA > GAPS DIAGNOSED

{N} gap(s) found, {M} root cause(s) identified

| Gap       | Root Cause | Status       |
| --------- | ---------- | ------------ |
| {truth 1} | {cause}    | diagnosed    |
| {truth 2} | {cause}    | needs review |

## Next Up

**Plan fixes** - create fix plans for diagnosed gaps

/kata:plan-phase {X} --gaps

Or manually review remaining issues before planning.
```

### Step 8: Present Results

**All passed:**
```
KATA > PHASE {X} VERIFIED

**Phase {X}: {Name}**

{N}/{N} checks passed
Goal achieved.

## Next Up

**Execute next phase** or **Run UAT** for user testing

/kata:execute-phase {X+1}
```

**Gaps found and diagnosed:**
```
KATA > PHASE {X} GAPS FOUND

**Phase {X}: {Name}**

{N}/{M} checks passed
{G} gaps diagnosed

| Gap | Root Cause | Fix Direction |
| --- | ---------- | ------------- |
| ... | ...        | ...           |

## Next Up

**Plan fixes**

/kata:plan-phase {X} --gaps
```

## Key References

For detailed guidance on specific aspects:

- **Goal-backward methodology:** See `./references/goal-backward-verification.md`
- **UAT protocol:** See `./references/uat-protocol.md`
- **Debugging workflow:** See `./references/debugging-workflow.md`

## Quality Standards

Verification must check:

- [ ] Truths: Observable behaviors from user perspective
- [ ] Artifacts: Files exist with substantive content
- [ ] Key links: Components wired correctly (imports, API calls)
- [ ] Requirements: Mapped requirements satisfied

## Sub-Agent Summary

| Agent         | Purpose                           | When Spawned               |
| ------------- | --------------------------------- | -------------------------- |
| kata-verifier | Check must_haves against codebase | Goal-backward verification |
| kata-debugger | Diagnose root cause of gaps       | When gaps/issues found     |
