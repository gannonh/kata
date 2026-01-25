---
name: kata-providing-help
description: Use this skill when showing available Kata commands, displaying the usage guide, explaining command reference, or when the user asks for help with Kata. Triggers include "help", "show commands", "list commands", "what commands", "kata commands", and "usage guide".
version: 0.1.0
user-invocable: true
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Display the complete Kata command reference with version info.

First, read the installed version:

```bash
if [ -n "$CLAUDE_PLUGIN_ROOT" ]; then
  cat "$CLAUDE_PLUGIN_ROOT/VERSION" 2>/dev/null || true
elif [ -f ~/.claude/kata/VERSION ]; then
  cat ~/.claude/kata/VERSION
elif [ -f ./.claude/kata/VERSION ]; then
  cat ./.claude/kata/VERSION
else
  echo "unknown"
fi
```

Then output the reference content below, inserting the version at the top. Do NOT add:

- Project-specific analysis
- Git status or file context
- Next-step suggestions
- Any commentary beyond the reference
  </objective>

<reference>
# Kata Command Reference

**Version:** {version from bash above}

**Kata** is a spec-driven development framework for Claude Code. It creates hierarchical project plans optimized for agentic development.

## Quick Start

1. `/kata:starting-projects` - Initialize project (includes research, requirements, roadmap)
2. `/kata:planning-phases 1` - Create detailed plan for first phase
3. `/kata:executing-phases 1` - Execute the phase

## Staying Updated

Kata evolves fast. Check for updates periodically:

```
/kata:showing-whats-new
```

Shows what changed since your installed version and how to update.

## Core Workflow

```
/kata:starting-projects → /kata:planning-phases → /kata:executing-phases → repeat
```

### Project Initialization

**`/kata:starting-projects`**
Initialize new project through unified flow.

One command takes you from idea to ready-for-planning:
- Deep questioning to understand what you're building
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with v1/v2/out-of-scope scoping
- Roadmap creation with phase breakdown and success criteria

Creates all `.planning/` artifacts:
- `PROJECT.md` — vision and requirements
- `config.json` — workflow mode (interactive/yolo)
- `research/` — domain research (if selected)
- `REQUIREMENTS.md` — scoped requirements with REQ-IDs
- `ROADMAP.md` — phases mapped to requirements
- `STATE.md` — project memory

Usage: `/kata:starting-projects`

**`/kata:mapping-codebases`**
Map an existing codebase for brownfield projects.

- Analyzes codebase with parallel Explore agents
- Creates `.planning/codebase/` with 7 focused documents
- Covers stack, architecture, structure, conventions, testing, integrations, concerns
- Use before `/kata:starting-projects` on existing codebases

Usage: `/kata:mapping-codebases`

### Phase Planning

**`/kata:discussing-phases <number>`**
Help articulate your vision for a phase before planning.

- Captures how you imagine this phase working
- Creates CONTEXT.md with your vision, essentials, and boundaries
- Use when you have ideas about how something should look/feel

Usage: `/kata:discussing-phases 2`

**`/kata:researching-phases <number>`**
Comprehensive ecosystem research for niche/complex domains.

- Discovers standard stack, architecture patterns, pitfalls
- Creates RESEARCH.md with "how experts build this" knowledge
- Use for 3D, games, audio, shaders, ML, and other specialized domains
- Goes beyond "which library" to ecosystem knowledge

Usage: `/kata:researching-phases 3`

**`/kata:listing-phase-assumptions <number>`**
See what Claude is planning to do before it starts.

- Shows Claude's intended approach for a phase
- Lets you course-correct if Claude misunderstood your vision
- No files created - conversational output only

Usage: `/kata:listing-phase-assumptions 3`

**`/kata:planning-phases <number>`**
Create detailed execution plan for a specific phase.

- Generates `.planning/phases/XX-phase-name/XX-YY-PLAN.md`
- Breaks phase into concrete, actionable tasks
- Includes verification criteria and success measures
- Multiple plans per phase supported (XX-01, XX-02, etc.)

Usage: `/kata:planning-phases 1`
Result: Creates `.planning/phases/01-foundation/01-01-PLAN.md`

### Execution

**`/kata:executing-phases <phase-number>`**
Execute all plans in a phase.

- Groups plans by wave (from frontmatter), executes waves sequentially
- Plans within each wave run in parallel via Task tool
- Verifies phase goal after all plans complete
- Updates REQUIREMENTS.md, ROADMAP.md, STATE.md

Usage: `/kata:executing-phases 5`

### Quick Mode

**`/kata:executing-quick-tasks`**
Execute small, ad-hoc tasks with Kata guarantees but skip optional agents.

Quick mode uses the same system with a shorter path:
- Spawns planner + executor (skips researcher, checker, verifier)
- Quick tasks live in `.planning/quick/` separate from planned phases
- Updates STATE.md tracking (not ROADMAP.md)

Use when you know exactly what to do and the task is small enough to not need research or verification.

Usage: `/kata:executing-quick-tasks`
Result: Creates `.planning/quick/NNN-slug/PLAN.md`, `.planning/quick/NNN-slug/SUMMARY.md`

### Roadmap Management

**`/kata:adding-phases <description>`**
Add new phase to end of current milestone.

- Appends to ROADMAP.md
- Uses next sequential number
- Updates phase directory structure

Usage: `/kata:adding-phases "Add admin dashboard"`

**`/kata:inserting-phases <after> <description>`**
Insert urgent work as decimal phase between existing phases.

- Creates intermediate phase (e.g., 7.1 between 7 and 8)
- Useful for discovered work that must happen mid-milestone
- Maintains phase ordering

Usage: `/kata:inserting-phases 7 "Fix critical auth bug"`
Result: Creates Phase 7.1

**`/kata:removing-phases <number>`**
Remove a future phase and renumber subsequent phases.

- Deletes phase directory and all references
- Renumbers all subsequent phases to close the gap
- Only works on future (unstarted) phases
- Git commit preserves historical record

Usage: `/kata:removing-phases 17`
Result: Phase 17 deleted, phases 18-20 become 17-19

### Milestone Management

**`/kata:starting-milestones <name>`**
Start a new milestone through unified flow.

- Deep questioning to understand what you're building next
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with scoping
- Roadmap creation with phase breakdown

Mirrors `/kata:starting-projects` flow for brownfield projects (existing PROJECT.md).

Usage: `/kata:starting-milestones "v2.0 Features"`

**`/kata:completing-milestones <version>`**
Archive completed milestone and prepare for next version.

- Creates MILESTONES.md entry with stats
- Archives full details to milestones/ directory
- Creates git tag for the release
- Prepares workspace for next version

Usage: `/kata:completing-milestones 1.0.0`

### Progress Tracking

**`/kata:tracking-progress`**
Check project status and intelligently route to next action.

- Shows visual progress bar and completion percentage
- Summarizes recent work from SUMMARY files
- Displays current position and what's next
- Lists key decisions and open issues
- Offers to execute next plan or create it if missing
- Detects 100% milestone completion

Usage: `/kata:tracking-progress`

### Session Management

**`/kata:resuming-work`**
Resume work from previous session with full context restoration.

- Reads STATE.md for project context
- Shows current position and recent progress
- Offers next actions based on project state

Usage: `/kata:resuming-work`

**`/kata:pausing-work`**
Create context handoff when pausing work mid-phase.

- Creates .continue-here file with current state
- Updates STATE.md session continuity section
- Captures in-progress work context

Usage: `/kata:pausing-work`

### Debugging

**`/kata:debugging [issue description]`**
Systematic debugging with persistent state across context resets.

- Gathers symptoms through adaptive questioning
- Creates `.planning/debug/[slug].md` to track investigation
- Investigates using scientific method (evidence → hypothesis → test)
- Survives `/clear` — run `/kata:debugging` with no args to resume
- Archives resolved issues to `.planning/debug/resolved/`

Usage: `/kata:debugging "login button doesn't work"`
Usage: `/kata:debugging` (resume active session)

### Todo Management

**`/kata:adding-todos [description]`**
Capture idea or task as todo from current conversation.

- Extracts context from conversation (or uses provided description)
- Creates structured todo file in `.planning/todos/pending/`
- Infers area from file paths for grouping
- Checks for duplicates before creating
- Updates STATE.md todo count

Usage: `/kata:adding-todos` (infers from conversation)
Usage: `/kata:adding-todos Add auth token refresh`

**`/kata:checking-todos [area]`**
List pending todos and select one to work on.

- Lists all pending todos with title, area, age
- Optional area filter (e.g., `/kata:checking-todos api`)
- Loads full context for selected todo
- Routes to appropriate action (work now, add to phase, brainstorm)
- Moves todo to done/ when work begins

Usage: `/kata:checking-todos`
Usage: `/kata:checking-todos api`

### User Acceptance Testing

**`/kata:verifying-work [phase]`**
Validate built features through conversational UAT.

- Extracts testable deliverables from SUMMARY.md files
- Presents tests one at a time (yes/no responses)
- Automatically diagnoses failures and creates fix plans
- Ready for re-execution if issues found

Usage: `/kata:verifying-work 3`

### Milestone Auditing

**`/kata:auditing-milestones [version]`**
Audit milestone completion against original intent.

- Reads all phase VERIFICATION.md files
- Checks requirements coverage
- Spawns integration checker for cross-phase wiring
- Creates MILESTONE-AUDIT.md with gaps and tech debt

Usage: `/kata:auditing-milestones`

**`/kata:planning-milestone-gaps`**
Create phases to close gaps identified by audit.

- Reads MILESTONE-AUDIT.md and groups gaps into phases
- Prioritizes by requirement priority (must/should/nice)
- Adds gap closure phases to ROADMAP.md
- Ready for `/kata:planning-phases` on new phases

Usage: `/kata:planning-milestone-gaps`

### Configuration

**`/kata:configuring-settings`**
Configure workflow toggles and model profile interactively.

- Toggle researcher, plan checker, verifier agents
- Select model profile (quality/balanced/budget)
- Updates `.planning/config.json`

Usage: `/kata:configuring-settings`

**`/kata:setting-profiles <profile>`**
Quick switch model profile for Kata agents.

- `quality` — Opus everywhere except verification
- `balanced` — Opus for planning, Sonnet for execution (default)
- `budget` — Sonnet for writing, Haiku for research/verification

Usage: `/kata:setting-profiles budget`

### Utility Commands

**`/kata:providing-help`**
Show this command reference.

**`/kata:showing-whats-new`**
See what's changed since your installed version.

- Shows installed vs latest version comparison
- Displays changelog entries for versions you've missed
- Highlights breaking changes
- Provides update instructions when behind

Usage: `/kata:showing-whats-new`

## Files & Structure

```
.planning/
├── PROJECT.md            # Project vision
├── ROADMAP.md            # Current phase breakdown
├── STATE.md              # Project memory & context
├── config.json           # Workflow mode & gates
├── todos/                # Captured ideas and tasks
│   ├── pending/          # Todos waiting to be worked on
│   └── done/             # Completed todos
├── debug/                # Active debug sessions
│   └── resolved/         # Archived resolved issues
├── codebase/             # Codebase map (brownfield projects)
│   ├── STACK.md          # Languages, frameworks, dependencies
│   ├── ARCHITECTURE.md   # Patterns, layers, data flow
│   ├── STRUCTURE.md      # Directory layout, key files
│   ├── CONVENTIONS.md    # Coding standards, naming
│   ├── TESTING.md        # Test setup, patterns
│   ├── INTEGRATIONS.md   # External services, APIs
│   └── CONCERNS.md       # Tech debt, known issues
└── phases/
    ├── 01-foundation/
    │   ├── 01-01-PLAN.md
    │   └── 01-01-SUMMARY.md
    └── 02-core-features/
        ├── 02-01-PLAN.md
        └── 02-01-SUMMARY.md
```

## Workflow Modes

Set during `/kata:starting-projects`:

**Interactive Mode**

- Confirms each major decision
- Pauses at checkpoints for approval
- More guidance throughout

**YOLO Mode**

- Auto-approves most decisions
- Executes plans without confirmation
- Only stops for critical checkpoints

Change anytime by editing `.planning/config.json`

## Planning Configuration

Configure how planning artifacts are managed in `.planning/config.json`:

**`planning.commit_docs`** (default: `true`)
- `true`: Planning artifacts committed to git (standard workflow)
- `false`: Planning artifacts kept local-only, not committed

When `commit_docs: false`:
- Add `.planning/` to your `.gitignore`
- Useful for OSS contributions, client projects, or keeping planning private
- All planning files still work normally, just not tracked in git

**`planning.search_gitignored`** (default: `false`)
- `true`: Add `--no-ignore` to broad ripgrep searches
- Only needed when `.planning/` is gitignored and you want project-wide searches to include it

Example config:
```json
{
  "planning": {
    "commit_docs": false,
    "search_gitignored": true
  }
}
```

## Common Workflows

**Starting a new project:**

```
/kata:starting-projects        # Unified flow: questioning → research → requirements → roadmap
/clear
/kata:planning-phases 1       # Create plans for first phase
/clear
/kata:executing-phases 1    # Execute all plans in phase
```

**Resuming work after a break:**

```
/kata:tracking-progress  # See where you left off and continue
```

**Adding urgent mid-milestone work:**

```
/kata:inserting-phases 5 "Critical security fix"
/kata:planning-phases 5.1
/kata:executing-phases 5.1
```

**Completing a milestone:**

```
/kata:completing-milestones 1.0.0
/clear
/kata:starting-milestones  # Start next milestone (questioning → research → requirements → roadmap)
```

**Capturing ideas during work:**

```
/kata:adding-todos                    # Capture from conversation context
/kata:adding-todos Fix modal z-index  # Capture with explicit description
/kata:checking-todos                 # Review and work on todos
/kata:checking-todos api             # Filter by area
```

**Debugging an issue:**

```
/kata:debugging "form submission fails silently"  # Start debug session
# ... investigation happens, context fills up ...
/clear
/kata:debugging                                    # Resume from where you left off
```

## Getting Help

- Read `.planning/PROJECT.md` for project vision
- Read `.planning/STATE.md` for current context
- Check `.planning/ROADMAP.md` for phase status
- Run `/kata:tracking-progress` to check where you're up to
  </reference>
