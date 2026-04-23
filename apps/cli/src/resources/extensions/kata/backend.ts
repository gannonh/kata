/**
 * KataBackend — Unified interface for Kata workflow state and artifact I/O.
 *
 * Implemented by LinearBackend (Linear API). The dispatch loop and all
 * consumers call backend methods directly.
 */

import type { KataState, Phase } from "./types.js";

export type KataWorkflowPhase = "backlog" | "planning" | "executing" | "verifying" | "done";

/**
 * Canonical backend-neutral issue lifecycle states used by worker orchestration.
 *
 * Includes Kata planning phases (for /kata flows) plus PR lifecycle phases
 * (for Symphony tracker workflows).
 */
export type KataIssueStatePhase =
  | KataWorkflowPhase
  | "todo"
  | "in-progress"
  | "agent-review"
  | "human-review"
  | "merging"
  | "rework"
  | "closed";

export interface KataMilestoneRecord {
  id: string;
  name: string;
  targetDate?: string | null;
  updatedAt?: string | null;
  trackerIssueId?: string;
}

export interface KataIssueRecord {
  id: string;
  identifier: string;
  title: string;
  state: string;
  labels: string[];
  updatedAt?: string | null;
  projectName?: string | null;
  milestoneName?: string | null;
  parentIdentifier?: string | null;
}

export interface KataIssueCommentRecord {
  id: string;
  issueId: string;
  body?: string | null;
  marker?: string | null;
  action?: "created" | "updated";
  createdAt?: string | null;
  updatedAt?: string | null;
  url?: string | null;
}

export interface KataIssueDetailRecord extends KataIssueRecord {
  description?: string | null;
  children: KataIssueRecord[];
  comments: KataIssueCommentRecord[];
}

export interface KataCommentUpsertInput {
  issueId: string;
  body: string;
  marker?: string;
}

export interface KataFollowupIssueInput {
  parentIssueId?: string;
  relationType?: "relates_to" | "blocked_by";
  title: string;
  description: string;
}

export interface KataIssueStateUpdateResult {
  issueId: string;
  identifier?: string;
  phase: KataIssueStatePhase;
  state: string;
  stateId?: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentScope =
  | { projectId: string }
  | { issueId: string };

/** Dispatch-time routing overrides for prompt selection. */
export interface PromptOptions {
  dispatchResearch?: "milestone" | "slice";
  reassessSliceId?: string;
  uatSliceId?: string;
}

/** Backend-specific operation instructions injected into prompt templates. */
export interface OpsBlock {
  /** Hard constraints (e.g. "never use bash for artifacts"). Empty string if none. */
  backendRules: string;
  /** All read/write/advance/commit operations as a single block. */
  backendOps: string;
  /** Must-complete assertion for end of prompt. */
  backendMustComplete: string;
}

/** Slice view for the dashboard overlay. */
export interface DashboardSliceView {
  id: string;
  title: string;
  done: boolean;
  risk: string;
  active: boolean;
  tasks: { id: string; title: string; done: boolean; active: boolean }[];
  taskProgress?: { done: number; total: number };
}

/** Data shape for the dashboard overlay. */
export interface DashboardData {
  state: KataState;
  sliceProgress: { done: number; total: number } | null;
  taskProgress: { done: number; total: number } | null;
  /** Full slice breakdown for rendering. Populated by both backends. */
  sliceViews?: DashboardSliceView[];
}

/** PR preparation result. */
export interface PrContext {
  branch: string;
  documents: Record<string, string>;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface KataBackend {
  /** App/project directory where .kata/ lives. */
  readonly basePath: string;
  /** Git repository root (may differ from basePath in monorepos). */
  readonly gitRoot: string;
  /** Whether this backend uses Linear as the backing store. */
  readonly isLinearMode: boolean;

  deriveState(): Promise<KataState>;
  /** Clear cached state so the next deriveState() fetches fresh data. No-op if not cached. */
  invalidateStateCache?(): void;
  readDocument(name: string, scope?: DocumentScope): Promise<string | null>;
  writeDocument(name: string, content: string, scope?: DocumentScope): Promise<void>;
  documentExists(name: string, scope?: DocumentScope): Promise<boolean>;
  listDocuments(scope?: DocumentScope): Promise<string[]>;

  /**
   * Check if a slice has been planned (i.e. has task sub-issues).
   * Returns true if the slice issue has at least one child sub-issue.
   */
  isSlicePlanned?(milestoneId: string, sliceId: string): Promise<boolean>;

  /**
   * Resolve a slice's document scope (for Linear: { issueId }, for file: undefined).
   * Used to correctly scope readDocument calls for slice-level docs (S##-PLAN, etc.).
   */
  resolveSliceScope?(milestoneId: string, sliceId: string): Promise<DocumentScope | undefined>;

  /** Async — LinearBackend may need API lookups to inline context. */
  buildPrompt(phase: Phase, state: KataState, options?: PromptOptions): Promise<string>;
  buildDiscussPrompt(nextId: string, preamble: string): string;

  bootstrap(): Promise<void>;
  checkMilestoneCreated(milestoneId: string): Promise<boolean>;
  loadDashboardData(): Promise<DashboardData>;
  preparePrContext(milestoneId: string, sliceId: string): Promise<PrContext>;
  createMilestone(input: {
    kataId: string;
    title: string;
    description?: string;
    targetDate?: string;
  }): Promise<KataMilestoneRecord>;
  createSlice(input: {
    kataId: string;
    title: string;
    description?: string;
    milestoneId?: string;
    initialPhase?: KataWorkflowPhase;
  }): Promise<KataIssueRecord>;
  createTask(input: {
    kataId: string;
    title: string;
    sliceIssueId: string;
    description?: string;
    initialPhase?: KataWorkflowPhase;
  }): Promise<KataIssueRecord>;
  listMilestones(): Promise<KataMilestoneRecord[]>;
  listSlices(input?: { milestoneId?: string }): Promise<KataIssueRecord[]>;
  listTasks(sliceIssueId: string): Promise<KataIssueRecord[]>;
  /** Tool layer defaults includeChildren/includeComments to true when omitted. */
  getIssue(issueId: string, opts?: { includeChildren?: boolean; includeComments?: boolean }): Promise<KataIssueDetailRecord | null>;
  upsertComment(input: KataCommentUpsertInput): Promise<KataIssueCommentRecord>;
  createFollowupIssue(input: KataFollowupIssueInput): Promise<KataIssueRecord>;
  updateIssueState(issueId: string, phase: KataIssueStatePhase, teamId?: string): Promise<KataIssueStateUpdateResult>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export { createBackend } from "./backend-factory.js";
