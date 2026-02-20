# Plan: Kata Desktop App — Phase 1 (Mock UI)

## Context

Kata Orchestrator's agent skills have proven effective as a spec-driven development framework. This plan builds a desktop GUI around those workflows. The app uses PI mono repo packages (`@mariozechner/pi-ai`, `pi-agent-core`, `pi-web-ui`, `pi-coding-agent`) for the agent runtime and LLM layer, with Electron + React as the desktop shell.

Phase 1 builds the complete three-column UI with mock data. No PI package wiring yet. This validates layout, interaction models, and identifies vertical slices for future integration.

**Key decisions:**
- React shell + PI Lit.js web components (embedded in center column)
- New `app/` directory in this repo
- npm (match PI's package manager)
- electron-vite for unified main/preload/renderer build
- Tailwind v4 (CSS-first, no config file)
- Dark theme default (matches screenshot reference)

---

## Project Structure

```
app/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── vitest.config.ts
├── src/
│   ├── main/
│   │   ├── index.ts                 # BrowserWindow, app lifecycle
│   │   └── ipc-handlers.ts          # IPC stubs (return mock data)
│   ├── preload/
│   │   ├── index.ts                 # contextBridge API
│   │   └── index.d.ts              # Window.kata type declarations
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── app.css                  # Tailwind import + CSS variables
│       ├── types/                   # agent.ts, project.ts, git.ts
│       ├── mock/                    # agents.ts, messages.ts, project.ts, git.ts, files.ts
│       ├── components/
│       │   ├── layout/              # AppShell, LeftPanel, CenterPanel, RightPanel, PanelResizer
│       │   ├── left/                # AgentsTab, AgentCard, ContextTab, ChangesTab, FilesTab, FileTreeNode
│       │   ├── center/              # ChatContainer, MockChatPanel, MessageList, MessageBubble, ToolCallResult, StreamingIndicator, ChatInput
│       │   ├── right/               # SpecTab, ArchitectureDiagram, TaskList, AcceptanceCriteria, NotesTab
│       │   └── shared/              # TabBar, StatusBadge, CollapsibleSection, SearchInput, MarkdownRenderer
│       ├── hooks/                   # usePanel, useMockAgent, useMockChat
│       └── lib/                     # cn.ts (Tailwind class merge)
├── tests/
│   ├── unit/                        # Vitest + Testing Library
│   └── e2e/                         # Playwright with Electron fixture
└── .gitignore
```

---

## Build Order (6 Waves)

### Wave 1: Scaffold and Shell
Electron window opens with an empty three-column layout.

1. Initialize `app/` with `package.json`, install deps
2. Create `electron.vite.config.ts` (main + preload + renderer)
3. Create TypeScript configs (base, node, web targets)
4. Create `src/main/index.ts` — BrowserWindow (1440x900, min 1024x600, contextIsolation: true)
5. Create `src/preload/index.ts` — contextBridge stubs + type declarations
6. Create `src/renderer/index.html`, `main.tsx`, `app.css` (Tailwind v4 import)
7. Create `App.tsx` → `AppShell.tsx` — CSS Grid three-column layout
8. Create `PanelResizer.tsx` — draggable column dividers
9. **Verify:** `npm run dev` opens Electron window with three visible columns

### Wave 2: Mock Data and Shared Components
All types, mock data, and reusable components.

1. Create types: `agent.ts`, `project.ts`, `git.ts`
2. Create mock data: `agents.ts` (orchestrator + 2 sub-agents), `messages.ts` (10-15 realistic messages), `project.ts` (spec, tasks, AC), `git.ts` (branch, staged/unstaged), `files.ts` (file tree)
3. Create `lib/cn.ts` (Tailwind class merge)
4. Create shared components: `TabBar`, `StatusBadge`, `CollapsibleSection`, `SearchInput`, `MarkdownRenderer`

### Wave 3: Left Panel
Four functional tabs: Agents, Context, Changes, Files.

1. `LeftPanel.tsx` — tab container
2. `AgentsTab.tsx` + `AgentCard.tsx` — agent list with status badges, model, token usage, current task
3. `ContextTab.tsx` — shared workspace items (spec link, task checkboxes)
4. `ChangesTab.tsx` — branch display, staged/unstaged file lists with status icons, commit button
5. `FilesTab.tsx` + `FileTreeNode.tsx` — recursive file tree, expand/collapse, search filter

### Wave 4: Center Panel (Mock Chat)
Mock chat conversation with realistic messages.

1. `CenterPanel.tsx` — full-height chat wrapper
2. `MessageList.tsx` — scrollable container with auto-scroll-to-bottom
3. `MessageBubble.tsx` — user/assistant messages, markdown rendering for assistant
4. `ToolCallResult.tsx` — collapsible tool name + args + output with syntax highlighting
5. `StreamingIndicator.tsx` — pulsing animation
6. `ChatInput.tsx` — textarea + send button
7. `MockChatPanel.tsx` — composes all chat components with mock data
8. `useMockChat.ts` hook — simulates message streaming (on send: adds user message, streams assistant response character by character)

### Wave 5: Right Panel
Project spec and notes tabs.

1. `RightPanel.tsx` — tab container
2. `SpecTab.tsx` — goal, architecture placeholder, tasks, acceptance criteria, non-goals, assumptions
3. `ArchitectureDiagram.tsx` — static SVG/placeholder
4. `TaskList.tsx` — checklist with status indicators
5. `AcceptanceCriteria.tsx` — checklist display
6. `NotesTab.tsx` — textarea, persisted in React state

### Wave 6: Tests and Polish

1. Vitest unit tests: `AppShell.test.tsx`, `AgentCard.test.tsx`, `MessageBubble.test.tsx`, `TabBar.test.tsx`, `useMockChat.test.ts`
2. Playwright E2E: Electron launch fixture, `app-launch.spec.ts`, `navigation.spec.ts`, `chat-mock.spec.ts`
3. Visual polish: consistent spacing, dark theme CSS variables, overflow handling, responsive minimum widths

---

## Technical Decisions

**electron-vite:** Unified three-process Vite config with HMR for renderer. Handles `file://` protocol asset paths in production builds. Avoids the common pitfall of manual Vite + Electron configuration.

**Mock-first swap point:** `MockChatPanel` is a pure React component with the same visual output as PI's `<pi-chat-panel>`. Future Phase 2 replaces it with a single `<pi-chat-panel>` Lit element. React 19 handles custom element properties natively — no wrapper library needed.

**Preload IPC contract:** Stubs exist in Phase 1 to establish the API shape (`kata.getAgents()`, `kata.getMessages()`, etc.). Renderer reads directly from `mock/` imports. Phase 2 switches to actual IPC calls.

**Panel resizer:** Simple mousedown-mousemove-mouseup handler adjusting CSS grid column widths. No library dependency.

**Tailwind v4:** CSS-first configuration (`@import "tailwindcss"` in app.css). No config file. Consistent with PI web-ui.

---

## Key Dependencies

```
electron: ^34.0.0
electron-vite: ^2.0.0
react: ^19.0.0
react-dom: ^19.0.0
typescript: ^5.7.0
tailwindcss: ^4.0.0
@tailwindcss/vite: ^4.0.0
vitest: ^3.0.0
@testing-library/react: ^16.0.0
jsdom: ^25.0.0
@playwright/test: ^1.49.0
```

---

## Verification

After each wave:
- `npm run dev` — Electron window opens, new components render
- `npm test` — Vitest unit tests pass
- `npm run lint` — TypeScript compiles without errors

After Wave 6:
- `npm run test:e2e` — Playwright E2E tests pass (window opens, tabs switch, mock chat works)
- `npm run build` — Production build succeeds
- Visual inspection: three-column layout matches reference screenshot proportions, dark theme, all tabs functional
