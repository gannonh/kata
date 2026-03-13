/**
 * TypeScript interfaces for Linear entities.
 *
 * Minimal shapes — only fields Kata needs, not the full Linear schema.
 * Pure interfaces with no runtime dependencies.
 */

// =============================================================================
// Pagination
// =============================================================================

export interface LinearPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

// =============================================================================
// Shared Unions
// =============================================================================

export type ProjectState = "planned" | "started" | "paused" | "completed" | "canceled" | "backlog";
export type LinearPriority = 0 | 1 | 2 | 3 | 4;

// =============================================================================
// Entities
// =============================================================================

export interface LinearUser {
  id: string;
  name: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  active: boolean;
}

export interface LinearTeam {
  id: string;
  key: string;
  name: string;
  description?: string;
}

export interface LinearProject {
  id: string;
  name: string;
  slugId: string;
  description?: string;
  url: string;
  state: ProjectState;
  startDate?: string;
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinearMilestone {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  targetDate?: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinearWorkflowState {
  id: string;
  name: string;
  type: "backlog" | "unstarted" | "started" | "completed" | "canceled";
  color: string;
  position: number;
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
  description?: string;
  isGroup: boolean;
  parentId?: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: LinearPriority;
  estimate?: number;
  url: string;
  state: LinearWorkflowState;
  assignee?: LinearUser | null;
  labels: LinearLabel[];
  parent?: { id: string; identifier: string; title: string } | null;
  children: { nodes: Array<{ id: string; identifier: string; title: string; state: LinearWorkflowState }> };
  project?: { id: string; name: string } | null;
  projectMilestone?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinearDocument {
  id: string;
  title: string;
  content: string;
  icon?: string;
  color?: string;
  project?: { id: string; name: string } | null;
  issue?: { id: string; identifier: string } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Discriminated union for document attachment targets.
 * A document attaches to exactly one: a project or an issue.
 * Never set both — Linear accepts only one attachment target per document.
 */
export type DocumentAttachment = { projectId: string } | { issueId: string };

// =============================================================================
// Kata Entity Mapping
// =============================================================================

/**
 * Kata execution phase — maps to Linear workflow state types.
 *
 * Phase → state type:
 *   backlog    → backlog
 *   planning   → unstarted
 *   executing  → started
 *   verifying  → started  (sub-issue completion distinguishes verifying from executing — S05)
 *   done       → completed
 */
export type KataPhase = "backlog" | "planning" | "executing" | "verifying" | "done";

/** Kata entity kind — determines title prefix and label applied on creation. */
export type KataEntityType = "milestone" | "slice" | "task";

/**
 * The three Linear labels provisioned by ensureKataLabels.
 * Each maps to a Kata entity kind.
 */
export interface KataLabelSet {
  milestone: LinearLabel;
  slice: LinearLabel;
  task: LinearLabel;
}

/**
 * Shared config passed to entity-creation functions.
 * Holds the resolved IDs that creation calls need.
 */
export interface KataEntityCreationConfig {
  teamId: string;
  projectId: string;
  labelSet: KataLabelSet;
}

// =============================================================================
// Input Types
// =============================================================================

export interface ProjectCreateInput {
  name: string;
  description?: string;
  teamIds: [string, ...string[]];
  state?: ProjectState;
  startDate?: string;      // ISO date
  targetDate?: string;     // ISO date
}

export interface ProjectUpdateInput {
  name?: string;
  description?: string;
  state?: ProjectState;
  startDate?: string;
  targetDate?: string;
}

export interface MilestoneCreateInput {
  name: string;
  projectId: string;       // milestones belong to projects, not teams
  description?: string;
  targetDate?: string;
  sortOrder?: number;
}

export interface MilestoneUpdateInput {
  name?: string;
  description?: string;
  targetDate?: string;
  sortOrder?: number;
}

export interface IssueCreateInput {
  title: string;
  teamId: string;
  description?: string;
  parentId?: string;       // UUID — for sub-issues
  projectId?: string;
  projectMilestoneId?: string;
  stateId?: string;
  assigneeId?: string;
  labelIds?: string[];
  priority?: LinearPriority;
  estimate?: number;
}

export interface IssueUpdateInput {
  title?: string;
  description?: string;
  parentId?: string | null;
  projectId?: string | null;
  projectMilestoneId?: string | null;
  stateId?: string;
  assigneeId?: string | null;
  labelIds?: string[];
  priority?: LinearPriority;
  estimate?: number;
}

export interface IssueFilter {
  teamId?: string;
  projectId?: string;
  parentId?: string;
  stateId?: string;
  labelIds?: string[];
  assigneeId?: string;
  first?: number;
}

export interface LabelCreateInput {
  name: string;
  color?: string;
  description?: string;
  teamId?: string;         // omit for workspace-level label
}

export interface DocumentCreateInput {
  title: string;
  content?: string;        // markdown
  projectId?: string;
  issueId?: string;        // [Internal] — works but unofficial; verified in integration tests
  icon?: string;
  color?: string;
}

export interface DocumentUpdateInput {
  title?: string;
  content?: string;
  icon?: string;
  color?: string;
}
