# Wave Execution

> Mocks: `18-wave1-delegation-started.png` through `25-unblock-wave1-terminal-session.png`

## Overview

Wave Execution displays the orchestrator's coordination of parallel specialist agents executing implementation tasks in waves. The user sees a left-panel agent roster with real-time status indicators, a central chat-style content area showing delegation messages, checkpoint events, merge strategy decisions, architecture decisions, verification results, and remediation actions. When automated remediation fails, the user can open a terminal session to manually unblock the wave.

## Component Inventory

| Component | Description | Source File |
|-----------|-------------|-------------|
| `App` (Orchestrator panel) | Root renderer component; renders orchestrator run status, delegated tasks, and run history in the Orchestrator panel section | `src/main.tsx` (lines 1431-1690) |
| Agent sidebar list | Left-panel roster of specialist agents with status indicators; includes AMP Planning Coordinator, specialist agents per task type, and space-level entries | `src/main.tsx` (lines 1284-1301, current space list; new agent list TBD) |
| Delegated task list | Renders `OrchestratorDelegatedTaskViewModel[]` as inline task items showing type, specialist, status, and lifecycle text | `src/main.tsx` (lines 1583-1600) |
| Run status card | Displays latest run ID, status label, prompt, lifecycle text, context preview, and provenance | `src/main.tsx` (lines 1553-1627) |
| Run history list | Renders prior run view models with delegated tasks, error messages, and context diagnostics | `src/main.tsx` (lines 1634-1688) |
| Spec panel (right) | Displays the generated spec draft (Goal, Tasks, Acceptance Criteria, Verification Plan) from the orchestrator run | `src/notes/spec-note-panel.tsx` via `src/main.tsx` (lines 2102-2107) |
| Terminal session view | Embedded terminal for manual intervention during wave unblock (Mock 25) | Not yet implemented |
| `buildDelegatedTaskTimeline` | Builds the delegation task records for implement/verify/debug task types | `src/shared/orchestrator-delegation.ts` (lines 65-109) |
| `transitionOrchestratorRunStatus` | Enforces run lifecycle state machine transitions | `src/shared/orchestrator-run-lifecycle.ts` (lines 39-85) |
| `projectOrchestratorRunViewModel` | Projects raw run records into display view models with status labels and lifecycle text | `src/shared/orchestrator-run-view-model.ts` (lines 106-142) |

## States

### Delegation Started (Mock 18)
- **Trigger:** User clicks "Run Orchestrator" with a valid prompt; run transitions queued -> running; `buildDelegatedTaskTimeline` dispatches implement/verify/debug tasks.
- **Layout:** Three-panel layout. Left panel: agent sidebar with AMP Planning Coordinator at top, followed by specialist agents grouped by wave (EPOCH-1, listed as expandable items). Center panel: chat-style message stream from the orchestrator coordinator showing delegation decisions, revised scope, agent assignments. Right panel: spec document showing Goal, Tasks (with checkboxes and status indicators), Acceptance Criteria, Verification Plan, Rollback Plan.
- **Content:**
  - Left sidebar shows agents: "AMP Planning Coordinator" (active, leading), followed by specialist entries: "Task Block Parser", "ImplementWorktree Lifecycle", "Space Metadata Integration", "Space Git integration", "Bootstrap Shell Data". Each has a colored status dot (blue = active/running, gray = queued).
  - Center panel shows the coordinator's delegation narrative: revised scope commentary, approval of the plan, agent group assignment (EPOCH-1 group), and individual agent delegation lines with abbreviated IDs.
  - A "Changes" section is visible at the bottom of the left panel listing file diffs.
- **Interactive elements:** Agent items in the left sidebar are clickable (selection behavior). Navigation tabs at top: Agents, Content, Changes, Files.

### Merge Strategy (Mock 19)
- **Trigger:** Coordinator confirms merge strategy after agents begin scaffold creation; follows delegation started state.
- **Layout:** Same three-panel layout as Mock 18.
- **Content:**
  - Center panel shows the coordinator reasoning about merge conflicts, confirming a scaffold-first strategy, declaring "Direction set: release now, do not wait."
  - Coordinator enumerates a 3-step merge policy: (1) baseline via main scaffold, (2) space-agent task resolutions continue with feature-scoped work, (3) any conflicts resolved by re-scope.
  - Agent status updates visible in the left sidebar, with some agents progressing from queued to running.
  - Task assignment list visible at bottom of left panel with status indicators (blue dots for in-progress tasks).
- **Interactive elements:** Same as Mock 18.

### Architecture Decisions (Mock 20)
- **Trigger:** Coordinator propagates architecture decisions mid-wave after reviewing agent progress; at least one agent has progressed beyond initial delegation.
- **Layout:** Same three-panel layout.
- **Content:**
  - Center panel shows coordinator making architectural calls: React/Vite surface choice, updated top-level spec assumptions, new `tsconfig` conventions.
  - Coordinator provides a status snapshot: "Wave 1 is still in progress" with a numbered list of current agent statuses (task done, items remaining, blockers).
  - A "Known blockers" section lists dependency issues still being resolved across agents.
  - Agent sidebar reflects updated statuses with more agents showing active (blue) indicators.
- **Interactive elements:** Same as Mock 18.

### Bootstrap Verification (Mock 21)
- **Trigger:** Coordinator enters verification checkpoint after receiving task completion signals from agents; run approaches terminal state.
- **Layout:** Same three-panel layout. Right panel now shows "Spec > Spec" header, indicating the spec view is active.
- **Content:**
  - Center panel shows coordinator processing verification: received task notes, updated run type to "progress", current Wave 1 gate status with numbered task checklist.
  - Tasks listed with completion markers (checkmarks for done items).
  - Coordinator reasons about scope boundaries ("I'm treating this as a scope boundary issue") and identifies next verification steps.
  - Right panel spec shows tasks with colored status indicators: green checkmarks for completed, orange/yellow circles for in-progress, red for blocked.
- **Interactive elements:** Same navigation tabs. Spec panel tasks have visual status indicators but no direct interaction shown.

### Duplicate Checkpoint (Mock 22)
- **Trigger:** Coordinator detects duplicate checkpoint events from agent reporting; triggers deduplication logic.
- **Layout:** Same three-panel layout.
- **Content:**
  - Center panel shows the coordinator receiving a high-priority collaborative resolution request, taking a "high priority defensive decision on git agent" with option evaluation.
  - Coordinator checks whether the space metadata task has already reached certain milestones, comparing agent progress against current plan expectations.
  - Agent list in left sidebar shows status updates with some tasks completing and new verification checkpoints being tracked.
  - "Current plan" section shows numbered task list with statuses.
- **Interactive elements:** Same as Mock 18.

### Space Git Integration (Mock 23)
- **Trigger:** Space metadata agent completes; coordinator verifies git task integration and checks for duplicate checkpoint events.
- **Layout:** Same three-panel layout.
- **Content:**
  - Center panel shows coordinator verifying space metadata reaching expected milestones, confirming alignment with current plan, then evaluating duplicate checkpoint events.
  - Coordinator creates a completion request to the space task agent, noting "Space is not yet stabilized, so the git integration window cannot open yet."
  - A "There were duplicate checkpoint events from the git task" observation leads to remediation reasoning.
  - Agent sidebar shows some agents completing (indicated by green status), others still running.
- **Interactive elements:** Same as Mock 18.

### Remediation (Mock 24)
- **Trigger:** Coordinator identifies failed or blocked agents; enters remediation mode with retry/re-delegation logic.
- **Layout:** Same three-panel layout. Left sidebar now shows a different agent grouping structure: "Wave 1 Coordinators" section, "EPOCH-1" section with specialist sub-agents, and individual task agents listed below.
- **Content:**
  - Center panel shows coordinator acknowledging remediation option, reverting to a "render-only" mode for a task, applying the correct context for re-delegation.
  - A verification step is shown: coordinator re-running baseline checks after remediation, summarizing output as "I've benchmarked a prior run" with results.
  - Numbered remediation task list with updated status for each agent.
  - Agent sidebar reflects new entries for verification/remediation-specific agents ("Wave1 Verifier", "Wave1 Backup Verify").
- **Interactive elements:** Same navigation tabs. Agent list items are expandable/collapsible.

### Unblock Terminal Session (Mock 25)
- **Trigger:** Automated remediation fails to resolve a blocker; user or coordinator opens a terminal session for manual intervention.
- **Layout:** Distinct from previous mocks. Full application window with: top bar showing "Unblock Wave 1 Verification" title, tab bar with "Commands" and "Terminal" tabs (Terminal is active), left panel showing Snapshot/Content/Changes/Files navigation, center area showing an embedded terminal with a git command prompt.
- **Content:**
  - Terminal shows an active shell session at a kata-cloud repo path with a git checkout command visible.
  - Left panel shows a structured task list under "Tasks (Wave 1 Remediation)" with numbered acceptance criteria and a "Verification Plan (Wave 1 Remediation)" section listing `pnpm run test`, `pnpm run lint`, etc.
  - A "Wave 1 Gate Status" section shows the date, verification results, and a "Blocking Issues" subsection with specific test failure output.
  - "Tasks (Wave 1.1 Fixes)" section lists remediation items with checkboxes.
  - Right panel shows the full task list with colored status indicators matching the spec panel format from earlier mocks: green circles for done, orange for in-progress, gray for not started.
- **Interactive elements:**
  - Terminal input area accepts shell commands.
  - "Commands" / "Terminal" tab switcher at top.
  - Left panel task checkboxes and navigation sections.
  - "Re-run Wave 1 gate after fixes" button visible in the tasks section.

## Wave Lifecycle

### 1. Delegation started (Mock 18)
The coordinator receives the user's prompt, creates an `OrchestratorRunRecord` (status: `queued` -> `running`), and calls `buildDelegatedTaskTimeline()` to generate `OrchestratorDelegatedTaskRecord` entries for each task type (`implement`, `verify`, `debug`). Each task transitions through: `queued` -> `delegating` -> `delegated` -> `running`. Agent entries appear in the left sidebar with `delegating`/`running` status indicators.

### 2. Agents executing (Mocks 19-20)
Agents work in parallel. The center chat stream receives progress messages from the coordinator. The coordinator resolves merge strategy (Mock 19) and propagates architecture decisions (Mock 20). Agent status indicators in the sidebar update as tasks progress. The `statusTimeline` array on each `OrchestratorDelegatedTaskRecord` appends each phase transition.

### 3. Verification checkpoint (Mocks 21-22)
As agents signal completion, the coordinator enters verification mode. It cross-references task completion against the acceptance criteria defined in the spec draft. Duplicate checkpoint events (Mock 22) are detected and deduplicated. The coordinator evaluates gate status by checking numbered criteria against actual agent output.

### 4. Integration verification (Mock 23)
The coordinator verifies inter-agent dependencies: space metadata must stabilize before git integration can proceed. Completion requests are issued to dependent agents. Checkpoint events are reconciled and duplicate entries are flagged.

### 5. Remediation (Mock 24)
Failed or blocked tasks trigger remediation. The coordinator retries with narrowed scope, re-delegates to backup agents (Wave1 Verifier, Wave1 Backup Verify), or reverts to a simpler execution mode. The `appendTaskStatus()` function in `orchestrator-delegation.ts` (line 32) records `failed` status with an `errorMessage`. If `resolveDelegationFailure()` returns a non-null message, downstream tasks are skipped with a cascading failure annotation.

### 6. Unblock terminal session (Mock 25)
When automated remediation cannot resolve a blocker, a dedicated "Unblock Wave 1 Verification" view opens. This view provides an embedded terminal session where the user can run shell commands (git operations, test suites, lint) against the space's repo path. A structured remediation plan is displayed alongside the terminal with acceptance criteria, verification commands, and a gate status summary. A "Re-run Wave 1 gate after fixes" action re-triggers automated verification after manual intervention.

## Agent Panel

The left sidebar displays agents in a hierarchical list structure.

### Agent item structure
- **Name:** Display name of the agent (e.g., "AMP Planning Coordinator", "Task Block Parser", "Implement Worktree Lifecycle")
- **Status indicator:** Colored dot to the left of the name
- **Role label:** Abbreviated role text below the name (e.g., "1/3 background agents running")
- **Expand/collapse:** Wave groupings (e.g., "EPOCH-1") act as collapsible sections containing their child agent items

### Status indicators
| Status | Indicator | Meaning |
|--------|-----------|---------|
| `queued` | Gray dot | Agent is waiting for delegation |
| `delegating` | Blue dot (pulsing) | Task is being dispatched to agent |
| `running` | Blue dot (solid) | Agent is actively executing |
| `completed` | Green dot | Agent finished successfully |
| `failed` | Red dot | Agent encountered an error |

### Selection behavior
Clicking an agent item in the sidebar filters the center chat stream to show messages from/about that specific agent. The selected agent is highlighted with an `is-active` class on the list item. In Mock 18, the "AMP Planning Coordinator" is selected and the center panel shows its coordination messages.

### Grouping
Agents are grouped by wave:
- **Coordinators:** Top-level entries (AMP Planning Coordinator)
- **Wave 1 agents:** Listed under a wave heading; in Mock 24 this appears as "Wave 1 Coordinators" and "EPOCH-1" sections
- **Remediation agents:** Additional agents spawned during remediation (Wave1 Verifier, Wave1 Backup Verify) appear at the bottom of the agent list

## Task Block Rendering

### Task block format
Each task block in the center content area displays:
- **Task type header:** Bold label (e.g., "implement", "verify", "debug")
- **Specialist label:** Parenthetical specialist name (e.g., "(implementor)", "(verifier)")
- **Status badge:** Inline text showing current status and lifecycle path (e.g., "completed [Queued -> Delegating -> Delegated -> Running -> Completed]")
- **Error message:** Red-colored `field-error` text when `task.errorMessage` is present, prefixed with " - "

Current rendering in `src/main.tsx` (lines 1587-1599):
```
{task.type} ({task.specialist}): {task.status} [{task.lifecycleText}]
```

### Delegation message format
Coordinator messages in the center chat stream follow a conversational format:
- Timestamp/context line
- Narrative text explaining the delegation decision
- Agent assignment entries showing agent IDs and task descriptions
- Status checkpoint summaries with numbered task lists

### Checkpoint events
Checkpoints appear as structured entries in the chat stream:
- "Processed this event" header
- Numbered list of actions taken (received task note, updated status, verified completion)
- "Current Wave 1 gate" summary with task-by-task status

### Verification results
Verification output displays:
- Pass/fail indicators for each gate criterion
- Test command output (e.g., `pnpm run test` results)
- Blocking issue descriptions with file paths and error details
- Gate status date stamp

## Data Dependencies

| Data | Source | Type |
|------|--------|------|
| `OrchestratorRunRecord` | `AppState.orchestratorRuns` | Persisted state via `PersistedStateStore` |
| `OrchestratorDelegatedTaskRecord[]` | `OrchestratorRunRecord.delegatedTasks` | Nested array on run record |
| `OrchestratorRunViewModel` | `projectOrchestratorRunViewModel()` | Derived; computed in `useMemo` at line 477-479 of `src/main.tsx` |
| `OrchestratorDelegatedTaskViewModel[]` | `OrchestratorRunViewModel.delegatedTasks` | Derived; projected from raw task records |
| `OrchestratorTaskType` | `"implement" \| "verify" \| "debug"` | Union type from `src/shared/state.ts` line 17 |
| `OrchestratorTaskStatus` | `"queued" \| "delegating" \| "delegated" \| "running" \| "completed" \| "failed"` | Union type from `src/shared/state.ts` lines 18-24 |
| `OrchestratorRunStatus` | `"queued" \| "running" \| "completed" \| "failed" \| "interrupted"` | Union type from `src/shared/state.ts` line 16 |
| `ORCHESTRATOR_SPECIALIST_BY_TASK_TYPE` | `orchestrator-delegation.ts` line 7 | Static mapping: implement->implementor, verify->verifier, debug->developer |
| `ALLOWED_RUN_TRANSITIONS` | `orchestrator-run-lifecycle.ts` line 3 | State machine adjacency map |
| `ContextSnippet[]` | `OrchestratorRunRecord.contextSnippets` | Retrieved via `kataShell.retrieveContext()` IPC |
| `OrchestratorSpecDraft` | `OrchestratorRunRecord.draft` | Generated by `createSpecDraft()` at `src/main.tsx` line 164 |

## Interactions

| Action | Trigger | Effect | IPC Channel |
|--------|---------|--------|-------------|
| Run orchestrator | Click "Run Orchestrator" button | Creates queued run, transitions to running, retrieves context, builds delegation timeline, persists terminal state | `kata-cloud/state:save`, `kata-cloud/context:retrieve` |
| Select agent | Click agent item in left sidebar | Filters center content to messages for selected agent; highlights item with `is-active` class | None (local state) |
| Expand/collapse wave group | Click wave heading in agent sidebar | Toggles visibility of child agent items | None (local state) |
| Apply spec draft | SpecNotePanel calls `onApplyDraftResult` | Updates `draftAppliedAt` or `draftApplyError` on the run record | `kata-cloud/state:save` |
| Re-run wave gate | Click "Re-run Wave 1 gate after fixes" button (Mock 25) | Re-triggers verification pass on the current wave | Not yet implemented |
| Open terminal session | Navigate to Unblock view, select Terminal tab | Renders embedded terminal connected to space repo path | Not yet implemented |
| Execute terminal command | Type command in terminal input, press Enter | Runs shell command in space worktree context | Not yet implemented |
| View changes | Click "Changes" nav tab | Loads git changes snapshot for active space | `kata-cloud/space-git:changes` |
| Initialize git | Click "Initialize Branch/Worktree" | Runs git lifecycle initialization for active space | `kata-cloud/space-git:initialize` |

## Visual Specifications

### Color Tokens
- **Agent status - queued:** `#6b7280` (gray-500)
- **Agent status - running:** `#3b82f6` (blue-500)
- **Agent status - completed:** `#22c55e` (green-500)
- **Agent status - failed:** `#ef4444` (red-500)
- **Background - panels:** Dark background consistent with existing `panel` class in `styles.css`
- **Background - selected agent:** Slightly lighter than panel background, matching existing `is-active` pattern
- **Error text:** Applied via existing `field-error` class
- **Task status pill - completed:** Green background with white text
- **Task status pill - in-progress:** Orange/amber background
- **Task status pill - not started:** Gray background

### Typography
- **Agent name:** Same weight/size as existing `space-title` class
- **Agent role/subtitle:** Same as existing `space-path` class (smaller, muted)
- **Chat messages:** Monospace for code/command output; proportional for narrative text
- **Terminal:** Monospace font, matching system terminal appearance
- **Status labels:** Inline text using existing patterns from `toStatusLabel()` and `toTaskStatusLabel()`

### Spacing & Layout
- **Three-panel grid:** Matches existing `panel-grid` layout from `src/main.tsx` line 1277
- **Left panel (agent sidebar):** Same width as existing Explorer panel; agent items use vertical list layout with 8px vertical gap between items
- **Center panel (chat/content):** Flexible width; message entries have 12px vertical spacing
- **Right panel (spec):** Same width as existing Spec panel; rendered by `SpecNotePanel`
- **Unblock view (Mock 25):** Full-width layout with tab bar at top, split into left task pane and center terminal pane
- **Agent status dots:** 8px diameter circles, positioned left of agent name with 8px horizontal gap

## Implementation Gap Analysis

| Feature | Mock Shows | Current Code | Gap |
|---------|-----------|--------------|-----|
| Agent sidebar list | Hierarchical agent roster with status dots, wave groupings, expand/collapse | Space list in Explorer panel (`src/main.tsx` lines 1284-1301); no agent-specific list | Need new `AgentPanel` component with hierarchical grouping, status indicators, and selection filtering |
| Agent status indicators | Colored dots (gray, blue, green, red) per agent | `OrchestratorTaskStatus` type exists; `toTaskStatusLabel()` produces text labels only | Need visual dot/badge component mapping status to color tokens |
| Chat-style message stream | Scrollable conversation of coordinator messages, delegation events, checkpoint summaries | Delegated tasks rendered as flat `<ul>` list items (`src/main.tsx` lines 1583-1600) | Need `WaveMessageStream` component with message formatting, timestamps, and agent attribution |
| Wave grouping | Agents grouped under "EPOCH-1", "Wave 1 Coordinators" headings with expand/collapse | No wave/epoch concept in data model; `OrchestratorDelegatedTaskRecord` has `type` but no wave field | Need `waveId` field on delegation records; grouping logic for agent sidebar |
| Merge strategy display | Coordinator explains merge conflict resolution inline | No merge strategy data or rendering | Need merge strategy message type and rendering |
| Architecture decision display | Coordinator posts architecture decisions with impact analysis | No architecture decision data structure | Need architecture decision message type |
| Verification gate status | Numbered checklist with pass/fail per criterion, date stamp | `OrchestratorRunRecord` tracks `status` and `errorMessage`; no per-criterion gate tracking | Need `WaveGateStatus` data structure with per-criterion results |
| Duplicate checkpoint detection | Coordinator identifies and deduplicates checkpoint events | `appendTaskStatus()` deduplicates status entries in timeline; no higher-level checkpoint deduplication | Need checkpoint event deduplication logic at the wave coordinator level |
| Remediation mode | Backup agents spawned, narrowed scope re-delegation, revert to simpler mode | `resolveDelegationFailure()` in `orchestrator-delegation.ts` handles single-task failure with cascade; no backup agent or re-delegation support | Need remediation workflow: backup agent creation, scope narrowing, mode revert |
| Unblock terminal session | Embedded terminal with shell access to space repo, structured remediation plan, "Re-run gate" button | No terminal component; no unblock view | Need `UnblockTerminalView` component with embedded terminal, remediation task list, gate re-run action |
| Terminal tab bar | "Commands" and "Terminal" tabs | No tab bar in existing views | Need tab bar component for the unblock view |
| Task status indicators in spec panel | Green/orange/red circles next to task items | `SpecNotePanel` renders markdown content without status-aware rendering | Need status-aware task rendering in spec panel, mapping task completion to visual indicators |
| Wave-scoped agent spawning | New agents created during remediation (Wave1 Verifier, Wave1 Backup Verify) | `ORCHESTRATOR_SPECIALIST_BY_TASK_TYPE` is static with 3 entries (implementor, verifier, developer) | Need dynamic specialist registry supporting wave-scoped agent creation |
| Real-time agent progress | Status dots update as agents progress through lifecycle | State is persisted and re-rendered on change; no streaming/polling mechanism for in-flight updates | Need real-time update mechanism (IPC subscription or polling) for agent progress during wave execution |
| Run failure with cascading skip | Downstream tasks show "Skipped because an earlier delegation failed" | Implemented in `buildDelegatedTaskTimeline()` at `orchestrator-delegation.ts` lines 80-89 | Implemented; rendering shows error via `task.errorMessage` in `field-error` span |
