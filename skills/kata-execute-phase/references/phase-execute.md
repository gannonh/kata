<purpose>
Execute all plans in a phase using wave-based parallel execution. Orchestrator stays lean by delegating plan execution to subagents.
</purpose>

<core_principle>
The orchestrator's job is coordination, not execution. Each subagent loads the full execute-plan context itself. Orchestrator discovers plans, analyzes dependencies, groups into waves, spawns agents, handles checkpoints, collects results.
</core_principle>

<required_reading>
Read STATE.md before any operation to load project context.
Read config.json for planning behavior settings.
</required_reading>

<process>

<step name="resolve_model_profile" priority="first">
Read model profile for agent spawning:

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

Default to "balanced" if not set.

**Model lookup table:**

| Agent                       | quality | balanced | budget |
| --------------------------- | ------- | -------- | ------ |
| general-purpose (executor)  | opus    | sonnet   | sonnet |
| general-purpose (verifier)  | sonnet  | sonnet   | haiku  |

Store resolved models for use in Task calls below.
</step>

<step name="load_project_state">
Before any operation, read project state:

```bash
cat .planning/STATE.md 2>/dev/null
```

**If file exists:** Parse and internalize:
- Current position (phase, plan, status)
- Accumulated decisions (constraints on this execution)
- Blockers/concerns (things to watch for)

**If file missing but .planning/ exists:**
```
STATE.md missing but planning artifacts exist.
Options:
1. Reconstruct from existing artifacts
2. Continue without project state (may lose accumulated context)
```

**If .planning/ doesn't exist:** Error - project not initialized.

**Load planning config:**

```bash
# Check if planning docs should be committed (default: true)
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
# Auto-detect gitignored (overrides config)
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

Store `COMMIT_PLANNING_DOCS` for use in git operations.
</step>

<step name="validate_phase">
Confirm phase exists and has plans using universal discovery:

```bash
# Find phase directory across state subdirectories
PADDED=$(printf "%02d" "$PHASE_ARG" 2>/dev/null || echo "$PHASE_ARG")
PHASE_DIR=""
for state in active pending completed; do
  PHASE_DIR=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | head -1)
  [ -z "$PHASE_DIR" ] && PHASE_DIR=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${PHASE_ARG}-*" 2>/dev/null | head -1)
  [ -n "$PHASE_DIR" ] && break
done
# Fallback: flat directory (backward compatibility for unmigrated projects)
if [ -z "$PHASE_DIR" ]; then
  PHASE_DIR=$(find .planning/phases -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | head -1)
  [ -z "$PHASE_DIR" ] && PHASE_DIR=$(find .planning/phases -maxdepth 1 -type d -name "${PHASE_ARG}-*" 2>/dev/null | head -1)
fi

# Collision detection: check for duplicate phase numbering
MATCH_COUNT=0
for state in active pending completed; do
  MATCH_COUNT=$((MATCH_COUNT + $(find .planning/phases/${state} -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | wc -l)))
done
MATCH_COUNT=$((MATCH_COUNT + $(find .planning/phases -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | wc -l)))

if [ "$MATCH_COUNT" -gt 1 ]; then
  echo "COLLISION: ${MATCH_COUNT} directories match prefix '${PADDED}-*'"
  echo "Run /kata-migrate-phases to fix duplicate phase numbering before executing."
  exit 1
fi

if [ -z "$PHASE_DIR" ]; then
  echo "ERROR: No phase directory matching '${PHASE_ARG}'"
  exit 1
fi

# Move from pending to active when execution begins
CURRENT_STATE=$(echo "$PHASE_DIR" | grep -oE '(pending|active|completed)' | head -1)
if [ "$CURRENT_STATE" = "pending" ]; then
  DIR_NAME=$(basename "$PHASE_DIR")
  mkdir -p ".planning/phases/active"
  mv "$PHASE_DIR" ".planning/phases/active/${DIR_NAME}"
  PHASE_DIR=".planning/phases/active/${DIR_NAME}"
  echo "Phase moved to active/"
fi

PLAN_COUNT=$(find "$PHASE_DIR" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null | wc -l | tr -d ' ')
if [ "$PLAN_COUNT" -eq 0 ]; then
  echo "ERROR: No plans found in $PHASE_DIR"
  exit 1
fi
```

Report: "Found {N} plans in {phase_dir}"
</step>

<step name="discover_plans">
List all plans and extract metadata:

```bash
# Get all plans
find "$PHASE_DIR" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null | sort

# Get completed plans (have SUMMARY.md)
find "$PHASE_DIR" -maxdepth 1 -name "*-SUMMARY.md" 2>/dev/null | sort
```

For each plan, read frontmatter to extract:
- `wave: N` - Execution wave (pre-computed)
- `autonomous: true/false` - Whether plan has checkpoints
- `gap_closure: true/false` - Whether plan closes gaps from verification/UAT

Build plan inventory:
- Plan path
- Plan ID (e.g., "03-01")
- Wave number
- Autonomous flag
- Gap closure flag
- Completion status (SUMMARY exists = complete)

**Filtering:**
- Skip completed plans (have SUMMARY.md)
- If `--gaps-only` flag: also skip plans where `gap_closure` is not `true`

If all plans filtered out, report "No matching incomplete plans" and exit.
</step>

<step name="group_by_wave">
Read `wave` from each plan's frontmatter and group by wave number:

```bash
# For each plan, extract wave from frontmatter
for plan in $(find "$PHASE_DIR" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null); do
  wave=$(grep "^wave:" "$plan" | cut -d: -f2 | tr -d ' ')
  autonomous=$(grep "^autonomous:" "$plan" | cut -d: -f2 | tr -d ' ')
  echo "$plan:$wave:$autonomous"
done
```

**Group plans:**
```
waves = {
  1: [plan-01, plan-02],
  2: [plan-03, plan-04],
  3: [plan-05]
}
```

**No dependency analysis needed.** Wave numbers are pre-computed during `/kata-plan-phase`.

Report wave structure with context:
```
## Execution Plan

**Phase {X}: {Name}** — {total_plans} plans across {wave_count} waves

| Wave | Plans              | What it builds         |
| ---- | ------------------ | ---------------------- |
| 1    | 01-01, 01-02       | {from plan objectives} |
| 2    | 01-03              | {from plan objectives} |
| 3    | 01-04 [checkpoint] | {from plan objectives} |

```

The "What it builds" column comes from skimming plan names/objectives. Keep it brief (3-8 words).
</step>

<step name="execute_waves">
Execute each wave in sequence. Autonomous plans within a wave run in parallel.

**For each wave:**

1. **Describe what's being built (BEFORE spawning):**

   Read each plan's `<objective>` section. Extract what's being built and why it matters.

   **Output:**
   ```
   ---

   ## Wave {N}

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, key technical approach, why it matters in context}

   **{Plan ID}: {Plan Name}** (if parallel)
   {same format}

   Spawning {count} agent(s)...

   ---
   ```

   **Examples:**
   - Bad: "Executing terrain generation plan"
   - Good: "Procedural terrain generator using Perlin noise — creates height maps, biome zones, and collision meshes. Required before vehicle physics can interact with ground."

2. **Read files and spawn all autonomous agents in wave simultaneously:**

   Before spawning, read file contents. The `@` syntax does not work across Task() boundaries - content must be inlined.

   ```bash
   # Read each plan in the wave
   PLAN_CONTENT=$(cat "{plan_path}")
   STATE_CONTENT=$(cat .planning/STATE.md)
   CONFIG_CONTENT=$(cat .planning/config.json 2>/dev/null)
   ```

   Use Task tool with multiple parallel calls. Each agent gets prompt with inlined content:

   ```
   <objective>
   Execute plan {plan_number} of phase {phase_number}-{phase_name}.

   Commit each task atomically. Create SUMMARY.md. Update STATE.md.
   </objective>

   <execution_context>
   @./execute-plan.md
   @./summary-template.md
   @./checkpoints.md
   @./tdd.md
   </execution_context>

   <context>
   Plan:
   {plan_content}

   Project state:
   {state_content}

   Config (if exists):
   {config_content}
   </context>

   <success_criteria>
   - [ ] All tasks executed
   - [ ] Each task committed individually
   - [ ] SUMMARY.md created in plan directory
   - [ ] STATE.md updated with position and decisions
   </success_criteria>
   ```

2. **Wait for all agents in wave to complete:**

   Task tool blocks until each agent finishes. All parallel agents return together.

3. **Report completion and what was built:**

   For each completed agent:
   - Verify SUMMARY.md exists at expected path
   - Read SUMMARY.md to extract what was built
   - Note any issues or deviations

   **Output:**
   ```
   ---

   ## Wave {N} Complete

   **{Plan ID}: {Plan Name}**
   {What was built — from SUMMARY.md deliverables}
   {Notable deviations or discoveries, if any}

   **{Plan ID}: {Plan Name}** (if parallel)
   {same format}

   {If more waves: brief note on what this enables for next wave}

   ---
   ```

   **Examples:**
   - Bad: "Wave 2 complete. Proceeding to Wave 3."
   - Good: "Terrain system complete — 3 biome types, height-based texturing, physics collision meshes. Vehicle physics (Wave 3) can now reference ground surfaces."

4. **Handle failures:**

   If any agent in wave fails:
   - Report which plan failed and why
   - Ask user: "Continue with remaining waves?" or "Stop execution?"
   - If continue: proceed to next wave (dependent plans may also fail)
   - If stop: exit with partial completion report

5. **Execute checkpoint plans between waves:**

   See `<checkpoint_handling>` for details.

6. **Proceed to next wave**

</step>

<step name="checkpoint_handling">
Plans with `autonomous: false` require user interaction.

**Detection:** Check `autonomous` field in frontmatter.

**Execution flow for checkpoint plans:**

1. **Spawn agent for checkpoint plan:**
   ```
   Task(prompt="<agent-instructions>\n{executor_instructions_content}\n</agent-instructions>\n\n{subagent-task-prompt}", subagent_type="general-purpose", model="{executor_model}")
   ```

2. **Agent runs until checkpoint:**
   - Executes auto tasks normally
   - Reaches checkpoint task (e.g., `type="checkpoint:human-verify"`) or auth gate
   - Agent returns with structured checkpoint (see checkpoint-return.md template)

3. **Agent return includes (structured format):**
   - Completed Tasks table with commit hashes and files
   - Current task name and blocker
   - Checkpoint type and details for user
   - What's awaited from user

4. **Orchestrator presents checkpoint to user:**

   Extract and display the "Checkpoint Details" and "Awaiting" sections from agent return:
   ```
   ## Checkpoint: [Type]

   **Plan:** 03-03 Dashboard Layout
   **Progress:** 2/3 tasks complete

   [Checkpoint Details section from agent return]

   [Awaiting section from agent return]
   ```

5. **User responds:**
   - "approved" / "done" → spawn continuation agent
   - Description of issues → spawn continuation agent with feedback
   - Decision selection → spawn continuation agent with choice

6. **Spawn continuation agent (NOT resume):**

   Use the continuation-prompt.md template:
   ```
   Task(
     prompt=filled_continuation_template,
     subagent_type="general-purpose",
     model="{executor_model}"
   )
   ```

   Fill template with:
   - `{completed_tasks_table}`: From agent's checkpoint return
   - `{resume_task_number}`: Current task from checkpoint
   - `{resume_task_name}`: Current task name from checkpoint
   - `{user_response}`: What user provided
   - `{resume_instructions}`: Based on checkpoint type (see continuation-prompt.md)

7. **Continuation agent executes:**
   - Verifies previous commits exist
   - Continues from resume point
   - May hit another checkpoint (repeat from step 4)
   - Or completes plan

8. **Repeat until plan completes or user stops**

**Why fresh agent instead of resume:**
Resume relies on Claude Code's internal serialization which breaks with parallel tool calls.
Fresh agents with explicit state are more reliable and maintain full context.

**Checkpoint in parallel context:**
If a plan in a parallel wave has a checkpoint:
- Spawn as normal
- Agent pauses at checkpoint and returns with structured state
- Other parallel agents may complete while waiting
- Present checkpoint to user
- Spawn continuation agent with user response
- Wait for all agents to finish before next wave
</step>

<step name="aggregate_results">
After all waves complete, aggregate results:

```markdown
## Phase {X}: {Name} Execution Complete

**Waves executed:** {N}
**Plans completed:** {M} of {total}

### Wave Summary

| Wave | Plans            | Status     |
| ---- | ---------------- | ---------- |
| 1    | plan-01, plan-02 | ✓ Complete |
| CP   | plan-03          | ✓ Verified |
| 2    | plan-04          | ✓ Complete |
| 3    | plan-05          | ✓ Complete |

### Plan Details

1. **03-01**: [one-liner from SUMMARY.md]
2. **03-02**: [one-liner from SUMMARY.md]
...

### Issues Encountered
[Aggregate from all SUMMARYs, or "None"]
```
</step>

<step name="run_test_suite">
Before verification, run the project's test suite to catch regressions early.

```bash
TEST_SCRIPT=$(cat package.json 2>/dev/null | grep -o '"test"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1)
```

**If package.json has a test script:**
- Run `npm test`
- If tests pass: proceed to verify_phase_goal
- If tests fail: report test failures, still proceed to verify_phase_goal

**If no test script detected:**
- Skip this step, proceed to verify_phase_goal

**Skip for gap phases:** If mode is `gap_closure`, skip test suite. Gap closure plans target specific fixes and run their own verification; the full test suite adds latency without value for small patches.
</step>

<step name="verify_phase_goal">
Verify phase achieved its GOAL, not just completed its TASKS.

**Load verifier instructions and spawn:**

```bash
verifier_instructions_content=$(cat references/verifier-instructions.md)
```

```
Task(
  prompt="<agent-instructions>\n{verifier_instructions_content}\n</agent-instructions>\n\nVerify phase {phase_number} goal achievement.

Phase directory: {phase_dir}
Phase goal: {goal from ROADMAP.md}

Check must_haves against actual codebase. Create VERIFICATION.md.
Verify what actually exists in the code.",
  subagent_type="general-purpose",
  model="{verifier_model}"
)
```

**Read verification status:**

```bash
grep "^status:" "$PHASE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

**Route by status:**

| Status         | Action                                                       |
| -------------- | ------------------------------------------------------------ |
| `passed`       | Continue to update_roadmap                                   |
| `human_needed` | Present items to user, get approval or feedback              |
| `gaps_found`   | Present gap summary, offer `/kata-plan-phase {phase} --gaps` |

**If passed:**

Phase goal verified. Validate completion artifacts and move to completed:

```bash
# Validate completion artifacts
PLAN_COUNT=$(find "$PHASE_DIR" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null | wc -l | tr -d ' ')
MISSING=""
if [ "$PLAN_COUNT" -eq 0 ]; then
  MISSING="${MISSING}\n- No PLAN.md files found"
fi
for plan in $(find "$PHASE_DIR" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null); do
  plan_id=$(basename "$plan" | sed 's/-PLAN\.md$//')
  [ ! -f "$PHASE_DIR/${plan_id}-SUMMARY.md" ] && MISSING="${MISSING}\n- Missing SUMMARY.md for ${plan_id}"
done
# Non-gap phases require VERIFICATION.md
IS_GAP=$(find "$PHASE_DIR" -maxdepth 1 -name "*-PLAN.md" -exec grep -l "gap_closure: true" {} + 2>/dev/null | head -1)
if [ -z "$IS_GAP" ] && ! find "$PHASE_DIR" -maxdepth 1 -name "*-VERIFICATION.md" 2>/dev/null | grep -q .; then
  MISSING="${MISSING}\n- Missing VERIFICATION.md (required for non-gap phases)"
fi

if [ -z "$MISSING" ]; then
  DIR_NAME=$(basename "$PHASE_DIR")
  mkdir -p ".planning/phases/completed"
  mv "$PHASE_DIR" ".planning/phases/completed/${DIR_NAME}"
  PHASE_DIR=".planning/phases/completed/${DIR_NAME}"
  echo "Phase validated and moved to completed/"
else
  echo "Warning: Phase incomplete:${MISSING}"
fi
```

Proceed to update_roadmap.

**If human_needed:**

```markdown
## ✓ Phase {X}: {Name} — Human Verification Required

All automated checks passed. {N} items need human testing:

### Human Verification Checklist

{Extract from VERIFICATION.md human_verification section}

---

**After testing:**
- "approved" → continue to update_roadmap
- Report issues → will route to gap closure planning
```

If user approves → continue to update_roadmap.
If user reports issues → treat as gaps_found.

**If gaps_found:**

Present gaps and offer next command:

```markdown
## ⚠ Phase {X}: {Name} — Gaps Found

**Score:** {N}/{M} must-haves verified
**Report:** {phase_dir}/{phase}-VERIFICATION.md

### What's Missing

{Extract gap summaries from VERIFICATION.md gaps section}

---

## ▶ Next Up

**Plan gap closure** — create additional plans to complete the phase

`/kata-plan-phase {X} --gaps`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `cat {phase_dir}/{phase}-VERIFICATION.md` — see full report
- `/kata-verify-work {X}` — manual testing before planning
```

User runs `/kata-plan-phase {X} --gaps` which:
1. Reads VERIFICATION.md gaps
2. Creates additional plans (04, 05, etc.) with `gap_closure: true` to close gaps
3. User then runs `/kata-execute-phase {X} --gaps-only`
4. phase-execute runs only gap closure plans (04-05)
5. Verifier runs again after new plans complete

User stays in control at each decision point.
</step>

<step name="update_roadmap">
Update ROADMAP.md to reflect phase completion:

```bash
# Mark phase complete
# Update completion date
# Update status
```

**Check planning config:**

If `COMMIT_PLANNING_DOCS=false` (set in load_project_state):
- Skip all git operations for .planning/ files
- Planning docs exist locally but are gitignored
- Log: "Skipping planning docs commit (commit_docs: false)"
- Proceed to offer_next step

If `COMMIT_PLANNING_DOCS=true` (default):
- Continue with git operations below

Commit phase completion (roadmap, state, verification):
```bash
git add .planning/ROADMAP.md .planning/STATE.md .planning/phases/{phase_dir}/*-VERIFICATION.md
git add .planning/REQUIREMENTS.md  # if updated
git commit -m "docs(phase-{X}): complete phase execution"
```
</step>

<step name="offer_next">
Present next steps based on milestone status:

**If more phases remain:**
```
## Next Up

**Phase {X+1}: {Name}** — {Goal}

`/kata-plan-phase {X+1}`

<sub>`/clear` first for fresh context</sub>
```

**If milestone complete:**
```
MILESTONE COMPLETE!

All {N} phases executed.

`/kata-complete-milestone`
```
</step>

</process>

<context_efficiency>
**Why this works:**

Orchestrator context usage: ~10-15%
- Read plan frontmatter (small)
- Analyze dependencies (logic, no heavy reads)
- Fill template strings
- Spawn Task calls
- Collect results

Each subagent: Fresh 200k context
- Loads full execute-plan workflow
- Loads templates, references
- Executes plan with full capacity
- Creates SUMMARY, commits

**No polling.** Task tool blocks until completion. No TaskOutput loops.

**No context bleed.** Orchestrator never reads workflow internals. Just paths and results.
</context_efficiency>

<failure_handling>
**Subagent fails mid-plan:**
- SUMMARY.md won't exist
- Orchestrator detects missing SUMMARY
- Reports failure, asks user how to proceed

**Dependency chain breaks:**
- Wave 1 plan fails
- Wave 2 plans depending on it will likely fail
- Orchestrator can still attempt them (user choice)
- Or skip dependent plans entirely

**All agents in wave fail:**
- Something systemic (git issues, permissions, etc.)
- Stop execution
- Report for manual investigation

**Checkpoint fails to resolve:**
- User can't approve or provides repeated issues
- Ask: "Skip this plan?" or "Abort phase execution?"
- Record partial progress in STATE.md
</failure_handling>

<resumption>
**Resuming interrupted execution:**

If phase execution was interrupted (context limit, user exit, error):

1. Run `/kata-execute-phase {phase}` again
2. discover_plans finds completed SUMMARYs
3. Skips completed plans
4. Resumes from first incomplete plan
5. Continues wave-based execution

**STATE.md tracks:**
- Last completed plan
- Current wave
- Any pending checkpoints
</resumption>
