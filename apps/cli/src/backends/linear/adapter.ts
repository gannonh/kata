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
}

interface LinearContextQueryData {
  viewer?: { id?: string | null } | null;
  organization?: { id?: string | null; urlKey?: string | null } | null;
  teams?: { nodes?: Array<LinearTeamNode | null> | null } | null;
  projects?: { nodes?: Array<LinearProjectNode | null> | null } | null;
  workflowStates?: { nodes?: Array<LinearWorkflowStateNode | null> | null } | null;
}

interface LinearMilestonesQueryData {
  project?: {
    id: string;
    name: string;
    milestones?: LinearConnection<LinearMilestoneNode> | null;
  } | null;
}

interface LinearIssuesQueryData {
  issues: LinearConnection<LinearIssueNode>;
}

export const LINEAR_CONTEXT_QUERY = `
  query LinearKataContext($teamKey: String!, $projectFilter: String!, $first: Int!) {
    viewer {
      id
    }
    organization {
      id
      urlKey
    }
    teams(first: $first, filter: { or: [{ key: { eq: $teamKey } }, { id: { eq: $teamKey } }, { name: { eq: $teamKey } }] }) {
      nodes {
        id
        key
        name
      }
    }
    projects(first: $first, filter: { or: [{ id: { eq: $projectFilter } }, { slugId: { eq: $projectFilter } }, { name: { eq: $projectFilter } }] }) {
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
  }
`;

export const LINEAR_MILESTONES_QUERY = `
  query LinearKataMilestones($projectId: String!, $first: Int!, $after: String) {
    project(id: $projectId) {
      id
      name
      milestones(first: $first, after: $after) {
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
  query LinearKataIssues($teamId: String!, $projectId: String!, $first: Int!, $after: String) {
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

  async upsertProject(_input: KataProjectUpsertInput): Promise<KataProjectContext> {
    throw laterTaskError("Linear project upsert");
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

  async createMilestone(_input: KataMilestoneCreateInput): Promise<KataMilestone> {
    throw laterTaskError("Linear milestone creation");
  }

  async completeMilestone(_input: KataMilestoneCompleteInput): Promise<KataMilestone> {
    throw laterTaskError("Linear milestone completion");
  }

  async listSlices(input: { milestoneId: string }): Promise<KataSlice[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Slice" && entity.parentId === input.milestoneId)
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map((entity, index) => sliceFromEntity(entity, this.config.states, index));
  }

  async createSlice(_input: KataSliceCreateInput): Promise<KataSlice> {
    throw laterTaskError("Linear slice creation");
  }

  async updateSliceStatus(_input: KataSliceUpdateStatusInput): Promise<KataSlice> {
    throw laterTaskError("Linear slice status updates");
  }

  async listTasks(input: { sliceId: string }): Promise<KataTask[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Task" && entity.parentId === input.sliceId)
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map((entity) => taskFromEntity(entity, this.config.states));
  }

  async createTask(_input: KataTaskCreateInput): Promise<KataTask> {
    throw laterTaskError("Linear task creation");
  }

  async updateTaskStatus(_input: KataTaskUpdateStatusInput): Promise<KataTask> {
    throw laterTaskError("Linear task status updates");
  }

  async createIssue(_input: KataIssueCreateInput): Promise<KataIssue> {
    throw laterTaskError("Linear standalone issue creation");
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

  async updateIssueStatus(_input: KataIssueUpdateStatusInput): Promise<KataIssue> {
    throw laterTaskError("Linear standalone issue status updates");
  }

  async listArtifacts(_input: { scopeType: KataScopeType; scopeId: string }): Promise<KataArtifact[]> {
    return [];
  }

  async readArtifact(input: {
    scopeType: KataScopeType;
    scopeId: string;
    artifactType: KataArtifactType;
  }): Promise<KataArtifact | null> {
    const artifacts = await this.listArtifacts(input);
    return artifacts.find((artifact) => artifact.artifactType === input.artifactType) ?? null;
  }

  async writeArtifact(_input: KataArtifactWriteInput): Promise<KataArtifact> {
    throw laterTaskError("Linear artifact writes");
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
        projectFilter: this.config.project,
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

    return {
      team,
      project,
      stateByKataStatus,
      kataStatusByStateName,
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
      selectConnection: (data) => data.project?.milestones ?? emptyLinearConnection<LinearMilestoneNode>(),
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

  private addDiscoveredEntity(entity: TrackedLinearEntity): void {
    const duplicate = this.entities.get(entity.kataId);
    if (duplicate) {
      throw new KataDomainError(
        "INVALID_CONFIG",
        `Linear discovery found duplicate Kata id ${entity.kataId}: ${duplicate.identifier ?? duplicate.linearId} and ${entity.identifier ?? entity.linearId}.`,
      );
    }
    this.entities.set(entity.kataId, entity);
    this.linearIdToKataId.set(entity.linearId, entity.kataId);
  }
}

function laterTaskError(operation: string): KataDomainError {
  return new KataDomainError("NOT_SUPPORTED", `${operation} will be implemented in a later Linear mutation/artifact task.`);
}

function bodyContent(body: string): string {
  return body;
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

  if (kataId?.startsWith("T") || issue.parent) {
    if (!kataId) return null;
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
    if (!kataId) return null;
    return {
      kataId,
      type: "Issue",
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
    goal: bodyContent(entity.body) || entity.title,
    status: "active",
    active: true,
  };
}

function sliceFromEntity(entity: TrackedLinearEntity, states: LinearStateMapping, order: number): KataSlice {
  return {
    id: entity.kataId,
    milestoneId: entity.parentId ?? "M000",
    title: entity.title,
    goal: bodyContent(entity.body) || entity.title,
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
    description: bodyContent(entity.body),
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
    body: bodyContent(entity.body),
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
