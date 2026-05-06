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
import type { createGithubClient } from "./client.js";
import { parseArtifactComment, upsertArtifactComment } from "./artifacts.js";
import { KATA_PROJECT_FIELDS, loadProjectFieldIndex, type ProjectFieldIndex } from "./project-fields.js";

type GithubClient = ReturnType<typeof createGithubClient>;
type KataEntityType = "Project" | "Milestone" | "Slice" | "Task" | "Issue";
type ProjectStatusName = "Backlog" | "Todo" | "In Progress" | "Agent Review" | "Human Review" | "Merging" | "Done";
type KataSliceStatus = KataSlice["status"];
type KataTaskStatus = KataTask["status"];
type KataTaskVerificationState = KataTask["verificationState"];

interface GithubProjectsV2AdapterInput {
  owner: string;
  repo: string;
  projectNumber: number;
  workspacePath: string;
  client: GithubClient;
}

interface GithubIssue {
  id?: number | string;
  node_id?: string;
  number: number;
  title: string;
  body?: string | null;
  state?: string;
  html_url?: string;
  milestone?: { number?: number | string } | null;
  pull_request?: unknown;
}

interface GithubIssueComment {
  id: number | string;
  body?: string | null;
}

interface TrackedEntity {
  kataId: string;
  type: KataEntityType;
  parentId?: string;
  status?: KataSliceStatus | KataTaskStatus;
  verificationState?: KataTaskVerificationState;
  blockedBy?: string[];
  blocking?: string[];
  artifactScope?: string;
  issueId: number;
  issueNumber: number;
  contentId: string;
  title: string;
  body: string;
  state: string;
  url?: string;
  githubMilestoneNumber?: number;
}

interface ProjectItemFields {
  itemId: string;
  kataId?: string;
  kataType?: KataEntityType;
  parentId?: string;
  artifactScope?: string;
  verificationState?: KataTaskVerificationState;
  contentId?: string;
  issueId?: number;
  issueNumber?: number;
  title?: string;
  body?: string;
  state?: string;
  url?: string;
  githubMilestoneNumber?: number;
  status?: string;
}

interface ProjectItemTextFieldValue {
  text?: string | null;
}

interface ProjectItemSingleSelectFieldValue {
  name?: string | null;
}

interface ProjectItemFieldNode {
  id?: string | null;
  content?: {
    id?: string | null;
    databaseId?: number | null;
    number?: number | null;
    title?: string | null;
    body?: string | null;
    state?: unknown;
    url?: string | null;
    milestone?: {
      number?: number | null;
    } | null;
  } | null;
  kataId?: ProjectItemTextFieldValue | null;
  kataType?: ProjectItemTextFieldValue | null;
  parentId?: ProjectItemTextFieldValue | null;
  artifactScope?: ProjectItemTextFieldValue | null;
  verificationState?: ProjectItemTextFieldValue | null;
  status?: ProjectItemSingleSelectFieldValue | null;
}

interface ProjectItemFieldsConnection {
  pageInfo: {
    hasNextPage: boolean;
    endCursor?: string | null;
  };
  nodes: Array<ProjectItemFieldNode | null>;
}

interface ProjectItemFieldsProject {
  items: ProjectItemFieldsConnection;
}

interface ProjectItemFieldsQueryData {
  organization?: {
    projectV2?: ProjectItemFieldsProject | null;
  } | null;
  user?: {
    projectV2?: ProjectItemFieldsProject | null;
  } | null;
}

interface IssueDependencyNode {
  id?: string | null;
  number?: number | null;
}

interface IssueDependencyConnection {
  nodes?: Array<IssueDependencyNode | null> | null;
}

interface IssueDependencyIssueNode {
  id?: string | null;
  number?: number | null;
  blockedBy?: IssueDependencyConnection | null;
  blocking?: IssueDependencyConnection | null;
}

interface IssueDependenciesQueryData {
  nodes?: Array<IssueDependencyIssueNode | null> | null;
}

const ISSUES_PER_PAGE = 100;
const MAX_ISSUE_PAGES = 100;
const PROJECT_ITEMS_PER_PAGE = 100;
const MAX_PROJECT_ITEM_PAGES = 100;
const COMMENTS_PER_PAGE = 100;
const MAX_COMMENT_PAGES = 100;
const SUB_ISSUES_PER_PAGE = 100;
const MAX_SUB_ISSUE_PAGES = 100;

const ADD_PROJECT_ITEM_MUTATION = `
  mutation AddKataProjectV2Item($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
      item {
        id
      }
    }
  }
`;

const UPDATE_PROJECT_FIELD_MUTATION = `
  mutation UpdateKataProjectV2ItemField($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
    updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value }) {
      projectV2Item {
        id
      }
    }
  }
`;

const ADD_BLOCKED_BY_MUTATION = `
  mutation AddKataIssueBlockedBy($issueId: ID!, $blockingIssueId: ID!) {
    addBlockedBy(input: { issueId: $issueId, blockingIssueId: $blockingIssueId }) {
      issue {
        id
      }
    }
  }
`;

const ISSUE_DEPENDENCIES_QUERY = `
  query LoadKataIssueDependencies($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Issue {
        id
        number
        blockedBy(first: 100) {
          nodes {
            id
            number
          }
        }
        blocking(first: 100) {
          nodes {
            id
            number
          }
        }
      }
    }
  }
`;

const PROJECT_ITEM_FIELDS_QUERY = `
  query LoadKataProjectItemFields($owner: String!, $repo: String!, $projectNumber: Int!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      id
    }
    organization(login: $owner) {
      projectV2(number: $projectNumber) {
        items(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            content {
              ... on Issue {
                id
                databaseId
                number
                title
                body
                state
                url
                milestone {
                  number
                }
              }
            }
            kataId: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.id)}) {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            }
            kataType: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.type)}) {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            }
            parentId: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.parentId)}) {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            }
            artifactScope: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.artifactScope)}) {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            }
            verificationState: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.verificationState)}) {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            }
            status: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.status)}) {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
              }
            }
          }
        }
      }
    }
    user(login: $owner) {
      projectV2(number: $projectNumber) {
        items(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            content {
              ... on Issue {
                id
                databaseId
                number
                title
                body
                state
                url
                milestone {
                  number
                }
              }
            }
            kataId: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.id)}) {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            }
            kataType: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.type)}) {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            }
            parentId: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.parentId)}) {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            }
            artifactScope: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.artifactScope)}) {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            }
            verificationState: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.verificationState)}) {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            }
            status: fieldValueByName(name: ${JSON.stringify(KATA_PROJECT_FIELDS.status)}) {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
              }
            }
          }
        }
      }
    }
  }
`;

export class GithubProjectsV2Adapter implements KataBackendAdapter {
  private readonly owner: string;
  private readonly repo: string;
  private readonly projectNumber: number;
  private readonly workspacePath: string;
  private readonly client: GithubClient;
  private readonly entities = new Map<string, TrackedEntity>();
  private fieldIndexPromise: Promise<ProjectFieldIndex> | null = null;
  private discovered = false;

  constructor(input: GithubProjectsV2AdapterInput) {
    this.owner = input.owner;
    this.repo = input.repo;
    this.projectNumber = input.projectNumber;
    this.workspacePath = input.workspacePath;
    this.client = input.client;
  }

  async getProjectContext() {
    return {
      backend: "github" as const,
      workspacePath: this.workspacePath,
      repository: {
        owner: this.owner,
        name: this.repo,
      },
    };
  }

  async upsertProject(input: KataProjectUpsertInput): Promise<KataProjectContext> {
    await this.discoverEntities();
    await this.getFieldIndex();
    const existing = this.entities.get("PROJECT");
    const body = input.description;
    const title = `[PROJECT] ${input.title}`;

    const entity = existing
      ? await this.updateIssueEntity(existing, { title, body })
      : await this.createIssueEntity({
        kataId: "PROJECT",
        type: "Project",
        title,
        body,
      });

    await this.syncProjectFields(entity, {
      type: "Project",
      status: "Backlog",
      artifactScope: "PROJECT",
      verificationState: "",
    });

    return {
      backend: "github",
      workspacePath: this.workspacePath,
      title: input.title,
      description: input.description,
      repository: {
        owner: this.owner,
        name: this.repo,
      },
    };
  }

  async listMilestones(): Promise<KataMilestone[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Milestone")
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map((entity) => milestoneFromEntity(entity));
  }

  async getActiveMilestone() {
    const milestones = await this.listMilestones();
    return milestones.find((milestone) => milestone.active) ?? null;
  }

  async createMilestone(input: KataMilestoneCreateInput): Promise<KataMilestone> {
    await this.discoverEntities();
    const kataId = this.nextKataId("Milestone");
    const title = `[${kataId}] ${input.title}`;
    const githubMilestone = await this.client.rest<{ number: number }>({
      method: "POST",
      path: `/repos/${this.owner}/${this.repo}/milestones`,
      body: {
        title,
        description: input.goal,
      },
    });
    const entity = await this.createIssueEntity({
      kataId,
      type: "Milestone",
      title,
      body: input.goal,
      issueBody: {
        milestone: githubMilestone.number,
      },
    });

    await this.syncProjectFields(entity, {
      type: "Milestone",
      status: "Backlog",
      artifactScope: kataId,
      verificationState: "",
    });

    return {
      id: kataId,
      title: input.title,
      goal: input.goal,
      status: "active",
      active: true,
    };
  }

  async completeMilestone(input: KataMilestoneCompleteInput): Promise<KataMilestone> {
    const entity = await this.requireEntity(input.milestoneId, "Milestone");
    const updated = await this.updateIssueEntity(entity, {
      state: "closed",
      body: appendBodySection(entity.body, "Completion summary", input.summary),
    });
    await this.updateEntityStatus(updated, "Done");
    return milestoneFromEntity(updated);
  }

  async listSlices(input: { milestoneId: string }): Promise<KataSlice[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Slice" && entity.parentId === input.milestoneId)
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map((entity, index) => sliceFromEntity(entity, index));
  }

  async createSlice(input: KataSliceCreateInput): Promise<KataSlice> {
    await this.discoverEntities();
    const milestoneEntity = await this.requireEntity(input.milestoneId, "Milestone");
    const kataId = this.nextKataId("Slice");
    const blockedBy = parseSliceDependencyIds(input.blockedBy ?? []);
    const entity = await this.createIssueEntity({
      kataId,
      type: "Slice",
      parentId: input.milestoneId,
      title: `[${kataId}] ${input.title}`,
      body: input.goal,
      issueBody: {
        milestone: requireNativeGithubMilestoneNumber(milestoneEntity),
      },
    });

    await this.syncProjectFields(entity, {
      type: "Slice",
      parentId: input.milestoneId,
      status: "Backlog",
      artifactScope: kataId,
      verificationState: "",
    });
    await this.createNativeIssueDependencies(entity, blockedBy);
    this.entities.set(kataId, {
      ...entity,
      blockedBy,
      blocking: [],
    });

    return {
      id: kataId,
      milestoneId: input.milestoneId,
      title: input.title,
      goal: input.goal,
      status: "backlog",
      order: input.order ?? 0,
      blockedBy,
      blocking: [],
    };
  }

  async updateSliceStatus(input: KataSliceUpdateStatusInput): Promise<KataSlice> {
    const entity = await this.requireEntity(input.sliceId, "Slice");
    const updated = await this.updateEntityStatus(entity, statusOptionForSlice(input.status));
    return {
      ...sliceFromEntity(updated, 0),
      status: input.status,
    };
  }

  async listTasks(input: { sliceId: string }): Promise<KataTask[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Task" && entity.parentId === input.sliceId)
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map(taskFromEntity);
  }

  async createTask(input: KataTaskCreateInput): Promise<KataTask> {
    await this.discoverEntities();
    const sliceEntity = await this.requireEntity(input.sliceId, "Slice");
    const milestoneEntity = sliceEntity.parentId
      ? await this.requireEntity(sliceEntity.parentId, "Milestone")
      : null;
    const kataId = this.nextKataId("Task");
    const entity = await this.createIssueEntity({
      kataId,
      type: "Task",
      parentId: input.sliceId,
      title: `[${kataId}] ${input.title}`,
      body: input.description,
      issueBody: {
        milestone: requireNativeGithubMilestoneNumber(milestoneEntity ?? sliceEntity),
      },
    });
    const uniqueEntity = await this.ensureCreatedEntityHasUniqueId(entity, {
      title: input.title,
      body: input.description,
    });

    await this.attachSubIssue(sliceEntity, uniqueEntity);

    await this.syncProjectFields(uniqueEntity, {
      type: "Task",
      parentId: input.sliceId,
      status: "Backlog",
      artifactScope: uniqueEntity.kataId,
      verificationState: "pending",
    });

    return {
      id: uniqueEntity.kataId,
      sliceId: input.sliceId,
      title: input.title,
      description: input.description,
      status: "backlog",
      verificationState: "pending",
    };
  }

  async updateTaskStatus(input: KataTaskUpdateStatusInput): Promise<KataTask> {
    const entity = await this.requireEntity(input.taskId, "Task");
    const verificationState = input.verificationState ?? taskVerificationStateFromEntity(entity);
    const updated = await this.updateEntityStatus(entity, statusOptionForTask(input.status), {
      verificationState,
    });
    return {
      ...taskFromEntity(updated),
      status: input.status,
      verificationState,
    };
  }

  async createIssue(input: KataIssueCreateInput): Promise<KataIssue> {
    await this.discoverEntities();
    const kataId = this.nextKataId("Issue");
    const body = formatPlannedIssueBody(input.design, input.plan);
    const entity = await this.createIssueEntity({
      kataId,
      type: "Issue",
      title: `[${kataId}] ${input.title}`,
      body,
    });

    await this.syncProjectFields(entity, {
      type: "Issue",
      status: "Backlog",
      artifactScope: kataId,
      verificationState: "pending",
    });

    return issueFromEntity(entity);
  }

  async listOpenIssues(): Promise<KataIssueSummary[]> {
    await this.discoverEntities();
    return [...this.entities.values()]
      .filter((entity) => entity.type === "Issue" && entity.state !== "closed" && issueStatusFromEntity(entity) !== "done")
      .sort((left, right) => left.kataId.localeCompare(right.kataId))
      .map(issueSummaryFromEntity);
  }

  async getIssue(input: KataIssueGetInput): Promise<KataIssue> {
    const entity = await this.findIssueEntity(input.issueRef);
    return issueFromEntity(entity);
  }

  async updateIssueStatus(input: KataIssueUpdateStatusInput): Promise<KataIssue> {
    const entity = await this.requireEntity(input.issueId, "Issue");
    const updated = await this.updateEntityStatus(entity, statusOptionForIssue(input.status));
    return {
      ...issueFromEntity(updated),
      status: input.status,
    };
  }

  async listArtifacts(input: { scopeType: KataScopeType; scopeId: string }): Promise<KataArtifact[]> {
    const entity = await this.findArtifactEntity(input.scopeType, input.scopeId);
    if (!entity) return [];
    const normalizedScopeId = normalizeArtifactScopeId(input.scopeType, input.scopeId);
    const comments = await this.listArtifactComments(entity.issueNumber);
    return comments
      .map((comment) => {
        const parsed = typeof comment.body === "string" ? parseArtifactComment(comment.body) : null;
        if (!parsed || parsed.scopeType !== input.scopeType || parsed.scopeId !== normalizedScopeId) return null;
        return artifactFromParsedComment({
          comment,
          parsed,
          backend: "github",
        });
      })
      .filter((artifact): artifact is KataArtifact => artifact !== null);
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
    const entity = await this.findArtifactEntity(input.scopeType, input.scopeId);
    if (!entity) {
      const message = input.scopeType === "project"
        ? "GitHub PROJECT tracking issue was not found; run project.upsert before writing project artifacts."
        : `GitHub tracking issue was not found for ${input.scopeType} ${input.scopeId}.`;
      throw new KataDomainError("NOT_FOUND", message);
    }

    const result = await upsertArtifactComment({
      client: this.client,
      owner: this.owner,
      repo: this.repo,
      issueNumber: entity.issueNumber,
      scopeType: input.scopeType,
      scopeId: normalizeArtifactScopeId(input.scopeType, input.scopeId),
      artifactType: input.artifactType,
      content: input.content,
    });

    return {
      id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
      scopeType: input.scopeType,
      scopeId: normalizeArtifactScopeId(input.scopeType, input.scopeId),
      artifactType: input.artifactType,
      title: input.title,
      content: parseArtifactComment(result.body)?.content ?? input.content,
      format: input.format,
      updatedAt: new Date().toISOString(),
      provenance: {
        backend: "github",
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
    return {
      ok: true,
      backend: "github",
      checks: [
        {
          name: "adapter",
          status: "ok",
          message: "GitHub Projects v2 adapter is configured.",
        },
      ],
    };
  }

  private async discoverEntities(): Promise<void> {
    if (this.discovered) return;

    const projectItemFields = await this.loadProjectItemFields();
    const entities = projectItemFields.map(entityFromProjectItem).filter(isTrackedEntity);
    const entitiesWithNativeParents = await this.loadNativeTaskParents(entities);
    const entitiesWithNativeDependencies = await this.loadNativeIssueDependencies(entitiesWithNativeParents);
    for (const entity of entitiesWithNativeDependencies) {
      if (this.entities.has(entity.kataId)) continue;
      this.entities.set(entity.kataId, entity);
    }
    this.discovered = true;
  }

  private async listTrackedEntitiesFromGithub(): Promise<TrackedEntity[]> {
    const entities: TrackedEntity[] = [];

    for (let page = 1; page <= MAX_ISSUE_PAGES; page += 1) {
      const issues = await this.client.rest<GithubIssue[]>({
        method: "GET",
        path: `/repos/${this.owner}/${this.repo}/issues?state=all&per_page=${ISSUES_PER_PAGE}&page=${page}`,
      });

      for (const issue of issues) {
        if (issue.pull_request) continue;
        const kataId = kataIdFromTitle(issue.title);
        const type = kataId ? kataEntityTypeFromKataId(kataId) : null;
        if (!kataId || !type || !issue.node_id) continue;
        entities.push(entityFromIssue(issue, { kataId, type }));
      }

      if (issues.length < ISSUES_PER_PAGE) {
        return entities;
      }
    }

    throw new KataDomainError("UNKNOWN", `Unable to discover Kata issues after ${MAX_ISSUE_PAGES} full pages.`);
  }

  private async loadProjectItemFields(): Promise<ProjectItemFields[]> {
    const fields: ProjectItemFields[] = [];
    let after: string | null = null;

    for (let page = 1; page <= MAX_PROJECT_ITEM_PAGES; page += 1) {
      const data: ProjectItemFieldsQueryData = await this.client.graphql<ProjectItemFieldsQueryData>({
        query: PROJECT_ITEM_FIELDS_QUERY,
        variables: {
          owner: this.owner,
          repo: this.repo,
          projectNumber: this.projectNumber,
          first: PROJECT_ITEMS_PER_PAGE,
          after,
        },
      });
      const project: ProjectItemFieldsProject | null | undefined =
        data.organization?.projectV2 ?? data.user?.projectV2;
      const connection: ProjectItemFieldsConnection | undefined = project?.items;
      if (!connection) return fields;

      fields.push(...connection.nodes.map(projectItemFieldsFromNode).filter(isProjectItemFields));

      if (!connection.pageInfo.hasNextPage) return fields;
      after = connection.pageInfo.endCursor ?? null;
    }

    throw new KataDomainError("UNKNOWN", `Unable to list Project v2 items after ${MAX_PROJECT_ITEM_PAGES} full pages.`);
  }

  private async loadNativeTaskParents(entities: TrackedEntity[]): Promise<TrackedEntity[]> {
    const slices = entities.filter((entity) => entity.type === "Slice");
    const taskIdByIssueNumber = new Map<number, string>(
      entities
        .filter((entity) => entity.type === "Task")
        .map((entity) => [entity.issueNumber, entity.kataId] as const),
    );
    if (slices.length === 0 || taskIdByIssueNumber.size === 0) return entities;

    const parentByTaskId = new Map<string, string>();
    for (const slice of slices) {
      for (let page = 1; page <= MAX_SUB_ISSUE_PAGES; page += 1) {
        const childIssues = await this.client.rest<GithubIssue[]>({
          method: "GET",
          path: `/repos/${this.owner}/${this.repo}/issues/${slice.issueNumber}/sub_issues?per_page=${SUB_ISSUES_PER_PAGE}&page=${page}`,
        });
        for (const childIssue of childIssues) {
          const taskId = taskIdByIssueNumber.get(childIssue.number);
          if (taskId) parentByTaskId.set(taskId, slice.kataId);
        }
        if (childIssues.length < SUB_ISSUES_PER_PAGE) break;
        if (page === MAX_SUB_ISSUE_PAGES) {
          throw new KataDomainError(
            "UNKNOWN",
            `Unable to list sub-issues for ${slice.kataId} after ${MAX_SUB_ISSUE_PAGES} full pages.`,
          );
        }
      }
    }
    if (parentByTaskId.size === 0) return entities;

    return entities.map((entity) => {
      if (entity.type !== "Task") return entity;
      const parentId = parentByTaskId.get(entity.kataId);
      return parentId ? { ...entity, parentId } : entity;
    });
  }

  private async createNativeIssueDependencies(blockedEntity: TrackedEntity, blockedByIds: readonly string[]): Promise<void> {
    const createdBlockedByIds: string[] = [];
    for (const blockedById of blockedByIds) {
      if (blockedById === blockedEntity.kataId) continue;
      const blocker = await this.requireEntity(blockedById, "Slice");
      await this.client.graphql({
        query: ADD_BLOCKED_BY_MUTATION,
        variables: {
          issueId: blockedEntity.contentId,
          blockingIssueId: blocker.contentId,
        },
      });
      createdBlockedByIds.push(blocker.kataId);
      this.entities.set(blocker.kataId, {
        ...blocker,
        blocking: parseSliceDependencyIds([...(blocker.blocking ?? []), blockedEntity.kataId]),
      });
    }
    if (createdBlockedByIds.length > 0) {
      this.entities.set(blockedEntity.kataId, {
        ...blockedEntity,
        blockedBy: parseSliceDependencyIds([...(blockedEntity.blockedBy ?? []), ...createdBlockedByIds]),
      });
    }
  }

  private async loadNativeIssueDependencies(entities: TrackedEntity[]): Promise<TrackedEntity[]> {
    const slices = entities.filter((entity) => entity.type === "Slice");
    if (slices.length === 0) return entities;

    const sliceIdByContentId = new Map(slices.map((entity) => [entity.contentId, entity.kataId]));
    const data = await this.client.graphql<IssueDependenciesQueryData>({
      query: ISSUE_DEPENDENCIES_QUERY,
      variables: { ids: slices.map((entity) => entity.contentId) },
    });
    const dependencyByContentId = new Map<string, { blockedBy: string[]; blocking: string[] }>();

    for (const node of data.nodes ?? []) {
      if (!node?.id) continue;
      dependencyByContentId.set(node.id, {
        blockedBy: dependencyIdsFromNodes(node.blockedBy?.nodes ?? [], sliceIdByContentId),
        blocking: dependencyIdsFromNodes(node.blocking?.nodes ?? [], sliceIdByContentId),
      });
    }

    return entities.map((entity) => {
      if (entity.type !== "Slice") return entity;
      const dependencies = dependencyByContentId.get(entity.contentId);
      if (!dependencies) return entity;
      return {
        ...entity,
        blockedBy: dependencies.blockedBy,
        blocking: dependencies.blocking,
      };
    });
  }

  private nextKataId(type: "Milestone" | "Slice" | "Task" | "Issue"): string {
    return this.nextAvailableKataId(type, new Set(this.entities.keys()));
  }

  private nextAvailableKataId(type: "Milestone" | "Slice" | "Task" | "Issue", usedIds: Set<string>): string {
    const prefix = type === "Milestone" ? "M" : type === "Slice" ? "S" : type === "Task" ? "T" : "I";
    const maxExisting = [...usedIds].reduce((max, kataId) => {
      const match = kataId.match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

    return `${prefix}${String(maxExisting + 1).padStart(3, "0")}`;
  }

  private async ensureCreatedEntityHasUniqueId(
    entity: TrackedEntity,
    input: { title: string; body: string },
  ): Promise<TrackedEntity> {
    const trackedEntities = await this.listTrackedEntitiesFromGithub();
    const duplicates = trackedEntities
      .filter((candidate) => candidate.type === entity.type && candidate.kataId === entity.kataId)
      .sort((left, right) => left.issueNumber - right.issueNumber);
    const canonical = duplicates[0];
    if (!canonical || canonical.issueNumber === entity.issueNumber) {
      this.entities.set(entity.kataId, entity);
      return entity;
    }

    this.entities.set(entity.kataId, {
      ...canonical,
      parentId: canonical.parentId ?? entity.parentId,
    });
    const uniqueKataId = this.nextAvailableKataId(
      "Task",
      new Set(trackedEntities.map((candidate) => candidate.kataId)),
    );
    const retaggedEntity = {
      ...entity,
      kataId: uniqueKataId,
    };
    const updated = await this.updateIssueEntity(retaggedEntity, {
      title: `[${uniqueKataId}] ${input.title}`,
      body: input.body,
    });
    this.entities.set(uniqueKataId, updated);
    return updated;
  }

  private async requireEntity(kataId: string, type: KataEntityType): Promise<TrackedEntity> {
    await this.discoverEntities();
    const entity = this.entities.get(kataId);
    if (!entity || entity.type !== type) {
      throw new KataDomainError("NOT_FOUND", `GitHub ${type} tracking issue was not found for ${kataId}.`);
    }
    return entity;
  }

  private async findIssueEntity(issueRef: string): Promise<TrackedEntity> {
    await this.discoverEntities();
    const normalizedRef = issueRef.trim();
    if (!normalizedRef) {
      throw new KataDomainError("INVALID_CONFIG", "Standalone issue reference is required.");
    }
    const normalizedId = normalizedRef.toUpperCase();
    const issueNumberMatch = normalizedRef.match(/^#?(\d+)$/);
    const issueNumber = issueNumberMatch ? Number(issueNumberMatch[1]) : null;
    const issueEntities = [...this.entities.values()].filter((entity) => entity.type === "Issue");

    const exactId = issueEntities.find((entity) => entity.kataId.toUpperCase() === normalizedId);
    if (exactId) return exactId;

    if (issueNumber !== null) {
      const exactNumber = issueEntities.find((entity) => entity.issueNumber === issueNumber);
      if (exactNumber) return exactNumber;
    }

    const titleMatches = issueEntities.filter((entity) => entity.title.toLowerCase().includes(normalizedRef.toLowerCase()));
    if (titleMatches.length === 1) return titleMatches[0];
    if (titleMatches.length > 1) {
      throw new KataDomainError(
        "UNKNOWN",
        `Issue reference "${issueRef}" matched multiple standalone issues: ${titleMatches.map((entity) => `${entity.kataId} #${entity.issueNumber} ${entity.title}`).join("; ")}.`,
      );
    }

    throw new KataDomainError("NOT_FOUND", `Standalone issue was not found for reference "${issueRef}".`);
  }

  private async findArtifactEntity(scopeType: KataScopeType, scopeId: string): Promise<TrackedEntity | null> {
    await this.discoverEntities();
    const kataId = normalizeArtifactScopeId(scopeType, scopeId);
    const scopedEntity = [...this.entities.values()].find((entity) => entity.artifactScope === kataId);
    return scopedEntity ?? this.entities.get(kataId) ?? null;
  }

  private async createIssueEntity(input: {
    kataId: string;
    type: KataEntityType;
    parentId?: string;
    title: string;
    body: string;
    issueBody?: Record<string, unknown>;
  }): Promise<TrackedEntity> {
    const issue = await this.client.rest<GithubIssue>({
      method: "POST",
      path: `/repos/${this.owner}/${this.repo}/issues`,
      body: {
        title: input.title,
        body: input.body,
        ...input.issueBody,
      },
    });

    if (!issue.node_id) {
      throw new KataDomainError("UNKNOWN", "GitHub issue response did not include a node_id for Project v2.");
    }

    const entity = entityFromIssue(issue, {
      kataId: input.kataId,
      type: input.type,
      parentId: input.parentId,
    });
    this.entities.set(input.kataId, entity);
    return entity;
  }

  private async attachSubIssue(parent: TrackedEntity, child: TrackedEntity): Promise<void> {
    await this.client.rest({
      method: "POST",
      path: `/repos/${this.owner}/${this.repo}/issues/${parent.issueNumber}/sub_issues`,
      body: {
        sub_issue_id: child.issueId,
      },
    });
  }

  private async updateIssueEntity(
    entity: TrackedEntity,
    input: { title?: string; body?: string; state?: "open" | "closed" },
  ): Promise<TrackedEntity> {
    const updatedIssue = await this.client.rest<GithubIssue>({
      method: "PATCH",
      path: `/repos/${this.owner}/${this.repo}/issues/${entity.issueNumber}`,
      body: input,
    });
    const updatedBody = updatedIssue.body ?? input.body ?? entity.body;
    const updated = {
      ...entity,
      title: updatedIssue.title
        ? stripKataPrefix(updatedIssue.title)
        : input.title
          ? stripKataPrefix(input.title)
          : entity.title,
      body: updatedBody,
      state: updatedIssue.state ?? input.state ?? entity.state,
    };
    this.entities.set(entity.kataId, updated);
    return updated;
  }

  private async syncProjectFields(
    entity: TrackedEntity,
    input: {
      type: KataEntityType;
      parentId?: string;
      status: ProjectStatusName;
      artifactScope: string;
      verificationState?: string;
    },
  ): Promise<string> {
    const fieldIndex = await this.getFieldIndex();
    const projectItemId = await this.addProjectItem(fieldIndex.projectId, entity.contentId);
    await this.updateProjectField(fieldIndex, projectItemId, KATA_PROJECT_FIELDS.type, input.type);
    await this.updateProjectField(fieldIndex, projectItemId, KATA_PROJECT_FIELDS.id, entity.kataId);
    if (input.parentId) {
      await this.updateProjectField(fieldIndex, projectItemId, KATA_PROJECT_FIELDS.parentId, input.parentId);
    }
    await this.updateProjectField(fieldIndex, projectItemId, KATA_PROJECT_FIELDS.artifactScope, input.artifactScope);
    await this.updateProjectField(fieldIndex, projectItemId, KATA_PROJECT_FIELDS.verificationState, input.verificationState ?? "");
    await this.updateProjectStatus(fieldIndex, projectItemId, input.status);
    return projectItemId;
  }

  private async updateEntityStatus(
    entity: TrackedEntity,
    status: ProjectStatusName,
    metadata: { verificationState?: KataTaskVerificationState } = {},
  ): Promise<TrackedEntity> {
    const fieldIndex = await this.getFieldIndex();
    const projectItemId = await this.addProjectItem(fieldIndex.projectId, entity.contentId);
    await this.updateProjectStatus(fieldIndex, projectItemId, status);
    if (metadata.verificationState) {
      await this.updateProjectField(
        fieldIndex,
        projectItemId,
        KATA_PROJECT_FIELDS.verificationState,
        metadata.verificationState,
      );
    }
    const issueState = status === "Done" ? "closed" : "open";
    const updated = await this.updateIssueEntity(entity, {
      state: issueState,
    });
    const updatedEntity = {
      ...updated,
      status: projectStatusNameForEntity(entity.type, status) ?? updated.status,
      verificationState: metadata.verificationState ?? updated.verificationState,
    };
    this.entities.set(entity.kataId, updatedEntity);
    return updatedEntity;
  }

  private async getFieldIndex(): Promise<ProjectFieldIndex> {
    if (!this.fieldIndexPromise) {
      this.fieldIndexPromise = loadProjectFieldIndex({
        client: this.client,
        owner: this.owner,
        repo: this.repo,
        projectNumber: this.projectNumber,
      });
    }
    return this.fieldIndexPromise;
  }

  private async addProjectItem(projectId: string, contentId: string): Promise<string> {
    const data = await this.client.graphql<{ addProjectV2ItemById: { item: { id: string } } }>({
      query: ADD_PROJECT_ITEM_MUTATION,
      variables: {
        projectId,
        contentId,
      },
    });

    return data.addProjectV2ItemById.item.id;
  }

  private async updateProjectField(
    fieldIndex: ProjectFieldIndex,
    itemId: string,
    fieldName: string,
    text: string,
  ): Promise<void> {
    const field = fieldIndex.fields[fieldName];
    if (!field) return;
    await this.client.graphql({
      query: UPDATE_PROJECT_FIELD_MUTATION,
      variables: {
        projectId: fieldIndex.projectId,
        itemId,
        fieldId: field.id,
        value: field.options?.[text] ? { singleSelectOptionId: field.options[text] } : { text },
      },
    });
  }

  private async updateProjectStatus(
    fieldIndex: ProjectFieldIndex,
    itemId: string,
    status: ProjectStatusName,
  ): Promise<void> {
    const statusField = fieldIndex.fields[KATA_PROJECT_FIELDS.status];
    const optionId = statusField?.options?.[status];
    if (!statusField || !optionId) {
      throw new KataDomainError(
        "INVALID_CONFIG",
        `GitHub Project v2 field "${KATA_PROJECT_FIELDS.status}" is missing option "${status}".`,
      );
    }
    await this.client.graphql({
      query: UPDATE_PROJECT_FIELD_MUTATION,
      variables: {
        projectId: fieldIndex.projectId,
        itemId,
        fieldId: statusField.id,
        value: { singleSelectOptionId: optionId },
      },
    });
  }

  private async listArtifactComments(issueNumber: number): Promise<GithubIssueComment[]> {
    const comments: GithubIssueComment[] = [];

    for (let page = 1; page <= MAX_COMMENT_PAGES; page += 1) {
      const pageComments = await this.client.rest<GithubIssueComment[]>({
        method: "GET",
        path: `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments?per_page=${COMMENTS_PER_PAGE}&page=${page}`,
      });

      comments.push(...pageComments);
      if (pageComments.length < COMMENTS_PER_PAGE) return comments;
    }

    throw new KataDomainError("UNKNOWN", `Unable to list artifact comments after ${MAX_COMMENT_PAGES} full pages.`);
  }
}

function entityFromIssue(
  issue: GithubIssue,
  metadata: {
    kataId: string;
    type: KataEntityType;
    parentId?: string;
    status?: KataSliceStatus | KataTaskStatus;
    verificationState?: KataTaskVerificationState;
  },
): TrackedEntity {
  const issueId = Number(issue.id);
  if (!Number.isFinite(issueId)) {
    throw new KataDomainError("UNKNOWN", `GitHub issue response did not include a numeric id for ${metadata.kataId}.`);
  }

  return {
    kataId: metadata.kataId,
    type: metadata.type,
    parentId: metadata.parentId,
    status: metadata.status,
    verificationState: metadata.verificationState,
    issueId,
    issueNumber: issue.number,
    contentId: issue.node_id ?? "",
    title: stripKataPrefix(issue.title),
    body: issue.body ?? "",
    state: issue.state ?? "open",
    url: issue.html_url,
    githubMilestoneNumber: nativeGithubMilestoneNumberFromIssue(issue),
  };
}

function entityFromProjectItem(fields: ProjectItemFields): TrackedEntity | null {
  if (
    !fields.kataId ||
    !fields.kataType ||
    fields.issueId === undefined ||
    fields.issueNumber === undefined ||
    !fields.contentId ||
    !fields.title
  ) {
    return null;
  }

  return {
    kataId: fields.kataId,
    type: fields.kataType,
    parentId: fields.parentId,
    status: statusFromProjectFields(fields),
    verificationState: fields.verificationState,
    artifactScope: fields.artifactScope,
    issueId: fields.issueId,
    issueNumber: fields.issueNumber,
    contentId: fields.contentId,
    title: stripKataPrefix(fields.title),
    body: fields.body ?? "",
    state: fields.state ?? "open",
    url: fields.url,
    githubMilestoneNumber: fields.githubMilestoneNumber,
  };
}

function nativeGithubMilestoneNumberFromIssue(issue: GithubIssue): number | undefined {
  const rawNumber = issue.milestone?.number;
  const number = typeof rawNumber === "string" ? Number(rawNumber) : rawNumber;
  return typeof number === "number" && Number.isFinite(number) ? number : undefined;
}

function requireNativeGithubMilestoneNumber(entity: TrackedEntity): number {
  if (entity.githubMilestoneNumber !== undefined) return entity.githubMilestoneNumber;
  throw new KataDomainError(
    "INVALID_CONFIG",
    `GitHub ${entity.type} tracking issue ${entity.kataId} is missing a native GitHub milestone.`,
  );
}

function milestoneFromEntity(entity: TrackedEntity): KataMilestone {
  return {
    id: entity.kataId,
    title: entity.title,
    goal: bodyContent(entity.body) || entity.title,
    status: entity.state === "closed" ? "done" : "active",
    active: entity.state !== "closed",
  };
}

function projectItemFieldsFromNode(
  node: ProjectItemFieldNode | null,
): ProjectItemFields | null {
  if (!node?.id) return null;
  const kataId = normalizeKataId(textFieldValue(node.kataId));
  const kataType = kataEntityTypeFromField(textFieldValue(node.kataType));
  const parentId = normalizeKataId(textFieldValue(node.parentId));
  const artifactScope = normalizeKataId(textFieldValue(node.artifactScope));
  const verificationState = taskVerificationStateFromField(textFieldValue(node.verificationState));
  const contentId = typeof node.content?.id === "string" && node.content.id ? node.content.id : undefined;
  const issueId = typeof node.content?.databaseId === "number" && Number.isFinite(node.content.databaseId)
    ? node.content.databaseId
    : undefined;
  const issueNumber = typeof node.content?.number === "number" && Number.isFinite(node.content.number)
    ? node.content.number
    : undefined;
  const title = typeof node.content?.title === "string" && node.content.title ? node.content.title : undefined;
  const body = typeof node.content?.body === "string" ? node.content.body : undefined;
  const state = normalizeGithubIssueState(node.content?.state);
  const url = typeof node.content?.url === "string" && node.content.url ? node.content.url : undefined;
  const githubMilestoneNumber = typeof node.content?.milestone?.number === "number" &&
    Number.isFinite(node.content.milestone.number)
    ? node.content.milestone.number
    : undefined;
  const status = singleSelectFieldName(node.status);
  return {
    itemId: node.id,
    ...(kataId ? { kataId } : {}),
    ...(kataType ? { kataType } : {}),
    ...(parentId ? { parentId } : {}),
    ...(artifactScope ? { artifactScope } : {}),
    ...(verificationState ? { verificationState } : {}),
    ...(contentId ? { contentId } : {}),
    ...(issueId !== undefined ? { issueId } : {}),
    ...(issueNumber !== undefined ? { issueNumber } : {}),
    ...(title ? { title } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(state ? { state } : {}),
    ...(url ? { url } : {}),
    ...(githubMilestoneNumber !== undefined ? { githubMilestoneNumber } : {}),
    ...(status ? { status } : {}),
  };
}

function isProjectItemFields(value: ProjectItemFields | null): value is ProjectItemFields {
  return value !== null;
}

function isTrackedEntity(value: TrackedEntity | null): value is TrackedEntity {
  return value !== null;
}

function textFieldValue(value: ProjectItemTextFieldValue | null | undefined): string {
  return typeof value?.text === "string" ? value.text : "";
}

function singleSelectFieldName(value: ProjectItemSingleSelectFieldValue | null | undefined): string | undefined {
  return typeof value?.name === "string" && value.name ? value.name : undefined;
}

function normalizeKataId(value: string): string | undefined {
  const trimmed = value.trim().toUpperCase();
  return trimmed ? trimmed : undefined;
}

function kataIdFromTitle(title: string): string | undefined {
  return normalizeKataId(title.match(/^\[([A-Z]+\d*)]\s+/)?.[1] ?? "");
}

function kataEntityTypeFromKataId(kataId: string): KataEntityType | null {
  if (kataId === "PROJECT") return "Project";
  if (/^M\d+$/.test(kataId)) return "Milestone";
  if (/^S\d+$/.test(kataId)) return "Slice";
  if (/^T\d+$/.test(kataId)) return "Task";
  if (/^I\d+$/.test(kataId)) return "Issue";
  return null;
}

function kataEntityTypeFromField(value: string): KataEntityType | undefined {
  const trimmed = value.trim();
  return isKataEntityType(trimmed) ? trimmed : undefined;
}

function taskVerificationStateFromField(value: string): KataTaskVerificationState | undefined {
  const trimmed = value.trim();
  return isKataTaskVerificationState(trimmed) ? trimmed : undefined;
}

function normalizeGithubIssueState(value: unknown): string | undefined {
  return typeof value === "string" && value ? value.toLowerCase() : undefined;
}

function dependencyIdsFromNodes(
  nodes: readonly (IssueDependencyNode | null)[],
  sliceIdByContentId: ReadonlyMap<string, string>,
): string[] {
  return parseSliceDependencyIds(
    nodes.map((node) => (node?.id ? sliceIdByContentId.get(node.id) ?? "" : "")),
  );
}

function statusFromProjectFields(fields: ProjectItemFields): KataSliceStatus | KataTaskStatus | undefined {
  if (fields.state === "closed") return "done";
  if (fields.kataType === "Slice") return sliceStatusFromProjectStatusName(fields.status);
  return statusFromProjectStatusName(fields.status);
}

function statusFromProjectStatusName(value: string | undefined): KataTaskStatus | undefined {
  switch (value) {
    case "Backlog":
      return "backlog";
    case "Todo":
      return "todo";
    case "In Progress":
    case "Agent Review":
    case "Human Review":
    case "Merging":
      return "in_progress";
    case "Done":
      return "done";
    default:
      return undefined;
  }
}

function sliceStatusFromProjectStatusName(value: string | undefined): KataSliceStatus | undefined {
  switch (value) {
    case "Backlog":
      return "backlog";
    case "Todo":
      return "todo";
    case "In Progress":
      return "in_progress";
    case "Agent Review":
      return "agent_review";
    case "Human Review":
      return "human_review";
    case "Merging":
      return "merging";
    case "Done":
      return "done";
    default:
      return undefined;
  }
}

function sliceFromEntity(entity: TrackedEntity, order: number): KataSlice {
  return {
    id: entity.kataId,
    milestoneId: entity.parentId ?? "M000",
    title: entity.title,
    goal: bodyContent(entity.body) || entity.title,
    status: sliceStatusFromEntity(entity),
    order,
    blockedBy: parseSliceDependencyIds(entity.blockedBy ?? []),
    blocking: parseSliceDependencyIds(entity.blocking ?? []),
  };
}

function taskFromEntity(entity: TrackedEntity): KataTask {
  return {
    id: entity.kataId,
    sliceId: entity.parentId ?? "S000",
    title: entity.title,
    description: bodyContent(entity.body),
    status: taskStatusFromEntity(entity),
    verificationState: taskVerificationStateFromEntity(entity),
  };
}

function issueSummaryFromEntity(entity: TrackedEntity): KataIssueSummary {
  return {
    id: entity.kataId,
    number: entity.issueNumber,
    title: entity.title,
    status: issueStatusFromEntity(entity),
    url: entity.url,
  };
}

function issueFromEntity(entity: TrackedEntity): KataIssue {
  return {
    ...issueSummaryFromEntity(entity),
    body: bodyContent(entity.body),
  };
}

function artifactFromParsedComment(input: {
  comment: GithubIssueComment;
  parsed: NonNullable<ReturnType<typeof parseArtifactComment>>;
  backend: "github";
}): KataArtifact {
  return {
    id: `${input.parsed.scopeType}:${input.parsed.scopeId}:${input.parsed.artifactType}`,
    scopeType: input.parsed.scopeType,
    scopeId: input.parsed.scopeId,
    artifactType: input.parsed.artifactType,
    title: `${input.parsed.scopeId}-${input.parsed.artifactType}`,
    content: input.parsed.content,
    format: "markdown",
    updatedAt: new Date().toISOString(),
    provenance: {
      backend: input.backend,
      backendId: `comment:${input.comment.id}`,
    },
  };
}

function isKataEntityType(value: unknown): value is KataEntityType {
  return value === "Project" || value === "Milestone" || value === "Slice" || value === "Task" || value === "Issue";
}

function normalizeArtifactScopeId(scopeType: KataScopeType, scopeId: string): string {
  if (scopeType === "project") return "PROJECT";
  return scopeId.trim().toUpperCase();
}

function statusOptionForSlice(status: KataSlice["status"]): ProjectStatusName {
  switch (status) {
    case "backlog":
      return "Backlog";
    case "in_progress":
      return "In Progress";
    case "agent_review":
      return "Agent Review";
    case "human_review":
      return "Human Review";
    case "merging":
      return "Merging";
    case "done":
      return "Done";
    case "todo":
      return "Todo";
  }
}

function statusOptionForTask(status: KataTask["status"]): ProjectStatusName {
  switch (status) {
    case "backlog":
      return "Backlog";
    case "in_progress":
      return "In Progress";
    case "done":
      return "Done";
    case "todo":
      return "Todo";
  }
}

function statusOptionForIssue(status: KataIssueUpdateStatusInput["status"]): ProjectStatusName {
  switch (status) {
    case "backlog":
      return "Backlog";
    case "in_progress":
      return "In Progress";
    case "done":
      return "Done";
    case "todo":
      return "Todo";
  }
}

function projectStatusNameForEntity(
  type: KataEntityType,
  status: ProjectStatusName,
): KataSliceStatus | KataTaskStatus | undefined {
  return type === "Slice" ? sliceStatusFromProjectStatusName(status) : statusFromProjectStatusName(status);
}

function sliceStatusFromEntity(entity: TrackedEntity): KataSliceStatus {
  if (entity.state === "closed") return "done";
  return isKataSliceStatus(entity.status) ? entity.status : "backlog";
}

function taskStatusFromEntity(entity: TrackedEntity): KataTaskStatus {
  if (entity.state === "closed") return "done";
  return isKataTaskStatus(entity.status) ? entity.status : "backlog";
}

function issueStatusFromEntity(entity: TrackedEntity): KataIssue["status"] {
  if (entity.state === "closed") return "done";
  return isKataTaskStatus(entity.status) ? entity.status : "backlog";
}

function taskVerificationStateFromEntity(entity: TrackedEntity): KataTaskVerificationState {
  return isKataTaskVerificationState(entity.verificationState) ? entity.verificationState : "pending";
}

function isKataSliceStatus(value: unknown): value is KataSliceStatus {
  return (
    value === "backlog" ||
    value === "todo" ||
    value === "in_progress" ||
    value === "agent_review" ||
    value === "human_review" ||
    value === "merging" ||
    value === "done"
  );
}

function isKataTaskStatus(value: unknown): value is KataTaskStatus {
  return value === "backlog" || value === "todo" || value === "in_progress" || value === "done";
}

function isKataTaskVerificationState(value: unknown): value is KataTaskVerificationState {
  return value === "pending" || value === "verified" || value === "failed";
}

function stripKataPrefix(title: string): string {
  return title.replace(/^\[[A-Z]+\d*]\s*/, "");
}

function bodyContent(body: string): string {
  return body;
}

function appendBodySection(body: string, heading: string, content: string): string {
  return `${body.trimEnd()}\n\n## ${heading}\n\n${content}`;
}

function formatPlannedIssueBody(design: string, plan: string): string {
  return `# Design\n\n${design.trim()}\n\n# Plan\n\n${plan.trim()}`;
}
