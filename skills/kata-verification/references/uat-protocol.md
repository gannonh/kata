# User Acceptance Testing Protocol

Validate built features through conversational testing with persistent state.

## Visual Presentation

**Stage banner on start:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 KATA ► USER ACCEPTANCE TESTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Loading tests from summaries...
```

**Stage banner on completion:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 KATA ► UAT COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Philosophy

**Show expected, ask if reality matches.**

Claude presents what SHOULD happen. User confirms or describes what's different.
- "yes" / "y" / "next" -> pass
- Anything else -> logged as issue, severity inferred

No Pass/Fail buttons. No severity questions. Just: "Here's what should happen. Does it?"

## UAT.md Structure

```markdown
---
status: testing | complete
phase: XX-name
source: [list of SUMMARY.md files]
started: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: [test name]
expected: |
  [what user should observe]
awaiting: user response

## Tests

### 1. [Test Name]
expected: [observable behavior]
result: [pending | pass | issue | skipped]
reported: "[user's verbatim response if issue]"
severity: [blocker | major | minor | cosmetic]

### 2. [Test Name]
expected: [observable behavior]
result: [pending]

## Summary

total: [N]
passed: 0
issues: 0
pending: [N]
skipped: 0

## Gaps

[Structured gaps for plan-phase --gaps consumption]
```

## Test Derivation

Extract testable deliverables from SUMMARY.md files.

**Source content:**
- Accomplishments section
- User-facing changes
- New features/functionality

**Focus on USER-OBSERVABLE outcomes, not implementation details.**

**Good test derivation:**

SUMMARY: "Added comment threading with infinite nesting"

Test:
- name: "Reply to a Comment"
- expected: "Clicking Reply opens inline composer below comment. Submitting shows reply nested under parent with visual indentation."

**Skip internal/non-observable items:**
- Refactors, type changes, internal restructuring
- Backend-only changes with no UI impact
- Configuration changes

## Test Script Format

Present tests one at a time using checkpoint box:

```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Verification Required                           ║
╚══════════════════════════════════════════════════════════════╝

**Test {N}: {name}**

{expected behavior - specific, observable}

──────────────────────────────────────────────────────────────
→ Type "pass" or describe what's wrong
──────────────────────────────────────────────────────────────
```

**Expected behavior guidance:**
- Describe from user perspective
- Include specific UI elements
- Note observable changes
- Avoid implementation details

## Response Processing

### Pass Indicators

- Empty response
- "yes", "y", "ok", "pass", "next"
- "approved", "looks good", "works"

Update test:
```yaml
result: pass
```

### Skip Indicators

- "skip", "can't test", "n/a"
- "not applicable", "unable to verify"

Update test:
```yaml
result: skipped
reason: [user's reason if provided]
```

### Issue Indicators

Any response not matching pass/skip patterns.

Update test:
```yaml
result: issue
reported: "[verbatim user response]"
severity: [inferred]
```

Add to Gaps section:
```yaml
- truth: "{expected behavior from test}"
  status: failed
  reason: "User reported: {verbatim user response}"
  severity: {inferred}
  test: {N}
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
```

## Severity Inference

**Infer from user's natural language - never ask:**

| User says | Infer |
|-----------|-------|
| "crashes", "error", "exception", "fails completely" | blocker |
| "doesn't work", "nothing happens", "wrong behavior" | major |
| "works but...", "slow", "weird", "minor issue" | minor |
| "color", "spacing", "alignment", "looks off" | cosmetic |

Default to **major** if unclear. User can correct if needed.

## Session Persistence

**Resume from UAT.md on context reset:**

1. Read frontmatter (status, phase)
2. Read Current Test section
3. Find first test with `result: [pending]`
4. Announce progress and continue

**Display on resume:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 KATA ► RESUMING UAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase: {phase}
Progress: {passed + issues + skipped}/{total}
Issues found so far: {issues count}

Continuing from Test {N}...
```

## Completion Workflow

**On last test:**

1. Update frontmatter status to "complete"
2. Clear Current Test section
3. Commit UAT.md

```bash
git add ".planning/phases/XX-name/{phase}-UAT.md"
git commit -m "test({phase}): complete UAT - {passed} passed, {issues} issues"
```

4. Present summary

**If issues > 0:**

Proceed to diagnosis phase (spawn kata-debugger for each issue).

**If issues == 0:**

```
All tests passed. Ready to continue.

- /kata:plan-phase {next} - Plan next phase
- /kata:execute-phase {next} - Execute next phase
```

## Anti-Patterns

- Don't use AskUserQuestion for test responses - plain text conversation
- Don't ask severity - infer from description
- Don't present full checklist upfront - one test at a time
- Don't run automated tests - this is manual user validation
- Don't fix issues during testing - log as gaps, diagnose after all tests complete

## Update Rules

**Batched writes for efficiency:**

Write to file only when:
1. Issue found (preserve immediately)
2. Session complete (final write before commit)
3. Checkpoint (every 5 passed tests as safety net)

| Section | Rule | When Written |
|---------|------|--------------|
| Frontmatter.status | OVERWRITE | Start, complete |
| Frontmatter.updated | OVERWRITE | On any file write |
| Current Test | OVERWRITE | On any file write |
| Tests.{N}.result | OVERWRITE | On any file write |
| Summary | OVERWRITE | On any file write |
| Gaps | APPEND | When issue found |
