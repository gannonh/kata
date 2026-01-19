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
|-------|-------|-------|----------|
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

| Condition | Meaning | Route |
|-----------|---------|-------|
| UAT_GAPS > 0 | UAT gaps need fix plans | Route E |
| SUMMARY_COUNT < PLAN_COUNT | Unexecuted plans exist | Route A |
| SUMMARY_COUNT = PLAN_COUNT AND PLAN_COUNT > 0 | Phase complete | Step 3 |
| PLAN_COUNT = 0 | Phase not yet planned | Route B |

### Route A: Unexecuted Plan Exists

Find first PLAN.md without matching SUMMARY.md.

```
---

## NEXT_UP

**{phase}-{plan}: [Plan Name]** - [objective from PLAN.md]

`/kata:execute-phase {phase}`

<sub>`/clear` first -> fresh context window</sub>

---
```

### Route B: Phase Needs Planning

Check if `{phase}-CONTEXT.md` exists.

**If CONTEXT.md exists:**
```
---

## NEXT_UP

**Phase {N}: {Name}** - {Goal from ROADMAP.md}
<sub>Context gathered, ready to plan</sub>

`/kata:plan-phase {phase-number}`

<sub>`/clear` first -> fresh context window</sub>

---
```

**If CONTEXT.md does NOT exist:**
```
---

## NEXT_UP

**Phase {N}: {Name}** - {Goal from ROADMAP.md}

`/kata:discuss-phase {phase}` - gather context and clarify approach

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- `/kata:plan-phase {phase}` - skip discussion, plan directly
- `/kata:list-phase-assumptions {phase}` - see Claude's assumptions

---
```

### Step 3: Check Milestone Status (Phase Complete)

Read ROADMAP.md, identify current phase and highest phase in milestone.

| Condition | Meaning | Route |
|-----------|---------|-------|
| current < highest | More phases remain | Route C |
| current = highest | Milestone complete | Route D |

### Route C: Phase Complete, More Phases Remain

```
---

## CHECKMARK Phase {Z} Complete

## NEXT_UP

**Phase {Z+1}: {Name}** - {Goal from ROADMAP.md}

`/kata:discuss-phase {Z+1}` - gather context and clarify approach

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- `/kata:plan-phase {Z+1}` - skip discussion, plan directly
- `/kata:verify-work {Z}` - user acceptance test before continuing

---
```

### Route D: Milestone Complete

```
---

## CELEBRATION Milestone Complete

All {N} phases finished!

## NEXT_UP

**Complete Milestone** - archive and prepare for next

`/kata:complete-milestone`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- `/kata:verify-work` - user acceptance test before completing milestone

---
```

### Route E: UAT Gaps Found

```
---

## WARNING UAT Gaps Found

**{phase}-UAT.md** has {N} gaps requiring fixes.

`/kata:plan-phase {phase} --gaps`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- `/kata:execute-phase {phase}` - execute phase plans
- `/kata:verify-work {phase}` - run more UAT testing

---
```

### Route F: Between Milestones

When ROADMAP.md missing but PROJECT.md exists (milestone completed and archived):

```
---

## CHECKMARK Milestone v{X.Y} Complete

Ready to plan the next milestone.

## NEXT_UP

**Start Next Milestone** - questioning -> research -> requirements -> roadmap

`/kata:new-milestone`

<sub>`/clear` first -> fresh context window</sub>

---
```

## Edge Case Handling

- **Phase complete but next not planned:** Offer `/kata:plan-phase [next]`
- **All work complete:** Offer milestone completion
- **Blockers present:** Highlight before offering to continue
- **Handoff file exists:** Mention it, offer `/kata:resume-work`
