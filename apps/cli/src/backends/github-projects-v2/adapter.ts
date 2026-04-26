import type {
  KataArtifact,
  KataArtifactType,
  KataArtifactWriteInput,
  KataBackendAdapter,
  KataExecutionStatus,
  KataPullRequest,
  KataScopeType,
  KataSlice,
  KataTask,
} from "../../domain/types.js";

interface GithubProjectsV2Clients {
  fetchProjectSnapshot: (input: { milestoneId?: string }) => Promise<any>;
}

export class GithubProjectsV2Adapter implements KataBackendAdapter {
  constructor(private readonly clients: GithubProjectsV2Clients) {}

  async getProjectContext() {
    return {
      backend: "github" as const,
      workspacePath: process.cwd(),
    };
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

  async listSlices(input: { milestoneId: string }): Promise<KataSlice[]> {
    const snapshot = await this.clients.fetchProjectSnapshot({ milestoneId: input.milestoneId });
    return snapshot.columns.flatMap((column: any) =>
      column.cards.map((card: any, index: number) => ({
        id: card.id,
        milestoneId: input.milestoneId,
        title: card.title,
        goal: card.title,
        status: normalizeColumn(column.id),
        order: index,
      })),
    );
  }

  async listTasks(input: { sliceId: string }): Promise<KataTask[]> {
    const snapshot = await this.clients.fetchProjectSnapshot({});
    const card = snapshot.columns
      .flatMap((column: any) => column.cards)
      .find((candidate: any) => candidate.id === input.sliceId);

    return (card?.tasks ?? []).map((task: any) => ({
      id: task.id,
      sliceId: input.sliceId,
      title: task.title,
      description: task.description ?? "",
      status: normalizeColumn(task.columnId),
      verificationState: "pending" as const,
    }));
  }

  async listArtifacts(_input: { scopeType: KataScopeType; scopeId: string }): Promise<KataArtifact[]> {
    return [];
  }

  async readArtifact(_input: {
    scopeType: KataScopeType;
    scopeId: string;
    artifactType: KataArtifactType;
  }): Promise<KataArtifact | null> {
    return null;
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
}

function normalizeColumn(columnId: string): KataSlice["status"] | KataTask["status"] {
  if (columnId === "in_progress") return "in_progress";
  if (columnId === "agent_review") return "agent_review";
  if (columnId === "human_review") return "human_review";
  if (columnId === "merging") return "merging";
  if (columnId === "done") return "done";
  return "todo";
}
