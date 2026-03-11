# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Project Overview

Kata Desktop is a desktop application for working with AI agents, built on the Claude Agent SDK. It provides multi-session management, MCP server integration, REST API connections, and a document-centric workflow in a polished Electron-based UI.

## Build and Development Commands

```bash
# Install dependencies (uses Bun)
bun install

# Development with hot reload
bun run electron:dev

# Build and run
bun run electron:start

# Type checking
bun run typecheck:all

# Linting
bun run lint:electron

# Run tests (uses Bun test runner)
bun test
bun test packages/shared          # Run tests for a specific package
bun test packages/mermaid/src/__tests__/parser.test.ts  # Single test file

# Distribution builds (run from apps/electron directory)
cd apps/electron && bun run dist:mac         # macOS DMG
cd apps/electron && bun run dist:mac:x64     # macOS DMG (Intel)
cd apps/electron && bun run dist:win         # Windows NSIS installer

# Print system prompt (useful for debugging)
bun run print:system-prompt
```

## Architecture

This is a Bun monorepo using workspace packages:

```
apps/
└── electron/                     # Desktop app (primary)
    └── src/
        ├── main/                 # Electron main process (Node.js)
        │   ├── index.ts          # App entry, window lifecycle, Sentry
        │   ├── ipc.ts            # IPC handlers for renderer communication
        │   ├── sessions.ts       # SessionManager - spawns Bun subprocesses for agent execution
        │   ├── daemon-manager.ts # DaemonManager - spawns/supervises daemon subprocess
        │   └── window-manager.ts # Multi-window management
        ├── preload/              # Context bridge (exposes IPC to renderer)
        └── renderer/             # React UI (Vite + shadcn)
            ├── atoms/            # Jotai state atoms
            ├── components/       # React components
            ├── event-processor/  # Converts SDK events → UI state
            └── hooks/            # Custom React hooks

packages/
├── core/                         # Shared TypeScript types
│   └── src/types/                # Workspace, Session, Message, AgentEvent types
├── shared/                       # Business logic (agent, auth, config, MCP)
│   └── src/
│       ├── agent/                # CraftAgent (wraps Claude Agent SDK)
│       ├── auth/                 # OAuth flows (Google, Slack, Microsoft, Claude)
│       ├── config/               # Storage, preferences, theme system
│       ├── credentials/          # AES-256-GCM encrypted credential storage
│       ├── mcp/                  # MCP client and validation
│       ├── prompts/              # System prompt generation
│       ├── channels/             # Channel adapters (Slack, WhatsApp), trigger matching, session resolution
│       ├── daemon/               # Daemon subprocess (SQLite queue, JSON-lines IPC, PID management, channel orchestration)
│       ├── sessions/             # Session persistence (JSONL format)
│       └── sources/              # External data connections
├── ui/                           # Shared React components
│   └── src/components/
│       ├── chat/                 # SessionViewer, TurnCard
│       └── markdown/             # Markdown rendering with Shiki
└── mermaid/                      # Mermaid diagram → SVG renderer
```

## Key Architectural Patterns

### Agent Execution Model

The Electron main process spawns agent sessions as separate Bun subprocesses. This isolates agent execution and allows background processing:

1. `SessionManager` (main process) spawns a Bun process running the Claude Agent SDK
2. Agent events stream back via stdout/stderr and are parsed in the main process
3. Events are forwarded to the renderer via IPC for UI updates
4. The renderer's `EventProcessor` converts SDK events into UI state

### Permission Modes

Three-level permission system per session (cycle with SHIFT+TAB):

| Mode        | Display     | Behavior                            |
| ----------- | ----------- | ----------------------------------- |
| `safe`      | Explore     | Read-only, blocks write operations  |
| `ask`       | Ask to Edit | Prompts for bash commands (default) |
| `allow-all` | Auto        | Auto-approves all commands          |

### Configuration Storage

All configuration is stored at `~/.kata/`:

- `config.json` - Main config (workspaces, auth type)
- `credentials.enc` - AES-256-GCM encrypted credentials
- `preferences.json` - User preferences
- `theme.json` - App-level theme
- `workspaces/{id}/` - Per-workspace data (sessions, sources, skills)

### Package Imports

Use subpath exports for clean imports:

```typescript
// From @craft-agent/shared
import { CraftAgent } from '@craft-agent/shared/agent';
import { loadStoredConfig } from '@craft-agent/shared/config';
import { getCredentialManager } from '@craft-agent/shared/credentials';

// From @craft-agent/core (types only)
import type { Session, Message, AgentEvent } from '@craft-agent/core';
```

## Tech Stack

- **Runtime:** Bun (scripts, tests, subprocess execution)
- **Desktop:** Electron (main process runs in Node.js)
- **UI:** React + Vite + shadcn/ui + Tailwind CSS v4
- **State:** Jotai atoms
- **AI:** @anthropic-ai/claude-agent-sdk
- **Build:** esbuild (main/preload) + Vite (renderer)

## Releases

- **Version files to bump:** `package.json` (root) AND `apps/electron/package.json` — both must match
- **No `.claude-plugin/plugin.json`** — this project is an Electron app, not a Claude Code plugin
- **CHANGELOG.md** follows Keep a Changelog format
- **Only bump versions when there are end-user-facing changes.** Internal milestones (test infrastructure, docs-only) should not trigger version bumps or build releases.
- **pr_workflow is enabled** — release work goes on a `release/vX.Y.Z` branch, merged via PR

## Important Conventions

- `git push --no-verify` is strictly forbidden in this repository. Do not bypass local hooks under any circumstances. If the pre-push gate fails, fix the underlying issue and push normally.
- **Before creating a PR**, run `/claude-md-management:revise-claude-md` to capture session learnings into CLAUDE.md. This is mandatory, not optional.
- Environment variables for OAuth are loaded from `.env` at build time via esbuild `--define`
- Debug logging writes to `~/Library/Logs/@craft-agent/electron/` on macOS
- Sessions are persisted as JSONL files in workspace directories
- MCP servers can be stdio-based (local subprocess) or http/sse-based (remote)
- To reset window state (useful when debugging session display issues): `rm ~/.kata/window-state.json`
- **Bundled assets:** Files that must work in both dev and Electron go in `packages/shared/assets/<subfolder>/`, are copied by `apps/electron/scripts/copy-assets.ts`, and resolve at runtime via `getBundledAssetsDir(subfolder)`. Never use `import.meta.dir` for asset paths — it is Bun-only and crashes in Node.js/Electron.
- **System skills:** Bundled at `packages/shared/assets/system-skills/`. Seeded into workspaces on creation via `seedSystemSkills()`. Filter dotfiles (`.DS_Store`) when reading skill directories.
- **SDK plugin qualification:** Skills are invoked as `{pluginName}:skill-slug`. The pluginName comes from `.claude-plugin/plugin.json` `name` field, not the directory name. Pattern: `craft-workspace-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

## Electron UAT Notes

- Use `agent-browser` / Electron automation for targeted debugging, crash reproduction, and screenshots. Do not insist on owning the full live UAT loop when the human can test faster directly.
- Prefer a fresh workspace for acceptance testing of session-tree and transcript-projection features. Reused workspaces can hide stale session state and make current behavior ambiguous.
- Treat user-provided screenshots as high-signal evidence. In this app, screenshots have exposed state mismatches that were not obvious from remote automation alone.
- For multi-agent orchestration, the critical correctness check is not just whether a child row renders. Opening a child chat must show the dispatched sub-agent's real transcript and tool history.
- If a selected child chat renders empty or answers as if it has no prior context, treat that as a transcript hydration / binding bug, not a cosmetic UI issue.
- When using live UAT with the user, let the user handle workspace switching inside the running app when that is faster or more reliable than automation.

## Agent Browser + Electron CDP

The dev script supports `ELECTRON_EXTRA_ARGS` to pass flags to the Electron binary:

```bash
# Launch with Chrome DevTools Protocol on port 9222
ELECTRON_EXTRA_ARGS="--remote-debugging-port=9222" bun run electron:dev
```

Once CDP is active, connect `agent-browser`:

```bash
agent-browser connect 9222
agent-browser tab                    # List targets (windows/webviews)
agent-browser snapshot -i            # Accessibility tree with refs
agent-browser screenshot output.png  # Capture current state
agent-browser eval "expression"      # Run JS in the renderer
```

Key details:

- The app must be quit and relaunched with the `--remote-debugging-port` flag; it cannot be added after launch.
- `agent-browser eval` does not support top-level `await`. Wrap async code in an IIFE: `(async () => { ... })()`
- Avoid smart quotes in eval strings; they cause `SyntaxError: Invalid or unexpected token`.
- The `eval` command is useful for reading computed styles, injecting scripts, and triggering actions in the running app.

## Figma Capture for Electron Apps

The Figma MCP `generate_figma_design` tool captures live pages and converts them to editable Figma designs. For Electron apps, the standard "open in browser" approach fails because the app depends on `window.electronAPI` and other Electron-only APIs. Use the CDP injection method instead.

### Workflow

1. Launch the app with CDP enabled (see above).
2. Connect `agent-browser connect 9222`.
3. Get a capture ID from `generate_figma_design` with `outputMode: "existingFile"` (or `"newFile"`).
4. Inject the Figma capture script via eval:

   ```
   agent-browser eval "(function(){var r=new XMLHttpRequest();r.open('GET','https://mcp.figma.com/mcp/html-to-design/capture.js',false);r.send();var el=document.createElement('script');el.textContent=r.responseText;document.head.appendChild(el);return 'injected'})()"
   ```

5. Trigger the capture:

   ```
   agent-browser eval "(function(){window.figma.captureForDesign({captureId:'<ID>',endpoint:'https://mcp.figma.com/mcp/capture/<ID>/submit',selector:'body'});return 'triggered'})()"
   ```

6. Poll with `generate_figma_design(captureId: '<ID>')` every 5s until `completed`.

### Dark background fix

The app uses Electron's transparent window with OS-level vibrancy. The Figma capture script sees `rgba(0, 0, 0, 0)` on `<html>` and `<body>`, producing a transparent/white background. Fix by setting an explicit background before capture:

```
agent-browser eval "(function(){document.documentElement.style.backgroundColor='#27272c';document.body.style.backgroundColor='#27272c';return 'set'})()"
```

The color `#27272c` corresponds to the dark theme's `--background: oklch(0.2 0.005 270)`.

### Existing Figma file

- **File:** `cloud agents` (fileKey: `CodOOXxIAJ0Tsd3ll6ulz6`)
- Captures are added as new pages/frames. Each capture ID is single-use.

## e2e Testing

`apps/electron/e2e/README.md`

## Project Management with Linear

- **Project:** Kata Cloud Agents
- **Project URL:** <https://linear.app/kata-sh/project/kata-cloud-agents-b0f5a7be6537>
- **Team:** Kata-sh (ID: `a47bcacd-54f3-4472-a4b4-d6933248b605`)
- **Issue prefix:** KAT

### Linear MCP Usage

Use the `save_issue` tool for both creating and updating issues. When creating, `title` and `team` are required.

### PR Naming

Always prefix the PR name with the ticket number for traceability, e.g. `KAT-1234: Implement new agent execution model`. This ensures the PR is linked to the correct issue in Linear and maintains a clear history of changes.

**Common pitfalls:**

- Always use `team: "Kata-sh"` (not "Kata"). Call `list_teams` first if unsure.
- The `labels` parameter on `save_issue` can cause validation errors. Apply labels after creation using a separate `save_issue` update call with the issue `id`.
- Use `state` values like `Backlog`, `Todo`, `In Progress`, `Done`. Call `list_issue_statuses` to confirm available states.
- When fetching issues, always pass `includeRelations: true` to `get_issue` to see blocking dependencies.
- The `project` parameter accepts name, ID, or slug. Use the name `"Kata Desktop"` for this project.
