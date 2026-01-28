<div align="center">

# Kata

**型** · /ˈkɑːtɑː/ · *noun*
<br>
<sub>a choreographed pattern practiced repeatedly until perfected</sub>

<br>

Agent orchestration framework for spec-driven development.
<br>

[kata.sh](https://kata.sh)

<br>

[![Plugin](https://img.shields.io/badge/plugin-kata--marketplace-blue?style=for-the-badge)](https://github.com/gannonh/kata-marketplace)

<br>

[![Kata Install](assets/terminal.svg)](https://kata.sh/)

<br>

</div>


```bash
# Install as Claude Code plugin
# From the terminal
claude plugin install kata@kata-marketplace

# From Claude Code CLI
/plugin install kata@gannonh-kata-marketplace
```

---

## Voice-First: Conversational User Interface

Drive your entire workflow with **natural language**.

Say what you want:

| You say...               | Kata does...                           |
| ------------------------ | -------------------------------------- |
| "Start a new project"    | Launches full project initialization   |
| "What's the status?"     | Shows progress, next steps, blockers   |
| "Plan phase 2"           | Researches and creates execution plans |
| "Execute the phase"      | Runs all plans with parallel agents    |
| "I'm done for today"     | Creates handoff for session resumption |
| "Debug this login issue" | Spawns systematic debugging workflow   |

Every workflow responds to natural language. Slash commands exist for precision when you want them (`/kata:plan-phase 2`), but you never *need* them.

**Intent recognition.** Kata parses what you're trying to accomplish and routes to the right workflow (research, planning, execution, verification) automatically.

---

## Who This Is For

Teams and individuals who want to describe what they want and have it built correctly.

---

## Getting Started

### Install as Claude Code Plugin

```bash
# Start Claude Code
claude

# Install the plugin from the Claude Code CLI
/plugin install kata@gannonh-kata-marketplace
```

Verify with `/kata:help`.

### Staying Updated

Kata evolves fast. Check for updates periodically:

```
/kata:whats-new
```

Update the plugin:
```bash
claude plugin update kata@gannonh-kata-marketplace
```

<details>
<summary><strong>Development Installation</strong></summary>

Clone the repository and build the plugin:

```bash
git clone https://github.com/gannonh/kata.git
cd kata
npm run build:plugin
```

Test locally using Claude Code's plugin-dir flag:

```bash
# From a test project directory
claude --plugin-dir /path/to/kata/dist/plugin
```

Or manually copy to a test project:

```bash
# Copy built plugin to test project
cp -r dist/plugin/* /path/to/test-project/.claude/plugins/kata/
```

</details>

### Recommended: Skip Permissions Mode

Kata is designed for frictionless automation. Run Claude Code with:

```bash
claude --dangerously-skip-permissions
```

<details>
<summary><strong>Alternative: Granular Permissions</strong></summary>

If you prefer not to use that flag, add this to your project's `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(date:*)",
      "Bash(echo:*)",
      "Bash(cat:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(wc:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(sort:*)",
      "Bash(grep:*)",
      "Bash(tr:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git status:*)",
      "Bash(git log:*)",
      "Bash(git diff:*)",
      "Bash(git tag:*)"
    ]
  }
}
```

</details>

---

## How It Works

### 1. Initialize Project

```
"Start a new project"
```
<sub>or `/kata:new-project`</sub>

One command, one flow. The system:

1. **Questions**: Asks until it understands your idea completely (goals, constraints, tech preferences, edge cases)
2. **Research**: Spawns parallel agents to investigate the domain (optional but recommended)
3. **Requirements**: Extracts what's v1, v2, and out of scope
4. **Roadmap**: Creates phases mapped to requirements

You approve the roadmap. Now you're ready to build.

**Creates:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `.planning/research/`

> **Already have code?** Kata will automatically map your codebase as part of the workflow . It spawns parallel agents to analyze your stack, architecture, conventions, and concerns. Questions focus on what you're adding, and planning automatically loads your patterns.

---

### 2. Discuss Phase

```
"Let's discuss phase 1"
```
<sub>or `/kata:discuss-phase 1`</sub>

**This is where you shape the implementation.**

Your roadmap has a sentence or two per phase. That's not enough context to build something the way *you* imagine it. This step captures your preferences before anything gets researched or planned.

The system analyzes the phase and identifies gray areas based on what's being built:

- **Visual features** → Layout, density, interactions, empty states
- **APIs/CLIs** → Response format, flags, error handling, verbosity
- **Content systems** → Structure, tone, depth, flow
- **Organization tasks** → Grouping criteria, naming, duplicates, exceptions

For each area you select, it asks until you're satisfied. The output (`CONTEXT.md`) feeds directly into the next two steps:

1. **Researcher reads it**: Knows what patterns to investigate ("user wants card layout" → research card component libraries)
2. **Planner reads it**: Knows what decisions are locked ("infinite scroll decided" → plan includes scroll handling)

Depth here correlates with alignment to your intent. Skip it for reasonable defaults.

**Creates:** `{phase}-CONTEXT.md`

---

### 3. Plan Phase

```
"Plan phase 1"
```
<sub>or `/kata:plan-phase 1`</sub>

The system:

1. **Researches**: Investigates how to implement this phase, guided by your CONTEXT.md decisions
2. **Plans**: Creates 2-3 atomic task plans with XML structure
3. **Verifies**: Checks plans against requirements, loops until they pass

Each plan fits in a fresh context window.

**Creates:** `{phase}-RESEARCH.md`, `{phase}-{N}-PLAN.md`

---

### 4. Execute Phase

```
"Execute phase 1"
```
<sub>or `/kata:execute-phases 1`</sub>

The system:

1. **Runs plans in waves**: Parallel where possible, sequential when dependent
2. **Fresh context per plan**: 200k tokens for implementation, zero accumulated garbage
3. **Commits per task**: Every task gets its own atomic commit
4. **Verifies against goals**: Checks the codebase delivers what the phase promised

Walk away, come back to completed work with clean git history.

**Creates:** `{phase}-{N}-SUMMARY.md`, `{phase}-VERIFICATION.md`

---

### 5. Verify Work

```
"Verify phase 1"
```
<sub>or `/kata:verify-phases 1`</sub>

**This is where you confirm it actually works.**

Automated verification checks that code exists and tests pass. But does the feature *work* the way you expected? This is your chance to use it.

The system:

1. **Extracts testable deliverables**: What you should be able to do now
2. **Walks you through one at a time**: "Can you log in with email?" Yes/no, or describe what's wrong
3. **Diagnoses failures automatically**: Spawns debug agents to find root causes
4. **Creates verified fix plans**: Ready for immediate re-execution

If everything passes, you move on. If something's broken, run `/kata:execute-phase` again with the fix plans it created.

**Creates:** `{phase}-UAT.md`, fix plans if issues found

---

### 6. Repeat → Complete → Next Milestone

```
"Discuss phase 2"
"Plan phase 2"
"Execute phase 2"
"Verify phase 2"
...
"Complete the milestone"
"Start the next milestone"
```

Loop **discuss → plan → execute → verify** until milestone is complete.

Each phase gets your input (discuss), proper research (plan), clean execution (execute), and human verification (verify). Context stays fresh. Quality stays high.

When all phases are done, "complete the milestone" archives the milestone and tags the release.

Then "start the next milestone" kicks off the next version. Same flow as project initialization for your existing codebase. You describe what you want to build next, the system researches the domain, you scope requirements, and it creates a fresh roadmap. Each milestone is a clean cycle: define → build → ship.

---

### Quick Mode

```
"Quick task: add dark mode toggle."
```
<sub>or `/kata:quick-task`</sub>

**For ad-hoc tasks that don't need full planning.**

Quick mode gives you Kata guarantees (atomic commits, state tracking) with a faster path:

- **Same agents**: Planner + executor, same quality
- **Skips optional steps**: No research, no plan checker, no verifier
- **Separate tracking**: Lives in `.planning/quick/`

Use for: bug fixes, small features, config changes, one-off tasks.

```
"Quick task: add dark mode toggle to settings"
```

**Creates:** `.planning/quick/001-add-dark-mode-toggle/PLAN.md`, `SUMMARY.md`

---

### PR Review

```
"Review my PR"
```
<sub>or `/kata:review-pr`</sub>

**Automated code quality analysis using specialized review agents.**

The PR review workflow runs multiple specialized agents, each focusing on a different aspect:

| Agent                       | Focus                                      |
| --------------------------- | ------------------------------------------ |
| `kata-code-reviewer`        | General code quality, CLAUDE.md compliance |
| `kata-comment-analyzer`     | Comment accuracy and documentation         |
| `kata-pr-test-analyzer`     | Test coverage and quality                  |
| `kata-failure-finder`       | Error handling and silent failures         |
| `kata-type-design-analyzer` | Type design and invariants                 |
| `kata-code-simplifier`      | Code clarity and maintainability           |

**Usage:**

```
"Review my PR"                    # Full review (all agents)
"Run code review"                 # Quick review (code agent only)
"Review tests and error handling" # Specific aspects
```

**Integration with phase execution:**

When `pr_workflow: true`, phase completion offers automated review after marking the PR ready:

1. Phase completes all plans
2. PR marked ready via `gh pr ready`
3. Optional: Run automated review
4. Review summary shown with phase completion

Review is always optional and non-blocking — findings are informational for the subsequent human review.

**Creates:** Review summary in phase completion output

---

## Why It Works

### Context Engineering

Claude Code requires the right context to perform well. Kata manages context for you:

| File              | What it does                                                  |
| ----------------- | ------------------------------------------------------------- |
| `PROJECT.md`      | Project vision, always loaded                                 |
| `research/`       | Ecosystem knowledge (stack, features, architecture, pitfalls) |
| `REQUIREMENTS.md` | Scoped v1/v2 requirements with phase traceability             |
| `ROADMAP.md`      | Where you're going, what's done                               |
| `STATE.md`        | Decisions, blockers, position. Memory across sessions         |
| `PLAN.md`         | Atomic task with XML structure, verification steps            |
| `SUMMARY.md`      | What happened, what changed, committed to history             |
| `todos/`          | Captured ideas and tasks for later work                       |

Size limits based on where Claude's quality degrades.

### XML Prompt Formatting

Every plan is structured XML optimized for Claude:

```xml
<task type="auto">
  <name>Create login endpoint</name>
  <files>src/app/api/auth/login/route.ts</files>
  <action>
    Use jose for JWT (not jsonwebtoken - CommonJS issues).
    Validate credentials against users table.
    Return httpOnly cookie on success.
  </action>
  <verify>curl -X POST localhost:3000/api/auth/login returns 200 + Set-Cookie</verify>
  <done>Valid credentials return cookie, invalid return 401</done>
</task>
```

Precise instructions with verification built in.

### Multi-Agent Orchestration

Every stage uses the same pattern: a thin orchestrator spawns specialized agents, collects results, and routes to the next step.

| Stage        | Orchestrator does                  | Agents do                                                                  |
| ------------ | ---------------------------------- | -------------------------------------------------------------------------- |
| Research     | Coordinates, presents findings     | 4 parallel researchers investigate stack, features, architecture, pitfalls |
| Planning     | Validates, manages iteration       | Planner creates plans, checker verifies, loop until pass                   |
| Execution    | Groups into waves, tracks progress | Executors implement in parallel, each with fresh 200k context              |
| Verification | Presents results, routes next      | Verifier checks codebase against goals, debuggers diagnose failures        |

The orchestrator never does heavy lifting. It spawns agents, waits, integrates results.

**The result:** You can run an entire phase (research, planning, execution, verification) and your main context window stays at 30-40%. The work happens in fresh subagent contexts.

### Atomic Git Commits

Each task gets its own commit immediately after completion:

```bash
abc123f docs(08-02): complete user registration plan
def456g feat(08-02): add email confirmation flow
hij789k feat(08-02): implement password hashing
lmn012o feat(08-02): create registration endpoint
```

> [!NOTE]
> **Benefits:** Git bisect finds exact failing task. Each task independently revertable. Clear history for Claude in future sessions. Better observability in AI-automated workflow.

Every commit is traceable and revertable.

### Modular by Design

- Add phases to current milestone
- Insert urgent work between phases
- Complete milestones and start fresh
- Adjust plans without rebuilding everything

The system adapts to changing requirements.

---

## Configuration

Kata stores project settings in `.planning/config.json`. Configure during `/kata:starting-projects` or update later with `/kata:configuring-settings`.

### Core Settings

| Setting | Options                              | Default       | What it controls                       |
| ------- | ------------------------------------ | ------------- | -------------------------------------- |
| `mode`  | `yolo`, `interactive`                | `interactive` | Auto-approve vs confirm at each step   |
| `depth` | `quick`, `standard`, `comprehensive` | `standard`    | Planning thoroughness (phases × plans) |

### Model Profiles

Control which Claude model each agent uses. Balance quality vs token spend.

| Profile              | Planning | Execution | Verification |
| -------------------- | -------- | --------- | ------------ |
| `quality`            | Opus     | Opus      | Sonnet       |
| `balanced` (default) | Opus     | Sonnet    | Sonnet       |
| `budget`             | Sonnet   | Sonnet    | Haiku        |

Switch profiles:
```
/kata:set-profile
```

Or configure via `/kata:configure-settings`.

### Workflow Agents

These spawn additional agents during planning/execution. They improve quality but add tokens and time.

| Setting               | Default | What it does                                        |
| --------------------- | ------- | --------------------------------------------------- |
| `workflow.research`   | `true`  | Researches domain before planning each phase        |
| `workflow.plan_check` | `true`  | Verifies plans achieve phase goals before execution |
| `workflow.verifier`   | `true`  | Confirms must-haves were delivered after execution  |

Use `/kata:configure-settings` to toggle these, or override per-invocation:
- `/kata:plan-phase --skip-research`
- `/kata:plan-phase --skip-verify`

### Execution

| Setting                   | Default | What it controls                     |
| ------------------------- | ------- | ------------------------------------ |
| `parallelization.enabled` | `true`  | Run independent plans simultaneously |
| `planning.commit_docs`    | `true`  | Track `.planning/` in git            |

---

## Background

This project began as a fork of the [GSD system](https://github.com/glittercowboy/get-shit-done), and then quickly became a hard fork. Why hard fork and not contribute to the original project? The reasons are two fold, well three fold, or two and a half-fold.

- **Team-oriented by design.** GSD is optimized for solo devs, viewing "enterprise" features as anti-patterns. I respect that position, but my projects are multi-player. At a minimum, I need:
  - **GitHub integration**: PRs, issues, code review workflows. Planning that connects to where teams actually collaborate.
  - **IDE agnostic**: Kata should work with the tools teams already use.

- **Skills as the foundation.** GSD is built on `/commands`, which are Claude Code-specific. Kata standardizes on **skills**, an emerging open standard supported across major agentic frameworks.
  - Portable across tools.
  - Progressive disclosure keeps prompts lean.
  - Natural language instantiation (useful for voice input).

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Kata adds structure to Claude Code.**

*Tell it what you want.*

</div>
