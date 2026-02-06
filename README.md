<div align="center">

# Kata Orchestrator

**型** · /ˈkɑːtɑː/ · *noun* - a choreographed pattern practiced repeatedly until perfected

**Multi-agent orchestration framework for spec-driven development.**

![alt text](assets/brand/logo-circle-dark.png)
<br>
[kata.sh](https://kata.sh)

[![Plugin](https://img.shields.io/badge/plugin-kata--marketplace-blue?style=for-the-badge)](https://github.com/gannonh/kata-marketplace)

</div>

## Install

**From inside Claude Code:**
```bash
/plugin marketplace add gannonh/kata-marketplace
/plugin install kata@gannonh-kata-marketplace
```

**From terminal:**
```bash
claude plugin marketplace add gannonh/kata-marketplace
claude plugin install kata@gannonh-kata-marketplace
```
---

## What's New in v1.5.0

**Phase Management** — Reorganize your roadmap without starting over:
- **Move phases** — `/kata:kata-move-phase 3 to v2.0` moves a phase between milestones
- **Reorder phases** — `/kata:kata-move-phase 3 before 1` changes phase order within a milestone
- **Global phase numbering** — Phase numbers are globally sequential across milestones (they never reset)
- **Phase state directories** — Phases organized into `pending/`, `active/`, `completed/`

<details>
<summary><strong>v1.4.1: Issue Execution</strong></summary>

**Complete Issue Lifecycle** — From creation to automatic closure:
- Execution modes: "Work on it now" offers quick task or planned execution
- PR auto-closure: Phase, milestone, and issue execution PRs include `Closes #X`
- Roadmap integration: Pull backlog issues into milestones and phases
- Source traceability: Issues flow through plans to PRs with automatic closure chain

</details>

<details>
<summary><strong>v1.4.0: GitHub Issue Sync</strong></summary>

**Bidirectional Issue Integration** — Issues sync between Kata and GitHub:
- Create issues locally, auto-sync to GitHub with `backlog` label
- Pull existing GitHub Issues for selection and execution
- In-progress label sync and self-assignment on work start

</details>

<details>
<summary><strong>v1.3.0: Release Automation</strong></summary>

**Release Workflow** — Integrated into milestone completion:
- Changelog generation from conventional commits
- Semantic version detection (feat → minor, fix → patch)
- Dry-run mode, review gate, GitHub Release creation

</details>

**All features are optional.** Enable what you need via `/kata:kata-configure-settings`.

<p align="center">
<img src="assets/project-config-flow.gif" alt="GitHub Integration Setup">
</p>

---

## Voice-First: Conversational Interface

Drive your entire workflow with **natural language**.

| You say...                 | Kata does...                                         |
| -------------------------- | ---------------------------------------------------- |
| "Start a new project"      | Deep questioning → PROJECT.md + config               |
| "Add the first milestone"  | Research → Requirements → Roadmap → GitHub Milestone |
| "Let's discuss phase 1"    | Identifies gray areas → Captures your decisions      |
| "Plan phase 1"             | Research → Plans → Verification loop                 |
| "Execute the phase"        | Parallel agents → Commits → PR (optional)            |
| "Verify the work"          | UAT testing → Debug agents if issues found           |
| "Review my PR"             | 6 specialized review agents                          |
| "Complete the milestone"   | Archive → Tag/Release                                |
| "Move phase 3 to v2.0"     | Cross-milestone move → Renumber → Commit             |
| "Reorder phase 3 before 1" | Reorder → Renumber all affected → Commit             |
| "What's the status?"       | Progress report → Routes to next action              |

Slash commands exist for precision (`/kata:kata-plan-phase 2`), but natural language always works.

---

## Getting Started

### Install

**From inside Claude Code:**
```bash
/plugin marketplace add gannonh/kata-marketplace
/plugin install kata@gannonh-kata-marketplace
```

**From terminal:**
```bash
claude plugin marketplace add gannonh/kata-marketplace
claude plugin install kata@gannonh-kata-marketplace
```

Verify with `/kata:kata-help`.

### Update

```bash
claude plugin update kata@gannonh-kata-marketplace
```

Check what's new: `/kata:kata-whats-new`

### Recommended: Skip Permissions

Kata is designed for automation. For best experience:

```bash
claude --dangerously-skip-permissions
```

<details>
<summary><strong>Alternative: Granular Permissions</strong></summary>

Add to `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(git:*)", "Bash(gh:*)", "Bash(npm:*)",
      "Bash(cat:*)", "Bash(ls:*)", "Bash(mkdir:*)"
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

Creates the foundation through deep questioning:

1. **Questions** — Probes until it understands your vision (goals, constraints, tech, edge cases)
2. **Configuration** — Sets workflow preferences (mode, agents, GitHub integration)

**Creates:** `PROJECT.md`, `config.json`

**Next:** "Add the first milestone"

> **Have existing code?** Kata detects it and offers to map your codebase first. Spawns parallel agents to analyze stack, architecture, and conventions.

---

### 2. Add Milestone

```
"Add milestone v1.0"
```

Defines what you're building this cycle:

1. **Research** (optional) — 4 parallel agents investigate domain: Stack, Features, Architecture, Pitfalls
2. **Requirements** — Extracts v1 scope with traceability IDs (AUTH-01, API-02)
3. **Roadmap** — Creates phases mapped to requirements
4. **GitHub Milestone** (optional) — Creates milestone + phase issues if enabled

**Creates:** `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `research/` (optional)

**Next:** "Plan phase 1" or "Discuss phase 1"

---

### 3. Discuss Phase (Optional)

```
"Let's discuss phase 1"
```

**Use when the phase goal is ambiguous.** Captures your implementation preferences before planning.

The system analyzes the phase and identifies domain-specific gray areas:
- **Visual features** → Layout, density, interactions, empty states
- **APIs** → Response format, error handling, versioning
- **Data systems** → Structure, validation, migrations

For each area you select, it probes until satisfied. Output feeds directly into planning.

**Creates:** `{phase}-CONTEXT.md`

**Skip if:** Phase goal is clear and unambiguous.

---

### 4. Plan Phase

```
"Plan phase 1"
```

Creates executable plans through research and verification:

1. **Research** — Investigates how to implement this phase
2. **Planning** — Creates 2-5 atomic PLAN.md files with XML task structure
3. **Verification** — Plan checker confirms plans achieve phase goals (loops until pass)
4. **GitHub Update** — Adds plan checklist to phase issue (if enabled)

**Creates:** `{phase}-RESEARCH.md`, `{phase}-01-PLAN.md`, `{phase}-02-PLAN.md`, ...

**Flags:**
- `--skip-research` — Skip research, plan directly
- `--skip-verify` — Skip plan checker loop
- `--gaps` — Create fix plans from failed verification

---

### 5. Execute Phase

```
"Execute phase 1"
```

Runs plans with fresh context per agent:

1. **Branch** — Creates `feat/v1.0-1-foundation` (if PR workflow enabled)
2. **Waves** — Groups plans by dependency, runs parallel within each wave
3. **Commits** — Atomic commit per task with conventional format
4. **GitHub Updates** — Checks off plans in issue as they complete
5. **Verification** — Confirms phase goal achieved
6. **PR** — Marks ready, links with "Closes #X" (if enabled)

**Creates:** `{phase}-SUMMARY.md` per plan, `{phase}-VERIFICATION.md`

Walk away, come back to completed work with clean git history.

---

### 6. Verify Work (Optional UAT)

```
"Verify phase 1"
```

**Manual testing with intelligent assistance.** The system:

1. Extracts testable deliverables from summaries
2. Walks you through each one: "Can you log in with email?"
3. On failures: Spawns debug agents → Creates fix plans → Executes fixes

**Creates:** `{phase}-UAT.md`, fix plans if issues found

**Skip if:** Automated verification passed and you trust it.

---

### 7. Review PR (Optional)

```
"Review my PR"
```

Runs 6 specialized review agents in parallel:

| Agent            | Focus                                 |
| ---------------- | ------------------------------------- |
| Code Reviewer    | General quality, CLAUDE.md compliance |
| Test Analyzer    | Coverage gaps, edge cases             |
| Comment Analyzer | Documentation accuracy                |
| Failure Finder   | Error handling, silent failures       |
| Type Analyzer    | Type design, invariants               |
| Code Simplifier  | Clarity, maintainability              |

**Output:** Aggregated findings by severity (Critical → Important → Suggestions)

Offered automatically after phase execution or run on-demand anytime.

---

### 8. Complete Milestone

```
"Complete the milestone"
```

Archives and ships, with optional release automation:

1. **Verify** — All phases have summaries, optional audit passed
2. **Release Workflow** (optional, v1.3.0+) — Offered before archiving:
   - Detects version bump from conventional commits (feat → minor, fix → patch, breaking → major)
   - Generates changelog entry from commit history (Keep a Changelog format)
   - Preview mode lets you review before applying
   - Human confirmation before writing to files
3. **Archive** — Moves milestone to `milestones/v1.0-ROADMAP.md`
4. **Update** — PROJECT.md gets "Current State" section
5. **Release** — Creates PR or tag based on workflow setting
6. **CI** — GitHub Release created automatically on merge

**Creates:** Archived roadmap/requirements, updated CHANGELOG.md (if release), git tag or release PR

**Next:** "Add milestone v1.1"

---

### Quick Mode

```
"Quick task: fix the login bug"
```

For ad-hoc work that doesn't need full planning:

- Same agents, same quality
- Skips research, plan checker, verifier
- Separate tracking in `.planning/quick/`

**Use for:** Bug fixes, config changes, small features, one-off tasks.

---

## Configuration

Settings live in `.planning/config.json`. Configure during project init or update anytime:

```
/kata:kata-configure-settings
```

### Core Settings

| Setting | Options                              | Default    | What it controls                  |
| ------- | ------------------------------------ | ---------- | --------------------------------- |
| `mode`  | `yolo`, `interactive`                | `yolo`     | Auto-approve vs confirm each step |
| `depth` | `quick`, `standard`, `comprehensive` | `standard` | Planning thoroughness             |

### Model Profiles

Balance quality vs cost:

| Profile    | Planning | Execution | Verification |
| ---------- | -------- | --------- | ------------ |
| `quality`  | Opus     | Opus      | Sonnet       |
| `balanced` | Opus     | Sonnet    | Sonnet       |
| `budget`   | Sonnet   | Sonnet    | Haiku        |

Switch: `/kata:kata-set-profile quality`

### Workflow Agents

Toggle agents that run during planning/execution:

| Setting               | Default | What it does                         |
| --------------------- | ------- | ------------------------------------ |
| `workflow.research`   | `true`  | Research domain before planning      |
| `workflow.plan_check` | `true`  | Verify plans achieve phase goals     |
| `workflow.verifier`   | `true`  | Confirm deliverables after execution |

Override per-invocation: `/kata:kata-plan-phase --skip-research`

### GitHub Integration (Optional)

**All GitHub features are off by default.** Enable via `/kata:kata-configure-settings`:

| Setting            | Options              | Default | What it enables                               |
| ------------------ | -------------------- | ------- | --------------------------------------------- |
| `pr_workflow`      | `true`/`false`       | `false` | Branch per phase, PRs, tag via GitHub Release |
| `github.enabled`   | `true`/`false`       | `false` | GitHub Milestones and Issues                  |
| `github.issueMode` | `auto`/`ask`/`never` | `auto`  | When to create phase Issues                   |

**When both enabled:**

| Kata Action           | GitHub Result                              |
| --------------------- | ------------------------------------------ |
| Add milestone         | Creates GitHub Milestone                   |
| Add phases to roadmap | Creates Issues with `phase` label          |
| Plan phase            | Updates issue with plan checklist          |
| Execute phase         | Creates branch, draft PR, checks off plans |
| Phase complete        | Marks PR ready, links "Closes #X"          |
| Milestone complete    | Creates release PR                         |
| Merge to main         | CI creates GitHub Release + tag            |

**Requirements:** `gh` CLI authenticated, GitHub remote configured.

### Execution

| Setting           | Default | What it controls                     |
| ----------------- | ------- | ------------------------------------ |
| `parallelization` | `true`  | Run independent plans simultaneously |
| `commit_docs`     | `true`  | Track `.planning/` in git            |

---

## Why It Works

### Context Engineering

Claude requires the right context to perform well. Kata manages it:

| File              | Purpose                                          |
| ----------------- | ------------------------------------------------ |
| `PROJECT.md`      | Vision, requirements, decisions — always loaded  |
| `research/`       | Domain knowledge (stack, architecture, pitfalls) |
| `REQUIREMENTS.md` | Scoped requirements with traceability            |
| `ROADMAP.md`      | Phase structure, what's done                     |
| `STATE.md`        | Living memory across sessions                    |
| `PLAN.md`         | Atomic executable task with verification         |
| `SUMMARY.md`      | What happened, committed to history              |

### Multi-Agent Orchestration

Every stage uses thin orchestrators that spawn specialized agents:

| Stage        | Orchestrator     | Subagents                                        |
| ------------ | ---------------- | ------------------------------------------------ |
| Research     | Coordinates      | 4 parallel researchers → synthesizer             |
| Planning     | Validates, loops | Planner → checker (up to 3 iterations)           |
| Execution    | Groups waves     | Parallel executors, each with fresh 200k context |
| Verification | Routes           | Verifier → debuggers if failures                 |

**Result:** Run an entire phase and your main context stays at 30-40%.

### Atomic Commits

Each task gets its own commit:

```
abc123f feat(01-02): add email confirmation flow
def456g feat(01-02): implement password hashing
ghi789j feat(01-02): create registration endpoint
```

Git bisect finds exact failures. Each task independently revertable.

---

## Artifact Structure

```
.planning/
├── PROJECT.md              # Project vision and requirements
├── config.json             # Workflow configuration
├── ROADMAP.md              # Phase structure
├── REQUIREMENTS.md         # Scoped requirements with IDs
├── STATE.md                # Living memory
├── research/               # Domain research (optional)
│   ├── STACK.md
│   ├── FEATURES.md
│   ├── ARCHITECTURE.md
│   ├── PITFALLS.md
│   └── SUMMARY.md
├── phases/
│   ├── pending/               # Planned phases not yet started
│   ├── active/                # Phase currently being executed
│   │   └── 01-foundation/
│   │       ├── 01-CONTEXT.md       # Implementation decisions
│   │       ├── 01-RESEARCH.md      # Phase research
│   │       ├── 01-01-PLAN.md       # Executable plan
│   │       ├── 01-01-SUMMARY.md    # Execution summary
│   │       ├── 01-VERIFICATION.md  # Goal verification
│   │       └── 01-UAT.md           # User acceptance tests
│   └── completed/             # Verified phases
├── quick/                  # Ad-hoc tasks
│   └── 001-fix-bug/
├── milestones/             # Archived milestones
│   ├── v1.0-ROADMAP.md
│   └── v1.0-REQUIREMENTS.md
└── issues/                 # Backlog issues
```

---

## Development Installation

<details>
<summary><strong>Build from source</strong></summary>

```bash
git clone https://github.com/gannonh/kata.git
cd kata
npm run build:plugin

# Test locally
claude --plugin-dir ./dist/plugin
```

</details>

---

## Understanding Kata

Visual and conceptual guides for how Kata works:

- **[Workflow Diagrams](.docs/diagrams/FLOWS.md)** — Mermaid flowcharts of orchestration, lifecycle, planning, execution, verification, and PR workflows
- **[Terminology Glossary](.docs/glossary/GLOSSARY.md)** — Definitions and relationships between all Kata concepts

## Background

Kata began as a fork of [GSD](https://github.com/glittercowboy/get-shit-done), then became a hard fork:

- **Team-oriented** — GSD optimizes for solo devs. Kata adds GitHub integration, PR workflows, and collaborative features.
- **Skills-based** — Built on the emerging [Agent Skills](https://agentskills.io) open standard, not Claude Code-specific commands.

---

## License

MIT License. See [LICENSE](LICENSE).

---

<div align="center">

**Kata adds structure to Claude Code.**

*Tell it what you want. Track progress in GitHub (optionally).*

</div>
