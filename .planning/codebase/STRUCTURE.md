# Codebase Structure

**Analysis Date:** 2026-01-29

## Directory Layout

```
kata-agents/
├── apps/
│   ├── electron/              # Main Electron app
│   │   ├── src/
│   │   │   ├── main/          # Main process (Node.js)
│   │   │   ├── renderer/      # Renderer process (React)
│   │   │   ├── preload/       # Preload script (IPC bridge)
│   │   │   └── shared/        # Shared types between main/preload/renderer
│   │   ├── resources/         # Icons, assets
│   │   └── package.json
│   ├── viewer/                # Standalone file viewer (Vite app)
│   └── marketing/             # Marketing site (Vite app)
├── packages/
│   ├── core/                  # Type definitions + utilities
│   │   └── src/
│   │       ├── types/         # TypeScript types
│   │       └── utils/         # Utility functions
│   ├── shared/                # Shared libraries (main & renderer)
│   │   └── src/
│   │       ├── config/        # Config loading, storage, watching
│   │       ├── auth/          # OAuth flows, token management
│   │       ├── agent/         # CraftAgent SDK integration
│   │       ├── sessions/      # Session persistence
│   │       ├── sources/       # MCP server discovery
│   │       ├── mcp/           # MCP client
│   │       ├── credentials/   # Credential storage
│   │       ├── prompts/       # System prompts
│   │       ├── utils/         # Shared utilities
│   │       └── [other]/       # Labels, docs, skills, colors, etc.
│   ├── ui/                    # UI component library
│   │   └── src/
│   │       ├── components/    # Reusable React components
│   │       ├── context/       # React contexts
│   │       └── styles/        # Tailwind styles
│   └── mermaid/               # Mermaid diagram support
├── scripts/                   # Build and development scripts
├── package.json               # Monorepo root
├── tsconfig.json              # Root TypeScript config
└── bun.lock                   # Dependency lockfile
```

## Directory Purposes

**apps/electron:**
- Purpose: Desktop application using Electron
- Contains: Main process, renderer (React UI), preload bridge, IPC handlers
- Key files: `src/main/index.ts` (entry), `src/renderer/App.tsx` (root UI), `src/preload/index.ts` (API bridge)

**apps/electron/src/main:**
- Purpose: Electron main process (Node.js) - window/session management, IPC
- Contains: WindowManager, SessionManager, IPC handlers, file ops, auto-update, logging
- Key files:
  - `index.ts` - App initialization, lifecycle handlers
  - `ipc.ts` - IPC channel handlers
  - `sessions.ts` - Session orchestration with CraftAgent
  - `window-manager.ts` - Window creation, state tracking
  - `logger.ts` - electron-log configuration

**apps/electron/src/renderer:**
- Purpose: React UI application (Renderer process)
- Contains: Components, hooks, atoms (state), pages, utilities
- Key files:
  - `main.tsx` - React setup, Sentry init
  - `App.tsx` - Root component, event handling, routing
  - `index.tsx` - Entry HTML file (Vite)

**apps/electron/src/renderer/components:**
- Purpose: React component hierarchy for UI
- Structure:
  - `app-shell/` - Main layout shell with sidebar, chat area, right panel
  - `chat/` - Chat message display and input
  - `settings/` - Preferences, shortcuts, workspace config
  - `onboarding/` - Initial setup wizard
  - `workspace/` - Workspace management
  - `apisetup/` - API token configuration
  - `preview/` - File preview overlays
  - `ui/` - Primitive UI components (button, input, etc.)

**apps/electron/src/renderer/atoms:**
- Purpose: Jotai global state
- Contains: `sessions.ts` (main session atom), `sources.ts`, `skills.ts`, `overlay.ts`
- Pattern: Atoms organized by domain; `sessionAtomFamily()` for per-session state

**apps/electron/src/renderer/context:**
- Purpose: React context providers
- Contains: ThemeContext, AppShellContext, ModalContext, FocusContext, EscapeInterruptContext
- Used by: Wrapped around root or subtrees for shared state

**apps/electron/src/renderer/hooks:**
- Purpose: Custom React hooks
- Contains: useSession, useNotifications, useOnboarding, useTheme, useUpdateChecker, etc.
- Key hooks:
  - `useSession.ts` - Get current session data
  - `useEventProcessor.ts` - Process agent events
  - `useLinkInterceptor.ts` - File preview overlay handling

**apps/electron/src/renderer/event-processor:**
- Purpose: Pure event processing for agent events
- Contains: `processor.ts` (event handler), `types.ts` (event types), `helpers.ts` (message utils)
- Pattern: Centralized handling of streaming, tool calls, errors, permissions

**apps/electron/src/renderer/lib:**
- Purpose: Utility libraries
- Contains: icon-cache, navigation registry, mentions parser, perf tracking, markdown utils
- Key files:
  - `icon-cache.ts` - In-memory tool icon caching
  - `navigation-registry.ts` - Route definitions
  - `mentions.ts` - Parse @source and @skill mentions

**apps/electron/src/renderer/pages:**
- Purpose: Page-level components
- Contains: ChatPage, PreferencesPage, SkillInfoPage, SourceInfoPage, ShortcutsPage
- Pattern: Each page is a route target

**apps/electron/src/renderer/utils:**
- Purpose: UI utilities
- Contains: text formatting, animations, file utilities, local storage
- Used by: Components throughout renderer

**apps/electron/src/shared:**
- Purpose: Shared types between main, renderer, preload
- Contains: `types.ts` with ElectronAPI interface, SessionEvent, Message, IPC_CHANNELS constants

**apps/electron/src/preload:**
- Purpose: Preload script - secure IPC bridge
- Contains: `index.ts` - ElectronAPI definition exposing safe methods to renderer

**packages/core:**
- Purpose: Type definitions and minimal utilities
- Contains: Type re-exports from `types/` (Workspace, Session, Message, etc.)
- Used by: Both main process and renderer via `@craft-agent/core` imports

**packages/core/src/types:**
- Contains: `workspace.ts`, `session.ts`, `message.ts` - core type definitions
- Pattern: Imported by `packages/shared` and apps

**packages/shared:**
- Purpose: Shared business logic (config, auth, agent, persistence)
- Key modules:

  **config/:**
  - `storage.ts` - Load/save config from `~/.craft-agent/`
  - `watcher.ts` - File system watcher for config changes
  - `preferences.ts` - User preferences
  - `models.ts` - Model list and selection
  - `theme.ts` - Theme configuration

  **auth/:**
  - `oauth.ts` - OAuth flow base class
  - `claude-oauth.ts` - Anthropic OAuth
  - `google-oauth.ts` - Google OAuth for sources
  - `slack-oauth.ts` - Slack OAuth for sources
  - `microsoft-oauth.ts` - Microsoft OAuth for sources
  - `callback-server.ts` - Local OAuth callback server
  - `pkce.ts` - PKCE helper functions

  **agent/:**
  - `index.ts` - CraftAgent class wrapping Claude Agent SDK
  - `permissions-config.ts` - Permission rules for tool execution
  - `thinking-levels.ts` - Extended thinking configuration
  - `tools/` - Tool implementations (shell, editor, file browser, etc.)

  **sessions/:**
  - `storage.ts` - Load/save session JSON from `~/.craft-agent/sessions/{id}/`
  - `persistence-queue.ts` - Async persistence queue
  - `metadata.ts` - Session metadata helpers
  - `compaction.ts` - Archive old messages to save space

  **sources/:**
  - `discovery.ts` - Find MCP servers from workspace config
  - `credential-manager.ts` - OAuth/API key for each source
  - `server-builder.ts` - Build MCP servers with auth

  **mcp/:**
  - `client.ts` - Model Context Protocol client

  **credentials/:**
  - `index.ts` - Credential storage via OS keyring

  **prompts/:**
  - System prompt templates for agent initialization

- Used by: Main process, renderer (via imports), CLI tools

**packages/shared/src/utils:**
- Purpose: Shared utilities
- Contains: Path helpers, validation, file reading, image processing, perf tracking, markdown

**packages/ui:**
- Purpose: Reusable React component library
- Contains: Radix UI wrappers, theme system, code highlighting (Shiki), icons
- Used by: Electron renderer

**packages/ui/src/components:**
- Contains: UI primitives + domain components (PreviewOverlay, CodePreview, etc.)

**scripts/:**
- Purpose: Build, release, development utilities
- Contains: `electron-build-*.ts` (esbuild scripts), `electron-dev.ts` (dev mode), `release.ts`, `build.ts`

## Key File Locations

**Entry Points:**
- `apps/electron/src/main/index.ts` - Main process startup
- `apps/electron/src/renderer/main.tsx` - React app setup
- `apps/electron/src/renderer/index.html` - HTML template (Vite)
- `apps/electron/src/preload/index.ts` - Preload script

**Configuration:**
- `apps/electron/tsconfig.json` - TypeScript config with path aliases
- `packages/shared/src/config/config-defaults-schema.ts` - Zod schema for config
- `~/.craft-agent/config.json` - User config at runtime

**Core Logic:**
- `apps/electron/src/main/sessions.ts` - Session + agent orchestration
- `apps/electron/src/renderer/App.tsx` - Root UI, event handling
- `packages/shared/src/agent/index.ts` - CraftAgent SDK wrapper

**Testing:**
- `packages/shared/tests/` - Jest tests for shared code
- `apps/electron/src/renderer/lib/__tests__/` - Renderer tests

## Naming Conventions

**Files:**
- React components: PascalCase with `.tsx` extension (e.g., `ChatPage.tsx`, `AppShell.tsx`)
- TypeScript modules: camelCase with `.ts` extension (e.g., `sessions.ts`, `icon-cache.ts`)
- Hooks: `use*` prefix, camelCase (e.g., `useSession.ts`, `useEventProcessor.ts`)
- Atoms: `*Atom` suffix (e.g., `sessionAtomFamily`, `sourcesAtom`)
- Types: PascalCase in `*.d.ts` or inline (e.g., `ElectronAPI`, `SessionEvent`)
- Constants: UPPER_SNAKE_CASE (e.g., `IPC_CHANNELS`, `DEFAULT_MODEL`)

**Directories:**
- Feature domains: kebab-case (e.g., `app-shell`, `right-sidebar`, `event-processor`)
- Type collections: plural (e.g., `types/`, `components/`, `hooks/`)
- Source separation: `main/`, `renderer/`, `preload/` in apps

**Imports:**
- Path aliases in Electron: `@/` → renderer, `@config/*` → shared config, `@craft-agent/shared` → shared package
- Absolute imports from packages: `@craft-agent/core`, `@craft-agent/shared`, `@craft-agent/ui`

## Where to Add New Code

**New Feature:**
- Primary code: `packages/shared/src/{domain}/` for business logic
- UI: `apps/electron/src/renderer/components/{feature}/` for components
- Tests: `packages/shared/tests/{domain}/` or `apps/electron/src/renderer/lib/__tests__/`

**New Component/Module:**
- Page component: `apps/electron/src/renderer/pages/{FeatureName}.tsx`
- Reusable component: `apps/electron/src/renderer/components/{feature}/Component.tsx`
- Shared library: `packages/shared/src/{domain}/module.ts`
- Shared utility: `packages/shared/src/utils/utility.ts`
- UI primitive: `packages/ui/src/components/ui/Component.tsx` or `packages/ui/src/components/{domain}/`

**Utilities:**
- Renderer-only helpers: `apps/electron/src/renderer/lib/` or `utils/`
- Shared across processes: `packages/shared/src/utils/`
- UI utilities: `packages/ui/src/lib/`

**State (Jotai Atoms):**
- New atom: `apps/electron/src/renderer/atoms/{domain}.ts`
- Pattern: Use `atomFamily()` for per-session state, simple atoms for global state

**Custom Hooks:**
- New hook: `apps/electron/src/renderer/hooks/use{Name}.ts`
- Compound hooks: Combine multiple hooks in `hooks/{feature}/` subdirectory

**IPC Handlers:**
- New IPC channel: Add to `apps/electron/src/shared/types.ts` `IPC_CHANNELS` constant
- Handler in main: `apps/electron/src/main/ipc.ts` in appropriate section
- API method in preload: `apps/electron/src/preload/index.ts` in `ElectronAPI` definition
- Caller in renderer: Use `window.electronAPI.{method}()` via preload

**New Workspace Config:**
- Add to shared config: `packages/shared/src/config/storage.ts` and schema
- Sync to UI: Add preferences setting in `apps/electron/src/renderer/pages/settings/`
- ConfigWatcher will notify subscribers

## Special Directories

**apps/electron/resources/:**
- Purpose: Bundled assets (icons, themes, docs)
- Generated: No (manually managed)
- Committed: Yes
- Contents: macOS/Windows/Linux icons, app icon, tool icon SVGs, bundled docs

**apps/electron/dist/:**
- Purpose: Build output for main and preload processes
- Generated: Yes (via esbuild)
- Committed: No
- Built by: `electron:build:main` and `electron:build:preload` scripts

**packages/shared/resources/:**
- Purpose: Bundled docs and permissions
- Generated: No (manually maintained)
- Committed: Yes
- Contents: Markdown docs, default permissions JSON

**~/.craft-agent/ (runtime):**
- Purpose: User configuration and session storage
- Structure:
  - `config.json` - User settings
  - `workspaces.json` - Workspace list
  - `sessions/{id}/` - Message history per session
  - `sessions/{id}/attachments/` - Stored file attachments
  - `tool-icons/` - Cached tool SVG icons
  - `credentials/` - OAuth tokens (via OS keyring)

**packages/shared/tests/:**
- Purpose: Test files for shared code
- Pattern: Co-located or in `__tests__/` directories

---

*Structure analysis: 2026-01-29*
