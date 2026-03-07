# Phase 13 Plan 02: Task Scheduler Summary

SQLite-persisted task scheduler with cron, interval, and one-shot scheduling via croner, including catch-up on restart and graceful shutdown.

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Add ScheduledTask types and install croner | `7bdd71a` |
| 2 | Create TaskScheduler class with SQLite persistence and croner scheduling | `14bd812` |

## Key Artifacts

- `packages/shared/src/daemon/types.ts` -- Added `TaskType`, `TaskAction`, `ScheduledTask` types
- `packages/shared/src/daemon/task-scheduler.ts` -- `TaskScheduler` class with CRUD, timer scheduling, catch-up, and graceful shutdown
- `packages/shared/src/daemon/message-queue.ts` -- Added `getDb()` getter for database sharing
- `packages/shared/src/daemon/index.ts` -- Exports for TaskScheduler and new types
- `packages/shared/src/daemon/__tests__/task-scheduler.test.ts` -- 10 unit tests covering all scheduler behaviors

## Design Decisions

- `TaskScheduler` accepts an external `Database` instance rather than owning its own connection, enabling database sharing with `MessageQueue` via the new `getDb()` method
- `computeNextRunAt()` is a standalone function that handles all three task types (cron/interval/one-shot) for reuse in both addTask and post-execution rescheduling
- Catch-up uses `Math.max(0, nextRunAt - now)` so missed tasks fire via `setTimeout(fn, 0)` on the next tick
- In-flight tracking uses a `Set<Promise<void>>` pattern; `stop()` awaits all active callbacks before resolving
- One-shot tasks set `enabled = 0` after firing rather than being deleted, preserving execution history

## Deviations

None -- plan executed exactly as written.

## Verification

- `bun run typecheck:all` passes across all packages
- `bun test packages/shared/src/daemon/__tests__/task-scheduler.test.ts` -- 10/10 tests pass
- croner `^10.0.1` in root `package.json` dependencies
- `scheduled_tasks` table schema matches the design specification

## Duration

~3 minutes
