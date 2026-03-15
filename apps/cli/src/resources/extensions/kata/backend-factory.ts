/**
 * Backend factory — returns FileBackend or LinearBackend based on preferences.
 *
 * Separate file to avoid circular imports: backend.ts defines the interface,
 * this file imports both implementations.
 */

import type { KataBackend } from "./backend.js";
import { isLinearMode } from "./linear-config.js";

/**
 * Create the appropriate backend for the current workflow mode.
 *
 * Async because LinearBackend config resolution requires API calls
 * (team ID resolution, label set lookup).
 *
 * Called once at the start of auto-mode or step-mode.
 */
export async function createBackend(basePath: string): Promise<KataBackend> {
  if (isLinearMode()) {
    // Placeholder — Task 7 fills in Linear config resolution
    throw new Error("LinearBackend not yet implemented");
  }
  // Placeholder — Task 2 creates FileBackend
  throw new Error("FileBackend not yet implemented");
}
