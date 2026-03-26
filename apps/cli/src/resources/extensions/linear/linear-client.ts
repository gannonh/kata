/**
 * Linear GraphQL Client.
 *
 * Thin wrapper around native fetch — zero external dependencies.
 * Auth: LINEAR_API_KEY passed directly as Authorization header (Linear accepts bare keys).
 * Endpoint: https://api.linear.app/graphql (single POST endpoint).
 */

import {
  fetchWithRetry,
  LinearGraphQLError,
  classifyLinearError,
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
  LinearComment,
  ProjectCreateInput,
  ProjectUpdateInput,
  MilestoneCreateInput,
  MilestoneUpdateInput,
  IssueCreateInput,
  IssueUpdateInput,
  IssueFilter,
  IssueRelationCreateInput,
  LinearIssueRelation,
  LinearIssueRelationIssueRef,
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
    if (!apiKey) throw new Error("LinearClient requires a non-empty apiKey");
    this.apiKey = apiKey;
    this.endpoint = endpoint ?? LINEAR_API_ENDPOINT;
  }

  /** Get the most recent rate limit info from the last API call. */
  getRateLimitInfo(): RateLimitInfo | undefined {
    return this.lastRateLimit;
  }

  /** Returns true only for genuine "not found" errors (404, GraphQL "not found"). */
  private isNotFound(err: unknown): boolean {
    return classifyLinearError(err).kind === "not_found";
  }

  /** Assert a mutation succeeded, throw if Linear returned success: false. */
  private assertSuccess(mutationName: string, success: boolean): void {
    if (!success) {
      throw new LinearGraphQLError(`${mutationName} returned success: false`, []);
    }
  }

  /**
   * Execute a GraphQL query or mutation against the Linear API.
   * Returns the typed `data` field from the response.
   * Throws LinearGraphQLError for GraphQL-level errors.
   * Throws LinearHttpError for HTTP-level errors (via fetchWithRetry).
   */
  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const isMutation = /^\s*mutation\b/.test(query);
    const fetchOptions: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    };
    // Don't retry mutations — they are not idempotent and retrying
    // after a timeout could duplicate creates or double-apply updates.
    const response = await fetchWithRetry(this.endpoint, fetchOptions, isMutation ? 0 : 2);

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
   * @param maxPages — Safety cap to prevent runaway pagination (default: 10, ~500–1000 results depending on page size)
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
    } catch (err) {
      if (!this.isNotFound(err)) throw err;
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
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw err;
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
    this.assertSuccess("projectCreate", data.projectCreate.success);
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
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw err;
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

  async deleteProject(id: string): Promise<boolean> {
    const data = await this.graphql<{ projectDelete: { success: boolean } }>(`
      mutation DeleteProject($id: String!) {
        projectDelete(id: $id) { success }
      }
    `, { id });
    return data.projectDelete.success;
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
    this.assertSuccess("projectUpdate", data.projectUpdate.success);
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
    this.assertSuccess("projectMilestoneCreate", data.projectMilestoneCreate.success);
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
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw err;
    }
  }

  async listMilestones(projectId: string): Promise<LinearMilestone[]> {
    return this.paginate(async (cursor) => {
      const data = await this.graphql<{
        project: {
          projectMilestones: { nodes: LinearMilestone[]; pageInfo: LinearPageInfo };
        };
      }>(`
        query ListMilestones($projectId: String!, $after: String) {
          project(id: $projectId) {
            projectMilestones(first: 100, after: $after) {
              nodes {
                ${LinearClient.MILESTONE_FIELDS}
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `, { projectId, after: cursor });
      if (!data.project) {
        throw new LinearGraphQLError(`Project not found: ${projectId}`, []);
      }
      return data.project.projectMilestones;
    });
  }

  async deleteMilestone(id: string): Promise<boolean> {
    const data = await this.graphql<{ projectMilestoneDelete: { success: boolean } }>(`
      mutation DeleteMilestone($id: String!) {
        projectMilestoneDelete(id: $id) { success }
      }
    `, { id });
    return data.projectMilestoneDelete.success;
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
    this.assertSuccess("projectMilestoneUpdate", data.projectMilestoneUpdate.success);
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
    relations {
      nodes {
        id
        type
        issue {
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
        relatedIssue {
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
    }
    inverseRelations {
      nodes {
        id
        type
        issue {
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
        relatedIssue {
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
    this.assertSuccess("issueCreate", data.issueCreate.success);
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
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw err;
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
      return {
        ...data.issues,
        nodes: data.issues.nodes.map((issue) => this.normalizeIssue(issue)),
      };
    });
  }

  async deleteIssue(id: string): Promise<boolean> {
    const data = await this.graphql<{ issueDelete: { success: boolean } }>(`
      mutation DeleteIssue($id: String!) {
        issueDelete(id: $id) { success }
      }
    `, { id });
    return data.issueDelete.success;
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
    this.assertSuccess("issueUpdate", data.issueUpdate.success);
    return this.normalizeIssue(data.issueUpdate.issue);
  }

  private relationTypeToLinear(type: IssueRelationCreateInput["type"]): "blocks" | "related" | "duplicate" {
    if (type === "duplicate") return "duplicate";
    if (type === "relates_to") return "related";
    return "blocks";
  }

  async createRelation(input: IssueRelationCreateInput): Promise<LinearIssueRelation> {
    const isBlockedBy = input.type === "blocked_by";
    const linearType = this.relationTypeToLinear(input.type);
    const issueId = isBlockedBy ? input.relatedIssueId : input.issueId;
    const relatedIssueId = isBlockedBy ? input.issueId : input.relatedIssueId;

    const data = await this.graphql<{
      issueRelationCreate: {
        success: boolean;
        issueRelation: {
          id: string;
          type: string;
          issue: LinearIssueRelationIssueRef;
          relatedIssue: LinearIssueRelationIssueRef;
        };
      };
    }>(`
      mutation CreateIssueRelation($input: IssueRelationCreateInput!) {
        issueRelationCreate(input: $input) {
          success
          issueRelation {
            id
            type
            issue { id identifier title }
            relatedIssue { id identifier title }
          }
        }
      }
    `, {
      input: {
        issueId,
        relatedIssueId,
        type: linearType,
      },
    });

    this.assertSuccess("issueRelationCreate", data.issueRelationCreate.success);

    const raw = data.issueRelationCreate.issueRelation;
    const normalizedType = this.normalizeRelationType(raw.type);
    const direction: "outbound" | "inbound" = input.type === "blocked_by" ? "inbound" : "outbound";
    const relationType = direction === "inbound" && normalizedType === "blocks" ? "blocked_by" : normalizedType;

    const issueRef = this.relationIssueRef(raw.issue);
    const relatedRef = this.relationIssueRef(raw.relatedIssue);

    return {
      id: raw.id,
      type: relationType,
      direction,
      issue: issueRef,
      relatedIssue: relatedRef,
      otherIssue: direction === "outbound" ? relatedRef : issueRef,
    };
  }

  async listRelations(issueId: string): Promise<LinearIssueRelation[]> {
    const issue = await this.getIssue(issueId);
    return issue?.relations ?? [];
  }

  private normalizeRelationType(type: string): "blocks" | "relates_to" | "duplicate" {
    const normalized = (type ?? "").toLowerCase();
    if (normalized === "duplicate") return "duplicate";
    if (normalized === "related" || normalized === "relatedto" || normalized === "relates_to") {
      return "relates_to";
    }
    return "blocks";
  }

  private relationIssueRef(input: unknown): LinearIssueRelationIssueRef {
    const value = (input ?? {}) as Partial<LinearIssueRelationIssueRef>;
    return {
      id: value.id ?? "",
      identifier: value.identifier ?? "",
      title: value.title ?? "",
      state: value.state ?? null,
    };
  }

  private normalizeRelations(issue: LinearIssue): LinearIssueRelation[] {
    const outboundRaw = (issue as unknown as { relations?: { nodes?: unknown[] } | unknown[] }).relations;
    const inboundRaw = (issue as unknown as { inverseRelations?: { nodes?: unknown[] } | unknown[] }).inverseRelations;
    const outbound = Array.isArray(outboundRaw) ? outboundRaw : (outboundRaw?.nodes ?? []);
    const inbound = Array.isArray(inboundRaw) ? inboundRaw : (inboundRaw?.nodes ?? []);

    const mapRelation = (raw: unknown, direction: "outbound" | "inbound"): LinearIssueRelation => {
      const item = raw as {
        id?: string;
        type?: string;
        issue?: unknown;
        relatedIssue?: unknown;
      };
      const issueRef = this.relationIssueRef(item.issue);
      const relatedRef = this.relationIssueRef(item.relatedIssue);
      const otherIssue = direction === "outbound" ? relatedRef : issueRef;
      const baseType = this.normalizeRelationType(item.type ?? "");
      const type = direction === "inbound" && baseType === "blocks" ? "blocked_by" : baseType;
      return {
        id: item.id ?? "",
        type,
        direction,
        issue: issueRef,
        relatedIssue: relatedRef,
        otherIssue,
      };
    };

    return [
      ...outbound.map((item) => mapRelation(item, "outbound")),
      ...inbound.map((item) => mapRelation(item, "inbound")),
    ];
  }

  /** Normalize issue labels from connection format to flat array and include relation helpers. */
  private normalizeIssue(issue: LinearIssue): LinearIssue {
    const raw = issue.labels as unknown as { nodes?: LinearLabel[] } | LinearLabel[];
    const labels = Array.isArray(raw) ? raw : (raw?.nodes ?? []);
    const relations = this.normalizeRelations(issue);
    const blockedBy = relations
      .filter((relation) => relation.type === "blocked_by")
      .map((relation) => relation.otherIssue);
    return { ...issue, labels, relations, blockedBy };
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
    this.assertSuccess("issueLabelCreate", data.issueLabelCreate.success);
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

  async deleteLabel(id: string): Promise<boolean> {
    const data = await this.graphql<{ issueLabelDelete: { success: boolean } }>(`
      mutation DeleteLabel($id: String!) {
        issueLabelDelete(id: $id) { success }
      }
    `, { id });
    return data.issueLabelDelete.success;
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
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw err;
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
    // Search for existing label by name in team scope
    const existing = await this.listLabels({ teamId: opts?.teamId });
    const match = existing.find(
      (l) => l.name.toLowerCase() === name.toLowerCase(),
    );
    if (match) return match;

    // Also check workspace-level labels — Linear rejects team-scoped creates
    // when a workspace-level label with the same name already exists.
    if (opts?.teamId) {
      const workspaceLabels = await this.listLabels();
      const wsMatch = workspaceLabels.find(
        (l) => l.name.toLowerCase() === name.toLowerCase(),
      );
      if (wsMatch) return wsMatch;
    }

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
    project { id name }
    issue { id identifier }
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
    this.assertSuccess("documentCreate", data.documentCreate.success);
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
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw err;
    }
  }

  async listDocuments(opts?: {
    projectId?: string;
    issueId?: string;
    title?: string;
    first?: number;
  }): Promise<LinearDocument[]> {
    return this.paginate(async (cursor) => {
      const filter: Record<string, unknown> = {};
      if (opts?.projectId) {
        filter.project = { id: { eq: opts.projectId } };
      }
      if (opts?.issueId) filter.issue = { id: { eq: opts.issueId } };
      if (opts?.title)   filter.title = { eq: opts.title };
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

  async deleteDocument(id: string): Promise<boolean> {
    const data = await this.graphql<{ documentDelete: { success: boolean } }>(`
      mutation DeleteDocument($id: String!) {
        documentDelete(id: $id) { success }
      }
    `, { id });
    return data.documentDelete.success;
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
    this.assertSuccess("documentUpdate", data.documentUpdate.success);
    return data.documentUpdate.document;
  }

  // ── Comments ────────────────────────────────────────────────────────────

  async createComment(issueId: string, body: string): Promise<{ id: string; body: string; createdAt: string; url: string }> {
    const data = await this.graphql<{
      commentCreate: { success: boolean; comment: { id: string; body: string; createdAt: string; url: string } };
    }>(`
      mutation CreateComment($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id
            body
            createdAt
            url
          }
        }
      }
    `, { input: { issueId, body } });
    this.assertSuccess("commentCreate", data.commentCreate.success);
    return data.commentCreate.comment;
  }
}
