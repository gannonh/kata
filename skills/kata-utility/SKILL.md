---
name: kata-utility
description: Use this skill for project utility operations including progress checks, debugging, session management, and codebase mapping. Triggers include "progress", "status", "where am I", "what's next", "debug", "diagnose", "fix issue", "pause work", "take a break", "resume work", "continue", "map codebase", and "analyze code structure". This skill spawns kata-debugger and kata-codebase-mapper sub-agents.
---

# Kata Utility Operations

Handles progress display, debugging, session management (pause/resume), and codebase mapping.

## When to Use

- User asks about progress, status, or "where are we"
- User wants to debug an issue or diagnose a problem
- User needs to pause work and capture context for later
- User wants to resume from a previous session
- User asks to map or analyze the codebase

## Operation Detection

Parse user request to determine operation:

| Trigger Keywords | Operation |
|-----------------|-----------|
| "progress", "status", "where am I", "what's next" | PROGRESS |
| "debug", "diagnose", "fix", "issue", "problem", "bug" | DEBUG |
| "pause", "break", "stop for now", "save state" | PAUSE |
| "resume", "continue", "pick up where", "what were we doing" | RESUME |
| "map codebase", "analyze structure", "understand code" | MAP-CODEBASE |

## PROGRESS Operation

Check project status, show context, and route to next action.

### Step 1: Verify Planning Structure

```bash
ls .planning/ 2>/dev/null
```

If no `.planning/` directory: "No planning structure found. Run `/kata:new-project` to start."

### Step 2: Load Project Context

Read these files to understand state:
- `.planning/STATE.md` - Position, decisions, issues
- `.planning/ROADMAP.md` - Phase structure and objectives
- `.planning/PROJECT.md` - Current state and requirements

### Step 3: Gather Recent Work

Find 2-3 most recent SUMMARY.md files, extract what was accomplished.

### Step 4: Parse Position

From STATE.md extract:
- Current phase and plan number
- Calculate completion percentage
- Note blockers or concerns

Count pending items:
```bash
ls .planning/todos/pending/*.md 2>/dev/null | wc -l
ls .planning/debug/*.md 2>/dev/null | grep -v resolved | wc -l
```

### Step 5: Present Status Report

See `./references/progress-display.md` for formatting.

### Step 6: Route to Next Action

Determine routing based on file counts. See `./references/progress-display.md` for routing logic.

## DEBUG Operation

Systematic debugging with persistent state across context resets.

### Step 1: Check Active Sessions

```bash
ls .planning/debug/*.md 2>/dev/null | grep -v resolved | head -5
```

If active sessions exist AND no issue specified:
- Display sessions with status, hypothesis, next action
- Wait for user to select session or describe new issue

### Step 2: Gather Symptoms (if new issue)

Collect from user:
1. **Expected behavior** - What should happen?
2. **Actual behavior** - What happens instead?
3. **Error messages** - Any errors?
4. **Timeline** - When did this start?
5. **Reproduction** - How to trigger it?

### Step 3: Spawn kata-debugger

```
Task(
  prompt=debug_prompt,
  subagent_type="kata-debugger",
  description="Debug {slug}"
)
```

Debug prompt:
```markdown
<objective>
Investigate issue: {slug}

**Summary:** {trigger}
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
symptoms_prefilled: true
goal: find_and_fix
</mode>

<debug_file>
Create: .planning/debug/{slug}.md
</debug_file>
```

### Step 4: Handle Agent Return

**If `## ROOT CAUSE FOUND`:**
- Display root cause and evidence
- Offer: "Fix now", "Plan fix", "Manual fix"

**If `## CHECKPOINT REACHED`:**
- Present checkpoint to user
- Get response, spawn continuation agent

**If `## INVESTIGATION INCONCLUSIVE`:**
- Show what was checked
- Offer: "Continue investigating", "Manual investigation", "Add more context"

### Step 5: Spawn Continuation (After Checkpoint)

```markdown
<objective>
Continue debugging {slug}. Evidence is in debug file.
</objective>

<prior_state>
Debug file: @.planning/debug/{slug}.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>

<mode>
goal: find_and_fix
</mode>
```

## PAUSE Operation

Create context handoff for session resumption.

See `./references/session-management.md` for full workflow.

### Summary

1. Detect current phase directory
2. Gather complete state:
   - Current position (phase, plan, task)
   - Work completed this session
   - Work remaining
   - Decisions made
   - Blockers/issues
   - Mental context and approach
   - Files modified but not committed
3. Write `.planning/phases/XX-name/.continue-here.md`
4. Commit as WIP
5. Confirm with user

## RESUME Operation

Restore context and continue from previous session.

See `./references/session-management.md` for full workflow.

### Summary

1. Check for `.planning/STATE.md`
2. Load project context from STATE.md, PROJECT.md
3. Check for incomplete work:
   - `.continue-here.md` files
   - PLAN.md without SUMMARY.md
   - Interrupted agents
4. Present status and detected work
5. Offer contextual options
6. Route to appropriate workflow

## MAP-CODEBASE Operation

Analyze codebase using parallel mapper agents.

See `./references/codebase-mapping.md` for full workflow.

### Summary

1. Check if `.planning/codebase/` exists (offer refresh/update/skip)
2. Create directory structure
3. Spawn 4 parallel kata-codebase-mapper agents:
   - tech focus -> STACK.md, INTEGRATIONS.md
   - arch focus -> ARCHITECTURE.md, STRUCTURE.md
   - quality focus -> CONVENTIONS.md, TESTING.md
   - concerns focus -> CONCERNS.md
4. Collect confirmations (not document contents)
5. Verify all 7 documents exist
6. Commit codebase map
7. Offer next steps

Agent spawn pattern:
```
Task(
  prompt=mapper_prompt,
  subagent_type="kata-codebase-mapper",
  run_in_background=true,
  description="Map codebase {focus}"
)
```

## Key References

- **Progress display:** See `./references/progress-display.md`
- **Session management:** See `./references/session-management.md`
- **Codebase mapping:** See `./references/codebase-mapping.md`

## Sub-Agent Summary

| Agent | Purpose | When Spawned |
|-------|---------|--------------|
| kata-debugger | Investigate bugs with scientific method | DEBUG operation |
| kata-codebase-mapper | Explore and document codebase | MAP-CODEBASE operation |

## Quality Standards

- [ ] Operation correctly detected from user request
- [ ] Appropriate sub-agent spawned with full context
- [ ] Checkpoints handled correctly
- [ ] State preserved for session continuity
- [ ] Clear next steps offered to user
