/**
 * KataBackend — Unified interface for Kata workflow state and artifact I/O.
 *
 * Two implementations: FileBackend (disk-based .kata/ files) and
 * LinearBackend (Linear API). The dispatch loop and all consumers
 * call backend methods — no isLinearMode() forks.
 */

import type { KataState } from "./types.js";

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

/** Data shape for the dashboard overlay. */
export interface DashboardData {
  state: KataState;
  sliceProgress: { done: number; total: number } | null;
  taskProgress: { done: number; total: number } | null;
}

/** PR preparation result. */
export interface PrContext {
  branch: string;
  documents: Record<string, string>;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface KataBackend {
  readonly basePath: string;

  deriveState(): Promise<KataState>;
  readDocument(name: string, scope?: DocumentScope): Promise<string | null>;
  writeDocument(name: string, content: string, scope?: DocumentScope): Promise<void>;
  documentExists(name: string, scope?: DocumentScope): Promise<boolean>;
  listDocuments(scope?: DocumentScope): Promise<string[]>;

  /** Async — FileBackend reads files to inline, LinearBackend may need API lookups. */
  buildPrompt(phase: string, state: KataState, options?: PromptOptions): Promise<string>;
  buildDiscussPrompt(nextId: string, preamble: string): string;

  bootstrap(): Promise<void>;
  checkMilestoneCreated(milestoneId: string): Promise<boolean>;
  loadDashboardData(): Promise<DashboardData>;
  preparePrContext(milestoneId: string, sliceId: string): Promise<PrContext>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export { createBackend } from "./backend-factory.js";
