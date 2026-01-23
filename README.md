<div align="center">

# KATA

**型** · /ˈkɑːtɑː/ · *noun*
<br>
<sub>a choreographed pattern practiced repeatedly until perfected</sub>

<br>

[kata.sh](https://kata.sh)

<br>

[![Plugin](https://img.shields.io/badge/plugin-kata--marketplace-blue?style=for-the-badge)](https://github.com/gannonh/kata-marketplace)
[![npm version](https://img.shields.io/npm/v/@gannonh/kata?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@gannonh/kata)

<br>

![Kata Install](assets/terminal.svg)

<br>
Agent orchestration framework for spec-driven development.

</div>


```bash
# Install as Claude Code plugin
/plugin install kata@kata-marketplace

# Or install via NPM
npx @gannonh/kata
```

---

## Talk to It Like a Person

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

Every workflow responds to natural language. Slash commands exist for precision when you want them (`/kata:phase-plan 2`), but you never *need* them.

**Intent recognition.** Kata parses what you're trying to accomplish and routes to the right workflow (research, planning, execution, verification) automatically.

---

## Who This Is For

Teams and individuals that want to describe what they want and have it built correctly.

---

<!-- sanitize -->
## Getting Started

### Recommended: Plugin Install

```bash
/plugin marketplace add gannonh/kata-marketplace
/plugin install kata@kata-marketplace
```

Verify with `/kata:help` inside Claude Code.

<details>
<summary><strong>Alternative: NPM Install</strong></summary>

```bash
npx @gannonh/kata
```

Use NPM if you prefer global installation or need CI/container support.

</details>

### Staying Updated

Kata evolves fast. Check for updates periodically:

```
/kata:whats-new
```

**Plugin users:**
```bash
claude plugin update kata@kata-marketplace
```

**NPM users:**
```bash
npx @gannonh/kata@latest
```

<details>
<summary><strong>Non-interactive Install (Docker, CI, Scripts)</strong></summary>

```bash
npx @gannonh/kata --global   # Install to ~/.claude/
npx @gannonh/kata --local    # Install to ./.claude/
```

Use `--global` (`-g`) or `--local` (`-l`) to skip the interactive prompt.

</details>

<details>
<summary><strong>Development Installation</strong></summary>

Clone the repository and run the installer locally:

```bash
git clone https://github.com/gannonh/kata.git
cd kata
node bin/install.js --local
```

Installs to `./.claude/` for testing modifications before contributing.

</details>

### Recommended: Skip Permissions Mode

Kata is designed for frictionless automation. Run Claude Code with:

```bash
claude --dangerously-skip-permissions
```

> [!TIP]
> Kata works best this way. Approving `date` and `git commit` 50 times defeats the purpose.

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

> **Already have code?** Run `/kata:project-analyze` first. It spawns parallel agents to analyze your stack, architecture, conventions, and concerns. Then `/kata:project-new` knows your codebase. Questions focus on what you're adding, and planning automatically loads your patterns.

### 1. Initialize Project

```
"Start a new project"
```
<sub>or `/kata:project-new`</sub>

One command, one flow. The system:

1. **Questions**: Asks until it understands your idea completely (goals, constraints, tech preferences, edge cases)
2. **Research**: Spawns parallel agents to investigate the domain (optional but recommended)
3. **Requirements**: Extracts what's v1, v2, and out of scope
4. **Roadmap**: Creates phases mapped to requirements

You approve the roadmap. Now you're ready to build.

**Creates:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `.planning/research/`

---

### 2. Discuss Phase

```
"Let's discuss phase 1"
```
<sub>or `/kata:phase-discuss 1`</sub>

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
<sub>or `/kata:phase-plan 1`</sub>

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
<sub>or `/kata:phase-execute 1`</sub>

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
<sub>or `/kata:phase-verify 1`</sub>

**This is where you confirm it actually works.**

Automated verification checks that code exists and tests pass. But does the feature *work* the way you expected? This is your chance to use it.

The system:

1. **Extracts testable deliverables**: What you should be able to do now
2. **Walks you through one at a time**: "Can you log in with email?" Yes/no, or describe what's wrong
3. **Diagnoses failures automatically**: Spawns debug agents to find root causes
4. **Creates verified fix plans**: Ready for immediate re-execution

If everything passes, you move on. If something's broken, run `/kata:phase-execute` again with the fix plans it created.

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

Loop **discuss → plan → execute → verify** until milestone complete.

Each phase gets your input (discuss), proper research (plan), clean execution (execute), and human verification (verify). Context stays fresh. Quality stays high.

When all phases are done, `/kata:milestone-complete` archives the milestone and tags the release.

Then `/kata:milestone-new` starts the next version. Same flow as `project-new` for your existing codebase. You describe what you want to build next, the system researches the domain, you scope requirements, and it creates a fresh roadmap. Each milestone is a clean cycle: define → build → ship.

---

### Quick Mode

```
"Quick task: add dark mode toggle"
```
<sub>or `/kata:task-execute`</sub>

**For ad-hoc tasks that don't need full planning.**

Quick mode gives you Kata guarantees (atomic commits, state tracking) with a faster path:

- **Same agents**: Planner + executor, same quality
- **Skips optional steps**: No research, no plan checker, no verifier
- **Separate tracking**: Lives in `.planning/quick/`

Use for: bug fixes, small features, config changes, one-off tasks.

```
/kata:task-execute
> What do you want to do? "Add dark mode toggle to settings"
```

**Creates:** `.planning/quick/001-add-dark-mode-toggle/PLAN.md`, `SUMMARY.md`

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

## Commands

> **Remember:** All commands also respond to natural language. "What's my progress?" works the same as `/kata:project-status`.

### Core Workflow

| Command                      | What it does                                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| `/kata:project-new`          | Full initialization: questions → research → requirements → roadmap |
| `/kata:phase-discuss [N]`    | Capture implementation decisions before planning                   |
| `/kata:phase-plan [N]`       | Research + plan + verify for a phase                               |
| `/kata:phase-execute <N>`    | Execute all plans in parallel waves, verify when complete          |
| `/kata:phase-verify [N]`     | Manual user acceptance testing ¹                                   |
| `/kata:milestone-audit`      | Verify milestone achieved its definition of done                   |
| `/kata:milestone-complete`   | Archive milestone, tag release                                     |
| `/kata:milestone-new [name]` | Start next version: questions → research → requirements → roadmap  |

### Navigation

| Command                | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `/kata:project-status` | Where am I? What's next?                      |
| `/kata:help`           | Show all commands and usage guide             |
| `/kata:whats-new`      | See what changed since your installed version |
| `/kata:update`         | Update Kata with changelog preview            |

### Brownfield

| Command                 | What it does                                 |
| ----------------------- | -------------------------------------------- |
| `/kata:project-analyze` | Analyze existing codebase before project-new |

### Phase Management

| Command                       | What it does                                   |
| ----------------------------- | ---------------------------------------------- |
| `/kata:phase-add`             | Append phase to roadmap                        |
| `/kata:phase-insert [N]`      | Insert urgent work between phases              |
| `/kata:phase-remove [N]`      | Remove future phase, renumber                  |
| `/kata:phase-assumptions [N]` | See Claude's intended approach before planning |
| `/kata:milestone-plan-gaps`   | Create phases to close gaps from audit         |

### Session

| Command              | What it does                           |
| -------------------- | -------------------------------------- |
| `/kata:phase-pause`  | Create handoff when stopping mid-phase |
| `/kata:phase-resume` | Restore from last session              |

### Utilities

| Command                         | What it does                                   |
| ------------------------------- | ---------------------------------------------- |
| `/kata:settings-config`         | Configure model profile and workflow agents    |
| `/kata:models-config <profile>` | Switch model profile (quality/balanced/budget) |
| `/kata:todos-add [desc]`        | Capture idea for later                         |
| `/kata:todos-lists`             | List pending todos                             |
| `/kata:issue-debug [desc]`      | Systematic debugging with persistent state     |
| `/kata:task-execute`            | Execute ad-hoc task with Kata guarantees       |

<sup>¹ Contributed by reddit user OracleGreyBeard</sup>

---

## Configuration

Kata stores project settings in `.planning/config.json`. Configure during `/kata:project-new` or update later with `/kata:settings-config`.

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
/kata:models-config budget
```

Or configure via `/kata:settings-config`.

### Workflow Agents

These spawn additional agents during planning/execution. They improve quality but add tokens and time.

| Setting               | Default | What it does                                        |
| --------------------- | ------- | --------------------------------------------------- |
| `workflow.research`   | `true`  | Researches domain before planning each phase        |
| `workflow.plan_check` | `true`  | Verifies plans achieve phase goals before execution |
| `workflow.verifier`   | `true`  | Confirms must-haves were delivered after execution  |

Use `/kata:settings-config` to toggle these, or override per-invocation:
- `/kata:phase-plan --skip-research`
- `/kata:phase-plan --skip-verify`

### Execution

| Setting                   | Default | What it controls                     |
| ------------------------- | ------- | ------------------------------------ |
| `parallelization.enabled` | `true`  | Run independent plans simultaneously |
| `planning.commit_docs`    | `true`  | Track `.planning/` in git            |

---

## Troubleshooting

**Commands not found after install?**
- Restart Claude Code to reload slash commands
- Verify files exist in `~/.claude/commands/kata/` (global) or `./.claude/commands/kata/` (local)

**Commands not working as expected?**
- Run `/kata:help` to verify installation
- Re-run `npx @gannonh/kata` to reinstall

**Updating to the latest version?**
```bash
npx @gannonh/kata@latest
```

**Using Docker or containerized environments?**

If file reads fail with tilde paths (`~/.claude/...`), set `CLAUDE_CONFIG_DIR` before installing:
```bash
CLAUDE_CONFIG_DIR=/home/youruser/.claude npx @gannonh/kata --global
```
This ensures absolute paths are used instead of `~` which may not expand correctly in containers.

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
