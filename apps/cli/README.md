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

Tell Kata what you want to build, or use `/kata` to enter the structured planning workflow.

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

## Modes

### Interactive: `/kata`

The default mode. A contextual wizard that looks at your project state and suggests the next step — whether that's creating a milestone, planning a slice, or executing a task.

You drive each step. Kata proposes, you approve or redirect. Good for:

- Starting a new project or milestone
- Working through complex decisions that need human judgment
- Tasks where you want to stay in the loop

### Autonomous: `/kata auto`

Hands-off mode. Kata loops through the full workflow — research, plan, execute, complete, reassess — in fresh context windows until the milestone is done.

Each task gets a clean context window with only what it needs. Summaries compress prior work so context stays sharp. If something goes wrong, Kata writes a blocker and replans.

```
/kata auto       — start autonomous execution
/kata stop       — stop gracefully after the current task
/kata status     — check progress while it runs
```

Good for:

- Well-scoped milestones with clear requirements
- Overnight or background execution
- Grinding through implementation after the architecture is settled

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

- **Browser automation** — Playwright-based interaction with web pages
- **Subagents** — Spawn parallel Kata processes for independent tasks
- **Background shell** — Long-running processes (servers, watchers, builds)
- **Web search** — Brave Search API for current external facts
- **Library docs** — Context7 for up-to-date framework/library documentation
- **macOS tools** — Native app automation via Accessibility APIs
- **MCP servers** — Connect to any [Model Context Protocol](https://modelcontextprotocol.io/) server

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
