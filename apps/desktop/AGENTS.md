# AGENTS.md — Kata Desktop

This is a **fresh Electron application** being built from scratch. It is NOT the legacy `apps/electron/` (Craft Agents) app. Do not reference, import from, or depend on `@craft-agent/*` packages.

## What This Is

Kata Desktop is the native GUI for the Kata coding agent platform. It combines:

- **Chat pane (left):** A pi-coding-agent session — identical to Kata CLI but in a graphical interface
- **Contextual right pane:** Planning artifact viewer during `/kata plan`, kanban board during execution
- **Symphony operator surface:** Start/stop Symphony, monitor workers, handle escalations — all from the GUI

Desktop wraps the Kata CLI as a subprocess in JSON-RPC mode (`kata --mode rpc`). This means Desktop inherits all CLI capabilities: multi-provider support, extensions, skills, MCP, Linear/GitHub integration, and the Kata planning methodology.

## Hard Rules

- **Never use `git push --no-verify` or `git commit --no-verify`.** If the gate fails, fix the problem.
- **Never import from `@craft-agent/*` packages.** This is a clean break. Use `packages/ui/` for shared React components. Use pi-coding-agent via the CLI subprocess, not as an embedded library.
- **No "Craft Agents" naming anywhere.** The product name is "Kata Desktop". The package scope should use `@kata/desktop` or similar.
- **Electron main process runs Node.js, not Bun.** Don't use `import.meta.dir` or Bun-only APIs in main process code. The CLI subprocess runs Bun, but the Electron process itself is Node.js.

## Architecture

```
apps/desktop/
├── src/
│   ├── main/                # Electron main process (Node.js)
│   │   ├── index.ts         # App entry, window lifecycle
│   │   ├── ipc.ts           # IPC handlers for renderer communication
│   │   ├── pi-agent-bridge.ts   # Spawns `kata --mode rpc`, manages subprocess lifecycle
│   │   └── rpc-event-adapter.ts # Maps pi-coding-agent RPC events → renderer types
│   ├── preload/             # Context bridge (exposes IPC to renderer)
│   └── renderer/            # React UI (Vite)
│       ├── atoms/           # Jotai state atoms
│       ├── components/      # React components
│       │   ├── chat/        # Chat UI, message rendering, tool cards
│       │   ├── app-shell/   # Layout, panels, navigation
│       │   ├── onboarding/  # First-launch wizard
│       │   ├── settings/    # Auth, model, preferences panels
│       │   ├── planning/    # Right-pane planning artifact viewer (M002)
│       │   ├── kanban/      # Right-pane kanban board (M003)
│       │   └── symphony/    # Worker dashboard, escalation panel (M004)
│       ├── hooks/           # Custom React hooks
│       └── lib/             # Utilities
├── e2e/                     # Playwright e2e tests
├── package.json
├── tsconfig.json
└── AGENTS.md                # This file
```

## Key Integration Points

### CLI Subprocess (pi-coding-agent)

The core integration. Desktop spawns `kata --mode rpc` as a child process:

- **Spawn:** `child_process.spawn()` with stdin/stdout for JSON-RPC
- **Messages:** Send user messages, receive streaming events (text deltas, tool starts, tool results, errors, turn boundaries)
- **Lifecycle:** Graceful shutdown on session close and app quit, crash detection with error surfaced to renderer
- **Auth:** Reads `~/.kata-cli/agent/auth.json` — shared with CLI
- **Model selection:** Passed via `--model` flag on spawn

Reference: `apps/cli/src/cli.ts` (RPC mode entry), `apps/electron/src/main/daemon-manager.ts` (subprocess lifecycle pattern)

### Symphony API

Desktop connects directly to Symphony's HTTP/WS API:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/state` | Full orchestrator snapshot (workers, queue, completions) |
| `GET /api/v1/events` | WebSocket live event stream |
| `GET /api/v1/escalations` | Pending escalation list |
| `POST /api/v1/escalations/{id}/respond` | Resolve an escalation |
| `POST /api/v1/steer` | Send steering instruction to a worker |
| `POST /api/v1/refresh` | Trigger immediate poll |

Reference: `apps/cli/src/resources/extensions/symphony/client.ts` (SymphonyHttpClient — directly reusable)

### Linear / GitHub (Workflow State)

Desktop reads workflow state from Linear or GitHub to render the kanban board:

- **Linear:** GraphQL API for milestones, issues (slices), sub-issues (tasks), workflow states
- **GitHub:** REST/GraphQL API for issues, Projects v2 status, labels

Reference: `apps/cli/src/resources/extensions/linear/` (Linear client), `apps/symphony/src/github/` (GitHub adapter)

## Tech Stack

- **Runtime:** Electron (Node.js main process, Chromium renderer)
- **UI:** React 19 + Vite + Tailwind CSS v4 + Radix UI + Jotai
- **Shared components:** `packages/ui/` (chat, markdown, code-viewer, terminal)
- **Diagrams:** `packages/mermaid/` (Mermaid → SVG)
- **Build:** esbuild (main/preload) + Vite (renderer) + electron-builder (distribution)
- **Tests:** Bun test (unit), Playwright (e2e)

## Reusable Assets from Legacy Desktop

Borrow patterns and components selectively. **Import from shared packages**, not from `apps/electron/`:

| Asset | Location | What to borrow |
|-------|----------|---------------|
| Chat components | `packages/ui/src/components/chat/` | SessionViewer, TurnCard patterns |
| Markdown renderer | `packages/ui/src/components/markdown/` | Shiki-based rendering |
| Code viewer | `packages/ui/src/components/code-viewer/` | Syntax highlighting |
| Terminal output | `packages/ui/src/components/terminal/` | ANSI color rendering |
| Mermaid diagrams | `packages/mermaid/` | Diagram → SVG |
| Symphony client | `apps/cli/src/resources/extensions/symphony/client.ts` | HTTP/WS client (copy, not import) |
| Subprocess lifecycle | `apps/electron/src/main/daemon-manager.ts` | Pattern reference for spawn/crash/restart |

## Project Management

- **Linear Project:** Kata Desktop
- **Project ID:** `ffaf4986-8e29-4178-85b1-91a58a0c34b2`
- **Team:** Kata-sh (ID: `a47bcacd-54f3-4472-a4b4-d6933248b605`)
- **Issue prefix:** KAT
- **Workflow mode:** Linear-backed Kata workflow (milestones → slices → tasks)

## Milestone Sequence

| Milestone | Title | Intent |
|-----------|-------|--------|
| M001 | Chat Foundation | Fresh Electron app, pi-coding-agent runtime, streaming chat, tool rendering, auth, sessions, onboarding |
| M002 | Planning View | Right-pane live rendering of planning artifacts (ROADMAP, REQUIREMENTS, DECISIONS) |
| M003 | Workflow Kanban | Right-pane kanban view of Linear/GitHub execution state |
| M004 | Symphony Integration | Start/stop Symphony from GUI, worker dashboard, escalation handling |
| M005 | Interactive Workflow | Read-write kanban, MCP management UI, UX polish |
| M006 | Integrated Beta | End-to-end hardening, reliability, packaged .dmg perfection |

## Key Decisions

| # | Decision | Choice |
|---|----------|--------|
| D001 | Agent runtime | pi-coding-agent via CLI subprocess in RPC mode |
| D002 | Build strategy | Fresh app at `apps/desktop/`, borrow selectively from legacy |
| D003 | Auth storage | Shared `~/.kata-cli/agent/auth.json` with CLI |
| D004 | CLI packaging | Bundle `kata` binary inside .dmg |
| D005 | Session migration | Clean break — no legacy session migration |
| D006 | Product naming | "Kata Desktop" — all Craft naming removed |
| D007 | Right pane | Split-pane layout with contextual right pane (planning view, kanban) |

See the `DECISIONS` document in Linear for full rationale and revisability notes.
