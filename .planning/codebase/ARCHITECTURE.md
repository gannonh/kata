# Architecture

**Analysis Date:** 2026-01-29

## Pattern Overview

**Overall:** Multi-process Electron desktop application with a monorepo structure (apps + packages)

**Key Characteristics:**
- **Process separation:** Main process (Node.js), Renderer process (React UI), Preload process (IPC bridge)
- **Monorepo pattern:** Workspaces for `apps/` (Electron) and `packages/` (shared libraries)
- **IPC-based architecture:** All renderer-main communication via Electron IPC channels
- **State management:** Jotai atoms (renderer), session persistence (main + disk)
- **Agent-driven:** Anthropic Claude Agent SDK integration for code execution

## Layers

**Main Process Layer:**
- Purpose: Electron application lifecycle, window management, session orchestration, IPC handlers
- Location: `apps/electron/src/main/`
- Contains: Entry point, window manager, session manager, IPC channel handlers, file operations
- Depends on: `@craft-agent/shared`, `@craft-agent/core`, Electron APIs
- Used by: Preload process (IPC), Renderer via IPC channels

**Preload Process Layer:**
- Purpose: Secure IPC bridge between renderer and main process
- Location: `apps/electron/src/preload/index.ts`
- Contains: `ElectronAPI` interface exposing safe IPC methods to renderer
- Depends on: Electron IPC, Sentry preload integration
- Used by: Renderer process (injected as `window.electronAPI`)

**Renderer Process Layer:**
- Purpose: React UI for chat, workspace management, settings
- Location: `apps/electron/src/renderer/`
- Contains: React components, hooks, state atoms, contexts
- Depends on: Preload API (`window.electronAPI`), `@craft-agent/shared`, `@craft-agent/ui`
- Used by: Main process (window content)

**Shared Libraries:**
- Purpose: Code reused across main and renderer processes
- Location: `packages/shared/src/`
- Contains: Config management, auth, agent integration, session persistence, sources/MCP handling
- Key modules:
  - `config/` - Configuration loading, watching, persistence
  - `auth/` - OAuth flows, token management
  - `agent/` - CraftAgent SDK integration, permissions, thinking levels
  - `sessions/` - Session persistence, messages, metadata
  - `mcp/` - Model Context Protocol client
  - `sources/` - MCP server discovery, credential management
  - `credentials/` - Credential storage and retrieval
  - `prompts/` - System prompts, agent configuration

**UI Package:**
- Purpose: Reusable React components and design system
- Location: `packages/ui/src/`
- Contains: Radix UI components, theme system, code highlighting (Shiki)
- Used by: Electron renderer

**Core Package:**
- Purpose: Type definitions and utilities
- Location: `packages/core/src/`
- Contains: TypeScript types only (workspace, session, message types), debug utilities
- Used by: Both `@craft-agent/shared` and app-level code

## Data Flow

**Chat Message Flow:**

1. User types in `ChatPage` (renderer)
2. `sendMessage()` calls IPC via preload `window.electronAPI.sendMessage()`
3. Main process `ipc.ts` receives `SEND_MESSAGE` channel
4. `SessionManager.sendMessage()` invokes `CraftAgent.chat()`
5. Agent events streamed back via `window.electronAPI.onSessionEvent()` listener
6. `App.tsx` uses `useEventProcessor()` hook to handle events
7. Events update Jotai atoms (`sessionAtomFamily`, message state)
8. React re-renders with new messages

**Session Persistence Flow:**

1. Main process maintains in-memory session via `SessionManager`
2. Session changes queued in `sessionPersistenceQueue`
3. Background writer flushes queue periodically to disk (`~/.craft-agent/sessions/{id}/`)
4. On app quit: `before-quit` handler calls `sessionManager.flushAllSessions()`
5. Renderer retrieves persisted messages via `window.electronAPI.getSessionMessages()`

**Authentication Flow:**

1. User initiates auth in renderer (OAuth token or API key)
2. Preload forwards to main via `ipc.ts`
3. Main calls `getAuthState()` from `@craft-agent/shared/auth`
4. Auth state persisted via `@craft-agent/shared/config` storage
5. Config changes trigger `ConfigWatcher` which notifies subscribers
6. Session manager reconfigures agent with new credentials

**Window and Workspace Flow:**

1. `WindowManager` maintains open windows per workspace
2. Renderer requests workspace switch via `switchWorkspace()` IPC
3. Main `WindowManager` creates new window for target workspace
4. Window state saved on quit, restored on launch
5. Each window has independent session list loaded via IPC

## Key Abstractions

**Session:**
- Purpose: Conversation boundary with persistent storage
- Examples: `apps/electron/src/main/sessions.ts`, `packages/shared/src/sessions/`
- Pattern: One-to-one with SDK session; persisted as JSON on disk; isolated message history

**Message:**
- Purpose: Atomic unit of conversation (user input, assistant response, tool result)
- Examples: `packages/core/src/types/message.ts`, stored in `StoredMessage` format
- Pattern: Immutable records with role, content, metadata; arranged in conversation thread

**Agent:**
- Purpose: Wraps Anthropic SDK to execute code, run tools, handle credentials
- Examples: `packages/shared/src/agent/`, `CraftAgent` class
- Pattern: Configured per session; maintains tool permissions; emits events during execution

**Source (MCP Server):**
- Purpose: External tool provider via Model Context Protocol
- Examples: `packages/shared/src/sources/`
- Pattern: Discovered via config; requires credential setup; built with auth before agent start

**Workspace:**
- Purpose: Project boundary with local folder, config, sessions
- Examples: `packages/core/src/types/workspace.ts`, `packages/shared/src/workspaces/`
- Pattern: Stored in `~/.craft-agent/workspaces.json`; each has MCP URL, auth type

**Atom (State):**
- Purpose: Reactive state container for renderer UI
- Examples: `apps/electron/src/renderer/atoms/sessions.ts`
- Pattern: Jotai atoms for session list, session details, background tasks

## Entry Points

**Main Process:**
- Location: `apps/electron/src/main/index.ts`
- Triggers: Electron `app.whenReady()`
- Responsibilities:
  - Initialize Sentry error tracking
  - Register protocol handlers (deeplinks, thumbnails)
  - Create `WindowManager` and `SessionManager`
  - Register IPC handlers
  - Load and restore windows from saved state
  - Check for auto-updates

**Renderer Process:**
- Location: `apps/electron/src/renderer/main.tsx`
- Triggers: HTML loads after preload bridge is ready
- Responsibilities:
  - Initialize Sentry renderer integration
  - Set up Jotai provider for state
  - Render `<App />` root component
  - Provide theme and modal contexts

**App Component:**
- Location: `apps/electron/src/renderer/App.tsx`
- Responsibilities:
  - Detect window mode (main app vs tab content)
  - Initialize sessions atom from IPC
  - Set up event listeners for session events
  - Route between onboarding, reauth, and chat UI
  - Manage global shortcuts and window close handlers

**Preload Bridge:**
- Location: `apps/electron/src/preload/index.ts`
- Exposes: `window.electronAPI` with methods for session, workspace, file, theme operations

## Error Handling

**Strategy:** Layered error capture with Sentry + graceful UI fallbacks

**Patterns:**

- **Main process errors:** Logged via `@sentry/electron/main`, scrub sensitive data before sending
- **Renderer errors:** Caught by `Sentry.ErrorBoundary`, shown as crash fallback UI with reload button
- **IPC errors:** Reject promises returned from IPC invocations; caught at call site
- **Session errors:** Wrapped in `TypedError` type with `code`, `title`, `canRetry` fields; sent as message event
- **Agent execution errors:** Captured as tool results; displayed in chat with retry options

Example error flow in agent:
```
Agent throws → SessionManager catches → formats as AgentEvent with type: 'error'
→ Main sends via IPC SESSION_EVENT → Renderer's onSessionEvent listener
→ Event processor updates messages atom → UI renders error message
```

## Cross-Cutting Concerns

**Logging:**
- Main: `electron-log` via `apps/electron/src/main/logger.ts`, outputs to `~/Library/Logs/Craft Agents/`
- Renderer: Console only (captured by Sentry integration)
- Debug mode: `CRAFT_DEBUG=1` enables verbose logging

**Validation:**
- Paths: Sanitized in `ipc.ts` (`sanitizeFilename()`, `validateFilePath()`)
- Images: Validated for Claude API via `validateImageForClaudeAPI()` before upload
- Config: Zod schemas in `@craft-agent/shared/config/`
- Auth: OAuth PKCE flow verified in `@craft-agent/shared/auth/`

**Authentication:**
- Tokens stored in secure storage (1Password on macOS via Keychain)
- OAuth flows: PKCE-based, local callback server on dynamic port
- Per-workspace MCP auth separate from global Anthropic API auth
- Sentry scrubs auth headers before sending error reports

**Performance:**
- Perf tracking via `perf()` utility in development mode
- Session persistence async (background writer queue)
- Message streaming over IPC for large responses
- Icon caching (in-memory + filesystem)
- Code highlighting (Shiki) lazy-loaded per language

---

*Architecture analysis: 2026-01-29*
