# Progress Display Reference

Formatting and routing logic for the PROGRESS operation.

## Progress Report Format

```
# [Project Name]

**Progress:** [PROGRESS_BAR] X/Y plans complete

## Recent Work
- [Phase X, Plan Y]: [what was accomplished - 1 line]
- [Phase X, Plan Z]: [what was accomplished - 1 line]

## Current Position
Phase [N] of [total]: [phase-name]
Plan [M] of [phase-total]: [status]
CONTEXT: [OK if CONTEXT.md exists | - if not]

## Key Decisions Made
- [decision 1 from STATE.md]
- [decision 2]

## Blockers/Concerns
- [any blockers or concerns from STATE.md]

## Pending Todos
- [count] pending - /kata:check-todos to review

## Active Debug Sessions
- [count] active - /kata:debug to continue
(Only show if count > 0)

## What's Next
[Next phase/plan objective from ROADMAP]
```

## Progress Bar Calculation

Calculate from plan counts:

```bash
# Count total plans across all phases
TOTAL_PLANS=$(find .planning/phases -name "*-PLAN.md" 2>/dev/null | wc -l)

# Count completed plans (those with SUMMARY.md)
COMPLETED=$(find .planning/phases -name "*-SUMMARY.md" 2>/dev/null | wc -l)

# Calculate percentage
PERCENT=$((COMPLETED * 100 / TOTAL_PLANS))
```

Progress bar rendering:
- `[FULL_BLOCK]` for each 10% completed
- `[EMPTY_BLOCK]` for remaining

Example: 35% = `[===.......] 35%`

## Phase Completion Tracking

For each phase, track:
- Total plans in phase
- Completed plans (has matching SUMMARY.md)
- Status: Not started | In progress | Complete

## Performance Metrics

From STATE.md Performance Metrics section:

```
**Velocity:**
- Total plans completed: [N]
- Average duration: [X] min
- Total execution time: [Y] min

**By Phase:**
| Phase | Plans | Total | Avg/Plan |
| ----- | ----- | ----- | -------- |
| ...   | ...   | ...   | ...      |
```

## "Where Am I" Quick Summary

When user asks "where am I" or similar, provide compressed view:

```
Building: [one-liner from PROJECT.md]
Phase [X]/[Y]: [name] - [X]% complete
Next: [immediate next action]
```

## Routing Logic

After presenting status, determine next action.

### Step 1: Count Files in Current Phase

```bash
PLAN_COUNT=$(ls -1 .planning/phases/[current-phase-dir]/*-PLAN.md 2>/dev/null | wc -l)
SUMMARY_COUNT=$(ls -1 .planning/phases/[current-phase-dir]/*-SUMMARY.md 2>/dev/null | wc -l)
UAT_GAPS=$(grep -l "status: diagnosed" .planning/phases/[current-phase-dir]/*-UAT.md 2>/dev/null | wc -l)
```

### Step 2: Route Based on Counts

| Condition                                     | Meaning                 | Route   |
| --------------------------------------------- | ----------------------- | ------- |
| UAT_GAPS > 0                                  | UAT gaps need fix plans | Route E |
| SUMMARY_COUNT < PLAN_COUNT                    | Unexecuted plans exist  | Route A |
| SUMMARY_COUNT = PLAN_COUNT AND PLAN_COUNT > 0 | Phase complete          | Step 3  |
| PLAN_COUNT = 0                                | Phase not yet planned   | Route B |

### Route A: Unexecuted Plan Exists

Find first PLAN.md without matching SUMMARY.md. Output this markdown directly (not as a code block):

───────────────────────────────────────────────────────────────

## ▶ Next Action

**{phase}-{plan}: [Plan Name]** — [objective from PLAN.md]

`/kata-executing-project-phases {phase}`

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

### Route B: Phase Needs Planning

Check if `{phase}-CONTEXT.md` exists.

**If CONTEXT.md exists:** Output this markdown directly (not as a code block):

───────────────────────────────────────────────────────────────

## ▶ Next Action

**Phase {N}: {Name}** — {Goal from ROADMAP.md}
Context gathered, ready to plan

`/kata-planning-phases {N}`

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**If CONTEXT.md does NOT exist:** Output this markdown directly (not as a code block):

───────────────────────────────────────────────────────────────

## ▶ Next Action

**Phase {N}: {Name}** — {Goal from ROADMAP.md}

`/kata-researching-phases {N}`

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- /kata-planning-phases {N} — plan directly without research

───────────────────────────────────────────────────────────────

### Step 3: Check Milestone Status (Phase Complete)

Read ROADMAP.md, identify current phase and highest phase in milestone.

| Condition         | Meaning            | Route   |
| ----------------- | ------------------ | ------- |
| current < highest | More phases remain | Route C |
| current = highest | Milestone complete | Route D |

### Route C: Phase Complete, More Phases Remain

Output this markdown directly (not as a code block):

───────────────────────────────────────────────────────────────

## ✓ Phase {Z} Complete

## ▶ Next Action

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

`/kata-verifying-work-outcomes-and-user-acceptance-testing {Z}`

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- /kata-planning-phases {Z+1} — plan next phase
- /kata-researching-phases {Z+1} — research first

───────────────────────────────────────────────────────────────

### Route D: Milestone Complete

Output this markdown directly (not as a code block):

───────────────────────────────────────────────────────────────

## 🎉 Milestone Complete

All {N} phases finished!

## ▶ Next Action

**Complete Milestone** — archive and prepare for next

`/kata-manageing-milestones complete`

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- /kata-verifying-work-outcomes-and-user-acceptance-testing — run UAT first

───────────────────────────────────────────────────────────────

### Route E: UAT Gaps Found

Output this markdown directly (not as a code block):

───────────────────────────────────────────────────────────────

## ⚠ UAT Gaps Found

**{phase}-UAT.md** has {N} gaps requiring fixes.

## ▶ Next Action

**Close gaps** — create fix plans

`/kata-planning-phases {phase} --gaps`

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- /kata-executing-project-phases {phase} — execute existing plans
- /kata-verifying-work-outcomes-and-user-acceptance-testing — run more UAT

───────────────────────────────────────────────────────────────

### Route F: Between Milestones

When ROADMAP.md missing but PROJECT.md exists (milestone completed and archived). Output this markdown directly (not as a code block):

───────────────────────────────────────────────────────────────

## ✓ Milestone v{X.Y} Complete

Ready to plan the next milestone.

## ▶ Next Action

**Start Next Milestone** — questioning → research → requirements → roadmap

`/kata-manageing-milestones new`

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

## Edge Case Handling

- **Phase complete but next not planned:** Offer "Plan phase [next]" → `/kata-planning-phases`
- **All work complete:** Offer milestone completion
- **Blockers present:** Highlight before offering to continue
- **Handoff file exists:** Mention it, offer "Resume work"
