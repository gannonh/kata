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
  KataIssueStatus,
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
import type { createLinearClient, LinearConnection } from "./client.js";
import type { LinearStateMapping, LinearTrackerConfig } from "./config.js";
import {
  LinearKataIssueComments,
  LinearKataProjectDocuments,
  parseLinearArtifactMarker,
  upsertLinearIssueArtifactComment,
  upsertLinearMilestoneDocument,
} from "./artifacts.js";

type LinearClient = ReturnType<typeof createLinearClient>;
type LinearEntityType = "Project" | "Milestone" | "Slice" | "Task" | "Issue";

interface LinearKataAdapterInput {
  client: LinearClient;
  config: LinearTrackerConfig;
  workspacePath: string;
}

interface LinearEntityClassification {
  kataId: string;
  type: LinearEntityType;
  parentId?: string;
}

interface LinearClassificationLabels {
  slice: string;
  task: string;
  issue: string;
}

interface LinearLabelNode {
  id?: string | null;
  name?: string | null;
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
  parent?: LinearIssueNode | null;
  children?: { nodes?: Array<LinearIssueNode | null> | null } | null;
  labels?: { nodes?: Array<LinearLabelNode | null> | null } | null;
  relations?: { nodes?: Array<LinearIssueRelationNode | null> | null } | null;
  inverseRelations?: { nodes?: Array<LinearIssueRelationNode | null> | null } | null;
}

interface LinearIssueRelationNode {
  id: string;
  type?: string | null;
  issue?: LinearIssueNode | null;
  relatedIssue?: LinearIssueNode | null;
}

interface TrackedLinearEntity {
  kataId: string;
  type: LinearEntityType;
  parentId?: string;
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

interface LinearContext {
  team: LinearTeamNode;
  project: LinearProjectNode;
  stateByKataStatus: Map<keyof LinearStateMapping, LinearWorkflowStateNode>;
  kataStatusByStateName: Map<string, keyof LinearStateMapping>;
  labels: LinearClassificationLabels;
  labelIdByName: Map<string, string>;
}

interface LinearContextQueryData {
  viewer?: { id?: string | null } | null;
  organization?: { id?: string | null; urlKey?: string | null } | null;
  teams?: { nodes?: Array<LinearTeamNode | null> | null } | null;
  projects?: { nodes?: Array<LinearProjectNode | null> | null } | null;
  workflowStates?: { nodes?: Array<LinearWorkflowStateNode | null> | null } | null;
  issueLabels?: { nodes?: Array<LinearLabelNode | null> | null } | null;
}

interface LinearMilestonesQueryData {
  project?: {
    id: string;
    name: string;
    projectMilestones?: LinearConnection<LinearMilestoneNode> | null;
  } | null;
}

interface LinearIssuesQueryData {
  issues: LinearConnection<LinearIssueNode>;
}

interface LinearProjectUpdateMutationData {
  projectUpdate?: {
    success?: boolean | null;
    project?: LinearProjectNode | null;
  } | null;
}

interface LinearProjectMilestoneMutationData {
  projectMilestoneCreate?: {
    success?: boolean | null;
    projectMilestone?: LinearMilestoneNode | null;
  } | null;
  projectMilestoneUpdate?: {
    success?: boolean | null;
    projectMilestone?: LinearMilestoneNode | null;
  } | null;
}

interface LinearIssueMutationData {
  issueCreate?: {
    success?: boolean | null;
    issue?: LinearIssueNode | null;
  } | null;
  issueUpdate?: {
    success?: boolean | null;
    issue?: LinearIssueNode | null;
  } | null;
}

interface LinearIssueRelationCreateMutationData {
  issueRelationCreate?: {
    success?: boolean | null;
  } | null;
}

interface LinearArtifactCommentNode {
  id: string;
  body?: string | null;
  updatedAt?: string | null;
}

interface LinearArtifactDocumentNode {
  id: string;
  title?: string | null;
  content?: string | null;
  updatedAt?: string | null;
}

interface LinearArtifactCommentsQueryData {
  issue?: {
    comments?: LinearConnection<LinearArtifactCommentNode> | null;
  } | null;
}

interface LinearArtifactDocumentsQueryData {
  documents?: LinearConnection<LinearArtifactDocumentNode> | null;
  project?: {
    documents?: LinearConnection<LinearArtifactDocumentNode> | null;
  } | null;
}

export const LINEAR_CONTEXT_QUERY = `
  query LinearKataContext($teamKey: String!, $first: Int!) {
    viewer {
      id
    }
    organization {
      id
      urlKey
    }
    teams(first: $first) {
      nodes {
        id
        key
        name
      }
    }
    projects(first: $first) {
      nodes {
        id
        name
        slugId
        url
        description
      }
    }
    workflowStates(first: $first, filter: { team: { key: { eq: $teamKey } } }) {
      nodes {
        id
        name
        type
      }
    }
    issueLabels(first: $first) {
      nodes {
        id
        name
      }
    }
  }
`;

export const LINEAR_MILESTONES_QUERY = `
  query LinearKataMilestones($projectId: String!, $first: Int!, $after: String) {
    project(id: $projectId) {
      id
      name
      projectMilestones(first: $first, after: $after) {
        nodes {
          id
          name
          description
          targetDate
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const LINEAR_ISSUES_QUERY = `
  query LinearKataIssues($teamId: ID!, $projectId: ID!, $first: Int!, $after: String) {
    issues(first: $first, after: $after, filter: { team: { id: { eq: $teamId } }, project: { id: { eq: $projectId } } }) {
      nodes {
        id
        identifier
        number
        title
        description
        url
        state {
          id
          name
          type
        }
        project {
          id
          name
          slugId
          url
          description
        }
        projectMilestone {
          id
          name
          description
          targetDate
        }
        parent {
          id
          identifier
          number
          title
          description
          url
          state {
            id
            name
            type
          }
          labels(first: 50) {
            nodes {
              name
            }
          }
          projectMilestone {
            id
            name
            description
            targetDate
          }
        }
        children(first: 100) {
          nodes {
            id
            identifier
            number
            title
            description
            url
            state {
              id
              name
              type
            }
            labels(first: 50) {
              nodes {
                name
              }
            }
            projectMilestone {
              id
              name
              description
              targetDate
            }
          }
        }
        labels(first: 50) {
          nodes {
            name
          }
        }
        relations(first: 50) {
          nodes {
            id
            type
            issue {
              id
              identifier
              title
            }
            relatedIssue {
              id
              identifier
              title
            }
          }
        }
        inverseRelations(first: 50) {
          nodes {
            id
            type
            issue {
              id
              identifier
              title
            }
            relatedIssue {
              id
              identifier
              title
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const LINEAR_PROJECT_UPDATE_MUTATION = `
  mutation LinearKataProjectUpdate($id: String!, $input: ProjectUpdateInput!) {
    projectUpdate(id: $id, input: $input) {
      success
      project {
        id
        name
        slugId
        url
        description
      }
    }
  }
`;

export const LINEAR_PROJECT_MILESTONE_CREATE_MUTATION = `
  mutation LinearKataProjectMilestoneCreate($input: ProjectMilestoneCreateInput!) {
    projectMilestoneCreate(input: $input) {
      success
      projectMilestone {
        id
        name
        description
        targetDate
      }
    }
  }
`;

export const LINEAR_PROJECT_MILESTONE_UPDATE_MUTATION = `
  mutation LinearKataProjectMilestoneUpdate($id: String!, $input: ProjectMilestoneUpdateInput!) {
    projectMilestoneUpdate(id: $id, input: $input) {
      success
      projectMilestone {
        id
        name
        description
        targetDate
      }
    }
  }
`;

export const LINEAR_ISSUE_CREATE_MUTATION = `
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
        state {
          id
          name
          type
        }
        projectMilestone {
          id
          name
          description
          targetDate
        }
        parent {
          id
          identifier
          number
          title
          description
          url
          state {
            id
            name
            type
          }
        }
      }
    }
  }
`;

export const LINEAR_ISSUE_UPDATE_MUTATION = `
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
        state {
          id
          name
          type
        }
        projectMilestone {
          id
          name
          description
          targetDate
        }
        parent {
          id
          identifier
          number
          title
          description
          url
          state {
            id
            name
            type
          }
        }
      }
    }
  }
`;

export const LINEAR_ISSUE_RELATION_CREATE_MUTATION = `
  mutation LinearKataIssueRelationCreate($input: IssueRelationCreateInput!) {
    issueRelationCreate(input: $input) {
      success
    }
  }
`;

export class LinearKataAdapter implements KataBackendAdapter {
  private readonly client: LinearClient;
  private readonly config: LinearTrackerConfig;
  private readonly workspacePath: string;
  private contextPromise: Promise<LinearContext> | null = null;
  private discovered = false;
  private readonly entities = new Map<string, TrackedLinearEntity>();
  private readonly linearIdToKataId = new Map<string, string>();

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
    const data = await this.client.graphql<LinearProjectUpdateMutationData>({
      query: LINEAR_PROJECT_UPDATE_MUTATION,
      variables: {
        id: context.project.id,
        input: {
          name: input.title,
          description: input.description,
        },
      },
    });
    const project = requireMutationNode(data.projectUpdate, data.projectUpdate?.project, "Linear project update");

    context.project = {
      ...context.project,
      ...project,
      name: input.title,
      description: project.description ?? input.description,
    };

    return {
      backend: "linear",
      workspacePath: this.workspacePath,
      title: context.project.name,
      description: context.project.description ?? input.description,
    };
  }

  async listMilestones(): Promise<KataMilestone[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Milestone")
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map(milestoneFromEntity);
  }

  async getActiveMilestone(): Promise<KataMilestone | null> {
    const milestones = await this.listMilestones();
    if (milestones.length === 0) return null;

    if (this.config.activeMilestoneId) {
      const activeMilestoneId = this.config.activeMilestoneId;
      const match = milestones.find((milestone) => {
        const entity = this.entities.get(milestone.id);
        return milestone.id === activeMilestoneId || entity?.linearId === activeMilestoneId;
      });
      if (!match) {
        throw new KataDomainError("INVALID_CONFIG", `Linear active milestone ${activeMilestoneId} was not found.`);
      }
      return match;
    }

    if (milestones.length === 1) return milestones[0] ?? null;

    throw new KataDomainError("INVALID_CONFIG", "Multiple Linear milestones were found; set linear.activeMilestoneId.");
  }

  async createMilestone(input: KataMilestoneCreateInput): Promise<KataMilestone> {
    await this.discoverEntities();
    const context = await this.getContext();
    const kataId = this.nextKataId("Milestone");
    const data = await this.client.graphql<LinearProjectMilestoneMutationData>({
      query: LINEAR_PROJECT_MILESTONE_CREATE_MUTATION,
      variables: {
        input: {
          projectId: context.project.id,
          name: `[${kataId}] ${input.title}`,
          description: input.goal,
        },
      },
    });
    const milestone = requireMutationNode(
      data.projectMilestoneCreate,
      data.projectMilestoneCreate?.projectMilestone,
      "Linear milestone creation",
    );

    const entity: TrackedLinearEntity = {
      kataId,
      type: "Milestone",
      linearId: milestone.id,
      title: input.title,
      body: milestone.description ?? input.goal,
    };
    this.addDiscoveredEntity(entity);
    return milestoneFromEntity(entity);
  }

  async completeMilestone(input: KataMilestoneCompleteInput): Promise<KataMilestone> {
    const entity = await this.requireEntity(input.milestoneId, "Milestone");
    const description = appendBodySection(entity.body, "Completion Summary", input.summary);
    const data = await this.client.graphql<LinearProjectMilestoneMutationData>({
      query: LINEAR_PROJECT_MILESTONE_UPDATE_MUTATION,
      variables: {
        id: entity.linearId,
        input: {
          description,
        },
      },
    });
    const milestone = requireMutationNode(
      data.projectMilestoneUpdate,
      data.projectMilestoneUpdate?.projectMilestone,
      "Linear milestone completion",
    );
    const updatedEntity: TrackedLinearEntity = {
      ...entity,
      title: milestone.name ? stripKataPrefix(milestone.name) : entity.title,
      body: milestone.description ?? description,
    };
    this.entities.set(updatedEntity.kataId, updatedEntity);

    return {
      ...milestoneFromEntity(updatedEntity),
      status: "done",
      active: false,
    };
  }

  async listSlices(input: { milestoneId: string }): Promise<KataSlice[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Slice" && entity.parentId === input.milestoneId)
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map((entity, index) => sliceFromEntity(entity, this.config.states, index));
  }

  async createSlice(input: KataSliceCreateInput): Promise<KataSlice> {
    await this.discoverEntities();
    const milestone = await this.requireEntity(input.milestoneId, "Milestone");
    const kataId = this.nextKataId("Slice");
    const blockedBy = parseSliceDependencyIds(input.blockedBy ?? []);
    const entity = await this.createLinearIssue({
      kataId,
      type: "Slice",
      parentKataId: milestone.kataId,
      title: input.title,
      description: input.goal,
      status: "backlog",
      projectMilestoneId: milestone.linearId,
    });
    this.addDiscoveredEntity(entity);
    await this.createNativeIssueDependencies(entity, blockedBy);

    return {
      ...sliceFromEntity(this.entities.get(kataId) ?? entity, this.config.states, input.order ?? 0),
      status: "backlog",
      order: input.order ?? 0,
    };
  }

  async updateSliceStatus(input: KataSliceUpdateStatusInput): Promise<KataSlice> {
    const entity = await this.requireEntity(input.sliceId, "Slice");
    const updatedEntity = await this.updateLinearIssueEntity(entity, input.status);
    return {
      ...sliceFromEntity(updatedEntity, this.config.states, 0),
      status: input.status,
    };
  }

  async listTasks(input: { sliceId: string }): Promise<KataTask[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Task" && entity.parentId === input.sliceId)
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map((entity) => taskFromEntity(entity, this.config.states));
  }

  async createTask(input: KataTaskCreateInput): Promise<KataTask> {
    await this.discoverEntities();
    const slice = await this.requireEntity(input.sliceId, "Slice");
    const kataId = this.nextKataId("Task");
    const entity = await this.createLinearIssue({
      kataId,
      type: "Task",
      parentKataId: slice.kataId,
      title: input.title,
      description: input.description,
      status: "backlog",
      projectMilestoneId: slice.projectMilestoneId,
      parentLinearId: slice.linearId,
    });
    this.addDiscoveredEntity(entity);

    return {
      ...taskFromEntity(entity, this.config.states),
      status: "backlog",
      verificationState: "pending",
    };
  }

  async updateTaskStatus(input: KataTaskUpdateStatusInput): Promise<KataTask> {
    const entity = await this.requireEntity(input.taskId, "Task");
    const updatedEntity = await this.updateLinearIssueEntity(entity, input.status);
    const task = taskFromEntity(updatedEntity, this.config.states);
    return {
      ...task,
      status: input.status,
      verificationState: input.verificationState ?? task.verificationState,
    };
  }

  async createIssue(input: KataIssueCreateInput): Promise<KataIssue> {
    await this.discoverEntities();
    const kataId = this.nextKataId("Issue");
    const body = `# Design\n\n${input.design}\n\n# Plan\n\n${input.plan}`;
    const entity = await this.createLinearIssue({
      kataId,
      type: "Issue",
      title: input.title,
      description: body,
      status: "backlog",
    });
    this.addDiscoveredEntity(entity);

    return {
      ...issueFromEntity(entity, this.config.states),
      status: "backlog",
    };
  }

  async listOpenIssues(): Promise<KataIssueSummary[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Issue" && issueStatusFromEntity(entity, this.config.states) !== "done")
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map((entity) => issueSummaryFromEntity(entity, this.config.states));
  }

  async getIssue(input: KataIssueGetInput): Promise<KataIssue> {
    const entity = await this.findIssueEntity(input.issueRef);
    return issueFromEntity(entity, this.config.states);
  }

  async updateIssueStatus(input: KataIssueUpdateStatusInput): Promise<KataIssue> {
    const entity = await this.requireEntity(input.issueId, "Issue");
    const updatedEntity = await this.updateLinearIssueEntity(entity, input.status);
    return {
      ...issueFromEntity(updatedEntity, this.config.states),
      status: input.status,
    };
  }

  async listArtifacts(input: { scopeType: KataScopeType; scopeId: string }): Promise<KataArtifact[]> {
    if (input.scopeType === "project" || input.scopeType === "milestone") {
      const context = await this.getContext();
      const documents = await this.client.paginate<LinearArtifactDocumentNode, LinearArtifactDocumentsQueryData>({
        query: LinearKataProjectDocuments,
        variables: { projectId: context.project.id, first: 100 },
        selectConnection: (data) =>
          data.project?.documents ?? data.documents ?? emptyLinearConnection<LinearArtifactDocumentNode>(),
      });

      return documents.flatMap((document) => {
        const artifact = artifactFromLinearDocument(document, input.scopeType, input.scopeId);
        return artifact ? [artifact] : [];
      });
    }

    const entity = await this.findArtifactEntity(input.scopeType, input.scopeId);
    if (!entity) return [];

    const comments = await this.client.paginate<LinearArtifactCommentNode, LinearArtifactCommentsQueryData>({
      query: LinearKataIssueComments,
      variables: { issueId: entity.linearId, first: 100 },
      selectConnection: (data) => data.issue?.comments ?? emptyLinearConnection<LinearArtifactCommentNode>(),
    });

    return comments.flatMap((comment) => {
      const artifact = artifactFromLinearComment(comment, input.scopeType, input.scopeId);
      return artifact ? [artifact] : [];
    });
  }

  async readArtifact(input: {
    scopeType: KataScopeType;
    scopeId: string;
    artifactType: KataArtifactType;
  }): Promise<KataArtifact | null> {
    const artifacts = await this.listArtifacts(input);
    return artifacts.find((artifact) => artifact.artifactType === input.artifactType) ?? null;
  }

  async writeArtifact(input: KataArtifactWriteInput): Promise<KataArtifact> {
    if (input.scopeType === "project" || input.scopeType === "milestone") {
      const context = await this.getContext();
      const result = await upsertLinearMilestoneDocument({
        client: this.client,
        projectId: context.project.id,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: input.title,
        content: input.content,
      });
      const parsed = parseLinearArtifactMarker(result.body, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
      });

      return {
        id: artifactId(input.scopeType, input.scopeId, input.artifactType),
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: result.title ?? input.title,
        content: parsed?.content ?? input.content,
        format: input.format,
        updatedAt: result.updatedAt ?? new Date().toISOString(),
        provenance: {
          backend: "linear",
          backendId: result.backendId,
        },
      };
    }

    const entity = await this.findArtifactEntity(input.scopeType, input.scopeId);
    if (!entity) {
      throw new KataDomainError("NOT_FOUND", `${input.scopeType} ${input.scopeId} was not found.`);
    }

    const result = await upsertLinearIssueArtifactComment({
      client: this.client,
      issueId: entity.linearId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      artifactType: input.artifactType,
      content: input.content,
    });
    const parsed = parseLinearArtifactMarker(result.body, {
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    });

    return {
      id: artifactId(input.scopeType, input.scopeId, input.artifactType),
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      artifactType: input.artifactType,
      title: input.title,
      content: parsed?.content ?? input.content,
      format: input.format,
      updatedAt: result.updatedAt ?? new Date().toISOString(),
      provenance: {
        backend: "linear",
        backendId: result.backendId,
      },
    };
  }

  async openPullRequest(input: {
    title: string;
    body: string;
    base: string;
    head: string;
  }): Promise<KataPullRequest> {
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
      await this.getContext();
    } catch (error) {
      return {
        ok: false,
        backend: "linear",
        checks: [
          {
            name: "adapter",
            status: "invalid",
            message: error instanceof Error ? error.message : "Unable to validate Linear adapter configuration.",
          },
        ],
      };
    }

    return {
      ok: true,
      backend: "linear",
      checks: [
        {
          name: "adapter",
          status: "ok",
          message: "Linear adapter is configured.",
        },
      ],
    };
  }

  private getContext(): Promise<LinearContext> {
    this.contextPromise ??= this.loadContext();
    return this.contextPromise;
  }

  private async loadContext(): Promise<LinearContext> {
    const data = await this.client.graphql<LinearContextQueryData>({
      query: LINEAR_CONTEXT_QUERY,
      variables: {
        teamKey: this.config.team,
        first: 100,
      },
    });

    const team = (data.teams?.nodes ?? [])
      .filter((node): node is LinearTeamNode => node !== null)
      .find((node) => matchesLinearSelector(node, this.config.team, ["id", "key", "name"]));
    if (!team) {
      throw new KataDomainError("INVALID_CONFIG", `Linear team ${this.config.team} was not found.`);
    }

    const organizationIdentifiers = [data.organization?.urlKey, data.organization?.id].filter(
      (value): value is string => typeof value === "string" && value !== "",
    );
    if (organizationIdentifiers.length > 0 && !organizationIdentifiers.includes(this.config.workspace)) {
      throw new KataDomainError(
        "INVALID_CONFIG",
        `Linear workspace ${this.config.workspace} did not match organization ${organizationIdentifiers.join(" or ")}.`,
      );
    }

    const project = (data.projects?.nodes ?? [])
      .filter((node): node is LinearProjectNode => node !== null)
      .find((node) => matchesLinearSelector(node, this.config.project, ["id", "slugId", "name"]));
    if (!project) {
      throw new KataDomainError("INVALID_CONFIG", `Linear project ${this.config.project} was not found.`);
    }

    const workflowStates = (data.workflowStates?.nodes ?? []).filter(
      (node): node is LinearWorkflowStateNode => node !== null,
    );
    const stateByKataStatus = new Map<keyof LinearStateMapping, LinearWorkflowStateNode>();
    const kataStatusByStateName = new Map<string, keyof LinearStateMapping>();

    for (const [kataStatus, stateName] of Object.entries(this.config.states) as Array<
      [keyof LinearStateMapping, string]
    >) {
      const state = workflowStates.find((candidate) => candidate.name === stateName);
      if (!state) {
        throw new KataDomainError("INVALID_CONFIG", `Linear workflow state ${stateName} was not found.`);
      }
      stateByKataStatus.set(kataStatus, state);
      kataStatusByStateName.set(state.name, kataStatus);
    }

    const labelIdByName = new Map(
      (data.issueLabels?.nodes ?? [])
        .filter((node): node is LinearLabelNode => node !== null)
        .flatMap((label) => (isNonEmptyString(label.id) && isNonEmptyString(label.name) ? [[label.name, label.id] as const] : [])),
    );
    const classificationLabels = linearClassificationLabels(this.config.labels);

    return {
      team,
      project,
      stateByKataStatus,
      kataStatusByStateName,
      labels: classificationLabels,
      labelIdByName,
    };
  }

  private async discoverEntities(): Promise<void> {
    if (this.discovered) return;

    const context = await this.getContext();
    const milestones = await this.loadMilestoneEntities(context.project.id);
    const issues = await this.loadIssueEntities(context.team.id, context.project.id, milestones);
    const discoveredEntities = [...milestones, ...issues];

    this.entities.clear();
    this.linearIdToKataId.clear();
    for (const entity of discoveredEntities) {
      this.addDiscoveredEntity(entity);
    }

    this.mergeIssueDependencies();
    this.discovered = true;
  }

  private async loadMilestoneEntities(projectId: string): Promise<TrackedLinearEntity[]> {
    const milestones = await this.client.paginate<LinearMilestoneNode, LinearMilestonesQueryData>({
      query: LINEAR_MILESTONES_QUERY,
      variables: { projectId, first: 100 },
      selectConnection: (data) => data.project?.projectMilestones ?? emptyLinearConnection<LinearMilestoneNode>(),
    });

    return milestones.map((milestone) => ({
      kataId: normalizeMilestoneKataId(milestone.name),
      type: "Milestone",
      linearId: milestone.id,
      title: milestone.name,
      body: milestone.description ?? milestone.name,
    }));
  }

  private async loadIssueEntities(
    teamId: string,
    projectId: string,
    milestones: TrackedLinearEntity[],
  ): Promise<TrackedLinearEntity[]> {
    const milestoneByLinearId = new Map(milestones.map((entity) => [entity.linearId, entity.kataId]));
    const issues = await this.client.paginate<LinearIssueNode, LinearIssuesQueryData>({
      query: LINEAR_ISSUES_QUERY,
      variables: { teamId, projectId, first: 100 },
      selectConnection: (data) => data.issues,
    });
    const labels = linearClassificationLabels(this.config.labels);

    return issues.flatMap((issue) => issueEntitiesFromIssue(issue, milestoneByLinearId, labels));
  }

  private mergeIssueDependencies(): void {
    for (const blockedEntity of this.entities.values()) {
      if (blockedEntity.type !== "Slice") continue;

      const blockedBy = parseSliceDependencyIds(blockedEntity.blockedBy ?? []);
      this.entities.set(blockedEntity.kataId, {
        ...blockedEntity,
        blockedBy,
      });

      for (const blockerId of blockedBy) {
        const blocker = this.entities.get(blockerId);
        if (!blocker || blocker.type !== "Slice") continue;
        this.entities.set(blocker.kataId, {
          ...blocker,
          blocking: parseSliceDependencyIds([...(blocker.blocking ?? []), blockedEntity.kataId]),
        });
      }
    }
  }

  private async findIssueEntity(issueRef: string): Promise<TrackedLinearEntity> {
    await this.discoverEntities();
    const normalizedRef = issueRef.trim();
    if (!normalizedRef) {
      throw new KataDomainError("INVALID_CONFIG", "Standalone issue reference is required.");
    }

    const normalizedId = normalizedRef.toUpperCase();
    const issueEntities = [...this.entities.values()].filter((entity) => entity.type === "Issue");
    const exactKataId = issueEntities.find((entity) => entity.kataId.toUpperCase() === normalizedId);
    if (exactKataId) return exactKataId;

    const exactIdentifier = issueEntities.find((entity) => entity.identifier?.toUpperCase() === normalizedId);
    if (exactIdentifier) return exactIdentifier;

    const titleMatches = issueEntities.filter((entity) => entity.title.toLowerCase().includes(normalizedRef.toLowerCase()));
    if (titleMatches.length === 1) return titleMatches[0]!;
    if (titleMatches.length > 1) {
      throw new KataDomainError(
        "UNKNOWN",
        `Issue reference "${issueRef}" matched multiple standalone issues: ${titleMatches.map((entity) => `${entity.kataId} ${entity.identifier ?? entity.linearId} ${entity.title}`).join("; ")}.`,
      );
    }

    throw new KataDomainError("NOT_FOUND", `Standalone issue was not found for reference "${issueRef}".`);
  }

  private async findArtifactEntity(scopeType: KataScopeType, scopeId: string): Promise<TrackedLinearEntity | null> {
    await this.discoverEntities();
    if (scopeType === "project") return null;
    const expectedType = entityTypeForArtifactScope(scopeType);
    if (!expectedType) return null;
    const entity = this.entities.get(scopeId.trim().toUpperCase());
    return entity?.type === expectedType ? entity : null;
  }

  private async requireEntity(kataId: string, type: LinearEntityType): Promise<TrackedLinearEntity> {
    await this.discoverEntities();
    const normalizedId = kataId.trim().toUpperCase();
    const entity = this.entities.get(normalizedId);
    if (!entity || entity.type !== type) {
      throw new KataDomainError("NOT_FOUND", `${type} ${kataId} was not found.`);
    }
    return entity;
  }

  private nextKataId(type: LinearEntityType): string {
    const prefixByType: Record<LinearEntityType, string> = {
      Project: "P",
      Milestone: "M",
      Slice: "S",
      Task: "T",
      Issue: "I",
    };
    const prefix = prefixByType[type];
    const max = [...this.entities.values()]
      .filter((entity) => entity.type === type && entity.kataId.startsWith(prefix))
      .reduce((currentMax, entity) => {
        const value = Number(entity.kataId.slice(1));
        return Number.isSafeInteger(value) ? Math.max(currentMax, value) : currentMax;
      }, 0);

    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  }

  private async createLinearIssue(input: {
    kataId: string;
    type: Extract<LinearEntityType, "Slice" | "Task" | "Issue">;
    parentKataId?: string;
    title: string;
    description: string;
    status: keyof LinearStateMapping;
    projectMilestoneId?: string;
    parentLinearId?: string;
  }): Promise<TrackedLinearEntity> {
    const context = await this.getContext();
    const stateId = requireStateId(context, input.status);
    const data = await this.client.graphql<LinearIssueMutationData>({
      query: LINEAR_ISSUE_CREATE_MUTATION,
      variables: {
        input: {
          teamId: context.team.id,
          projectId: context.project.id,
          title: `[${input.kataId}] ${input.title}`,
          description: input.description,
          stateId,
          labelIds: labelIdsForType(context, input.type),
          projectMilestoneId: input.projectMilestoneId,
          parentId: input.parentLinearId,
        },
      },
    });
    const issue = requireMutationNode(data.issueCreate, data.issueCreate?.issue, "Linear issue creation");

    return {
      kataId: input.kataId,
      type: input.type,
      parentId: input.parentKataId,
      blockedBy: input.type === "Slice" ? [] : undefined,
      blocking: input.type === "Slice" ? [] : undefined,
      linearId: issue.id,
      identifier: issue.identifier,
      title: stripKataPrefix(issue.title),
      body: issue.description ?? input.description,
      url: issue.url ?? undefined,
      stateName: issue.state?.name ?? undefined,
      stateType: issue.state?.type ?? undefined,
      projectMilestoneId: issue.projectMilestone?.id ?? input.projectMilestoneId,
    };
  }

  private async updateLinearIssueEntity(
    entity: TrackedLinearEntity,
    status: keyof LinearStateMapping,
  ): Promise<TrackedLinearEntity> {
    const context = await this.getContext();
    const data = await this.client.graphql<LinearIssueMutationData>({
      query: LINEAR_ISSUE_UPDATE_MUTATION,
      variables: {
        id: entity.linearId,
        input: {
          stateId: requireStateId(context, status),
        },
      },
    });
    const issue = requireMutationNode(data.issueUpdate, data.issueUpdate?.issue, "Linear issue update");

    const updatedEntity: TrackedLinearEntity = {
      ...entity,
      linearId: issue.id,
      identifier: issue.identifier ?? entity.identifier,
      title: stripKataPrefix(issue.title),
      body: issue.description ?? entity.body,
      url: issue.url ?? entity.url,
      stateName: issue.state?.name ?? entity.stateName,
      stateType: issue.state?.type ?? entity.stateType,
      projectMilestoneId: issue.projectMilestone?.id ?? entity.projectMilestoneId,
    };
    if (updatedEntity.linearId !== entity.linearId) {
      this.linearIdToKataId.delete(entity.linearId);
    }
    this.entities.set(updatedEntity.kataId, updatedEntity);
    this.linearIdToKataId.set(updatedEntity.linearId, updatedEntity.kataId);
    return updatedEntity;
  }

  private async createNativeIssueDependencies(
    blockedEntity: TrackedLinearEntity,
    blockedByIds: string[],
  ): Promise<void> {
    const blockedBy = parseSliceDependencyIds(blockedByIds);
    const updates: TrackedLinearEntity[] = [];
    let updatedBlockedEntity = blockedEntity;

    for (const blockerId of blockedBy) {
      const blocker = await this.requireEntity(blockerId, "Slice");
      const data = await this.client.graphql<LinearIssueRelationCreateMutationData>({
        query: LINEAR_ISSUE_RELATION_CREATE_MUTATION,
        variables: {
          input: {
            issueId: blocker.linearId,
            relatedIssueId: blockedEntity.linearId,
            type: "blocks",
          },
        },
      });
      requireSuccessfulMutation(data.issueRelationCreate, "Linear issue relation creation");

      const updatedBlocker: TrackedLinearEntity = {
        ...blocker,
        blocking: parseSliceDependencyIds([...(blocker.blocking ?? []), updatedBlockedEntity.kataId]),
      };
      updatedBlockedEntity = {
        ...updatedBlockedEntity,
        blockedBy: parseSliceDependencyIds([...(updatedBlockedEntity.blockedBy ?? []), blocker.kataId]),
      };
      updates.push(updatedBlocker);
    }

    for (const entity of updates) {
      this.entities.set(entity.kataId, entity);
    }
    if (updates.length > 0) {
      this.entities.set(updatedBlockedEntity.kataId, updatedBlockedEntity);
    }
  }

  private addDiscoveredEntity(entity: TrackedLinearEntity): void {
    const duplicate = this.entities.get(entity.kataId);
    if (duplicate) {
      if (duplicate.linearId === entity.linearId) {
        this.entities.set(entity.kataId, mergeDiscoveredEntity(duplicate, entity));
        this.linearIdToKataId.set(entity.linearId, entity.kataId);
        return;
      }
      throw new KataDomainError(
        "INVALID_CONFIG",
        `Linear discovery found duplicate Kata id ${entity.kataId}: ${duplicate.identifier ?? duplicate.linearId} and ${entity.identifier ?? entity.linearId}.`,
      );
    }
    this.entities.set(entity.kataId, entity);
    this.linearIdToKataId.set(entity.linearId, entity.kataId);
  }
}

function mergeDiscoveredEntity(left: TrackedLinearEntity, right: TrackedLinearEntity): TrackedLinearEntity {
  return {
    ...left,
    parentId: left.parentId ?? right.parentId,
    blockedBy: parseSliceDependencyIds([...(left.blockedBy ?? []), ...(right.blockedBy ?? [])]),
    blocking: parseSliceDependencyIds([...(left.blocking ?? []), ...(right.blocking ?? [])]),
    identifier: left.identifier ?? right.identifier,
    url: left.url ?? right.url,
    stateName: left.stateName ?? right.stateName,
    stateType: left.stateType ?? right.stateType,
    projectMilestoneId: left.projectMilestoneId ?? right.projectMilestoneId,
    body: left.body || right.body,
    title: left.title || right.title,
  };
}

function artifactFromLinearDocument(
  document: LinearArtifactDocumentNode,
  scopeType: KataScopeType,
  scopeId: string,
): KataArtifact | null {
  const parsed = typeof document.content === "string" ? parseLinearArtifactMarker(document.content) : null;
  const artifactType = parsed?.scopeType === scopeType && parsed.scopeId === scopeId
    ? parsed.artifactType
    : artifactTypeFromLinearDocumentTitle(scopeType, scopeId, document.title);
  if (!artifactType) return null;

  return {
    id: artifactId(scopeType, scopeId, artifactType),
    scopeType,
    scopeId,
    artifactType,
    title: document.title ?? artifactType,
    content: parsed?.content ?? document.content ?? "",
    format: "markdown",
    updatedAt: document.updatedAt ?? new Date().toISOString(),
    provenance: {
      backend: "linear",
      backendId: `document:${document.id}`,
    },
  };
}

function artifactTypeFromLinearDocumentTitle(
  scopeType: KataScopeType,
  scopeId: string,
  title: string | null | undefined,
): KataArtifactType | null {
  const normalizedTitle = title?.trim();
  if (!normalizedTitle) return null;

  if (scopeType === "project" && normalizedTitle.toUpperCase() === "PROJECT") {
    return "project-brief";
  }

  const unscopedTitle = normalizedTitle.startsWith(`${scopeId} `)
    ? normalizedTitle.slice(scopeId.length + 1).trim()
    : normalizedTitle;
  const normalized = unscopedTitle.toLowerCase();
  const titleMap = new Map<string, KataArtifactType>([
    ["project brief", "project-brief"],
    ["requirements", "requirements"],
    ["roadmap", "roadmap"],
    ["phase context", "phase-context"],
    ["context", "context"],
    ["decisions", "decisions"],
    ["research", "research"],
    ["plan", "plan"],
    ["slice", "slice"],
    ["summary", "summary"],
    ["verification", "verification"],
    ["uat", "uat"],
    ["retrospective", "retrospective"],
  ]);

  return titleMap.get(normalized) ?? null;
}

function artifactFromLinearComment(
  comment: LinearArtifactCommentNode,
  scopeType: KataScopeType,
  scopeId: string,
): KataArtifact | null {
  const parsed = typeof comment.body === "string"
    ? parseLinearArtifactMarker(comment.body, { scopeType, scopeId })
    : null;
  if (parsed?.scopeType !== scopeType || parsed.scopeId !== scopeId) return null;

  return {
    id: artifactId(scopeType, scopeId, parsed.artifactType),
    scopeType,
    scopeId,
    artifactType: parsed.artifactType,
    title: parsed.artifactType,
    content: parsed.content,
    format: "markdown",
    updatedAt: comment.updatedAt ?? new Date().toISOString(),
    provenance: {
      backend: "linear",
      backendId: `comment:${comment.id}`,
    },
  };
}

function entityTypeForArtifactScope(scopeType: KataScopeType): LinearEntityType | null {
  if (scopeType === "milestone") return "Milestone";
  if (scopeType === "slice") return "Slice";
  if (scopeType === "task") return "Task";
  if (scopeType === "issue") return "Issue";
  return null;
}

function artifactId(scopeType: KataScopeType, scopeId: string, artifactType: KataArtifactType): string {
  return `${scopeType}:${scopeId}:${artifactType}`;
}

function requireStateId(context: LinearContext, status: keyof LinearStateMapping): string {
  const state = context.stateByKataStatus.get(status);
  if (!state) {
    throw new KataDomainError("INVALID_CONFIG", `Linear workflow state for Kata status ${status} was not found.`);
  }
  return state.id;
}

function labelIdsForType(
  context: LinearContext,
  type: Extract<LinearEntityType, "Slice" | "Task" | "Issue">,
): string[] {
  const labelNameByType = {
    Slice: context.labels.slice,
    Task: context.labels.task,
    Issue: context.labels.issue,
  } satisfies Record<Extract<LinearEntityType, "Slice" | "Task" | "Issue">, string>;
  const labelName = labelNameByType[type];
  const labelId = context.labelIdByName.get(labelName);
  if (!labelId) {
    throw new KataDomainError("INVALID_CONFIG", `Linear label ${labelName} for ${type} was not found.`);
  }
  return [labelId];
}

function requireMutationNode<T extends { id?: string | null }>(
  mutation: { success?: boolean | null } | null | undefined,
  node: T | null | undefined,
  operation: string,
): T {
  requireSuccessfulMutation(mutation, operation);
  if (!node || !isNonEmptyString(node.id)) {
    throw new KataDomainError("UNKNOWN", `${operation} did not return a valid id.`);
  }
  return node;
}

function requireSuccessfulMutation(
  mutation: { success?: boolean | null } | null | undefined,
  operation: string,
): void {
  if (mutation?.success !== true) {
    throw new KataDomainError("UNKNOWN", `${operation} failed.`);
  }
}

function appendBodySection(body: string, heading: string, content: string): string {
  const base = body.trim();
  const section = `# ${heading}\n\n${content.trim()}`;
  return base ? `${base}\n\n${section}` : section;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function stripKataPrefix(title: string): string {
  return title.replace(/^\[[A-Z]\d{3}\]\s*/, "");
}

function normalizeMilestoneKataId(name: string): string {
  const match = name.match(/\bM(\d{3})\b/i);
  if (!match) return "M001";
  return `M${match[1]}`;
}

function linearIssueNumber(identifier: string): number | undefined {
  const match = identifier.match(/-(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

function linearClassificationLabels(labels: Record<string, string>): LinearClassificationLabels {
  return {
    slice: labels.slice ?? "kata/slice",
    task: labels.task ?? "kata/task",
    issue: labels.issue ?? "kata/issue",
  };
}

function issueEntitiesFromIssue(
  issue: LinearIssueNode,
  milestoneByLinearId: Map<string, string>,
  labels: LinearClassificationLabels,
): TrackedLinearEntity[] {
  const entities: TrackedLinearEntity[] = [];
  const classification = classifyLinearIssue(issue, milestoneByLinearId, labels);
  if (classification) {
    entities.push(entityFromIssueNode(issue, classification, milestoneByLinearId));
  }

  for (const child of issue.children?.nodes ?? []) {
    if (!child) continue;
    const childClassification = classifyLinearIssue(child, milestoneByLinearId, labels);
    if (!childClassification) continue;
    entities.push(
      entityFromIssueNode(
        child,
        {
          ...childClassification,
          parentId: childClassification.parentId ?? classification?.kataId,
        },
        milestoneByLinearId,
      ),
    );
  }

  return entities;
}

function classifyLinearIssue(
  issue: LinearIssueNode,
  milestoneByLinearId: Map<string, string>,
  labels: LinearClassificationLabels,
): LinearEntityClassification | null {
  const kataId = parseKataIdFromTitle(issue.title);
  const labelNames = new Set((issue.labels?.nodes ?? []).flatMap((label) => (label?.name ? [label.name] : [])));
  const milestoneId = issue.projectMilestone?.id ? milestoneByLinearId.get(issue.projectMilestone.id) : undefined;
  const parentKataId = issue.parent ? parseKataIdFromTitle(issue.parent.title) : undefined;

  if (labelNames.has(labels.task)) {
    if (!kataId) return null;
    return {
      kataId,
      type: "Task",
      parentId: parentKataId,
    };
  }

  if (labelNames.has(labels.slice)) {
    if (!kataId) return null;
    return {
      kataId,
      type: "Slice",
      parentId: milestoneId,
    };
  }

  if (labelNames.has(labels.issue)) {
    if (!kataId) return null;
    return {
      kataId,
      type: "Issue",
    };
  }

  if (kataId?.startsWith("T")) {
    return {
      kataId,
      type: "Task",
      parentId: parentKataId,
    };
  }

  if (kataId?.startsWith("S")) {
    if (!kataId) return null;
    return {
      kataId,
      type: "Slice",
      parentId: milestoneId,
    };
  }

  if (kataId?.startsWith("I")) {
    return {
      kataId,
      type: "Issue",
    };
  }

  if (issue.parent) {
    if (!kataId) return null;
    return {
      kataId,
      type: "Task",
      parentId: parentKataId,
    };
  }

  return null;
}

function parseKataIdFromTitle(title: string): string | undefined {
  const match = title.match(/\[([MSIT]\d{3})\]/i);
  return match ? match[1]!.toUpperCase() : undefined;
}

function entityFromIssueNode(
  issue: LinearIssueNode,
  classification: LinearEntityClassification,
  milestoneByLinearId: Map<string, string>,
): TrackedLinearEntity {
  const projectMilestoneId = issue.projectMilestone?.id ?? undefined;
  const parentId =
    classification.parentId ??
    (classification.type === "Slice" && projectMilestoneId ? milestoneByLinearId.get(projectMilestoneId) : undefined);
  const blockedBy = classification.type === "Slice" ? relationDependencies(issue, "blockedBy") : [];
  const blocking = classification.type === "Slice" ? relationDependencies(issue, "blocking") : [];

  return {
    kataId: classification.kataId,
    type: classification.type,
    parentId,
    blockedBy,
    blocking,
    linearId: issue.id,
    identifier: issue.identifier,
    title: stripKataPrefix(issue.title),
    body: issue.description ?? "",
    url: issue.url ?? undefined,
    stateName: issue.state?.name ?? undefined,
    stateType: issue.state?.type ?? undefined,
    projectMilestoneId,
  };
}

function relationDependencies(issue: LinearIssueNode, direction: "blockedBy" | "blocking"): string[] {
  const candidates: string[] = [];
  const relationNodes = [...(issue.relations?.nodes ?? []), ...(issue.inverseRelations?.nodes ?? [])];

  for (const relation of relationNodes) {
    if (!relation) continue;
    const dependency = relationDependencyForDirection(issue, relation, direction);
    if (dependency) candidates.push(dependency);
  }

  return parseSliceDependencyIds(candidates);
}

function relationDependencyForDirection(
  currentIssue: LinearIssueNode,
  relation: LinearIssueRelationNode,
  direction: "blockedBy" | "blocking",
): string | null {
  const type = normalizeRelationType(relation.type);
  const source = relation.issue ?? null;
  const target = relation.relatedIssue ?? null;
  const currentIsSource = source?.id === currentIssue.id;
  const currentIsTarget = target?.id === currentIssue.id;

  if (relationSourceBlocksTarget(type)) {
    if (direction === "blockedBy" && currentIsTarget) return source ? parseKataIdFromTitle(source.title) ?? null : null;
    if (direction === "blocking" && currentIsSource) return target ? parseKataIdFromTitle(target.title) ?? null : null;
  }

  if (relationSourceBlockedByTarget(type)) {
    if (direction === "blockedBy" && currentIsSource) return target ? parseKataIdFromTitle(target.title) ?? null : null;
    if (direction === "blocking" && currentIsTarget) return source ? parseKataIdFromTitle(source.title) ?? null : null;
  }

  return null;
}

function normalizeRelationType(type: string | null | undefined): string {
  return String(type ?? "").toLowerCase().replaceAll(/[^a-z]+/g, "_").replaceAll(/^_+|_+$/g, "");
}

function relationSourceBlocksTarget(type: string): boolean {
  return type === "blocks" || type === "blocking";
}

function relationSourceBlockedByTarget(type: string): boolean {
  return type === "blocked_by" || type === "is_blocked_by";
}

function milestoneFromEntity(entity: TrackedLinearEntity): KataMilestone {
  return {
    id: entity.kataId,
    title: entity.title,
    goal: entity.body || entity.title,
    status: "active",
    active: true,
  };
}

function sliceFromEntity(entity: TrackedLinearEntity, states: LinearStateMapping, order: number): KataSlice {
  return {
    id: entity.kataId,
    milestoneId: entity.parentId ?? "M000",
    title: entity.title,
    goal: entity.body || entity.title,
    status: sliceStatusFromEntity(entity, states),
    order,
    blockedBy: parseSliceDependencyIds(entity.blockedBy ?? []),
    blocking: parseSliceDependencyIds(entity.blocking ?? []),
  };
}

function taskFromEntity(entity: TrackedLinearEntity, states: LinearStateMapping): KataTask {
  return {
    id: entity.kataId,
    sliceId: entity.parentId ?? "S000",
    title: entity.title,
    description: entity.body,
    status: taskStatusFromEntity(entity, states),
    verificationState: taskVerificationStateFromEntity(entity, states),
  };
}

function issueSummaryFromEntity(entity: TrackedLinearEntity, states: LinearStateMapping): KataIssueSummary {
  return {
    id: entity.kataId,
    number: entity.identifier ? linearIssueNumber(entity.identifier) : undefined,
    title: entity.title,
    status: issueStatusFromEntity(entity, states),
    url: entity.url,
  };
}

function issueFromEntity(entity: TrackedLinearEntity, states: LinearStateMapping): KataIssue {
  return {
    ...issueSummaryFromEntity(entity, states),
    body: entity.body,
  };
}

function sliceStatusFromEntity(entity: TrackedLinearEntity, states: LinearStateMapping): KataSlice["status"] {
  const status = statusFromStateName(entity.stateName, states);
  if (status === "todo" || status === "in_progress" || status === "agent_review" || status === "human_review" || status === "merging" || status === "done") {
    return status;
  }
  return "backlog";
}

function taskStatusFromEntity(entity: TrackedLinearEntity, states: LinearStateMapping): KataTask["status"] {
  const status = statusFromStateName(entity.stateName, states);
  if (status === "done" || status === "todo" || status === "backlog") return status;
  if (status === "in_progress" || status === "agent_review" || status === "human_review" || status === "merging") {
    return "in_progress";
  }
  return "backlog";
}

function issueStatusFromEntity(entity: TrackedLinearEntity, states: LinearStateMapping): KataIssueStatus {
  const status = statusFromStateName(entity.stateName, states);
  if (status === "done" || status === "todo" || status === "backlog" || status === "in_progress") return status;
  if (status === "agent_review" || status === "human_review" || status === "merging") return "in_progress";
  return entity.stateType === "completed" ? "done" : "backlog";
}

function statusFromStateName(stateName: string | undefined, states: LinearStateMapping): keyof LinearStateMapping | undefined {
  if (!stateName) return undefined;
  return (Object.entries(states) as Array<[keyof LinearStateMapping, string]>).find(
    ([, configuredStateName]) => configuredStateName === stateName,
  )?.[0];
}

function taskVerificationStateFromEntity(
  entity: TrackedLinearEntity,
  states: LinearStateMapping,
): KataTask["verificationState"] {
  if (entity.stateType === "completed" || taskStatusFromEntity(entity, states) === "done") return "verified";
  return "pending";
}

function matchesLinearSelector<T extends object>(
  node: T,
  selector: string,
  keys: Array<keyof T>,
): boolean {
  return keys.some((key) => (node as Record<string, unknown>)[String(key)] === selector);
}

function emptyLinearConnection<Node>(): LinearConnection<Node> {
  return {
    nodes: [],
    pageInfo: {
      hasNextPage: false,
      endCursor: null,
    },
  };
}
