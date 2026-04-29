export type KataBackendKind = "github" | "linear";

export type KataScopeType = "project" | "milestone" | "slice" | "task";

export type KataArtifactType =
  | "project-brief"
  | "requirements"
  | "roadmap"
  | "phase-context"
  | "context"
  | "decisions"
  | "research"
  | "plan"
  | "slice"
  | "summary"
  | "verification"
  | "uat"
  | "retrospective";

export interface KataProjectContext {
  backend: KataBackendKind;
  workspacePath: string;
  title?: string;
  description?: string;
  repository?: {
    owner: string;
    name: string;
  };
}

export interface KataProjectSnapshotArtifact {
  artifactType: KataArtifactType;
  title: string;
  updatedAt: string;
  provenance: KataArtifact["provenance"];
  requirementIds: string[];
}

export interface KataProjectSnapshotTask extends KataTask {
  artifacts: KataProjectSnapshotArtifact[];
  requirementIds: string[];
}

export interface KataProjectSnapshotSlice extends KataSlice {
  tasks: KataProjectSnapshotTask[];
  artifacts: KataProjectSnapshotArtifact[];
  requirementIds: string[];
}

export interface KataProjectSnapshotNextAction {
  workflow: "kata-new-milestone" | "kata-plan-phase" | "kata-execute-phase" | "kata-verify-work" | "kata-complete-milestone";
  reason: string;
  target?: {
    milestoneId?: string;
    sliceId?: string;
    taskId?: string;
    requirementId?: string;
  };
}

export interface KataProjectSnapshot {
  context: KataProjectContext;
  activeMilestone: KataMilestone | null;
  milestoneArtifacts: KataProjectSnapshotArtifact[];
  requirements: {
    requiredIds: string[];
    coveredIds: string[];
    missingIds: string[];
  };
  roadmap: {
    plannedSliceIds: string[];
    existingSliceIds: string[];
    missingSliceIds: string[];
  };
  slices: KataProjectSnapshotSlice[];
  readiness: {
    hasActiveMilestone: boolean;
    allRoadmapSlicesExist: boolean;
    allSlicesDone: boolean;
    allTasksDone: boolean;
    allTasksVerified: boolean;
    milestoneCompletable: boolean;
  };
  nextAction: KataProjectSnapshotNextAction;
}

export interface KataMilestone {
  id: string;
  title: string;
  goal: string;
  status: "planned" | "active" | "done";
  active: boolean;
}

export interface KataSlice {
  id: string;
  milestoneId: string;
  title: string;
  goal: string;
  status: "backlog" | "todo" | "in_progress" | "agent_review" | "human_review" | "merging" | "done";
  order: number;
}

export interface KataTask {
  id: string;
  sliceId: string;
  title: string;
  description: string;
  status: "backlog" | "todo" | "in_progress" | "done";
  verificationState: "pending" | "verified" | "failed";
}

export interface KataArtifact {
  id: string;
  scopeType: KataScopeType;
  scopeId: string;
  artifactType: KataArtifactType;
  title: string;
  content: string;
  format: "markdown" | "text" | "json";
  updatedAt: string;
  provenance: {
    backend: KataBackendKind;
    backendId: string;
  };
}

export interface KataArtifactWriteInput {
  scopeType: KataScopeType;
  scopeId: string;
  artifactType: KataArtifactType;
  title: string;
  content: string;
  format: "markdown" | "text" | "json";
}

export interface KataProjectUpsertInput {
  title: string;
  description: string;
}

export interface KataMilestoneCreateInput {
  title: string;
  goal: string;
}

export interface KataMilestoneCompleteInput {
  milestoneId: string;
  summary: string;
}

export interface KataSliceListInput {
  milestoneId: string;
}

export interface KataSliceCreateInput {
  milestoneId: string;
  title: string;
  goal: string;
  order?: number;
}

export interface KataSliceUpdateStatusInput {
  sliceId: string;
  status: KataSlice["status"];
}

export interface KataTaskListInput {
  sliceId: string;
}

export interface KataTaskCreateInput {
  sliceId: string;
  title: string;
  description: string;
}

export interface KataTaskUpdateStatusInput {
  taskId: string;
  status: KataTask["status"];
  verificationState?: KataTask["verificationState"];
}

export interface KataArtifactListInput {
  scopeType: KataScopeType;
  scopeId: string;
}

export interface KataArtifactReadInput extends KataArtifactListInput {
  artifactType: KataArtifactType;
}

export interface KataOpenPullRequestInput {
  title: string;
  body: string;
  base: string;
  head: string;
}

export interface KataPullRequest {
  id: string;
  url: string;
  branch: string;
  base: string;
  status: "open" | "merged" | "closed";
  mergeReady: boolean;
}

export interface KataExecutionStatus {
  queueDepth: number;
  activeWorkers: number;
  escalations: Array<{ requestId: string; issueId: string; summary: string }>;
}

export interface KataHealthCheck {
  name: string;
  status: "ok" | "warn" | "invalid";
  message: string;
}

export interface KataHealthReport {
  ok: boolean;
  backend: KataBackendKind;
  checks: KataHealthCheck[];
}

export interface KataBackendAdapter {
  getProjectContext(): Promise<KataProjectContext>;
  upsertProject(input: KataProjectUpsertInput): Promise<KataProjectContext>;
  listMilestones(): Promise<KataMilestone[]>;
  getActiveMilestone(): Promise<KataMilestone | null>;
  createMilestone(input: KataMilestoneCreateInput): Promise<KataMilestone>;
  completeMilestone(input: KataMilestoneCompleteInput): Promise<KataMilestone>;
  listSlices(input: KataSliceListInput): Promise<KataSlice[]>;
  createSlice(input: KataSliceCreateInput): Promise<KataSlice>;
  updateSliceStatus(input: KataSliceUpdateStatusInput): Promise<KataSlice>;
  listTasks(input: KataTaskListInput): Promise<KataTask[]>;
  createTask(input: KataTaskCreateInput): Promise<KataTask>;
  updateTaskStatus(input: KataTaskUpdateStatusInput): Promise<KataTask>;
  listArtifacts(input: KataArtifactListInput): Promise<KataArtifact[]>;
  readArtifact(input: KataArtifactReadInput): Promise<KataArtifact | null>;
  writeArtifact(input: KataArtifactWriteInput): Promise<KataArtifact>;
  openPullRequest(input: KataOpenPullRequestInput): Promise<KataPullRequest>;
  getExecutionStatus(): Promise<KataExecutionStatus>;
  checkHealth(): Promise<KataHealthReport>;
}
