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
│   ├── main/                    # Electron main process (Node.js)
│   │   ├── index.ts             # App entry, window lifecycle
│   │   ├── ipc.ts               # IPC handlers for renderer communication
│   │   ├── pi-agent-bridge.ts   # Spawns `kata --mode rpc`, manages subprocess lifecycle
│   │   ├── rpc-event-adapter.ts # Stateful adapter: RPC events → ChatEvent types (see below)
│   │   ├── auth-bridge.ts       # Reads/writes ~/.kata-cli/agent/auth.json, provider validation
│   │   ├── session-manager.ts   # Lists/reads session JSONL files for the sidebar
│   │   └── logger.ts            # electron-log wrapper
│   ├── preload/                 # Context bridge (exposes IPC to renderer)
│   └── renderer/                # React UI (Vite)
│       ├── atoms/               # Jotai state atoms (chat, model, session, onboarding, permissions)
│       ├── components/
│       │   ├── chat/            # Chat UI, message rendering, tool cards, thinking blocks
│       │   ├── app-shell/       # Layout, panels, navigation, model selector
│       │   ├── onboarding/      # First-launch wizard
│       │   ├── settings/        # Auth, model, preferences panels
│       │   ├── planning/        # Right-pane planning artifact viewer (M002)
│       │   ├── kanban/          # Right-pane kanban board (M003)
│       │   └── symphony/        # Worker dashboard, escalation panel (M004)
│       ├── hooks/               # Custom React hooks
│       └── lib/                 # Utilities
├── e2e/                         # Playwright e2e tests
├── package.json
├── tsconfig.json
└── AGENTS.md                    # This file
```

## Key Integration Points

### CLI Subprocess (pi-coding-agent)

The core integration. Desktop spawns `kata --mode rpc` as a child process:

- **Spawn:** `child_process.spawn()` with stdin/stdout for JSON-RPC
- **Messages:** Send user messages, receive streaming events (text deltas, tool starts, tool results, errors, turn boundaries)
- **Lifecycle:** Graceful shutdown on session close and app quit, crash detection with error surfaced to renderer
- **Auth:** Reads `~/.kata-cli/agent/auth.json` — shared with CLI
- **Model selection:** Passed via `--model` flag on spawn, `set_model` RPC command at runtime
- **Thinking level:** `set_thinking_level` RPC command — levels are `off | minimal | low | medium | high | xhigh` (model-dependent)

Reference: `apps/cli/src/cli.ts` (RPC mode entry)

### RPC Event Adapter (`rpc-event-adapter.ts`)

The adapter is a **stateful class** — not a pure function. It tracks state across events within a session:

- **`currentAssistantMessageId`** — counter-based ID assigned at `message_start`. All subsequent `text_delta`, `thinking_delta`, and `message_end` events resolve to this ID. The adapter ignores `responseId` from the CLI's event payloads.
- **`currentAssistantMessageHadContent`** — tracks whether the current assistant message has received any text or thinking content. When a new `message_start(assistant)` arrives and `hadContent` is false, the adapter reuses the existing ID (handles multi-start turns where thinking+tool and text response are separate messages). Reset to `true` on `message_end`.
- **`toolArgsCache`** — `Map<toolCallId, ToolArgs>`. Populated at `tool_execution_start`, consumed at `tool_execution_end` when `event.args` is absent (which is the real CLI behavior — the end event doesn't carry args).

**Event filtering:**
- `message_end` only emits for `role === 'assistant'`. User and toolResult message_end events are silently dropped.
- `message_update` with `toolcall_start/delta/end` and `text_start/text_end` subtypes emit nothing — tool calls flow through `tool_execution_*` events, and text content flows through `text_delta`.
- `thinking_start/delta/end` are emitted as new ChatEvent types.

**Key gotcha:** The CLI sends multiple `message_start(assistant)` events per turn when thinking+tools are involved. The adapter coalesces these via the `hadContent` flag to prevent ghost empty message entries in the chat.

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
- **Tests:** Vitest + v8 coverage (unit), Playwright + `_electron` (e2e), agent-browser + CDP (UAT)

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

## Gotchas

- **Auth provider aliases:** The CLI stores OpenAI keys under `openai-codex` in `auth.json`, not `openai`. The `AuthBridge.resolveAuthRecord()` method checks alias keys (`AUTH_PROVIDER_ALIASES` map) so the settings panel shows the correct status. If a new provider alias appears, add it to the map in `auth-bridge.ts`.
- **Tool cards are associated to messages via `parentMessageId`:** `tool_start` events carry `parentMessageId` (set to `currentAssistantMessageId` at emission time). The chat atom stores this on `ToolCallView`, and `MessageList` groups tools by their parent to render them inline after the triggering assistant message. Without this, tool cards would appear disconnected from their context.
- **Thinking content varies by provider:** Anthropic models stream full thinking text via `thinking_delta` events. OpenAI codex models emit `thinking_start/end` but may not stream summary text (depends on the API's `summary: "auto"` setting). The `ThinkingBlock` component handles both: shows "Thinking…" (minimal label) while streaming with no content, "Reasoned" when done with no content, and the full collapsible with word count when content exists.
- **Thinking levels are model-specific:** Standard reasoning models get `off | minimal | low | medium | high`. Models that support xhigh (opus-4-6, gpt-5.2+) additionally get `xhigh`. The `supportsXhigh` flag is computed in the bridge from model ID patterns (mirrors `pi-ai`'s `supportsXhigh()` function). The `ThinkingLevelToggle` component only renders when the selected model has `reasoning: true`.
- **Chat layout:** User messages render as right-aligned bubbles. Assistant messages render flat against the background (no container). Tool cards and thinking blocks render inline within their parent assistant message article. No role labels — visual layout distinguishes the roles.

## Testing

Three test layers, each with a distinct purpose:

| Layer | Tool | Scope | Command |
|-------|------|-------|---------|
| Unit | Vitest + v8 coverage | Main process logic (bridge, adapter, auth, sessions, logger) | `bun run test` |
| E2E | Playwright + `_electron` API | Full Electron app launch, UI structure, onboarding flow | `bun run test:e2e` |
| UAT | agent-browser + CDP | Interactive acceptance testing with screenshots and reports | Manual / skill-driven |

### Unit Tests (Vitest)

**Config:** `vitest.config.ts` with `@vitest/coverage-v8`.

**Thresholds:** 90% lines / 80% branches / 90% functions. These are enforced in CI and pre-push.

**Coverage scope:** All `src/**/*.ts` files are included by default. Exclusions with rationale:

| Excluded | Why |
|----------|-----|
| `src/main/index.ts` | Electron entrypoint — requires `app.whenReady()`, `BrowserWindow` |
| `src/main/ipc.ts` | Coupled to `ipcMain.handle()` — can't import outside Electron |
| `src/renderer/**` | React UI layer — covered by e2e and future component tests |
| `src/preload/**` | Runs in Electron's sandboxed preload context |
| `src/shared/**` | Type definitions only — no runtime logic |

Every new `src/main/*.ts` file is automatically in coverage scope. Do not add files to an include list — if a file needs to be excluded, add it to the exclude list with a comment explaining why.

**Running:**
```bash
bun run test                    # Run with coverage (used by CI)
bun run test:watch              # Watch mode for development
```

**Writing tests:**
- Import from `vitest`, not `bun:test`
- Test files go in `src/main/__tests__/<module>.test.ts`
- Test private methods via `(instance as any).methodName()` when the public API doesn't cover the path
- Tests that modify `process.env.KATA_BIN_PATH` must save and restore it

### E2E Tests (Playwright Electron)

**Config:** `playwright.config.ts` — launches the real Electron app via `_electron.launch()`.

**Headless:** When `KATA_TEST_MODE=1`, the app sets `show: false` on BrowserWindow and skips DevTools. Tests never pop up windows.

**Fixtures** (`e2e/fixtures/electron.fixture.ts`):

| Fixture | What it provides |
|---------|------------------|
| `electronApp` | Launched Electron process with isolated `--user-data-dir`. Cleaned up after test. |
| `mainWindow` | First window, waited for React mount. Onboarding overlay may be visible. |
| `readyWindow` | Same as `mainWindow` but auto-dismisses onboarding. Use for tests that click behind the overlay. |

**Teardown:** `app.close()` is raced with a 3s timeout + `SIGKILL`. Without this, the kata CLI subprocess shutdown hangs for 30s.

**Test suites:**

| Suite | Tests | What it covers |
|-------|-------|----------------|
| `app-launch.e2e.ts` | 7 | Process exists, window title, #root, console errors, viewport, context isolation, test mode |
| `app-shell.e2e.ts` | 7 | Branding, sidebar, chat input, permission modes, right pane, settings panel + tabs |
| `onboarding.e2e.ts` | 5 | Welcome step, step navigation, provider cards, full walkthrough, persistence |

**Running:**
```bash
bun run build                   # Must build first — e2e loads dist/main.cjs
bun run test:e2e                # Headless
bun run test:e2e:headed         # Visible windows for debugging
```

**Adding tests:**
- Test files go in `e2e/tests/<feature>.e2e.ts`
- Import `{ test, expect }` from `../fixtures/electron.fixture`
- Use `mainWindow` for tests that work with the onboarding overlay present
- Use `readyWindow` for tests that need to interact with the chat shell behind the overlay
- Re-build main + preload + renderer before running if source changed

### UAT (agent-browser + CDP)

For interactive acceptance testing and milestone sign-off. See the `kata-desktop-uat` skill (`.agents/skills/kata-desktop-uat/SKILL.md`) for the full workflow. Key points:

The renderer depends on `window.api` — the Electron preload bridge. It **cannot** be tested by opening `http://127.0.0.1:5174` in a standalone browser. You must connect to the actual Electron process via CDP.

**Launch for automation** (the `desktop:dev` script does NOT enable CDP):
```bash
# Terminal 1: renderer
cd apps/desktop && bun run build:main && bun run build:preload && bun run dev:renderer

# Terminal 2: Electron with CDP on port 9333
VITE_DEV_SERVER_URL=http://127.0.0.1:5174 npx electron . --remote-debugging-port=9333
```

**Connect and interact:**
```bash
agent-browser --cdp 9333 tab 1          # Switch to app window (index 0 is DevTools)
agent-browser --cdp 9333 snapshot -i    # Discover elements
agent-browser --cdp 9333 click @e15     # Interact
agent-browser --cdp 9333 screenshot /tmp/evidence.png
```

**UAT reports** go in `docs/uat/<milestone>/` with numbered screenshots and a markdown report.

| ❌ Don't | ✅ Do instead |
|----------|--------------|
| Open `http://127.0.0.1:5174` in Playwright or a browser | Use `agent-browser --cdp 9333` to connect to Electron |
| Use `browser_navigate`, `browser_click`, etc. (pi browser tools) | Use `agent-browser` via `bash` commands |
| Use `mac_screenshot` (requires Screen Recording permission) | Use `agent-browser --cdp 9333 screenshot` |
| Assume refs persist after clicking/navigating | Always `snapshot -i` again after any DOM change |
| Launch with `desktop:dev` for automation | Launch renderer + Electron separately with `--remote-debugging-port` |

### CI Integration

The `validate` CI job runs `turbo run lint typecheck test --affected`, which executes the Vitest suite with coverage thresholds for `@kata/desktop`. Coverage failures block merge.

E2E tests are not yet in CI (they require Electron + display or xvfb). The legacy `apps/electron` e2e-mocked CI job has been removed — `apps/desktop` supersedes it.

The pre-push git hook runs the same `turbo run lint typecheck test --affected` pipeline locally.
