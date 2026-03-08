# Multi-Agent Orchestration Design

**Date:** March 8, 2026

**Status:** Approved design

**Goal:** Add first-class multi-agent orchestration with a persisted orchestrator chat, persisted direct child sub-agent chats, nested chat-list rendering, and direct user interaction with sub-agent chats while preserving the current inline sub-agent activity shown in the orchestrator transcript.

---

## Summary

The application already supports sub-agent activity as nested tool activity inside a single session. This design evolves that behavior into a shallow conversation tree:

- One top-level orchestrator session
- Zero or more persisted direct child sub-agent sessions
- No deeper nesting in v1

Each sub-agent becomes a real chat that can be selected, opened in tabs or panes, and messaged directly by the user. At the same time, the orchestrator transcript continues to show compact, expandable inline activity for delegated sub-agents so the parent conversation remains a useful supervisory log.

Status remains owned by the orchestrator only. Child sessions inherit placement from the orchestrator and always travel with it in chat organization views.

---

## Product Decisions

### Approved scope

- Use real persisted child sessions, not ephemeral projections
- Allow direct user follow-up messages in child chats
- Keep orchestrator visibility into all child activity
- Support only one level of children in v1
- Render child chats nested under the orchestrator in the chat-list column
- Continue showing inline sub-agent activity in the orchestrator transcript

### Out of scope

- Child agents spawning their own children
- Independent status assignment for child sessions
- Spec-task-to-sub-agent assignment UI
- Deeper task board or wave-planning changes beyond what is needed to support the session model

---

## Goals And Non-Goals

### Goals

- Represent multi-agent work as a persisted session tree with one orchestrator root
- Preserve the current inline delegation tree inside the orchestrator transcript
- Let users open a child agent transcript and message it directly
- Keep orchestrator and children grouped together in all chat organization views
- Fit the existing and planned multi-pane, multi-tab UI direction

### Non-goals

- Replacing the orchestrator transcript with a full merged transcript of all children
- Making children first-class workflow items for status filtering
- Introducing arbitrary graph relationships between sessions
- Designing the future task assignment system beyond compatibility hooks

---

## Information Architecture

The conversation model becomes a shallow tree:

```text
orchestrator
|____ subagent 1
|____ subagent 2
```

The orchestrator is the root conversation for the work item. Child sessions are specialized delegated conversations attached to that root. They are independently viewable and writable, but organizationally subordinate to the orchestrator.

The user can access the same underlying work in three ways:

1. Through the orchestrator transcript, which shows inline delegated activity groups
2. Through the chat list, where child chats render nested below the orchestrator row
3. Through multi-tab or multi-pane layouts, where either parent or child can be opened directly

---

## Session Model

### New session relationships

Extend persisted session data with explicit hierarchy fields:

- `sessionKind: 'orchestrator' | 'subagent'`
- `parentSessionId?: string`
- `orchestratorSessionId?: string`
- `agentRole?: string`
- `delegatedBySessionId?: string`
- `delegationLabel?: string`
- `subagentStatus?: 'queued' | 'running' | 'completed' | 'failed'`

### Semantics

- `sessionKind` identifies whether a session is the root coordinator or a delegated child.
- `parentSessionId` links a child directly to its orchestrator.
- `orchestratorSessionId` gives every child a stable root id for subtree operations.
- `agentRole` stores the specialist type shown in the UI.
- `delegatedBySessionId` records which orchestrator created the child.
- `delegationLabel` stores the human-readable assignment text for nested list and tab labels.
- `subagentStatus` is a lightweight runtime and persistence field for child execution state, not workflow organization.

### Existing status behavior

Workflow status such as `backlog`, `todo`, `needs_review`, `done`, and `cancelled` remains on the orchestrator session only. Child sessions do not receive independent workflow state.

This ensures the orchestrator and its children always move together:

- If the orchestrator appears in `Needs Review`, all of its child sessions appear under it there.
- If the orchestrator is filtered out of the current slice, its children are also hidden.

---

## Navigation Model

### Leftmost organization rail

The leftmost rail remains an organization mechanism for chats:

- `All Chats`
- `Flagged`
- status slices
- labels
- future organizational slices

This rail does not become an agent tree. It selects which subset of conversations is visible in the chat-list column.

### Chat-list column

The middle chat-list column becomes hierarchy-aware:

- Top-level rows are orchestrator sessions
- Child rows render directly underneath their parent
- Child rows never appear as top-level entries
- Parent rows own workflow status and filtering behavior
- Child rows inherit visibility from their parent

Nested rows should visually read as subordinate sub-tabs:

- Indented below the parent row
- Lighter visual treatment than the parent
- Optional disclosure affordance for collapse and expand
- Role badge or icon showing specialist type
- Secondary preview text using the delegation label or latest child activity

### Main chat pane

The main pane shows the selected chat only:

- Selecting the orchestrator shows the orchestrator transcript
- Selecting a child shows that child transcript
- Child transcripts accept direct user input
- The orchestrator retains visibility into child exchanges through the shared orchestration model

### Tabs and panes

In multi-tab and multi-pane layouts:

- The orchestrator or any child chat may be opened directly
- Hierarchy is preserved regardless of which chat is open
- The list column remains the primary organization surface for the subtree

---

## Transcript Behavior

### Orchestrator transcript

The orchestrator transcript should continue to show delegated sub-agent activity inline, using the current compact and expandable grouped activity blocks.

This transcript remains a supervisory narrative:

- delegation happened
- child work streamed
- tools ran
- results came back
- the orchestrator summarized or reacted

It should not become a full duplication of child transcripts.

### Child transcripts

Each child transcript is the focused workspace for that delegated agent:

- direct transcript of child messages
- child tool activity in its own chat
- direct user follow-up messages
- child completion and failure outcomes

### Linking the two views

The orchestrator transcript and the child transcript are two projections of the same work:

- The orchestrator view shows compact summarized activity
- The child view shows the full focused transcript

Clicking a child row in the chat list opens the child transcript. Clicking inline delegated activity in the orchestrator may also open the corresponding child transcript in future, but the design does not require a new interaction pattern if the list already provides the navigation affordance.

---

## Event Flow

The runtime should support both persisted child sessions and inline orchestrator projection.

### Required event concepts

- `subagent_spawned`
- `subagent_message`
- `subagent_tool_activity`
- `subagent_completed`
- `subagent_failed`
- `subagent_user_message`

### Event behavior

#### `subagent_spawned`

- Create the child session record
- Persist parent-child linkage
- Add child metadata to the orchestrator subtree
- Make the child available in the nested list immediately

#### `subagent_message`

- Append content to the child transcript
- Update list previews and unread state for the child
- Surface the activity to the orchestrator visibility layer for inline rendering and orchestration awareness

#### `subagent_tool_activity`

- Continue powering the expandable inline activity blocks already shown in the orchestrator transcript
- Also attach the activity to the child transcript where appropriate

#### `subagent_completed` and `subagent_failed`

- Update child lifecycle state
- Refresh parent inline summary state
- Refresh nested list display metadata

#### `subagent_user_message`

- Store the user message in the child transcript
- Expose it to the orchestrator awareness model
- Do not change parent workflow status automatically

---

## Filtering And Organization Rules

The subtree behaves as a single workflow item for organizational views.

### Inclusion rules

- A subtree is included in a slice if the orchestrator matches that slice.
- Child sessions are rendered only when their parent is included.
- Child sessions must not appear independently in `All Chats`, status slices, label slices, or flagged views.

### Unread behavior

- Children can track their own unread state for direct chat selection
- Child unread activity should bubble up to the parent row so the subtree appears active
- Parent unread can be computed or explicitly set, but the user should never miss child activity by looking only at the orchestrator row

### Flagging and labels

For v1, organizational state remains parent-owned:

- flagging applies to the orchestrator
- labels apply to the orchestrator
- children inherit placement, not metadata ownership

---

## Multi-Pane And Multi-Tab Compatibility

This session model is intended to support the multi-pane and multi-tab UI direction:

- a pane may show the orchestrator while another shows a child
- a tab may hold a child transcript independently
- the same subtree can be navigated from the nested list column

The hierarchy should live in session metadata and list rendering, not in ad hoc pane state. Pane state chooses what is open; session relationships define what exists.

---

## Error Handling

The design prioritizes consistency and graceful fallback.

### Child session creation failure

If child session persistence fails, the orchestrator should fall back to the current inline-only behavior for that delegated activity. No child work should disappear from the parent transcript.

### Out-of-order child events

If child events arrive before the child session is fully hydrated:

- buffer them against the known child id
- attach them once the child session exists
- keep parent inline activity visible during the gap

### Missing or corrupt child session on reload

If a child session cannot be loaded from disk:

- the orchestrator transcript remains authoritative enough to explain the delegated work
- the child row may be omitted or shown as unavailable
- the parent conversation must remain stable and readable

### Parent-child consistency

If a child is removed or invalidated, the parent must not lose its supervisory history. Inline delegated activity is the consistency backstop.

---

## Testing Strategy

### Persistence tests

- save and load orchestrator-child relationships
- reconstruct the subtree correctly on reload
- preserve parent-owned workflow status semantics

### Event processor tests

- create child session on spawn
- append child messages and tool activity
- update parent inline projection from child activity
- handle completion and failure transitions
- handle out-of-order child events safely

### List rendering tests

- render child rows nested under the orchestrator
- hide child rows when the parent is filtered out
- bubble child unread state to the parent row
- ensure children do not appear as top-level entries

### Interaction tests

- select a child from the nested list and display its transcript
- send a direct user message to a child
- ensure orchestrator visibility is maintained
- keep existing inline expand and collapse behavior working in the parent transcript

### Regression tests

- existing single-session chats still render correctly
- current inline sub-agent activity rendering still works for orchestrator transcripts
- non-orchestrator sessions remain unaffected

---

## Compatibility With Future Task Assignment

Future task-to-sub-agent assignment is out of scope, but the model should leave room for it:

- `delegationLabel` can evolve into a task display label
- child metadata can later reference task ids
- nested list rows can eventually group or decorate children by assigned spec task

This design should not add task-level semantics yet. It only keeps the session model compatible with that future direction.

---

## Implementation Notes

This design fits the current architecture:

- the app already carries nested tool activity via `parentToolUseId`
- inline sub-agent blocks already exist in the main transcript
- session metadata is already split between lightweight list state and lazily loaded full sessions

The main change is introducing first-class child sessions and teaching list, persistence, and event projection layers to treat orchestration as a shallow session tree.

---

## Acceptance Criteria

- An orchestrator can spawn persisted direct child sessions
- Child sessions render nested below the orchestrator in the chat-list column
- Child sessions never appear as independent top-level organizational entries
- Only orchestrator sessions own workflow status
- Selecting a child opens its focused transcript
- Users can send messages directly to a child session
- The orchestrator retains visibility into all child activity
- Existing inline sub-agent activity remains visible and expandable in the orchestrator transcript
- The system supports one level of orchestration only in v1
