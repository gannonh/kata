/**
 * FileBackend — disk-based KataBackend implementation.
 *
 * Reads/writes .kata/ directory structure. State derivation delegates
 * to deriveState(basePath), document I/O resolves names to file paths
 * via the paths module.
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

import type {
  KataBackend,
  DocumentScope,
  PromptOptions,
  DashboardData,
  PrContext,
} from "./backend.js";
import type { KataState } from "./types.js";

import { deriveState } from "./state.js";
import { loadFile } from "./files.js";
import {
  kataRoot,
  milestonesDir,
  resolveKataRootFile,
  resolveMilestoneFile,
  resolveMilestonePath,
  resolveSliceFile,
  resolveTaskFile,
  resolveTasksDir,
  resolveTaskFiles,
  type KataRootFileKey,
} from "./paths.js";
import { ensureGitignore, ensurePreferences } from "./gitignore.js";

// ─── Document name parsing ────────────────────────────────────────────────

const ROOT_DOC_NAMES = new Set<string>([
  "PROJECT",
  "DECISIONS",
  "REQUIREMENTS",
  "QUEUE",
  "STATE",
]);

interface ParsedDocName {
  kind: "root" | "milestone" | "slice" | "task";
  prefix?: string; // M001, S01, T01
  docType: string; // ROADMAP, CONTEXT, PLAN, SUMMARY, etc.
}

function parseDocName(name: string): ParsedDocName {
  // Root docs: PROJECT, DECISIONS, REQUIREMENTS
  if (ROOT_DOC_NAMES.has(name)) {
    return { kind: "root", docType: name };
  }

  // Milestone docs: M001-ROADMAP, M001-CONTEXT
  const milestoneMatch = name.match(/^(M\d+)-(.+)$/);
  if (milestoneMatch) {
    return { kind: "milestone", prefix: milestoneMatch[1], docType: milestoneMatch[2] };
  }

  // Slice docs: S01-PLAN, S01-SUMMARY
  const sliceMatch = name.match(/^(S\d+)-(.+)$/);
  if (sliceMatch) {
    return { kind: "slice", prefix: sliceMatch[1], docType: sliceMatch[2] };
  }

  // Task docs: T01-PLAN, T01-SUMMARY
  const taskMatch = name.match(/^(T\d+)-(.+)$/);
  if (taskMatch) {
    return { kind: "task", prefix: taskMatch[1], docType: taskMatch[2] };
  }

  // Fallback: treat as root doc type
  return { kind: "root", docType: name };
}

// ─── FileBackend ──────────────────────────────────────────────────────────

export class FileBackend implements KataBackend {
  readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  // ── State ─────────────────────────────────────────────────────────────

  async deriveState(): Promise<KataState> {
    return deriveState(this.basePath);
  }

  // ── Document I/O ──────────────────────────────────────────────────────

  async readDocument(name: string, _scope?: DocumentScope): Promise<string | null> {
    const parsed = parseDocName(name);

    switch (parsed.kind) {
      case "root": {
        const absPath = resolveKataRootFile(this.basePath, parsed.docType as KataRootFileKey);
        return loadFile(absPath);
      }

      case "milestone": {
        const absPath = resolveMilestoneFile(this.basePath, parsed.prefix!, parsed.docType);
        if (!absPath) return null;
        return loadFile(absPath);
      }

      case "slice": {
        // Slice docs need milestone context to resolve the path.
        const state = await this.deriveState();
        const mid = state.activeMilestone?.id;
        if (!mid) return null;
        const absPath = resolveSliceFile(this.basePath, mid, parsed.prefix!, parsed.docType);
        if (!absPath) return null;
        return loadFile(absPath);
      }

      case "task": {
        // Task docs need milestone + slice context.
        const state = await this.deriveState();
        const mid = state.activeMilestone?.id;
        const sid = state.activeSlice?.id;
        if (!mid || !sid) return null;
        const absPath = resolveTaskFile(this.basePath, mid, sid, parsed.prefix!, parsed.docType);
        if (!absPath) return null;
        return loadFile(absPath);
      }

      default:
        return null;
    }
  }

  async writeDocument(_name: string, _content: string, _scope?: DocumentScope): Promise<void> {
    throw new Error("FileBackend.writeDocument is not yet implemented");
  }

  async documentExists(name: string, scope?: DocumentScope): Promise<boolean> {
    const content = await this.readDocument(name, scope);
    return content != null && content.length > 0;
  }

  async listDocuments(_scope?: DocumentScope): Promise<string[]> {
    const state = await this.deriveState();
    const mid = state.activeMilestone?.id;
    if (!mid) return [];

    const mDir = resolveMilestonePath(this.basePath, mid);
    if (!mDir) return [];

    try {
      return readdirSync(mDir)
        .filter((f) => f.endsWith(".md"))
        .sort();
    } catch {
      return [];
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async bootstrap(): Promise<void> {
    const root = kataRoot(this.basePath);
    const msDir = milestonesDir(this.basePath);

    // Git init if needed
    if (!existsSync(join(this.basePath, ".git"))) {
      execSync("git init", { cwd: this.basePath, stdio: "ignore" });
    }

    // Ensure directory structure
    mkdirSync(msDir, { recursive: true });

    // Ensure gitignore and preferences
    ensureGitignore(this.basePath);
    ensurePreferences(this.basePath);

    // Initial commit if no commits exist
    try {
      execSync("git rev-parse HEAD", { cwd: this.basePath, stdio: "ignore" });
    } catch {
      // No commits yet — stage and commit
      execSync("git add -A", { cwd: this.basePath, stdio: "ignore" });
      execSync('git commit -m "kata: bootstrap project" --allow-empty', {
        cwd: this.basePath,
        stdio: "ignore",
      });
    }
  }

  async checkMilestoneCreated(milestoneId: string): Promise<boolean> {
    const contextPath = resolveMilestoneFile(this.basePath, milestoneId, "CONTEXT");
    return contextPath != null;
  }

  // ── Stubs ─────────────────────────────────────────────────────────────

  async buildPrompt(_phase: string, _state: KataState, _options?: PromptOptions): Promise<string> {
    throw new Error("FileBackend.buildPrompt is not yet implemented");
  }

  buildDiscussPrompt(_nextId: string, _preamble: string): string {
    throw new Error("FileBackend.buildDiscussPrompt is not yet implemented");
  }

  async loadDashboardData(): Promise<DashboardData> {
    throw new Error("FileBackend.loadDashboardData is not yet implemented");
  }

  async preparePrContext(_milestoneId: string, _sliceId: string): Promise<PrContext> {
    throw new Error("FileBackend.preparePrContext is not yet implemented");
  }
}
