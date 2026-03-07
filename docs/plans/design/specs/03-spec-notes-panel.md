# Spec & Notes Panel

> Mocks: `08-spec-panel-overview-initial.png`, `09-spec-panel-goal-and-tasks.png`

## Overview

The Spec & Notes Panel is the right-most column in the three-panel layout. It serves as the project's editable source of truth: a Markdown document where users define goals, tasks, acceptance criteria, assumptions, and verification plans. The panel includes autosave, an orchestrator draft-apply workflow, threaded comment collaboration, and task block parsing that syncs checkbox state with structured `SpecTaskRecord` entries. It also provides spec context to the PR draft generation flow.

## Component Inventory

| Component | Description | Source File |
|-----------|-------------|-------------|
| `SpecNotePanel` | Root component for the spec panel. Manages the spec document, autosave, draft apply, comment threads, and reply forms. | `src/features/spec-panel/spec-note-panel.tsx` (L25-323) |
| `SpecNotePanel` (re-export shim) | Barrel re-export from `src/notes/` pointing to `src/features/spec-panel/`. | `src/notes/spec-note-panel.tsx` (L1) |
| Panel header (`Spec`) | Outer panel chrome with title "Spec" and subtitle "Project source of truth and collaboration". Rendered by `App` in `main.tsx`, not by `SpecNotePanel` itself. | `src/main.tsx` (L1699-1713) |
| Orchestrator Draft Card | Conditional `info-card` section showing run ID, generation timestamp, apply status, and "Apply Draft to Spec" button. Appears when `draftArtifact` prop is non-null. | `src/features/spec-panel/spec-note-panel.tsx` (L227-243) |
| Spec Markdown Editor | `<textarea>` bound to `note.content` with debounced autosave. Monospace font, 14 rows minimum height. | `src/features/spec-panel/spec-note-panel.tsx` (L245-260) |
| Spec Preview | Read-only `<pre>` block rendering `note.content` as raw text. | `src/features/spec-panel/spec-note-panel.tsx` (L262-265) |
| Meta Status Bar | Row displaying autosave status, thread count, and comment count. | `src/features/spec-panel/spec-note-panel.tsx` (L221-225) |
| New Thread Form | Form with Anchor, Author, and Comment fields plus "Add thread" button. | `src/features/spec-panel/spec-note-panel.tsx` (L269-300) |
| Thread List | Ordered list of threads, each showing anchor heading, timestamp, and nested comment tree. | `src/features/spec-panel/spec-note-panel.tsx` (L302-319) |
| Comment Tree | Recursive `<ul>` rendering `SpecCommentTreeNode` with nested reply forms at each node. | `src/features/spec-panel/spec-note-panel.tsx` (L147-212) |
| Reply Form | Inline form per comment node with Reply author, Reply body, and "Reply" button. | `src/features/spec-panel/spec-note-panel.tsx` (L161-205) |
| Onboarding Steps (right sidebar) | Three-step onboarding guide ("Creating Spec", "Implement", "Accept changes") visible in mock 08. | NEW -- not present in current code |
| Rendered Spec View (Goal + Tasks) | Formatted rendering of spec content with structured sections (Goal, Acceptance Criteria, Non-goals, Assumptions, Verification Plan, Rollback Plan, Tasks). Visible in mock 09. | NEW -- current code shows raw `<pre>` only |
| Task Checkboxes | Interactive checkbox items under the "Tasks" heading in the rendered spec view (mock 09). | NEW -- task rendering exists in store logic (`syncTaskBlocks`) but no rendered checkbox UI |

## States

### Initial / Creating Spec (Mock 08)

- **Trigger:** User navigates to the "Spec" view via the top nav bar while the orchestrator is actively generating spec content. The right panel shows onboarding guidance.
- **Layout:** Three-column grid. Left: Explorer (spaces + sessions). Center: Orchestrator (conversation showing the coordinator agent working). Right: Spec panel, displaying a three-step onboarding sidebar with vertical progress indicators.
- **Content:**
  - Right sidebar contains three steps marked with green circle icons and gray circle icons:
    1. "Creating Spec" (active, green) -- describes that the Coordinator is analyzing the codebase to write the spec. Once done, the user can make edits or iterate with agents.
    2. "Implement" (inactive, gray) -- instructs the user to proceed with implementation, noting the Coordinator breaks it into parallel, sequential tasks.
    3. "Accept changes" (inactive, gray) -- directs the user to review changes in the Changes tab for staging, committing, and PR creation.
  - Each step has a title, a short description paragraph, and a secondary link or instruction line.
  - The center orchestrator panel shows conversation messages from "Kata Cloud Coordinator" describing its analysis of the repository.
- **Interactive elements:**
  - "Run the Coordinator" link (text link inside step 1)
  - View navigation buttons in the top header bar (Explorer, Orchestrator, Spec, Changes, Browser)

### Spec with Structured Content (Mock 09)

- **Trigger:** Orchestrator run has completed and generated a spec draft that has been applied to the spec document. The rendered view replaces the raw preview.
- **Layout:** Three-column grid. Left: Explorer. Center: Orchestrator conversation (same as mock 08). Right: Spec panel showing formatted/rendered spec content with structured sections.
- **Content:**
  - **Goal** section at the top with a short description of the project outcome.
  - **Acceptance Criteria** section with a numbered list of verifiable conditions.
  - **Non-goals** section with a bulleted list of explicit exclusions.
  - **Assumptions** section with bulleted assumptions about the project context, including inline code spans (monospace).
  - **Verification Plan** section with a numbered list of verification steps.
  - **Rollback Plan** section with a numbered list of rollback steps.
  - **Tasks** section at the bottom with checkbox items. Each task is a line item with a checkbox (unchecked in mock 09).
- **Interactive elements:**
  - Task checkboxes (clickable to toggle status)
  - Scroll within the spec panel body

## Data Dependencies

| Data | Source | Type |
|------|--------|------|
| `note.content` | `localStorage` via `loadSpecNote(storage)` | `string` (Markdown) |
| `note.updatedAt` | `localStorage` via `loadSpecNote(storage)` | `string` (ISO 8601) |
| `note.threads` | `localStorage` via `loadSpecNote(storage)` | `SpecCommentThread[]` |
| `note.tasks` | `localStorage` via `loadSpecNote(storage)` (synced from task blocks in content) | `SpecTaskRecord[]` |
| `draftArtifact` | `OrchestratorRunRecord.draft` from `AppState.orchestratorRuns` filtered to active session | `OrchestratorSpecDraft \| undefined` |
| `draftArtifact.runId` | `AppState.orchestratorRuns[n].draft.runId` | `string` |
| `draftArtifact.generatedAt` | `AppState.orchestratorRuns[n].draft.generatedAt` | `string` (ISO 8601) |
| `draftArtifact.content` | `AppState.orchestratorRuns[n].draft.content` | `string` (Markdown) |
| `autosaveStatus` | Local component state, derived from debounce timer | `"Saved" \| "Saving..."` |
| `totalComments` | Computed from `note.threads` via `reduce` | `number` |
| Spec context for PR draft | `loadSpecNote(window.localStorage).content` read at PR generation time | `string` |

Storage key: `kata-cloud.spec-note.v1` (defined in `src/features/spec-panel/store.ts` L10).

## Interactions

| Action | Trigger | Effect | IPC Channel |
|--------|---------|--------|-------------|
| Navigate to Spec view | Click "Spec" in top nav bar | Sets `AppState.activeView` to `"spec"`, focuses right panel | `kata-cloud/state:save` |
| Edit spec markdown | Type in spec textarea | Updates `note.content` in component state, triggers debounced autosave to `localStorage` after 350ms | None (localStorage) |
| Apply orchestrator draft | Click "Apply Draft to Spec" button | Replaces `note.content` with `draftArtifact.content`, saves to `localStorage`, calls `onApplyDraftResult` callback | None (localStorage); parent updates `AppState` via `kata-cloud/state:save` |
| Add comment thread | Submit new thread form | Creates `SpecCommentThread` with root comment, appends to `note.threads`, saves to `localStorage` | None (localStorage) |
| Reply to comment | Submit reply form on a comment node | Creates `SpecComment` with `parentId`, appends to target thread's `comments` array, saves to `localStorage` | None (localStorage) |
| Toggle task checkbox | Click task checkbox in rendered view | Updates `SpecTaskRecord.status` (not_started/in_progress/complete), syncs checkbox marker in markdown content | None (localStorage) -- NEW interaction |
| Generate PR draft (cross-feature) | Click "Generate PR Suggestion" in Changes view | Reads `loadSpecNote(window.localStorage).content` as `specContext` input | `kata-cloud/github:pr-draft` |

## Visual Specifications

### Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0f1116` | Page background |
| `--bg-accent` | `#1a2333` | Radial gradient accent |
| `--panel-bg` | `#141923` | Panel background base |
| `--panel-border` | `#2a3347` | Panel borders, input borders, card borders |
| `--panel-focus` | `#55b5ff` | Active/focused panel border highlight |
| `--text` | `#dbe2ee` | Primary text color |
| `--muted` | `#9aaccc` | Secondary/subtitle text, meta labels |
| `--green` | `#60d394` | Active step indicator (mock 08 onboarding circles), success states |
| `--amber` | `#f2c66d` | Warning/in-progress indicators |

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Panel header title | IBM Plex Sans | 0.95rem | 600 (default bold) |
| Panel header subtitle | IBM Plex Sans | 0.78rem | normal |
| Info card heading | IBM Plex Sans | 0.82rem | 600 |
| Info card body | IBM Plex Sans | 0.79rem | normal |
| Spec markdown editor | IBM Plex Mono / SF Mono / Consolas | 0.8rem | normal |
| Preview text | IBM Plex Mono / SF Mono / Consolas | 0.78rem | normal |
| Meta status labels | IBM Plex Sans | 0.78rem | normal |
| Comment body | IBM Plex Sans | 0.8rem | normal |
| Pill button | IBM Plex Sans | 0.82rem | 600 |
| Onboarding step title (mock 08) | IBM Plex Sans | ~0.88rem | 600 |
| Onboarding step body (mock 08) | IBM Plex Sans | ~0.78rem | normal |
| Rendered spec headings (mock 09) | IBM Plex Sans | ~0.88-0.95rem | 600 |
| Rendered spec body (mock 09) | IBM Plex Sans | ~0.8rem | normal |
| Inline code in rendered spec (mock 09) | IBM Plex Mono | ~0.78rem | normal |

### Spacing & Layout

| Property | Value |
|----------|-------|
| Panel grid columns | `minmax(250px, 1fr) minmax(360px, 1.4fr) minmax(320px, 1.25fr)` |
| Panel grid gap | 0.75rem |
| Panel border-radius | 12px |
| Panel header padding | 0.85rem 0.95rem |
| Panel body padding | 0.95rem |
| Panel body flex gap | 0.75rem |
| Info card padding | 0.75rem 0.8rem |
| Info card border-radius | 10px |
| Spec panel internal gap | 0.75rem |
| Spec editor min-height | 180px |
| Comment thread card padding | 0.65rem |
| Reply form gap | 0.42rem |
| Pill button padding | 0.24rem 0.56rem |
| Pill button border-radius | 999px |
| Responsive breakpoint | 768px (collapses to single column) |

## Spec Content Structure

The rendered spec view (mock 09) displays Markdown content parsed into the following structured sections.

### Goal

Top-level heading. Contains a brief paragraph describing the desired project outcome. In mock 09, this describes producing a document that explains the product, workflow, and core capabilities.

### Acceptance Criteria

Numbered list of verifiable conditions that define "done." Each item is a concrete, testable statement. In mock 09, these reference specific file locations and measurable qualities (e.g., grammar/spelling issues removed, final diff limited to documentation changes).

### Non-goals

Bulleted list of items explicitly excluded from scope. In mock 09, these include application code changes and concerns outside the overview scope.

### Assumptions

Bulleted list of conditions assumed to hold during execution. Items may include inline code spans referencing file paths or branch names. In mock 09, assumptions reference specific repository structure and branch states.

### Verification Plan

Numbered list of ordered verification steps the user or agent will follow to confirm the work is correct. In mock 09, steps include running verification commands, confirming file diffs, and performing manual review.

### Rollback Plan

Numbered list of ordered steps to revert changes if verification fails. In mock 09, steps reference `git restore` commands and content-only rollback procedures.

### Tasks

Checkbox list at the bottom of the spec. Each task is rendered as a clickable checkbox with a title. Tasks are parsed from `@@@task` blocks in the Markdown source and rendered as `- [ ] [Title](intent://local/task/{id})` links. Checkbox state maps to `SpecTaskRecord.status`:
- `[ ]` = `not_started`
- `[/]` = `in_progress` / `waiting` / `discussion_needed` / `review_required`
- `[x]` = `complete`

Task sync logic is in `src/features/spec-panel/store.ts` (L316-382, `syncTaskBlocks`).

## Implementation Gap Analysis

| Feature | Mock Shows | Current Code | Gap |
|---------|-----------|--------------|-----|
| Onboarding sidebar (3-step guide) | Mock 08: vertical stepper with "Creating Spec", "Implement", "Accept changes" steps, green/gray circle indicators, descriptive text per step | Not implemented. No onboarding component exists. | NEW component needed: `SpecOnboardingSidebar` or equivalent. Must track orchestrator run state to determine which step is active. |
| Rendered Markdown view | Mock 09: formatted headings, numbered/bulleted lists, inline code spans, paragraphs for Goal, Acceptance Criteria, Non-goals, Assumptions, Verification Plan, Rollback Plan, Tasks | `spec-note-panel.tsx` L262-265 renders raw `<pre>{note.content}</pre>` with no Markdown parsing | Need Markdown renderer (e.g., `react-markdown` or custom parser) to replace the `<pre>` block. Must handle headings, lists, inline code, and paragraphs. |
| Interactive task checkboxes | Mock 09: checkbox items under "Tasks" heading | Store has full task block parsing and sync (`syncTaskBlocks`, `renderTaskLinkLine` in `store.ts` L316-618), but the UI does not render interactive checkboxes. The `<pre>` tag shows raw markdown checkbox syntax. | Need rendered checkbox elements that call store functions to toggle `SpecTaskRecord.status` and re-sync the markdown content. |
| Conditional view switching (onboarding vs. rendered spec) | Mock 08 shows onboarding when spec is being generated; Mock 09 shows rendered spec after draft is applied | `SpecNotePanel` always shows editor + preview + threads regardless of orchestrator state | Need conditional rendering: show onboarding sidebar when no spec content exists or orchestrator is running; show rendered spec view when content has been applied. |
| Orchestrator step status indicators | Mock 08: green filled circle for active step, gray circles for pending steps | Not implemented | NEW: step status indicator component with active/pending/completed visual states using `--green` token. |
| Editor/Preview toggle or replacement | Mock 09 shows only rendered view (no visible raw editor or preview pane) | Current code always shows both textarea editor and `<pre>` preview | Need either a toggle between edit and rendered modes, or replace the always-visible editor with an edit-on-click or modal editor pattern. |
| Spec content provided to Orchestrator Coordinator | Mock 08: Coordinator agent reads the spec note to draft content | `main.tsx` L731 reads `loadSpecNote(window.localStorage).content` for PR draft generation only | Spec content retrieval for orchestrator run context may need a dedicated read path or the orchestrator already receives it through `specContext` in the prompt flow. Verify orchestrator integration. |
| Inline code rendering | Mock 09: monospace inline code spans within Assumptions section (file paths, branch names) | Raw `<pre>` shows backtick-wrapped text without styling | Markdown renderer must support inline code (`<code>`) with monospace font styling. |
| Section collapse/expand | Not visible in mocks (all sections shown expanded) | Not implemented | Not required based on current mocks. Consider as future enhancement. |
