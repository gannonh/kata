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
  backend: KataBackendKind;
  workspacePath: string;
  repository?: {
    owner: string;
    name: string;
  };
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
  status: "todo" | "in_progress" | "done";
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

export interface KataBackendAdapter {
  getProjectContext(): Promise<KataProjectContext>;
  getActiveMilestone(): Promise<KataMilestone | null>;
  listSlices(input: { milestoneId: string }): Promise<KataSlice[]>;
  listTasks(input: { sliceId: string }): Promise<KataTask[]>;
  listArtifacts(input: { scopeType: KataScopeType; scopeId: string }): Promise<KataArtifact[]>;
  readArtifact(input: {
    scopeType: KataScopeType;
    scopeId: string;
    artifactType: KataArtifactType;
  }): Promise<KataArtifact | null>;
  writeArtifact(input: KataArtifactWriteInput): Promise<KataArtifact>;
  openPullRequest(input: {
    title: string;
    body: string;
    base: string;
    head: string;
  }): Promise<KataPullRequest>;
  getExecutionStatus(): Promise<KataExecutionStatus>;
}
