---
name: kata-audit-milestone
description: Verify milestone achievement against its definition of done, checking requirements coverage, cross-phase integration, and end-to-end flows. Triggers include "audit milestone", "verify milestone", "check milestone", and "milestone audit". This skill reads existing phase verification files, aggregates technical debt and gaps, and spawns an integration checker for cross-phase wiring.
metadata:
  version: "0.1.0"
---

<objective>
Verify milestone achieved its definition of done. Check requirements coverage, cross-phase integration, and end-to-end flows.

**This command IS the orchestrator.** Reads existing VERIFICATION.md files (phases already verified during phase-execute), aggregates tech debt and deferred gaps, then spawns integration checker for cross-phase wiring.
</objective>

<execution_context>

<!-- Spawns kata-integration-checker agent which has all audit expertise baked in -->

</execution_context>

<context>
Version: $ARGUMENTS (optional — defaults to current milestone)

**Original Intent:**
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md

**Planned Work:**
@.planning/ROADMAP.md
@.planning/config.json (if exists)

**Completed Work:**
Glob: .planning/phases/{active,pending,completed}/_/_-SUMMARY.md
Glob: .planning/phases/{active,pending,completed}/_/_-VERIFICATION.md
(Also check flat: .planning/phases/[0-9]_/_-SUMMARY.md for backward compatibility)
</context>

<process>

**Script invocation rule.** Code blocks reference scripts with paths relative to this SKILL.md (e.g., `"../kata-configure-settings/scripts/read-config.sh"`). Resolve these to absolute paths. Run scripts from the project directory (where `.planning/` lives). If you must run from a different directory, pass the project root via environment variable: `KATA_PROJECT_ROOT=/path/to/project bash "/path/to/script.sh" args`.

## 0. Resolve Model Profile

Read model profile for agent spawning:

```bash
MODEL_PROFILE=$(bash "../kata-configure-settings/scripts/read-config.sh" "model_profile" "balanced")
```

Default to "balanced" if not set.

**Model lookup table:**

| Agent                    | quality | balanced | budget |
| ------------------------ | ------- | -------- | ------ |
| kata-integration-checker | sonnet  | sonnet   | haiku  |

Store resolved model for use in Task call below.

## 0.5. Pre-flight: Check roadmap format (auto-migration)

If ROADMAP.md exists, check format and auto-migrate if old:

```bash
if [ -f .planning/ROADMAP.md ]; then
  bash "../kata-doctor/scripts/check-roadmap-format.sh" 2>/dev/null
  FORMAT_EXIT=$?

  if [ $FORMAT_EXIT -eq 1 ]; then
    echo "Old roadmap format detected. Running auto-migration..."
  fi
fi
```

**If exit code 1 (old format):**

Invoke kata-doctor in auto mode:

```
Skill("kata-doctor", "--auto")
```

Continue after migration completes.

**If exit code 0 or 2:** Continue silently.

## 1. Determine Milestone Scope

```bash
# Scan all phase directories across states
ALL_PHASE_DIRS=""
for state in active pending completed; do
  [ -d ".planning/phases/${state}" ] && ALL_PHASE_DIRS="${ALL_PHASE_DIRS} $(find .planning/phases/${state} -maxdepth 1 -type d -not -name "${state}" 2>/dev/null)"
done
# Fallback: include flat directories (backward compatibility)
FLAT_DIRS=$(find .planning/phases -maxdepth 1 -type d -name "[0-9]*" 2>/dev/null)
[ -n "$FLAT_DIRS" ] && ALL_PHASE_DIRS="${ALL_PHASE_DIRS} ${FLAT_DIRS}"
echo "$ALL_PHASE_DIRS" | tr ' ' '\n' | sort -V
```

- Parse version from arguments or detect current from ROADMAP.md
- Identify all phase directories in scope (across active/pending/completed subdirectories)
- Extract milestone definition of done from ROADMAP.md
- Extract requirements mapped to this milestone from REQUIREMENTS.md

## 2. Read All Phase Verifications

For each phase directory, read the VERIFICATION.md:

```bash
# Read VERIFICATION.md from each phase directory found in step 1
for phase_dir in $ALL_PHASE_DIRS; do
  [ -d "$phase_dir" ] || continue
  cat "${phase_dir}"*-VERIFICATION.md 2>/dev/null
done
```

From each VERIFICATION.md, extract:

- **Status:** passed | gaps_found
- **Critical gaps:** (if any — these are blockers)
- **Non-critical gaps:** tech debt, deferred items, warnings
- **Anti-patterns found:** TODOs, stubs, placeholders
- **Requirements coverage:** which requirements satisfied/blocked

If a phase is missing VERIFICATION.md, flag it as "unverified phase" — this is a blocker.

## 3. Spawn Integration Checker

Read the integration checker instructions:

```
integration_checker_instructions_content = Read("skills/kata-audit-milestone/references/integration-checker-instructions.md")
```

With phase context collected:

```
Task(
  prompt="<agent-instructions>
{integration_checker_instructions_content}
</agent-instructions>

Check cross-phase integration and E2E flows.

Phases: {phase_dirs}
Phase exports: {from SUMMARYs}
API routes: {routes created}

Verify cross-phase wiring and E2E user flows.",
  subagent_type="general-purpose",
  model="{integration_checker_model}"
)
```

## 4. Collect Results

Combine:

- Phase-level gaps and tech debt (from step 2)
- Integration checker's report (wiring gaps, broken flows)

## 5. Check Requirements Coverage

For each requirement in REQUIREMENTS.md mapped to this milestone:

- Find owning phase
- Check phase verification status
- Determine: satisfied | partial | unsatisfied

## 6. Aggregate into v{version}-MILESTONE-AUDIT.md

Create `.planning/v{version}-v{version}-MILESTONE-AUDIT.md` with:

```yaml
---
milestone: { version }
audited: { timestamp }
status: passed | gaps_found | tech_debt
scores:
  requirements: N/M
  phases: N/M
  integration: N/M
  flows: N/M
gaps: # Critical blockers
  requirements: [...]
  integration: [...]
  flows: [...]
tech_debt: # Non-critical, deferred
  - phase: 01-auth
    items:
      - "TODO: add rate limiting"
      - "Warning: no password strength validation"
  - phase: 03-dashboard
    items:
      - "Deferred: mobile responsive layout"
---
```

Plus full markdown report with tables for requirements, phases, integration, tech debt.

**Status values:**

- `passed` — all requirements met, no critical gaps, minimal tech debt
- `gaps_found` — critical blockers exist
- `tech_debt` — no blockers but accumulated deferred items need review

## 7. Present Results

Route by status (see `<offer_next>`).

## 8. Offer UAT Walkthrough

Use AskUserQuestion:

- header: "UAT Walkthrough"
- question: "Would you like a complete walk-through UAT session?"
- options:
  - "Full walkthrough" — walk through all user-observable deliverables
  - "Integration only" — focus on cross-phase flows
  - "Skip" — done with audit

**If Skip:** Proceed to `<offer_next>`.

**If walkthrough chosen:**

1. Read all phase SUMMARY.md files in milestone scope
2. Extract user-observable deliverables (features, behaviors, UI changes)
3. Classify each deliverable as **user-facing** or **internal**:
   - **User-facing:** Things end-users interact with through the product's normal interface. For a web app: pages, forms, buttons, API responses. For a CLI tool: commands, flags, output. For a library: public API, configuration options. The test is: would the end-user encounter this during normal use?
   - **Internal:** Everything else. Scripts, helper functions, reference docs, test files, build artifacts, refactors, and implementation modules are INTERNAL even if they can be invoked directly from a terminal. If the end-user never runs it, sees it, or interacts with it, it's internal.
4. Design demo scenarios **organized by user journey, not by phase or technical component**:
   - Map the order in which an end-user naturally encounters these features (e.g., project setup → configuration → daily use → completion)
   - Each batch follows one segment of that journey, not one phase or one script
   - "Full walkthrough": walk through the complete user journey, then summarize internal changes
   - "Integration only": demo cross-phase flows only
5. Create `.planning/v{version}-UAT.md` adapted from UAT template format:
   - `milestone: {version}` instead of `phase:`
   - `source:` lists all phase SUMMARY.md files

6. **Set up the environment, then hand off to the user**

   <uat_rules>

   **CRITICAL: The user performs UAT, not you.**

   UAT verifies the milestone's deliverables work from the end-user's perspective. The user interacts with what was built (their app, their CLI, their API). You prepare the environment and give instructions. You MUST NOT run the demo yourself and report results back.

   **What you do:**
   - Start dev servers, seed databases, install dependencies — whatever setup the user needs
   - Run internal verification yourself (tests, build checks) and summarize results
   - Write clear step-by-step instructions telling the user what to try
   - Wait for the user to report back what happened

   **What the user does:**
   - Opens the app, runs commands, submits forms, navigates pages
   - Observes behavior and reports whether it matches expectations
   - Flags anything unexpected

   **Anti-pattern (WRONG):**

   ```
   Claude runs curl against the API itself
   Claude opens the page and reads the DOM
   Claude says: "The login endpoint returns 200, it works!"
   ```

   This is automated verification, not user acceptance testing.

   **Correct pattern:**

   ```
   Claude says: "I started the dev server on port 3000.
   Try this:
     1. Open http://localhost:3000/login in your browser
     2. Enter test@example.com / password123
     3. You should be redirected to the dashboard with your name displayed
   What do you see?"
   ```

   The user experiences the feature. Claude waits for their report.

   </uat_rules>

   **Scenario design principles:**
   - Each scenario is an instruction TO the user, not a command for Claude to run
   - Scenarios exercise the product's normal interface — the same way an end-user would encounter the feature. For a web app: open a URL, click a button, submit a form. For a CLI: run the command the user would run. NEVER have the user invoke internal scripts, grep source files, or inspect implementation details
   - Tell the user what to look for: "You should see X" or "The output should include Y"
   - Group related scenarios into batches of 2-4
   - If a milestone is mostly internal work (infrastructure, refactors, scripts), most scenarios belong in the internal summary — don't force the user to manually test internals

   **Internal changes get summarized verification.** Run tests, check build output, and inspect artifacts yourself. Present a summary to the user ("all 47 tests pass, build succeeds"). The user confirms or flags concerns. Do not ask the user to grep files, read source, or run diagnostic commands.

   **Before each batch, brief the user on context from the end-user's perspective.** Describe what the user will experience, not what was built internally. Wrong: "v1.10.0 adds a `worktree.enabled` config option read by three skills." Right: "When you create a new project, you'll now see a question about Git Worktrees." Then give setup instructions if needed (cd to a directory, open a session, etc.).

   Then present the batch using AskUserQuestion with multiSelect:

   ```
   Use AskUserQuestion:
   - header: "UAT Batch {N}"
   - question: "Try each scenario and select the ones that pass. Unselected = needs investigation."
   - multiSelect: true
   - options:
     - "S{X}: {short name}" — {instruction for user to follow}
     - "S{Y}: {short name}" — {instruction for user to follow}
     - "S{Z}: {short name}" — {instruction for user to follow}
     - "None pass" — all scenarios in this batch failed
   ```

   For any scenario NOT selected (failed):
   - Ask follow-up: "What's the issue with S{X}?"
   - Record user's description as a gap with severity inferred from response

   Continue batches until all scenarios are presented.

7. Update UAT.md after each batch with pass/fail status and user-provided evidence
8. On completion: commit UAT.md

**If all scenarios pass:** Proceed to `<offer_next>` (audit status unchanged).

**If issues found — merge gaps into audit file:**

1. Append UAT gap entries to `MILESTONE-AUDIT.md` under `gaps.flows` (for E2E breaks) or `gaps.requirements` (for unmet requirements), using the same YAML structure the audit already uses
2. Update MILESTONE-AUDIT.md frontmatter: `status: gaps_found` (if it was `passed` or `tech_debt`)
3. Update UAT.md summary counts

Then use AskUserQuestion:

- header: "Issues Found"
- question: "{N} issues found during walkthrough. How to proceed?"
- options:
  - "Plan fix phases" — route to `/kata-plan-milestone-gaps` (reads the updated audit file)
  - "Accept as known issues" — document in UAT.md, revert MILESTONE-AUDIT.md status to original
  - "Stop" — halt for manual intervention

</process>

<offer_next>
Output this markdown directly (not as a code block). Route based on status:

---

**If passed:**

## ✓ Milestone {version} — Audit Passed

**Score:** {N}/{M} requirements satisfied
**Report:** .planning/v{version}-MILESTONE-AUDIT.md
{If walkthrough was run:} **UAT:** .planning/v{version}-UAT.md — all scenarios passed

All requirements covered. Cross-phase integration verified. E2E flows complete.

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Complete milestone** — archive and tag

/kata-complete-milestone {version}

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

---

**If gaps_found:**

## ⚠ Milestone {version} — Gaps Found

**Score:** {N}/{M} requirements satisfied
**Report:** .planning/v{version}-MILESTONE-AUDIT.md
{If walkthrough was run:} **UAT:** .planning/v{version}-UAT.md

### Unsatisfied Requirements

{For each unsatisfied requirement:}

- **{REQ-ID}: {description}** (Phase {X})
  - {reason}

### Cross-Phase Issues

{For each integration gap:}

- **{from} → {to}:** {issue}

### Broken Flows

{For each flow gap:}

- **{flow name}:** breaks at {step}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Plan gap closure** — create phases to complete milestone

/kata-plan-milestone-gaps

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**

- cat .planning/v{version}-MILESTONE-AUDIT.md — see full report
- /kata-complete-milestone {version} — proceed anyway (accept tech debt)

───────────────────────────────────────────────────────────────

---

**If tech_debt (no blockers but accumulated debt):**

## ⚡ Milestone {version} — Tech Debt Review

**Score:** {N}/{M} requirements satisfied
**Report:** .planning/v{version}-MILESTONE-AUDIT.md
{If walkthrough was run:} **UAT:** .planning/v{version}-UAT.md

All requirements met. No critical blockers. Accumulated tech debt needs review.

### Tech Debt by Phase

{For each phase with debt:}
**Phase {X}: {name}**

- {item 1}
- {item 2}

### Total: {N} items across {M} phases

───────────────────────────────────────────────────────────────

## ▶ Options

**A. Complete milestone** — accept debt, track in backlog

/kata-complete-milestone {version}

**B. Plan cleanup phase** — address debt before completing

/kata-plan-milestone-gaps

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>

- [ ] Milestone scope identified
- [ ] All phase VERIFICATION.md files read
- [ ] Tech debt and deferred gaps aggregated
- [ ] Integration checker spawned for cross-phase wiring
- [ ] v{version}-MILESTONE-AUDIT.md created
- [ ] Results presented with actionable next steps
- [ ] UAT walkthrough offered
- [ ] v{version}-UAT.md created (if walkthrough chosen)
- [ ] MILESTONE-AUDIT.md updated with UAT gaps (if issues found)
      </success_criteria>
