/**
 * Auto-transitions — file-mode precondition logic for ensuring directories
 * and branches exist before dispatching a unit.
 *
 * Extracted from auto.ts to enable isolated testing. No pi SDK imports.
 */

import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import {
  resolveMilestonePath,
  resolveDir,
  milestonesDir,
} from "./paths.js";
import { ensureSliceBranch as defaultEnsureSliceBranch } from "./worktree.ts";
import type { KataState } from "./types.js";

/** Unit types that require a slice-level branch checkout. */
const SLICE_BRANCH_UNITS = [
  "research-slice",
  "plan-slice",
  "execute-task",
  "complete-slice",
  "replan-slice",
] as const;

/** Options for overriding dependencies in tests. */
export interface EnsurePreconditionsOptions {
  /** Override ensureSliceBranch for testing (default: real implementation). */
  ensureSliceBranch?: (base: string, mid: string, sid: string) => void;
}

/**
 * Ensure directories, branches, and other prerequisites exist before
 * dispatching a unit. The LLM should never need to mkdir or git checkout.
 */
export function ensurePreconditions(
  unitType: string,
  unitId: string,
  base: string,
  _state: KataState,
  options?: EnsurePreconditionsOptions,
): void {
  const ensureSliceBranch = options?.ensureSliceBranch ?? defaultEnsureSliceBranch;
  const parts = unitId.split("/");
  const mid = parts[0]!;

  // Always ensure milestone dir exists
  const mDir = resolveMilestonePath(base, mid);
  if (!mDir) {
    const newDir = join(milestonesDir(base), mid);
    mkdirSync(join(newDir, "slices"), { recursive: true });
  }

  // For slice-level units, ensure slice dir exists
  if (parts.length >= 2) {
    const sid = parts[1]!;

    // Re-resolve milestone path after potential creation
    const mDirResolved = resolveMilestonePath(base, mid);
    if (mDirResolved) {
      const slicesDir = join(mDirResolved, "slices");
      const sDir = resolveDir(slicesDir, sid);
      if (!sDir) {
        // Create slice dir with bare ID
        const newSliceDir = join(slicesDir, sid);
        mkdirSync(join(newSliceDir, "tasks"), { recursive: true });
      } else {
        // Ensure tasks/ subdir exists
        const tasksDir = join(slicesDir, sDir, "tasks");
        if (!existsSync(tasksDir)) {
          mkdirSync(tasksDir, { recursive: true });
        }
      }
    }
  }

  if (
    (SLICE_BRANCH_UNITS as readonly string[]).includes(unitType) &&
    parts.length >= 2
  ) {
    const sid = parts[1]!;
    ensureSliceBranch(base, mid, sid);
  }
}
