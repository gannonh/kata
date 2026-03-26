/**
 * Auto-dispatch decision logic — pure functions for determining what unit
 * to dispatch next in auto-mode.
 *
 * Extracted from auto.ts to enable isolated testing. No pi SDK imports.
 */

import type { KataState } from "./types.js";
import type { PromptOptions } from "./backend.js";

// Re-export PromptOptions for convenience
export type { PromptOptions };

/**
 * Determine the unit type to dispatch based on current state and options.
 * Returns a string like "plan-milestone", "execute-task", etc.
 */
export function deriveUnitType(state: KataState, options: PromptOptions): string {
  if (options.uatSliceId) return "run-uat";
  if (options.reassessSliceId) return "reassess-roadmap";
  if (options.dispatchResearch === "milestone") return "research-milestone";
  if (options.dispatchResearch === "slice") return "research-slice";
  switch (state.phase) {
    case "pre-planning":
      return "plan-milestone";
    case "planning":
      return "plan-slice";
    case "executing":
    case "verifying":
      return "execute-task";
    case "summarizing":
      return "complete-slice";
    case "completing-milestone":
      return "complete-milestone";
    case "replanning-slice":
      return "replan-slice";
    default:
      return `unknown-${state.phase}`;
  }
}

/**
 * Derive the unit ID from the current state and options.
 * Format: "mid", "mid/sid", or "mid/sid/tid" depending on depth.
 */
export function deriveUnitId(state: KataState, options?: PromptOptions): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  // UAT and reassessment target the *previous* (completed) slice, not the
  // now-active one. Use the dispatch option IDs when available so the unit
  // key correctly identifies the work being done.
  const sid = options?.uatSliceId ?? options?.reassessSliceId ?? state.activeSlice?.id;
  const tid = state.activeTask?.id;
  if (tid && sid && !options?.uatSliceId && !options?.reassessSliceId) return `${mid}/${sid}/${tid}`;
  if (sid) return `${mid}/${sid}`;
  return mid;
}

/**
 * Peek at what the next unit will be after the current one completes.
 * Used for the progress widget display.
 */
export function peekNext(unitType: string, state: KataState): string {
  const sid = state.activeSlice?.id ?? "";
  switch (unitType) {
    case "research-milestone":
      return "plan milestone roadmap";
    case "plan-milestone":
      return "research first slice";
    case "research-slice":
      return `plan ${sid}`;
    case "plan-slice":
      return "execute first task";
    case "execute-task":
      return `continue ${sid}`;
    case "complete-slice":
      return "reassess roadmap";
    case "replan-slice":
      return `re-execute ${sid}`;
    case "reassess-roadmap":
      return "advance to next slice";
    case "run-uat":
      return "reassess roadmap";
    default:
      return "";
  }
}
