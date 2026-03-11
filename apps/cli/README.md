# Kata CLI

A terminal coding agent built on [pi](https://github.com/badlogic/pi-mono) (`@mariozechner/pi-coding-agent`). Kata CLI bundles a curated set of extensions for structured planning, browser automation, web search, subagent orchestration, and more.

## Quick Start

```bash
# From the monorepo root
bun install
cd apps/cli
npx tsc
npm run copy-themes
node dist/loader.js
```

Authenticate with an API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node dist/loader.js
```

## Architecture

Kata CLI is a thin wrapper around pi-coding-agent. It does not fork pi — it consumes it as an npm dependency and layers on branding, config, and bundled extensions.

```
apps/cli/
  src/
    loader.ts              — Entry point: sets KATA_* env vars, imports cli.ts
    cli.ts                 — Calls pi-coding-agent's main()
    app-paths.ts           — ~/.kata-cli/ path constants
    resource-loader.ts     — Syncs bundled resources to ~/.kata-cli/agent/
    wizard.ts              — First-run setup, env key hydration
    resources/
      KATA-WORKFLOW.md     — The Kata planning methodology
      AGENTS.md            — System prompt instructions (synced to agent dir)
      agents/              — Agent templates (worker, scout, researcher)
      extensions/          — Bundled extensions (see below)
      skills/              — Bundled skills
  pkg/
    package.json           — piConfig shim (name: "kata", configDir: ".kata-cli")
    dist/                  — Theme assets copied from pi-coding-agent
```

### How It Works

1. `loader.ts` sets `PI_PACKAGE_DIR` to `pkg/` so pi reads Kata's branding config
2. `loader.ts` sets `KATA_CODING_AGENT_DIR` so pi uses `~/.kata-cli/agent/` instead of `~/.pi/agent/`
3. `resource-loader.ts` syncs bundled extensions, agents, skills, and `AGENTS.md` to `~/.kata-cli/agent/` on every launch
4. `cli.ts` calls pi-coding-agent's `main()` — pi handles everything from there

## Bundled Extensions

| Extension | Description |
|-----------|-------------|
| `kata/` | Main extension: `/kata` command, auto-mode, planning, state management |
| `browser-tools/` | Playwright-based browser automation |
| `subagent/` | Spawns child Kata processes for parallel work |
| `slash-commands/` | `/kata-run` and other slash commands |
| `bg-shell/` | Background shell execution |
| `context7/` | Context7 library documentation lookup |
| `search-the-web/` | Web search via Brave API |
| `mac-tools/` | macOS-specific utilities |
| `shared/` | Shared UI components (library, not an entry point) |

## The /kata Command

The main extension registers `/kata` with subcommands:

| Command | Description |
|---------|-------------|
| `/kata` | Contextual wizard — smart entry point based on project state |
| `/kata auto` | Start auto-mode (loops fresh sessions until milestone complete) |
| `/kata stop` | Stop auto-mode gracefully |
| `/kata status` | Progress dashboard |
| `/kata queue` | View/manage work queue |
| `/kata discuss` | Discuss gray areas before planning |
| `/kata prefs` | Manage preferences (global/project/status) |
| `/kata doctor` | Diagnose and fix project state |

### Project State

Kata stores planning state in `.kata/` at the project root:

```
.kata/
  STATE.md              — Dashboard (read first)
  DECISIONS.md          — Append-only decisions register
  PROJECT.md            — Project description
  REQUIREMENTS.md       — Requirements tracking
  milestones/
    M001/
      M001-ROADMAP.md   — Milestone plan with slices
      slices/
        S01/
          S01-PLAN.md   — Task decomposition
          tasks/
            T01-PLAN.md
            T01-SUMMARY.md
```

## Config Directory

Kata uses `~/.kata-cli/` (not `~/.kata/`) to avoid collision with other Kata apps (desktop, etc.):

```
~/.kata-cli/
  agent/
    extensions/          — Synced from src/resources/extensions/
    agents/              — Synced from src/resources/agents/
    skills/              — Synced from src/resources/skills/
    AGENTS.md            — Synced from src/resources/AGENTS.md
    auth.json            — API keys
    settings.json        — User settings
    models.json          — Custom model definitions
  sessions/              — Session history
  preferences.md         — Global Kata preferences
```

## Environment Variables

Set by `loader.ts` before pi starts:

| Variable | Purpose |
|----------|---------|
| `PI_PACKAGE_DIR` | Points to `pkg/` for Kata's piConfig |
| `KATA_CODING_AGENT_DIR` | Tells pi to use `~/.kata-cli/agent/` |
| `KATA_VERSION` | Package version for display |
| `KATA_BIN_PATH` | Absolute path to loader, used by subagent |
| `KATA_WORKFLOW_PATH` | Absolute path to bundled KATA-WORKFLOW.md |
| `KATA_BUNDLED_EXTENSION_PATHS` | Colon-joined extension entry points for subagent |

## Development

```bash
# Build
npx tsc

# Copy theme assets (required once, or after pi-coding-agent updates)
npm run copy-themes

# Run
node dist/loader.js

# Test
npm test
```

### Key Dependency

`@mariozechner/pi-coding-agent` is consumed via npm (hoisted to monorepo root `node_modules/`). Never fork — run `npm update` to pick up upstream changes.

## License

MIT
