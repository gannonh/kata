# Debugging Workflow

When and how to invoke kata-debugger for issue diagnosis.

## When to Invoke kata-debugger

### From Goal-Backward Verification

When VERIFICATION.md status is `gaps_found`:

- Each gap has a specific truth that failed
- Need root cause analysis before fix planning
- Spawn debugger for gaps where cause isn't obvious

### From UAT Testing

When UAT.md has issues:

- User reported unexpected behavior
- Need to identify what went wrong
- Spawn parallel debuggers for each issue

### Interactive Debugging

When user explicitly asks for debugging help:

- "Something is broken"
- "This doesn't work"
- "Help me debug this"

## Debug Information Gathering

### For Verification Gaps

```markdown
<symptoms>
expected: {truth that should be true}
actual: {what verification found instead}
errors: {error messages if any}
reproduction: "Run verification: grep/check commands"
timeline: "Discovered during goal-backward verification"
</symptoms>
```

### For UAT Issues

```markdown
<symptoms>
expected: {expected behavior from test}
actual: "User reported: {verbatim user response}"
errors: {error messages user mentioned}
reproduction: {test steps that revealed issue}
timeline: "Discovered during UAT Test {N}"
</symptoms>
```

### For Interactive Debugging

Gather symptoms through questioning:

1. **Expected behavior** - What should happen?
2. **Actual behavior** - What happens instead?
3. **Error messages** - Any errors? (paste or describe)
4. **Timeline** - When did this start? Ever worked?
5. **Reproduction** - How do you trigger it?

## Issue Diagnosis Approach

### Scientific Method

1. Form specific, falsifiable hypothesis
2. Design test to confirm or eliminate
3. Execute test, observe result
4. Update hypothesis based on evidence
5. Repeat until root cause confirmed

### Investigation Techniques

**Binary search:** Cut problem space in half repeatedly
- Data leaves DB correctly? Check API return. Check frontend receive.

**Minimal reproduction:** Strip away until smallest failing code
- Remove features until bug is isolated

**Working backwards:** Start from desired output, trace back
- What produces this? What feeds that? Where did it diverge?

**Differential debugging:** What changed? What's different?
- Works locally, fails in prod? Compare environments.

### Evidence Quality

**Strong evidence:**
- Directly observable ("logs show X")
- Repeatable ("fails every time")
- Unambiguous ("value is null, not undefined")

**Weak evidence:**
- Hearsay ("I think I saw this once")
- Non-repeatable ("failed that one time")
- Ambiguous ("something seems off")

## Debug File Protocol

Create persistent state in `.planning/debug/`:

```markdown
---
status: gathering | investigating | fixing | verifying | resolved
trigger: "[verbatim issue description]"
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

For verification gaps (find_root_cause_only mode):

```markdown
## ROOT CAUSE FOUND

**Debug Session:** .planning/debug/{slug}.md

**Root Cause:** {specific cause with evidence}

**Evidence Summary:**
- {key finding 1}
- {key finding 2}

**Files Involved:**
- {file1}: {what's wrong}
- {file2}: {related issue}

**Suggested Fix Direction:** {brief hint, not implementation}
```

For inconclusive investigation:

```markdown
## INVESTIGATION INCONCLUSIVE

**Debug Session:** .planning/debug/{slug}.md

**What Was Checked:**
- {area 1}: {finding}
- {area 2}: {finding}

**Hypotheses Eliminated:**
- {hypothesis}: {why eliminated}

**Remaining Possibilities:**
- {possibility 1}
- {possibility 2}

**Recommendation:** Manual review needed
```

## Integration with Gap Closure

After diagnosis, update gap structure:

```yaml
- truth: "User can see existing messages"
  status: failed
  reason: "Root cause: Chat.tsx fetch never called"
  artifacts:
    - path: "src/components/Chat.tsx"
      issue: "useEffect missing dependency array, never triggers"
  missing:
    - "Add [messages] to useEffect dependency array"
    - "Verify fetch triggers on mount"
  root_cause: "useEffect with empty callback never runs fetch"
  debug_session: ".planning/debug/chat-not-loading.md"
```

This enriched gap structure enables precise fix planning.

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

Do NOT implement the fix during diagnosis. Document the direction for fix planning.

## Debugging Modes

### find_root_cause_only

- Diagnose but don't fix
- Stop after confirming root cause
- Return structured diagnosis
- Used by verification workflow

### find_and_fix (interactive)

- Full debugging cycle
- Find root cause, then fix
- Verify fix works
- Archive session when complete

## Parallel Debugging

For multiple issues (e.g., UAT with 3 issues):

Spawn parallel kata-debugger agents:

```
Task(prompt=issue1_prompt, subagent_type="kata-debugger", description="Debug: issue 1")
Task(prompt=issue2_prompt, subagent_type="kata-debugger", description="Debug: issue 2")
Task(prompt=issue3_prompt, subagent_type="kata-debugger", description="Debug: issue 3")
```

Collect results, aggregate for gap closure planning.
