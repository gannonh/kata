---
name: kata-execution
description: Use this skill when executing phases, running plans, handling checkpoints, creating summaries, or managing deviations during plan execution. Triggers include "execute phase", "run plans", "execute PLAN.md", "handle deviations", "checkpoint", "create summary", "wave execution", and "parallel plan execution". This skill orchestrates kata-executor sub-agents for wave-based parallel execution.
---

# Phase Execution Orchestrator

Executes phase plans with wave-based parallelization, checkpoint handling, deviation management, and verification.

## When to Use

- User asks to "execute phase N" or "run the plans"
- User wants to run all plans in a phase
- User needs help handling checkpoints during execution
- User asks about deviations or verification

## Workflow Overview

```
1. Validate phase exists and has plans
2. Group plans by wave from frontmatter
3. For each wave, spawn kata-executor sub-agents in parallel
4. Handle checkpoint returns and user interactions
5. Verify phase goal achievement
6. Update STATE.md and ROADMAP.md
7. Present results and next steps
```

## Execution Flow

### Step 1: Load Project State

Before any operation, read project state:

```bash
cat .planning/STATE.md 2>/dev/null
```

Parse and internalize:
- Current position (phase, plan, status)
- Accumulated decisions (constraints on execution)
- Blockers/concerns (things to watch for)

If `.planning/` doesn't exist, error - project not initialized.

### Step 2: Validate Phase

Extract phase number from user request. Normalize to zero-padded format:

```bash
PADDED_PHASE=$(printf "%02d" ${PHASE_ARG} 2>/dev/null || echo "${PHASE_ARG}")
PHASE_DIR=$(ls -d .planning/phases/${PADDED_PHASE}-* .planning/phases/${PHASE_ARG}-* 2>/dev/null | head -1)
```

Count plans in phase:

```bash
PLAN_COUNT=$(ls -1 "$PHASE_DIR"/*-PLAN.md 2>/dev/null | wc -l | tr -d ' ')
```

If no plans found, error and suggest `/kata:plan-phase`.

### Step 3: Discover Plans

List all plans and check completion status:

```bash
# All plans
ls -1 "$PHASE_DIR"/*-PLAN.md 2>/dev/null | sort

# Completed plans (have SUMMARY.md)
ls -1 "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null | sort
```

For each plan, extract from frontmatter:
- `wave: N` - Pre-computed execution wave
- `autonomous: true/false` - Whether plan has checkpoints
- `gap_closure: true/false` - Whether plan closes verification gaps

**Filtering:**
- Skip completed plans (have SUMMARY.md)
- If `--gaps-only` flag: also skip plans where `gap_closure` is not `true`

If all plans filtered out: "No matching incomplete plans" and exit.

### Step 4: Group by Wave

Read `wave` from each plan's frontmatter and group:

```bash
for plan in $PHASE_DIR/*-PLAN.md; do
  wave=$(grep "^wave:" "$plan" | cut -d: -f2 | tr -d ' ')
  echo "$plan:$wave"
done
```

Report wave structure:

```
## Execution Plan

**Phase {X}: {Name}** - {total_plans} plans across {wave_count} waves

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 01, 02 | [from objectives] |
| 2 | 03 | [from objective] |
```

### Step 5: Execute Waves

For each wave in sequence:

**1. Describe what's being built (BEFORE spawning):**

Read each plan's `<objective>` section. Output:

```
---
## Wave {N}

**{Plan ID}: {Plan Name}**
{2-3 sentences: what this builds, key technical approach, why it matters}

Spawning {count} agent(s)...
---
```

**2. Spawn kata-executor sub-agents in parallel:**

Use Task tool with multiple parallel calls:

```
Task(
  prompt="Execute plan at {plan_path}

<objective>
Execute plan {plan_number} of phase {phase_number}-{phase_name}.
Commit each task atomically. Create SUMMARY.md. Update STATE.md.
</objective>

<execution_context>
@./references/deviation-rules.md
@./references/checkpoint-protocol.md
@./references/tdd-execution.md
@./references/commit-protocol.md
</execution_context>

<context>
Plan: @{plan_path}
Project state: @.planning/STATE.md
</context>

<success_criteria>
- [ ] All tasks executed
- [ ] Each task committed individually
- [ ] SUMMARY.md created in plan directory
- [ ] STATE.md updated with position and decisions
</success_criteria>",
  subagent_type="kata-executor"
)
```

**3. Wait for all agents in wave to complete.**

Task tool blocks until each agent finishes. All parallel agents return together.

**4. Report wave completion:**

```
---
## Wave {N} Complete

**{Plan ID}: {Plan Name}**
{What was built - from SUMMARY.md deliverables}
{Notable deviations or discoveries, if any}
---
```

**5. Handle checkpoint returns:**

If any agent returns with checkpoint state instead of completion, see `./references/checkpoint-protocol.md` for handling user interaction and spawning continuation agents.

**6. Proceed to next wave.**

### Step 6: Handle Failures

If any agent in wave fails:
- Report which plan failed and why
- Ask user: "Continue with remaining waves?" or "Stop execution?"
- If continue: proceed to next wave (dependent plans may also fail)
- If stop: exit with partial completion report

### Step 7: Verify Phase Goal

After all waves complete, spawn kata-verifier:

```
Task(
  prompt="Verify phase {phase_number} goal achievement.
Phase directory: {phase_dir}
Phase goal: {goal from ROADMAP.md}
Check must_haves against actual codebase. Create VERIFICATION.md.",
  subagent_type="kata-verifier"
)
```

Route by verification status:
- `passed` - Continue to state updates
- `human_needed` - Present checklist, get approval
- `gaps_found` - Present gaps, offer `/kata:plan-phase {X} --gaps`

### Step 8: Update State

**Update ROADMAP.md:**
- Mark phase complete if all plans done
- Add completion date

**Update STATE.md:**
- Current position (phase, plan, status)
- Progress bar
- Session continuity

**Update REQUIREMENTS.md (if exists):**
- Mark phase requirements as Complete

### Step 9: Commit Phase Completion

Bundle all phase metadata updates:

```bash
git add .planning/ROADMAP.md .planning/STATE.md
git add .planning/REQUIREMENTS.md  # if updated
git add "$PHASE_DIR"/*-VERIFICATION.md
git commit -m "docs({phase}): complete {phase-name} phase"
```

### Step 10: Present Results

Route based on status:

**If more phases remain:**
```
KATA > PHASE {Z} COMPLETE

**Phase {Z}: {Name}**
{Y} plans executed
Goal verified

---
## Next Up

**Phase {Z+1}: {Name}** - {Goal}

/kata:plan-phase {Z+1}
```

**If milestone complete:**
```
KATA > MILESTONE COMPLETE

All {N} phases complete!

/kata:complete-milestone
```

**If gaps found:**
```
KATA > PHASE {Z} GAPS FOUND

Score: {N}/{M} must-haves verified

---
## Next Up

/kata:plan-phase {Z} --gaps
```

## Key References

For detailed guidance on specific aspects:

- **Deviation handling:** See `./references/deviation-rules.md` for auto-fix rules and decision tree
- **Checkpoints:** See `./references/checkpoint-protocol.md` for types and return formats
- **TDD execution:** See `./references/tdd-execution.md` for RED-GREEN-REFACTOR cycle
- **Commits:** See `./references/commit-protocol.md` for atomic task commits

## Quality Standards

Execution must satisfy:

- [ ] All incomplete plans in phase executed
- [ ] Each plan has SUMMARY.md
- [ ] Phase goal verified (must_haves checked against codebase)
- [ ] VERIFICATION.md created in phase directory
- [ ] STATE.md reflects phase completion
- [ ] ROADMAP.md updated
- [ ] REQUIREMENTS.md updated (if exists)
- [ ] User informed of next steps

## Sub-Agent Summary

| Agent | Purpose | When Spawned |
|-------|---------|--------------|
| kata-executor | Execute individual plan | For each plan in wave |
| kata-verifier | Verify phase goal | After all plans complete |
