/**
 * Linear-mode state derivation — `deriveLinearState`.
 *
 * Derives a full `KataState` from Linear API data (milestones + slice issues).
 * This is the Linear-mode equivalent of `deriveState(basePath)` from the
 * file-based Kata extension.
 *
 * Algorithm (pure-issue-state — no document parsing, no `.kata/` reads):
 *   1. Fetch milestones (sorted client-side by sortOrder in listKataMilestones)
 *   2. Fetch all slice issues for the project in one query
 *   3. Group slices client-side by `projectMilestone?.id`
 *   4. Build registry: milestone is "complete" when all its slices are terminal
 *   5. Find active milestone (first non-complete)
 *   6. Find active slice (first non-terminal in active milestone's group)
 *   7. Derive phase from slice state type + children completion ratio
 *   8. Build and return KataState (requirements always undefined — no REQUIREMENTS.md in Linear mode)
 *
 * Phase derivation:
 *   no milestones                      → "pre-planning"
 *   no slices on active milestone      → "pre-planning"
 *   all milestones complete            → "complete"
 *   slice state: backlog / unstarted   → "planning"
 *   slice state: started               →
 *     0 terminal children              → "executing"
 *     some but not all terminal        → "verifying"
 *     all children terminal            → "summarizing"
 *
 * Errors propagate to the caller — `deriveLinearState` does not swallow them.
 * Callers (T03) catch errors and return `phase: "blocked"`.
 */

import type { LinearMilestone, LinearIssue } from "./linear-types.js";
import type { KataState, ActiveRef, MilestoneRegistryEntry } from "../kata/types.js";
import { listKataSlices, listKataMilestones, parseKataEntityTitle } from "./linear-entities.js";
import { getActiveSliceBranch } from "../kata/worktree.js";

// =============================================================================
// LinearStateClient interface
// =============================================================================

/**
 * Minimal client surface required by `deriveLinearState`.
 *
 * The real `LinearClient` satisfies this interface structurally.
 * Tests may substitute a lightweight inline mock.
 */
export interface LinearStateClient {
  listMilestones(projectId: string): Promise<LinearMilestone[]>;
  listIssues(filter: {
    projectId?: string;
    parentId?: string;
    projectMilestoneId?: string;
    labelIds?: string[];
    teamId?: string;
    stateId?: string;
    first?: number;
  }): Promise<LinearIssue[]>;
}

// =============================================================================
// DeriveLinearStateConfig
// =============================================================================

/**
 * Configuration for `deriveLinearState`.
 */
export interface DeriveLinearStateConfig {
  /** Linear project UUID to derive state from. */
  projectId: string;
  /** Linear team UUID (used for future label resolution if needed). */
  teamId: string;
  /** Label UUID for `kata:slice` — used to filter slice issues. */
  sliceLabelId: string;
  /**
   * Base path for git branch detection.
   * Defaults to `process.cwd()` when omitted.
   */
  basePath?: string;
}

// =============================================================================
// Internal helpers
// =============================================================================

/** True when a Linear workflow state type represents a terminal (done) state. */
function isTerminal(stateType: string): boolean {
  return stateType === "completed" || stateType === "canceled";
}

/**
 * Build an ActiveRef from a Linear milestone, using parseKataEntityTitle for the id/title.
 * Note: for milestones, `linearIssueId` stores the Linear ProjectMilestone UUID (not an Issue UUID);
 * it is the value to pass as `milestoneId` to `kata_list_slices`.
 */
function milestoneRef(m: LinearMilestone): ActiveRef {
  const parsed = parseKataEntityTitle(m.name);
  return {
    id: parsed?.kataId ?? m.id,
    title: parsed?.title ?? m.name,
    linearIssueId: m.id,
  };
}

/** Build an ActiveRef from a Linear issue title, using parseKataEntityTitle for the id/title. */
function issueRef(issue: { id: string; title: string }): ActiveRef {
  const parsed = parseKataEntityTitle(issue.title);
  return {
    id: parsed?.kataId ?? issue.id,
    title: parsed?.title ?? issue.title,
    linearIssueId: issue.id,
  };
}

/** Parse numeric suffix from Kata IDs like S01/T03 for deterministic ordering. */
function parseKataOrdinal(title: string, expectedPrefix: "S" | "T"): number | null {
  const parsed = parseKataEntityTitle(title);
  if (!parsed?.kataId) return null;
  const match = parsed.kataId.match(/^([A-Z])(\d+)$/);
  if (!match) return null;
  const [, prefix, digits] = match;
  if (prefix !== expectedPrefix) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Deterministic ordering for slices/tasks:
 * 1) Kata ordinal (S01 < S02, T01 < T02)
 * 2) title locale compare fallback
 */
function compareByKataOrder(
  a: { title: string },
  b: { title: string },
  expectedPrefix: "S" | "T",
): number {
  const aOrd = parseKataOrdinal(a.title, expectedPrefix);
  const bOrd = parseKataOrdinal(b.title, expectedPrefix);
  if (aOrd !== null && bOrd !== null && aOrd !== bOrd) return aOrd - bOrd;
  if (aOrd !== null && bOrd === null) return -1;
  if (aOrd === null && bOrd !== null) return 1;
  return a.title.localeCompare(b.title);
}

// =============================================================================
// deriveLinearState
// =============================================================================

/**
 * Derive a full `KataState` from Linear API data.
 *
 * Errors (e.g. auth failure, network error) propagate to the caller.
 * Callers are responsible for catching errors and returning a "blocked" state.
 *
 * @param client - Any client that satisfies `LinearStateClient`
 * @param config - Project IDs, label ID, and optional base path
 */
export async function deriveLinearState(
  client: LinearStateClient,
  config: DeriveLinearStateConfig
): Promise<KataState> {
  const basePath = config.basePath ?? process.cwd();
  const activeBranch = getActiveSliceBranch(basePath) ?? undefined;

  // ── 1. Fetch milestones ──────────────────────────────────────────────────
  const milestones = await listKataMilestones(client, config.projectId);

  if (milestones.length === 0) {
    return {
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
      phase: "pre-planning",
      recentDecisions: [],
      blockers: [],
      nextAction: "",
      activeBranch,
      registry: [],
      requirements: undefined,
      progress: {
        milestones: { done: 0, total: 0 },
      },
    };
  }

  // ── 2. Fetch all slices for this project in one call ─────────────────────
  const allSlices = await listKataSlices(client, config.projectId, config.sliceLabelId);

  // ── 3. Group slices by milestone ID ──────────────────────────────────────
  const slicesByMilestone = new Map<string, LinearIssue[]>();
  for (const slice of allSlices) {
    const mid = slice.projectMilestone?.id;
    if (mid) {
      const list = slicesByMilestone.get(mid) ?? [];
      list.push(slice);
      slicesByMilestone.set(mid, list);
    }
  }

  // ── 4. Determine per-milestone completion status ─────────────────────────
  // A milestone is "complete" when it has at least one slice and all are terminal.
  const milestoneComplete = new Map<string, boolean>();
  for (const m of milestones) {
    const slices = slicesByMilestone.get(m.id) ?? [];
    milestoneComplete.set(m.id, slices.length > 0 && slices.every(s => isTerminal(s.state.type)));
  }

  // ── 5. Find active milestone (first non-complete) ─────────────────────────
  const activeMilestoneIdx = milestones.findIndex(m => !milestoneComplete.get(m.id));

  // ── 6. Build registry ─────────────────────────────────────────────────────
  const registry: MilestoneRegistryEntry[] = milestones.map((m, idx) => {
    let status: MilestoneRegistryEntry["status"];
    if (milestoneComplete.get(m.id)) {
      status = "complete";
    } else if (idx === activeMilestoneIdx) {
      status = "active";
    } else {
      status = "pending";
    }
    const parsed = parseKataEntityTitle(m.name);
    return {
      id: parsed?.kataId ?? m.id,
      title: parsed?.title ?? m.name,
      status,
    };
  });

  // ── Progress: milestones ──────────────────────────────────────────────────
  const milestoneDone = milestones.filter(m => milestoneComplete.get(m.id)).length;
  const sliceDone = allSlices.filter(s => isTerminal(s.state.type)).length;
  const sliceTotal = allSlices.length;

  // ── All milestones complete → phase: "complete" ───────────────────────────
  if (activeMilestoneIdx === -1) {
    return {
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
      phase: "complete",
      recentDecisions: [],
      blockers: [],
      nextAction: "",
      activeBranch,
      registry,
      requirements: undefined,
      progress: {
        milestones: { done: milestoneDone, total: milestones.length },
        slices: sliceTotal > 0 ? { done: sliceDone, total: sliceTotal } : undefined,
      },
    };
  }

  const activeMilestoneLinear = milestones[activeMilestoneIdx];
  const activeMilestoneRef = milestoneRef(activeMilestoneLinear);
  const activeMilestoneSlices = slicesByMilestone.get(activeMilestoneLinear.id) ?? [];

  // ── No slices on active milestone → phase: "pre-planning" ────────────────
  if (activeMilestoneSlices.length === 0) {
    return {
      activeMilestone: activeMilestoneRef,
      activeSlice: null,
      activeTask: null,
      phase: "pre-planning",
      recentDecisions: [],
      blockers: [],
      nextAction: "",
      activeBranch,
      registry,
      requirements: undefined,
      progress: {
        milestones: { done: milestoneDone, total: milestones.length },
        slices: sliceTotal > 0 ? { done: sliceDone, total: sliceTotal } : undefined,
      },
    };
  }

  // ── Find active slice (first non-terminal in active milestone's group) ────
  // Sort by Kata ID (S01, S02, ...) so active slice selection is stable.
  const orderedSlices = [...activeMilestoneSlices].sort((a, b) =>
    compareByKataOrder(a, b, "S"),
  );
  const activeSliceLinear = orderedSlices.find(s => !isTerminal(s.state.type));

  if (!activeSliceLinear) {
    // All slices in active milestone are terminal.
    // If slices exist → milestone is ready for completion summary.
    // If no slices exist → milestone still needs planning (pre-planning).
    const hasSlices = activeMilestoneSlices.length > 0;
    return {
      activeMilestone: activeMilestoneRef,
      activeSlice: null,
      activeTask: null,
      phase: hasSlices ? "completing-milestone" : "pre-planning",
      recentDecisions: [],
      blockers: [],
      nextAction: hasSlices
        ? "Write the milestone completion summary."
        : "",
      activeBranch,
      registry,
      requirements: undefined,
      progress: {
        milestones: { done: milestoneDone, total: milestones.length },
        slices: { done: sliceDone, total: sliceTotal },
      },
    };
  }

  const activeSliceRef = issueRef(activeSliceLinear);

  // ── Derive phase from active slice state + children ratio ─────────────────
  const children = [...activeSliceLinear.children.nodes].sort((a, b) =>
    compareByKataOrder(a, b, "T"),
  );
  const terminalChildren = children.filter(c => isTerminal(c.state.type));
  const nonTerminalChildren = children.filter(c => !isTerminal(c.state.type));

  let phase: KataState["phase"];
  let activeTask: ActiveRef | null = null;

  const sliceStateType = activeSliceLinear.state.type;

  if (sliceStateType === "backlog" || sliceStateType === "unstarted") {
    phase = "planning";
    // No active task in planning phase
  } else if (sliceStateType === "started") {
    if (children.length === 0) {
      // No children at all — executing with no task
      phase = "executing";
      activeTask = null;
    } else if (terminalChildren.length === 0) {
      // Children exist, none terminal yet — executing
      phase = "executing";
      const firstChild = nonTerminalChildren[0];
      if (firstChild) {
        activeTask = issueRef(firstChild);
      }
    } else if (terminalChildren.length === children.length) {
      // All children terminal — time to write the summary
      phase = "summarizing";
      activeTask = null;
    } else {
      // Some but not all children terminal — verifying
      phase = "verifying";
      const firstNonTerminal = nonTerminalChildren[0];
      if (firstNonTerminal) {
        activeTask = issueRef(firstNonTerminal);
      }
    }
  } else {
    // completed / canceled — shouldn't be the active slice, but handle gracefully
    phase = "executing";
    activeTask = null;
  }

  // ── Task progress (active slice children) ────────────────────────────────
  const taskTotal = children.length;
  const taskDone = terminalChildren.length;

  return {
    activeMilestone: activeMilestoneRef,
    activeSlice: activeSliceRef,
    activeTask,
    phase,
    recentDecisions: [],
    blockers: [],
    nextAction: "",
    activeBranch,
    registry,
    requirements: undefined,
    progress: {
      milestones: { done: milestoneDone, total: milestones.length },
      slices: { done: sliceDone, total: sliceTotal },
      tasks: taskTotal > 0 ? { done: taskDone, total: taskTotal } : undefined,
    },
  };
}
