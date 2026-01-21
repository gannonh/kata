# Command Reference

Complete reference for all Kata commands with usage examples and tips.

## Command Categories

Commands are organized by workflow phase to match how developers think about their work.

### Project Setup

Initialize and monitor Kata projects.

#### `/kata:project-new`

Initialize new Kata project with vision, goals, and requirements.

**Usage:**
```
/kata:project-new
```

**What it does:**
1. Creates `.planning/` directory structure
2. Prompts for project vision and goals
3. Creates PROJECT.md, STATE.md
4. Optionally creates first milestone

**When to use:**
- Starting a new project
- Adopting Kata for existing project

**Related:**
- `/kata:milestone-new` — create first milestone
- `/kata:project-status` — check project state

---

#### `/kata:project-status`

Show current phase progress, velocity, and project health.

**Usage:**
```
/kata:project-status
```

**What it does:**
1. Reads STATE.md for current position
2. Calculates completion percentage
3. Shows velocity metrics (plans/time)
4. Lists pending todos and blockers

**When to use:**
- Check where you are in the roadmap
- Review progress before planning sessions
- Identify bottlenecks or blockers

**Related:**
- `/kata:milestone-audit` — deep milestone health check
- `/kata:workflow-debug` — diagnose execution issues

---

### Milestones

Manage release boundaries and deliverables.

#### `/kata:milestone-new`

Create new milestone with goals and acceptance criteria.

**Usage:**
```
/kata:milestone-new
```

**What it does:**
1. Prompts for milestone name and version
2. Captures goals and success criteria
3. Creates MILESTONES.md entry
4. Updates STATE.md with new milestone

**When to use:**
- After project initialization
- When previous milestone completes
- Planning next release

**Related:**
- `/kata:roadmap-plan-gaps` — generate phases for milestone
- `/kata:phase-add` — manually add phases

---

#### `/kata:milestone-complete`

Mark milestone as complete and archive.

**Usage:**
```
/kata:milestone-complete
```

**What it does:**
1. Verifies all phases complete
2. Prompts for completion notes
3. Archives milestone in MILESTONES.md
4. Updates STATE.md

**When to use:**
- All milestone phases verified
- Ready to release or tag version

**Related:**
- `/kata:milestone-audit` — pre-completion health check
- `/kata:milestone-new` — start next milestone

---

#### `/kata:milestone-audit`

Review milestone health, identify risks, suggest corrections.

**Usage:**
```
/kata:milestone-audit
```

**What it does:**
1. Analyzes phase completion rates
2. Reviews todos and blockers
3. Identifies scope creep or delays
4. Suggests roadmap adjustments

**When to use:**
- Mid-milestone health check
- Before milestone-complete
- When progress feels stalled

**Related:**
- `/kata:project-status` — quick status check
- `/kata:workflow-debug` — debug execution issues

---

### Roadmap Management

Add, remove, or reorganize phases.

#### `/kata:phase-add`

Add new phase to current milestone roadmap.

**Usage:**
```
/kata:phase-add
```

**What it does:**
1. Prompts for phase name and objective
2. Assigns next sequential phase number
3. Creates phase directory in `.planning/phases/`
4. Updates ROADMAP.md

**When to use:**
- Adding planned work to roadmap
- Expanding milestone scope
- Creating phase for todo item

**Related:**
- `/kata:phase-insert` — insert urgent work (decimal phase)
- `/kata:roadmap-plan-gaps` — auto-generate phases from requirements

---

#### `/kata:phase-insert`

Insert urgent phase using decimal numbering (e.g., 1.1, 1.2).

**Usage:**
```
/kata:phase-insert
```

**What it does:**
1. Prompts for parent phase and name
2. Assigns decimal phase number (e.g., 1.1)
3. Creates phase directory
4. Updates ROADMAP.md with insertion
5. Doesn't renumber existing phases

**When to use:**
- Urgent work discovered mid-milestone
- Dependency found during execution
- Critical bug requires immediate attention

**Related:**
- `/kata:phase-add` — append to end of roadmap
- `/kata:phase-remove` — remove phase

---

#### `/kata:phase-remove`

Remove phase from roadmap (does not delete files).

**Usage:**
```
/kata:phase-remove
```

**What it does:**
1. Prompts for phase number to remove
2. Updates ROADMAP.md (marks removed)
3. Preserves phase files (for reference)
4. Updates STATE.md if removing current phase

**When to use:**
- Descoping work from milestone
- Moving phase to different milestone
- Phase completed outside Kata

**Related:**
- `/kata:phase-add` — add phase back
- `/kata:milestone-audit` — review scope health

---

#### `/kata:roadmap-plan-gaps`

Generate phases from requirements automatically.

**Usage:**
```
/kata:roadmap-plan-gaps
```

**What it does:**
1. Reads REQUIREMENTS.md
2. Analyzes existing phases in ROADMAP.md
3. Identifies uncovered requirements
4. Proposes new phases for gaps
5. Optionally adds phases to roadmap

**When to use:**
- After creating requirements
- Mid-milestone when adding requirements
- Sanity check for roadmap completeness

**Related:**
- `/kata:phase-add` — manually add phases
- `/kata:milestone-audit` — review roadmap health

---

### Research & Planning

Gather context and create execution plans.

#### `/kata:phase-discuss`

Gather phase context before planning (pre-planning conversation).

**Usage:**
```
/kata:phase-discuss {phase-number}
```

**What it does:**
1. Loads phase objective from ROADMAP.md
2. Asks context-gathering questions
3. Captures decisions, specifics, deferred ideas
4. Creates {phase}-CONTEXT.md
5. Updates STATE.md with context gathered

**When to use:**
- Before phase-plan (recommended for all phases)
- Phase scope unclear from ROADMAP.md alone
- Need to align on implementation approach

**Related:**
- `/kata:phase-research` — deeper domain research
- `/kata:phase-plan` — create execution plans

---

#### `/kata:phase-research`

Research phase domain (APIs, patterns, constraints).

**Usage:**
```
/kata:phase-research {phase-number}
```

**What it does:**
1. Loads phase context
2. Spawns research agent
3. Investigates domain specifics
4. Creates {phase}-RESEARCH.md
5. Updates CONTEXT.md with findings

**When to use:**
- Unfamiliar APIs or libraries
- New architectural patterns
- Technical constraints unclear
- Before phase-plan for complex phases

**Related:**
- `/kata:phase-discuss` — gather context first
- `/kata:phase-assumptions` — document assumptions

---

#### `/kata:phase-assumptions`

Document phase assumptions and validate.

**Usage:**
```
/kata:phase-assumptions {phase-number}
```

**What it does:**
1. Reads phase context and research
2. Extracts implicit assumptions
3. Validates assumptions (API checks, docs)
4. Creates {phase}-ASSUMPTIONS.md
5. Flags risky assumptions

**When to use:**
- Before phase-plan for critical phases
- After research reveals complexity
- Before execution to de-risk

**Related:**
- `/kata:phase-research` — research before assumptions
- `/kata:phase-plan` — plan after assumptions validated

---

#### `/kata:phase-plan`

Create execution plans for a phase.

**Usage:**
```
/kata:phase-plan {phase-number}
```

**What it does:**
1. Reads CONTEXT.md (if exists)
2. Spawns planner agent
3. Creates 2-3 task plans
4. Runs plan checker for quality
5. Creates {phase}-{plan}-PLAN.md files
6. Updates STATE.md

**When to use:**
- After phase-discuss (recommended)
- When ready to execute phase
- To break down phase into tasks

**Output:**
- {phase}-01-PLAN.md
- {phase}-02-PLAN.md
- {phase}-03-PLAN.md (if needed)

**Related:**
- `/kata:phase-discuss` — gather context first
- `/kata:phase-execute` — execute the plans

---

### Execution & Verification

Execute plans and verify outcomes.

#### `/kata:phase-execute`

Execute phase plans with atomic commits.

**Usage:**
```
/kata:phase-execute {phase-number}
```

**What it does:**
1. Loads all plans for phase
2. Executes plans in wave order (parallel)
3. Creates atomic commit per task
4. Handles checkpoints (user verification)
5. Applies deviation rules (auto-fix bugs)
6. Creates SUMMARY.md per plan
7. Updates STATE.md with progress

**When to use:**
- After phase-plan completes
- To execute specific plan: `/kata:phase-execute {phase-number} --plan {plan-number}`

**Modes:**
- `--yolo` — skip checkpoints (autonomous)
- `--interactive` — pause at each checkpoint (default)

**Related:**
- `/kata:phase-plan` — create plans first
- `/kata:work-verify` — verify after execution

---

#### `/kata:quick`

Execute small task without planning overhead.

**Usage:**
```
/kata:quick
```

**What it does:**
1. Prompts for task description
2. Validates task is small (≤3 files, <30 min)
3. Executes task directly
4. Creates atomic commit
5. Reports completion

**When to use:**
- Typo fixes
- Single function additions
- Config updates
- Simple bug fixes

**Don't use for:**
- Multi-file refactors
- New features
- Architecture changes
- Unclear requirements

**Related:**
- `/kata:phase-execute` — for larger work
- `/kata:todo-add` — capture idea for later

---

#### `/kata:work-verify`

Verify phase goals and run UAT.

**Usage:**
```
/kata:work-verify {phase-number}
```

**What it does:**
1. Loads phase goals from ROADMAP.md
2. Loads acceptance criteria
3. Spawns verifier agent
4. Runs automated checks
5. Prompts for UAT
6. Creates VERIFICATION.md
7. Updates STATE.md with results

**When to use:**
- After phase-execute completes
- Before milestone-complete
- To validate work before PR

**Related:**
- `/kata:workflow-debug` — if verification fails
- `/kata:phase-execute` — re-run failed tasks

---

### Session Management

Pause and resume work across sessions.

#### `/kata:work-pause`

Pause work and save continuation state.

**Usage:**
```
/kata:work-pause
```

**What it does:**
1. Captures current work state
2. Records next action
3. Creates .continue-here file
4. Updates STATE.md with pause time

**When to use:**
- Ending work session
- Context switching to other work
- Before `/clear` to preserve state

**Related:**
- `/kata:work-resume` — resume from pause
- `/kata:project-status` — check state before resume

---

#### `/kata:work-resume`

Resume work from saved state.

**Usage:**
```
/kata:work-resume
```

**What it does:**
1. Reads .continue-here file
2. Loads relevant context
3. Displays last action
4. Presents next action options
5. Clears pause state

**When to use:**
- Starting work session
- After `/clear` with paused work
- Picking up where left off

**Related:**
- `/kata:work-pause` — pause before resume
- `/kata:project-status` — see what's pending

---

### Utilities

Helper commands for common tasks.

#### `/kata:codebase-map`

Map codebase structure and architectural decisions.

**Usage:**
```
/kata:codebase-map
```

**What it does:**
1. Spawns codebase mapper agent
2. Analyzes file structure
3. Identifies key patterns
4. Documents decisions
5. Creates CODEBASE-MAP.md

**When to use:**
- New team member onboarding
- Before major refactor
- After significant architecture changes
- To understand existing codebase

**Related:**
- `/kata:project-status` — project-level status
- `/kata:phase-research` — research specific area

---

#### `/kata:todo-add`

Capture idea or task for later.

**Usage:**
```
/kata:todo-add
```

**What it does:**
1. Prompts for todo description
2. Infers area and type
3. Checks for duplicates
4. Creates .planning/todos/pending/{date}-{slug}.md
5. Updates STATE.md count

**When to use:**
- Idea during unrelated work
- Found bug not fixing now
- Future improvement noted

**Related:**
- `/kata:todo-check` — review todos
- `/kata:phase-add` — convert todo to phase

---

#### `/kata:todo-check`

Review pending todos and action them.

**Usage:**
```
/kata:todo-check
```

**What it does:**
1. Lists all pending todos
2. For each todo, prompts action:
   - Work on now
   - Add to current phase
   - Create new phase
   - Brainstorm ideas
   - Put back (review later)
   - Mark complete
3. Routes to selected action
4. Updates STATE.md

**When to use:**
- Planning sessions
- Before milestone-complete
- Regular todo review

**Related:**
- `/kata:todo-add` — capture new todo
- `/kata:phase-add` — create phase from todo

---

#### `/kata:workflow-debug`

Debug workflow or agent issues.

**Usage:**
```
/kata:workflow-debug
```

**What it does:**
1. Spawns debugger agent
2. Analyzes recent execution
3. Identifies failure points
4. Suggests fixes
5. Creates DEBUG-{timestamp}.md

**When to use:**
- Plan execution failed
- Agent produced wrong output
- Verification failing unexpectedly
- Understanding workflow behavior

**Related:**
- `/kata:project-status` — check overall health
- `/kata:work-verify` — re-run verification

---

#### `/kata:help`

Show available commands and usage guide.

**Usage:**
```
/kata:help
```

**What it does:**
1. Displays command list by category
2. Shows common workflows
3. Provides usage examples

**When to use:**
- Exploring Kata
- Forgot command name
- Looking for specific capability

**Related:**
- `/kata:update` — update to latest version
- `/kata:whats-new` — see recent changes

---

#### `/kata:update`

Update Kata to latest version.

**Usage:**
```
/kata:update
```

**What it does:**
1. Checks installed version
2. Queries npm for latest version
3. Compares versions
4. Provides npx update command

**When to use:**
- New version available
- Checking for updates
- After seeing feature in changelog

**Related:**
- `/kata:whats-new` — see what's new
- `/kata:help` — explore new commands

---

#### `/kata:whats-new`

View changelog since installed version.

**Usage:**
```
/kata:whats-new
```

**What it does:**
1. Reads installed version
2. Reads CHANGELOG.md
3. Extracts entries since installed version
4. Displays changes

**When to use:**
- After updating Kata
- Checking new features
- Understanding recent changes

**Related:**
- `/kata:update` — update to get new features
- `/kata:help` — explore new commands

---

## Common Workflows

### Start New Project

```
1. /kata:project-new
   → Define vision and requirements

2. /kata:milestone-new
   → Set first milestone goals

3. /kata:roadmap-plan-gaps
   → Generate phases from requirements

4. Review and adjust roadmap
   → /kata:phase-add or /kata:phase-remove as needed
```

### Build a Feature

```
1. /kata:phase-discuss {N}
   → Gather context and decisions

2. /kata:phase-plan {N}
   → Create execution plans

3. /kata:phase-execute {N}
   → Run plans with atomic commits

4. /kata:work-verify {N}
   → Verify goals and run UAT
```

### Debug an Issue

```
1. /kata:workflow-debug
   → Analyze failure and get suggestions

2. Review DEBUG.md findings

3. Fix identified issues
   → /kata:quick for small fixes
   → /kata:phase-plan for larger changes

4. /kata:work-verify
   → Verify fix
```

### Review Progress

```
1. /kata:project-status
   → Check current position and velocity

2. /kata:milestone-audit
   → Deep health check

3. /kata:todo-check
   → Review and action pending todos

4. Adjust roadmap if needed
   → /kata:phase-add, /kata:phase-remove
```

## Tips for Effective Kata Usage

### Context Management

- **Use `/clear` before major workflows** — Fresh 200k context for planning/execution
- **Pause before context switch** — `/kata:work-pause` preserves state
- **Resume to reload context** — `/kata:work-resume` after `/clear`

### Planning Quality

- **Always discuss before planning** — `/kata:phase-discuss` improves plan quality
- **Research complex phases** — `/kata:phase-research` de-risks execution
- **Validate assumptions** — `/kata:phase-assumptions` for critical work

### Execution Efficiency

- **Use quick for small tasks** — Skip planning overhead when appropriate
- **Execute in yolo mode** — `--yolo` flag for autonomous execution (review after)
- **Parallel execution** — Plans in same wave run in parallel

### Git History

- **Atomic commits per task** — Each task = one revertable commit
- **Descriptive messages** — `{type}({phase}-{plan}): {description}`
- **Git bisect friendly** — Find exact failing task via bisect

### Decision Capture

- **Todos for ideas** — `/kata:todo-add` during unrelated work
- **Context for decisions** — `/kata:phase-discuss` captures why
- **STATE.md for tracking** — Accumulated decisions persist across sessions
