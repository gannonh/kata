---
phase: 11-daemon-core-and-sqlite-queue
plan: 01
subsystem: daemon
tags: [sqlite, ipc, message-queue, tdd, bun-sqlite]

dependency-graph:
  requires:
    - Phase 10 (daemon types, permission mode)
  provides:
    - MessageQueue class (enqueue/dequeue/markProcessed/markFailed/close)
    - createLineParser() for JSON-lines IPC
    - formatMessage() for JSON-lines IPC
    - Daemon-internal types (QueuedMessage, MessageDirection, MessageStatus)
    - Subpath export @craft-agent/shared/daemon
  affects:
    - Phase 11 Plan 02 (daemon entry point, DaemonManager)
    - Phase 12 (channel adapters enqueue messages)
    - Phase 13 (task scheduler uses message queue)

tech-stack:
  added: []
  patterns:
    - SQLite WAL mode with busy_timeout and synchronous=NORMAL
    - Prepared statements via db.query() stored as private fields
    - Atomic dequeue via UPDATE...RETURNING with subselect
    - Partial index on pending messages for O(1) dequeue
    - Streaming line parser with buffer for partial chunk handling

key-files:
  created:
    - packages/shared/src/daemon/types.ts
    - packages/shared/src/daemon/index.ts
    - packages/shared/src/daemon/message-queue.ts
    - packages/shared/src/daemon/ipc.ts
    - packages/shared/src/daemon/__tests__/message-queue.test.ts
    - packages/shared/src/daemon/__tests__/ipc.test.ts
  modified:
    - packages/shared/package.json

decisions:
  - id: raw-row-mapping
    decision: "Map SQLite snake_case columns to camelCase QueuedMessage fields in dequeue()"
    reason: "SQLite uses snake_case by convention; TypeScript interface uses camelCase. Explicit mapping keeps the boundary clean."
  - id: payload-serialization
    decision: "JSON.stringify on enqueue, JSON.parse on dequeue"
    reason: "SQLite stores TEXT; payload is typed as unknown. Round-trip serialization preserves arbitrary payload structure."

metrics:
  duration: "~3.5 minutes"
  completed: 2026-02-07
---

# Phase 11 Plan 01: SQLite Message Queue and IPC Summary

SQLite message queue with WAL mode and JSON-lines IPC parser for daemon subprocess communication.

## What Was Done

**Task 1: Daemon internal types and subpath export**
- Created `packages/shared/src/daemon/types.ts` with MessageDirection, MessageStatus, QueuedMessage
- Re-exported DaemonStatus, DaemonCommand, DaemonEvent from @craft-agent/core
- Barrel export in `packages/shared/src/daemon/index.ts`
- Registered `./daemon` subpath in packages/shared/package.json

**Task 2: SQLite message queue with TDD (10 tests)**
- MessageQueue class constructor: opens Database, sets WAL mode, busy_timeout=5000, synchronous=NORMAL
- Creates messages table with CHECK constraints and two indices (pending partial, channel composite)
- enqueue(): inserts message with JSON.stringify'd payload, returns lastInsertRowid
- dequeue(): atomic UPDATE...RETURNING with subselect on oldest pending message, JSON.parse payload
- markProcessed(): sets status to 'processed'
- markFailed(): sets status to 'failed', stores error text, increments retry_count

**Task 3: JSON-lines IPC module with TDD (8 tests)**
- createLineParser(): streaming buffer that splits on newline, skips empty lines, handles partial chunks
- formatMessage(): JSON.stringify + newline terminator

## Deviations

None. Plan executed exactly as written.

## Verification

- `bun run typecheck:all` passes with zero errors
- 18 tests across 2 test files (10 message-queue + 8 IPC), all passing
- Barrel export verified: MessageQueue, createLineParser, formatMessage, and all types importable from `@craft-agent/shared/daemon`
- No imports from apps/electron in daemon module
- Full test suite: 1366 tests pass, 0 failures (no regressions)
