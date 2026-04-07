# Changelog

## 1.1.0

### Features

- **MCP server management** — New settings panel for viewing, adding, editing, and deleting MCP server configurations without touching JSON files
- **Symphony controls** — Single-click Start/Stop/Restart toggle with live status dot replaces the old popover menu
- **Kanban improvements** — Expand/collapse chevrons on slice cards, clickable Linear ticket identifiers, auto-collapsed empty columns, scrollable card content, board auto-refresh when Symphony becomes ready
- **Workflow board mutations** — Read-write kanban: move entities between columns, create tasks, update task details directly from the board
- **Workflow ↔ MCP shortcuts** — Keyboard shortcuts (⌘⇧M / ⌘⇧B / ⌘⇧R) for MCP settings, return-to-kanban, and board refresh with failure recovery

### Fixes

- **Session history replay race** — Stale session history no longer replays into the chat after clicking New Session or switching sessions; request-token invalidation ensures only the latest hydration applies
- **Session sidebar isolation** — Sidebar only shows sessions owned by this Desktop instance; subagent and external CLI sessions no longer pollute the list
- **Session creation reliability** — New session ID is set before clearing chat state, preventing re-render from rehydrating old content; placeholder entry appears in sidebar immediately
- **MCP server safety** — Desktop no longer spawns MCP server processes from the Electron main process (prevents renderer crashes from servers like chrome-devtools-mcp)
- **IPC frame disposal** — All `webContents.send` calls wrapped in try-catch to prevent crashes when the renderer frame is disposed during MCP server lifecycle events
- **Kanban styling** — Semantic link colors, proper card rendering in Project scope, improved Active scope fallback messaging, better contrast for action links
- **StrictMode double-init** — Session initialization guarded against React 19 Strict Mode double-invocation

## 1.0.0

See [GitHub Release](https://github.com/gannonh/kata/releases/tag/desktop-v1.0.0) for initial release notes.

## 0.1.1

### Fixes

- **Session isolation** — Desktop sidebar now only shows sessions owned by this instance. Subagent child processes and external CLI sessions sharing the same workspace no longer pollute the session list or cause silent session switching.

## 0.1.0

Initial release of Kata Desktop — the native GUI for the Kata coding agent platform.

### Features

- **Chat** — Streaming chat with tool rendering, thinking blocks, permission modes (Explore/Ask/Auto), multi-provider support (Anthropic, OpenAI)
- **Sessions** — Multi-session sidebar with persistence, workspace picker, model selector, thinking level control
- **Onboarding** — 4-step first-launch wizard (welcome → provider → API key → model)
- **Planning View** — Right-pane live rendering of planning artifacts (ROADMAP, REQUIREMENTS, DECISIONS)
- **Workflow Kanban** — Right-pane kanban board for Linear workflow state with task expansion
- **Symphony Integration** — Start/stop/restart Symphony from the GUI, live worker dashboard, escalation handling, Symphony-aware kanban cards with worker assignment and live tool indicators
- **Settings** — Provider management, Symphony configuration, appearance settings
