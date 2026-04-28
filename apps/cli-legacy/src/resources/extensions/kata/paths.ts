/**
 * Kata Paths — minimal path utilities.
 *
 * After file-mode removal, only kataRoot() remains.
 * The .kata/ directory is still used for preferences, activity logs, and metrics.
 */

import { join } from "node:path";

/**
 * Returns the .kata/ root directory for a given base path.
 */
export function kataRoot(basePath: string): string {
  return join(basePath, ".kata");
}
