export type KataBackendKind = "github" | "linear";

export type KataScopeType = "project" | "milestone" | "slice" | "task";

export type KataArtifactType =
  | "project-brief"
  | "requirements"
  | "roadmap"
  | "phase-context"
  | "research"
  | "plan"
  | "summary"
  | "verification"
  | "uat"
  | "retrospective";

export interface KataProjectContext {
  id: string;
  backend: KataBackendKind;
  title: string;
  description?: string;
}

export interface KataMilestone {
  id: string;
  backend: KataBackendKind;
  projectId: string;
  title: string;
  description?: string;
  status: string;
}

export interface KataSlice {
  id: string;
  backend: KataBackendKind;
  milestoneId: string;
  title: string;
  description?: string;
  status: string;
}

export interface KataTask {
  id: string;
  backend: KataBackendKind;
  milestoneId: string;
  sliceId: string;
  title: string;
  description?: string;
  status: string;
}

export interface KataArtifact {
  id: string;
  backend: KataBackendKind;
  artifactType: KataArtifactType;
  scopeType: KataScopeType;
  scopeId: string;
  title?: string;
  content: string;
  format?: string;
  updatedAt?: string;
  externalRef?: string;
}

export interface KataPullRequest {
  id: string;
  backend: KataBackendKind;
  title: string;
  link: string;
}

export interface KataExecutionStatus {
  status: string;
  updatedAt?: string;
  details?: string;
}

export interface KataSliceListParams {
  projectId?: string;
  milestoneId?: string;
}

export interface KataTaskListParams {
  milestoneId?: string;
  sliceId?: string;
}

export interface KataArtifactListParams {
  scopeType: KataScopeType;
  scopeId: string;
}

export interface KataArtifactReadParams extends KataArtifactListParams {
  artifactType: KataArtifactType;
}

export interface KataOpenPullRequestParams {
  taskId?: string;
  sliceId?: string;
  milestoneId?: string;
}

export interface KataExecutionStatusParams {
  taskId?: string;
  sliceId?: string;
}

export interface KataBackendAdapter {
  getProjectContext(): Promise<KataProjectContext>;
  getActiveMilestone(): Promise<KataMilestone | null>;
  listSlices(params?: KataSliceListParams): Promise<KataSlice[]>;
  listTasks(params?: KataTaskListParams): Promise<KataTask[]>;
  listArtifacts(params: KataArtifactListParams): Promise<KataArtifact[]>;
  readArtifact(params: KataArtifactReadParams): Promise<KataArtifact | null>;
  writeArtifact(artifact: KataArtifact): Promise<KataArtifact>;
  openPullRequest(params?: KataOpenPullRequestParams): Promise<KataPullRequest>;
  getExecutionStatus(params?: KataExecutionStatusParams): Promise<KataExecutionStatus>;
}
