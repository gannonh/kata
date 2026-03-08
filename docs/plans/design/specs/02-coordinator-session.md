# Coordinator Session

> Mocks: `04-coordinator-session-initial-state.png`, `05-coordinator-session-pasted-context.png`, `06-coordinator-session-spec-context-reading.png`, `07-coordinator-session-spec-analyzing.png`

## Overview

The Coordinator Session is the primary workspace for interacting with the orchestrator agent. It presents a three-panel layout: a left sidebar with agent listing and context management, a center conversation panel for prompt input and orchestrator message history, and a right panel displaying the Spec/Notes document. The user pastes or types a project prompt, the coordinator reads context from the workspace, generates a spec draft, and surfaces a guided workflow (Creating Spec, Implement, Accept changes) in the right panel while the conversation history accumulates in the center.

## Component Inventory

| Component | Description | Source File |
|-----------|-------------|-------------|
| `ShellHeader` | Top bar with space name, search field, and tab strip (Coordinator tab, Spec tab) | `src/main.tsx` (lines 1252-1270, inline in `App`) |
| `LeftSidebar` | Collapsible sidebar containing Agents section and Context section | NEW |
| `AgentList` | Lists active agents under the "Agents" heading with icons; includes "+ Create new agent" action | NEW |
| `AgentListItem` | Single agent row showing agent icon, name ("Coordinator"), and truncated prompt preview | NEW |
| `ContextSection` | "Context" heading with description text, "+ Add context" action, and list of context items (e.g., "Spec") | NEW |
| `SidebarNavIcons` | Row of 5 small icon buttons at the top of the sidebar for switching sidebar modes | NEW |
| `TabStrip` | Horizontal tab bar below the header; shows "Coordinator x" and "+" for new tab; right side shows "Spec +" | `src/main.tsx` (lines 1258-1269, currently the `view-nav` buttons) |
| `ConversationPanel` | Center panel displaying the message history (user messages and coordinator responses) | NEW |
| `UserMessage` | Renders a user-submitted prompt as a card with timestamp ("Just now"), message text, and pasted-content badge | NEW |
| `PastedContentBadge` | Inline indicator showing pasted line count (e.g., "Pasted 205 lines") with expand/collapse toggle | NEW |
| `ModelSelector` | Dropdown/label at the bottom of a message card showing active model (e.g., "GPT-5.3 Codex") with settings icon | NEW |
| `MessageInputBar` | Bottom-anchored input bar with placeholder "Ask anything or type @ for context", model selector, attachment/expand/send icons | NEW |
| `CoordinatorStatusBadge` | Inline status label in conversation area (e.g., "Thinking", "Stopped") with colored dot indicator | NEW |
| `SpecPanel` | Right-side panel for the spec document; shows "NOTES / Spec" breadcrumb and spec content or empty-state prompt | `src/features/spec-panel/spec-note-panel.tsx` (existing `SpecNotePanel`) |
| `SpecEmptyState` | Placeholder text: "Start drafting a specification for what you want to build. Or brainstorm with an agent" with cursor | NEW |
| `GuidedWorkflowSidebar` | Right-aligned vertical stepper showing three steps: Creating Spec, Implement, Accept changes, each with description text | NEW |
| `WorkflowStepItem` | Single step in the guided workflow with status indicator (green dot = active, circle = pending), title, and description | NEW |
| `ContextChip` | Inline chip displaying a context file reference (e.g., "# Kata Cloud (Kata V2)", "## Context...") within the conversation | NEW |

## States

### Initial State (Mock 04)

- **Trigger:** User opens or creates a Coordinator session and submits a prompt. The orchestrator begins processing.
- **Layout:** Three-column layout. Left sidebar (~180px) with Agents and Context sections. Center conversation panel (~55% width). Right panel (~30% width) split between a compact spec area at top and the guided workflow stepper below.
- **Content:**
  - Left sidebar: "Agents" heading with description "Agents write code, maintain notes, and coordinate tasks." followed by "+ Create new agent" link. One agent listed: "Coordinator" with green icon and truncated prompt preview "I would like to build the f...". Below, "Context" section with description "Context about the task, shared with all agents on demand. Your notes live in /following.build/.workspace." and items: "+ Add context", "Spec".
  - Center panel: User message card showing the submitted prompt text ("I would like to build the following product for which I have created an overview document. We are starting with documentation and building the product from the visio This is an overview of the product I want to build:"). Below the message: "Thinking" status with animated indicator.
  - Right panel top: Empty spec area or breadcrumb "NOTES / Spec".
  - Right panel body: Guided workflow stepper with three steps:
    1. "Creating Spec" (green active dot) -- "The Coordinator is analyzing your codebase to work out the work. Once it is done, you can make edits or iterate with agents, and it will start to scaffold."  Includes a link: "Want to take over? Use the Coordinator to edit manually."
    2. "Implement" (inactive circle) -- "Once you're happy with the plan, ask the Coordinator to start implementing. Independent tasks run in parallel, dependent tasks may wait."  Additional text: "You can also write code yourself from the Files tab, in new or in your usual IDE."
    3. "Accept changes" (inactive circle) -- "Accept or reject the changes in the Changes tab, or by running from the terminal or pasting around in a browser panel." Additional text: "Stage, commit, create a PR, or push merge to fit your workflow."
  - Bottom input bar: placeholder "Ask anything or type @ for context" with model selector "GPT-5.3 Codex" and action icons (attachment, expand, send).

### Pasted Context (Mock 05)

- **Trigger:** User pastes a large block of text (e.g., 205 lines) into the prompt input and submits it.
- **Layout:** Same three-column layout. Left sidebar visible. Center panel expanded. Right panel shows "NOTES / Spec" breadcrumb with spec empty state.
- **Content:**
  - Left sidebar: Same as Initial State. Agent "Coordinator" is listed with preview "I would like to build the f...".
  - Center panel: User message card with "Just now" timestamp. Message text shows the prompt. Below the text: a "Pasted 205 lines" badge with expand/collapse indicators (two brackets icon, number, and arrows). Below the message card: "GPT-5.3 Codex" model label with settings icon, and action icons (attachment, expand, send). Below: "Stopped" status with gray dot indicator.
  - Right panel: "NOTES / Spec" breadcrumb at top. Body shows empty-state text: "Start drafting a specification for what you want to build. Or brainstorm with an agent" with a cursor indicator.
  - Bottom: Second input bar identical to the first, with "Ask anything or type @ for context" placeholder.
- **Interactive elements:** The "Pasted 205 lines" badge has expand/collapse controls. The message card has an "x" dismiss button at top-right.

### Spec Context Reading (Mock 06)

- **Trigger:** The coordinator begins reading workspace context files after the user submits a prompt.
- **Layout:** Same three-column layout. Left sidebar, center conversation panel, right guided workflow panel.
- **Content:**
  - Left sidebar: Same agent and context listing.
  - Center panel: User message at top (same prompt text). Below: two context chips displayed as dark pills showing file references being read -- "# Kata Cloud (Kata V2)" and "## Context..." indicating the coordinator is consuming the pasted overview document and workspace context. Below: "Thinking" status with animated indicator.
  - Right panel: Same guided workflow stepper as Initial State. "Creating Spec" step remains active (green dot).
- **Interactive elements:** Same input bar at bottom. Context chips are non-interactive display elements.

### Spec Analyzing (Mock 07)

- **Trigger:** The coordinator transitions from reading context to analyzing the notebook/document content.
- **Layout:** Same three-column layout. The center panel now shows a more compact message representation.
- **Content:**
  - Left sidebar: Same agent and context listing.
  - Center panel: User message is collapsed/compacted, showing a summary line ("I would like to build the following product for which I have created an overview document.") with a "Pasted content text" indicator and "2 notes context text" reference. Below: "Thinking" status with animated indicator.
  - Right panel: Same guided workflow stepper. "Creating Spec" step remains active.
- **Interactive elements:** Same input bar at bottom. The compacted message may have an expand control.

## Data Dependencies

| Data | Source | Type |
|------|--------|------|
| Space name | `AppState.spaces[activeSpaceId].name` | `string` |
| Space root path | `AppState.spaces[activeSpaceId].rootPath` | `string` |
| Active session label | `AppState.sessions[activeSessionId].label` | `string` |
| Session context provider | `SessionRecord.contextProvider` | `ContextProviderId \| undefined` |
| Orchestrator run status | `OrchestratorRunRecord.status` | `OrchestratorRunStatus` |
| Orchestrator run prompt | `OrchestratorRunRecord.prompt` | `string` |
| Context snippets | `OrchestratorRunRecord.contextSnippets` | `ContextSnippet[]` |
| Spec draft content | `OrchestratorRunRecord.draft` | `OrchestratorSpecDraft \| undefined` |
| Draft applied timestamp | `OrchestratorRunRecord.draftAppliedAt` | `string \| undefined` |
| Run status timeline | `OrchestratorRunRecord.statusTimeline` | `OrchestratorRunStatus[]` |
| Delegated tasks | `OrchestratorRunRecord.delegatedTasks` | `OrchestratorDelegatedTaskRecord[]` |
| Spec note document | `localStorage` via `loadSpecNote()` | `SpecNoteDocument` |
| Active model | Provider runtime selection | `ProviderModelDescriptor` |
| Agent list | Session-scoped agent registry | NEW (not in `AppState`) |
| Context items | `ContextSnippet[]` from `kataShell.retrieveContext()` | `ContextRetrievalResult` |

## Interactions

| Action | Trigger | Effect | IPC Channel |
|--------|---------|--------|-------------|
| Submit prompt | User types in `MessageInputBar` and clicks send or presses Enter | Creates new `OrchestratorRunRecord` with status "queued", transitions to "running", triggers context retrieval and spec generation | `kata-cloud/context:retrieve`, `kata-cloud/provider:execute` |
| Paste content | User pastes text into `MessageInputBar` | Content is attached to the prompt; `PastedContentBadge` displays line count | None (local state) |
| Expand/collapse pasted content | User clicks expand/collapse on `PastedContentBadge` | Toggles visibility of the full pasted text within the message card | None (local state) |
| Select model | User clicks `ModelSelector` dropdown | Changes the active provider and model for subsequent orchestrator runs | `kata-cloud/provider:list-models` |
| Create new agent | User clicks "+ Create new agent" in `LeftSidebar` | Opens agent creation flow | NEW |
| Add context | User clicks "+ Add context" in `ContextSection` | Opens context file picker or manual context entry | NEW |
| Switch tab | User clicks tab in `TabStrip` (e.g., "Coordinator", "Spec") | Switches the center panel between conversation view and spec editor | Mapped to `NavigationView` via `persistState` |
| Create new tab | User clicks "+" in `TabStrip` | Opens new-tab dropdown (New Agent, New Note, New Terminal, New Browser) | NEW |
| Edit spec | User types in the `SpecPanel` textarea | Autosaves spec content to localStorage via `saveSpecNote()` | None (localStorage) |
| Apply draft to spec | User clicks "Apply Draft to Spec" in `SpecPanel` when orchestrator draft is available | Replaces spec content with `OrchestratorSpecDraft.content`, persists via `saveSpecNote()`, calls `onApplyDraftResult` | None (localStorage + state callback) |
| Dismiss message | User clicks "x" on a `UserMessage` card | Removes or collapses the message from the conversation view | None (local state) |
| Use @ mention | User types "@" in `MessageInputBar` | Opens context autocomplete dropdown showing available context sources | NEW |
| Click workflow link | User clicks "Use the Coordinator" link in workflow step | Switches focus to the spec editor or coordinator conversation | None (view toggle) |

## Visual Specifications

### Color Tokens

| Token | Usage | Approximate Hex |
|-------|-------|-----------------|
| Background (app) | Main window background | `#0f1116` |
| Background (sidebar) | Left sidebar background | `#141923` |
| Background (panel) | Center and right panels | `#141923` / `rgba(20, 25, 35, 0.9)` |
| Background (message card) | User message bubble | `#1a2333` |
| Background (input bar) | Message input area | `#1a2333` |
| Background (context chip) | Dark pill for context references | `#1e2736` |
| Border (panel) | Panel and card borders | `#2a3347` |
| Border (active tab) | Active tab highlight | `#60d394` (green) |
| Text (primary) | Body text, message content | `#dbe2ee` |
| Text (muted) | Descriptions, timestamps, placeholders | `#9aaccc` |
| Text (link) | Clickable links in workflow steps | `#55b5ff` |
| Accent (active status) | Green dot for "Creating Spec" active state | `#60d394` |
| Accent (thinking indicator) | Animated thinking dot | `#60d394` |
| Accent (stopped indicator) | Gray dot for "Stopped" status | `#6b7a94` |
| Badge background | "Pasted 205 lines" badge | `#252d3d` |
| Send button | Send icon in input bar | `#60d394` |

### Typography

| Element | Size | Weight | Style |
|---------|------|--------|-------|
| Space name (header) | ~13px | 600 (semibold) | Normal |
| Tab labels | ~13px | 400 (regular) | Normal |
| Sidebar section headings ("Agents", "Context") | ~13px | 600 (semibold) | Normal |
| Sidebar description text | ~12px | 400 (regular) | Normal, muted color |
| Agent name in list | ~13px | 500 (medium) | Normal |
| Agent preview text | ~12px | 400 (regular) | Normal, muted, truncated with ellipsis |
| Message body text | ~14px | 400 (regular) | Normal |
| Timestamp ("Just now") | ~12px | 400 (regular) | Normal, muted |
| Pasted content badge | ~12px | 500 (medium) | Normal |
| Model selector label | ~12px | 400 (regular) | Normal |
| Input placeholder | ~14px | 400 (regular) | Normal, muted |
| Workflow step title | ~14px | 600 (semibold) | Normal |
| Workflow step description | ~13px | 400 (regular) | Normal, muted |
| "NOTES / Spec" breadcrumb | ~12px | 400 (regular) | Uppercase for "NOTES", normal for "Spec" |
| Spec empty-state text | ~14px | 400 (regular) | Normal, muted |

### Spacing & Layout

| Aspect | Value |
|--------|-------|
| Overall layout | Three-column CSS grid; left sidebar fixed ~180px, center panel flexible ~55%, right panel ~30% |
| Left sidebar padding | ~12px horizontal, ~8px vertical between sections |
| Tab strip height | ~36px |
| Tab strip gap between tabs | ~4px |
| Message card padding | ~16px |
| Message card border-radius | ~8px |
| Message card margin-bottom | ~12px |
| Context chip padding | ~4px 10px |
| Context chip border-radius | ~6px |
| Input bar height | ~48px (single line), expandable |
| Input bar padding | ~12px 16px |
| Input bar bottom margin | ~16px from viewport bottom |
| Right panel padding | ~16px |
| Workflow step vertical gap | ~24px |
| Workflow step indicator size | ~10px diameter circle |
| Workflow step connector line | 1px solid muted, vertical between steps |
| Panel border-radius | 12px |
| Panel border width | 1px |

## Implementation Gap Analysis

| Feature | Mock Shows | Current Code | Gap |
|---------|-----------|--------------|-----|
| Three-column layout | Left sidebar + center conversation + right spec/workflow | Three-panel grid (Explorer, Orchestrator, Spec/Changes/Browser) in `src/main.tsx` line 1277. Columns are `minmax(250px, 1fr) minmax(360px, 1.4fr) minmax(320px, 1.25fr)`. | Layout structure exists but column semantics differ. Current left panel is Explorer (spaces/sessions), not an agent/context sidebar. Needs restructuring to match mock. |
| Agent sidebar | Named agent list with icons, "+ Create new agent" action | No agent registry or agent list component exists. Sessions are listed in the Explorer panel (lines 1304-1321). | Agent model, agent list UI, and agent CRUD operations are entirely missing. `SessionRecord` does not carry agent metadata. |
| Context sidebar section | "Context" heading, description, "+ Add context", item list | Context retrieval exists (`kataShell.retrieveContext`, `src/context/`), but no sidebar UI for browsing or adding context items. | Context management sidebar UI is missing. Current context is retrieved programmatically during orchestrator runs, not user-browsable. |
| Conversation message history | Timestamped user message cards with coordinator responses | Current orchestrator panel shows run status as flat `info-card` blocks (lines 1553-1688). No message-bubble conversation UI. | Conversation-style rendering is missing. Current UI is a status dashboard, not a chat-like message thread. |
| Pasted content badge | "Pasted 205 lines" with expand/collapse | No paste detection or badge component. Prompt is a plain `<textarea>` (line 1440). | Paste detection, line counting, and collapsible badge are missing. |
| Model selector | "GPT-5.3 Codex" dropdown with settings icon | Provider runtime types exist (`src/main/provider-runtime/types.ts`). IPC channels for `providerListModels` and `providerExecute` are defined. No model selection UI in renderer. | Model selector dropdown component is missing from the renderer. Backend IPC is wired but no frontend picker exists. |
| Message input bar | Bottom-anchored with "@" mention, attachment, expand, send icons | Current prompt input is a `<textarea>` with id "space-prompt-input" inside the orchestrator panel body (line 1440). No bottom-anchoring, no attachment or mention features. | Input bar needs redesign: bottom-anchored, with "@" mention autocomplete, attachment button, expand control, send button, and model selector. |
| Tab strip | "Coordinator x" tab with "+" new-tab button, "Spec +" on right | Current navigation is a horizontal button row in the header (`view-nav`, lines 1258-1269) with text labels: Explorer, Orchestrator, Spec, Changes, Browser. | Tab strip needs redesign to show session-scoped tabs with close buttons and new-tab dropdown. Current nav is app-level view switching, not session tab management. |
| Guided workflow stepper | Three-step vertical stepper (Creating Spec, Implement, Accept changes) | No workflow stepper component exists. Run lifecycle is displayed as text (lines 1563-1626). | Guided workflow stepper is entirely missing. Needs new component with step definitions, status indicators, and descriptive text. |
| Coordinator status indicator | "Thinking" with animated dot, "Stopped" with gray dot | Run status is rendered as text: "Run X is Running/Completed/Failed" (line 1565). No animated indicator. | Status badge component with animated thinking indicator is missing. |
| Spec empty state | "Start drafting a specification..." placeholder with cursor | `SpecNotePanel` renders a `<textarea>` for spec content and a preview section. No styled empty-state placeholder. | Empty-state presentation in the spec panel needs a styled placeholder message. |
| Spec breadcrumb | "NOTES / Spec" at top of right panel | `SpecNotePanel` has header "Spec Note" (line 217). No "NOTES / Spec" breadcrumb navigation. | Breadcrumb navigation component for the right panel is missing. |
| Context chips in conversation | Dark pills showing context file references being read | Context snippets are displayed as text in `contextPreview` (line 1581). No chip/pill rendering. | Context chip component for inline conversation display is missing. |
| Collapsible message | Mock 07 shows compacted message with summary | Messages are rendered at full length. No collapse/expand behavior. | Message collapse/expand with summary view is missing. |
| Sidebar icon row | 5 small icons at sidebar top for mode switching | No sidebar mode switching exists. | Sidebar navigation icons are missing. |
| Search in header | Search field in the top bar | No search field in the header. Current header shows "Kata Cloud" title and view nav. | Header search is missing. |
| "x" dismiss on message card | Close button on user message | No dismiss interaction on messages. | Message dismiss functionality is missing. |
