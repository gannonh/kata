# Kata CLI

A terminal coding agent built on [pi](https://github.com/badlogic/pi-mono) (`@mariozechner/pi-coding-agent`). Kata CLI bundles a curated set of extensions for structured planning, browser automation, web search, subagent orchestration, MCP server integration, and more.

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
    cli.ts                 — Calls createAgentSession() + InteractiveMode
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
3. `loader.ts` injects `--mcp-config ~/.kata-cli/agent/mcp.json` into `process.argv` for the MCP adapter
4. `resource-loader.ts` syncs bundled extensions, agents, skills, and `AGENTS.md` to `~/.kata-cli/agent/` on every launch
5. `resource-loader.ts` scaffolds a starter `mcp.json` on first launch (never overwrites existing config)
6. `cli.ts` seeds `npm:pi-mcp-adapter` into settings so pi auto-installs it
7. `cli.ts` injects the `mcp-config` flag into the extension runtime (required because Kata bypasses pi's `main()` and its two-pass argv parsing)
8. `cli.ts` calls `createAgentSession()` + `InteractiveMode` — pi handles everything from there

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

## MCP Support

Kata ships with [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) support via [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter), auto-installed on first launch. One proxy `mcp` tool (~200 tokens in context) gives the agent on-demand access to any MCP server's tools without burning context on individual tool definitions.

### How It Works

The MCP integration has three parts:

1. **Package seeding**: `cli.ts` ensures `npm:pi-mcp-adapter` is in the settings packages list on every startup. Pi's package manager auto-installs it globally if missing.
2. **Config path injection**: `loader.ts` pushes `--mcp-config` into `process.argv` and `cli.ts` sets the flag on `runtime.flagValues` — both are needed because the adapter reads the config path at two different points in its lifecycle.
3. **Config scaffolding**: `resource-loader.ts` creates a starter `~/.kata-cli/agent/mcp.json` on first launch. Never overwrites existing config.

### Adding MCP Servers

Edit `~/.kata-cli/agent/mcp.json`:

```json
{
  "settings": {
    "toolPrefix": "server",
    "idleTimeout": 10
  },
  "mcpServers": {}
}
```

#### Example: Linear (OAuth via mcp-remote)

Many hosted MCP servers (Linear, etc.) use OAuth 2.1 authentication. These require [`mcp-remote`](https://github.com/geelen/mcp-remote) as a stdio proxy that handles the browser-based OAuth flow:

```json
{
  "settings": { "toolPrefix": "server", "idleTimeout": 10 },
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.linear.app/mcp"]
    }
  }
}
```

After adding the config and restarting Kata:

1. Connect the server (opens browser for OAuth):
   ```
   mcp({ connect: "linear" })
   ```
2. Authorize in the browser when prompted by Linear.
3. Use tools:
   ```
   mcp({ server: "linear" })              — list all Linear tools
   mcp({ search: "issues" })              — search for issue-related tools
   mcp({ tool: "linear_list_teams" })     — call a tool
   ```

Tokens are cached in `~/.mcp-auth/` for subsequent sessions. If you hit errors, clear cached auth with `rm -rf ~/.mcp-auth` and reconnect.

#### Example: Stdio server with env vars

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "some-mcp-server"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    }
  }
}
```

Environment variables support `${VAR}` interpolation from `process.env`.

#### Example: HTTP server with bearer token

```json
{
  "mcpServers": {
    "my-api": {
      "url": "https://api.example.com/mcp",
      "auth": "bearer",
      "bearerTokenEnv": "MY_API_KEY"
    }
  }
}
```

#### Importing existing configs

Pull in your existing Claude Code, Cursor, or VS Code MCP configuration:

```json
{
  "imports": ["claude-code", "cursor"],
  "mcpServers": {}
}
```

Supported: `cursor`, `claude-code`, `claude-desktop`, `vscode`, `windsurf`, `codex`.

### Server Lifecycle

| Mode | Behavior |
|------|----------|
| `lazy` (default) | Connect on first tool call. Disconnect after idle timeout. Cached metadata keeps search/list working offline. |
| `eager` | Connect at startup. No auto-reconnect on drop. |
| `keep-alive` | Connect at startup. Auto-reconnect via health checks. |

### Usage Reference

| Command | Description |
|---------|-------------|
| `mcp({ })` | Show server status |
| `mcp({ server: "name" })` | List tools from a server |
| `mcp({ search: "query" })` | Search tools (space-separated words OR'd) |
| `mcp({ describe: "tool_name" })` | Show tool parameters |
| `mcp({ tool: "name", args: '{}' })` | Call a tool (args is a JSON string) |
| `mcp({ connect: "name" })` | Force connect/reconnect a server |
| `/mcp` | Interactive panel (status, tools, reconnect) |

### Known Limitations

- **OAuth servers require `mcp-remote`**: The adapter doesn't implement the MCP OAuth browser flow natively. Use `mcp-remote` as a stdio proxy for OAuth servers.
- **Figma remote MCP** (`mcp.figma.com`): Blocks dynamic client registration — only whitelisted clients can connect via OAuth. Use Figma's desktop app local MCP server instead (`http://127.0.0.1:3845/mcp`), which requires Dev Mode (paid plan).
- **Metadata cache**: `pi-mcp-adapter` caches tool metadata to `~/.pi/agent/mcp-cache.json` (hardcoded path, doesn't affect functionality).
- **OAuth token storage**: `mcp-remote` stores tokens in `~/.mcp-auth/`, separate from Kata's config dir.

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
    mcp.json             — MCP server configuration (scaffolded on first launch, never overwritten)
    auth.json            — API keys
    settings.json        — User settings (includes packages: ["npm:pi-mcp-adapter"])
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
| `KATA_MCP_CONFIG_PATH` | Absolute path to `~/.kata-cli/agent/mcp.json` |

## Development

```bash
# Build
npx tsc

# Copy theme assets (required once, or after pi-coding-agent updates)
npm run copy-themes

# Run
node dist/loader.js

# Test (37 tests: app smoke, resource sync, MCP integration, package validation)
npm test
```

### Key Dependency

`@mariozechner/pi-coding-agent` is consumed via npm (hoisted to monorepo root `node_modules/`). Never fork — run `npm update` to pick up upstream changes.

## License

MIT
