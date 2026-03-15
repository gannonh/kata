/**
 * LinearBackend — Linear API-based KataBackend implementation.
 *
 * Delegates state derivation to deriveLinearState, document I/O to
 * the linear-documents module, and git operations to local exec.
 */

import { existsSync, mkdirSync } from "node:fs";
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

import { LinearClient } from "../linear/linear-client.js";
import { deriveLinearState } from "../linear/linear-state.js";
import {
  readKataDocument,
  writeKataDocument,
  listKataDocuments,
} from "../linear/linear-documents.js";
import type { DocumentAttachment } from "../linear/linear-types.js";
import { ensureGitignore } from "./gitignore.js";

// ─── Config ──────────────────────────────────────────────────────────────────

export interface LinearBackendConfig {
  apiKey: string;
  projectId: string;
  teamId: string;
  sliceLabelId: string;
}

// ─── LinearBackend ───────────────────────────────────────────────────────────

export class LinearBackend implements KataBackend {
  readonly basePath: string;
  private client: LinearClient;
  private config: LinearBackendConfig;

  constructor(basePath: string, config: LinearBackendConfig) {
    this.basePath = basePath;
    this.config = config;
    this.client = new LinearClient(config.apiKey);
  }

  // ── State ─────────────────────────────────────────────────────────────

  async deriveState(): Promise<KataState> {
    return deriveLinearState(this.client, {
      projectId: this.config.projectId,
      teamId: this.config.teamId,
      sliceLabelId: this.config.sliceLabelId,
      basePath: this.basePath,
    });
  }

  // ── Document I/O ──────────────────────────────────────────────────────

  private resolveAttachment(scope?: DocumentScope): DocumentAttachment {
    if (scope) return scope;
    return { projectId: this.config.projectId };
  }

  async readDocument(name: string, scope?: DocumentScope): Promise<string | null> {
    const doc = await readKataDocument(
      this.client,
      name,
      this.resolveAttachment(scope),
    );
    return doc?.content ?? null;
  }

  async writeDocument(name: string, content: string, scope?: DocumentScope): Promise<void> {
    await writeKataDocument(
      this.client,
      name,
      content,
      this.resolveAttachment(scope),
    );
  }

  async documentExists(name: string, scope?: DocumentScope): Promise<boolean> {
    const content = await this.readDocument(name, scope);
    return content != null && content.length > 0;
  }

  async listDocuments(scope?: DocumentScope): Promise<string[]> {
    const docs = await listKataDocuments(
      this.client,
      this.resolveAttachment(scope),
    );
    return docs.map((d) => d.title);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async bootstrap(): Promise<void> {
    // Git init if needed
    if (!existsSync(join(this.basePath, ".git"))) {
      execSync("git init", { cwd: this.basePath, stdio: "ignore" });
    }

    ensureGitignore(this.basePath);

    // Ensure .kata/ directory exists
    const kataDir = join(this.basePath, ".kata");
    mkdirSync(kataDir, { recursive: true });
  }

  async checkMilestoneCreated(milestoneId: string): Promise<boolean> {
    const state = await this.deriveState();
    return state.activeMilestone?.id === milestoneId;
  }

  async loadDashboardData(): Promise<DashboardData> {
    const state = await this.deriveState();
    return {
      state,
      sliceProgress: state.progress?.slices ?? null,
      taskProgress: state.progress?.tasks ?? null,
    };
  }

  async preparePrContext(milestoneId: string, sliceId: string): Promise<PrContext> {
    const branch = `kata/${milestoneId}/${sliceId}`;
    execSync(`git branch -f ${branch} HEAD`, { cwd: this.basePath, stdio: "pipe" });
    execSync(`git checkout ${branch}`, { cwd: this.basePath, stdio: "pipe" });
    execSync(`git push -u origin ${branch}`, { cwd: this.basePath, stdio: "pipe" });

    const documents: Record<string, string> = {};
    const plan = await this.readDocument(`${sliceId}-PLAN`);
    if (plan) documents["PLAN"] = plan;
    const summary = await this.readDocument(`${sliceId}-SUMMARY`);
    if (summary) documents["SUMMARY"] = summary;

    return { branch, documents };
  }

  // ── Prompt Builders (stubs) ───────────────────────────────────────────

  async buildPrompt(
    _phase: string,
    _state: KataState,
    _options?: PromptOptions,
  ): Promise<string> {
    throw new Error("LinearBackend.buildPrompt is not yet implemented");
  }

  buildDiscussPrompt(_nextId: string, _preamble: string): string {
    throw new Error("LinearBackend.buildDiscussPrompt is not yet implemented");
  }
}
