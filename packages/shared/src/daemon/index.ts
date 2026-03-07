/**
 * Daemon Module
 *
 * SQLite message queue, JSON-lines IPC, and daemon-internal types.
 * Used by the daemon subprocess and the Electron main process DaemonManager.
 */

export type {
  DaemonStatus,
  DaemonCommand,
  DaemonEvent,
  MessageDirection,
  MessageStatus,
  QueuedMessage,
  TaskType,
  TaskAction,
  ScheduledTask,
} from './types.ts';

export { MessageQueue } from './message-queue.ts';
export { TaskScheduler } from './task-scheduler.ts';
export { ChannelRunner } from './channel-runner.ts';
export { createLineParser, formatMessage } from './ipc.ts';
export { writePidFile, removePidFile, cleanupStaleDaemon } from './pid.ts';
