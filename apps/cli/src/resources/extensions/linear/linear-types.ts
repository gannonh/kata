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

export interface LinearConnection<T> {
  nodes: T[];
  pageInfo: LinearPageInfo;
}

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
  state: string;
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
  priority: number;
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
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Input Types
// =============================================================================

export interface ProjectCreateInput {
  name: string;
  description?: string;
  teamIds: string[];       // at least one team UUID
  state?: string;          // "planned" | "started" | "paused" | "completed" | "canceled" | "backlog"
  startDate?: string;      // ISO date
  targetDate?: string;     // ISO date
}

export interface ProjectUpdateInput {
  name?: string;
  description?: string;
  state?: string;
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
  priority?: number;       // 0=none, 1=urgent, 2=high, 3=medium, 4=low
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
  priority?: number;
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
