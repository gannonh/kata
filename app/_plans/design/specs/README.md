# Front-End UI Specifications

Derived from the [design mocks](../mocks/README.md) (29 screenshots) and cross-referenced against the current codebase.

## Spec Documents

| # | Spec | Mocks | Primary Code Modules |
|---|------|-------|---------------------|
| 01 | [Create Space Flow](01-create-space-flow.md) | 01-03 | `src/space/` |
| 02 | [Coordinator Session](02-coordinator-session.md) | 04-07 | `src/main.tsx` (session views) |
| 03 | [Spec & Notes Panel](03-spec-notes-panel.md) | 08-09 | `src/features/spec-panel/`, `src/notes/` |
| 04 | [Build Session](04-build-session.md) | 10-14 | `src/main.tsx` (orchestrator views) |
| 05 | [Changes & Git](05-changes-git.md) | 15-17 | `src/git/` |
| 06 | [Wave Execution](06-wave-execution.md) | 18-25 | `src/shared/orchestrator-*` |
| 07 | [Completion & Verification](07-completion-verification.md) | 26-29 | `src/shared/orchestrator-*`, `src/git/pr-workflow.ts` |

## How to Use These Specs

Each spec follows a consistent structure:

- **Component Inventory** — every UI element named in React PascalCase, mapped to existing source files or marked NEW
- **States** — each mock-visible state with trigger, layout, content, and interactive elements
- **Data Dependencies** — dynamic data mapped to `AppState` fields and `kataShell` IPC channels
- **Interactions** — user actions mapped to triggers, effects, and IPC channels from `shell-api.ts`
- **Visual Specifications** — color tokens, typography, spacing extracted from the mocks
- **Implementation Gap Analysis** — what the mocks show vs. what the code currently implements

## Cross-Cutting Gaps

Patterns that recur across multiple specs:

1. **Chat-style conversation rendering** — Mocks show a message thread UI; current code uses `info-card` status blocks (specs 02, 04, 06)
2. **Agent sidebar** — Mocks show an agent list with status indicators; no agent entity or registry exists (specs 02, 04, 06, 07)
3. **Wave grouping model** — Mocks organize delegation into numbered waves; no `waveId` exists in the data model (specs 06, 07)
4. **Terminal/browser tab types** — Mocks show embedded terminal and browser tabs; neither component exists (specs 01, 06)
5. **Permission dialog system** — Mock 29 shows a modal permission prompt; no permission dialog component exists (spec 07)
6. **Commit interface** — Mocks show commit message input + button; only stage/unstage IPC channels exist (specs 05, 07)
7. **Markdown rendering in spec panel** — Mocks show formatted spec content; current code renders raw `<pre>` text (spec 03)
