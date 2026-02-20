# Build Session — Planning & Architecture

> Mocks: `10-build-session-spec-draft-review.png`, `11-build-session-architecture-proposal.png`, `12-build-session-tech-stack-a.png`, `13-build-session-tech-stack-b.png`, `14-build-session-task-tracking.png`

## Overview

A build session is the primary workspace where a user iterates with AI agents on planning and building a software project. The user provides a project prompt. The orchestrator generates a spec draft containing a goal statement, task checklist, acceptance criteria, and verification plan. The user reviews and refines this spec through a conversational thread in the center panel. The right panel displays the structured spec document. The left sidebar tracks the session hierarchy, agent roster, and task checklist with live status indicators. Across mocks 10 through 14, the session progresses from initial spec draft review through architecture proposal, tech stack selection, and task tracking.

## Component Inventory

| Component | Description | Source File |
|-----------|-------------|-------------|
| `BuildSessionHeader` | Top bar showing space name ("Build kata cloud product"), product label ("Plan Product Build"), breadcrumb-style session indicator. Includes toolbar with share/settings icons. | `src/main.tsx` L1253-L1270 (currently `shell-header`) |
| `LeftSidebar` | Vertical panel containing session list, agent list, task checklist, and conversation entry selector. Collapsible sections with disclosure triangles. | `src/main.tsx` L1278-L1429 (currently the Explorer `<section>`) |
| `SessionListSection` | Expandable section labeled "Sessions" listing session entries (e.g., "MVP Planning Session"). Active session highlighted. | `src/main.tsx` L1304-L1321 |
| `AgentListSection` | Expandable section labeled "Agents" listing agent/specialist entries (e.g., "Kata Agents", "MVP Planning Coordinator"). Each agent shows an avatar dot and name. | Not implemented |
| `TaskChecklistSection` | Expandable section listing tasks with checkbox indicators. Tasks show title text and completion state (checked/unchecked). Grouped under "Tasks" header. | Not implemented (mock shows structured checklist; code only has `OrchestratorDelegatedTaskRecord` with `implement`/`verify`/`debug` types) |
| `ConversationEntryList` | Bottom section of left sidebar listing conversation turns (e.g., "Spec Updated", "Architecture proposed") with timestamps. Clicking scrolls center panel to that entry. | Not implemented |
| `CenterConversationPanel` | Scrollable conversation thread between user and orchestrator agents. Shows markdown-formatted messages with role labels ("kata.agents.set", "MVP Planning Coordinator"). Includes message input at bottom. | `src/main.tsx` L1431-L1690 (currently the Orchestrator `<section>` with info-card layout) |
| `AgentMessageBubble` | Individual message in the conversation thread. Shows agent name, role label, and markdown body. User messages are visually distinct from agent messages. | Not implemented (current code renders run status as info-cards) |
| `MessageInput` | Text input at bottom of center panel with "Ask anything or type @ for context" placeholder and submit affordance ("GPT 4.1 mini" model selector visible). | `src/main.tsx` L1438-L1461 (currently `space-prompt-input` textarea + "Run Orchestrator" button) |
| `RightSpecPanel` | Fixed panel displaying the structured spec document. Shows "Spec" tab header. Contains Goal, Tasks (checklist), Acceptance Criteria, Non-goals, Assumptions, Verification Plan, and Rollback Plan sections. | `src/notes/spec-note-panel.tsx` (SpecNotePanel component) |
| `SpecTaskChecklist` | Checklist within the right spec panel. Each task row has a checkbox, task title, and optional strikethrough for completed items. Uses green checkmark for completed tasks. | `src/features/spec-panel/types.ts` (`SpecTaskRecord`) |
| `SpecSectionBlock` | Reusable block for each spec section (Goal, Tasks, Acceptance Criteria, etc.). Displays a section heading and body content. | Partially in `SpecNotePanel`; spec draft content is generated as markdown in `src/main.tsx` L164-L177 |

## States

### Spec Draft Review (Mock 10)

- **Trigger:** User runs the orchestrator with a project prompt. The orchestrator completes a run (status transitions through `queued -> running -> completed`), generates a `draft` (`OrchestratorSpecDraft`), and the conversational review begins.
- **Layout:** Three-column layout. Left sidebar (~220px) contains session list, agents list, and a conversation entry index. Center panel (~480px) shows the conversational spec-drafting thread. Right panel (~340px) shows the structured spec document.
- **Content:**
  - Left sidebar header: "Build kata cloud product" with space badge.
  - Sessions section expanded: "MVP Planning Session" listed under "Sessions" heading.
  - Agents section expanded: "Kata Agents" and "MVP Planning Coordinator" listed under "Agents" heading, each with colored avatar dots.
  - Task checklist visible below agents: "Content" heading with task entries (checkboxes, some checked, some unchecked). Tasks include items like "Spec summary set", "Spec submitted", "Task list reviewed".
  - Conversation entry list at sidebar bottom: timestamped entries like "Spec Updated", "I updated the ..., tasks with".
  - Center panel: multi-turn conversation. Agent messages ("kata.agents.set") contain structured markdown content. Messages reference task list creation, spec structure, acceptance criteria. A "Spec Updated" label with timestamp separates conversation phases.
  - Right panel: "Spec" heading. Structured document with Goal, Tasks (checklist with checkboxes), Acceptance Criteria (numbered list), Non-goals (bulleted list), Assumptions (bulleted list), Verification Plan (numbered list), Rollback Plan (numbered list).
- **Interactive elements:**
  - Message input bar at bottom of center panel: text field with placeholder "Ask anything or type @ for context", model selector badge ("GPT 4.1 mini"), submit button.
  - Task checkboxes in left sidebar checklist (toggleable).
  - Task checkboxes in right spec panel (toggleable).
  - Session list items (clickable to switch session).
  - Conversation entry list items in sidebar (clickable to scroll to entry).

### Architecture Proposal (Mock 11)

- **Trigger:** Agent posts architecture recommendations in the conversation thread. The spec document is updated to reflect architecture decisions.
- **Layout:** Same three-column layout as Mock 10.
- **Content:**
  - Left sidebar: Same structure. Agents section shows same entries. Task list shows updated states.
  - Center panel: Conversation continues with architecture-focused messages. Agent posts architecture recommendations including Electron framework choice, tech stack preferences, and revised spec sections. Messages include "Spec Updated" and "I updated the ..." entries.
  - Right panel: Spec document updated. Same section structure (Goal, Tasks, Acceptance Criteria, etc.) with architecture decisions reflected in content.
- **Interactive elements:** Same as Mock 10. Conversation scroll position is further down the thread.

### Tech Stack Proposal A (Mock 12)

- **Trigger:** Agent proposes a specific tech stack. Conversation includes structured "Why" rationale, "How to keep Tech stable later" guidance, and "Revised views" section.
- **Layout:** Same three-column layout. Left sidebar collapses some sections; task list now shows different task entries with updated completion states.
- **Content:**
  - Left sidebar: "Sessions" section collapsed (disclosure triangle pointing right). "Agents" section collapsed. Task list ("Tasks") is expanded, showing task entries with checkboxes.
  - Center panel: Agent message contains structured proposal with "Why" section (bulleted rationale for tech choices including Electron, macOS-only, TypeScript), "How to keep Tech stable later" (bulleted guidance), and "Revised views" (bulleted list of updated architectural components). Bottom shows approval prompt: "Approve this plan with 1 check? Clarifications", two action buttons ("Approve the plan...", "Keep the last switch...").
  - Right panel: Spec document. Same structure. Content reflects tech stack decisions. Checkboxes in Tasks section show updated completion states.
- **Interactive elements:**
  - Approval action buttons in center panel conversation.
  - Checkbox toggles in task list (left sidebar) and spec task list (right panel).
  - Collapsed sidebar sections with disclosure triangles.
  - Message input bar at bottom.

### Tech Stack Proposal B (Mock 13)

- **Trigger:** Same state as Mock 12 with a different scroll position or minor content variation.
- **Layout:** Identical to Mock 12.
- **Content:**
  - Left sidebar: "Sessions" collapsed. "Agents" collapsed. Task list expanded with checkbox entries. Left sidebar shows a narrower set of task entries compared to Mock 12, with "specs validation checks and testing rules" and "Implement text model provider routines and authentication" visible.
  - Center panel: Same tech stack proposal content as Mock 12 at a different scroll position.
  - Right panel: Same spec document structure with tasks checklist. "Implement content engine adapter and initial providers" and "Implement text model provider runtime and authentication" visible as task items.
- **Interactive elements:** Same as Mock 12.

### Task Tracking (Mock 14)

- **Trigger:** Planning phase progresses to task tracking. Task list in both left sidebar and right spec panel reflects accumulated tasks from prior conversation.
- **Layout:** Same three-column layout.
- **Content:**
  - Left sidebar: "Sessions" section collapsed (disclosure triangle). Agents section absent or collapsed. Task list expanded under "Tasks" header. Multiple task entries visible, each with checkbox indicator. Some tasks checked (complete), others unchecked.
  - Center panel: Conversation thread continues from architecture/tech-stack phase. Scroll position shows later entries.
  - Right panel: Spec document with full task list. Checkbox items correspond to the left sidebar task list. Tasks include implementation items (bootstrap desktop shell, implement space creation, add git branch lifecycle, build spec note panel, implement task block parsing, etc.).
- **Interactive elements:**
  - Task checkboxes in sidebar and spec panel.
  - Conversation entry items in sidebar (if visible).
  - Message input bar.

## Left Sidebar Structure

The left sidebar in the mocks contains four distinct sections, each with expand/collapse behavior:

### Session List
- Header: "Sessions" with disclosure triangle.
- Entries: Session name labels (e.g., "MVP Planning Session"). Active session is highlighted (bold text or accent border).
- Selection: Clicking a session switches `activeSessionId` in `AppState`.

### Agent List
- Header: "Agents" with disclosure triangle.
- Entries: Agent name with colored avatar dot (small circle, 8-10px diameter). Two agents visible: "Kata Agents" (system-level agent set) and "MVP Planning Coordinator" (session-specific agent).
- The agent list does not exist in the current data model. `OrchestratorDelegatedTaskRecord` tracks task specialists (`implementor`, `verifier`, `developer`), but there is no persistent agent roster or agent identity entity.

### Task Checklist
- Header: "Tasks" (or "Content" in Mock 10).
- Entries: Checkbox + task title text. Checked items indicate completion. Tasks are derived from the spec document's task list.
- In Mock 10, tasks include: "Spec summary set", "Spec submitted", "Task list reviewed".
- In Mocks 12-14, tasks include implementation items: "Bootstrap desktop shell and workspace state", "Implement space creation and metadata management", etc.
- Checkbox state maps to `SpecTaskRecord.status` (from `src/features/spec-panel/types.ts` L17-L23). `complete` status renders as checked.

### Conversation Entry Index
- Located below the task list in Mock 10.
- Entries: Short label + timestamp referencing conversation turns (e.g., "Spec Updated", "I updated the ...").
- Clicking an entry scrolls the center panel to that conversation turn.
- Not present or collapsed in Mocks 12-14.

### Expand/Collapse Behavior
- Each section has a disclosure triangle to the left of its heading.
- Collapsed state: triangle points right, section content hidden.
- Expanded state: triangle points down, section content visible.
- Mocks 12-14 show Sessions and Agents collapsed, Tasks expanded.
- Mock 10 shows all sections expanded.

## Data Dependencies

| Data | Source | Type |
|------|--------|------|
| Space name and metadata | `AppState.spaces` | `SpaceRecord` (`src/shared/state.ts` L45-L56) |
| Active session | `AppState.sessions` filtered by `activeSpaceId` | `SessionRecord` (`src/shared/state.ts` L58-L65) |
| Orchestrator run status | `AppState.orchestratorRuns` filtered by `activeSpaceId` + `activeSessionId` | `OrchestratorRunRecord` (`src/shared/state.ts` L67-L87) |
| Spec draft content | `OrchestratorRunRecord.draft` | `OrchestratorSpecDraft` (`src/shared/state.ts` L26-L30) |
| Delegated task status | `OrchestratorRunRecord.delegatedTasks` | `OrchestratorDelegatedTaskRecord[]` (`src/shared/state.ts` L32-L43) |
| Spec note document | Loaded via `loadSpecNote()` | `SpecNoteDocument` (`src/features/spec-panel/types.ts` L36-L41) |
| Spec tasks (checklist) | `SpecNoteDocument.tasks` | `SpecTaskRecord[]` (`src/features/spec-panel/types.ts` L25-L34) |
| Context snippets | `OrchestratorRunRecord.contextSnippets` | `ContextSnippet[]` (from `src/context/types.ts`) |
| Context provenance | `OrchestratorRunRecord.resolvedProviderId`, `fallbackFromProviderId` | `ContextProviderId` |
| Agent roster | Not modeled | Requires new type (see Gap Analysis) |
| Conversation message history | Not modeled | Requires new type (see Gap Analysis) |

## Interactions

| Action | Trigger | Effect | IPC Channel |
|--------|---------|--------|-------------|
| Run orchestrator | Click "Run Orchestrator" button or submit message input | Enqueues `OrchestratorRunRecord` (queued), transitions to running, retrieves context, generates spec draft, builds delegated task timeline, transitions to completed/failed | `kata-cloud/context:retrieve` for context retrieval; state persisted via `kata-cloud/state:save` |
| Switch session | Click session item in sidebar | Updates `AppState.activeSessionId`, re-derives `runsForActiveSession` and `latestRunForActiveSession` | `kata-cloud/state:save` |
| Toggle task checkbox (sidebar) | Click checkbox next to task | Updates `SpecTaskRecord.status` between `not_started` and `complete` | `kata-cloud/state:save` (via spec note persistence) |
| Toggle task checkbox (spec panel) | Click checkbox in right panel task list | Same effect as sidebar checkbox toggle | `kata-cloud/state:save` |
| Expand/collapse sidebar section | Click disclosure triangle on section header | Toggles section visibility. Local UI state (not persisted). | None |
| Scroll to conversation entry | Click conversation entry in sidebar index | Scrolls center panel to corresponding message | None (local scroll behavior) |
| Submit message | Type in message input, press enter or click submit | Sends user message to orchestrator, appends to conversation history, triggers agent response | Not implemented (current code uses `spacePrompt` + "Run Orchestrator") |
| Approve plan | Click approval button in conversation | Advances session state, marks relevant tasks, updates spec document | Not implemented |
| Select model | Click model selector badge in message input | Changes active AI model for the session | Not implemented |

## Visual Specifications

### Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0f1116` | App background |
| `--bg-accent` | `#1a2333` | Header/elevated surface background |
| `--panel-bg` | `#141923` | Panel background |
| `--panel-border` | `#2a3347` | Panel and card borders |
| `--panel-focus` | `#55b5ff` | Focused panel border accent |
| `--text` | `#dbe2ee` | Primary text |
| `--muted` | `#9aaccc` | Secondary/muted text |
| `--green` | `#60d394` | Active state indicators, completed task checkboxes |
| `--amber` | `#f2c66d` | Warning/pending indicators |
| Error red | `#ff948f` | Error messages, failed states |
| Agent avatar dot (teal) | Approximately `#4ecdc4` | Agent identity dot in sidebar (observed in mocks) |
| Agent avatar dot (blue) | Approximately `#5b8def` | Second agent identity dot in sidebar (observed in mocks) |

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| App title | IBM Plex Sans | 1.1rem | 600 |
| Panel heading | IBM Plex Sans | 0.95rem | 600 |
| Section heading (sidebar) | IBM Plex Sans | 0.82rem | 600 |
| Body text | IBM Plex Sans | 0.79-0.8rem | 400 |
| Muted/meta text | IBM Plex Sans | 0.75-0.78rem | 400 |
| Code/mono text | IBM Plex Mono | 0.75-0.8rem | 400 |
| Pill button label | IBM Plex Sans | 0.72rem | 400 |
| Conversation messages (mocks) | System sans-serif | ~13-14px | 400 |
| Agent name label (mocks) | System sans-serif | ~12px | 600 |

### Spacing & Layout

| Property | Value |
|----------|-------|
| Three-column grid | `grid-template-columns: minmax(250px, 1fr) minmax(360px, 1.4fr) minmax(320px, 1.25fr)` |
| Grid gap | `0.75rem` |
| Panel padding | `0.95rem` (panel-body) |
| Card padding | `0.75rem 0.8rem` |
| Card border radius | `10px` (info-card), `12px` (panel), `8px` (space-card, session-section) |
| Sidebar section spacing | `0.45rem` between items |
| Session list item padding | Minimal, text-only with `0.4rem` gap |
| Task checklist item gap | `0.45-0.55rem` per item |
| Message input area | Bottom-anchored, ~48px height, full width of center panel |
| Responsive breakpoint | `1180px` (collapses to single column) |

## Implementation Gap Analysis

| Feature | Mock Shows | Current Code | Gap |
|---------|-----------|--------------|-----|
| Conversational message thread | Multi-turn chat between user and agents with markdown rendering, role labels, timestamps | Single `spacePrompt` textarea + "Run Orchestrator" button. Runs displayed as info-cards with raw status text (`src/main.tsx` L1431-L1690). | No message history data model. No chat-style rendering. No markdown rendering in messages. Requires new `ConversationMessage` type and `ConversationThread` collection on `SessionRecord` or `OrchestratorRunRecord`. |
| Agent roster in sidebar | Named agents with colored avatar dots ("Kata Agents", "MVP Planning Coordinator") | `OrchestratorDelegatedTaskRecord.specialist` stores string labels (`implementor`, `verifier`, `developer`). No agent identity entity. No sidebar agent list. (`src/shared/orchestrator-delegation.ts` L7-L11) | Requires new `AgentRecord` type with `id`, `name`, `avatarColor`, `role`. Requires new `AgentListSection` component. |
| Task checklist in sidebar | Checkbox + title list derived from spec tasks | `SpecTaskRecord` exists in types (`src/features/spec-panel/types.ts` L25-L34) but is not rendered in the left sidebar. Sidebar currently shows only space-list and session-list. | Requires new `TaskChecklistSection` component in left sidebar. Need to connect `SpecNoteDocument.tasks` to sidebar rendering. |
| Expand/collapse sidebar sections | Disclosure triangles on Sessions, Agents, Tasks headings | No collapse behavior on any sidebar section. Sessions and spaces are always visible. | Requires local UI state for section collapse (`expandedSections: Record<string, boolean>`). Requires disclosure triangle icon rendering. |
| Conversation entry index in sidebar | Timestamped entry list scrolling center panel | Not implemented. No conversation entry data model. | Requires conversation message model and scroll-to-anchor behavior. |
| Message input with model selector | Input bar with "@" context mention, model badge ("GPT 4.1 mini") | `spacePrompt` textarea with "Run Orchestrator" button (`src/main.tsx` L1438-L1461). No model selector. No @ mention. | Requires model selection UI (provider runtime exists at `src/main/provider-runtime/`). Requires @ mention/context insertion. Requires input bar redesign from textarea+button to chat-style input. |
| Approval buttons in conversation | "Approve the plan..." and "Keep the last switch..." action buttons inline in agent message | No inline action buttons. Draft approval uses `draftAppliedAt` field but has no explicit approval UI. (`src/shared/state.ts` L84) | Requires inline action button rendering in agent messages. Requires approval action handler that updates spec and task state. |
| Structured spec panel (right) | Spec document with Goal, Tasks (checkboxes), Acceptance Criteria, Non-goals, Assumptions, Verification Plan, Rollback Plan sections | `SpecNotePanel` (`src/notes/spec-note-panel.tsx`) renders spec notes with comments. Spec draft is generated as flat markdown (`src/main.tsx` L164-L177) with Goal, Tasks, Context Snippets, Acceptance Criteria, Verification Plan. | Current draft lacks Non-goals, Assumptions, Rollback Plan sections. `SpecNotePanel` renders markdown preview but does not parse into discrete section blocks. Task checkboxes in spec panel require interactive toggle wiring. |
| Three-column layout matching mocks | Left sidebar narrow (~220px), center conversation wide (~480px), right spec panel medium (~340px) | Current `panel-grid` uses `grid-template-columns: minmax(250px, 1fr) minmax(360px, 1.4fr) minmax(320px, 1.25fr)` (`src/styles.css` L96). Three panels exist: Explorer, Orchestrator, Spec/Changes/Browser. | Column proportions are close but the center panel needs to become a conversation thread instead of an info-card stack. The left panel (Explorer) needs to become a session/agent/task sidebar instead of a space list. |
| Session-scoped conversation persistence | Conversation history preserved across app restarts | `OrchestratorRunRecord` persists run metadata and draft but not individual conversation messages. State persisted to `~/.config/kata-cloud/kata-cloud-state.json`. | Requires conversation message array on `OrchestratorRunRecord` or `SessionRecord`. |
| Real-time task status sync | Task checkbox in sidebar and spec panel stay in sync | `SpecTaskRecord` exists but is only stored in `SpecNoteDocument.tasks`. No bidirectional binding between sidebar checklist and spec panel checklist. | Requires shared task state source with event-driven sync between sidebar `TaskChecklistSection` and `SpecNotePanel` task rendering. |
