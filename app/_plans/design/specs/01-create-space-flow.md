# Create Space Flow

> Mocks: `01-create-space-modal-empty.png`, `02-create-space-modal-with-spaces.png`, `03-coordinator-new-tab-dropdown.png`

## Overview

The Create Space flow lets users define a new workspace by entering a project prompt, selecting an orchestration mode (team or single agent), choosing a repo and branch, and submitting the space. The flow presents as a centered modal-style panel on a dark background. When existing spaces are present, they appear in a sidebar list to the right. A secondary flow shown in mock 03 provides a tab-level dropdown for spawning new agents, notes, terminals, or browsers within an active Coordinator session.

## Component Inventory

| Component | Description | Source File |
|-----------|-------------|-------------|
| CreateSpaceModal | Full-screen centered modal containing prompt textarea, repo/branch selector, orchestration mode cards, and "Create space" button | `src/main.tsx` (lines 1431-1551), `src/space/create-space-flow.tsx` |
| PromptTextarea | Multi-line text input for describing the project goal; includes toolbar row with "Add context" and attachment icons | `src/main.tsx` (lines 1438-1445) |
| ContextToolbar | Row below textarea with "+ Add context" link and icon buttons (globe, clock, chart) | NEW |
| RepoSelector | Inline display showing repo name, branch, and connection status (e.g., "Work on kata-cloud off main") | NEW |
| CreateSpaceButton | Green pill button labeled "Create space" with right arrow icon | `src/main.tsx` (line 1448-1450) |
| OrchestrationModeCard | Card selecting orchestration mode: "Team orchestration" (with agent icons) or "Start with single agent > Developer" | NEW |
| SetupOptionsBar | Bottom bar with "Set up the environment with", "Copy config files only", "script", and "Rapid fire mode" toggle | NEW |
| SpaceListSidebar | Right-side panel listing existing spaces grouped by repo, with filter controls | NEW |
| SpaceListItem | Single row in the sidebar showing space name with status indicators and elapsed time | NEW |
| SpaceListControls | Top-right toolbar with "GROUPED BY REPO", "SHOW ARCHIVED", and search icon | NEW |
| CoordinatorTabBar | Tab strip at top of Coordinator view with tab names and "+" button | NEW |
| NewTabDropdown | Dropdown from "+" button listing: New Agent, New Note, New Terminal, New Browser | NEW |

## States

### Empty State (Mock 01)

- **Trigger:** User opens the app with no previously created spaces, or clicks to start a new space from a fresh session.
- **Layout:** Centered modal occupying roughly 60% of viewport width. Dark background (#0f1116) fills the remainder. No sidebar panel visible.
- **Content:**
  - Heading: "Let's get building!" in white bold text, top-left of modal.
  - Dismiss button: small "x" icon top-right of the heading row.
  - Prompt textarea: dark input (#1a1d24 approximate) with sample text visible ("I would like to build the following product for which I have created an overview document. We are starting with documentation and building the product from the visio This is an overview of the product I want to build."). Resize handle at bottom-right.
  - Context toolbar: "+ Add context" text link, followed by globe icon, clock icon, chart icon, and a pin/attachment icon at far right of the row.
  - Repo selector row: checkbox icon, "Work on", bold "kata-cloud", "off", bold "main". Positioned left-aligned below textarea.
  - Create space button: green background (#4CAF50 approximate), white text "Create space" with right arrow, right-aligned on same row as repo selector.
  - Orchestration mode section: two side-by-side cards below the repo/button row.
    - Left card ("Team orchestration"): bordered card with colored agent icons (blue, orange, green), description text "Have a Coordinator plan, delegate, and orchestrate the work. Work from a Spec to help with larger or more complex tasks.", and "using GPT-5.3 Codex" label at bottom. This card appears selected (brighter border).
    - Right card ("Start with single agent"): shows "Developer" with subtitle "Plans then implements itself", and helper text "Your workspace will kick off with a new Developer agent." This card appears unselected (dimmer).
  - Setup bar at bottom: "Set up the environment with" text, underlined "Copy config files only" link, "script" text, and "Rapid fire mode" checkbox on the right.
- **Interactive elements:**
  - Prompt textarea: editable multi-line input
  - "x" dismiss button: closes the modal
  - "+ Add context" link: opens context attachment flow
  - Icon buttons (globe, clock, chart, pin): context attachment actions
  - Repo selector: clickable to change repo/branch
  - "Create space" button: submits space creation
  - Team orchestration card: selects team mode
  - Developer card: selects single-agent mode
  - "Copy config files only" link: toggles environment setup mode
  - "Rapid fire mode" checkbox: toggles rapid fire setting

### With Existing Spaces (Mock 02)

- **Trigger:** User opens the Create Space flow when one or more spaces already exist in AppState.
- **Layout:** Two-column layout. Left column (~40% width) contains the same modal content as the empty state. Right column (~55% width) shows the space list sidebar. The modal content shifts left to accommodate the sidebar.
- **Content:**
  - Left column: identical to empty state except the prompt textarea shows placeholder text ("What would you like to work on? Describe your goal or leave blank to start an empty space.") and the repo selector shows a green dot indicator after "main".
  - Right column (SpaceListSidebar):
    - Top toolbar: "GROUPED BY REPO" button (with grid icon), "SHOW ARCHIVED" button (with clock icon), magnifying glass search icon. All in uppercase muted text with pill-style borders.
    - Repo group header: GitHub icon followed by "gannonh/kata-cloud" in white text, with "+" button at far right.
    - Space list item: blue status dot, "Unblock Wave 1 verification" label, right-side metadata showing icons and "2h" elapsed time indicator.
- **Interactive elements:**
  - All controls from empty state remain active.
  - "GROUPED BY REPO" button: toggles grouping mode
  - "SHOW ARCHIVED" button: toggles archived space visibility
  - Search icon: opens space search/filter
  - "+" button on repo header: creates a new space under that repo
  - Space list item: clickable to open/resume that space
  - Status icons on space items: indicate space state (running, paused, etc.)

### Coordinator New Tab Dropdown (Mock 03)

- **Trigger:** User clicks the "+" button in the tab bar of an active Coordinator session.
- **Layout:** Small dropdown menu appears anchored below and slightly right of the "+" button. Overlays the Coordinator content area.
- **Content:**
  - Tab bar: shows "Wave 1.1 Coo..." tab with close "x", followed by the "+" button (blue circle outline).
  - Breadcrumb: "AGENTS / Wave 1.1 Coor..." with formatting controls (Aa, copy, trash icons) at right.
  - Dropdown menu items (each with an icon prefix):
    - Chat bubble icon + "New Agent"
    - Document icon + "New Note"
    - Terminal icon + "New Terminal"
    - Globe icon + "New Browser"
  - Background: Coordinator session content visible behind the dropdown, showing git commit hashes and task status text.
- **Interactive elements:**
  - "+" button: opens/closes the dropdown
  - "New Agent" menu item: spawns a new agent tab
  - "New Note" menu item: creates a new note tab
  - "New Terminal" menu item: opens a terminal tab
  - "New Browser" menu item: opens a browser tab
  - Tab close "x": closes the active tab

## Data Dependencies

| Data | Source | Type |
|------|--------|------|
| Existing spaces list | `AppState.spaces` | `SpaceRecord[]` |
| Active space ID | `AppState.activeSpaceId` | `string` |
| Space name (draft) | Local component state `spaceDraft.name` | `string` |
| Workspace root path (draft) | Local component state `spaceDraft.path` | `string` |
| Repo link (draft) | Local component state `spaceDraft.repo` | `string` |
| Description (draft) | Local component state `spaceDraft.description` | `string` |
| Tags (draft) | Local component state `spaceDraft.tags` | `string` |
| Project prompt | Local component state `spacePrompt` | `string` |
| Validation errors | Local component state `spaceErrors` | `SpaceValidationErrors` |
| Suggested space name | Derived via `suggestSpaceNameFromPrompt(prompt)` | `string` |
| Git lifecycle status | `SpaceRecord.gitStatus` | `SpaceGitLifecycleStatus \| undefined` |
| Repo URL | `SpaceRecord.repoUrl` | `string \| undefined` |
| Sessions for active space | Filtered from `AppState.sessions` by `spaceId` | `SessionRecord[]` |
| Orchestration mode | Not yet in AppState | NEW (e.g., `"team" \| "single"`) |
| Rapid fire mode flag | Not yet in AppState | NEW (`boolean`) |
| Environment setup mode | Not yet in AppState | NEW (e.g., `"copy-config" \| "script"`) |

## Interactions

| Action | Trigger | Effect | IPC Channel |
|--------|---------|--------|-------------|
| Open create space form | Click "Create space" button or navigate to empty state | Sets `isCreateSpaceOpen = true`, auto-populates `spaceDraft.name` from prompt via `suggestSpaceNameFromPrompt()` | None (local state) |
| Close create space form | Click "x" dismiss button or Cancel | Sets `isCreateSpaceOpen = false`, clears `spaceErrors` | None (local state) |
| Edit prompt text | Type in prompt textarea | Updates `spacePrompt` state | None (local state) |
| Edit space draft fields | Type in name/path/repo/description/tags inputs | Updates corresponding field in `spaceDraft` state | None (local state) |
| Submit new space | Click "Create space" (green button) | Validates via `validateCreateSpaceInput()`, creates `SpaceRecord` + `SessionRecord`, persists to state, sets new space as active, switches view to orchestrator | `kata-cloud/state:save` |
| Select existing space | Click a space row in SpaceListSidebar | Sets `activeSpaceId`, triggers git initialization for that space | `kata-cloud/state:save`, `kata-cloud/space-git:initialize` |
| Select orchestration mode | Click Team orchestration or Developer card | Sets orchestration mode (not yet implemented) | None (local state) |
| Toggle rapid fire mode | Click "Rapid fire mode" checkbox | Toggles rapid fire flag (not yet implemented) | None (local state) |
| Switch repo/branch | Click repo selector row | Opens repo/branch picker (not yet implemented) | None |
| Add context | Click "+ Add context" or icon buttons | Opens context attachment flow (not yet implemented) | `kata-cloud/context:retrieve` |
| Open new tab dropdown | Click "+" in Coordinator tab bar | Shows dropdown with New Agent, New Note, New Terminal, New Browser | None (local state) |
| Spawn new agent | Click "New Agent" in dropdown | Creates new agent tab in Coordinator session | Not yet defined |
| Create new note | Click "New Note" in dropdown | Opens new note editor tab | Not yet defined |
| Open terminal | Click "New Terminal" in dropdown | Opens integrated terminal tab | Not yet defined |
| Open browser | Click "New Browser" in dropdown | Opens embedded browser tab | Not yet defined |
| Filter spaces | Click "GROUPED BY REPO" or "SHOW ARCHIVED" | Toggles space list display mode | None (local state) |
| Search spaces | Click search icon | Opens search/filter input in sidebar | None (local state) |

## Visual Specifications

### Color Tokens

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#0f1116` | Full-window background |
| Background accent | `#1a1d24` | Textarea background, input fields |
| Card background | `#1b222f` | Orchestration mode cards, space list items |
| Card border | `#2a3347` | Default border for cards, inputs, panels |
| Card border active | `#3a4a5e` | Selected orchestration card border |
| Primary text | `#dbe2ee` | Headings, body text |
| Muted text | `#9aaccc` | Placeholder text, secondary labels, metadata |
| Green primary | `#4caf50` | "Create space" button background |
| Green text | `#ffffff` | "Create space" button text |
| Green dot | `#60d394` | Branch status indicator dot |
| Blue accent | `#3b82f6` | Agent icon, "+" tab button outline, space status dot |
| Orange accent | `#f59e0b` | Agent icon (team orchestration) |
| Green accent | `#22c55e` | Agent icon (team orchestration) |
| Error text | `#ff948f` | Validation error messages |
| Link/underline | `#9aaccc` | "Copy config files only" underlined link |

### Typography

| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| Modal heading ("Let's get building!") | ~20px / 1.25rem | 700 (bold) | White |
| Prompt textarea text | ~14px / 0.875rem | 400 | Primary text color |
| Prompt placeholder | ~14px / 0.875rem | 400 | Muted text color |
| Context toolbar links | ~13px / 0.8rem | 400 | Muted |
| Repo selector text | ~13px / 0.8rem | 400/600 | "kata-cloud" and "main" are bold |
| Create space button | ~13px / 0.8rem | 600 | White on green |
| Card title ("Team orchestration") | ~14px / 0.875rem | 600 | White |
| Card body text | ~12px / 0.75rem | 400 | Muted |
| Card model label ("using GPT-5.3 Codex") | ~11px / 0.7rem | 400 | Muted |
| Sidebar controls ("GROUPED BY REPO") | ~11px / 0.7rem | 500 | Uppercase, muted |
| Sidebar repo header | ~13px / 0.8rem | 500 | White |
| Sidebar space name | ~13px / 0.8rem | 400 | White |
| Setup bar text | ~12px / 0.75rem | 400 | Muted |
| Dropdown menu items | ~13px / 0.8rem | 400 | White |

### Spacing & Layout

| Property | Value | Notes |
|----------|-------|-------|
| Modal max-width | ~660px | Centered horizontally in empty state |
| Modal vertical position | ~30% from top | Visually centered upper-third |
| Modal internal padding | ~24px / 1.5rem | All sides |
| Textarea height | ~120px | Multi-line, resizable |
| Gap between textarea and context toolbar | ~8px / 0.5rem | |
| Gap between context toolbar and repo row | ~12px / 0.75rem | |
| Gap between repo row and mode cards | ~16px / 1rem | |
| Mode card padding | ~16px / 1rem | Internal padding |
| Mode card gap (between cards) | ~16px / 1rem | Horizontal |
| Gap between mode cards and setup bar | ~20px / 1.25rem | |
| Sidebar width (with-spaces state) | ~45% of viewport | Right column |
| Sidebar item padding | ~10px / 0.625rem | Vertical |
| Sidebar item gap | ~2px | Between items |
| Dropdown menu padding | ~8px / 0.5rem | Internal |
| Dropdown item padding | ~8px 12px | Per item |
| Dropdown item gap | ~4px | Between items |
| Tab bar height | ~36px | |
| "+" button diameter | ~24px | Circular |

## Implementation Gap Analysis

| Feature | Mock Shows | Current Code | Gap |
|---------|-----------|--------------|-----|
| Modal layout | Centered modal overlay on dark background | Panel-based grid layout in `src/main.tsx` (line 1277) | Current implementation uses a side-by-side panel grid. Mocks show a centered modal. Requires a new modal/overlay container component. |
| Heading text | "Let's get building!" | "Space Creation" in `create-space-flow.tsx` (line 81), "Orchestrator" in `main.tsx` (line 1433) | Heading text and positioning differ from mock. |
| Prompt placeholder | "What would you like to work on? Describe your goal or leave blank to start an empty space." | "Describe your project and use it to bootstrap a new space..." in `main.tsx` (line 1444) | Placeholder text differs. |
| Context toolbar | "+ Add context" with globe/clock/chart/pin icons | Not implemented | No context attachment toolbar exists. The `retrieveContext` IPC channel exists (`shell-api.ts` line 41) but has no UI entry point in the create flow. |
| Repo/branch selector | Inline "Work on kata-cloud off main" with checkbox icon | Not implemented in create flow | Current code stores `repoUrl` on `SpaceRecord` (line 51 of `state.ts`) but has no inline repo/branch selector UI. |
| Create space button style | Green filled button with arrow icon | `pill-button` class in `main.tsx` (line 1448) | Current button uses transparent bordered pill style. Mock shows filled green with arrow icon. |
| Orchestration mode cards | "Team orchestration" and "Developer" side-by-side cards with agent icons | Not implemented | No orchestration mode selection exists. `SpaceRecord` and `CreateSpaceInput` have no mode field. |
| Agent icons | Colored icon set (blue, orange, green) on team card | Not implemented | No agent icon components exist. |
| Model selector | "using GPT-5.3 Codex" on team card | Not implemented | No model selection is part of space creation. Provider resolution is handled separately in `src/main/provider-runtime/`. |
| Setup options bar | "Set up the environment with", "Copy config files only", "script", "Rapid fire mode" | Not implemented | No environment setup configuration exists in space creation. |
| Space list sidebar | Right panel with repo-grouped spaces, filter controls, status indicators | Explorer panel in `main.tsx` (lines 1278-1301) shows a flat list of space cards | Current list is a flat vertical list in the Explorer panel. Mock shows a grouped sidebar with different layout, status icons, elapsed time, and filter controls. |
| Space grouping by repo | "GROUPED BY REPO" toggle | Not implemented | Spaces are rendered flat. No grouping logic exists. |
| Archived spaces filter | "SHOW ARCHIVED" toggle | Not implemented | No archive flag on `SpaceRecord`. |
| Space search | Search icon in sidebar | Not implemented | No search/filter for spaces. |
| Space status indicators | Blue dot, elapsed time "2h", metadata icons | `toSpaceGitUiState()` provides git status text | Current implementation shows text-based git status. Mock shows icon-based status with elapsed time. |
| Coordinator tab bar | Tabbed interface with "+" button | Not implemented | Current UI has a view-nav bar (`main.tsx` line 1258) but no tabbed session interface. |
| New tab dropdown | Dropdown with New Agent, New Note, New Terminal, New Browser | Not implemented | No dropdown or tab-spawning mechanism exists. |
| Dismiss button ("x") | Top-right of modal heading | `onCancelCreateSpaceForm` callback exists (`main.tsx` line 1068) | Cancel exists as a pill button inside the form. Mock places dismiss as an "x" icon at the heading level. |
| SpaceMetadata vs SpaceRecord | Mock uses create flow to produce a space | `SpaceMetadata` in `src/space/types.ts` differs from `SpaceRecord` in `src/shared/state.ts` | Two parallel type systems exist. `SpaceMetadata` uses `path`/`repo`; `SpaceRecord` uses `rootPath`/`repoUrl`. The `toSpaceMetadata()` adapter in `main.tsx` (line 204) bridges them. This dual-type setup adds maintenance cost. |
| Validation fields | Mock shows name/path are derived from prompt + repo selector | `validateCreateSpaceInput()` in `validation.ts` validates name, path, repo | Current validation requires explicit name and path input. Mock suggests these are auto-derived from the repo selector and prompt, with the detailed form fields hidden. |
| Form fields visibility | Mock hides name/path/description/tags/repo fields behind the repo selector and prompt | Form fields are explicitly shown when `isCreateSpaceOpen` is true (`main.tsx` lines 1463-1550) | Current code shows a full metadata form. Mock presents a streamlined single-step flow where repo selection and prompt are the primary inputs. |
