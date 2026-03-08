# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Project Overview

Kata Agents is a desktop application for working with AI agents, built on the Claude Agent SDK. It provides multi-session management, MCP server integration, REST API connections, and a document-centric workflow in a polished Electron-based UI.

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

All configuration is stored at `~/.kata-agents/`:

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
- Environment variables for OAuth are loaded from `.env` at build time via esbuild `--define`
- Debug logging writes to `~/Library/Logs/@craft-agent/electron/` on macOS
- Sessions are persisted as JSONL files in workspace directories
- MCP servers can be stdio-based (local subprocess) or SSE-based (remote)
- To reset window state (useful when debugging session display issues): `rm ~/.kata-agents/window-state.json`

## Electron UAT Notes

- Use `agent-browser` / Electron automation for targeted debugging, crash reproduction, and screenshots. Do not insist on owning the full live UAT loop when the human can test faster directly.
- Prefer a fresh workspace for acceptance testing of session-tree and transcript-projection features. Reused workspaces can hide stale session state and make current behavior ambiguous.
- Treat user-provided screenshots as high-signal evidence. In this app, screenshots have exposed state mismatches that were not obvious from remote automation alone.
- For multi-agent orchestration, the critical correctness check is not just whether a child row renders. Opening a child chat must show the dispatched sub-agent's real transcript and tool history.
- If a selected child chat renders empty or answers as if it has no prior context, treat that as a transcript hydration / binding bug, not a cosmetic UI issue.
- When using live UAT with the user, let the user handle workspace switching inside the running app when that is faster or more reliable than automation.

## e2e Testing

`apps/electron/e2e/README.md`

## Merging PRs

### Step 1: Review CI Checks

```bash
# Run all tests
bun test

# Build the app
bun run electron:build

# Test local production build (run from apps/electron directory)
cd apps/electron && bun run dist:mac

# Check for uncommitted changes
git status
```

Ask the user if they want to run e2e tests (optional but recommended):

```bash
# From monorepo root (recommended)
bun run test:e2e           # Mock tests
bun run test:e2e:live      # Live tests with real credentials
```

**Stop if tests fail.** Fix issues before proceeding.

### Step 2: Merge the PR

```bash
gh pr merge --merge --delete-branch
git checkout main && git pull
```
