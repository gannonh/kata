# Kata Orchestrator

A spec-driven development system for Claude Code, OpenCode, Gemini CLI, and Codex. Structures AI-assisted development into discrete planning, execution, and verification phases so context stays fresh and output stays consistent.

```bash
npx @kata-sh/orc@latest
```

Works on Mac, Windows, and Linux.

[![npm version](https://img.shields.io/npm/v/%40kata-sh%2Forc?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@kata-sh/orc)
[![npm downloads](https://img.shields.io/npm/dm/%40kata-sh%2Forc?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@kata-sh/orc)
[![Tests](https://img.shields.io/github/actions/workflow/status/glittercowboy/kata-orchestrator/test.yml?branch=main&style=for-the-badge&logo=github&label=Tests)](https://github.com/glittercowboy/kata-orchestrator/actions/workflows/test.yml)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/kata)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

---

## Overview

Kata Orchestrator is part of the Kata mono-repo. It installs a set of slash commands and agents into your AI coding runtime that structure development work into phases: discuss, plan, execute, verify.

Each execution phase runs in a fresh subagent context with a dedicated 200k token window. The main session stays light. Work accumulates as structured files on disk rather than in the context window.

---

## Installation

```bash
npx @kata-sh/orc@latest
```

The installer prompts for runtime and scope:

1. **Runtime** — Claude Code, OpenCode, Gemini, Codex, or all
2. **Location** — Global (all projects) or local (current project only)

Verify the install:
- Claude Code / Gemini: `/kata:help`
- OpenCode: `/kata-help`
- Codex: `$kata-help`

Codex installation uses skills (`skills/kata-*/SKILL.md`) rather than custom prompts.

**Non-interactive install:**

```bash
# Claude Code
npx @kata-sh/orc --claude --global
npx @kata-sh/orc --claude --local

# OpenCode
npx @kata-sh/orc --opencode --global

# Gemini CLI
npx @kata-sh/orc --gemini --global

# Codex
npx @kata-sh/orc --codex --global
npx @kata-sh/orc --codex --local

# All runtimes
npx @kata-sh/orc --all --global
```

**Development install:**

```bash
git clone https://github.com/glittercowboy/kata-orchestrator.git
cd kata-orchestrator
node bin/install.js --claude --local
```

**Permissions:**

Run Claude Code with `--dangerously-skip-permissions` to avoid approval prompts on every file operation. Alternatively, add specific permissions to `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(date:*)", "Bash(echo:*)", "Bash(cat:*)", "Bash(ls:*)",
      "Bash(mkdir:*)", "Bash(wc:*)", "Bash(head:*)", "Bash(tail:*)",
      "Bash(sort:*)", "Bash(grep:*)", "Bash(tr:*)",
      "Bash(git add:*)", "Bash(git commit:*)", "Bash(git status:*)",
      "Bash(git log:*)", "Bash(git diff:*)", "Bash(git tag:*)"
    ]
  }
}
```

---

## How It Works

### 1. Initialize project

```
/kata:new-project
```

Runs an interview to capture goals, constraints, and tech preferences. Optionally spawns parallel research agents. Produces scoped requirements and a phase roadmap.

**Output:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`

For existing codebases, run `/kata:map-codebase` first. It analyzes the stack and conventions so planning questions focus on what's being added.

---

### 2. Discuss phase

```
/kata:discuss-phase 1
```

Captures implementation decisions before planning. The system identifies gray areas based on what's being built and asks targeted questions. Output feeds directly into the research and planning steps.

**Output:** `{phase_num}-CONTEXT.md`

---

### 3. Plan phase

```
/kata:plan-phase 1
```

Researches the implementation domain, produces 2-3 atomic task plans, then validates plans against requirements. Plans are sized to fit a single context window.

**Output:** `{phase_num}-RESEARCH.md`, `{phase_num}-{N}-PLAN.md`

---

### 4. Execute phase

```
/kata:execute-phase 1
```

Groups plans into waves by dependency. Plans in the same wave run in parallel; waves run sequentially. Each plan executes in a fresh subagent context. Each completed task gets an atomic git commit.

**Output:** `{phase_num}-{N}-SUMMARY.md`, `{phase_num}-VERIFICATION.md`

Wave structure example:

```
WAVE 1 (parallel)        WAVE 2 (parallel)      WAVE 3
  Plan 01: User Model      Plan 03: Orders API    Plan 05: Checkout UI
  Plan 02: Product Model   Plan 04: Cart API
```

Plans 03 and 04 wait for their respective model plans. Plan 05 waits for both APIs.

---

### 5. Verify work

```
/kata:verify-work 1
```

Extracts testable deliverables from the phase and walks through them one at a time. Failures trigger automated debug agents that diagnose root causes and produce fix plans ready for re-execution.

**Output:** `{phase_num}-UAT.md`, fix plans if issues found

---

### 6. Continue

```
/kata:discuss-phase 2
/kata:plan-phase 2
/kata:execute-phase 2
/kata:verify-work 2
...
/kata:complete-milestone
/kata:new-milestone
```

Repeat discuss, plan, execute, verify for each phase. When all phases are done, `/kata:complete-milestone` archives the milestone and tags the release. `/kata:new-milestone` starts the next iteration.

---

### Quick mode

```
/kata:quick
```

For ad-hoc tasks that don't need full planning. Skips research, plan checking, and verification. Uses the same agents and produces the same git commits and summaries.

```
/kata:quick
> What do you want to do? "Add dark mode toggle to settings"
```

**Output:** `.planning/quick/001-task-name/PLAN.md`, `SUMMARY.md`

---

## File Structure

Kata stores all planning artifacts in `.planning/`:

```
.planning/
  config.json
  PROJECT.md
  REQUIREMENTS.md
  ROADMAP.md
  STATE.md
  research/
  1-CONTEXT.md
  1-RESEARCH.md
  1-1-PLAN.md
  1-1-SUMMARY.md
  1-VERIFICATION.md
  1-UAT.md
  quick/
    001-task-name/
      PLAN.md
      SUMMARY.md
```

---

## Commands

**Core workflow:**

| Command | What it does |
|---------|--------------|
| `/kata:new-project [--auto]` | Interview, research, requirements, roadmap |
| `/kata:discuss-phase [N] [--auto]` | Capture decisions before planning |
| `/kata:plan-phase [N] [--auto]` | Research, plan, validate |
| `/kata:execute-phase <N>` | Execute in parallel waves, verify |
| `/kata:verify-work [N]` | User acceptance walkthrough |
| `/kata:audit-milestone` | Verify milestone definition of done |
| `/kata:complete-milestone` | Archive and tag |
| `/kata:new-milestone [name]` | Start next iteration |

**Navigation:**

| Command | What it does |
|---------|--------------|
| `/kata:progress` | Current position and next action |
| `/kata:help` | All commands |
| `/kata:update` | Update with changelog preview |

**Brownfield:**

| Command | What it does |
|---------|--------------|
| `/kata:map-codebase` | Analyze existing codebase before planning |

**Phase management:**

| Command | What it does |
|---------|--------------|
| `/kata:add-phase` | Append phase to roadmap |
| `/kata:insert-phase [N]` | Insert between phases |
| `/kata:remove-phase [N]` | Remove and renumber |
| `/kata:list-phase-assumptions [N]` | Preview approach before planning |
| `/kata:plan-milestone-gaps` | Create phases to close audit gaps |

**Session:**

| Command | What it does |
|---------|--------------|
| `/kata:pause-work` | Save handoff state |
| `/kata:resume-work` | Restore from last session |

**Utilities:**

| Command | What it does |
|---------|--------------|
| `/kata:settings` | Configure model profile and agents |
| `/kata:set-profile <profile>` | Switch quality/balanced/budget |
| `/kata:add-todo [desc]` | Capture idea for later |
| `/kata:check-todos` | List pending todos |
| `/kata:debug [desc]` | Systematic debugging with persistent state |
| `/kata:quick [--full] [--discuss]` | Ad-hoc task (`--full` adds checking and verification) |
| `/kata:health [--repair]` | Validate `.planning/` integrity |

---

## Configuration

Settings are stored in `.planning/config.json`. Configure during `/kata:new-project` or update with `/kata:settings`.

**Core settings:**

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| `mode` | `yolo`, `interactive` | `interactive` | Auto-approve vs confirm |
| `granularity` | `coarse`, `standard`, `fine` | `standard` | Phase and plan granularity |

**Model profiles:**

| Profile | Planning | Execution | Verification |
|---------|----------|-----------|--------------|
| `quality` | Opus | Opus | Sonnet |
| `balanced` (default) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |

Switch with `/kata:set-profile budget`.

**Workflow agents:**

| Setting | Default | Description |
|---------|---------|-------------|
| `workflow.research` | `true` | Research before planning |
| `workflow.plan_check` | `true` | Validate plans before execution |
| `workflow.verifier` | `true` | Confirm deliverables after execution |
| `workflow.auto_advance` | `false` | Chain steps without stopping |

Override per-invocation with `--skip-research` or `--skip-verify`.

**Git branching:**

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| `git.branching_strategy` | `none`, `phase`, `milestone` | `none` | Branch creation strategy |
| `git.phase_branch_template` | string | `kata/phase-{phase}-{slug}` | Phase branch name |
| `git.milestone_branch_template` | string | `kata/{milestone}-{slug}` | Milestone branch name |

---

## Security

Add sensitive file patterns to Claude Code's deny list to prevent them from being read during codebase analysis:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*credential*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

---

## Troubleshooting

**Commands not found after install** — Restart your runtime. Verify files exist in `~/.claude/commands/kata/` (global) or `./.claude/commands/kata/` (local). For Codex, check `~/.codex/skills/kata-*/SKILL.md`.

**Commands not working as expected** — Run `/kata:help` to verify installation. Re-run `npx @kata-sh/orc` to reinstall.

**Docker or containerized environments** — If tilde paths fail, set `CLAUDE_CONFIG_DIR` before installing:

```bash
CLAUDE_CONFIG_DIR=/home/youruser/.claude npx @kata-sh/orc --global
```

**Uninstall:**

```bash
npx @kata-sh/orc --claude --global --uninstall
npx @kata-sh/orc --claude --local --uninstall
npx @kata-sh/orc --opencode --global --uninstall
npx @kata-sh/orc --codex --global --uninstall
npx @kata-sh/orc --codex --local --uninstall
```

Removes all commands, agents, hooks, and settings without affecting other configurations.

---

## Community Ports

OpenCode, Gemini CLI, and Codex are natively supported via `npx @kata-sh/orc`.

Earlier community ports that pioneered multi-runtime support:

| Project | Platform |
|---------|----------|
| [kata-opencode](https://github.com/rokicool/kata-opencode) | OpenCode |
| kata-gemini (archived) | Gemini CLI |

---

## License

MIT — see [LICENSE](LICENSE).
