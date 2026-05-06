import type {
  KataArtifact,
  KataArtifactType,
  KataArtifactWriteInput,
  KataBackendAdapter,
  KataExecutionStatus,
  KataHealthReport,
  KataIssue,
  KataIssueCreateInput,
  KataIssueGetInput,
  KataIssueSummary,
  KataIssueUpdateStatusInput,
  KataMilestone,
  KataMilestoneCompleteInput,
  KataMilestoneCreateInput,
  KataPullRequest,
  KataProjectContext,
  KataProjectUpsertInput,
  KataScopeType,
  KataSlice,
  KataSliceCreateInput,
  KataSliceUpdateStatusInput,
  KataTask,
  KataTaskCreateInput,
  KataTaskUpdateStatusInput,
} from "../../domain/types.js";
import { KataDomainError } from "../../domain/errors.js";
import { parseSliceDependencyIds } from "../../domain/dependencies.js";
import type { LinearClient } from "./client.js";
import type { LinearStateMapping, LinearTrackerConfig } from "./config.js";
import {
  formatLinearArtifactMarker,
  parseLinearArtifactMarker,
  upsertLinearIssueArtifactComment,
  upsertLinearMilestoneDocument,
} from "./artifacts.js";

type LinearEntityType = "Project" | "Milestone" | "Slice" | "Task" | "Issue";
type LinearSliceStatus = KataSlice["status"];
type LinearTaskStatus = KataTask["status"];
type LinearMilestoneStatus = "active" | "done";
type LinearTaskVerificationState = KataTask["verificationState"];

interface LinearKataAdapterInput {
  client: LinearClient;
  config: LinearTrackerConfig;
  workspacePath: string;
}

interface LinearEntityMarker {
  kataId: string;
  type: LinearEntityType;
  parentId?: string;
  status?: LinearSliceStatus | LinearTaskStatus | LinearMilestoneStatus;
  verificationState?: LinearTaskVerificationState;
}

interface LinearProjectNode {
  id: string;
  name: string;
  slugId?: string | null;
  url?: string | null;
  description?: string | null;
}

interface LinearTeamNode {
  id: string;
  key: string;
  name: string;
}

interface LinearWorkflowStateNode {
  id: string;
  name: string;
  type?: string | null;
}

interface LinearMilestoneNode {
  id: string;
  name: string;
  description?: string | null;
  targetDate?: string | null;
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  number?: number | null;
  title: string;
  description?: string | null;
  url?: string | null;
  state?: LinearWorkflowStateNode | null;
  project?: LinearProjectNode | null;
  projectMilestone?: LinearMilestoneNode | null;
  parent?: { id: string; identifier?: string | null } | null;
  children?: { nodes?: Array<LinearIssueNode | null> | null } | null;
  relations?: { nodes?: Array<LinearIssueRelationNode | null> | null } | null;
  inverseRelations?: { nodes?: Array<LinearIssueRelationNode | null> | null } | null;
}

interface LinearIssueRelationNode {
  id: string;
  type: string;
  issue?: { id: string; identifier?: string | null } | null;
  relatedIssue?: { id: string; identifier?: string | null } | null;
}

interface TrackedLinearEntity {
  kataId: string;
  type: LinearEntityType;
  parentId?: string;
  status?: LinearSliceStatus | LinearTaskStatus | LinearMilestoneStatus;
  verificationState?: LinearTaskVerificationState;
  blockedBy?: string[];
  blocking?: string[];
  linearId: string;
  identifier?: string;
  title: string;
  body: string;
  url?: string;
  stateName?: string;
  stateType?: string;
  projectMilestoneId?: string;
}

const ENTITY_MARKER_PREFIX = "<!-- kata:entity ";
const ENTITY_MARKER_SUFFIX = " -->";

const LINEAR_CONTEXT_QUERY = `
  query LinearKataContext($teamKey: String!, $projectFilter: ProjectFilter, $after: String) {
    viewer { id }
    organization { id urlKey }
    teams(filter: { key: { eq: $teamKey } }, first: 20) {
      nodes { id key name }
      pageInfo { hasNextPage endCursor }
    }
    projects(filter: $projectFilter, first: 20, after: $after) {
      nodes { id name slugId url description }
      pageInfo { hasNextPage endCursor }
    }
    workflowStates(filter: { team: { key: { eq: $teamKey } } }, first: 100) {
      nodes { id name type }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const LINEAR_MILESTONES_QUERY = `
  query LinearKataMilestones($projectId: String!, $after: String) {
    project(id: $projectId) {
      id
      name
      milestones(first: 100, after: $after) {
        nodes { id name description targetDate }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const LINEAR_ISSUES_QUERY = `
  query LinearKataIssues($teamId: ID!, $projectId: ID!, $after: String) {
    issues(filter: { team: { id: { eq: $teamId } } project: { id: { eq: $projectId } } }, first: 100, after: $after) {
      nodes {
        id
        identifier
        number
        title
        description
        url
        state { id name type }
        project { id name slugId url }
        projectMilestone { id name description }
        parent { id identifier }
        children(first: 100) {
          nodes {
            id
            identifier
            number
            title
            description
            url
            state { id name type }
            parent { id identifier }
          }
        }
        relations(first: 100) { nodes { id type issue { id identifier } relatedIssue { id identifier } } }
        inverseRelations(first: 100) { nodes { id type issue { id identifier } relatedIssue { id identifier } } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const LINEAR_PROJECT_UPDATE_MUTATION = `
  mutation LinearKataProjectUpdate($id: String!, $input: ProjectUpdateInput!) {
    projectUpdate(id: $id, input: $input) { success project { id name description slugId url } }
  }
`;

const LINEAR_PROJECT_MILESTONE_CREATE_MUTATION = `
  mutation LinearKataProjectMilestoneCreate($input: ProjectMilestoneCreateInput!) {
    projectMilestoneCreate(input: $input) { success projectMilestone { id name description } }
  }
`;

const LINEAR_PROJECT_MILESTONE_UPDATE_MUTATION = `
  mutation LinearKataProjectMilestoneUpdate($id: String!, $input: ProjectMilestoneUpdateInput!) {
    projectMilestoneUpdate(id: $id, input: $input) { success projectMilestone { id name description } }
  }
`;

const LINEAR_ISSUE_CREATE_MUTATION = `
  mutation LinearKataIssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        number
        title
        description
        url
        state { id name type }
        projectMilestone { id name description }
        parent { id identifier }
      }
    }
  }
`;

const LINEAR_ISSUE_UPDATE_MUTATION = `
  mutation LinearKataIssueUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue {
        id
        identifier
        number
        title
        description
        url
        state { id name type }
        projectMilestone { id name description }
        parent { id identifier }
      }
    }
  }
`;

const LINEAR_ISSUE_RELATION_CREATE_MUTATION = `
  mutation LinearKataIssueRelationCreate($input: IssueRelationCreateInput!) {
    issueRelationCreate(input: $input) { success issueRelation { id } }
  }
`;

export class LinearKataAdapter implements KataBackendAdapter {
  private readonly client: LinearClient;
  private readonly config: LinearTrackerConfig;
  private readonly workspacePath: string;
  private contextPromise: Promise<{
    organizationUrlKey: string;
    project: LinearProjectNode;
    team: LinearTeamNode;
    stateByKataStatus: Map<string, LinearWorkflowStateNode>;
    kataStatusByStateName: Map<string, keyof LinearStateMapping>;
  }> | null = null;
  private discovered = false;
  private entities = new Map<string, TrackedLinearEntity>();
  private linearIdToKataId = new Map<string, string>();

  constructor(input: LinearKataAdapterInput) {
    this.client = input.client;
    this.config = input.config;
    this.workspacePath = input.workspacePath;
  }

  async getProjectContext(): Promise<KataProjectContext> {
    const context = await this.getContext();
    return {
      backend: "linear",
      workspacePath: this.workspacePath,
      title: context.project.name,
      description: `Linear project ${this.config.project} in workspace ${this.config.workspace}`,
    };
  }

  async upsertProject(input: KataProjectUpsertInput): Promise<KataProjectContext> {
    const context = await this.getContext();
    const data = await this.client.graphql<{ projectUpdate: { project: LinearProjectNode } }>({
      query: LINEAR_PROJECT_UPDATE_MUTATION,
      variables: {
        id: context.project.id,
        input: {
          name: input.title,
          description: formatLinearEntityBody({ kataId: "PROJECT", type: "Project", content: input.description }),
        },
      },
    });
    context.project.name = data.projectUpdate.project.name;
    context.project.description = data.projectUpdate.project.description;
    return { backend: "linear", workspacePath: this.workspacePath, title: input.title, description: input.description };
  }

  async listMilestones(): Promise<KataMilestone[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Milestone")
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map((entity) => {
        const done = entity.status === "done";
        return {
          id: entity.kataId,
          title: entity.title,
          goal: bodyContent(entity.body) || entity.title,
          status: done ? "done" : "active",
          active: !done,
        };
      });
  }

  async getActiveMilestone(): Promise<KataMilestone | null> {
    const milestones = await this.listMilestones();
    const activeMilestones = milestones.filter((milestone) => milestone.active);
    if (activeMilestones.length === 0) return null;
    if (this.config.activeMilestoneId) {
      const active = activeMilestones.find((milestone) =>
        milestone.id === this.config.activeMilestoneId ||
        this.entities.get(milestone.id)?.linearId === this.config.activeMilestoneId,
      );
      if (!active) {
        throw new KataDomainError("INVALID_CONFIG", `Configured Linear active milestone ${this.config.activeMilestoneId} was not found.`);
      }
      return active;
    }
    if (activeMilestones.length === 1) return activeMilestones[0] ?? null;
    throw new KataDomainError("INVALID_CONFIG", "Multiple active Linear milestones were found. Set linear.activeMilestoneId in .kata/preferences.md.");
  }

  async createMilestone(input: KataMilestoneCreateInput): Promise<KataMilestone> {
    await this.discoverEntities();
    const context = await this.getContext();
    const kataId = this.nextKataId("Milestone");
    const data = await this.client.graphql<{ projectMilestoneCreate: { projectMilestone: LinearMilestoneNode } }>({
      query: LINEAR_PROJECT_MILESTONE_CREATE_MUTATION,
      variables: {
        input: {
          projectId: context.project.id,
          name: `[${kataId}] ${input.title}`,
          description: formatLinearEntityBody({ kataId, type: "Milestone", content: input.goal }),
        },
      },
    });
    const milestone = data.projectMilestoneCreate.projectMilestone;
    this.entities.set(kataId, {
      kataId,
      type: "Milestone",
      status: "active",
      linearId: milestone.id,
      title: stripKataPrefix(milestone.name),
      body: milestone.description ?? input.goal,
      projectMilestoneId: milestone.id,
    });
    this.linearIdToKataId.set(milestone.id, kataId);
    return { id: kataId, title: input.title, goal: input.goal, status: "active", active: true };
  }

  async completeMilestone(input: KataMilestoneCompleteInput): Promise<KataMilestone> {
    const entity = await this.requireEntity(input.milestoneId, "Milestone");
    const completedContent = appendBodySection(bodyContent(entity.body), "Completion summary", input.summary);
    const updatedDescription = formatLinearEntityBody({
      kataId: entity.kataId,
      type: "Milestone",
      status: "done",
      content: completedContent,
    });
    const data = await this.client.graphql<{ projectMilestoneUpdate: { projectMilestone: LinearMilestoneNode } }>({
      query: LINEAR_PROJECT_MILESTONE_UPDATE_MUTATION,
      variables: { id: entity.linearId, input: { description: updatedDescription } },
    });
    const updated = {
      ...entity,
      status: "done" as const,
      body: data.projectMilestoneUpdate.projectMilestone.description ?? updatedDescription,
    };
    this.entities.set(entity.kataId, updated);
    return { id: entity.kataId, title: entity.title, goal: bodyContent(updated.body), status: "done", active: false };
  }

  async listSlices(input: { milestoneId: string }): Promise<KataSlice[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Slice" && entity.parentId === input.milestoneId)
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map((entity, index) => ({
        id: entity.kataId,
        milestoneId: input.milestoneId,
        title: entity.title,
        goal: bodyContent(entity.body) || entity.title,
        status: sliceStatusFromEntity(entity, this.config.states),
        order: index,
        blockedBy: parseSliceDependencyIds(entity.blockedBy),
        blocking: parseSliceDependencyIds(entity.blocking),
      }));
  }

  async createSlice(input: KataSliceCreateInput): Promise<KataSlice> {
    await this.discoverEntities();
    const milestone = await this.requireEntity(input.milestoneId, "Milestone");
    const context = await this.getContext();
    const kataId = this.nextKataId("Slice");
    const blockedBy = parseSliceDependencyIds(input.blockedBy ?? []);
    const issue = await this.createLinearIssue({
      kataId,
      type: "Slice",
      parentId: input.milestoneId,
      title: input.title,
      content: input.goal,
      status: "backlog",
      projectMilestoneId: milestone.linearId,
      stateId: requireStateId(context, "backlog"),
    });
    const entity = entityFromCreatedIssue(issue, { kataId, type: "Slice", parentId: input.milestoneId, status: "backlog", blockedBy });
    this.entities.set(kataId, entity);
    this.linearIdToKataId.set(entity.linearId, kataId);
    await this.createNativeIssueDependencies(entity, blockedBy);
    const stored = this.entities.get(kataId) ?? entity;
    return {
      id: kataId,
      milestoneId: input.milestoneId,
      title: input.title,
      goal: input.goal,
      status: "backlog",
      order: input.order ?? 0,
      blockedBy: parseSliceDependencyIds(stored.blockedBy),
      blocking: parseSliceDependencyIds(stored.blocking),
    };
  }

  async updateSliceStatus(input: KataSliceUpdateStatusInput): Promise<KataSlice> {
    const entity = await this.requireEntity(input.sliceId, "Slice");
    const updated = await this.updateLinearIssueEntity(entity, input.status, { status: input.status });
    return { ...sliceFromTrackedEntity(updated), status: input.status };
  }

  async listTasks(input: { sliceId: string }): Promise<KataTask[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Task" && entity.parentId === input.sliceId)
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map((entity) => ({
        id: entity.kataId,
        sliceId: input.sliceId,
        title: entity.title,
        description: bodyContent(entity.body),
        status: taskStatusFromEntity(entity, this.config.states),
        verificationState: taskVerificationStateFromEntity(entity),
      }));
  }

  async createTask(input: KataTaskCreateInput): Promise<KataTask> {
    await this.discoverEntities();
    const slice = await this.requireEntity(input.sliceId, "Slice");
    const context = await this.getContext();
    const kataId = this.nextKataId("Task");
    const issue = await this.createLinearIssue({
      kataId,
      type: "Task",
      parentId: input.sliceId,
      title: input.title,
      content: input.description,
      status: "backlog",
      verificationState: "pending",
      projectMilestoneId: slice.projectMilestoneId,
      parentLinearId: slice.linearId,
      stateId: requireStateId(context, "backlog"),
    });
    const entity = entityFromCreatedIssue(issue, { kataId, type: "Task", parentId: input.sliceId, status: "backlog", verificationState: "pending" });
    this.entities.set(kataId, entity);
    this.linearIdToKataId.set(entity.linearId, kataId);
    return { id: kataId, sliceId: input.sliceId, title: input.title, description: input.description, status: "backlog", verificationState: "pending" };
  }

  async updateTaskStatus(input: KataTaskUpdateStatusInput): Promise<KataTask> {
    const entity = await this.requireEntity(input.taskId, "Task");
    const verificationState = input.verificationState ?? taskVerificationStateFromEntity(entity);
    const updated = await this.updateLinearIssueEntity(entity, input.status, { status: input.status, verificationState });
    return { ...taskFromTrackedEntity(updated), status: input.status, verificationState };
  }

  async createIssue(input: KataIssueCreateInput): Promise<KataIssue> {
    await this.discoverEntities();
    const context = await this.getContext();
    const kataId = this.nextKataId("Issue");
    const body = `# Design\n\n${input.design}\n\n# Plan\n\n${input.plan}`;
    const issue = await this.createLinearIssue({
      kataId,
      type: "Issue",
      title: input.title,
      content: body,
      status: "backlog",
      stateId: requireStateId(context, "backlog"),
    });
    const entity = entityFromCreatedIssue(issue, { kataId, type: "Issue", status: "backlog" });
    this.entities.set(kataId, entity);
    this.linearIdToKataId.set(entity.linearId, kataId);
    return { id: kataId, number: linearIssueNumber(issue.identifier), title: input.title, body, status: "backlog", url: issue.url ?? undefined };
  }

  async listOpenIssues(): Promise<KataIssueSummary[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Issue" && issueStatusFromEntity(entity, this.config.states) !== "done")
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map((entity) => ({
        id: entity.kataId,
        number: linearIssueNumber(entity.identifier),
        title: entity.title,
        status: issueStatusFromEntity(entity, this.config.states),
        url: entity.url,
      }));
  }

  async getIssue(input: KataIssueGetInput): Promise<KataIssue> {
    const entity = await this.findIssueEntity(input.issueRef);
    return {
      id: entity.kataId,
      number: linearIssueNumber(entity.identifier),
      title: entity.title,
      body: bodyContent(entity.body),
      status: issueStatusFromEntity(entity, this.config.states),
      url: entity.url,
    };
  }

  async updateIssueStatus(input: KataIssueUpdateStatusInput): Promise<KataIssue> {
    const entity = await this.requireEntity(input.issueId, "Issue");
    const updated = await this.updateLinearIssueEntity(entity, input.status, { status: input.status });
    return {
      id: updated.kataId,
      number: linearIssueNumber(updated.identifier),
      title: updated.title,
      body: bodyContent(updated.body),
      status: input.status,
      url: updated.url,
    };
  }

  async listArtifacts(input: { scopeType: KataScopeType; scopeId: string }): Promise<KataArtifact[]> {
    if (input.scopeType === "project" || input.scopeType === "milestone") {
      const context = await this.getContext();
      const documents = await this.client.paginate<{ id: string; title: string; content?: string | null; updatedAt?: string | null }, { project?: { documents?: any } | null }>({
        query: `
          query LinearKataProjectDocuments($projectId: String!, $after: String) {
            project(id: $projectId) {
              documents(first: 100, after: $after) {
                nodes { id title content updatedAt }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        `,
        variables: { projectId: context.project.id },
        selectConnection: (data) => data.project?.documents,
      });
      return documents
        .map((document) => artifactFromLinearDocument(document, input.scopeType, input.scopeId))
        .filter((artifact): artifact is KataArtifact => artifact !== null);
    }

    const entity = await this.findArtifactEntity(input.scopeType, input.scopeId);
    if (!entity) return [];
    const comments = await this.client.paginate<{ id: string; body?: string | null; updatedAt?: string | null }, { issue?: { comments?: any } | null }>({
      query: `
        query LinearKataIssueComments($issueId: String!, $after: String) {
          issue(id: $issueId) {
            comments(first: 100, after: $after) {
              nodes { id body updatedAt }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `,
      variables: { issueId: entity.linearId },
      selectConnection: (data) => data.issue?.comments,
    });
    return comments
      .map((comment) => artifactFromLinearComment(comment, input.scopeType, input.scopeId))
      .filter((artifact): artifact is KataArtifact => artifact !== null);
  }

  async readArtifact(input: { scopeType: KataScopeType; scopeId: string; artifactType: KataArtifactType }): Promise<KataArtifact | null> {
    return (await this.listArtifacts(input)).find((artifact) => artifact.artifactType === input.artifactType) ?? null;
  }

  async writeArtifact(input: KataArtifactWriteInput): Promise<KataArtifact> {
    if (input.scopeType === "project") {
      const context = await this.getContext();
      const result = await upsertLinearProjectDocument({
        client: this.client,
        projectId: context.project.id,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: input.title,
        content: input.content,
      });
      const parsed = parseLinearArtifactMarker(result.body);
      return {
        id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: result.title ?? input.title,
        content: parsed?.content ?? input.content,
        format: input.format,
        updatedAt: result.updatedAt ?? new Date().toISOString(),
        provenance: { backend: "linear", backendId: result.backendId },
      };
    }

    if (input.scopeType === "milestone") {
      const context = await this.getContext();
      const result = await upsertLinearMilestoneDocument({
        client: this.client,
        projectId: context.project.id,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: input.title,
        content: input.content,
      });
      const parsed = parseLinearArtifactMarker(result.body);
      return {
        id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: result.title ?? input.title,
        content: parsed?.content ?? input.content,
        format: input.format,
        updatedAt: result.updatedAt ?? new Date().toISOString(),
        provenance: { backend: "linear", backendId: result.backendId },
      };
    }

    const entity = await this.findArtifactEntity(input.scopeType, input.scopeId);
    if (!entity) {
      throw new KataDomainError("NOT_FOUND", `Linear tracking record was not found for ${input.scopeType} ${input.scopeId}.`);
    }
    const result = await upsertLinearIssueArtifactComment({
      client: this.client,
      issueId: entity.linearId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      artifactType: input.artifactType,
      content: input.content,
    });
    return {
      id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      artifactType: input.artifactType,
      title: input.title,
      content: parseLinearArtifactMarker(result.body)?.content ?? input.content,
      format: input.format,
      updatedAt: new Date().toISOString(),
      provenance: { backend: "linear", backendId: result.backendId },
    };
  }

  async openPullRequest(input: { title: string; body: string; base: string; head: string }): Promise<KataPullRequest> {
    return {
      id: `${input.head}->${input.base}`,
      url: `https://github.com/kata-sh/kata-mono/pull/${encodeURIComponent(input.head)}`,
      branch: input.head,
      base: input.base,
      status: "open",
      mergeReady: false,
    };
  }

  async getExecutionStatus(): Promise<KataExecutionStatus> {
    return { queueDepth: 0, activeWorkers: 0, escalations: [] };
  }

  async checkHealth(): Promise<KataHealthReport> {
    try {
      await this.getProjectContext();
      return {
        ok: true,
        backend: "linear",
        checks: [
          { name: "adapter", status: "ok", message: "Linear adapter is configured." },
          { name: "linear-project", status: "ok", message: "Linear project context is accessible." },
        ],
      };
    } catch (error) {
      return {
        ok: false,
        backend: "linear",
        checks: [{ name: "linear-project", status: "invalid", message: error instanceof Error ? error.message : "Linear project validation failed." }],
      };
    }
  }

  private async getContext() {
    if (!this.contextPromise) {
      this.contextPromise = this.loadContext();
    }
    return this.contextPromise;
  }

  private async loadContext() {
    const data = await this.client.graphql<{
      organization?: { urlKey?: string | null } | null;
      teams?: { nodes?: LinearTeamNode[] | null } | null;
      projects?: { nodes?: LinearProjectNode[] | null } | null;
      workflowStates?: { nodes?: LinearWorkflowStateNode[] | null } | null;
    }>({
      query: LINEAR_CONTEXT_QUERY,
      variables: {
        teamKey: this.config.team,
        projectFilter: {
          or: [
            { id: { eq: this.config.project } },
            { slugId: { eq: this.config.project } },
            { name: { eq: this.config.project } },
          ],
        },
      },
    });

    const team = data.teams?.nodes?.find((candidate) =>
      candidate.key === this.config.team || candidate.id === this.config.team || candidate.name === this.config.team,
    );
    if (!team) throw new KataDomainError("INVALID_CONFIG", `Linear team ${this.config.team} was not found.`);

    const project = data.projects?.nodes?.find((candidate) =>
      candidate.id === this.config.project || candidate.slugId === this.config.project || candidate.name === this.config.project,
    );
    if (!project) throw new KataDomainError("INVALID_CONFIG", `Linear project ${this.config.project} was not found.`);

    const states = data.workflowStates?.nodes ?? [];
    const stateByKataStatus = new Map<string, LinearWorkflowStateNode>();
    const kataStatusByStateName = new Map<string, keyof LinearStateMapping>();
    for (const [status, stateName] of Object.entries(this.config.states) as Array<[keyof LinearStateMapping, string]>) {
      const state = states.find((candidate) => candidate.name === stateName);
      if (!state) throw new KataDomainError("INVALID_CONFIG", `Linear workflow state "${stateName}" was not found for team ${this.config.team}.`);
      stateByKataStatus.set(status, state);
      kataStatusByStateName.set(state.name, status);
    }

    return {
      organizationUrlKey: data.organization?.urlKey ?? this.config.workspace,
      project,
      team,
      stateByKataStatus,
      kataStatusByStateName,
    };
  }

  private async discoverEntities(): Promise<void> {
    if (this.discovered) return;
    const context = await this.getContext();
    const milestones = await this.loadMilestoneEntities(context.project.id);
    for (const milestone of milestones) {
      this.entities.set(milestone.kataId, milestone);
      this.linearIdToKataId.set(milestone.linearId, milestone.kataId);
    }
    const issues = await this.loadIssueEntities(context.team.id, context.project.id, milestones);
    for (const entity of issues) {
      if (this.entities.has(entity.kataId)) continue;
      this.entities.set(entity.kataId, entity);
      this.linearIdToKataId.set(entity.linearId, entity.kataId);
    }
    this.mergeIssueDependencies();
    this.discovered = true;
  }

  private async loadMilestoneEntities(projectId: string): Promise<TrackedLinearEntity[]> {
    const milestones = await this.client.paginate<LinearMilestoneNode, { project?: { milestones?: any } | null }>({
      query: LINEAR_MILESTONES_QUERY,
      variables: { projectId },
      selectConnection: (data) => data.project?.milestones,
    });

    return milestones.map((milestone) => {
      const marker = parseEntityMarker(milestone.description ?? "") ?? { kataId: normalizeMilestoneKataId(milestone.name), type: "Milestone" as const };
      return {
        kataId: marker.kataId,
        type: "Milestone" as const,
        status: marker.status === "done" ? "done" : "active",
        linearId: milestone.id,
        title: stripKataPrefix(milestone.name),
        body: milestone.description ?? "",
        projectMilestoneId: milestone.id,
      };
    });
  }

  private async loadIssueEntities(teamId: string, projectId: string, milestones: TrackedLinearEntity[]): Promise<TrackedLinearEntity[]> {
    const milestoneByLinearId = new Map(milestones.map((milestone) => [milestone.linearId, milestone.kataId]));
    const issues = await this.client.paginate<LinearIssueNode, { issues?: any }>({
      query: LINEAR_ISSUES_QUERY,
      variables: { teamId, projectId },
      selectConnection: (data) => data.issues,
    });

    return issues.flatMap((issue) => issueEntitiesFromIssue(issue, milestoneByLinearId));
  }

  private mergeIssueDependencies(): void {
    for (const entity of this.entities.values()) {
      if (entity.type !== "Slice") continue;
      const blockedBy = parseSliceDependencyIds(entity.blockedBy);
      entity.blockedBy = blockedBy;
      for (const blockerId of blockedBy) {
        const blocker = this.entities.get(blockerId);
        if (!blocker || blocker.type !== "Slice") continue;
        blocker.blocking = parseSliceDependencyIds([...(blocker.blocking ?? []), entity.kataId]);
      }
    }
  }

  private async findIssueEntity(issueRef: string): Promise<TrackedLinearEntity> {
    await this.discoverEntities();
    const trimmed = issueRef.trim();
    if (!trimmed) throw new KataDomainError("INVALID_CONFIG", "Standalone issue reference is required.");
    const normalized = trimmed.toUpperCase();
    const standalone = [...this.entities.values()].filter((entity) => entity.type === "Issue");
    const byKataId = standalone.find((entity) => entity.kataId.toUpperCase() === normalized);
    if (byKataId) return byKataId;
    const byIdentifier = standalone.find((entity) => entity.identifier?.toUpperCase() === normalized);
    if (byIdentifier) return byIdentifier;
    const byTitle = standalone.filter((entity) => entity.title.toLowerCase().includes(trimmed.toLowerCase()));
    if (byTitle.length === 1) return byTitle[0]!;
    if (byTitle.length > 1) throw new KataDomainError("UNKNOWN", `Issue reference "${issueRef}" matched multiple standalone Linear issues.`);
    throw new KataDomainError("NOT_FOUND", `Standalone Linear issue was not found for reference "${issueRef}".`);
  }

  private async requireEntity(kataId: string, type: LinearEntityType): Promise<TrackedLinearEntity> {
    await this.discoverEntities();
    const entity = this.entities.get(kataId);
    if (!entity || entity.type !== type) {
      throw new KataDomainError("NOT_FOUND", `Linear ${type} record was not found for ${kataId}.`);
    }
    return entity;
  }

  private nextKataId(type: "Milestone" | "Slice" | "Task" | "Issue"): string {
    const prefix = type === "Milestone" ? "M" : type === "Slice" ? "S" : type === "Task" ? "T" : "I";
    const maxExisting = [...this.entities.values()].reduce((max, entity) => {
      if (entity.type !== type) return max;
      const match = entity.kataId.match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${prefix}${String(maxExisting + 1).padStart(3, "0")}`;
  }

  private async createLinearIssue(input: {
    kataId: string;
    type: LinearEntityType;
    parentId?: string;
    title: string;
    content: string;
    status?: LinearSliceStatus | LinearTaskStatus;
    verificationState?: LinearTaskVerificationState;
    projectMilestoneId?: string;
    parentLinearId?: string;
    stateId: string;
  }): Promise<LinearIssueNode> {
    const context = await this.getContext();
    const data = await this.client.graphql<{ issueCreate: { issue: LinearIssueNode } }>({
      query: LINEAR_ISSUE_CREATE_MUTATION,
      variables: {
        input: {
          teamId: context.team.id,
          projectId: context.project.id,
          title: `[${input.kataId}] ${input.title}`,
          description: formatLinearEntityBody({
            kataId: input.kataId,
            type: input.type,
            parentId: input.parentId,
            status: input.status,
            verificationState: input.verificationState,
            content: input.content,
          }),
          stateId: input.stateId,
          ...(input.projectMilestoneId ? { projectMilestoneId: input.projectMilestoneId } : {}),
          ...(input.parentLinearId ? { parentId: input.parentLinearId } : {}),
        },
      },
    });
    return data.issueCreate.issue;
  }

  private async updateLinearIssueEntity(
    entity: TrackedLinearEntity,
    status: LinearSliceStatus | LinearTaskStatus | KataIssue["status"],
    metadata: Pick<LinearEntityMarker, "status" | "verificationState">,
  ): Promise<TrackedLinearEntity> {
    const context = await this.getContext();
    const data = await this.client.graphql<{ issueUpdate: { issue: LinearIssueNode } }>({
      query: LINEAR_ISSUE_UPDATE_MUTATION,
      variables: {
        id: entity.linearId,
        input: {
          stateId: requireStateId(context, status),
          description: updateLinearEntityBodyMarker(entity, metadata),
        },
      },
    });
    const updated = entityFromCreatedIssue(data.issueUpdate.issue, {
      kataId: entity.kataId,
      type: entity.type,
      parentId: entity.parentId,
      status: metadata.status,
      verificationState: metadata.verificationState,
      blockedBy: entity.blockedBy,
      blocking: entity.blocking,
    });
    this.entities.set(entity.kataId, updated);
    return updated;
  }

  private async createNativeIssueDependencies(blockedEntity: TrackedLinearEntity, blockedByIds: readonly string[]): Promise<void> {
    const createdBlockedByIds: string[] = [];
    for (const blockedById of blockedByIds) {
      if (blockedById === blockedEntity.kataId) continue;
      const blocker = await this.requireEntity(blockedById, "Slice");
      await this.client.graphql({
        query: LINEAR_ISSUE_RELATION_CREATE_MUTATION,
        variables: { input: { issueId: blockedEntity.linearId, relatedIssueId: blocker.linearId, type: "blocks" } },
      });
      createdBlockedByIds.push(blocker.kataId);
      this.entities.set(blocker.kataId, { ...blocker, blocking: parseSliceDependencyIds([...(blocker.blocking ?? []), blockedEntity.kataId]) });
    }
    if (createdBlockedByIds.length > 0) {
      this.entities.set(blockedEntity.kataId, { ...blockedEntity, blockedBy: parseSliceDependencyIds([...(blockedEntity.blockedBy ?? []), ...createdBlockedByIds]) });
    }
  }

  private async findArtifactEntity(scopeType: KataScopeType, scopeId: string): Promise<TrackedLinearEntity | null> {
    await this.discoverEntities();
    if (scopeType === "project" || scopeType === "milestone") return null;
    return this.entities.get(scopeId) ?? null;
  }
}

export function formatLinearEntityBody(input: {
  kataId: string;
  type: LinearEntityType;
  parentId?: string;
  status?: LinearSliceStatus | LinearTaskStatus | LinearMilestoneStatus;
  verificationState?: LinearTaskVerificationState;
  content: string;
}): string {
  const marker = JSON.stringify({
    kataId: input.kataId,
    type: input.type,
    ...(input.parentId ? { parentId: input.parentId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.verificationState ? { verificationState: input.verificationState } : {}),
  });
  return `${ENTITY_MARKER_PREFIX}${marker}${ENTITY_MARKER_SUFFIX}\n${input.content}`;
}

export function parseEntityMarker(body: string): LinearEntityMarker | null {
  const newlineIndex = body.indexOf("\n");
  const markerLine = newlineIndex === -1 ? body : body.slice(0, newlineIndex);
  if (!markerLine.startsWith(ENTITY_MARKER_PREFIX) || !markerLine.endsWith(ENTITY_MARKER_SUFFIX)) return null;
  try {
    const marker = JSON.parse(markerLine.slice(ENTITY_MARKER_PREFIX.length, -ENTITY_MARKER_SUFFIX.length));
    if (!isEntityMarker(marker)) return null;
    return marker;
  } catch {
    return null;
  }
}

function isEntityMarker(value: unknown): value is LinearEntityMarker {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LinearEntityMarker>;
  return typeof candidate.kataId === "string" &&
    candidate.kataId.length > 0 &&
    (candidate.type === "Project" || candidate.type === "Milestone" || candidate.type === "Slice" || candidate.type === "Task" || candidate.type === "Issue");
}

function bodyContent(body: string): string {
  const newlineIndex = body.indexOf("\n");
  if (newlineIndex === -1) return body.startsWith(ENTITY_MARKER_PREFIX) ? "" : body;
  return body.startsWith(ENTITY_MARKER_PREFIX) ? body.slice(newlineIndex + 1) : body;
}

function stripKataPrefix(title: string): string {
  return title.replace(/^\[[A-Z]\d{3}\]\s*/, "").replace(/^[A-Z]\d{3}\s+/, "");
}

function normalizeMilestoneKataId(name: string): string {
  const match = name.match(/\bM(\d+)\b/i);
  return match ? `M${String(Number(match[1])).padStart(3, "0")}` : "M001";
}

function linearIssueNumber(identifier: string | undefined): number | undefined {
  const match = identifier?.match(/-(\d+)$/);
  if (!match) return undefined;
  const number = Number(match[1]);
  return Number.isInteger(number) ? number : undefined;
}

function issueEntitiesFromIssue(issue: LinearIssueNode, milestoneByLinearId: Map<string, string>): TrackedLinearEntity[] {
  const entities: TrackedLinearEntity[] = [];
  const marker = parseEntityMarker(issue.description ?? "");
  if (marker) entities.push(entityFromIssueNode(issue, marker, milestoneByLinearId));
  for (const child of issue.children?.nodes ?? []) {
    if (!child) continue;
    const childMarker = parseEntityMarker(child.description ?? "");
    if (!childMarker) continue;
    entities.push(entityFromIssueNode(child, childMarker, milestoneByLinearId));
  }
  return entities;
}

function entityFromIssueNode(issue: LinearIssueNode, marker: LinearEntityMarker, milestoneByLinearId: Map<string, string>): TrackedLinearEntity {
  return {
    kataId: marker.kataId,
    type: marker.type,
    parentId: marker.parentId ?? milestoneByLinearId.get(issue.projectMilestone?.id ?? ""),
    status: marker.status,
    verificationState: marker.verificationState,
    blockedBy: relationDependencies(issue, "blockedBy"),
    blocking: relationDependencies(issue, "blocking"),
    linearId: issue.id,
    identifier: issue.identifier,
    title: stripKataPrefix(issue.title),
    body: issue.description ?? "",
    url: issue.url ?? undefined,
    stateName: issue.state?.name ?? undefined,
    stateType: issue.state?.type ?? undefined,
    projectMilestoneId: issue.projectMilestone?.id ?? undefined,
  };
}

function relationDependencies(issue: LinearIssueNode, direction: "blockedBy" | "blocking"): string[] {
  const directRelations = (issue.relations?.nodes ?? []).filter((relation): relation is LinearIssueRelationNode => relation !== null);
  const inverseRelations = (issue.inverseRelations?.nodes ?? []).filter((relation): relation is LinearIssueRelationNode => relation !== null);

  const identifiers = [
    ...directRelations.flatMap((relation) => {
      const related = relation.relatedIssue?.identifier ?? relation.issue?.identifier ?? "";
      const type = relation.type.toLowerCase();
      if (direction === "blockedBy" && type.includes("blocked")) return related;
      if (direction === "blocking" && type.includes("block")) return related;
      return [];
    }),
    ...inverseRelations.flatMap((relation) => {
      const related = relation.issue?.identifier ?? relation.relatedIssue?.identifier ?? "";
      const type = relation.type.toLowerCase();
      if (direction === "blockedBy" && type.includes("blocked")) return related;
      if (direction === "blocking" && type.includes("block")) return related;
      return [];
    }),
  ];

  return parseSliceDependencyIds(identifiers);
}

function sliceStatusFromEntity(entity: TrackedLinearEntity, states: LinearStateMapping): KataSlice["status"] {
  if (entity.status && isSliceStatus(entity.status)) return entity.status;
  return statusFromStateName(entity.stateName, states) as KataSlice["status"] ?? "backlog";
}

function taskStatusFromEntity(entity: TrackedLinearEntity, states: LinearStateMapping): KataTask["status"] {
  if (entity.status && isTaskStatus(entity.status)) return entity.status;
  const status = statusFromStateName(entity.stateName, states);
  if (status === "done" || status === "todo" || status === "backlog") return status;
  return "in_progress";
}

function issueStatusFromEntity(entity: TrackedLinearEntity, states: LinearStateMapping): KataIssue["status"] {
  const status = statusFromStateName(entity.stateName, states);
  if (status === "done" || status === "todo" || status === "backlog" || status === "in_progress") return status;
  return entity.stateType === "completed" ? "done" : "backlog";
}

function statusFromStateName(stateName: string | undefined, states: LinearStateMapping): keyof LinearStateMapping | null {
  if (!stateName) return null;
  for (const [status, configuredName] of Object.entries(states) as Array<[keyof LinearStateMapping, string]>) {
    if (configuredName === stateName) return status;
  }
  return null;
}

function taskVerificationStateFromEntity(entity: TrackedLinearEntity): KataTask["verificationState"] {
  return entity.verificationState === "verified" || entity.verificationState === "failed" ? entity.verificationState : "pending";
}

function isSliceStatus(value: string): value is KataSlice["status"] {
  return ["backlog", "todo", "in_progress", "agent_review", "human_review", "merging", "done"].includes(value);
}

function isTaskStatus(value: string): value is KataTask["status"] {
  return ["backlog", "todo", "in_progress", "done"].includes(value);
}

function requireStateId(context: { stateByKataStatus: Map<string, LinearWorkflowStateNode> }, status: string): string {
  const state = context.stateByKataStatus.get(status);
  if (!state) throw new KataDomainError("INVALID_CONFIG", `Linear workflow state for Kata status "${status}" was not found.`);
  return state.id;
}

function entityFromCreatedIssue(issue: LinearIssueNode, marker: LinearEntityMarker & { blockedBy?: string[]; blocking?: string[] }): TrackedLinearEntity {
  return {
    kataId: marker.kataId,
    type: marker.type,
    parentId: marker.parentId,
    status: marker.status,
    verificationState: marker.verificationState,
    blockedBy: marker.blockedBy ?? [],
    blocking: marker.blocking ?? [],
    linearId: issue.id,
    identifier: issue.identifier,
    title: stripKataPrefix(issue.title),
    body: issue.description ?? "",
    url: issue.url ?? undefined,
    stateName: issue.state?.name ?? undefined,
    stateType: issue.state?.type ?? undefined,
    projectMilestoneId: issue.projectMilestone?.id ?? undefined,
  };
}

function updateLinearEntityBodyMarker(entity: TrackedLinearEntity, metadata: Pick<LinearEntityMarker, "status" | "verificationState">): string {
  return formatLinearEntityBody({
    kataId: entity.kataId,
    type: entity.type,
    parentId: entity.parentId,
    status: metadata.status ?? entity.status,
    verificationState: metadata.verificationState ?? entity.verificationState,
    content: bodyContent(entity.body),
  });
}

function appendBodySection(body: string, heading: string, content: string): string {
  const base = body.trimEnd();
  return `${base}\n\n## ${heading}\n\n${content.trim()}\n`;
}

function sliceFromTrackedEntity(entity: TrackedLinearEntity): KataSlice {
  return {
    id: entity.kataId,
    milestoneId: entity.parentId ?? "",
    title: entity.title,
    goal: bodyContent(entity.body) || entity.title,
    status: isSliceStatus(String(entity.status)) ? entity.status as KataSlice["status"] : "backlog",
    order: 0,
    blockedBy: parseSliceDependencyIds(entity.blockedBy),
    blocking: parseSliceDependencyIds(entity.blocking),
  };
}

function taskFromTrackedEntity(entity: TrackedLinearEntity): KataTask {
  return {
    id: entity.kataId,
    sliceId: entity.parentId ?? "",
    title: entity.title,
    description: bodyContent(entity.body),
    status: isTaskStatus(String(entity.status)) ? entity.status as KataTask["status"] : "backlog",
    verificationState: taskVerificationStateFromEntity(entity),
  };
}

async function upsertLinearProjectDocument(input: {
  client: LinearClient;
  projectId: string;
  scopeId: string;
  artifactType: KataArtifactType;
  title: string;
  content: string;
}): Promise<{ backendId: string; body: string; title?: string; updatedAt?: string }> {
  const body = formatLinearArtifactMarker({
    scopeType: "project",
    scopeId: input.scopeId,
    artifactType: input.artifactType,
    content: input.content,
  });
  const documents = await input.client.paginate<{ id: string; title: string; content?: string | null; updatedAt?: string | null }, { project?: { documents?: any } | null }>({
    query: `
      query LinearKataProjectDocuments($projectId: String!, $after: String) {
        project(id: $projectId) {
          documents(first: 100, after: $after) {
            nodes { id title content updatedAt }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `,
    variables: { projectId: input.projectId },
    selectConnection: (data) => data.project?.documents,
  });
  const existing = documents.find((document) => {
    const parsed = typeof document.content === "string" ? parseLinearArtifactMarker(document.content) : null;
    return parsed?.scopeType === "project" && parsed.scopeId === input.scopeId && parsed.artifactType === input.artifactType;
  });
  if (existing) {
    const data = await input.client.graphql<{ documentUpdate: { document: { id: string; title: string; content?: string | null; updatedAt?: string | null } } }>({
      query: `
        mutation LinearKataDocumentUpdate($id: String!, $input: DocumentUpdateInput!) {
          documentUpdate(id: $id, input: $input) { success document { id title content updatedAt } }
        }
      `,
      variables: { id: existing.id, input: { title: input.title, content: body } },
    });
    return {
      backendId: `document:${data.documentUpdate.document.id}`,
      body: data.documentUpdate.document.content ?? body,
      title: data.documentUpdate.document.title,
      updatedAt: data.documentUpdate.document.updatedAt ?? undefined,
    };
  }
  const data = await input.client.graphql<{ documentCreate: { document: { id: string; title: string; content?: string | null; updatedAt?: string | null } } }>({
    query: `
      mutation LinearKataDocumentCreate($input: DocumentCreateInput!) {
        documentCreate(input: $input) { success document { id title content updatedAt } }
      }
    `,
    variables: { input: { projectId: input.projectId, title: input.title, content: body } },
  });
  return {
    backendId: `document:${data.documentCreate.document.id}`,
    body: data.documentCreate.document.content ?? body,
    title: data.documentCreate.document.title,
    updatedAt: data.documentCreate.document.updatedAt ?? undefined,
  };
}

function artifactFromLinearDocument(
  document: { id: string; title: string; content?: string | null; updatedAt?: string | null },
  scopeType: KataScopeType,
  scopeId: string,
): KataArtifact | null {
  const parsed = typeof document.content === "string" ? parseLinearArtifactMarker(document.content) : null;
  if (!parsed || parsed.scopeType !== scopeType || parsed.scopeId !== scopeId) return null;
  return {
    id: `${scopeType}:${scopeId}:${parsed.artifactType}`,
    scopeType,
    scopeId,
    artifactType: parsed.artifactType,
    title: document.title,
    content: parsed.content,
    format: "markdown",
    updatedAt: document.updatedAt ?? new Date().toISOString(),
    provenance: { backend: "linear", backendId: `document:${document.id}` },
  };
}

function artifactFromLinearComment(
  comment: { id: string; body?: string | null; updatedAt?: string | null },
  scopeType: KataScopeType,
  scopeId: string,
): KataArtifact | null {
  const parsed = typeof comment.body === "string" ? parseLinearArtifactMarker(comment.body) : null;
  if (!parsed || parsed.scopeType !== scopeType || parsed.scopeId !== scopeId) return null;
  return {
    id: `${scopeType}:${scopeId}:${parsed.artifactType}`,
    scopeType,
    scopeId,
    artifactType: parsed.artifactType,
    title: parsed.artifactType,
    content: parsed.content,
    format: "markdown",
    updatedAt: comment.updatedAt ?? new Date().toISOString(),
    provenance: { backend: "linear", backendId: `comment:${comment.id}` },
  };
}
