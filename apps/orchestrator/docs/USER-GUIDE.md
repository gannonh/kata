# Kata User Guide

A detailed reference for workflows, troubleshooting, and configuration. For quick-start setup, see the [README](../README.md).

---

## Table of Contents

- [Workflow Diagrams](#workflow-diagrams)
- [Command Reference](#command-reference)
- [Configuration Reference](#configuration-reference)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Recovery Quick Reference](#recovery-quick-reference)

---

## Workflow Diagrams

### Full Project Lifecycle

```
  ┌──────────────────────────────────────────────────┐
  │                   NEW PROJECT                    │
  │  /kata:new-project                                │
  │  Questions -> Research -> Requirements -> Roadmap│
  └─────────────────────────┬────────────────────────┘
                            │
             ┌──────────────▼─────────────┐
             │      FOR EACH PHASE:       │
             │                            │
             │  ┌────────────────────┐    │
             │  │ /kata:discuss-phase │    │  <- Lock in preferences
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /kata:plan-phase    │    │  <- Research + Plan + Verify
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /kata:execute-phase │    │  <- Parallel execution
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /kata:verify-work   │    │  <- Manual UAT
             │  └──────────┬─────────┘    │
             │             │              │
             │     Next Phase?────────────┘
             │             │ No
             └─────────────┼──────────────┘
                            │
            ┌───────────────▼──────────────┐
            │  /kata:audit-milestone        │
            │  /kata:complete-milestone     │
            └───────────────┬──────────────┘
                            │
                   Another milestone?
                       │          │
                      Yes         No -> Done!
                       │
               ┌───────▼──────────────┐
               │  /kata:new-milestone  │
               └──────────────────────┘
```

### Planning Agent Coordination

```
  /kata:plan-phase N
         │
         ├── Phase Researcher (x4 parallel)
         │     ├── Stack researcher
         │     ├── Features researcher
         │     ├── Architecture researcher
         │     └── Pitfalls researcher
         │           │
         │     ┌──────▼──────┐
         │     │ RESEARCH.md │
         │     └──────┬──────┘
         │            │
         │     ┌──────▼──────┐
         │     │   Planner   │  <- Reads PROJECT.md, REQUIREMENTS.md,
         │     │             │     CONTEXT.md, RESEARCH.md
         │     └──────┬──────┘
         │            │
         │     ┌──────▼───────────┐     ┌────────┐
         │     │   Plan Checker   │────>│ PASS?  │
         │     └──────────────────┘     └───┬────┘
         │                                  │
         │                             Yes  │  No
         │                              │   │   │
         │                              │   └───┘  (loop, up to 3x)
         │                              │
         │                        ┌─────▼──────┐
         │                        │ PLAN files │
         │                        └────────────┘
         └── Done
```

### Validation Architecture (Nyquist Layer)

During plan-phase research, Kata now maps automated test coverage to each phase
requirement before any code is written. This ensures that when Claude's executor
commits a task, a feedback mechanism already exists to verify it within seconds.

The researcher detects your existing test infrastructure, maps each requirement to
a specific test command, and identifies any test scaffolding that must be created
before implementation begins (Wave 0 tasks).

The plan-checker enforces this as an 8th verification dimension: plans where tasks
lack automated verify commands will not be approved.

**Output:** `{phase}-VALIDATION.md` -- the feedback contract for the phase.

**Disable:** Set `workflow.nyquist_validation: false` in `/kata:settings` for
rapid prototyping phases where test infrastructure isn't the focus.

### Retroactive Validation (`/kata:validate-phase`)

For phases executed before Nyquist validation existed, or for existing codebases
with only traditional test suites, retroactively audit and fill coverage gaps:

```
  /kata:validate-phase N
         |
         +-- Detect state (VALIDATION.md exists? SUMMARY.md exists?)
         |
         +-- Discover: scan implementation, map requirements to tests
         |
         +-- Analyze gaps: which requirements lack automated verification?
         |
         +-- Present gap plan for approval
         |
         +-- Spawn auditor: generate tests, run, debug (max 3 attempts)
         |
         +-- Update VALIDATION.md
               |
               +-- COMPLIANT -> all requirements have automated checks
               +-- PARTIAL -> some gaps escalated to manual-only
```

The auditor never modifies implementation code — only test files and
VALIDATION.md. If a test reveals an implementation bug, it's flagged as an
escalation for you to address.

**When to use:** After executing phases that were planned before Nyquist was
enabled, or after `/kata:audit-milestone` surfaces Nyquist compliance gaps.

### Execution Wave Coordination

```
  /kata:execute-phase N
         │
         ├── Analyze plan dependencies
         │
         ├── Wave 1 (independent plans):
         │     ├── Executor A (fresh 200K context) -> commit
         │     └── Executor B (fresh 200K context) -> commit
         │
         ├── Wave 2 (depends on Wave 1):
         │     └── Executor C (fresh 200K context) -> commit
         │
         └── Verifier
               └── Check codebase against phase goals
                     │
                     ├── PASS -> VERIFICATION.md (success)
                     └── FAIL -> Issues logged for /kata:verify-work
```

### Brownfield Workflow (Existing Codebase)

```
  /kata:map-codebase
         │
         ├── Stack Mapper     -> codebase/STACK.md
         ├── Arch Mapper      -> codebase/ARCHITECTURE.md
         ├── Convention Mapper -> codebase/CONVENTIONS.md
         └── Concern Mapper   -> codebase/CONCERNS.md
                │
        ┌───────▼──────────┐
        │ /kata:new-project │  <- Questions focus on what you're ADDING
        └──────────────────┘
```

---

## Command Reference

### Core Workflow

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/kata:new-project` | Full project init: questions, research, requirements, roadmap | Start of a new project |
| `/kata:new-project --auto @idea.md` | Automated init from document | Have a PRD or idea doc ready |
| `/kata:discuss-phase [N]` | Capture implementation decisions | Before planning, to shape how it gets built |
| `/kata:plan-phase [N]` | Research + plan + verify | Before executing a phase |
| `/kata:execute-phase <N>` | Execute all plans in parallel waves | After planning is complete |
| `/kata:verify-work [N]` | Manual UAT with auto-diagnosis | After execution completes |
| `/kata:audit-milestone` | Verify milestone met its definition of done | Before completing milestone |
| `/kata:complete-milestone` | Archive milestone, tag release | All phases verified |
| `/kata:new-milestone [name]` | Start next version cycle | After completing a milestone |

### Navigation

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/kata:progress` | Show status and next steps | Anytime -- "where am I?" |
| `/kata:resume-work` | Restore full context from last session | Starting a new session |
| `/kata:pause-work` | Save context handoff | Stopping mid-phase |
| `/kata:help` | Show all commands | Quick reference |
| `/kata:update` | Update Kata with changelog preview | Check for new versions |
| `/kata:join-discord` | Open Discord community invite | Questions or community |

### Phase Management

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/kata:add-phase` | Append new phase to roadmap | Scope grows after initial planning |
| `/kata:insert-phase [N]` | Insert urgent work (decimal numbering) | Urgent fix mid-milestone |
| `/kata:remove-phase [N]` | Remove future phase and renumber | Descoping a feature |
| `/kata:list-phase-assumptions [N]` | Preview Claude's intended approach | Before planning, to validate direction |
| `/kata:plan-milestone-gaps` | Create phases for audit gaps | After audit finds missing items |
| `/kata:research-phase [N]` | Deep ecosystem research only | Complex or unfamiliar domain |

### Brownfield & Utilities

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/kata:map-codebase` | Analyze existing codebase | Before `/kata:new-project` on existing code |
| `/kata:quick` | Ad-hoc task with Kata guarantees | Bug fixes, small features, config changes |
| `/kata:debug [desc]` | Systematic debugging with persistent state | When something breaks |
| `/kata:add-todo [desc]` | Capture an idea for later | Think of something during a session |
| `/kata:check-todos` | List pending todos | Review captured ideas |
| `/kata:settings` | Configure workflow toggles and model profile | Change model, toggle agents |
| `/kata:set-profile <profile>` | Quick profile switch | Change cost/quality tradeoff |
| `/kata:reapply-patches` | Restore local modifications after update | After `/kata:update` if you had local edits |

---

## Configuration Reference

Kata stores project settings in `.planning/config.json`. Configure during `/kata:new-project` or update later with `/kata:settings`.

### Full config.json Schema

```json
{
  "mode": "interactive",
  "granularity": "standard",
  "model_profile": "balanced",
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "nyquist_validation": true
  },
  "git": {
    "branching_strategy": "none",
    "phase_branch_template": "kata/phase-{phase}-{slug}",
    "milestone_branch_template": "kata/{milestone}-{slug}"
  }
}
```

### Core Settings

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `mode` | `interactive`, `yolo` | `interactive` | `yolo` auto-approves decisions; `interactive` confirms at each step |
| `granularity` | `coarse`, `standard`, `fine` | `standard` | Phase granularity: how finely scope is sliced (3-5, 5-8, or 8-12 phases) |
| `model_profile` | `quality`, `balanced`, `budget` | `balanced` | Model tier for each agent (see table below) |

### Planning Settings

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `planning.commit_docs` | `true`, `false` | `true` | Whether `.planning/` files are committed to git |
| `planning.search_gitignored` | `true`, `false` | `false` | Add `--no-ignore` to broad searches to include `.planning/` |

> **Note:** If `.planning/` is in `.gitignore`, `commit_docs` is automatically `false` regardless of the config value.

### Workflow Toggles

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `workflow.research` | `true`, `false` | `true` | Domain investigation before planning |
| `workflow.plan_check` | `true`, `false` | `true` | Plan verification loop (up to 3 iterations) |
| `workflow.verifier` | `true`, `false` | `true` | Post-execution verification against phase goals |
| `workflow.nyquist_validation` | `true`, `false` | `true` | Validation architecture research during plan-phase; 8th plan-check dimension |

Disable these to speed up phases in familiar domains or when conserving tokens.

### Git Branching

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `git.branching_strategy` | `none`, `phase`, `milestone` | `none` | When and how branches are created |
| `git.phase_branch_template` | Template string | `kata/phase-{phase}-{slug}` | Branch name for phase strategy |
| `git.milestone_branch_template` | Template string | `kata/{milestone}-{slug}` | Branch name for milestone strategy |

**Branching strategies explained:**

| Strategy | Creates Branch | Scope | Best For |
|----------|---------------|-------|----------|
| `none` | Never | N/A | Solo development, simple projects |
| `phase` | At each `execute-phase` | One phase per branch | Code review per phase, granular rollback |
| `milestone` | At first `execute-phase` | All phases share one branch | Release branches, PR per version |

**Template variables:** `{phase}` = zero-padded number (e.g., "03"), `{slug}` = lowercase hyphenated name, `{milestone}` = version (e.g., "v1.0").

### Model Profiles (Per-Agent Breakdown)

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| kata-planner | Opus | Opus | Sonnet |
| kata-roadmapper | Opus | Sonnet | Sonnet |
| kata-executor | Opus | Sonnet | Sonnet |
| kata-phase-researcher | Opus | Sonnet | Haiku |
| kata-project-researcher | Opus | Sonnet | Haiku |
| kata-research-synthesizer | Sonnet | Sonnet | Haiku |
| kata-debugger | Opus | Sonnet | Sonnet |
| kata-codebase-mapper | Sonnet | Haiku | Haiku |
| kata-verifier | Sonnet | Sonnet | Haiku |
| kata-plan-checker | Sonnet | Sonnet | Haiku |
| kata-integration-checker | Sonnet | Sonnet | Haiku |

**Profile philosophy:**
- **quality** -- Opus for all decision-making agents, Sonnet for read-only verification. Use when quota is available and the work is critical.
- **balanced** -- Opus only for planning (where architecture decisions happen), Sonnet for everything else. The default for good reason.
- **budget** -- Sonnet for anything that writes code, Haiku for research and verification. Use for high-volume work or less critical phases.

---

## Usage Examples

### New Project (Full Cycle)

```bash
claude --dangerously-skip-permissions
/kata:new-project            # Answer questions, configure, approve roadmap
/clear
/kata:discuss-phase 1        # Lock in your preferences
/kata:plan-phase 1           # Research + plan + verify
/kata:execute-phase 1        # Parallel execution
/kata:verify-work 1          # Manual UAT
/clear
/kata:discuss-phase 2        # Repeat for each phase
...
/kata:audit-milestone        # Check everything shipped
/kata:complete-milestone     # Archive, tag, done
```

### New Project from Existing Document

```bash
/kata:new-project --auto @prd.md   # Auto-runs research/requirements/roadmap from your doc
/clear
/kata:discuss-phase 1               # Normal flow from here
```

### Existing Codebase

```bash
/kata:map-codebase           # Analyze what exists (parallel agents)
/kata:new-project            # Questions focus on what you're ADDING
# (normal phase workflow from here)
```

### Quick Bug Fix

```bash
/kata:quick
> "Fix the login button not responding on mobile Safari"
```

### Resuming After a Break

```bash
/kata:progress               # See where you left off and what's next
# or
/kata:resume-work            # Full context restoration from last session
```

### Preparing for Release

```bash
/kata:audit-milestone        # Check requirements coverage, detect stubs
/kata:plan-milestone-gaps    # If audit found gaps, create phases to close them
/kata:complete-milestone     # Archive, tag, done
```

### Speed vs Quality Presets

| Scenario | Mode | Granularity | Profile | Research | Plan Check | Verifier |
|----------|------|-------|---------|----------|------------|----------|
| Prototyping | `yolo` | `coarse` | `budget` | off | off | off |
| Normal dev | `interactive` | `standard` | `balanced` | on | on | on |
| Production | `interactive` | `fine` | `quality` | on | on | on |

### Mid-Milestone Scope Changes

```bash
/kata:add-phase              # Append a new phase to the roadmap
# or
/kata:insert-phase 3         # Insert urgent work between phases 3 and 4
# or
/kata:remove-phase 7         # Descope phase 7 and renumber
```

---

## Troubleshooting

### "Project already initialized"

You ran `/kata:new-project` but `.planning/PROJECT.md` already exists. This is a safety check. If you want to start over, delete the `.planning/` directory first.

### Context Degradation During Long Sessions

Clear your context window between major commands: `/clear` in Claude Code. Kata is designed around fresh contexts -- every subagent gets a clean 200K window. If quality is dropping in the main session, clear and use `/kata:resume-work` or `/kata:progress` to restore state.

### Plans Seem Wrong or Misaligned

Run `/kata:discuss-phase [N]` before planning. Most plan quality issues come from Claude making assumptions that `CONTEXT.md` would have prevented. You can also run `/kata:list-phase-assumptions [N]` to see what Claude intends to do before committing to a plan.

### Execution Fails or Produces Stubs

Check that the plan was not too ambitious. Plans should have 2-3 tasks maximum. If tasks are too large, they exceed what a single context window can produce reliably. Re-plan with smaller scope.

### Lost Track of Where You Are

Run `/kata:progress`. It reads all state files and tells you exactly where you are and what to do next.

### Need to Change Something After Execution

Do not re-run `/kata:execute-phase`. Use `/kata:quick` for targeted fixes, or `/kata:verify-work` to systematically identify and fix issues through UAT.

### Model Costs Too High

Switch to budget profile: `/kata:set-profile budget`. Disable research and plan-check agents via `/kata:settings` if the domain is familiar to you (or to Claude).

### Working on a Sensitive/Private Project

Set `commit_docs: false` during `/kata:new-project` or via `/kata:settings`. Add `.planning/` to your `.gitignore`. Planning artifacts stay local and never touch git.

### Kata Update Overwrote My Local Changes

Since v1.17, the installer backs up locally modified files to `kata-local-patches/`. Run `/kata:reapply-patches` to merge your changes back.

### Subagent Appears to Fail but Work Was Done

A known workaround exists for a Claude Code classification bug. Kata's orchestrators (execute-phase, quick) spot-check actual output before reporting failure. If you see a failure message but commits were made, check `git log` -- the work may have succeeded.

---

## Recovery Quick Reference

| Problem | Solution |
|---------|----------|
| Lost context / new session | `/kata:resume-work` or `/kata:progress` |
| Phase went wrong | `git revert` the phase commits, then re-plan |
| Need to change scope | `/kata:add-phase`, `/kata:insert-phase`, or `/kata:remove-phase` |
| Milestone audit found gaps | `/kata:plan-milestone-gaps` |
| Something broke | `/kata:debug "description"` |
| Quick targeted fix | `/kata:quick` |
| Plan doesn't match your vision | `/kata:discuss-phase [N]` then re-plan |
| Costs running high | `/kata:set-profile budget` and `/kata:settings` to toggle agents off |
| Update broke local changes | `/kata:reapply-patches` |

---

## Project File Structure

For reference, here is what Kata creates in your project:

```
.planning/
  PROJECT.md              # Project vision and context (always loaded)
  REQUIREMENTS.md         # Scoped v1/v2 requirements with IDs
  ROADMAP.md              # Phase breakdown with status tracking
  STATE.md                # Decisions, blockers, session memory
  config.json             # Workflow configuration
  MILESTONES.md           # Completed milestone archive
  research/               # Domain research from /kata:new-project
  todos/
    pending/              # Captured ideas awaiting work
    done/                 # Completed todos
  debug/                  # Active debug sessions
    resolved/             # Archived debug sessions
  codebase/               # Brownfield codebase mapping (from /kata:map-codebase)
  phases/
    XX-phase-name/
      XX-YY-PLAN.md       # Atomic execution plans
      XX-YY-SUMMARY.md    # Execution outcomes and decisions
      CONTEXT.md          # Your implementation preferences
      RESEARCH.md         # Ecosystem research findings
      VERIFICATION.md     # Post-execution verification results
```
