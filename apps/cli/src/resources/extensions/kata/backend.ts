/**
 * KataBackend — Unified interface for Kata workflow state and artifact I/O.
 *
 * Implemented by LinearBackend (Linear API). The dispatch loop and all
 * consumers call backend methods directly.
 */

import type { KataState, Phase } from "./types.js";

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
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export { createBackend } from "./backend-factory.js";
