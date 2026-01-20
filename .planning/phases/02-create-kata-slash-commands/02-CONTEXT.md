# Phase 02: Create Kata Slash Commands - Context

**Gathered:** 2026-01-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Create GSD-equivalent slash commands that provide explicit invocation paths to Kata skills. Commands are thin wrappers that delegate to skills after parsing/validating arguments.

</domain>

<decisions>
## Implementation Decisions

### Command Naming Pattern
- **Namespace:** `/kata:` prefix with colon separator
- **Ordering:** noun-verb (entity first, then action)
  - `/kata:phase-plan` not `/kata:plan-phase`
  - `/kata:project-new` not `/kata:new-project`
  - `/kata:milestone-complete` not `/kata:complete-milestone`
- **Utilities:** Force an entity even for utilities
  - `/kata:project-status` not `/kata:status`
  - `/kata:workflow-debug` not `/kata:debug`
- **Length:** Abbreviate where obvious for usability
  - `/kata:phase-plan` preferred over `/kata:phases-planning`

### Gap Skill Strategy
- **Approach:** Full skills for all gaps (no stubs, no command-only shortcuts)
- **Methodology:** Use `/building-claude-code-skills` for each new skill
- **Gap skills to create:**
  1. `kata-updating-to-latest-version` — handles `/kata:update` AND `/kata:whats-new`
  2. `kata-execute-quick-task` — handles `/kata:quick`
  3. `kata-showing-available-commands-and-usage-guides` — handles `/kata:help`
- **Multi-command skills:** Skills can receive multiple commands; command name provides context for which action to perform

### Argument Handling
- **Validation:** Commands parse and validate arguments before passing to skills
- **Structured handoff:** Pass validated data as structured parameters to skills
- **Missing args:** Use AskUserQuestion to interactively prompt for missing/invalid arguments
- **Flags:** Support flags when genuinely needed, otherwise positional args only (don't mirror GSD blindly)
- **Standard pattern:** `argument-hint` in frontmatter for users, `$ARGUMENTS` in command body for agent

### Claude's Discretion
- Argument-hint formatting style (descriptive vs minimal)
- Per-command documentation structure

</decisions>

<specifics>
## Specific Ideas

- Gap analysis already completed: `.claude/plans/gsd-gap-analysis.md`
- 21/25 commands already have skill coverage (84%)
- 4 utility gaps: help, quick, update, whats-new

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 02-create-kata-slash-commands*
*Context gathered: 2026-01-20*
