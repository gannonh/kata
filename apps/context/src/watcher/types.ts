/**
 * Watcher type definitions for S04 — Live Refresh.
 *
 * Defines the event model, options, and interface for the
 * chokidar-based file watcher that triggers incremental re-indexing.
 */

// ── Watcher event types ──

export type WatcherEventType =
  | "start"
  | "change"
  | "reindex-start"
  | "reindex-done"
  | "error";

export interface WatcherEvent {
  type: WatcherEventType;
  timestamp: string;
  files?: string[];
  error?: string;
  errorCode?: WatcherErrorCode;
  /** Duration of the reindex in ms (only for reindex-done) */
  durationMs?: number;
}

export type WatcherErrorCode =
  | "WATCH_INIT_FAILED"
  | "WATCH_REINDEX_FAILED"
  | "WATCH_PROVIDER_ERROR";

// ── Watcher options ──

export interface WatcherOptions {
  /** Debounce window in ms (default: 300) */
  debounceMs?: number;
  /** Additional paths to ignore (merged with defaults) */
  ignorePaths?: string[];
}

// ── Watcher interface ──

export type WatcherEventHandler = (event: WatcherEvent) => void;

export interface Watcher {
  /** Start watching for file changes */
  start(): Promise<void>;
  /** Stop watching and clean up resources */
  stop(): Promise<void>;
  /** Register an event handler */
  on(handler: WatcherEventHandler): void;
}
