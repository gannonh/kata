<purpose>
Validate built features through conversational testing with persistent state. Creates UAT.md that tracks test progress, survives /clear, and feeds gaps into /kata-plan-phase --gaps.

User tests, Claude records. One test at a time. Plain text responses.
</purpose>

<philosophy>
**Show expected, ask if reality matches.**

Claude presents what SHOULD happen. User confirms or describes what's different.
- "yes" / "y" / "next" / empty → pass
- Anything else → logged as issue, severity inferred

No Pass/Fail buttons. No severity questions. Just: "Here's what should happen. Does it?"
</philosophy>

<template>
UAT template is resolved at runtime via kata-lib.cjs (project override -> plugin default).

```bash
UAT_TEMPLATE_PATH=$(node scripts/kata-lib.cjs resolve-template "UAT-template.md")
UAT_TEMPLATE_CONTENT=$(cat "$UAT_TEMPLATE_PATH")
```

The resolved template content is available as `{uat_template_content}` for creating {phase}-UAT.md files.
</template>

<process>

<step name="resolve_model_profile" priority="first">
Read model profile for agent spawning:

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

Default to "balanced" if not set.

**Model lookup table:**

| Agent             | quality | balanced | budget |
| ----------------- | ------- | -------- | ------ |
| kata-planner      | opus    | opus     | sonnet |
| kata-plan-checker | sonnet  | sonnet   | haiku  |

Store resolved models for use in Task calls below.

**Resolve verification report template (project override -> plugin default):**

```bash
VERIFICATION_TEMPLATE_PATH=$(node scripts/kata-lib.cjs resolve-template "verification-report.md")
VERIFICATION_TEMPLATE_CONTENT=$(cat "$VERIFICATION_TEMPLATE_PATH")
```

The resolved template content is available as `{verification_template_content}` and should be inlined into the verifier subagent prompt as `<verification_template>{verification_template_content}</verification_template>`.
</step>

<step name="check_active_session">
**First: Check for active UAT sessions**

```bash
find .planning/phases -name "*-UAT.md" -type f 2>/dev/null | head -5
```

**If active sessions exist AND no $ARGUMENTS provided:**

Read each file's frontmatter (status, phase) and Current Test section.

Display inline:

```
## Active UAT Sessions

| #   | Phase       | Status  | Current Test        | Progress |
| --- | ----------- | ------- | ------------------- | -------- |
| 1   | 04-comments | testing | 3. Reply to Comment | 2/6      |
| 2   | 05-auth     | testing | 1. Login Form       | 0/4      |

Reply with a number to resume, or provide a phase number to start new.
```

Wait for user response.

- If user replies with number (1, 2) → Load that file, go to `resume_from_file`
- If user replies with phase number → Treat as new session, go to `create_uat_file`

**If active sessions exist AND $ARGUMENTS provided:**

Check if session exists for that phase. If yes, offer to resume or restart.
If no, continue to `create_uat_file`.

**If no active sessions AND no $ARGUMENTS:**

```
No active UAT sessions.

Provide a phase number to start testing (e.g., /kata-verify-work 4)
```

**If no active sessions AND $ARGUMENTS provided:**

Continue to `create_uat_file`.
</step>

<step name="find_summaries">
**Find what to test:**

Parse $ARGUMENTS as phase number (e.g., "4") or plan number (e.g., "04-02").

```bash
# Universal phase discovery
PADDED_PHASE=$(printf "%02d" ${PHASE_ARG} 2>/dev/null || echo "${PHASE_ARG}")
PHASE_DIR=""
for state in active pending completed; do
  PHASE_DIR=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${PADDED_PHASE}-*" 2>/dev/null | head -1)
  [ -z "$PHASE_DIR" ] && PHASE_DIR=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${PHASE_ARG}-*" 2>/dev/null | head -1)
  [ -n "$PHASE_DIR" ] && break
done
# Fallback: flat directory (backward compatibility)
if [ -z "$PHASE_DIR" ]; then
  PHASE_DIR=$(find .planning/phases -maxdepth 1 -type d -name "${PADDED_PHASE}-*" 2>/dev/null | head -1)
  [ -z "$PHASE_DIR" ] && PHASE_DIR=$(find .planning/phases -maxdepth 1 -type d -name "${PHASE_ARG}-*" 2>/dev/null | head -1)
fi

# Find SUMMARY files
find "$PHASE_DIR" -maxdepth 1 -name "*-SUMMARY.md" 2>/dev/null
```

Read each SUMMARY.md to extract testable deliverables.
</step>

<step name="extract_tests">
**Extract testable deliverables from SUMMARY.md:**

Parse for:
1. **Accomplishments** - Features/functionality added
2. **User-facing changes** - UI, workflows, interactions

Focus on USER-OBSERVABLE outcomes, not implementation details.

For each deliverable, create a test:
- name: Brief test name
- expected: What the user should see/experience (specific, observable)

Examples:
- Accomplishment: "Added comment threading with infinite nesting"
  → Test: "Reply to a Comment"
  → Expected: "Clicking Reply opens inline composer below comment. Submitting shows reply nested under parent with visual indentation."

Skip internal/non-observable items (refactors, type changes, etc.).
</step>

<step name="create_uat_file">
**Create UAT file with all tests:**

```bash
mkdir -p "$PHASE_DIR"
```

Build test list from extracted deliverables.

Create file:

```markdown
---
status: testing
phase: XX-name
source: [list of SUMMARY.md files]
started: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: [first test name]
expected: |
  [what user should observe]
awaiting: user response

## Tests

### 1. [Test Name]
expected: [observable behavior]
result: [pending]

### 2. [Test Name]
expected: [observable behavior]
result: [pending]

...

## Summary

total: [N]
passed: 0
issues: 0
pending: [N]
skipped: 0

## Gaps

[none yet]
```

Write to `.planning/phases/XX-name/{phase}-UAT.md`

Proceed to `present_test`.
</step>

<step name="present_test">
**Present current test to user:**

Read Current Test section from UAT file.

Display using checkpoint box format:

```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Verification Required                           ║
╚══════════════════════════════════════════════════════════════╝

**Test {number}: {name}**

{expected}

──────────────────────────────────────────────────────────────
→ Type "pass" or describe what's wrong
──────────────────────────────────────────────────────────────
```

Wait for user response (plain text, no AskUserQuestion).
</step>

<step name="process_response">
**Process user response and update file:**

**If response indicates pass:**
- Empty response, "yes", "y", "ok", "pass", "next", "approved", "✓"

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: pass
```

**If response indicates skip:**
- "skip", "can't test", "n/a"

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: skipped
reason: [user's reason if provided]
```

**If response is anything else:**
- Treat as issue description

Infer severity from description:
- Contains: crash, error, exception, fails, broken, unusable → blocker
- Contains: doesn't work, wrong, missing, can't → major
- Contains: slow, weird, off, minor, small → minor
- Contains: color, font, spacing, alignment, visual → cosmetic
- Default if unclear: major

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: issue
reported: "{verbatim user response}"
severity: {inferred}
```

Append to Gaps section (structured YAML for phase-plan --gaps):
```yaml
- truth: "{expected behavior from test}"
  status: failed
  reason: "User reported: {verbatim user response}"
  severity: {inferred}
  test: {N}
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
```

**After any response:**

Update Summary counts.
Update frontmatter.updated timestamp.

If more tests remain → Update Current Test, go to `present_test`
If no more tests → Go to `complete_session`
</step>

<step name="resume_from_file">
**Resume testing from UAT file:**

Read the full UAT file.

Find first test with `result: [pending]`.

Announce:
```
Resuming: Phase {phase} UAT
Progress: {passed + issues + skipped}/{total}
Issues found so far: {issues count}

Continuing from Test {N}...
```

Update Current Test section with the pending test.
Proceed to `present_test`.
</step>

<step name="run_extra_verification">
## 7.1. Run Extra Verification Commands

After UAT tests complete and UAT.md is committed, check for project-specific verification commands:

```bash
EXTRA_CMDS_JSON=$(node scripts/kata-lib.cjs read-pref "workflows.verify-work.extra_verification_commands" "[]")
```

**If `EXTRA_CMDS_JSON` is `[]` or empty:** Skip this step.

**Otherwise:** Parse JSON array and execute each command:

```bash
EXTRA_CMDS_JSON="$EXTRA_CMDS_JSON" node -e "
const cmds = JSON.parse(process.env.EXTRA_CMDS_JSON);
if (cmds.length === 0) { process.exit(0); }
cmds.forEach((cmd, i) => console.log('CMD_' + i + '=' + cmd));
" > /tmp/kata-extra-cmds.sh

if [ -s /tmp/kata-extra-cmds.sh ]; then
  echo ""
  echo "## Extra Verification"
  echo ""
  source /tmp/kata-extra-cmds.sh
  # Run each CMD_N
  i=0
  while true; do
    eval "CMD=\${CMD_${i}:-}"
    [ -z "$CMD" ] && break
    echo "Running: $CMD"
    eval "$CMD" 2>&1 || echo "  Warning: Command failed (non-blocking)"
    i=$((i + 1))
  done
  rm -f /tmp/kata-extra-cmds.sh
fi
```

Append command outputs to UAT.md under a `## Extra Verification` section. Non-blocking: command failures are logged but do not stop the workflow.
</step>

<step name="complete_session">
**Complete testing and commit:**

Update frontmatter:
- status: complete
- updated: [now]

Clear Current Test section:
```
## Current Test

[testing complete]
```

**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations

**If `COMMIT_PLANNING_DOCS=true` (default):**

Commit the UAT file:
```bash
git add ".planning/phases/XX-name/{phase}-UAT.md"
git commit -m "test({phase}): complete UAT - {passed} passed, {issues} issues"
```

Present summary:
```
## UAT Complete: Phase {phase}

| Result  | Count |
| ------- | ----- |
| Passed  | {N}   |
| Issues  | {N}   |
| Skipped | {N}   |

[If issues > 0:]
### Issues Found

[List from Issues section]
```

**If issues > 0:** Proceed to `diagnose_issues`

**If issues == 0:**
```
All tests passed. Ready to continue.

- `/kata-plan-phase {next}` — Plan next phase
- `/kata-execute-phase {next}` — Execute next phase
```
</step>

<step name="diagnose_issues">
**Diagnose root causes before planning fixes:**

```
---

{N} issues found. Diagnosing root causes...

Spawning parallel debug agents to investigate each issue.
```

- Load diagnose-issues workflow
- Follow @./diagnose-issues.md
- Spawn parallel debug agents for each issue
- Collect root causes
- Update UAT.md with root causes
- Proceed to `plan_gap_closure`

Diagnosis runs automatically - no user prompt. Parallel agents investigate simultaneously, so overhead is minimal and fixes are more accurate.
</step>

<step name="plan_gap_closure">
**Auto-plan fixes from diagnosed gaps:**

Display:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Kata ► PLANNING FIXES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner for gap closure...


**Load agent instructions from skill references/ at runtime:**

```bash
planner_instructions_content=$(cat references/planner-instructions.md)
plan_checker_instructions_content=$(cat references/plan-checker-instructions.md)
```

Spawn planner in --gaps mode:

```
Task(
  prompt="<agent-instructions>\n{planner_instructions_content}\n</agent-instructions>\n\n" + """
<planning_context>

**Phase:** {phase_number}
**Mode:** gap_closure

**UAT with diagnoses:**
@.planning/phases/{phase_dir}/{phase}-UAT.md

**Project State:**
@.planning/STATE.md

**Roadmap:**
@.planning/ROADMAP.md

</planning_context>

<downstream_consumer>
Output consumed by /kata-execute-phase
Plans must be executable prompts.
</downstream_consumer>
""",
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Plan gap fixes for Phase {phase}"
)
```

On return:
- **PLANNING COMPLETE:** Proceed to `verify_gap_plans`
- **PLANNING INCONCLUSIVE:** Report and offer manual intervention
</step>

<step name="verify_gap_plans">
**Verify fix plans with checker:**

Display:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Kata ► VERIFYING FIX PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning plan checker...


Initialize: `iteration_count = 1`

Spawn plan checker:

```
Task(
  prompt="<agent-instructions>\n{plan_checker_instructions_content}\n</agent-instructions>\n\n" + """
<verification_context>

**Phase:** {phase_number}
**Phase Goal:** Close diagnosed gaps from UAT

**Plans to verify:**
@.planning/phases/{phase_dir}/*-PLAN.md

</verification_context>

<expected_output>
Return one of:
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
""",
  subagent_type="general-purpose",
  model="{checker_model}",
  description="Verify Phase {phase} fix plans"
)
```

On return:
- **VERIFICATION PASSED:** Proceed to `present_ready`
- **ISSUES FOUND:** Proceed to `revision_loop`
</step>

<step name="revision_loop">
**Iterate planner ↔ checker until plans pass (max 3):**

**If iteration_count < 3:**

Display: `Sending back to planner for revision... (iteration {N}/3)`

Spawn planner with revision context:

```
Task(
  prompt="<agent-instructions>\n{planner_instructions_content}\n</agent-instructions>\n\n" + """
<revision_context>

**Phase:** {phase_number}
**Mode:** revision

**Existing plans:**
@.planning/phases/{phase_dir}/*-PLAN.md

**Checker issues:**
{structured_issues_from_checker}

</revision_context>

<instructions>
Read existing PLAN.md files. Make targeted updates to address checker issues.
Do NOT replan from scratch unless issues are fundamental.
</instructions>
""",
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Revise Phase {phase} plans"
)
```

After planner returns → spawn checker again (verify_gap_plans logic)
Increment iteration_count

**If iteration_count >= 3:**

Display: `Max iterations reached. {N} issues remain.`

Offer options:
1. Force proceed (execute despite issues)
2. Provide guidance (user gives direction, retry)
3. Abandon (exit, user runs /kata-plan-phase manually)

Wait for user response.
</step>

<step name="present_ready">
**Present completion and next steps:**


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Kata ► FIXES READY ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {X}: {Name}** — {N} gap(s) diagnosed, {M} fix plan(s) created

| Gap       | Root Cause   | Fix Plan   |
| --------- | ------------ | ---------- |
| {truth 1} | {root_cause} | {phase}-04 |
| {truth 2} | {root_cause} | {phase}-04 |

Plans verified and ready for execution.

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute fixes** — run fix plans

`/clear` then `/kata-execute-phase {phase} --gaps-only`

───────────────────────────────────────────────────────────────

</step>

</process>

<update_rules>
**Batched writes for efficiency:**

Keep results in memory. Write to file only when:
1. **Issue found** — Preserve the problem immediately
2. **Session complete** — Final write before commit
3. **Checkpoint** — Every 5 passed tests (safety net)

| Section             | Rule      | When Written      |
| ------------------- | --------- | ----------------- |
| Frontmatter.status  | OVERWRITE | Start, complete   |
| Frontmatter.updated | OVERWRITE | On any file write |
| Current Test        | OVERWRITE | On any file write |
| Tests.{N}.result    | OVERWRITE | On any file write |
| Summary             | OVERWRITE | On any file write |
| Gaps                | APPEND    | When issue found  |

On context reset: File shows last checkpoint. Resume from there.
</update_rules>

<severity_inference>
**Infer severity from user's natural language:**

| User says                                           | Infer    |
| --------------------------------------------------- | -------- |
| "crashes", "error", "exception", "fails completely" | blocker  |
| "doesn't work", "nothing happens", "wrong behavior" | major    |
| "works but...", "slow", "weird", "minor issue"      | minor    |
| "color", "spacing", "alignment", "looks off"        | cosmetic |

Default to **major** if unclear. User can correct if needed.

**Never ask "how severe is this?"** - just infer and move on.
</severity_inference>

<success_criteria>
- [ ] UAT file created with all tests from SUMMARY.md
- [ ] Tests presented one at a time with expected behavior
- [ ] User responses processed as pass/issue/skip
- [ ] Severity inferred from description (never asked)
- [ ] Batched writes: on issue, every 5 passes, or completion
- [ ] Committed on completion
- [ ] If issues: parallel debug agents diagnose root causes
- [ ] If issues: kata-planner creates fix plans (gap_closure mode)
- [ ] If issues: kata-plan-checker verifies fix plans
- [ ] If issues: revision loop until plans pass (max 3 iterations)
- [ ] Ready for `/kata-execute-phase --gaps-only` when complete
</success_criteria>
