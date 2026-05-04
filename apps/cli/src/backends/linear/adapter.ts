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

interface LinearKataClients {
  fetchActiveMilestoneSnapshot: (input: { milestoneId?: string }) => Promise<any>;
  fetchDocumentByTitle?: (input: {
    scopeType: KataScopeType;
    scopeId: string;
    artifactType: KataArtifactType;
  }) => Promise<KataArtifact | null>;
  listArtifacts?: (input: { scopeType: KataScopeType; scopeId: string }) => Promise<KataArtifact[]>;
}

export class LinearKataAdapter implements KataBackendAdapter {
  constructor(private readonly clients: LinearKataClients) {}

  async getProjectContext() {
    return {
      backend: "linear" as const,
      workspacePath: process.cwd(),
    };
  }

  async upsertProject(_input: KataProjectUpsertInput): Promise<KataProjectContext> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear project upsert is not implemented yet.");
  }

  async listMilestones(): Promise<KataMilestone[]> {
    const activeMilestone = await this.getActiveMilestone();
    return activeMilestone ? [activeMilestone] : [];
  }

  async getActiveMilestone() {
    const snapshot = await this.clients.fetchActiveMilestoneSnapshot({});
    if (!snapshot.activeMilestone) return null;

    return {
      id: snapshot.activeMilestone.id,
      title: snapshot.activeMilestone.name,
      goal: snapshot.activeMilestone.name,
      status: "active" as const,
      active: true,
    };
  }

  async createMilestone(_input: KataMilestoneCreateInput): Promise<KataMilestone> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear milestone creation is not implemented yet.");
  }

  async completeMilestone(_input: KataMilestoneCompleteInput): Promise<KataMilestone> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear milestone completion is not implemented yet.");
  }

  async listSlices(input: { milestoneId: string }): Promise<KataSlice[]> {
    const snapshot = await this.clients.fetchActiveMilestoneSnapshot({ milestoneId: input.milestoneId });
    return snapshot.columns.flatMap((column: any) =>
      column.cards.map((card: any, index: number) => ({
        id: card.id,
        identifier: card.identifier,
        milestoneId: card.milestoneId ?? input.milestoneId,
        milestoneName: card.milestoneName,
        title: card.title,
        goal: card.title,
        status: normalizeColumn(column.id),
        order: index,
        blockedBy: normalizeDependencyIds(card.blockedBy ?? card.blocked_by),
        blocking: normalizeDependencyIds(card.blocking),
        stateName: card.stateName,
        stateType: card.stateType,
        url: card.url,
      })),
    );
  }

  async createSlice(_input: KataSliceCreateInput): Promise<KataSlice> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear slice creation is not implemented yet.");
  }

  async updateSliceStatus(_input: KataSliceUpdateStatusInput): Promise<KataSlice> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear slice status updates are not implemented yet.");
  }

  async listTasks(input: { sliceId: string }): Promise<KataTask[]> {
    const snapshot = await this.clients.fetchActiveMilestoneSnapshot({});
    const card = snapshot.columns
      .flatMap((column: any) => column.cards)
      .find((candidate: any) => candidate.id === input.sliceId);

    return (card?.tasks ?? []).map((task: any) => ({
      id: task.id,
      sliceId: input.sliceId,
      identifier: task.identifier,
      title: task.title,
      description: task.description ?? "",
      status: normalizeColumn(task.columnId),
      verificationState: "pending" as const,
      stateName: task.stateName,
      stateType: task.stateType,
      url: task.url,
    }));
  }

  async createTask(_input: KataTaskCreateInput): Promise<KataTask> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear task creation is not implemented yet.");
  }

  async updateTaskStatus(_input: KataTaskUpdateStatusInput): Promise<KataTask> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear task status updates are not implemented yet.");
  }

  async createIssue(_input: KataIssueCreateInput): Promise<KataIssue> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear standalone issue creation is not implemented yet.");
  }

  async listOpenIssues(): Promise<KataIssueSummary[]> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear standalone issue listing is not implemented yet.");
  }

  async getIssue(_input: KataIssueGetInput): Promise<KataIssue> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear standalone issue retrieval is not implemented yet.");
  }

  async updateIssueStatus(_input: KataIssueUpdateStatusInput): Promise<KataIssue> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear standalone issue status updates are not implemented yet.");
  }

  async listArtifacts(_input: { scopeType: KataScopeType; scopeId: string }): Promise<KataArtifact[]> {
    return this.clients.listArtifacts?.(_input) ?? [];
  }

  async readArtifact(input: {
    scopeType: KataScopeType;
    scopeId: string;
    artifactType: KataArtifactType;
  }): Promise<KataArtifact | null> {
    return (await this.clients.fetchDocumentByTitle?.(input)) ?? null;
  }

  async writeArtifact(input: KataArtifactWriteInput): Promise<KataArtifact> {
    return {
      id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      artifactType: input.artifactType,
      title: input.title,
      content: input.content,
      format: input.format,
      updatedAt: new Date().toISOString(),
      provenance: {
        backend: "linear",
        backendId: `artifact:${input.scopeId}:${input.artifactType}`,
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
      backend: "linear",
      checks: [
        {
          name: "adapter",
          status: "ok",
          message: "Linear adapter is configured; external backend validation is not implemented yet.",
        },
      ],
    };
  }
}

function normalizeDependencyIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }
  if (typeof value === "string") {
    return value.split(/[\n,;]+/).map((item) => item.trim()).filter((item) => item.length > 0);
  }
  return [];
}

function normalizeColumn(columnId: string): KataSlice["status"] | KataTask["status"] {
  if (columnId === "in_progress") return "in_progress";
  if (columnId === "agent_review") return "agent_review";
  if (columnId === "human_review") return "human_review";
  if (columnId === "merging") return "merging";
  if (columnId === "done") return "done";
  if (columnId === "todo") return "todo";
  return "backlog";
}
