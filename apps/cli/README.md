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

All planning state lives in `.kata/` at the project root — human-readable markdown files that track milestones, slices, tasks, decisions, and progress.

## Commands

### Kata workflow

| Command | Description |
|---------|-------------|
| `/kata` | Contextual wizard — suggests next step based on project state |
| `/kata auto` | Start autonomous mode |
| `/kata stop` | Stop auto-mode after current task |
| `/kata status` | Progress dashboard |
| `/kata queue` | View/manage milestone queue |
| `/kata discuss` | Discuss gray areas before planning |
| `/kata prefs` | Manage preferences (global/project) |
| `/kata doctor` | Diagnose and fix project state |
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
| `/subagent` | List available subagents |
| `/export` | Export session to HTML file |
| `/share` | Share session as a secret GitHub gist |
| `/copy` | Copy last agent message to clipboard |
| `/hotkeys` | Show all keyboard shortcuts |
| `/create-extension` | Scaffold a new extension with interview-driven setup |
| `/create-slash-command` | Generate a new slash command from a plain-English description |

## Preferences

Kata preferences live in `~/.kata-cli/preferences.md` (global) or `.kata-cli/preferences.md` (project-local). Manage with `/kata prefs`.

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
| `models.*` | Per-phase model selection (Opus for planning, Sonnet for execution, etc.) |
| `skill_discovery` | `auto` / `suggest` / `off` — how Kata finds and applies skills |
| `auto_supervisor.*` | Timeout thresholds for auto-mode supervision |
| `budget_ceiling` | USD ceiling — auto mode pauses when reached |
| `uat_dispatch` | Enable automatic UAT runs after slice completion |
| `always_use_skills` | Skills to always load when relevant |
| `skill_rules` | Situational rules for skill routing |

## Project State

Kata stores all planning artifacts in `.kata/` at the project root:

```
.kata/
  STATE.md                — Quick-glance dashboard
  PROJECT.md              — What the project is (living doc)
  DECISIONS.md            — Append-only architecture decisions
  REQUIREMENTS.md         — Requirements tracking
  milestones/
    M001/
      M001-ROADMAP.md     — Slices with risk levels and dependencies
      M001-SUMMARY.md     — Milestone rollup
      slices/
        S01/
          S01-PLAN.md     — Tasks with must-haves and estimates
          S01-SUMMARY.md  — What was built, what changed
          tasks/
            T01-PLAN.md   — Steps, verification, files touched
            T01-SUMMARY.md
```

Everything is markdown. You can read it, edit it, or use it as context for other tools.

## Bundled Tools

Kata comes with extensions for:

- **Linear** — Built-in project management with 40 native tools (issues, projects, documents, labels)
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
2. Start Kata and provide the key when prompted, or set it in your environment:
   ```bash
   LINEAR_API_KEY=lin_api_... npx @kata-sh/cli
   ```
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

Beyond ad-hoc Linear operations, Kata can use Linear as the **backing store for its entire planning methodology**. Instead of `.kata/` files on disk, milestones, slices, tasks, plans, and summaries all live as Linear entities and documents.

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
  projectId: <your-project-uuid>
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
