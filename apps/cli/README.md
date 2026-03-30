# Kata CLI

A terminal coding agent that decomposes projects into milestones, slices, and tasks — then executes them autonomously with structured planning, verification, and fresh context windows.

Built on [pi](https://github.com/badlogic/pi-mono) (`@mariozechner/pi-coding-agent`).

## Quick Start

```bash
npx @kata-sh/cli
```

Or install globally:

```bash
npm install -g @kata-sh/cli
kata-cli
```

On first launch, Kata will prompt you to authenticate with an AI provider.

## Getting Started

### 1. Start Kata

```bash
npx @kata-sh/cli
```

### 2. Log in to a provider

```
/login
```

This opens an interactive prompt to authenticate with Anthropic, OpenAI, Google, or any supported provider. You can also set an API key directly:

```bash
ANTHROPIC_API_KEY=sk-ant-... npx @kata-sh/cli
```

### 3. Select a model

```
/model
```

Pick from available models across your authenticated providers.

### 4. Start working

Tell Kata what you want to build. Kata has three modes of operation:

**Step mode** — `/kata` — human in the loop (recommended for new or risk-averse users). Kata proposes each step, you approve or redirect.

**Autonomous mode** — `/kata auto` — researches, plans, executes, verifies, commits, and advances through every slice until the milestone is complete.

**Steering mode** — two terminals for supervised autonomy:

```
# Terminal 1: autonomous execution
/kata auto

# Terminal 2: observe and steer
/kata status          — check progress
/kata discuss         — discuss decisions
/kata queue           — manage upcoming work

# When you need to interrupt and redirect:
# Terminal 1:
/kata stop
```

## How It Works

Kata breaks work into three levels:

```
Milestone  →  a shippable version (4–10 slices)
  Slice    →  one demoable vertical capability (1–7 tasks)
    Task   →  one context-window-sized unit of work
```

Each slice flows through phases automatically:

**Research** → **Plan** → **Execute** (per task) → **Complete** → **Reassess** → **Next Slice**

- **Research** scouts the codebase and relevant docs
- **Plan** decomposes the slice into tasks with must-haves — mechanically verifiable outcomes
- **Execute** runs each task in a fresh context window with only the relevant files pre-loaded
- **Complete** writes the summary, UAT script, marks the roadmap, and commits
- **Reassess** checks if the roadmap still makes sense given what was learned

Kata workflow state is Linear-backed: milestones, slices, tasks, plans, and summaries are stored in Linear issues/documents.

## Commands

### Kata workflow

| Command | Description |
|---------|-------------|
| `/kata` | Contextual wizard — suggests next step based on project state |
| `/kata step` | Execute one step (research, plan, task, etc.) then stop |
| `/kata auto` | Start autonomous mode |
| `/kata stop` | Stop auto-mode after current task |
| `/kata status` | Progress dashboard |
| `/kata queue` | View/manage milestone queue |
| `/kata discuss` | Discuss gray areas before planning |
| `/kata plan` | Enriched planning mode (plan/pick/add/resequence/revise/discuss) |
| `/kata prefs` | Manage preferences (global/project) |
| `/kata pr` | PR lifecycle (create, review, address, merge) |
| `/audit` | Audit the codebase against a goal, writes report to `.kata/audits/` |

### Session & model

| Command | Description |
|---------|-------------|
| `/login` | Authenticate with an AI provider (OAuth) |
| `/model` | Select a model |
| `/scoped-models` | Enable/disable models for `Ctrl+P` cycling |
| `/new` | Start a new session |
| `/resume` | Resume a previous session |
| `/compact` | Manually compact the session context |
| `/fork` | Create a new fork from a previous message |
| `/tree` | Navigate session tree (switch branches) |
| `/session` | Show session info and stats |

### Utilities

| Command | Description |
|---------|-------------|
| `/mcp` | Show MCP server status and tools |
| `/gh` | GitHub helper — issues, PRs, labels, milestones, status |
| `/symphony` | Symphony operator workflows (`status`, `watch`, `console`, `config`) |
| `/subagent` | List available subagents |
| `/export` | Export session to HTML file |
| `/share` | Share session as a secret GitHub gist |
| `/copy` | Copy last agent message to clipboard |
| `/hotkeys` | Show all keyboard shortcuts |
| `/create-extension` | Scaffold a new extension with interview-driven setup |
| `/create-slash-command` | Generate a new slash command from a plain-English description |

## Preferences

Kata preferences live in `~/.kata-cli/preferences.md` (global) or `.kata/preferences.md` (project-local). Manage with `/kata prefs`. Legacy `.kata/PREFERENCES.md` is still read for backward compatibility.

```yaml
---
version: 1
models:
  research: claude-sonnet-4-6
  planning: claude-opus-4-6
  execution: claude-sonnet-4-6
  completion: claude-sonnet-4-6
skill_discovery: suggest
auto_supervisor:
  soft_timeout_minutes: 20
  idle_timeout_minutes: 10
  hard_timeout_minutes: 30
budget_ceiling: 50.00
---
```

| Setting | What it controls |
|---------|-----------------|
| `models.*` | Per-phase model selection (Opus for planning, Sonnet for execution, `review` for PR reviewer subagents, etc.) |
| `pr.*` | PR lifecycle settings (see [PR Mode](#pr-mode)) |
| `symphony.url` | Base URL for Symphony server (e.g. `http://127.0.0.1:8080`) |
| `symphony.workflow_path` | Default WORKFLOW.md path used by `/symphony config` |
| `symphony.console_position` | Console panel placement: `below-output` (default) or `above-status` |
| `skill_discovery` | `auto` / `suggest` / `off` — how Kata finds and applies skills |
| `auto_supervisor.*` | Timeout thresholds for auto-mode supervision |
| `budget_ceiling` | USD ceiling — auto mode pauses when reached |
| `uat_dispatch` | Enable automatic UAT runs after slice completion |
| `always_use_skills` | Skills to always load when relevant |
| `skill_rules` | Situational rules for skill routing |

## Symphony Extension

Kata CLI is the universal interface for three operating modes: **plan** your project interactively with `/kata plan`, **execute** work directly with `/kata auto` or `/kata step`, or **supervise** parallel execution at scale with Symphony. The shared backbone is Linear — `/kata plan` creates the issues, Symphony picks them up and dispatches parallel agent workers to build them.

[Symphony](../../apps/symphony/README.md) is a separate orchestration server (Rust binary) that polls your Linear project and runs multiple agent sessions concurrently. Install it from [GitHub Releases](https://github.com/gannonh/kata/releases) or build from source — see the [Symphony README](../../apps/symphony/README.md) for setup, configuration, and the full WORKFLOW.md reference.

The Kata CLI includes a built-in operator surface for monitoring and steering Symphony in real time.

### Configure connection

Set `symphony.url` in `.kata/preferences.md` (preferred) or `KATA_SYMPHONY_URL` / `SYMPHONY_URL` in your environment (`KATA_SYMPHONY_URL` takes precedence when both are set).

You can also set `symphony.workflow_path` so `/symphony config` knows which WORKFLOW.md file to edit by default.

```yaml
symphony:
  url: http://127.0.0.1:8080
  workflow_path: ./apps/symphony/WORKFLOW.md
  console_position: below-output
```

### Operator commands

- `/symphony status` — fetches live worker/queue state from `GET /api/v1/state`
- `/symphony watch KAT-920` — streams live issue-scoped events from `GET /api/v1/events?issue=KAT-920`
- `/symphony console` — toggles the live in-chat operator dashboard panel (workers, escalations, queue/completed summary)
- `/symphony console off` — closes the panel and disconnects the live stream
- `/symphony console refresh` — forces a manual snapshot refresh (shortcut: `Ctrl+Alt+S`)
- `/symphony config [WORKFLOW.md]` — opens a guided config editor for WORKFLOW frontmatter

When escalations are visible in the panel, respond inline from chat input with:

- `!respond <answer>` (auto-targets when exactly one escalation is pending)
- `!respond <request-id|index> <answer>` (required when multiple escalations are pending)

The config editor groups fields by section (tracker/workspace/agent/kata_agent/notifications/prompts/server/hooks/worker), uses typed controls (text, number, enum pickers, toggles, string-array editor), validates before save, shows a change summary, and writes only frontmatter while preserving the markdown prompt body and YAML comments.

Optional watch flags:

- `--max-events <n>`
- `--timeout-ms <ms>`

### Agent tools

- `symphony_status`
- `symphony_watch`
- `symphony_respond`

Tool responses include connection metadata (`details.connection`) and capability metadata (`details.capabilities`).

## PR Mode

Kata can manage GitHub pull requests as part of the slice lifecycle. When enabled, auto-mode stops at slice boundaries so you can review changes before merging.

### Setup

Requires `gh` CLI installed and authenticated (`gh auth login`).

Enable in `.kata/preferences.md`:

```yaml
pr:
  enabled: true
  auto_create: true       # create PR automatically after slice completes
  base_branch: main       # target branch for PRs
  review_on_create: false # run parallel code review after PR creation
  linear_link: false      # add Linear issue refs to PR body (requires linear mode)
```

Slice branches use the canonical namespaced format `kata/<scope>/<M>/<S>` (for example `kata/apps-cli/M003/S05`). Legacy `kata/<M>/<S>` branches are still accepted during transition.

### How it works with auto-mode

Without PR mode, auto-mode squash-merges each slice branch to main and continues. With PR mode enabled, the behavior changes:

**`auto_create: true`** -- After slice completion, auto-mode creates a PR via `gh`, notifies you with the URL, and stops. Merge the PR (manually or via `/kata pr merge`), then run `/kata auto` to resume.

**`auto_create: false`** -- After slice completion, auto-mode stops and tells you to run `/kata pr create`. You manage the full lifecycle, then resume.

In both cases, auto-mode pauses at the slice boundary. It never merges automatically when PRs are on.

### Commands

| Command | Description |
|---------|-------------|
| `/kata pr status` | Show PR lifecycle state (no LLM call) |
| `/kata pr create` | Create a PR for the current slice branch |
| `/kata pr review` | Run parallel multi-agent code review |
| `/kata pr address` | Address review comments |
| `/kata pr merge` | Merge PR and sync local state |

### Typical flow

```
/kata auto                    # work proceeds, slice completes, PR created, auto stops
/kata pr review               # run code review
/kata pr address              # fix review feedback
/kata pr merge                # merge and cleanup
/kata auto                    # resume next slice
```

## Project State

Kata workflow artifacts are stored in Linear:

- Milestones → Linear project milestones (`[M###]`)
- Slices → Linear parent issues (`[S##]`)
- Tasks → Linear sub-issues (`[T##]`)
- Roadmaps, context, research, summaries, decisions → Linear documents/comments

The local `.kata/` directory is still used for runtime metadata (preferences, activity logs, metrics), but planning state is Linear-backed.

## Bundled Tools

Kata comes with extensions for:

- **Linear** — Built-in project management with 40 native tools (issues, projects, documents, labels)
- **Symphony** — Live worker observability surface (`/symphony`, `symphony_*` tools)
- **Browser automation** — Playwright-based interaction with web pages
- **Subagents** — Spawn parallel Kata processes for independent tasks
- **Background shell** — Long-running processes (servers, watchers, builds)
- **Web search** — Brave Search API for current external facts
- **Library docs** — Context7 for up-to-date framework/library documentation
- **macOS tools** — Native app automation via Accessibility APIs
- **MCP servers** — Connect to any [Model Context Protocol](https://modelcontextprotocol.io/) server

## Bundled Agents

Three specialized subagents for delegated work:

| Agent | Role |
|-------|------|
| **Scout** | Fast codebase recon — returns compressed context for handoff |
| **Researcher** | Web research — finds and synthesizes current information |
| **Worker** | General-purpose execution in an isolated context window |

## Linear Integration

Kata ships with built-in Linear support — 40 native tools for managing issues, projects, milestones, documents, and labels directly from the agent. No MCP server or OAuth setup required.

### Setup

1. Create a [Linear personal API key](https://linear.app/settings/api)
2. Start Kata and provide the key when prompted (stored in `~/.kata-cli/agent/auth.json` and hydrated automatically). You can also set `LINEAR_API_KEY` manually in your environment if you prefer:
   ```bash
   LINEAR_API_KEY=lin_api_... npx @kata-sh/cli
   ```
   `.env` is optional.
3. Ask Kata to configure your project:
   ```
   Configure this project to use Linear
   ```
   Kata will list your teams and projects, ask which to use, and write the preferences file for you.

### What you can do

Once configured, Kata can manage your Linear workspace conversationally:

- Create and update issues, sub-issues, and labels
- List and search across projects, milestones, and workflow states
- Read and write documents attached to projects or issues
- Check team workflow states and transition issues between them

### Linear workflow mode

Beyond ad-hoc Linear operations, Kata uses Linear as the **backing store for its planning methodology**. Milestones, slices, tasks, plans, and summaries live as Linear entities/documents.

In Linear workflow mode:
- Milestones → Linear project milestones
- Slices → Linear parent issues with `kata:slice` label
- Tasks → Linear sub-issues with `kata:task` label
- Plans and summaries → Linear documents attached to the project

`/kata auto` works the same way — research, plan, execute, verify — but all state is read from and written to Linear. Progress is visible in the Linear UI alongside your team's other work.

To enable Linear workflow mode, ask Kata:
```
Configure this project to use Linear workflow mode
```

Or set it manually in `.kata/preferences.md`:
```yaml
---
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectSlug: <your-project-slug>
---
```

Use `linear_list_projects` or ask Kata to find your project UUID.

## MCP Support

Kata integrates with MCP servers via [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter), auto-installed on first launch. Connect to Linear, Figma, or any MCP-compatible service.

### Adding a server

Edit `~/.kata-cli/agent/mcp.json`:

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.linear.app/mcp"]
    }
  }
}
```

Restart Kata, then connect:

```
mcp({ connect: "linear" })
```

OAuth servers (Linear, etc.) open a browser window for authorization on first connect. Tokens are cached for subsequent sessions.

### Project-local MCP config

Kata also supports project-local MCP config at `<project-root>/.kata-cli/mcp.json`.

At startup, Kata merges:

- global `~/.kata-cli/agent/mcp.json`
- project-local `<cwd>/.kata-cli/mcp.json`

Merge rules:

- `mcpServers`: merged by server name, project-local wins on collisions
- `settings`: shallow-merged, project-local wins on collisions
- `imports`: concatenated (`global` then `project-local`)

On first use of a project's local MCP config, Kata asks for confirmation before trusting and loading it. If the project's `mcp.json` content changes later, Kata asks again.

### Importing existing configs

Pull in MCP configs from other tools:

```json
{
  "imports": ["claude-code", "cursor"],
  "mcpServers": {}
}
```

Supported: `cursor`, `claude-code`, `claude-desktop`, `vscode`, `windsurf`, `codex`.

### Usage

| Command | Description |
|---------|-------------|
| `mcp({ })` | Show server status |
| `mcp({ server: "name" })` | List tools from a server |
| `mcp({ search: "query" })` | Search tools across servers |
| `mcp({ tool: "name", args: '{}' })` | Call a tool |
| `/mcp` | Interactive panel |

## Configuration

Kata stores config in `~/.kata-cli/`:

```
~/.kata-cli/
  agent/
    mcp.json             — MCP server configuration
    auth.json            — Provider API keys
    settings.json        — User settings
    extensions/          — Bundled extensions (synced on launch)
    skills/              — Bundled skills
  sessions/              — Session history
  preferences.md         — Global preferences
```

## Development

For contributing or running from source:

```bash
# From the monorepo root
bun install
cd apps/cli
npx tsc
npm run copy-themes
node dist/loader.js
```

Run tests:

```bash
cd apps/cli && npm test
```

## License

MIT
