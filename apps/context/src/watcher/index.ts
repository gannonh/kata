/**
 * File watcher — monitors source files and triggers incremental re-indexing.
 *
 * Slice: S04 — Live Refresh + Combined Retrieval
 * Task: T02
 */

import { watch as chokidarWatch, type FSWatcher } from "chokidar";
import { resolve, relative } from "node:path";
import { indexProject } from "../indexer.js";
import type { Config } from "../types.js";
import type {
  Watcher,
  WatcherOptions,
  WatcherEvent,
  WatcherEventHandler,
} from "./types.js";

/** Default debounce window in ms */
const DEFAULT_DEBOUNCE_MS = 300;

/** Paths always ignored to prevent self-trigger loops */
const ALWAYS_IGNORED = [
  /(^|[/\\])\.kata[/\\]/,
  /(^|[/\\])node_modules[/\\]/,
  /(^|[/\\])\.git[/\\]/,
];

export { type Watcher, type WatcherOptions, type WatcherEvent } from "./types.js";

/**
 * Create a file watcher that triggers incremental re-indexing on change.
 */
export function createWatcher(
  rootDir: string,
  config: Config,
  options?: WatcherOptions,
): Watcher {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const extraIgnored = options?.ignorePaths ?? [];
  const ignored: Array<RegExp | string> = [
    ...ALWAYS_IGNORED,
    ...config.excludes.map(e => `**/${e}/**`),
    ...extraIgnored,
  ];

  const handlers: WatcherEventHandler[] = [];
  let fsWatcher: FSWatcher | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingFiles: Set<string> = new Set();
  let reindexing = false;

  function emit(event: WatcherEvent): void {
    for (const h of handlers) {
      try { h(event); } catch { /* swallow handler errors */ }
    }
  }

  async function triggerReindex(files: string[]): Promise<void> {
    if (reindexing) return;
    reindexing = true;

    emit({
      type: "reindex-start",
      timestamp: new Date().toISOString(),
      files,
    });

    const start = performance.now();
    try {
      indexProject(resolve(rootDir), { config });
      const durationMs = Math.round(performance.now() - start);
      emit({
        type: "reindex-done",
        timestamp: new Date().toISOString(),
        files,
        durationMs,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Determine error code
      const isProviderError = message.includes("API") || message.includes("key") || message.includes("provider");
      emit({
        type: "error",
        timestamp: new Date().toISOString(),
        error: message,
        errorCode: isProviderError ? "WATCH_PROVIDER_ERROR" : "WATCH_REINDEX_FAILED",
      });
    } finally {
      reindexing = false;
    }
  }

  function onFileChange(filePath: string): void {
    const rel = relative(rootDir, filePath);
    pendingFiles.add(rel);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const files = [...pendingFiles];
      pendingFiles = new Set();
      debounceTimer = null;

      emit({
        type: "change",
        timestamp: new Date().toISOString(),
        files,
      });

      triggerReindex(files);
    }, debounceMs);
  }

  const watcher: Watcher = {
    async start(): Promise<void> {
      try {
        fsWatcher = chokidarWatch(rootDir, {
          ignored,
          persistent: true,
          ignoreInitial: true,
          awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
        });

        fsWatcher.on("change", onFileChange);
        fsWatcher.on("add", onFileChange);
        fsWatcher.on("unlink", onFileChange);

        // Wait for ready event
        await new Promise<void>((res, rej) => {
          fsWatcher!.on("ready", res);
          fsWatcher!.on("error", rej);
        });

        emit({
          type: "start",
          timestamp: new Date().toISOString(),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        emit({
          type: "error",
          timestamp: new Date().toISOString(),
          error: message,
          errorCode: "WATCH_INIT_FAILED",
        });
        throw err;
      }
    },

    async stop(): Promise<void> {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      pendingFiles.clear();
      if (fsWatcher) {
        await fsWatcher.close();
        fsWatcher = null;
      }
    },

    on(handler: WatcherEventHandler): void {
      handlers.push(handler);
    },
  };

  return watcher;
}
