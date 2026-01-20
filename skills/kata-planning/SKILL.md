---
name: kata-planning
description: Use this skill when planning phases, creating execution plans, breaking down work into tasks, preparing for phase execution, or analyzing what work needs to be done. Triggers include "plan phase", "create plan", "task breakdown", "dependency analysis", "wave assignment", and "goal-backward verification". This skill orchestrates research, planning, and verification sub-agents.
---

# Phase Planning Orchestrator

Creates executable phase prompts (PLAN.md files) with task breakdown, dependency analysis, and goal-backward verification.

## When to Use

- User asks to "plan phase N" or "plan the next phase"
- User wants to create execution plans for a roadmap phase
- User needs help breaking down work into tasks
- User asks about dependencies or parallel execution

## Workflow Overview

```
1. Validate phase exists
2. Research domain (if needed)
3. Spawn kata-planner to create PLAN.md files
4. Spawn kata-plan-checker to verify plans
5. Iterate until plans pass (max 3 iterations)
6. Present results
```

## Execution Flow

### Step 1: Validate Environment

Check for Kata project structure:

```bash
ls .planning/ 2>/dev/null
```

If not found, user should run `/kata:new-project` first.

### Step 2: Parse Context

Extract from user request:
- Phase number (integer or decimal like `2.1`)
- Research preference (force, skip, or auto)
- Gap closure mode (for verification failures)
- Verification skip flag

**If no phase specified:** Detect next unplanned phase from ROADMAP.md.

**Normalize phase to zero-padded format:**

```bash
# 8 -> 08, but preserve decimals like 2.1 -> 02.1
if [[ "$PHASE" =~ ^[0-9]+$ ]]; then
  PHASE=$(printf "%02d" "$PHASE")
elif [[ "$PHASE" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
  PHASE=$(printf "%02d.%s" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}")
fi
```

### Step 3: Validate Phase

```bash
grep -A5 "Phase ${PHASE}:" .planning/ROADMAP.md 2>/dev/null
```

If not found, list available phases for user.

### Step 4: Ensure Phase Directory

```bash
PHASE_DIR=$(ls -d .planning/phases/${PHASE}-* 2>/dev/null | head -1)
if [ -z "$PHASE_DIR" ]; then
  PHASE_NAME=$(grep "Phase ${PHASE}:" .planning/ROADMAP.md | sed 's/.*Phase [0-9]*: //' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  mkdir -p ".planning/phases/${PHASE}-${PHASE_NAME}"
  PHASE_DIR=".planning/phases/${PHASE}-${PHASE_NAME}"
fi
```

### Step 5: Handle Research

**Skip research if:**
- Gap closure mode (uses VERIFICATION.md instead)
- User explicitly requested skip
- RESEARCH.md already exists (unless force research)

**If research needed:**

Display stage banner:
```
KATA > RESEARCHING PHASE {X}
Spawning researcher...
```

Spawn kata-phase-researcher:

```
Task(
  prompt=research_prompt,
  subagent_type="kata-phase-researcher",
  description="Research Phase {phase}"
)
```

Research prompt template:
```markdown
<objective>
Research how to implement Phase {phase_number}: {phase_name}
Answer: "What do I need to know to PLAN this phase well?"
</objective>

<context>
**Phase description:** {from ROADMAP.md}
**Requirements:** {from REQUIREMENTS.md if exists}
**Prior decisions:** {from STATE.md}
**Phase context:** {from CONTEXT.md if exists}
</context>

<output>
Write research findings to: {phase_dir}/{phase}-RESEARCH.md
</output>
```

### Step 6: Spawn Planner

Display stage banner:
```
KATA > PLANNING PHASE {X}
Spawning planner...
```

Gather context paths:
- STATE.md, ROADMAP.md, REQUIREMENTS.md (required)
- CONTEXT.md, RESEARCH.md (if exist)
- VERIFICATION.md, UAT.md (if gap closure mode)

Spawn kata-planner:

```
Task(
  prompt=planner_prompt,
  subagent_type="kata-planner",
  description="Plan Phase {phase}"
)
```

Planner prompt template:
```markdown
<planning_context>
**Phase:** {phase_number}
**Mode:** {standard | gap_closure}

@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md (if exists)
@{phase_dir}/{phase}-CONTEXT.md (if exists)
@{phase_dir}/{phase}-RESEARCH.md (if exists)
</planning_context>

<downstream_consumer>
Plans consumed by /kata:execute-phase
Each plan needs: frontmatter, tasks, verification, must_haves
</downstream_consumer>
```

### Step 7: Spawn Plan Checker

If verification not skipped:

Display:
```
KATA > VERIFYING PLANS
Spawning plan checker...
```

Spawn kata-plan-checker:

```
Task(
  prompt=checker_prompt,
  subagent_type="kata-plan-checker",
  description="Verify Phase {phase} plans"
)
```

Checker prompt template:
```markdown
<verification_context>
**Phase:** {phase_number}
**Phase Goal:** {goal from ROADMAP}
**Plans to verify:** @{phase_dir}/*-PLAN.md
**Requirements:** @.planning/REQUIREMENTS.md (if exists)
</verification_context>

<expected_output>
Return one of:
- ## VERIFICATION PASSED
- ## ISSUES FOUND (with structured issue list)
</expected_output>
```

### Step 8: Handle Revision Loop

**If VERIFICATION PASSED:** Proceed to completion.

**If ISSUES FOUND:**

Track iteration count (max 3).

If iterations remain, spawn kata-planner with revision prompt:

```markdown
<revision_context>
**Phase:** {phase_number}
**Mode:** revision
**Existing plans:** @{phase_dir}/*-PLAN.md
**Checker issues:** {structured_issues}
</revision_context>

<instructions>
Make targeted updates to address checker issues.
Do NOT replan from scratch unless issues are fundamental.
</instructions>
```

After revision, re-verify with checker.

**If max iterations reached:**

Present remaining issues and offer:
1. Force proceed (execute despite issues)
2. Provide guidance (user gives direction, retry)
3. Abandon planning

### Step 9: Present Results

Output completion banner:

```
KATA > PHASE {X} PLANNED

**Phase {X}: {Name}** - {N} plan(s) in {M} wave(s)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1    | 01, 02 | [objectives]   |
| 2    | 03     | [objective]    |

Research: {Completed | Used existing | Skipped}
Verification: {Passed | Passed with override | Skipped}

───────────────────────────────────────────────────────────────

## ▶ Next Action

**Execute Phase {X}** — run all {N} plans

> Instructions can be given conversationally (recommended) or via /commands.

| Action | Natural Trigger | Explicit Command |
|--------|-----------------|------------------|
| **Execute the phase** | "Execute phase {X}" | `/kata-execution` |

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────
```

## Key References

For detailed guidance on specific aspects:

- **Task breakdown:** See `./references/task-breakdown.md` for task sizing, TDD detection, specificity examples
- **Dependency graphs:** See `./references/dependency-graph.md` for wave assignment, parallel execution
- **Goal-backward:** See `./references/goal-backward.md` for must_haves derivation methodology
- **Plan format:** See `./references/plan-format.md` for PLAN.md structure and frontmatter

## Quality Standards

Plans must satisfy:

- [ ] 2-3 tasks per plan (target ~50% context usage)
- [ ] Each task has: files, action, verify, done
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from phase goal
- [ ] Frontmatter complete (phase, plan, wave, depends_on, files_modified, autonomous)

## Sub-Agent Summary

| Agent | Purpose | When Spawned |
|-------|---------|--------------|
| kata-phase-researcher | Research domain for phase | If research needed |
| kata-planner | Create PLAN.md files | Always |
| kata-plan-checker | Verify plans meet standards | Unless --skip-verify |
