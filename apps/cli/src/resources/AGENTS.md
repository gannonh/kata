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
          auto.ts          — Auto-mode loop with session lock integration
          session-lock.ts  — OS-level exclusive locking for auto-mode sessions
          repo-identity.ts — Stable SHA-256 repo fingerprint across subdirs/worktrees
          worktree-resolver.ts — Git worktree path resolution
          atomic-write.ts  — Crash-safe file writes (rename-into-place)
        browser-tools/     — Playwright-based browser automation
        subagent/          — Spawns child kata processes for parallel work
          worker-registry.ts — Global registry of active subagent sessions
          elapsed.ts       — Human-readable elapsed time formatting
        slash-commands/     — create-slash-command, create-extension, audit slash commands
        shared/            — Shared UI components used by multiple extensions
        bg-shell/          — Background shell execution
        context7/          — Context7 library documentation lookup
        search-the-web/    — Web search via Brave API + pluggable provider abstraction
          provider.ts      — Search provider interface and registry
          tavily.ts        — Tavily search provider implementation
          native-search.ts — Brave native search (default provider)
        mac-tools/         — macOS-specific utilities
        linear/            — Built-in Linear integration (GraphQL client + tools)
        symphony/          — Symphony client extension (/symphony + symphony_* tools)
      skills/              — Bundled skills
  pkg/
    package.json           — piConfig shim (name: "kata", configDir: ".kata-cli")
    dist/                  — Theme assets copied from pi-coding-agent
  dist/                    — TypeScript compilation output
```

## Environment Variables

Kata sets these env vars in `loader.ts` before importing `cli.ts`:

| Variable                       | Purpose                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `PI_PACKAGE_DIR`               | Points to `pkg/` so pi reads Kata's piConfig                                         |
| `KATA_CODING_AGENT_DIR`        | Tells pi's `getAgentDir()` to return `~/.kata-cli/agent/`                            |
| `KATA_VERSION`                 | Package version for display                                                          |
| `KATA_BIN_PATH`                | Absolute path to loader, used by subagent to spawn Kata                              |
| `KATA_WORKFLOW_PATH`           | Absolute path to bundled KATA-WORKFLOW.md                                            |
| `KATA_BUNDLED_EXTENSION_PATHS` | Colon-joined list of extension entry points                                          |
| `KATA_MCP_CONFIG_PATH`         | Absolute path to `~/.kata-cli/agent/mcp.json` (also injected as `--mcp-config` argv) |

## The /kata Command

The main extension registers the `/kata` slash command with subcommands:

- `/kata` — Contextual wizard (smart entry point based on project state)
- `/kata step` — Execute one step (research, plan, task, etc.) then stop
- `/kata auto` — Start auto-mode (loops fresh sessions until milestone complete)
- `/kata stop` — Stop auto-mode gracefully
- `/kata status` — Progress dashboard
- `/kata queue` — View/manage work queue
- `/kata discuss` — Discuss gray areas before planning
- `/kata plan` — Enriched planning mode (plan next slice, pick slice, add slice, resequence slices, revise roadmap, discuss planning)
- `/kata prefs [global|project|status]` — Manage preferences
- `/kata pr [status|create|review|address|merge]` — PR lifecycle management

## The /symphony Command

The Symphony extension registers `/symphony` with operator-facing subcommands:

- `/symphony status` — Fetch live worker and queue state from Symphony (`/api/v1/state`)
- `/symphony watch <issue>` — Stream issue-scoped live events (`/api/v1/events?issue=...`)
- `/symphony console` — Open a live dashboard panel inside the chat interface (toggle on/off)
- `/symphony config` — Interactive TUI editor for Symphony WORKFLOW.md configuration

The extension also exposes model tools:

- `symphony_status` — live overview of workers, queue, completions, supervisor state
- `symphony_watch` — follow one worker's activity stream in real time
- `symphony_respond` — respond to a pending worker escalation
- `symphony_logs` — capability placeholder (future: stream full agent conversation)
- `symphony_steer` — capability placeholder (future: inject guidance into running worker)

### Symphony Connection

Configure `symphony.url` in `.kata/preferences.md`:

```yaml
symphony:
  url: http://localhost:8080
```

Or set `KATA_SYMPHONY_URL` environment variable. The preference takes priority.

### Worker Escalation

When a Symphony worker hits ambiguity, it escalates to connected Kata CLI sessions. The question appears in the CLI (or console panel if active), the operator answers, and the worker resumes without restarting. Escalations have a configurable timeout (default 5 min).

### Console Panel

`/symphony console` renders a live panel showing:
- Connection indicator (🟢/🔴/🟡)
- Worker table (identifier, state, tool activity, model, last activity)
- Pending escalations (⚠️ highlighted with question preview)
- Queue and completion counts

Configure placement with `symphony.console_position` preference (`below-output` or `above-status`).

## Project State

Kata workflow state is Linear-backed in this codebase:

- Milestones → Linear project milestones (`[M###]`)
- Slices → Linear parent issues (`[S##]`)
- Tasks → Linear sub-issues (`[T##]`)
- Artifacts (roadmaps, context, research, summaries, decisions) → Linear documents/comments

The local `.kata/` directory remains for runtime metadata (preferences, activity logs, metrics), not as the source of truth for workflow artifacts.

## PR Lifecycle

When `pr.enabled: true` in preferences, auto-mode gates slice completion on PR creation instead of squash-merging directly to main.

Three modes based on preferences:

- **PR disabled** (`pr.enabled: false`, default) -- auto-mode squash-merges to main and continues
- **Auto-create** (`pr.enabled: true`, `pr.auto_create: true`) -- auto-mode creates PR via `gh`, then stops. User merges, then resumes with `/kata auto`
- **Manual** (`pr.enabled: true`, `pr.auto_create: false`) -- auto-mode stops and prompts user to run `/kata pr create`

### Subcommands

- `/kata pr status` -- deterministic status check (no LLM turn). Shows enabled state, current branch, base branch, open PR if any.
- `/kata pr create` -- dispatches prompt to create PR with configured base branch. Chains into review if `review_on_create: true`.
- `/kata pr review` -- runs parallel multi-agent code review on the open PR.
- `/kata pr address` -- dispatches prompt to address review comments and fix feedback.
- `/kata pr merge` -- dispatches prompt to merge the PR, sync local branches, and advance Linear issues if `linear_link: true`.

### Preferences

```yaml
pr:
  enabled: true
  auto_create: true
  base_branch: main
  review_on_create: false
  linear_link: false
models:
  review: claude-sonnet-4-6   # model for PR reviewer subagents
```

Set `linear_link: true` with `workflow.mode: linear` to include `Closes KAT-N` references in PR bodies and advance Linear issue state on merge. In Linear mode, PR composition reads the slice plan from the slice issue description and may include optional summary artifacts; it does not require legacy `S01-PLAN` documents.

Set `models.review` to control which model the PR reviewer subagents use. Sonnet is recommended (faster, parallel-friendly). Omit to use the default model.

## Development

- **Build**: `npx tsc` (TypeScript compilation)
- **Test**: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/*.test.ts' 'src/tests/*.test.ts'`
- **Copy themes**: `npm run copy-themes` (copies theme assets from pi-coding-agent)
- **Dependencies**: Consumed via npm from `@mariozechner/pi-coding-agent` — never fork

## Agent Skills

Agent Skills are self-contained capability packages that the agent loads on-demand. A skill provides specialized workflows, setup instructions, helper scripts, and reference documentation for specific tasks.

Kata implements the [Agent Skills standard](https://agentskills.io/specification), warning about violations but remaining lenient.

Kata can create skills. Ask it to build one for your use case.

### Locations

> **Security:** Skills can instruct the model to perform any action and may include executable code the model invokes. Review skill content before use.

Kata loads skills from:

- Global:
  - `~/.kata-cli/agent/skills/`
  - `~/.agents/skills/`
- Project:
  - `.kata-cli/skills/`
  - `.agents/skills/` in `cwd` and ancestor directories (up to git repo root, or filesystem root when not in a repo)
- CLI: `--skill <path>` (repeatable, additive even with `--no-skills`)

Discovery rules:

- Direct `.md` files in the skills directory root
- Recursive `SKILL.md` files under subdirectories

#### Using Skills from Other Harnesses

To use skills from Claude Code or OpenAI Codex, add their directories to settings:

```json
{
  "skills": [
    "~/.claude/skills",
    "~/.codex/skills"
  ]
}
```

For project-level Claude Code skills, add to `.kata-cli/settings.json`:

```json
{
  "skills": ["../.claude/skills"]
}
```

### Skill Commands

Skills register as `/skill:name` commands:

```bash
/skill:brave-search           # Load and execute the skill
/skill:pdf-tools extract      # Load skill with arguments
```

Arguments after the command are appended to the skill content as `User: <args>`.

Toggle skill commands via `/settings` in interactive mode or in `settings.json`:

```json
{
  "enableSkillCommands": true
}
```

### Skill Structure

A skill is a directory with a `SKILL.md` file. Everything else is freeform.

```
my-skill/
├── SKILL.md              # Required: frontmatter + instructions
├── scripts/              # Helper scripts
│   └── process.sh
├── references/           # Detailed docs loaded on-demand
│   └── api-reference.md
└── assets/
    └── template.json
```

#### SKILL.md Format

```markdown
---
name: my-skill
description: What this skill does and when to use it. Be specific.
---
```

### Frontmatter

Per the [Agent Skills specification](https://agentskills.io/specification#frontmatter-required):

| Field                      | Required | Description                                                                    |
| -------------------------- | -------- | ------------------------------------------------------------------------------ |
| `name`                     | Yes      | Max 64 chars. Lowercase a-z, 0-9, hyphens. Must match parent directory.        |
| `description`              | Yes      | Max 1024 chars. What the skill does and when to use it.                        |
| `license`                  | No       | License name or reference to bundled file.                                     |
| `compatibility`            | No       | Max 500 chars. Environment requirements.                                       |
| `metadata`                 | No       | Arbitrary key-value mapping.                                                   |
| `allowed-tools`            | No       | Space-delimited list of pre-approved tools (experimental).                     |
| `disable-model-invocation` | No       | When `true`, skill is hidden from system prompt. Users must use `/skill:name`. |

#### Name Rules

- 1-64 characters
- Lowercase letters, numbers, hyphens only
- No leading/trailing hyphens
- No consecutive hyphens
- Must match parent directory name

Valid: `pdf-processing`, `data-analysis`, `code-review`
Invalid: `PDF-Processing`, `-pdf`, `pdf--processing`

#### Description Best Practices

The description determines when the agent loads the skill. Be specific.

Good:

```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents.
```

Poor:

```yaml
description: Helps with PDFs.
```

### Validation

Kata validates skills against the Agent Skills standard. Most issues produce warnings but still load the skill:

- Name doesn't match parent directory
- Name exceeds 64 characters or contains invalid characters
- Name starts/ends with hyphen or has consecutive hyphens
- Description exceeds 1024 characters

Unknown frontmatter fields are ignored.

**Exception:** Skills with missing description are not loaded.

Name collisions (same name from different locations) warn and keep the first skill found.

## Custom Agents

Custom agents are specialized subagents with isolated context windows and distinct system prompts. They are plain `.md` files with YAML frontmatter that Kata invokes via the `subagent` tool.

### Locations

- **User (global):** `~/.kata-cli/agent/agents/`
- **Project-local:** `.kata/agents/`

Agents in both locations are discovered automatically. Use `/subagent` to list all available agents.

### Agent File Format

An agent is a `.md` file with frontmatter and a body that becomes the system prompt:

```markdown
---
name: my-agent
description: What this agent does and when to use it.
tools: read, bash, edit, write
model: anthropic/claude-sonnet-4-5
---

You are a specialized agent. Your job is to...

## Strategy

1. Do this first
2. Then do that

## Output format

Return your findings as...
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Agent identifier used when invoking it |
| `description` | Yes | What it does — determines when Kata selects it |
| `tools` | No | Comma-separated list of allowed tools (default: all) |
| `model` | No | Override the model for this agent (e.g. `anthropic/claude-haiku-3-5`) |

The file body (below the frontmatter) is the agent's full system prompt.

### Bundled Agents

Kata ships three built-in agents (synced to `~/.kata-cli/agent/agents/` on launch):

| Agent | Description |
|-------|-------------|
| `scout` | Fast codebase recon — returns compressed context for handoff |
| `worker` | General-purpose agent with full capabilities, isolated context |
| `researcher` | Web researcher using Brave Search |

### Usage

The `subagent` tool invokes agents:

```
subagent({ agent: "my-agent", task: "Do this specific thing" })
```

For parallel execution or chaining, see the `subagent` tool description in the tool list.

To see all available agents, run `/subagent` in the Kata prompt.

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

| Mode             | Behavior                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `lazy` (default) | Connect on first tool call. Disconnect after idle timeout. Cached metadata keeps search/list working offline. |
| `eager`          | Connect at startup. No auto-reconnect on drop.                                                                |
| `keep-alive`     | Connect at startup. Auto-reconnect via health checks.                                                         |

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

## Built-in Linear Integration

Kata ships a built-in Linear extension with a custom GraphQL client — no MCP server required. It provides native tools whenever a Linear API key is available in runtime env (typically hydrated from `~/.kata-cli/agent/auth.json`, or set manually as `LINEAR_API_KEY`).

### Setup

Provide a Linear personal API key via Kata onboarding (stored in `~/.kata-cli/agent/auth.json`) or set `LINEAR_API_KEY` manually in your environment. `.env` is optional. Once the key is available at runtime, the tools are immediately available.

### Tools

**Workspace & Teams:**
`linear_list_teams`, `linear_get_team`, `linear_get_viewer`

**Projects:**
`linear_create_project`, `linear_get_project`, `linear_list_projects`, `linear_update_project`, `linear_delete_project`

**Milestones** (belong to projects):
`linear_create_milestone`, `linear_get_milestone`, `linear_list_milestones`, `linear_update_milestone`, `linear_delete_milestone`

**Issues:**
`linear_create_issue`, `linear_get_issue`, `linear_list_issues`, `linear_update_issue`, `linear_delete_issue`

**Workflow:**
`linear_list_workflow_states`, `linear_create_label`, `linear_list_labels`, `linear_delete_label`, `linear_ensure_label`

**Comments:**
`linear_add_comment`

**Documents:**
`linear_create_document`, `linear_get_document`, `linear_list_documents`, `linear_update_document`, `linear_delete_document`

**Kata workflow tools** (used by Linear workflow mode):
`kata_derive_state`, `kata_ensure_labels`, `kata_create_milestone`, `kata_create_slice`, `kata_create_task`, `kata_list_slices`, `kata_list_tasks`, `kata_list_milestones`, `kata_list_documents`, `kata_read_document`, `kata_write_document`, `kata_update_issue_state`

### Linear workflow mode

When a project's preferences set `workflow.mode: linear`, Kata uses Linear as the backing store for its planning methodology instead of `.kata/` files on disk. Milestones, slices, tasks, plans, and summaries all live in Linear.

Linear/Kata tool outputs are intentionally bounded: inventory/list tools return compact summaries, issue/document reads expose paged body content with continuation guidance, and mutation tools avoid echoing full updated objects. Prefer the scoped discovery tools first, then page into a specific issue or document only when needed.

To configure Linear workflow mode, update these fields in `.kata/preferences.md`:

```yaml
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectSlug: <project-slug>
```

Use `linear_list_projects` to find the project UUID.

**Important:** When editing `.kata/preferences.md`, use `edit` to change individual fields — never overwrite the file with `write`. The preferences file contains many settings (PR config, skills, models, supervisor timeouts) and overwriting it destroys everything except what you're adding.

### Built-in vs MCP Linear

The built-in extension is separate from the Linear MCP server. You do **not** need to configure MCP to use Linear — the built-in tools work directly. The MCP setup described in the MCP Support section is an alternative approach using Linear's official MCP server with OAuth; the built-in extension uses a personal API key instead.

## Key Conventions

- All env var names use `KATA_` prefix (not `GSD_` or `PI_`)
- Config directory is `.kata-cli` (the `-cli` suffix avoids collision)
- Extensions are synced from `src/resources/extensions/` to `~/.kata-cli/agent/extensions/` on every launch
- The `shared/` extension directory is a library, not an entry point — it's imported by other extensions
- Branch naming for workflow: `kata/<scope>/M001/S01` (namespaced; legacy `kata/M001/S01` remains compatible)
- MCP config lives at `~/.kata-cli/agent/mcp.json` (not `~/.pi/agent/mcp.json`)
