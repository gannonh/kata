# Agent Activity Observability Design

**Date:** 2026-04-23  
**Status:** Approved (design)  
**Scope:** Kata Desktop Symphony observability in right pane

## 1) Problem

Current Symphony observability is split across:

1. ephemeral status hints in the main desktop surfaces
2. `Settings -> Symphony` runtime/dashboard panels
3. the local Symphony HTTP dashboard (`localhost:8080`)

This creates three practical issues:

1. worker/tool activity is visible but not durable enough for investigation
2. operators cannot reliably scroll a unified timeline backward/forward
3. error state is not persistently separated and surfaced as pinned events

## 2) Goals

1. Add a first-class, always-available right-pane observability surface named `Agent Activity`.
2. Provide real-time activity monitoring with timeline navigation.
3. Separate pinned events from general activity.
4. Support two densities:
   1. `Events` (default, curated meaningful changes)
   2. `Verbose` (debug-level, high-volume stream visibility)
5. Keep data in memory for the current desktop session only (v1).

## 3) Non-goals

1. No persistence across desktop restarts in v1.
2. No replacement/removal of existing Symphony runtime controls in Settings.
3. No backend protocol changes in Symphony server for v1.

## 4) Product Decisions (Locked)

1. Location: right-pane first-class mode.
2. Label: `Agent Activity`.
3. Retention scope: current desktop session only.
4. Error pinning: auto-pin all error-level events until manually dismissed.
5. Mode switch UX: segmented control `Events | Verbose`.
6. Architecture baseline: main-process event journal (single source of truth).

## 5) UX Design

## 5.1 Pane Layout

`Agent Activity` uses a two-region layout:

1. `Pinned Events` region (top)
2. `Timeline` region (main, scrollable)

## 5.2 Pinned Events

Each pinned event shows:

1. severity
2. source (`runtime`, `worker`, `escalation`, `connection`, `system`)
3. concise message
4. event timestamp
5. pinned timestamp
6. pin origin (auto vs manual)

Actions:

1. `Unpin` removes the event from pinned region only.
2. Unpinning does not remove historical timeline events.
3. Error-level events are auto-pinned, but can still be manually unpinned.

## 5.3 Timeline

Header controls:

1. segmented control: `Events | Verbose`
2. source filter
3. severity filter
4. `Jump to latest` action

Behavior:

1. auto-follow when user is near bottom
2. if user scrolls up, auto-follow pauses and unseen counter appears
3. switching `Events`/`Verbose` preserves time/position anchor

Row content:

1. timestamp
2. event type badge
3. worker/issue context where available
4. summary message
5. expandable details payload (especially for `Verbose`)

## 6) Architecture

## 6.1 Main Process: `AgentActivityJournal`

Add a new main-process service that normalizes and journals observability events.

Responsibilities:

1. ingest runtime/operator/escalation/connection signals
2. normalize to shared event schema
3. maintain ring buffers for `events` and `verbose`
4. maintain active `pinnedEvents`
5. publish snapshot and incremental updates over IPC

This becomes the source of truth for renderer observability state.

## 6.2 Renderer

Add new right-pane mode and pane component:

1. right-pane mode: `agent_activity`
2. component: `AgentActivityPane`
3. atom bridge: initial hydrate + push subscriptions

Renderer mode/filter state is local UI state; journal data remains main-owned.

## 6.3 Existing Surfaces

`Settings -> Symphony` remains for runtime controls and baseline health view in v1.  
`Agent Activity` becomes the primary real-time observability surface.

## 6.4 Unit Boundaries and Interfaces

1. `SymphonySupervisor`
   - owns process lifecycle and runtime status emission
   - does not own timeline/pinning concerns
2. `SymphonyOperatorService`
   - owns Symphony API/WebSocket integration and operator snapshot assembly
   - does not own renderer presentation state
3. `AgentActivityJournal` (new)
   - owns normalized event creation, buffering, pinned-event lifecycle, and publish deltas
   - consumes events from runtime/operator services through explicit methods
4. `Renderer AgentActivity atoms/components`
   - own view mode (`Events|Verbose`), filtering, scroll behavior, and presentation
   - do not derive semantic events from raw Symphony snapshots

Interface contract principle: producer services emit domain signals, journal normalizes and stores, renderer only displays and interacts through IPC commands.

## 7) Data Model

## 7.1 Normalized Event

```ts
interface AgentActivityEvent {
  id: string
  timestamp: string
  stream: 'events' | 'verbose'
  source: 'runtime' | 'worker' | 'escalation' | 'connection' | 'system'
  severity: 'info' | 'warning' | 'error'
  kind: string
  message: string
  workerId?: string
  issueId?: string
  issueIdentifier?: string
  requestId?: string
  connectionState?: 'connected' | 'reconnecting' | 'disconnected' | 'inactive'
  details?: Record<string, unknown>
}
```

## 7.2 Pinned Event

```ts
interface AgentPinnedEvent {
  eventId: string
  pinnedAt: string
  automatic: boolean
  timestamp: string
  source: AgentActivityEvent['source']
  kind: string
  message: string
  severity: AgentActivityEvent['severity']
  workerId?: string
  issueId?: string
  issueIdentifier?: string
  requestId?: string
  connectionState?: AgentActivityEvent['connectionState']
  details?: Record<string, unknown>
}
```

## 7.3 Journal Snapshot and Delta

```ts
interface AgentActivitySnapshot {
  generatedAt: string
  events: AgentActivityEvent[]
  verbose: AgentActivityEvent[]
  pinnedEvents: AgentPinnedEvent[]
}

interface AgentActivityUpdate {
  generatedAt: string
  appendedEvents?: AgentActivityEvent[]
  appendedVerbose?: AgentActivityEvent[]
  upsertedPinnedEvents?: AgentPinnedEvent[]
  removedPinnedEventIds?: string[]
}
```

## 8) Ingestion Rules

## 8.1 Runtime Status

From Symphony runtime phase/error transitions:

1. phase change -> `events` + `verbose`
2. diagnostics updates -> `verbose`
3. runtime errors -> `events` + `verbose` + auto-pin

## 8.2 Operator Snapshot

Diff current vs previous snapshot and emit meaningful transitions:

1. worker add/remove/state change/tool change/error change -> `events`
2. per-update worker heartbeat/state payload details -> `verbose`
3. escalation created/resolved/timed-out/cancelled -> `events`
4. connection state transitions and stale/disconnect reasons -> `events`
5. raw payload summaries -> `verbose`

## 8.3 Escalation Response Commands

1. submit success/failure -> `events`
2. failure details -> `verbose`
3. failure events are auto-pinned when severity is `error`

## 9) Buffering and Retention

Session-only memory retention with ring buffers:

1. `events` cap: 2,000 (default)
2. `verbose` cap: 20,000 (default)
3. pinned events: active set only (unpinned events remain in timeline history)

Caps are tunable constants in main process.

## 10) IPC Contract

New channels:

1. `agentActivity:get-snapshot`
2. `agentActivity:update` (push from main to renderer)
3. `agentActivity:set-pinned-event`

Renderer flow:

1. hydrate once with `get-snapshot`
2. subscribe to push updates
3. apply deltas without full-list replacement

## 11) Right Pane Integration

## 11.1 Type and Atom Updates

1. extend `RightPaneMode`/override types to include `agent_activity`
2. keep automatic resolution behavior unchanged
3. allow explicit manual override to `agent_activity`

## 11.2 Surface Navigation

Add a clear one-click affordance from existing shell controls to open `Agent Activity`.

Recommended v1 entry points:

1. right-pane header mode switch (`Kanban | Planning | Agent Activity`)
2. optional quick action on Symphony status badge to open pane directly

## 12) Scroll and Anchor Semantics

Use anchor preservation strategy:

1. record top-visible anchor event id + pixel offset
2. on mode switch/filter change, restore nearest matching event by id
3. fallback to nearest timestamp when id not present

This avoids disorienting reset during `Events | Verbose` toggles.

## 13) Event Pinning Semantics

Auto-pin behavior:

1. every `severity=error` event auto-pins that event by `eventId`
2. any event can be manually pinned/unpinned from the timeline
3. unpinning removes only the pinned-card entry, not the timeline row

## 14) Testing Strategy

## 14.1 Main Process Unit Tests

1. normalization and diff emission correctness
2. ring buffer truncation behavior
3. pinned event auto-pin/manual-pin/unpin rules
4. snapshot + delta shape stability

## 14.2 Renderer Unit Tests

1. `Events | Verbose` toggle and anchor preservation
2. paused scroll vs auto-follow behavior
3. unseen count indicator behavior
4. pinned event rendering and unpin action

## 14.3 Integration/E2E

1. worker lifecycle transitions appear in timeline
2. escalation lifecycle appears in timeline
3. disconnect/reconnect generates corresponding pinned-event behavior
4. right-pane mode switch to `Agent Activity` works without Settings dependency

## 15) Rollout Plan

1. Implement behind feature flag for internal validation.
2. Validate with real Symphony workloads.
3. Enable by default after stability checks.
4. Keep `Settings -> Symphony` runtime controls while directing observability workflows to `Agent Activity`.

## 16) Risks and Mitigations

1. Event flood in verbose mode.
   - Mitigation: ring buffers + list virtualization.
2. Duplicate noisy event emission from snapshot churn.
   - Mitigation: semantic diff rules and dedupe guards.
3. Drift between main and renderer interpretations.
   - Mitigation: single normalized event contract with schema tests.

## 17) Acceptance Criteria

1. Operators can monitor worker activity in real time from right pane.
2. Timeline supports backward/forward investigation without losing context.
3. Pinned errors are isolated, durable during session, and dismissible.
4. `Events` default remains readable under normal operation.
5. `Verbose` mode exposes high-volume detail for debugging.
6. No refresh loop required to keep the timeline current.
