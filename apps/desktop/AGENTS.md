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

## Automating and Testing the Electron App

Kata Desktop is an Electron app. The renderer runs inside Electron's Chromium shell with a preload bridge (`window.api`) — it **cannot** be tested by opening `http://127.0.0.1:5174` in a standalone browser or Playwright instance. The preload bridge won't exist and every component that touches IPC will crash.

Use **agent-browser** connected to the Electron process via Chrome DevTools Protocol (CDP). This is the only supported way to snapshot, interact with, and screenshot the running app from an agent session.

### Prerequisites

- `agent-browser` installed globally (`npm i -g agent-browser`)
- The Electron app launched with `--remote-debugging-port=<port>`

### Launching for Automation

The standard `desktop:dev` script does NOT enable CDP. Launch the pieces separately:

```bash
# 1. Build main + preload, then start the Vite renderer dev server
cd apps/desktop
bun run build:main && bun run build:preload
bun run dev:renderer  # Starts Vite on http://127.0.0.1:5174

# 2. In a separate terminal (or via bg_shell), launch Electron with CDP enabled
VITE_DEV_SERVER_URL=http://127.0.0.1:5174 npx electron . --remote-debugging-port=9333
```

Use port **9333** (not 9222, which Chrome often occupies). Confirm the port is free first: `lsof -i :9333`.

For agent sessions, use `bg_shell` to manage both processes:

```bash
# Start renderer
bg_shell start "cd apps/desktop && bun run build:main && bun run build:preload && bun run dev:renderer" \
  --label desktop-renderer --type server --ready-port 5174

# Start Electron with CDP
bg_shell start "cd apps/desktop && VITE_DEV_SERVER_URL=http://127.0.0.1:5174 npx electron . --remote-debugging-port=9333" \
  --label desktop-electron --type server --ready-port 9333
```

### Connecting agent-browser

Electron exposes multiple CDP targets (the main app window and DevTools). You must select the correct one.

```bash
# List available targets
agent-browser --cdp 9333 tab
# Output:
#   → [0] DevTools - devtools://devtools/bundled/...
#     [1] Kata Desktop - http://127.0.0.1:5174/

# Switch to the app window (index 1)
agent-browser --cdp 9333 tab 1

# Now all commands target the Kata Desktop renderer
```

After switching tabs once, subsequent `--cdp 9333` commands stay on that target.

### Core Workflow: Snapshot → Interact → Re-snapshot

```bash
# 1. Snapshot interactive elements (returns refs like @e1, @e2, ...)
agent-browser --cdp 9333 snapshot -i

# 2. Interact using refs
agent-browser --cdp 9333 click @e15        # e.g. "Get started" button
agent-browser --cdp 9333 fill @e3 "sk-..."  # Fill an input
agent-browser --cdp 9333 press Enter

# 3. Re-snapshot after navigation or DOM changes (refs are invalidated)
agent-browser --cdp 9333 snapshot -i

# 4. Screenshot for visual verification
agent-browser --cdp 9333 screenshot /tmp/kata-desktop.png
```

**Important:** Refs (`@e1`, `@e2`) are invalidated whenever the DOM changes (navigation, modal open/close, state transitions). Always re-snapshot after any action that changes the page.

### Common UAT Patterns

**Walk through onboarding:**
```bash
agent-browser --cdp 9333 snapshot -i          # See step 1
agent-browser --cdp 9333 click @e15           # "Get started"
agent-browser --cdp 9333 snapshot -i          # See step 2 (provider selection)
agent-browser --cdp 9333 screenshot /tmp/onboarding-step2.png
```

**Check for errors:**
```bash
# Evaluate JS in the Electron renderer context
agent-browser --cdp 9333 eval 'document.querySelectorAll("[role=alert]").length'

# Get console errors
agent-browser --cdp 9333 eval 'window.__console_errors || "no error capture"'
```

**Test chat interaction:**
```bash
agent-browser --cdp 9333 snapshot -i
agent-browser --cdp 9333 fill @e12 "Hello, what can you do?"
agent-browser --cdp 9333 click @e14           # Send button
agent-browser --cdp 9333 wait 3000            # Wait for streaming response
agent-browser --cdp 9333 snapshot -i          # See response
agent-browser --cdp 9333 screenshot /tmp/chat-response.png
```

**Full-page screenshot:**
```bash
agent-browser --cdp 9333 screenshot --full /tmp/full-page.png
```

**Annotated screenshot (numbered element labels):**
```bash
agent-browser --cdp 9333 screenshot --annotate /tmp/annotated.png
```

### What NOT to Do

| ❌ Don't | ✅ Do instead |
|----------|--------------|
| Open `http://127.0.0.1:5174` in Playwright or a browser | Use `agent-browser --cdp 9333` to connect to Electron |
| Use `browser_navigate`, `browser_click`, etc. (Playwright tools) | Use `agent-browser` via `bash` commands |
| Use `mac_screenshot` (requires Screen Recording permission) | Use `agent-browser --cdp 9333 screenshot` |
| Assume refs persist after clicking/navigating | Always `snapshot -i` again after any DOM change |
| Launch with `desktop:dev` for automation | Launch renderer + Electron separately with `--remote-debugging-port` |

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `bind() failed: Address already in use` | Port already taken. Check `lsof -i :9333` and pick a different port |
| Snapshot shows DevTools elements, not app UI | Run `agent-browser --cdp 9333 tab 1` to switch to the app target |
| `Connection refused` | Electron not running with `--remote-debugging-port`, or wrong port |
| Blank/empty snapshot | Electron may still be loading. `agent-browser --cdp 9333 wait 2000` then retry |
| Cannot type in inputs | Try `agent-browser --cdp 9333 keyboard type "text"` instead of `fill` |
