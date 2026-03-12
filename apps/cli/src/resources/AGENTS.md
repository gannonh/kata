# Kata CLI — Agent Instructions

You are working inside Kata CLI, a coding agent built on the pi SDK (`@mariozechner/pi-coding-agent`).

## Architecture

Kata CLI is a thin wrapper around pi-coding-agent that provides:

- **Branded entry point**: `src/loader.ts` sets env vars and launches `src/cli.ts`
- **Bundled extensions**: `src/resources/extensions/` contains all built-in extensions
- **Resource syncing**: `src/resource-loader.ts` copies bundled extensions to `~/.kata-cli/agent/` on startup
- **Config directory**: `~/.kata-cli/` (not `~/.pi/` to avoid collision with other Kata apps)
- **Package shim**: `pkg/package.json` provides `piConfig` with `name: "kata"` and `configDir: ".kata-cli"`

## Directory Structure

```
apps/cli/
  src/
    loader.ts              — Entry point, sets KATA_* env vars, imports cli.ts
    cli.ts                 — Thin wrapper that calls createAgentSession() + InteractiveMode
    app-paths.ts           — Exports appRoot, agentDir, sessionsDir, authFilePath
    resource-loader.ts     — Syncs bundled resources to ~/.kata-cli/agent/
    wizard.ts              — First-run setup, env key hydration
    resources/
      KATA-WORKFLOW.md     — The Kata planning methodology document
      AGENTS.md            — This file (synced to ~/.kata-cli/agent/AGENTS.md)
      agents/              — Agent prompt templates (worker, scout, researcher)
      extensions/
        kata/              — Main extension: /kata command, auto-mode, planning, state
        browser-tools/     — Playwright-based browser automation
        subagent/          — Spawns child kata processes for parallel work
        slash-commands/     — /kata-run and other slash commands
        shared/            — Shared UI components used by multiple extensions
        bg-shell/          — Background shell execution
        context7/          — Context7 library documentation lookup
        search-the-web/    — Web search via Brave API
        mac-tools/         — macOS-specific utilities
      skills/              — Bundled skills
  pkg/
    package.json           — piConfig shim (name: "kata", configDir: ".kata-cli")
    dist/                  — Theme assets copied from pi-coding-agent
  dist/                    — TypeScript compilation output
```

## Environment Variables

Kata sets these env vars in `loader.ts` before importing `cli.ts`:

| Variable | Purpose |
|----------|---------|
| `PI_PACKAGE_DIR` | Points to `pkg/` so pi reads Kata's piConfig |
| `KATA_CODING_AGENT_DIR` | Tells pi's `getAgentDir()` to return `~/.kata-cli/agent/` |
| `KATA_VERSION` | Package version for display |
| `KATA_BIN_PATH` | Absolute path to loader, used by subagent to spawn Kata |
| `KATA_WORKFLOW_PATH` | Absolute path to bundled KATA-WORKFLOW.md |
| `KATA_BUNDLED_EXTENSION_PATHS` | Colon-joined list of extension entry points |
| `KATA_MCP_CONFIG_PATH` | Absolute path to `~/.kata-cli/agent/mcp.json` (also injected as `--mcp-config` argv) |

## The /kata Command

The main extension registers the `/kata` slash command with subcommands:

- `/kata` — Contextual wizard (smart entry point based on project state)
- `/kata auto` — Start auto-mode (loops fresh sessions until milestone complete)
- `/kata stop` — Stop auto-mode gracefully
- `/kata status` — Progress dashboard
- `/kata queue` — View/manage work queue
- `/kata discuss` — Discuss gray areas before planning
- `/kata prefs [global|project|status]` — Manage preferences
- `/kata doctor [audit|fix|heal]` — Diagnose and fix project state

## Project State

Kata stores project state in `.kata/` at the project root:

```
.kata/
  STATE.md              — Dashboard (read first)
  DECISIONS.md          — Append-only decisions register
  PROJECT.md            — Project description
  REQUIREMENTS.md       — Requirements tracking
  milestones/
    M001/
      M001-ROADMAP.md   — Milestone plan with slices
      M001-SUMMARY.md   — Milestone rollup
      slices/
        S01/
          S01-PLAN.md    — Task decomposition
          S01-SUMMARY.md — Slice summary
          tasks/
            T01-PLAN.md
            T01-SUMMARY.md
```

## Development

- **Build**: `npx tsc` (TypeScript compilation)
- **Test**: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/*.test.ts' 'src/tests/*.test.ts'`
- **Copy themes**: `npm run copy-themes` (copies theme assets from pi-coding-agent)
- **Dependencies**: Consumed via npm from `@mariozechner/pi-coding-agent` — never fork

## MCP Support

Kata ships with MCP (Model Context Protocol) support via [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter), auto-installed on first launch. One proxy `mcp` tool (~200 tokens) gives the agent on-demand access to any MCP server's tools without burning context on tool definitions.

### How it works

There are three integration points that make MCP work in Kata:

1. **Package seeding** (`cli.ts`): Seeds `npm:pi-mcp-adapter` into `settingsManager.getPackages()` on every startup. Pi's package manager auto-installs it globally if missing.

2. **Config path injection** (`loader.ts` + `cli.ts`): Kata bypasses pi's `main()` and calls `createAgentSession()` directly, which means pi's two-pass argv parsing (that normally populates `runtime.flagValues`) never runs. Two things compensate:
   - `loader.ts` pushes `--mcp-config ~/.kata-cli/agent/mcp.json` into `process.argv` — the adapter reads this at extension load time for `directTools` registration.
   - `cli.ts` manually sets `runtime.flagValues.set('mcp-config', ...)` after `resourceLoader.reload()` — the adapter reads this via `pi.getFlag('mcp-config')` at `session_start` for the main initialization.

3. **Config scaffolding** (`resource-loader.ts`): Creates a starter `~/.kata-cli/agent/mcp.json` on first launch. Never overwrites existing config.

### Configuring MCP servers

Edit `~/.kata-cli/agent/mcp.json` to add servers. Servers can use **stdio** (local process) or **HTTP** (remote endpoint) transport.

#### Stdio servers (local process)

Most MCP servers run as a local process via `npx`:

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

#### HTTP servers with OAuth (e.g. Linear)

Many hosted MCP servers (Linear, Figma, etc.) use OAuth 2.1 authentication via the MCP spec. These require [`mcp-remote`](https://github.com/geelen/mcp-remote) as a stdio proxy that handles the OAuth browser flow:

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

On first connection, `mcp-remote` opens a browser window for OAuth consent. Tokens are cached in `~/.mcp-auth/` for subsequent sessions.

**Linear MCP setup (complete example):**

1. Add the server to `~/.kata-cli/agent/mcp.json`:
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

2. Restart Kata.

3. Connect the server (triggers the OAuth flow in your browser):
   ```
   mcp({ connect: "linear" })
   ```

4. Authorize Kata in the browser when prompted by Linear.

5. Use Linear tools:
   ```
   mcp({ server: "linear" })          — list all Linear tools
   mcp({ search: "issues" })          — search for issue-related tools
   mcp({ tool: "linear_list_teams" }) — call a specific tool
   ```

**Troubleshooting OAuth:**
- If you see `internal server error`, clear cached auth: `rm -rf ~/.mcp-auth` and reconnect.
- Make sure you're running a recent version of Node.js.
- Use `/mcp` to check server status interactively.

#### HTTP servers with bearer token auth

For servers that accept API keys or personal access tokens:

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

Supported sources: `cursor`, `claude-code`, `claude-desktop`, `vscode`, `windsurf`, `codex`.

### Server lifecycle

| Mode | Behavior |
|------|----------|
| `lazy` (default) | Connect on first tool call. Disconnect after idle timeout. Cached metadata keeps search/list working offline. |
| `eager` | Connect at startup. No auto-reconnect on drop. |
| `keep-alive` | Connect at startup. Auto-reconnect via health checks. |

### Usage

```
mcp({ })                                 — show server status
mcp({ server: "linear" })               — list tools from a server
mcp({ search: "issues create" })         — search tools (space-separated words OR'd)
mcp({ describe: "linear_save_issue" })   — show tool parameters
mcp({ tool: "linear_list_teams" })       — call a tool (no args)
mcp({ tool: "linear_save_issue", args: '{"title": "Bug fix"}' })  — call with args (JSON string)
mcp({ connect: "linear" })               — force connect/reconnect a server
/mcp                                      — interactive panel (status, tools, reconnect, OAuth)
```

### Known limitations

- **OAuth servers require `mcp-remote`**: The adapter doesn't implement the MCP OAuth browser flow natively. Use `mcp-remote` as a stdio proxy for any server that requires OAuth (Linear, Figma remote, etc.).
- **Figma remote MCP (`mcp.figma.com`)**: Blocks dynamic client registration — only whitelisted clients (Cursor, Claude Code, VS Code) can connect via OAuth. Use the Figma desktop app's local MCP server instead (`http://127.0.0.1:3845/mcp`), which requires Figma desktop with Dev Mode (paid plan).
- **Metadata cache path**: `pi-mcp-adapter` caches tool metadata to `~/.pi/agent/mcp-cache.json` (hardcoded). This doesn't affect functionality — just means the cache lives outside Kata's config dir.
- **OAuth token storage**: `mcp-remote` stores tokens in `~/.mcp-auth/`, separate from Kata's config dir.

## Key Conventions

- All env var names use `KATA_` prefix (not `GSD_` or `PI_`)
- Config directory is `.kata-cli` (the `-cli` suffix avoids collision)
- Extensions are synced from `src/resources/extensions/` to `~/.kata-cli/agent/extensions/` on every launch
- The `shared/` extension directory is a library, not an entry point — it's imported by other extensions
- Branch naming for workflow: `kata/M001/S01` (milestone/slice)
- MCP config lives at `~/.kata-cli/agent/mcp.json` (not `~/.pi/agent/mcp.json`)
