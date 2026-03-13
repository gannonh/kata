/**
 * Pure helper functions for Kata↔Linear entity mapping.
 *
 * No API calls in the pure mapping section — everything is pure logic that
 * T02–T04 build on.
 *
 * Title convention:  `[M001] Milestone title`
 *                    `[S01] Slice title`
 *                    `[T01] Task title`
 *
 * The bracket prefix is round-trippable: formatKataEntityTitle → parseKataEntityTitle
 * recovers the original kataId and title with a simple regex.
 *
 * Phase mapping:
 *   Kata phase    → Linear state type
 *   backlog       → backlog
 *   planning      → unstarted
 *   executing     → started
 *   verifying     → started   (verifying vs executing distinguished by sub-issue ratio — S05)
 *   done          → completed
 *
 * Reverse mapping:
 *   Linear type  → Kata phase
 *   backlog      → backlog
 *   unstarted    → planning
 *   started      → executing  (caller differentiates verifying by sub-issue completion ratio)
 *   completed    → done
 *   canceled     → done        (treat as terminal)
 *
 * Entity-creation functions (T02):
 *   ensureKataLabels     — idempotent label provisioning (kata:milestone, kata:slice, kata:task)
 *   createKataMilestone  — create a Linear ProjectMilestone with a formatted name
 *   createKataSlice      — create a Linear issue representing a Kata slice
 *   createKataTask       — create a Linear sub-issue representing a Kata task
 *
 * Label color constants (not user-configurable):
 *   kata:milestone  #7C3AED  (violet)
 *   kata:slice      #2563EB  (blue)
 *   kata:task       #16A34A  (green)
 */

import type {
  KataPhase,
  KataEntityCreationConfig,
  KataLabelSet,
  LinearLabel,
  LinearIssue,
  LinearMilestone,
  LinearWorkflowState,
  MilestoneCreateInput,
  IssueCreateInput,
} from "./linear-types.js";

// =============================================================================
// Title formatting
// =============================================================================

const TITLE_PREFIX_RE = /^\[([A-Z0-9]+)\]\s+(.+)$/;

/**
 * Format a Kata entity title for storage in Linear.
 *
 * @example
 *   formatKataEntityTitle("M001", "Scaffold integration") → "[M001] Scaffold integration"
 */
export function formatKataEntityTitle(kataId: string, title: string): string {
  return `[${kataId}] ${title}`;
}

/**
 * Parse a Linear issue title back to its Kata components.
 * Returns `null` when the title does not match the `[ID] Title` format.
 *
 * @example
 *   parseKataEntityTitle("[S01] Slice name") → { kataId: "S01", title: "Slice name" }
 *   parseKataEntityTitle("plain title")      → null
 */
export function parseKataEntityTitle(
  linearTitle: string
): { kataId: string; title: string } | null {
  const match = TITLE_PREFIX_RE.exec(linearTitle);
  if (!match) return null;
  return { kataId: match[1], title: match[2] };
}

// =============================================================================
// Phase ↔ state-type mapping
// =============================================================================

/**
 * Map a Kata execution phase to the corresponding Linear workflow state *type*.
 * The type is used to select a concrete state via getLinearStateForKataPhase.
 */
export function getLinearStateTypeForKataPhase(
  phase: KataPhase
): LinearWorkflowState["type"] {
  switch (phase) {
    case "backlog":
      return "backlog";
    case "planning":
      return "unstarted";
    case "executing":
      return "started";
    case "verifying":
      return "started";
    case "done":
      return "completed";
  }
}

/**
 * Map a Linear workflow state type back to the canonical Kata phase.
 *
 * Note: `started` maps to `executing`; callers that need to distinguish
 * `verifying` must inspect sub-issue completion ratio (S05's responsibility).
 */
export function getKataPhaseFromLinearStateType(
  stateType: LinearWorkflowState["type"]
): KataPhase {
  switch (stateType) {
    case "backlog":
      return "backlog";
    case "unstarted":
      return "planning";
    case "started":
      return "executing";
    case "completed":
      return "done";
    case "canceled":
      return "done"; // treat as terminal
  }
}

/**
 * Pick the first workflow state whose type matches the given Kata phase.
 * Returns `null` when the list is empty or no state matches the required type.
 *
 * @example
 *   getLinearStateForKataPhase(states, "executing") → first state with type "started"
 *   getLinearStateForKataPhase([], "executing")     → null
 */
export function getLinearStateForKataPhase(
  states: LinearWorkflowState[],
  phase: KataPhase
): LinearWorkflowState | null {
  const targetType = getLinearStateTypeForKataPhase(phase);
  return states.find((s) => s.type === targetType) ?? null;
}

// =============================================================================
// Entity-creation client interface
// =============================================================================

/**
 * Minimal LinearClient surface required by entity-creation functions.
 *
 * The real LinearClient satisfies this interface structurally.
 * Tests may substitute a lightweight inline mock.
 */
export interface LinearEntityClient {
  ensureLabel(
    name: string,
    opts?: { teamId?: string; color?: string; description?: string }
  ): Promise<LinearLabel>;
  createMilestone(input: MilestoneCreateInput): Promise<LinearMilestone>;
  createIssue(input: IssueCreateInput): Promise<LinearIssue>;
  listIssues(filter: {
    projectId?: string;
    parentId?: string;
    labelIds?: string[];
    teamId?: string;
    stateId?: string;
    first?: number;
  }): Promise<LinearIssue[]>;
  listMilestones(projectId: string): Promise<LinearMilestone[]>;
}

// =============================================================================
// Label constants
// =============================================================================

/** Fixed color hex values for Kata labels. Not user-configurable. */
const KATA_LABEL_COLORS = {
  milestone: "#7C3AED", // violet — milestone-level
  slice: "#2563EB",     // blue   — in-progress work unit
  task: "#16A34A",      // green  — leaf task
} as const;

/** Fixed label names for the three Kata entity kinds. */
const KATA_LABEL_NAMES = {
  milestone: "kata:milestone",
  slice: "kata:slice",
  task: "kata:task",
} as const;

// =============================================================================
// ensureKataLabels
// =============================================================================

/**
 * Idempotently provision the three Kata labels in the target team.
 *
 * If a label already exists (potentially with a different color), the existing
 * label is returned unchanged — color is advisory only.
 *
 * **Call this once before any entity-creation function.** Pass the returned
 * KataLabelSet to createKataSlice / createKataTask so label IDs are resolved
 * a single time, not on every call.
 *
 * @example
 *   const labelSet = await ensureKataLabels(client, teamId);
 *   const slice = await createKataSlice(client, { teamId, projectId, labelSet }, opts);
 */
export async function ensureKataLabels(
  client: Pick<LinearEntityClient, "ensureLabel">,
  teamId: string
): Promise<KataLabelSet> {
  const [milestone, slice, task] = await Promise.all([
    client.ensureLabel(KATA_LABEL_NAMES.milestone, {
      teamId,
      color: KATA_LABEL_COLORS.milestone,
    }),
    client.ensureLabel(KATA_LABEL_NAMES.slice, {
      teamId,
      color: KATA_LABEL_COLORS.slice,
    }),
    client.ensureLabel(KATA_LABEL_NAMES.task, {
      teamId,
      color: KATA_LABEL_COLORS.task,
    }),
  ]);
  return { milestone, slice, task };
}

// =============================================================================
// createKataMilestone
// =============================================================================

export interface CreateKataMilestoneOpts {
  /** Kata milestone ID, e.g. "M001". Formatted into the milestone name. */
  kataId: string;
  /** Human-readable milestone title. */
  title: string;
  description?: string;
  /** ISO date string, e.g. "2025-06-30". */
  targetDate?: string;
}

/**
 * Create a Linear ProjectMilestone representing a Kata milestone.
 *
 * The milestone name is formatted as `[M001] Title` via formatKataEntityTitle.
 * Labels are NOT applied — Linear milestones are ProjectMilestone entities,
 * not issues, and do not support labels.
 *
 * @example
 *   const milestone = await createKataMilestone(
 *     client,
 *     { projectId },
 *     { kataId: "M001", title: "Scaffold integration" }
 *   );
 */
export async function createKataMilestone(
  client: Pick<LinearEntityClient, "createMilestone">,
  config: { projectId: string },
  opts: CreateKataMilestoneOpts
): Promise<LinearMilestone> {
  return client.createMilestone({
    name: formatKataEntityTitle(opts.kataId, opts.title),
    projectId: config.projectId,
    description: opts.description,
    targetDate: opts.targetDate,
  });
}

// =============================================================================
// createKataSlice
// =============================================================================

export interface CreateKataSliceOpts {
  /** Kata slice ID, e.g. "S01". Formatted into the issue title. */
  kataId: string;
  /** Human-readable slice title. */
  title: string;
  description?: string;
  /**
   * Linear ProjectMilestone UUID to attach this slice to.
   * When provided, sets `projectMilestoneId` on the created issue.
   */
  milestoneId?: string;
  /**
   * Initial Kata phase for the slice issue.
   * Requires `states` to be provided for phase → stateId resolution.
   * Omit to let Linear assign the team's default state.
   */
  initialPhase?: KataPhase;
  /**
   * Workflow states for the team. Required when `initialPhase` is set.
   * Passed to getLinearStateForKataPhase to resolve the stateId.
   */
  states?: LinearWorkflowState[];
}

/**
 * Create a Linear issue representing a Kata slice.
 *
 * Applies the `kata:slice` label from the provided KataLabelSet.
 * Optionally attaches to a milestone and sets an initial workflow state.
 *
 * @example
 *   const slice = await createKataSlice(
 *     client,
 *     { teamId, projectId, labelSet },
 *     { kataId: "S01", title: "Entity mapping", milestoneId: milestone.id }
 *   );
 */
export async function createKataSlice(
  client: Pick<LinearEntityClient, "createIssue">,
  config: KataEntityCreationConfig,
  opts: CreateKataSliceOpts
): Promise<LinearIssue> {
  const stateId =
    opts.initialPhase && opts.states
      ? (getLinearStateForKataPhase(opts.states, opts.initialPhase)?.id ?? undefined)
      : undefined;

  const input: IssueCreateInput = {
    title: formatKataEntityTitle(opts.kataId, opts.title),
    teamId: config.teamId,
    projectId: config.projectId,
    labelIds: [config.labelSet.slice.id],
  };

  if (opts.description !== undefined) input.description = opts.description;
  if (opts.milestoneId !== undefined) input.projectMilestoneId = opts.milestoneId;
  if (stateId !== undefined) input.stateId = stateId;

  return client.createIssue(input);
}

// =============================================================================
// createKataTask
// =============================================================================

export interface CreateKataTaskOpts {
  /** Kata task ID, e.g. "T01". Formatted into the issue title. */
  kataId: string;
  /** Human-readable task title. */
  title: string;
  description?: string;
  /**
   * Linear issue UUID of the parent slice issue.
   * Sets `parentId` on the created sub-issue.
   */
  sliceIssueId: string;
  /**
   * Initial Kata phase for the task issue.
   * Requires `states` to be provided for phase → stateId resolution.
   * Omit to let Linear assign the team's default state.
   */
  initialPhase?: KataPhase;
  /**
   * Workflow states for the team. Required when `initialPhase` is set.
   */
  states?: LinearWorkflowState[];
}

/**
 * Create a Linear sub-issue representing a Kata task.
 *
 * The task is created as a child of the slice issue (via `parentId`).
 * Applies the `kata:task` label from the provided KataLabelSet.
 * Does NOT set `projectMilestoneId` — tasks inherit the milestone via their parent.
 *
 * @example
 *   const task = await createKataTask(
 *     client,
 *     { teamId, projectId, labelSet },
 *     { kataId: "T01", title: "Types and mapping", sliceIssueId: slice.id }
 *   );
 */
export async function createKataTask(
  client: Pick<LinearEntityClient, "createIssue">,
  config: KataEntityCreationConfig,
  opts: CreateKataTaskOpts
): Promise<LinearIssue> {
  const stateId =
    opts.initialPhase && opts.states
      ? (getLinearStateForKataPhase(opts.states, opts.initialPhase)?.id ?? undefined)
      : undefined;

  const input: IssueCreateInput = {
    title: formatKataEntityTitle(opts.kataId, opts.title),
    teamId: config.teamId,
    projectId: config.projectId,
    parentId: opts.sliceIssueId,
    labelIds: [config.labelSet.task.id],
  };

  if (opts.description !== undefined) input.description = opts.description;
  if (stateId !== undefined) input.stateId = stateId;

  return client.createIssue(input);
}

// =============================================================================
// listKataSlices
// =============================================================================

/**
 * List all Linear issues representing Kata slices in a project.
 *
 * Filters by `kata:slice` label within the given project. Returns all issues
 * that have been tagged with the slice label, regardless of workflow state.
 *
 * @param client - LinearEntityClient (or compatible LinearClient)
 * @param projectId - Linear project UUID to scope the query
 * @param sliceLabelId - Label UUID for `kata:slice` (from KataLabelSet.slice.id)
 *
 * @example
 *   const labelSet = await ensureKataLabels(client, teamId);
 *   const slices = await listKataSlices(client, projectId, labelSet.slice.id);
 */
export async function listKataSlices(
  client: Pick<LinearEntityClient, "listIssues">,
  projectId: string,
  sliceLabelId: string
): Promise<LinearIssue[]> {
  return client.listIssues({ projectId, labelIds: [sliceLabelId] });
}

// =============================================================================
// listKataTasks
// =============================================================================

/**
 * List all Linear sub-issues representing Kata tasks for a given slice issue.
 *
 * Queries by `parentId` — returns all direct children of the slice issue.
 * Tasks are identified by their parent relationship, not by label, so this
 * works even if the `kata:task` label was not applied or was removed.
 *
 * @param client - LinearEntityClient (or compatible LinearClient)
 * @param sliceIssueId - Linear issue UUID of the parent slice issue
 *
 * @example
 *   const tasks = await listKataTasks(client, slice.id);
 */
export async function listKataTasks(
  client: Pick<LinearEntityClient, "listIssues">,
  sliceIssueId: string
): Promise<LinearIssue[]> {
  return client.listIssues({ parentId: sliceIssueId });
}

// =============================================================================
// listKataMilestones
// =============================================================================

/**
 * List all Linear ProjectMilestones for a given project.
 *
 * Delegates directly to `client.listMilestones(projectId)`.
 * Results are already sorted by `sortOrder` as returned by the Linear API.
 *
 * @param client - Any client that satisfies `{ listMilestones(projectId): Promise<LinearMilestone[]> }`
 * @param projectId - Linear project UUID
 *
 * @example
 *   const milestones = await listKataMilestones(client, "proj-uuid");
 */
export async function listKataMilestones(
  client: Pick<LinearEntityClient, "listMilestones">,
  projectId: string
): Promise<LinearMilestone[]> {
  return client.listMilestones(projectId);
}
