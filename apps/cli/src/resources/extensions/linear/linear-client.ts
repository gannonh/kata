/**
 * Linear GraphQL Client.
 *
 * Thin wrapper around native fetch — zero external dependencies.
 * Auth: LINEAR_API_KEY as Authorization header (no Bearer prefix).
 * Endpoint: https://api.linear.app/graphql (single POST endpoint).
 */

import {
  fetchWithRetry,
  LinearGraphQLError,
  extractRateLimitInfo,
  type RateLimitInfo,
} from "./http.js";

import type {
  LinearTeam,
  LinearProject,
  LinearMilestone,
  LinearIssue,
  LinearDocument,
  LinearLabel,
  LinearWorkflowState,
  LinearUser,
  LinearPageInfo,
  ProjectCreateInput,
  ProjectUpdateInput,
  MilestoneCreateInput,
  MilestoneUpdateInput,
  IssueCreateInput,
  IssueUpdateInput,
  IssueFilter,
  LabelCreateInput,
  DocumentCreateInput,
  DocumentUpdateInput,
} from "./linear-types.js";

const LINEAR_API_ENDPOINT = "https://api.linear.app/graphql";

// =============================================================================
// GraphQL Response Shapes (internal)
// =============================================================================

interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

// =============================================================================
// Client
// =============================================================================

export class LinearClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private lastRateLimit?: RateLimitInfo;

  constructor(apiKey: string, endpoint?: string) {
    this.apiKey = apiKey;
    this.endpoint = endpoint ?? LINEAR_API_ENDPOINT;
  }

  /** Get the most recent rate limit info from the last API call. */
  getRateLimitInfo(): RateLimitInfo | undefined {
    return this.lastRateLimit;
  }

  /**
   * Execute a GraphQL query or mutation against the Linear API.
   * Returns the typed `data` field from the response.
   * Throws LinearGraphQLError for GraphQL-level errors.
   * Throws LinearHttpError for HTTP-level errors (via fetchWithRetry).
   */
  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetchWithRetry(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,  // No "Bearer" prefix per Linear API convention
      },
      body: JSON.stringify({ query, variables }),
    });

    this.lastRateLimit = extractRateLimitInfo(response);

    const json = (await response.json()) as GraphQLResponse<T>;

    if (json.errors && json.errors.length > 0) {
      const firstMsg = json.errors[0].message;
      throw new LinearGraphQLError(firstMsg, json.errors);
    }

    if (!json.data) {
      throw new LinearGraphQLError("No data in GraphQL response", []);
    }

    return json.data;
  }

  // ===========================================================================
  // Pagination
  // ===========================================================================

  /**
   * Generic cursor pagination helper. Collects all pages by following
   * pageInfo.hasNextPage / endCursor.
   *
   * @param queryFn — Function that takes an optional cursor and returns a page
   * @param maxPages — Safety cap to prevent runaway pagination (default: 10, ~2500 results)
   */
  async paginate<T>(
    queryFn: (cursor?: string) => Promise<{ nodes: T[]; pageInfo: LinearPageInfo }>,
    maxPages: number = 10,
  ): Promise<T[]> {
    const allNodes: T[] = [];
    let cursor: string | undefined;
    let pages = 0;

    while (pages < maxPages) {
      const page = await queryFn(cursor);
      allNodes.push(...page.nodes);
      pages++;

      if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) {
        break;
      }
      cursor = page.pageInfo.endCursor;
    }

    return allNodes;
  }

  // ===========================================================================
  // Viewer
  // ===========================================================================

  async getViewer(): Promise<LinearUser> {
    const data = await this.graphql<{ viewer: LinearUser }>(`
      query {
        viewer {
          id
          name
          email
          displayName
          avatarUrl
          active
        }
      }
    `);
    return data.viewer;
  }

  // ===========================================================================
  // Teams
  // ===========================================================================

  async listTeams(): Promise<LinearTeam[]> {
    return this.paginate(async (cursor) => {
      const data = await this.graphql<{
        teams: { nodes: LinearTeam[]; pageInfo: LinearPageInfo };
      }>(`
        query ListTeams($after: String) {
          teams(first: 100, after: $after) {
            nodes {
              id
              key
              name
              description
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, { after: cursor });
      return data.teams;
    });
  }

  async getTeam(idOrKey: string): Promise<LinearTeam | null> {
    // Try by key first (most common usage)
    try {
      const data = await this.graphql<{
        teams: { nodes: LinearTeam[] };
      }>(`
        query GetTeamByKey($key: String!) {
          teams(filter: { key: { eq: $key } }) {
            nodes {
              id
              key
              name
              description
            }
          }
        }
      `, { key: idOrKey });
      if (data.teams.nodes.length > 0) return data.teams.nodes[0];
    } catch {
      // Fall through to ID lookup
    }

    // Try by ID
    try {
      const data = await this.graphql<{ team: LinearTeam }>(`
        query GetTeamById($id: String!) {
          team(id: $id) {
            id
            key
            name
            description
          }
        }
      `, { id: idOrKey });
      return data.team ?? null;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Projects
  // ===========================================================================

  private static readonly PROJECT_FIELDS = `
    id
    name
    slugId
    description
    url
    state
    startDate
    targetDate
    createdAt
    updatedAt
  `;

  async createProject(input: ProjectCreateInput): Promise<LinearProject> {
    const data = await this.graphql<{
      projectCreate: { success: boolean; project: LinearProject };
    }>(`
      mutation CreateProject($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          success
          project {
            ${LinearClient.PROJECT_FIELDS}
          }
        }
      }
    `, { input });
    return data.projectCreate.project;
  }

  async getProject(id: string): Promise<LinearProject | null> {
    try {
      const data = await this.graphql<{ project: LinearProject }>(`
        query GetProject($id: String!) {
          project(id: $id) {
            ${LinearClient.PROJECT_FIELDS}
          }
        }
      `, { id });
      return data.project ?? null;
    } catch {
      return null;
    }
  }

  async listProjects(opts?: { teamId?: string; first?: number }): Promise<LinearProject[]> {
    return this.paginate(async (cursor) => {
      const filter: Record<string, unknown> = {};
      if (opts?.teamId) {
        filter.accessibleTeams = { id: { eq: opts.teamId } };
      }
      const data = await this.graphql<{
        projects: { nodes: LinearProject[]; pageInfo: LinearPageInfo };
      }>(`
        query ListProjects($first: Int, $after: String, $filter: ProjectFilter) {
          projects(first: $first, after: $after, filter: $filter) {
            nodes {
              ${LinearClient.PROJECT_FIELDS}
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, {
        first: opts?.first ?? 50,
        after: cursor,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      });
      return data.projects;
    });
  }

  async updateProject(id: string, input: ProjectUpdateInput): Promise<LinearProject> {
    const data = await this.graphql<{
      projectUpdate: { success: boolean; project: LinearProject };
    }>(`
      mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) {
        projectUpdate(id: $id, input: $input) {
          success
          project {
            ${LinearClient.PROJECT_FIELDS}
          }
        }
      }
    `, { id, input });
    return data.projectUpdate.project;
  }

  // ===========================================================================
  // Milestones (belong to Projects)
  // ===========================================================================

  private static readonly MILESTONE_FIELDS = `
    id
    name
    description
    sortOrder
    targetDate
    createdAt
    updatedAt
  `;

  async createMilestone(input: MilestoneCreateInput): Promise<LinearMilestone> {
    const data = await this.graphql<{
      projectMilestoneCreate: { success: boolean; projectMilestone: LinearMilestone };
    }>(`
      mutation CreateMilestone($input: ProjectMilestoneCreateInput!) {
        projectMilestoneCreate(input: $input) {
          success
          projectMilestone {
            ${LinearClient.MILESTONE_FIELDS}
          }
        }
      }
    `, { input });
    return data.projectMilestoneCreate.projectMilestone;
  }

  async getMilestone(id: string): Promise<LinearMilestone | null> {
    try {
      const data = await this.graphql<{ projectMilestone: LinearMilestone }>(`
        query GetMilestone($id: String!) {
          projectMilestone(id: $id) {
            ${LinearClient.MILESTONE_FIELDS}
          }
        }
      `, { id });
      return data.projectMilestone ?? null;
    } catch {
      return null;
    }
  }

  async listMilestones(projectId: string): Promise<LinearMilestone[]> {
    // Milestones are accessed through the project
    const data = await this.graphql<{
      project: { projectMilestones: { nodes: LinearMilestone[] } };
    }>(`
      query ListMilestones($projectId: String!) {
        project(id: $projectId) {
          projectMilestones {
            nodes {
              ${LinearClient.MILESTONE_FIELDS}
            }
          }
        }
      }
    `, { projectId });
    return data.project?.projectMilestones?.nodes ?? [];
  }

  async updateMilestone(id: string, input: MilestoneUpdateInput): Promise<LinearMilestone> {
    const data = await this.graphql<{
      projectMilestoneUpdate: { success: boolean; projectMilestone: LinearMilestone };
    }>(`
      mutation UpdateMilestone($id: String!, $input: ProjectMilestoneUpdateInput!) {
        projectMilestoneUpdate(id: $id, input: $input) {
          success
          projectMilestone {
            ${LinearClient.MILESTONE_FIELDS}
          }
        }
      }
    `, { id, input });
    return data.projectMilestoneUpdate.projectMilestone;
  }

  // ===========================================================================
  // Issues (including sub-issues via parentId)
  // ===========================================================================

  private static readonly ISSUE_FIELDS = `
    id
    identifier
    title
    description
    priority
    estimate
    url
    createdAt
    updatedAt
    state {
      id
      name
      type
      color
      position
    }
    assignee {
      id
      name
      email
      displayName
    }
    labels {
      nodes {
        id
        name
        color
      }
    }
    parent {
      id
      identifier
      title
    }
    children {
      nodes {
        id
        identifier
        title
        state {
          id
          name
          type
          color
          position
        }
      }
    }
    project {
      id
      name
    }
    projectMilestone {
      id
      name
    }
  `;

  async createIssue(input: IssueCreateInput): Promise<LinearIssue> {
    const data = await this.graphql<{
      issueCreate: { success: boolean; issue: LinearIssue };
    }>(`
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            ${LinearClient.ISSUE_FIELDS}
          }
        }
      }
    `, { input });
    return this.normalizeIssue(data.issueCreate.issue);
  }

  async getIssue(id: string): Promise<LinearIssue | null> {
    try {
      const data = await this.graphql<{ issue: LinearIssue }>(`
        query GetIssue($id: String!) {
          issue(id: $id) {
            ${LinearClient.ISSUE_FIELDS}
          }
        }
      `, { id });
      return data.issue ? this.normalizeIssue(data.issue) : null;
    } catch {
      return null;
    }
  }

  async listIssues(filter: IssueFilter): Promise<LinearIssue[]> {
    const gqlFilter: Record<string, unknown> = {};
    if (filter.teamId) gqlFilter.team = { id: { eq: filter.teamId } };
    if (filter.projectId) gqlFilter.project = { id: { eq: filter.projectId } };
    if (filter.parentId) gqlFilter.parent = { id: { eq: filter.parentId } };
    if (filter.stateId) gqlFilter.state = { id: { eq: filter.stateId } };
    if (filter.assigneeId) gqlFilter.assignee = { id: { eq: filter.assigneeId } };
    if (filter.labelIds && filter.labelIds.length > 0) {
      gqlFilter.labels = { some: { id: { in: filter.labelIds } } };
    }

    return this.paginate(async (cursor) => {
      const data = await this.graphql<{
        issues: { nodes: LinearIssue[]; pageInfo: LinearPageInfo };
      }>(`
        query ListIssues($first: Int, $after: String, $filter: IssueFilter) {
          issues(first: $first, after: $after, filter: $filter) {
            nodes {
              ${LinearClient.ISSUE_FIELDS}
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, {
        first: filter.first ?? 50,
        after: cursor,
        filter: Object.keys(gqlFilter).length > 0 ? gqlFilter : undefined,
      });
      return data.issues;
    });
  }

  async updateIssue(id: string, input: IssueUpdateInput): Promise<LinearIssue> {
    const data = await this.graphql<{
      issueUpdate: { success: boolean; issue: LinearIssue };
    }>(`
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            ${LinearClient.ISSUE_FIELDS}
          }
        }
      }
    `, { id, input });
    return this.normalizeIssue(data.issueUpdate.issue);
  }

  /** Normalize issue labels from connection format to flat array. */
  private normalizeIssue(issue: LinearIssue): LinearIssue {
    // Labels come back as { nodes: [...] } — flatten to array
    if (issue.labels && "nodes" in issue.labels) {
      issue.labels = (issue.labels as unknown as { nodes: LinearLabel[] }).nodes;
    }
    return issue;
  }

  // ===========================================================================
  // Workflow States
  // ===========================================================================

  async listWorkflowStates(teamId: string): Promise<LinearWorkflowState[]> {
    return this.paginate(async (cursor) => {
      const data = await this.graphql<{
        workflowStates: { nodes: LinearWorkflowState[]; pageInfo: LinearPageInfo };
      }>(`
        query ListWorkflowStates($after: String, $filter: WorkflowStateFilter) {
          workflowStates(first: 100, after: $after, filter: $filter) {
            nodes {
              id
              name
              type
              color
              position
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, {
        after: cursor,
        filter: { team: { id: { eq: teamId } } },
      });
      return data.workflowStates;
    });
  }

  // ===========================================================================
  // Labels
  // ===========================================================================

  async createLabel(input: LabelCreateInput): Promise<LinearLabel> {
    const data = await this.graphql<{
      issueLabelCreate: { success: boolean; issueLabel: LinearLabel };
    }>(`
      mutation CreateLabel($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel {
            id
            name
            color
            description
            isGroup
          }
        }
      }
    `, { input });
    return data.issueLabelCreate.issueLabel;
  }

  async listLabels(opts?: { teamId?: string }): Promise<LinearLabel[]> {
    return this.paginate(async (cursor) => {
      const filter: Record<string, unknown> = {};
      if (opts?.teamId) {
        filter.team = { id: { eq: opts.teamId } };
      }
      const data = await this.graphql<{
        issueLabels: { nodes: LinearLabel[]; pageInfo: LinearPageInfo };
      }>(`
        query ListLabels($first: Int, $after: String, $filter: IssueLabelFilter) {
          issueLabels(first: $first, after: $after, filter: $filter) {
            nodes {
              id
              name
              color
              description
              isGroup
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, {
        first: 100,
        after: cursor,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      });
      return data.issueLabels;
    });
  }

  async getLabel(id: string): Promise<LinearLabel | null> {
    try {
      const data = await this.graphql<{ issueLabel: LinearLabel }>(`
        query GetLabel($id: String!) {
          issueLabel(id: $id) {
            id
            name
            color
            description
            isGroup
          }
        }
      `, { id });
      return data.issueLabel ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get or create a label by name. Idempotent — calling twice with the
   * same name returns the same label without creating a duplicate.
   *
   * If teamId is omitted, searches/creates workspace-level labels.
   */
  async ensureLabel(
    name: string,
    opts?: { teamId?: string; color?: string; description?: string },
  ): Promise<LinearLabel> {
    // Search for existing label by name
    const existing = await this.listLabels({ teamId: opts?.teamId });
    const match = existing.find(
      (l) => l.name.toLowerCase() === name.toLowerCase(),
    );
    if (match) return match;

    // Create if not found
    return this.createLabel({
      name,
      color: opts?.color,
      description: opts?.description,
      teamId: opts?.teamId,
    });
  }

  // ===========================================================================
  // Documents
  // ===========================================================================

  private static readonly DOCUMENT_FIELDS = `
    id
    title
    content
    icon
    color
    createdAt
    updatedAt
  `;

  async createDocument(input: DocumentCreateInput): Promise<LinearDocument> {
    const data = await this.graphql<{
      documentCreate: { success: boolean; document: LinearDocument };
    }>(`
      mutation CreateDocument($input: DocumentCreateInput!) {
        documentCreate(input: $input) {
          success
          document {
            ${LinearClient.DOCUMENT_FIELDS}
          }
        }
      }
    `, { input });
    return data.documentCreate.document;
  }

  async getDocument(id: string): Promise<LinearDocument | null> {
    try {
      const data = await this.graphql<{ document: LinearDocument }>(`
        query GetDocument($id: String!) {
          document(id: $id) {
            ${LinearClient.DOCUMENT_FIELDS}
          }
        }
      `, { id });
      return data.document ?? null;
    } catch {
      return null;
    }
  }

  async listDocuments(opts?: { projectId?: string; first?: number }): Promise<LinearDocument[]> {
    return this.paginate(async (cursor) => {
      const filter: Record<string, unknown> = {};
      if (opts?.projectId) {
        filter.project = { id: { eq: opts.projectId } };
      }
      const data = await this.graphql<{
        documents: { nodes: LinearDocument[]; pageInfo: LinearPageInfo };
      }>(`
        query ListDocuments($first: Int, $after: String, $filter: DocumentFilter) {
          documents(first: $first, after: $after, filter: $filter) {
            nodes {
              ${LinearClient.DOCUMENT_FIELDS}
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, {
        first: opts?.first ?? 50,
        after: cursor,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      });
      return data.documents;
    });
  }

  async updateDocument(id: string, input: DocumentUpdateInput): Promise<LinearDocument> {
    const data = await this.graphql<{
      documentUpdate: { success: boolean; document: LinearDocument };
    }>(`
      mutation UpdateDocument($id: String!, $input: DocumentUpdateInput!) {
        documentUpdate(id: $id, input: $input) {
          success
          document {
            ${LinearClient.DOCUMENT_FIELDS}
          }
        }
      }
    `, { id, input });
    return data.documentUpdate.document;
  }
}
