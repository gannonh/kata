# Session Management Reference

Workflows for PAUSE and RESUME operations.

## PAUSE Workflow

Create `.continue-here.md` handoff file to preserve complete work state.

### Step 1: Detect Current Phase

Find current phase from most recently modified files:

```bash
ls -t .planning/phases/*/*.md 2>/dev/null | head -1
```

Extract phase directory from path.

### Step 2: Gather Complete State

Collect all context for handoff:

1. **Current position**: Which phase, which plan, which task
2. **Work completed**: What got done this session
3. **Work remaining**: What's left in current plan/phase
4. **Decisions made**: Key decisions and rationale
5. **Blockers/issues**: Anything stuck
6. **Mental context**: The approach, next steps, "vibe"
7. **Files modified**: What's changed but not committed

Ask user for clarifications if needed.

### Step 3: Write Handoff File

Write to `.planning/phases/XX-name/.continue-here.md`:

```markdown
---
phase: XX-name
task: 3
total_tasks: 7
status: in_progress
last_updated: [timestamp]
---

<current_state>
[Where exactly are we? Immediate context]
</current_state>

<completed_work>
- Task 1: [name] - Done
- Task 2: [name] - Done
- Task 3: [name] - In progress, [what's done]
</completed_work>

<remaining_work>
- Task 3: [what's left]
- Task 4: Not started
- Task 5: Not started
</remaining_work>

<decisions_made>
- Decided to use [X] because [reason]
- Chose [approach] over [alternative] because [reason]
</decisions_made>

<blockers>
- [Blocker 1]: [status/workaround]
</blockers>

<context>
[Mental state, what were you thinking, the plan]
</context>

<next_action>
Start with: [specific first action when resuming]
</next_action>
```

Be specific enough for a fresh Claude to understand immediately.

### Step 4: Commit as WIP

```bash
git add .planning/phases/*/.continue-here.md
git commit -m "wip: [phase-name] paused at task [X]/[Y]"
```

### Step 5: Confirm with User

```
CHECKMARK Handoff created: .planning/phases/[XX-name]/.continue-here.md

Current state:
- Phase: [XX-name]
- Task: [X] of [Y]
- Status: [in_progress/blocked]
- Committed as WIP

To resume: /kata:resume-work
```

## RESUME Workflow

Restore project context and resume work seamlessly.

### Step 1: Detect Existing Project

```bash
ls .planning/STATE.md 2>/dev/null && echo "Project exists"
ls .planning/ROADMAP.md 2>/dev/null && echo "Roadmap exists"
ls .planning/PROJECT.md 2>/dev/null && echo "Project file exists"
```

**If STATE.md exists:** Proceed to Step 2
**If only ROADMAP.md/PROJECT.md:** Offer to reconstruct STATE.md
**If .planning/ missing:** Route to new project creation

### Step 2: Load State

Read and parse:
- `.planning/STATE.md` - Position, decisions, issues
- `.planning/PROJECT.md` - Current state, requirements

Extract:
- **Project Reference**: Core value and current focus
- **Current Position**: Phase X of Y, Plan A of B, Status
- **Progress**: Visual progress bar
- **Recent Decisions**: Key decisions affecting current work
- **Pending Todos**: Ideas captured during sessions
- **Blockers/Concerns**: Issues carried forward
- **Session Continuity**: Where we left off

### Step 3: Check Incomplete Work

```bash
# Check for continue-here files (mid-plan resumption)
ls .planning/phases/*/.continue-here*.md 2>/dev/null

# Check for plans without summaries (incomplete execution)
for plan in .planning/phases/*/*-PLAN.md; do
  summary="${plan/PLAN/SUMMARY}"
  [ ! -f "$summary" ] && echo "Incomplete: $plan"
done 2>/dev/null

# Check for interrupted agents
if [ -f .planning/current-agent-id.txt ]; then
  AGENT_ID=$(cat .planning/current-agent-id.txt)
  echo "Interrupted agent: $AGENT_ID"
fi
```

**Flag what's found:**
- `.continue-here` file: "Found mid-plan checkpoint"
- PLAN without SUMMARY: "Found incomplete plan execution"
- Interrupted agent: "Found interrupted agent"

### Step 4: Present Status

```
PROJECT STATUS BOX
  Building: [one-liner from PROJECT.md]

  Phase: [X] of [Y] - [Phase name]
  Plan:  [A] of [B] - [Status]
  Progress: [PROGRESS_BAR] XX%

  Last activity: [date] - [what happened]

[If incomplete work found:]
WARNING Incomplete work detected:
    - [.continue-here file or incomplete plan]

[If interrupted agent found:]
WARNING Interrupted agent detected:
    Agent ID: [id]
    Task: [task description]

[If pending todos exist:]
CLIPBOARD [N] pending todos - /kata:check-todos to review

[If blockers exist:]
WARNING Carried concerns:
    - [blocker 1]
```

### Step 5: Determine Next Action

**If interrupted agent exists:**
- Primary: Resume interrupted agent
- Option: Start fresh

**If .continue-here file exists:**
- Primary: Resume from checkpoint
- Option: Start fresh on current plan

**If incomplete plan (PLAN without SUMMARY):**
- Primary: Complete the incomplete plan
- Option: Abandon and move on

**If phase in progress, all plans complete:**
- Primary: Transition to next phase
- Option: Review completed work

**If phase ready to plan:**
- Check if CONTEXT.md exists:
  - Missing: Offer discuss-phase first
  - Exists: Offer plan-phase directly

**If phase ready to execute:**
- Primary: Execute next plan
- Option: Review the plan first

### Step 6: Offer Options

```
What would you like to do?

[Primary action based on state]
1. [Context-appropriate primary option]

[Secondary options:]
2. Review current phase status
3. Check pending todos ([N] pending)
4. Review brief alignment
5. Something else
```

Wait for user selection.

### Step 7: Update Session Continuity

Before proceeding, update STATE.md:

```markdown
## Session Continuity

Last session: [now]
Stopped at: Session resumed, proceeding to [action]
Resume file: [updated if applicable]
```

## STATE.md Reconstruction

If STATE.md is missing but other artifacts exist:

1. Read PROJECT.md - Extract "What This Is" and Core Value
2. Read ROADMAP.md - Determine phases, find current position
3. Scan *-SUMMARY.md files - Extract decisions, concerns
4. Count pending todos in `.planning/todos/pending/`
5. Check for `.continue-here` files - Session continuity

Reconstruct and write STATE.md, then proceed normally.

## Quick Resume Mode

For users who want minimal friction:

If user says just "continue" or "go":
- Load state silently
- Determine primary action
- Execute immediately without presenting options

"Continuing from [state]... [action]"

## Dirty State Warnings

Before pausing, check for uncommitted changes:

```bash
git status --short
```

If changes exist:
- List modified files
- Ask: "Commit changes before pause, or leave uncommitted?"
- If commit: Stage and commit relevant files
- If leave: Note in `.continue-here.md` that files are uncommitted
