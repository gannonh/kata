import type {
  KataArtifact,
  KataArtifactType,
  KataArtifactWriteInput,
  KataBackendAdapter,
  KataExecutionStatus,
  KataHealthReport,
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

interface GithubProjectsV2Clients {
  fetchProjectSnapshot: (input: { milestoneId?: string }) => Promise<any>;
  listArtifacts?: (input: { scopeType: KataScopeType; scopeId: string }) => Promise<KataArtifact[]>;
  readArtifact?: (input: {
    scopeType: KataScopeType;
    scopeId: string;
    artifactType: KataArtifactType;
  }) => Promise<KataArtifact | null>;
}

export class GithubProjectsV2Adapter implements KataBackendAdapter {
  constructor(private readonly clients: GithubProjectsV2Clients) {}

  async getProjectContext() {
    return {
      backend: "github" as const,
      workspacePath: process.cwd(),
    };
  }

  async upsertProject(_input: KataProjectUpsertInput): Promise<KataProjectContext> {
    throw new KataDomainError("NOT_SUPPORTED", "GitHub Projects v2 project upsert is not implemented yet.");
  }

  async listMilestones(): Promise<KataMilestone[]> {
    const activeMilestone = await this.getActiveMilestone();
    return activeMilestone ? [activeMilestone] : [];
  }

  async getActiveMilestone() {
    const snapshot = await this.clients.fetchProjectSnapshot({});
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
    throw new KataDomainError("NOT_SUPPORTED", "GitHub Projects v2 milestone creation is not implemented yet.");
  }

  async completeMilestone(_input: KataMilestoneCompleteInput): Promise<KataMilestone> {
    throw new KataDomainError("NOT_SUPPORTED", "GitHub Projects v2 milestone completion is not implemented yet.");
  }

  async listSlices(input: { milestoneId: string }): Promise<KataSlice[]> {
    const snapshot = await this.clients.fetchProjectSnapshot({ milestoneId: input.milestoneId });
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
        stateName: card.stateName,
        stateType: card.stateType,
        url: card.url,
      })),
    );
  }

  async createSlice(_input: KataSliceCreateInput): Promise<KataSlice> {
    throw new KataDomainError("NOT_SUPPORTED", "GitHub Projects v2 slice creation is not implemented yet.");
  }

  async updateSliceStatus(_input: KataSliceUpdateStatusInput): Promise<KataSlice> {
    throw new KataDomainError("NOT_SUPPORTED", "GitHub Projects v2 slice status updates are not implemented yet.");
  }

  async listTasks(input: { sliceId: string }): Promise<KataTask[]> {
    const snapshot = await this.clients.fetchProjectSnapshot({});
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
    throw new KataDomainError("NOT_SUPPORTED", "GitHub Projects v2 task creation is not implemented yet.");
  }

  async updateTaskStatus(_input: KataTaskUpdateStatusInput): Promise<KataTask> {
    throw new KataDomainError("NOT_SUPPORTED", "GitHub Projects v2 task status updates are not implemented yet.");
  }

  async listArtifacts(_input: { scopeType: KataScopeType; scopeId: string }): Promise<KataArtifact[]> {
    return this.clients.listArtifacts?.(_input) ?? [];
  }

  async readArtifact(_input: {
    scopeType: KataScopeType;
    scopeId: string;
    artifactType: KataArtifactType;
  }): Promise<KataArtifact | null> {
    return (await this.clients.readArtifact?.(_input)) ?? null;
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
        backend: "github",
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
      backend: "github",
      checks: [
        {
          name: "adapter",
          status: "ok",
          message: "GitHub Projects v2 adapter is configured; external backend validation is not implemented yet.",
        },
      ],
    };
  }
}

function normalizeColumn(columnId: string): KataSlice["status"] | KataTask["status"] {
  if (columnId === "in_progress") return "in_progress";
  if (columnId === "agent_review") return "agent_review";
  if (columnId === "human_review") return "human_review";
  if (columnId === "merging") return "merging";
  if (columnId === "done") return "done";
  return "todo";
}
