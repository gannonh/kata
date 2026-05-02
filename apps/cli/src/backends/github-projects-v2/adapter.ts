import type {
  KataArtifact,
  KataArtifactType,
  KataArtifactWriteInput,
  KataBackendAdapter,
  KataExecutionStatus,
  KataHealthReport,
  KataIssue,
  KataIssueCreateInput,
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
  issueId: number;
  issueNumber: number;
  contentId: string;
  title: string;
  body: string;
  state: string;
  url?: string;
  githubMilestoneNumber?: number;
}

interface EntityMarker {
  kataId: string;
  type: KataEntityType;
  parentId?: string;
  status?: KataSliceStatus | KataTaskStatus;
  verificationState?: KataTaskVerificationState;
}

const ENTITY_MARKER_PREFIX = "<!-- kata:entity ";
const ENTITY_MARKER_SUFFIX = " -->";
const ISSUES_PER_PAGE = 100;
const MAX_ISSUE_PAGES = 100;
const COMMENTS_PER_PAGE = 100;
const MAX_COMMENT_PAGES = 100;

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
    const body = formatEntityBody({
      kataId: "PROJECT",
      type: "Project",
      content: input.description,
    });
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
      blocking: "",
      blockedBy: "",
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
      body: formatEntityBody({
        kataId,
        type: "Milestone",
        content: input.goal,
      }),
      issueBody: {
        milestone: githubMilestone.number,
      },
    });

    await this.syncProjectFields(entity, {
      type: "Milestone",
      status: "Backlog",
      artifactScope: kataId,
      verificationState: "",
      blocking: "",
      blockedBy: "",
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
    const entity = await this.createIssueEntity({
      kataId,
      type: "Slice",
      parentId: input.milestoneId,
      title: `[${kataId}] ${input.title}`,
      body: formatEntityBody({
        kataId,
        type: "Slice",
        parentId: input.milestoneId,
        status: "backlog",
        content: input.goal,
      }),
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
      blocking: "",
      blockedBy: "",
    });

    return {
      id: kataId,
      milestoneId: input.milestoneId,
      title: input.title,
      goal: input.goal,
      status: "backlog",
      order: input.order ?? 0,
    };
  }

  async updateSliceStatus(input: KataSliceUpdateStatusInput): Promise<KataSlice> {
    const entity = await this.requireEntity(input.sliceId, "Slice");
    const updated = await this.updateEntityStatus(entity, statusOptionForSlice(input.status), {
      status: input.status,
    });
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
      body: formatEntityBody({
        kataId,
        type: "Task",
        parentId: input.sliceId,
        status: "backlog",
        verificationState: "pending",
        content: input.description,
      }),
      issueBody: {
        milestone: requireNativeGithubMilestoneNumber(milestoneEntity ?? sliceEntity),
      },
    });

    await this.attachSubIssue(sliceEntity, entity);

    await this.syncProjectFields(entity, {
      type: "Task",
      parentId: input.sliceId,
      status: "Backlog",
      artifactScope: kataId,
      verificationState: "pending",
      blocking: "",
      blockedBy: "",
    });

    return {
      id: kataId,
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
      status: input.status,
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
    const body = formatEntityBody({
      kataId,
      type: "Issue",
      status: "backlog",
      content: formatPlannedIssueBody(input.design, input.plan),
    });
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
      blocking: "",
      blockedBy: "",
    });

    return issueFromEntity(entity);
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

    for (let page = 1; page <= MAX_ISSUE_PAGES; page += 1) {
      const issues = await this.client.rest<GithubIssue[]>({
        method: "GET",
        path: `/repos/${this.owner}/${this.repo}/issues?state=all&per_page=${ISSUES_PER_PAGE}&page=${page}`,
      });

      for (const issue of issues) {
        if (issue.pull_request) continue;
        const marker = typeof issue.body === "string" ? parseEntityMarker(issue.body) : null;
        if (!marker || !issue.node_id) continue;
        if (this.entities.has(marker.kataId)) continue;
        this.entities.set(marker.kataId, entityFromIssue(issue, marker));
      }

      if (issues.length < ISSUES_PER_PAGE) {
        this.discovered = true;
        return;
      }
    }

    throw new KataDomainError("UNKNOWN", `Unable to discover Kata issues after ${MAX_ISSUE_PAGES} full pages.`);
  }

  private nextKataId(type: "Milestone" | "Slice" | "Task" | "Issue"): string {
    const prefix = type === "Milestone" ? "M" : type === "Slice" ? "S" : type === "Task" ? "T" : "I";
    const maxExisting = [...this.entities.keys()].reduce((max, kataId) => {
      const match = kataId.match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

    return `${prefix}${String(maxExisting + 1).padStart(3, "0")}`;
  }

  private async requireEntity(kataId: string, type: KataEntityType): Promise<TrackedEntity> {
    await this.discoverEntities();
    const entity = this.entities.get(kataId);
    if (!entity || entity.type !== type) {
      throw new KataDomainError("NOT_FOUND", `GitHub ${type} tracking issue was not found for ${kataId}.`);
    }
    return entity;
  }

  private async findArtifactEntity(scopeType: KataScopeType, scopeId: string): Promise<TrackedEntity | null> {
    await this.discoverEntities();
    const kataId = normalizeArtifactScopeId(scopeType, scopeId);
    const entity = this.entities.get(kataId);
    return entity ?? null;
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
    const updated = {
      ...entity,
      title: updatedIssue.title ?? input.title ?? entity.title,
      body: updatedIssue.body ?? input.body ?? entity.body,
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
      blocking?: string;
      blockedBy?: string;
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
    await this.updateProjectField(fieldIndex, projectItemId, KATA_PROJECT_FIELDS.blocking, input.blocking ?? "");
    await this.updateProjectField(fieldIndex, projectItemId, KATA_PROJECT_FIELDS.blockedBy, input.blockedBy ?? "");
    await this.updateProjectStatus(fieldIndex, projectItemId, input.status);
    return projectItemId;
  }

  private async updateEntityStatus(
    entity: TrackedEntity,
    status: ProjectStatusName,
    metadata: Pick<EntityMarker, "status" | "verificationState"> = {},
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
    return this.updateIssueEntity(entity, {
      state: issueState,
      body: updateEntityBodyMarker(entity, metadata),
    });
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
      return;
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

export function formatEntityBody(input: {
  kataId: string;
  type: KataEntityType;
  parentId?: string;
  status?: KataSliceStatus | KataTaskStatus;
  verificationState?: KataTaskVerificationState;
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

export function parseEntityMarker(body: string): EntityMarker | null {
  const newlineIndex = body.indexOf("\n");
  const markerLine = newlineIndex === -1 ? body : body.slice(0, newlineIndex);

  if (!markerLine.startsWith(ENTITY_MARKER_PREFIX) || !markerLine.endsWith(ENTITY_MARKER_SUFFIX)) {
    return null;
  }

  try {
    const marker = JSON.parse(markerLine.slice(ENTITY_MARKER_PREFIX.length, -ENTITY_MARKER_SUFFIX.length));
    if (!isEntityMarker(marker)) return null;
    return marker;
  } catch {
    return null;
  }
}

function entityFromIssue(issue: GithubIssue, marker: EntityMarker): TrackedEntity {
  const issueId = Number(issue.id);
  if (!Number.isFinite(issueId)) {
    throw new KataDomainError("UNKNOWN", `GitHub issue response did not include a numeric id for ${marker.kataId}.`);
  }

  return {
    kataId: marker.kataId,
    type: marker.type,
    parentId: marker.parentId,
    status: marker.status,
    verificationState: marker.verificationState,
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

function sliceFromEntity(entity: TrackedEntity, order: number): KataSlice {
  return {
    id: entity.kataId,
    milestoneId: entity.parentId ?? "M000",
    title: entity.title,
    goal: bodyContent(entity.body) || entity.title,
    status: sliceStatusFromEntity(entity),
    order,
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

function issueFromEntity(entity: TrackedEntity): KataIssue {
  return {
    id: entity.kataId,
    title: entity.title,
    body: bodyContent(entity.body),
    status: issueStatusFromEntity(entity),
    url: entity.url,
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

function isEntityMarker(value: unknown): value is EntityMarker {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.kataId !== "string" ||
    candidate.kataId.length === 0 ||
    !isKataEntityType(candidate.type) ||
    (candidate.parentId !== undefined && typeof candidate.parentId !== "string")
  ) {
    return false;
  }
  if (candidate.status !== undefined) {
    const statusValid = candidate.type === "Slice"
      ? isKataSliceStatus(candidate.status)
      : candidate.type === "Task" || candidate.type === "Issue"
        ? isKataTaskStatus(candidate.status)
        : false;
    if (!statusValid) return false;
  }
  if (candidate.verificationState !== undefined) {
    if (candidate.type !== "Task" || !isKataTaskVerificationState(candidate.verificationState)) return false;
  }
  return true;
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

function sliceStatusFromEntity(entity: TrackedEntity): KataSliceStatus {
  return isKataSliceStatus(entity.status) ? entity.status : entity.state === "closed" ? "done" : "todo";
}

function taskStatusFromEntity(entity: TrackedEntity): KataTaskStatus {
  return isKataTaskStatus(entity.status) ? entity.status : entity.state === "closed" ? "done" : "backlog";
}

function issueStatusFromEntity(entity: TrackedEntity): KataIssue["status"] {
  return isKataTaskStatus(entity.status) ? entity.status : entity.state === "closed" ? "done" : "backlog";
}

function taskVerificationStateFromEntity(entity: TrackedEntity): KataTaskVerificationState {
  return isKataTaskVerificationState(entity.verificationState) ? entity.verificationState : "pending";
}

function updateEntityBodyMarker(
  entity: TrackedEntity,
  metadata: Pick<EntityMarker, "status" | "verificationState">,
): string {
  const marker = parseEntityMarker(entity.body) ?? {
    kataId: entity.kataId,
    type: entity.type,
    parentId: entity.parentId,
  };
  const content = bodyContent(entity.body);
  return formatEntityBody({
    kataId: marker.kataId,
    type: marker.type,
    parentId: marker.parentId,
    status: metadata.status ?? marker.status,
    verificationState: metadata.verificationState ?? marker.verificationState,
    content,
  });
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
  const newlineIndex = body.indexOf("\n");
  return newlineIndex === -1 ? "" : body.slice(newlineIndex + 1);
}

function appendBodySection(body: string, heading: string, content: string): string {
  return `${body.trimEnd()}\n\n## ${heading}\n\n${content}`;
}

function formatPlannedIssueBody(design: string, plan: string): string {
  return `# Design\n\n${design.trim()}\n\n# Plan\n\n${plan.trim()}`;
}
