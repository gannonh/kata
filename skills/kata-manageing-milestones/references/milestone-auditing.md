# Milestone Auditing Workflow

Complete workflow for auditing milestone completion against original intent before archiving.

## Overview

Verify milestone achieved its definition of done. Check requirements coverage, cross-phase integration, and end-to-end flows.

**Purpose:** Aggregate phase verifications, spawn integration checker for cross-phase wiring, and produce comprehensive audit report.

**Output:** `v{version}-MILESTONE-AUDIT.md` with status and actionable next steps.

## Step 1: Determine Milestone Scope

```bash
# Get phases in milestone
ls -d .planning/phases/*/ | sort -V
```

- Parse version from arguments or detect from ROADMAP.md
- Identify all phase directories in scope
- Extract milestone definition of done from ROADMAP.md
- Extract requirements mapped to this milestone from REQUIREMENTS.md

## Step 2: Read All Phase Verifications

For each phase directory, read VERIFICATION.md:

```bash
cat .planning/phases/01-*/*-VERIFICATION.md
cat .planning/phases/02-*/*-VERIFICATION.md
# etc.
```

**Extract from each VERIFICATION.md:**
- **Status:** passed | gaps_found
- **Critical gaps:** blockers
- **Non-critical gaps:** tech debt, deferred items, warnings
- **Anti-patterns:** TODOs, stubs, placeholders
- **Requirements coverage:** which requirements satisfied/blocked

**Missing VERIFICATION.md = blocker:**
Flag as "unverified phase" - this prevents milestone completion.

## Step 3: Spawn Integration Checker

With phase context collected, check cross-phase wiring:

```
Task(
  prompt="Check cross-phase integration and E2E flows.

Phases: {phase_dirs}
Phase exports: {from SUMMARYs}
API routes: {routes created}

Verify:
1. Cross-phase wiring (exports used by dependents)
2. E2E user flows (complete paths through system)
3. API consistency (types match across boundaries)
",
  subagent_type="kata-integration-checker",
  description="Integration check"
)
```

## Step 4: Collect Results

Combine:
- Phase-level gaps and tech debt (from step 2)
- Integration checker's report (wiring gaps, broken flows)

## Step 5: Check Requirements Coverage

For each requirement in REQUIREMENTS.md mapped to this milestone:

1. Find owning phase (from traceability)
2. Check phase verification status
3. Determine: **satisfied** | **partial** | **unsatisfied**

**Satisfied:** Phase passed verification, requirement's functionality tested
**Partial:** Phase passed but requirement only partially implemented
**Unsatisfied:** Phase has gaps blocking this requirement

## Step 6: Create Audit Report

Write `.planning/v{version}-MILESTONE-AUDIT.md`:

```yaml
---
milestone: {version}
audited: {timestamp}
status: passed | gaps_found | tech_debt
scores:
  requirements: N/M
  phases: N/M
  integration: N/M
  flows: N/M
gaps:  # Critical blockers
  requirements: [...]
  integration: [...]
  flows: [...]
tech_debt:  # Non-critical, deferred
  - phase: 01-auth
    items:
      - "TODO: add rate limiting"
      - "Warning: no password strength validation"
  - phase: 03-dashboard
    items:
      - "Deferred: mobile responsive layout"
---

# Milestone Audit: v{version}

## Summary

**Status:** {PASSED | GAPS FOUND | TECH DEBT}
**Audited:** {timestamp}

| Dimension    | Score   | Notes   |
| ------------ | ------- | ------- |
| Requirements | {N}/{M} | {brief} |
| Phases       | {N}/{M} | {brief} |
| Integration  | {N}/{M} | {brief} |
| E2E Flows    | {N}/{M} | {brief} |

## Requirements Coverage

| REQ-ID  | Description           | Phase | Status    |
| ------- | --------------------- | ----- | --------- |
| AUTH-01 | User can register     | 01    | Satisfied |
| AUTH-02 | User can login        | 01    | Satisfied |
| PROF-01 | User can edit profile | 02    | Partial   |

## Phase Verification

| Phase      | Status     | Gaps | Tech Debt |
| ---------- | ---------- | ---- | --------- |
| 01-auth    | Passed     | 0    | 2 items   |
| 02-profile | Gaps Found | 1    | 1 item    |

## Integration Issues

{List any cross-phase wiring problems}

## E2E Flow Status

{List any broken user flows}

## Tech Debt Summary

{Aggregated list by phase}

## Recommended Action

{Based on status}
```

**Status values:**
- `passed` — all requirements met, no critical gaps, minimal tech debt
- `gaps_found` — critical blockers exist
- `tech_debt` — no blockers but accumulated deferred items need review

## Step 7: Present Results

Route by status:

---

**If passed:** Output this markdown directly (not as a code block):

## Milestone {version} -- Audit Passed

**Score:** {N}/{M} requirements satisfied
**Report:** .planning/v{version}-MILESTONE-AUDIT.md

All requirements covered. Cross-phase integration verified. E2E flows complete.

───────────────────────────────────────────────────────────────

## ▶ Next Action

**Complete milestone** — archive and tag

> Instructions can be given conversationally (recommended) or via /commands.

| Action                      | Natural Trigger      | Explicit Command             |
| --------------------------- | -------------------- | ---------------------------- |
| ⭐ **Complete milestone**   | "Complete milestone" | `/kata-manageing-milestones` |

<sub>★ recommended · /clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

---

**If gaps_found:** Output this markdown directly (not as a code block):

## Milestone {version} -- Gaps Found

**Score:** {N}/{M} requirements satisfied
**Report:** .planning/v{version}-MILESTONE-AUDIT.md

### Unsatisfied Requirements

- **{REQ-ID}: {description}** (Phase {X})
  - {reason}

### Cross-Phase Issues

- **{from} -> {to}:** {issue}

### Broken Flows

- **{flow name}:** breaks at {step}

───────────────────────────────────────────────────────────────

## ▶ Next Action

**Plan gap closure** — create phases to complete milestone

> Instructions can be given conversationally (recommended) or via /commands.

| Action             | Natural Trigger      | Explicit Command                 |
| ------------------ | -------------------- | -------------------------------- |
| ⭐ **Plan gaps**   | "Plan gaps"          | `/kata-managing-project-roadmap` |
| Complete anyway    | "Complete milestone" | `/kata-manageing-milestones`     |

<sub>★ recommended · /clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

---

**If tech_debt (no blockers but accumulated debt):** Output this markdown directly (not as a code block):

## Milestone {version} -- Tech Debt Review

**Score:** {N}/{M} requirements satisfied
**Report:** .planning/v{version}-MILESTONE-AUDIT.md

All requirements met. No critical blockers. Accumulated tech debt needs review.

### Tech Debt by Phase

**Phase {X}: {name}**
- {item 1}
- {item 2}

### Total: {N} items across {M} phases

───────────────────────────────────────────────────────────────

## ▶ Next Action

**Tech debt review** — complete with debt or plan cleanup

> Instructions can be given conversationally (recommended) or via /commands.

| Action                    | Natural Trigger      | Explicit Command                 |
| ------------------------- | -------------------- | -------------------------------- |
| ⭐ **Complete milestone** | "Complete milestone" | `/kata-manageing-milestones`     |
| Plan cleanup phase        | "Plan gaps"          | `/kata-managing-project-roadmap` |

<sub>★ recommended · /clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

## Integration with Gap Planning

When gaps are found, the `/kata-managing-project-roadmap` skill uses the audit report:

1. Reads `v{version}-MILESTONE-AUDIT.md`
2. Extracts gap list from frontmatter
3. Creates phases to close gaps
4. Re-runs audit after gap phases complete

This creates a loop: audit -> plan gaps -> execute -> audit again.

## Success Criteria

- [ ] Milestone scope identified
- [ ] All phase VERIFICATION.md files read
- [ ] Tech debt and deferred gaps aggregated
- [ ] Integration checker spawned for cross-phase wiring
- [ ] Requirements coverage checked
- [ ] v{version}-MILESTONE-AUDIT.md created
- [ ] Results presented with actionable next steps
- [ ] Correct routing based on status
