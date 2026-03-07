/**
 * Daemon Internal Types
 *
 * Re-exports public daemon types from @craft-agent/core and defines
 * daemon-internal types used by the message queue and IPC modules.
 */

// Re-export public types from core
export type { DaemonStatus, DaemonCommand, DaemonEvent, TaskType, TaskAction } from '@craft-agent/core/types';

// Import locally for use in ScheduledTask
import type { TaskType, TaskAction } from '@craft-agent/core/types';

/**
 * Direction of a queued message relative to the daemon.
 * - `inbound`: message received from an external channel
 * - `outbound`: message to be sent to an external channel
 */
export type MessageDirection = 'inbound' | 'outbound';

/**
 * Lifecycle status of a queued message.
 * - `pending`: waiting to be processed
 * - `processing`: claimed by a worker
 * - `processed`: successfully handled
 * - `failed`: processing failed (see error field)
 */
export type MessageStatus = 'pending' | 'processing' | 'processed' | 'failed';

/**
 * A message stored in the SQLite queue.
 */
export interface QueuedMessage {
  /** Auto-incremented row ID */
  id: number;

  /** Whether the message is inbound or outbound */
  direction: MessageDirection;

  /** Channel adapter that owns this message */
  channelId: string;

  /** Current processing status */
  status: MessageStatus;

  /** Message payload (deserialized from JSON) */
  payload: unknown;

  /** ISO 8601 timestamp when the message was enqueued */
  createdAt: string;

  /** ISO 8601 timestamp when processing started, or null */
  processedAt: string | null;

  /** Error description if status is 'failed', or null */
  error: string | null;

  /** Number of times processing has been attempted and failed */
  retryCount: number;
}

/**
 * A scheduled task persisted in SQLite.
 */
export interface ScheduledTask {
  /** Auto-incremented row ID */
  id: number;
  /** Workspace this task belongs to */
  workspaceId: string;
  /** Task type: cron, interval, or one-shot */
  type: TaskType;
  /** Schedule expression: cron string, interval ms as string, or ISO datetime for one-shot */
  schedule: string;
  /** Action to perform when the task fires */
  action: TaskAction;
  /** Whether the task is active */
  enabled: boolean;
  /** ISO timestamp of last execution, or null */
  lastRunAt: string | null;
  /** ISO timestamp of next scheduled execution */
  nextRunAt: string;
  /** ISO timestamp when the task was created */
  createdAt: string;
}
