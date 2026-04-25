# Changelog

## 0.2.8

### Improvements

- **Bundle Kata CLI runtime with pi `0.70.2`** — the packaged desktop runtime now includes the CLI dependency bump to the latest `@mariozechner/pi-coding-agent` / `@mariozechner/pi-tui` release.

### Features

- **Milestone-aware GitHub planning view** — the planning pane now selects the active milestone roadmap, renders milestone context and definition-of-done data, and links roadmap slices directly to their GitHub issues.

### Fixes

- **Scope GitHub workflow board cards to the active milestone** — GitHub project board filtering now uses Kata milestone metadata so historical slices from other milestones no longer leak into the active planning/execution view.
- **Harden planning artifact parsing and test stability** — roadmap parsing now understands milestone definition-of-done content and richer requirement states, with stronger coverage around workflow board, planning artifacts, skill scanning, and IPC-side test startup behavior.

## 0.2.7

### Improvements

- **Bundle updated Kata CLI runtime (`0.15.8`)** — Desktop release bundles the CLI patch that restores compatibility with `@mariozechner/pi-coding-agent@0.68.1` by passing `cwd` to `DefaultResourceLoader`.

## 0.2.6

### Features

- **Agent Activity event pinning** — all timeline events now expose pin/unpin controls, errors auto-pin by default, and pinned entries can be manually unpinned.
- **Agent Activity runtime overview** — added a dashboard summary panel with runtime/session health context before the event timeline.
- **Observability terminology update** — renamed "Pinned Errors" to "Pinned Events" and the verbose timeline mode to "Event Log" for clearer behavior.

## 0.2.5

### Features

- **Chat composer slash-command autocomplete** — added in-composer command suggestions with keyboard-friendly selection and supporting command UI primitives.
- **Slash command + skill discovery substrate** — introduced desktop-side command registry and skill scanning plumbing for richer command discovery.
- **GitHub planning/execution parity surface** — improved workflow board behavior for GitHub-backed Kata planning and execution flows.

### Improvements

- **Cross-suite GitHub acceptance bundle** — added M009 UAT runbook, evidence bundle, and end-to-end coverage for GitHub workflow parity.

## 0.2.4

### Features

- **Session archiving workflow** — Desktop now supports archiving chats from the session list, excluding archived sessions from the default sidebar view, and restoring them from a dedicated Settings panel.
- **Archived Chats settings panel** — Added an "Archived Chats" tab that lists archived sessions with timestamp and project directory metadata plus one-click unarchive actions.
- **Workspace Git context in chat shell** — Chat footer now surfaces workspace Git branch and pull request context via new main/preload IPC plumbing.

### Fixes

- **Session sidebar archive affordance** — Archive actions are now exposed with hover controls on each session row, reducing accidental clutter while keeping archive operations discoverable.
- **Chat pane interaction polish** — Refined composer/list UI behavior and associated desktop shell layout wiring to improve day-to-day chat usability.

## 0.2.3

### Fixes

- **M008 Node runtime launcher landing** — packaged Desktop now ships the Kata runtime through `ELECTRON_RUN_AS_NODE` launchers instead of bundling Bun for the active CLI subprocess path, and the packaged runtime proofs/checks are reflected in the release branch.
- **Packaged bridge diagnostics** — packaged bridge discovery/spawn logs continue to expose `runtimeMode: electron-node`, making the Node-backed runtime path explicit during debugging and UAT.

## 0.2.2

### Fixes

- **Surface real Symphony startup failures** — Desktop now promotes recent Symphony stdout/stderr into the runtime error state and renders those details in the Settings runtime panel, so config and launch failures no longer collapse into a generic `PROCESS_EXITED` banner.
- **Model/runtime state cleanup** — Desktop no longer keeps a stale Desktop-only selected-model preference path around after fast restarts. The renderer follows the live CLI runtime model state, which reduces confusing startup recovery behavior during bridge reconnects.

## 0.2.1

### Fixes

- **OAuth provider detection (KAT-2498)** — Desktop now reads OAuth records from `~/.kata-cli/agent/auth.json` (where `kata login` writes them) instead of only probing the GitHub Copilot CLI's `~/.config/github-copilot/` token store. `refresh`-backed sessions are treated as valid regardless of access-token expiry, so Anthropic Claude Pro/Max, OpenAI Codex subscription, and GitHub Copilot no longer report as "Not connected" or "Expired" when `kata` still considers them authenticated.
- **Settings OAuth rendering** — Provider row and detail-pane rendering is driven by the runtime `info.authType` field, so OAuth-authenticated Anthropic and OpenAI rows show the OAuth detail card instead of the API-key form + "Valid" badge.
- **Return to workflow board button** — Removed the dedicated button from the Settings header; `Close` is enough, and `⌘⇧B` / `Ctrl+Shift+B` remains available for power users.

### Features

- **Onboarding polish** — Welcome heading now reads "Agentic Development Environment". Provider picker (step 2) shows OAuth-authenticated providers as "Authenticated" instead of "Configured", and GitHub Copilot now appears in the provider list. Onboarding key-entry step receives the provider's runtime auth type so dual-mode providers render correctly.
- **Default model** — App-wide default is now `openai-codex/gpt-5.3-codex`, wired through a shared `DEFAULT_MODEL` constant. Main process falls back to it when settings has no persisted model, the onboarding completion step shows it when available, and the renderer atom seeds with it.
- **Pop-up window sizing** — External links (PR badges on the workflow board, etc.) open in-app windows sized to 1200×1000 instead of Electron's default 800×600. New windows are sandboxed with no IPC access to the main process.
- **Session sidebar width** — Default sidebar width is now 17rem (272px) for a balanced layout against the chat pane and workflow board.
- **MCP tool-exposure control** — Server editor dialog exposes the pi-mcp-adapter `directTools` field with three modes: proxy (default), promote every tool, or allowlist. Allowlist mode surfaces a textarea for tool names and requires at least one entry before save.
- **mcp-remote bridge annotation** — stdio servers that wrap `mcp-remote URL` now show a "bridges URL" badge so the STDIO label isn't misleading for OAuth-protected HTTP servers like Linear.
- **Direct-tools row badge** — Servers with `directTools: true` or an allowlist show a compact badge summarizing the exposure mode.
- **Transport lock helper text** — The Settings MCP editor explains why Transport is disabled during edit ("Transport is fixed after creation. Remove and re-add the server to switch.").
- **Editor dialog copy** — Dialog description replaced with "Define how this MCP server connects and exposes tools." Tool-exposure control is plumbed through shared types so unknown `directTools` values survive round-trips through the editor.

## 0.2.0

### Features

- **Windows support** — NSIS installer for x64 (Kata-Desktop-x64-Setup.exe)
- **Linux support** — AppImage and .deb packages for x64 and arm64
- **Cross-platform CI** — Release workflow now builds for macOS, Windows, and Linux in parallel
- **Cross-platform binary discovery** — Desktop app correctly resolves bundled kata and Symphony binaries on all platforms (.exe/.cmd on Windows, shell scripts on macOS/Linux)

### Fixes

- **False Symphony reliability banner** — Suppressed the yellow "Symphony operator is reconnecting" warning that flashed during normal Symphony startup transitions

## 0.1.1

### Features

- **Roomier default shell** — Wider default window (1600×980), balanced 52/48 pane split, wider session sidebar (20rem)
- **Settings in sidebar** — Settings button moved to the session sidebar footer for a cleaner header
- **Compact kanban header** — Replaced 3 expand/collapse buttons with a single View dropdown menu; removed redundant MCP button
- **shadcn defaults enforced** — Hard rule in AGENTS.md requiring shadcn default components for all UI work

### Fixes

- **GitHub Copilot Claude models** — Fixed native web-search injection incorrectly treating `github-copilot/claude-*` as Anthropic, causing 400 errors on Copilot's Anthropic-compatible endpoint
- **Bridge model retry** — Fast-crash recovery no longer clears `selectedModel`; uses `skipModelOnNextStart` flag to preserve downstream state
- **Bridge retry reset** — `modelRetried` flag now resets on explicit `setModel()` so subsequent bad models can still recover
- **Symphony inactive state** — Stopped/idle Symphony no longer surfaces false reliability or stability failures
- **Operator signal suppression** — Uses operator snapshot connection state as source of truth instead of supervisor phase; external Symphony mode now correctly surfaces operator failures
- **Reliability contract ordering** — Inactive guard moved before `lastResult` check to prevent stale error signals on shutdown
- **Active scope notice** — `operator_state_unavailable` now surfaces an explicit message instead of showing an empty board
- **Dropdown menu semantics** — Kanban View menu items use `onSelect` instead of `onClick` for proper Radix keyboard/pointer handling
- **Dead code removal** — Removed unreachable duplicate phase check in symphony-operator-service
- **Heap thresholds** — Raised to 512/1024 MB with documented rationale to match observed Electron dev baselines
- **Native search handler** — Consistent return behavior across all exit paths

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
- **MCP server management** — Settings panel for viewing, adding, editing, and deleting MCP server configurations
- **Symphony controls** — Single-click Start/Stop/Restart toggle with live status dot
- **Kanban improvements** — Expand/collapse chevrons on slice cards, clickable Linear ticket identifiers, auto-collapsed empty columns, scrollable card content
- **Workflow board mutations** — Read-write kanban: move entities between columns, create tasks, update task details
- **Session isolation** — Sidebar only shows sessions owned by this Desktop instance
