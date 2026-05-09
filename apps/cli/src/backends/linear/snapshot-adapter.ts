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
  KataProjectContext,
  KataProjectUpsertInput,
  KataPullRequest,
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

interface LinearSnapshotClients {
  fetchActiveMilestoneSnapshot: () => Promise<any>;
  listArtifacts?: (input: { scopeType: KataScopeType; scopeId: string }) => Promise<KataArtifact[]>;
}

export class LinearSnapshotAdapter implements KataBackendAdapter {
  constructor(private readonly clients: LinearSnapshotClients) {}

  async getProjectContext(): Promise<KataProjectContext> {
    const snapshot = await this.clients.fetchActiveMilestoneSnapshot();
    return {
      backend: "linear",
      workspacePath: snapshot.source?.projectId ?? process.cwd(),
      title: snapshot.source?.projectId ?? "Linear project",
      description: "Linear snapshot adapter",
    };
  }

  async upsertProject(_input: KataProjectUpsertInput): Promise<KataProjectContext> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear snapshot adapter cannot upsert projects.");
  }

  async listMilestones(): Promise<KataMilestone[]> {
    const activeMilestone = await this.getActiveMilestone();
    return activeMilestone ? [activeMilestone] : [];
  }

  async getActiveMilestone(): Promise<KataMilestone | null> {
    const snapshot = await this.clients.fetchActiveMilestoneSnapshot();
    if (!snapshot.activeMilestone) return null;

    return {
      id: snapshot.activeMilestone.id,
      title: snapshot.activeMilestone.name,
      goal: snapshot.activeMilestone.name,
      status: "active",
      active: true,
    };
  }

  async createMilestone(_input: KataMilestoneCreateInput): Promise<KataMilestone> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear snapshot adapter cannot create milestones.");
  }

  async completeMilestone(_input: KataMilestoneCompleteInput): Promise<KataMilestone> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear snapshot adapter cannot complete milestones.");
  }

  async listSlices(input: { milestoneId: string }): Promise<KataSlice[]> {
    const snapshot = await this.clients.fetchActiveMilestoneSnapshot();
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
        blockedBy: parseSliceDependencyIds(card.blockedBy ?? card.blocked_by),
        blocking: parseSliceDependencyIds(card.blocking),
        stateName: card.stateName,
        stateType: card.stateType,
        url: card.url,
      })),
    );
  }

  async createSlice(_input: KataSliceCreateInput): Promise<KataSlice> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear snapshot adapter cannot create slices.");
  }

  async updateSliceStatus(_input: KataSliceUpdateStatusInput): Promise<KataSlice> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear snapshot adapter cannot update slice status.");
  }

  async listTasks(input: { sliceId: string }): Promise<KataTask[]> {
    const snapshot = await this.clients.fetchActiveMilestoneSnapshot();
    const card = snapshot.columns
      .flatMap((column: any) => column.cards)
      .find((candidate: any) => candidate.id === input.sliceId);

    return (card?.tasks ?? []).map((task: any) => ({
      id: task.id,
      sliceId: input.sliceId,
      identifier: task.identifier,
      title: task.title,
      description: task.description ?? "",
      status: normalizeTaskStatus(task.columnId ?? task.status),
      verificationState: "pending" as const,
      stateName: task.stateName,
      stateType: task.stateType,
      url: task.url,
    }));
  }

  async createTask(_input: KataTaskCreateInput): Promise<KataTask> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear snapshot adapter cannot create tasks.");
  }

  async updateTaskStatus(_input: KataTaskUpdateStatusInput): Promise<KataTask> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear snapshot adapter cannot update task status.");
  }

  async createIssue(_input: KataIssueCreateInput): Promise<KataIssue> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear snapshot adapter cannot create standalone issues.");
  }

  async listOpenIssues(): Promise<KataIssueSummary[]> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear snapshot adapter cannot list standalone issues.");
  }

  async getIssue(_input: KataIssueGetInput): Promise<KataIssue> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear snapshot adapter cannot retrieve standalone issues.");
  }

  async updateIssueStatus(_input: KataIssueUpdateStatusInput): Promise<KataIssue> {
    throw new KataDomainError("NOT_SUPPORTED", "Linear snapshot adapter cannot update standalone issue status.");
  }

  async listArtifacts(input: { scopeType: KataScopeType; scopeId: string }): Promise<KataArtifact[]> {
    return this.clients.listArtifacts?.(input) ?? [];
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
      url: `https://linear.app/pull/${encodeURIComponent(input.head)}`,
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
          message: "Linear snapshot adapter is configured.",
        },
      ],
    };
  }
}

function normalizeColumn(columnId: string): KataSlice["status"] {
  if (columnId === "backlog") return "backlog";
  if (columnId === "in_progress") return "in_progress";
  if (columnId === "done") return "done";
  return "todo";
}

function normalizeTaskStatus(status: string): KataTask["status"] {
  if (status === "done") return "done";
  if (status === "in_progress") return "in_progress";
  return "todo";
}
