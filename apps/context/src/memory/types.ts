/**
 * Memory subsystem type definitions and error codes.
 *
 * Slice: S03 — Persistent Memory + Git Audit
 */

export type MemoryCategory =
  | "decision"
  | "pattern"
  | "learning"
  | "architecture"
  | "infrastructure"
  | "design"
  | "general"
  | (string & {});

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  tags: string[];
  createdAt: string;
  sourceRefs: string[];
  content: string;
}

export interface RememberOptions {
  content: string;
  category: MemoryCategory;
  tags: string[];
  sourceRefs?: string[];
}

export interface MemoryFilter {
  category?: string;
  tag?: string;
}

export interface ConsolidateOptions {
  memoryIds: string[];
  mergedContent: string;
  category: MemoryCategory;
  tags: string[];
  sourceRefs?: string[];
}

export interface MemoryOperationResult {
  id: string;
  filePath: string;
  gitCommitSha: string | null;
}

export const MEMORY_ERROR_CODES = {
  MEMORY_GIT_NOT_REPO: "MEMORY_GIT_NOT_REPO",
  MEMORY_GIT_COMMIT_FAILED: "MEMORY_GIT_COMMIT_FAILED",
  MEMORY_FILE_NOT_FOUND: "MEMORY_FILE_NOT_FOUND",
  MEMORY_RECALL_EMPTY: "MEMORY_RECALL_EMPTY",
  MEMORY_RECALL_MISSING_KEY: "MEMORY_RECALL_MISSING_KEY",
  MEMORY_CONSOLIDATE_TOO_FEW: "MEMORY_CONSOLIDATE_TOO_FEW",
} as const;

export class MemoryError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MemoryError";
    this.code = code;
  }
}
