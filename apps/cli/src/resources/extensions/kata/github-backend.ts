import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type {
  DashboardData,
  DocumentScope,
  KataBackend,
  OpsBlock,
  PrContext,
  PromptOptions,
} from "./backend.js";
import type { GithubStateMode } from "./github-config.js";
import { deriveGithubState, type GithubIssueSummary, type GithubStateClient } from "./github-state.js";
import type { KataState, Phase } from "./types.js";
import { ensureGitignore } from "./gitignore.js";
import { ensureGitRepo, resolveGitRoot } from "./git-utils.js";
import { getCurrentBranch } from "./worktree.js";
import { loadPrompt } from "./prompt-loader.js";
import { parsePlan, parseRoadmap } from "./files.js";
import {
  listEmbeddedDocuments,
  maybeParseGithubArtifactMetadata,
  parseGithubKataTitle,
  parseGithubArtifactMetadata,
  readEmbeddedDocument,
  serializeGithubArtifactMetadata,
  stripEmbeddedDocuments,
  stripGithubArtifactMetadata,
  upsertEmbeddedDocument,
  upsertGithubArtifactMetadata,
  type GithubArtifactKind,
  type GithubArtifactMetadataV1,
} from "./github-artifacts.js";

export interface GithubBackendConfig {
  token: string;
  repoOwner: string;
  repoName: string;
  stateMode: GithubStateMode;
  labelPrefix: string;
  apiBaseUrl?: string;
}

interface GithubApiIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: Array<{ name: string }>;
  body?: string | null;
  pull_request?: unknown;
}

interface GithubIssueMutation {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
}

export interface GithubBackendClient extends GithubStateClient {
  getIssue(number: number): Promise<GithubIssueSummary | null>;
  createIssue(payload: { title: string; body?: string; labels?: string[] }): Promise<GithubIssueSummary>;
  updateIssue(number: number, payload: GithubIssueMutation): Promise<GithubIssueSummary>;
}

class GithubApiClient implements GithubBackendClient {
  constructor(private readonly config: GithubBackendConfig) {}

  private get apiBaseUrl(): string {
    return this.config.apiBaseUrl ?? "https://api.github.com";
  }

  private get timeoutMs(): number {
    const configuredTimeoutMs = Number(process.env.KATA_GITHUB_API_TIMEOUT_MS ?? "15000");
    if (!Number.isFinite(configuredTimeoutMs) || configuredTimeoutMs <= 0) return 15000;
    return configuredTimeoutMs;
  }

  private async request<T>(
    pathname: string,
    options: {
      method?: "GET" | "POST" | "PATCH";
      query?: Record<string, string>;
      body?: Record<string, unknown>;
    } = {},
  ): Promise<T> {
    const url = new URL(pathname, this.apiBaseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "kata-cli-github-backend",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(
          `GitHub API request timed out after ${this.timeoutMs}ms for ${this.config.repoOwner}/${this.config.repoName}`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GitHub API request failed (${response.status}) for ${this.config.repoOwner}/${this.config.repoName}: ${body || response.statusText}`,
      );
    }

    const text = await response.text();
    if (!text.trim()) return {} as T;
    return JSON.parse(text) as T;
  }

  private toSummary(issue: GithubApiIssue): GithubIssueSummary {
    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      labels: issue.labels.map((label) => label.name),
      body: issue.body,
    };
  }

  async listIssues(): Promise<GithubIssueSummary[]> {
    const issues: GithubIssueSummary[] = [];

    for (let page = 1; ; page++) {
      const pageIssues = await this.request<GithubApiIssue[]>(
        `/repos/${this.config.repoOwner}/${this.config.repoName}/issues`,
        {
          query: {
            state: "all",
            per_page: "100",
            page: String(page),
          },
        },
      );

      const filtered = pageIssues.filter((issue) => issue.pull_request === undefined);
      issues.push(...filtered.map((issue) => this.toSummary(issue)));

      if (pageIssues.length < 100) break;
    }

    return issues;
  }

  async getIssue(number: number): Promise<GithubIssueSummary | null> {
    try {
      const issue = await this.request<GithubApiIssue>(
        `/repos/${this.config.repoOwner}/${this.config.repoName}/issues/${number}`,
      );
      if (issue.pull_request !== undefined) return null;
      return this.toSummary(issue);
    } catch (error) {
      if (error instanceof Error && error.message.includes("(404)")) {
        return null;
      }
      throw error;
    }
  }

  async createIssue(payload: {
    title: string;
    body?: string;
    labels?: string[];
  }): Promise<GithubIssueSummary> {
    const issue = await this.request<GithubApiIssue>(
      `/repos/${this.config.repoOwner}/${this.config.repoName}/issues`,
      {
        method: "POST",
        body: {
          title: payload.title,
          body: payload.body ?? "",
          ...(payload.labels ? { labels: payload.labels } : {}),
        },
      },
    );

    return this.toSummary(issue);
  }

  async updateIssue(number: number, payload: GithubIssueMutation): Promise<GithubIssueSummary> {
    const issue = await this.request<GithubApiIssue>(
      `/repos/${this.config.repoOwner}/${this.config.repoName}/issues/${number}`,
      {
        method: "PATCH",
        body: payload,
      },
    );

    return this.toSummary(issue);
  }
}

const SUPPORTED_PHASES: Phase[] = ["pre-planning", "planning"];

function emitPlanningSignal(event: string, details: Record<string, unknown>): void {
  process.stderr.write(
    `[kata][github-planning] ${JSON.stringify({ event, ...details })}\n`,
  );
}

interface ParsedDocumentName {
  normalized: string;
  kind: "milestone" | "slice" | "task" | "project";
  kataId?: string;
}

function parseDocumentName(name: string): ParsedDocumentName {
  const normalized = name.trim().toUpperCase();

  const milestone = normalized.match(/^(M\d{3})-[A-Z0-9-]+$/);
  if (milestone) {
    return { normalized, kind: "milestone", kataId: milestone[1] };
  }

  const slice = normalized.match(/^(S\d{2})-[A-Z0-9-]+$/);
  if (slice) {
    return { normalized, kind: "slice", kataId: slice[1] };
  }

  const task = normalized.match(/^(T\d{2})-[A-Z0-9-]+$/);
  if (task) {
    return { normalized, kind: "task", kataId: task[1] };
  }

  return { normalized, kind: "project" };
}

function defaultIssueTitle(kind: GithubArtifactKind, kataId: string): string {
  switch (kind) {
    case "milestone":
      return `[${kataId}] Milestone ${kataId}`;
    case "slice":
      return `[${kataId}] Slice ${kataId}`;
    case "task":
      return `[${kataId}] Task ${kataId}`;
    case "document":
      return `KATA-DOC: ${kataId}`;
    default:
      return kataId;
  }
}

function issueNumberFromScope(scope: DocumentScope | undefined): number | undefined {
  if (!scope || !("issueId" in scope)) return undefined;
  const parsed = Number.parseInt(scope.issueId, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function primaryLabel(prefix: string, kind: GithubArtifactKind): string {
  const sanitizedPrefix = prefix.endsWith(":") ? prefix : `${prefix}:`;
  switch (kind) {
    case "milestone":
      return `${sanitizedPrefix}milestone`;
    case "slice":
      return `${sanitizedPrefix}slice`;
    case "task":
      return `${sanitizedPrefix}task`;
    case "document":
      return `${sanitizedPrefix}artifact`;
    default:
      return `${sanitizedPrefix}artifact`;
  }
}

function ensureMetadataDocumentTitle(
  metadata: GithubArtifactMetadataV1,
  documentName: string,
): GithubArtifactMetadataV1 {
  const existing = metadata.documentTitles ?? [];
  const titles = [...new Set([...existing, documentName.trim().toUpperCase()])].sort();
  return {
    ...metadata,
    documentTitles: titles,
  };
}

function bodyFallbackDocumentName(metadata: GithubArtifactMetadataV1): string | null {
  if (metadata.kind === "milestone") return `${metadata.kataId}-ROADMAP`;
  if (metadata.kind === "slice") return `${metadata.kataId}-PLAN`;
  if (metadata.kind === "task") return `${metadata.kataId}-PLAN`;
  return null;
}

function inferMetadataFromIssue(issue: GithubIssueSummary): GithubArtifactMetadataV1 | null {
  const fromBody = maybeParseGithubArtifactMetadata(issue.body ?? "");
  if (fromBody) return fromBody;

  const parsedTitle = parseGithubKataTitle(issue.title);
  if (!parsedTitle) return null;

  if (parsedTitle.kataId.startsWith("M")) {
    return {
      schema: "kata/github-artifact/v1",
      kind: "milestone",
      kataId: parsedTitle.kataId,
    };
  }
  if (parsedTitle.kataId.startsWith("S")) {
    return {
      schema: "kata/github-artifact/v1",
      kind: "slice",
      kataId: parsedTitle.kataId,
    };
  }
  if (parsedTitle.kataId.startsWith("T")) {
    return {
      schema: "kata/github-artifact/v1",
      kind: "task",
      kataId: parsedTitle.kataId,
    };
  }

  return null;
}

export class GithubBackend implements KataBackend {
  readonly basePath: string;
  readonly gitRoot: string;
  readonly isLinearMode = false;

  private readonly config: GithubBackendConfig;
  private readonly client: GithubBackendClient;
  private stateCache: { state: KataState; timestamp: number } | null = null;
  private issueListCache: GithubIssueSummary[] | null = null;
  private static readonly STATE_CACHE_TTL_MS = 10_000;

  constructor(
    basePath: string,
    config: GithubBackendConfig,
    client?: GithubBackendClient,
  ) {
    this.basePath = basePath;
    this.gitRoot = resolveGitRoot(basePath);
    this.config = config;
    this.client = client ?? new GithubApiClient(config);
  }

  async deriveState(): Promise<KataState> {
    if (
      this.stateCache &&
      Date.now() - this.stateCache.timestamp < GithubBackend.STATE_CACHE_TTL_MS
    ) {
      return this.stateCache.state;
    }

    const state = await deriveGithubState(this.client, {
      repoOwner: this.config.repoOwner,
      repoName: this.config.repoName,
      stateMode: this.config.stateMode,
      labelPrefix: this.config.labelPrefix,
      basePath: this.basePath,
    });

    this.stateCache = { state, timestamp: Date.now() };
    return state;
  }

  invalidateStateCache(): void {
    this.stateCache = null;
  }

  private upsertIssueCache(issue: GithubIssueSummary): void {
    if (!this.issueListCache) return;
    const index = this.issueListCache.findIndex((candidate) => candidate.number === issue.number);
    if (index >= 0) {
      this.issueListCache[index] = issue;
      return;
    }
    this.issueListCache.push(issue);
    this.issueListCache.sort((a, b) => a.number - b.number);
  }

  private async createIssue(payload: {
    title: string;
    body?: string;
    labels?: string[];
  }): Promise<GithubIssueSummary> {
    const created = await this.client.createIssue(payload);
    this.upsertIssueCache(created);
    return created;
  }

  private async updateIssue(
    number: number,
    payload: GithubIssueMutation,
  ): Promise<GithubIssueSummary> {
    const updated = await this.client.updateIssue(number, payload);
    this.upsertIssueCache(updated);
    return updated;
  }

  private async listIssues(): Promise<GithubIssueSummary[]> {
    if (this.issueListCache) return this.issueListCache;
    const issues = await this.client.listIssues();
    this.issueListCache = issues.slice().sort((a, b) => a.number - b.number);
    return this.issueListCache;
  }

  private async findIssueByNumber(number: number): Promise<GithubIssueSummary | null> {
    if (this.issueListCache) {
      const cached = this.issueListCache.find((candidate) => candidate.number === number);
      if (cached) return cached;
    }

    const issue = await this.client.getIssue(number);
    if (issue) this.upsertIssueCache(issue);
    return issue;
  }

  private async findIssueByDocumentTitle(documentTitle: string): Promise<GithubIssueSummary | null> {
    const normalizedTitle = `KATA-DOC: ${documentTitle.trim().toUpperCase()}`;
    const issues = await this.listIssues();
    return issues.find((issue) => issue.title.trim().toUpperCase() === normalizedTitle) ?? null;
  }

  private async findIssueByKataId(
    kataId: string,
    kind: GithubArtifactKind,
    opts: { milestoneId?: string; sliceId?: string } = {},
  ): Promise<GithubIssueSummary | null> {
    const normalizedKataId = kataId.trim().toUpperCase();
    const normalizedMilestoneId = opts.milestoneId?.trim().toUpperCase();
    const normalizedSliceId = opts.sliceId?.trim().toUpperCase();

    const issues = await this.listIssues();
    const candidates = issues.filter((issue) => {
      const metadata = inferMetadataFromIssue(issue);
      if (metadata?.kataId !== normalizedKataId) return false;
      if (metadata.kind !== kind) return false;
      if (normalizedMilestoneId && metadata.milestoneId !== normalizedMilestoneId) return false;
      if (normalizedSliceId && metadata.sliceId !== normalizedSliceId) return false;
      return true;
    });

    if (candidates.length > 0) {
      return candidates.sort((a, b) => a.number - b.number)[0] ?? null;
    }

    const hasExplicitScope = Boolean(normalizedMilestoneId || normalizedSliceId);
    if (hasExplicitScope) {
      return null;
    }

    const fallback = issues
      .map((issue) => ({ issue, parsed: parseGithubKataTitle(issue.title) }))
      .filter((entry) => entry.parsed?.kataId === normalizedKataId)
      .map((entry) => entry.issue)
      .sort((a, b) => a.number - b.number);

    return fallback[0] ?? null;
  }

  private async ensureIssue(
    metadata: GithubArtifactMetadataV1,
    options: {
      title?: string;
      labels?: string[];
      body?: string;
      preferredIssueNumber?: number;
    } = {},
  ): Promise<GithubIssueSummary> {
    if (options.preferredIssueNumber) {
      const scoped = await this.findIssueByNumber(options.preferredIssueNumber);
      if (scoped) {
        return scoped;
      }
    }

    let issue: GithubIssueSummary | null = null;
    if (metadata.kind === "document") {
      issue = await this.findIssueByDocumentTitle(metadata.kataId);
    } else {
      issue = await this.findIssueByKataId(metadata.kataId, metadata.kind, {
        milestoneId: metadata.milestoneId,
        sliceId: metadata.sliceId,
      });
    }

    if (issue) return issue;

    const created = await this.createIssue({
      title: options.title ?? defaultIssueTitle(metadata.kind, metadata.kataId),
      body: options.body ?? serializeGithubArtifactMetadata(metadata),
      labels: options.labels,
    });

    emitPlanningSignal("github_planning_artifact_upsert", {
      stage: "create",
      entity: metadata.kind,
      kataId: metadata.kataId,
      issueNumber: created.number,
    });

    return created;
  }

  private buildMetadataForDocument(
    document: ParsedDocumentName,
    _scope?: DocumentScope,
  ): GithubArtifactMetadataV1 {
    if (document.kind === "milestone") {
      return {
        schema: "kata/github-artifact/v1",
        kind: "milestone",
        kataId: document.kataId ?? "M000",
      };
    }

    if (document.kind === "slice") {
      return {
        schema: "kata/github-artifact/v1",
        kind: "slice",
        kataId: document.kataId ?? "S00",
      };
    }

    if (document.kind === "task") {
      return {
        schema: "kata/github-artifact/v1",
        kind: "task",
        kataId: document.kataId ?? "T00",
      };
    }

    return {
      schema: "kata/github-artifact/v1",
      kind: "document",
      kataId: document.normalized,
    };
  }

  private async readDocumentFromIssue(
    issue: GithubIssueSummary,
    documentName: string,
  ): Promise<string | null> {
    const body = issue.body ?? "";
    const normalizedName = documentName.trim().toUpperCase();

    const embedded = readEmbeddedDocument(body, normalizedName);
    if (embedded !== null) return embedded;

    const metadata = maybeParseGithubArtifactMetadata(body);
    if (!metadata) return null;

    const fallbackName = bodyFallbackDocumentName(metadata);
    if (fallbackName === normalizedName) {
      const raw = stripEmbeddedDocuments(stripGithubArtifactMetadata(body)).trim();
      return raw.length > 0 ? raw : null;
    }

    return null;
  }

  private async materializeRoadmapDependencies(
    milestoneId: string,
    roadmapContent: string,
  ): Promise<void> {
    let roadmap: ReturnType<typeof parseRoadmap>;
    try {
      roadmap = parseRoadmap(roadmapContent);
    } catch (error) {
      emitPlanningSignal("github_planning_roundtrip_mismatch", {
        entity: "dependency",
        stage: "parse-roadmap",
        milestoneId,
        detail: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    for (const slice of roadmap.slices) {
      const metadata: GithubArtifactMetadataV1 = {
        schema: "kata/github-artifact/v1",
        kind: "slice",
        kataId: slice.id,
        milestoneId,
        dependsOn: slice.depends,
      };

      const issue = await this.ensureIssue(metadata, {
        title: `[${slice.id}] ${slice.title}`,
        labels: [primaryLabel(this.config.labelPrefix, "slice")],
      });

      const parsedMetadata = maybeParseGithubArtifactMetadata(issue.body ?? "");
      const merged = ensureMetadataDocumentTitle(
        {
          ...(parsedMetadata ?? metadata),
          milestoneId,
          dependsOn: slice.depends,
        },
        `${slice.id}-PLAN`,
      );

      const updatedBody = upsertGithubArtifactMetadata(issue.body ?? "", merged);
      await this.updateIssue(issue.number, { body: updatedBody, title: `[${slice.id}] ${slice.title}` });

      for (const dependency of slice.depends) {
        emitPlanningSignal("github_planning_dependency_materialized", {
          milestoneId,
          fromSliceId: slice.id,
          dependsOn: dependency,
          issueNumber: issue.number,
        });
      }
    }
  }

  private async materializeSliceTasks(
    sliceId: string,
    sliceIssue: GithubIssueSummary,
    planContent: string,
  ): Promise<void> {
    let plan: ReturnType<typeof parsePlan>;
    try {
      plan = parsePlan(planContent);
    } catch (error) {
      emitPlanningSignal("github_planning_roundtrip_mismatch", {
        entity: "task",
        stage: "parse-slice-plan",
        sliceId,
        detail: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const sliceMetadata = maybeParseGithubArtifactMetadata(sliceIssue.body ?? "");
    const milestoneId = sliceMetadata?.milestoneId;

    for (const task of plan.tasks) {
      const normalizedTaskId = task.id.trim().toUpperCase();

      const taskMetadata: GithubArtifactMetadataV1 = {
        schema: "kata/github-artifact/v1",
        kind: "task",
        kataId: normalizedTaskId,
        sliceId,
        ...(milestoneId ? { milestoneId } : {}),
      };

      const issue = await this.ensureIssue(taskMetadata, {
        title: `[${normalizedTaskId}] ${task.title}`,
        labels: [
          primaryLabel(this.config.labelPrefix, "task"),
          `${this.config.labelPrefix.endsWith(":") ? this.config.labelPrefix : `${this.config.labelPrefix}:`}slice:${sliceId.toLowerCase()}`,
        ],
      });

      const parsedTaskMetadata = maybeParseGithubArtifactMetadata(issue.body ?? "");
      let nextBody = upsertGithubArtifactMetadata(issue.body ?? "", ensureMetadataDocumentTitle({
        ...(parsedTaskMetadata ?? taskMetadata),
        sliceId,
        ...(milestoneId ? { milestoneId } : {}),
      }, `${normalizedTaskId}-PLAN`));

      const generatedTaskPlan = [
        `# ${normalizedTaskId}: ${task.title}`,
        "",
        task.description || `Task generated from ${sliceId}-PLAN.`,
        "",
        "## Must-Haves",
        "- [ ] Implement according to the slice plan.",
        "",
        "## Verification",
        task.verify ? `- ${task.verify}` : "- Add task-specific verification before execution.",
      ].join("\n");

      nextBody = upsertEmbeddedDocument(nextBody, `${normalizedTaskId}-PLAN`, generatedTaskPlan);
      await this.updateIssue(issue.number, {
        body: nextBody,
        title: `[${normalizedTaskId}] ${task.title}`,
      });

      emitPlanningSignal("github_planning_artifact_upsert", {
        stage: "update",
        entity: "task",
        kataId: normalizedTaskId,
        issueNumber: issue.number,
      });
    }
  }

  async readDocument(name: string, scope?: DocumentScope): Promise<string | null> {
    const document = parseDocumentName(name);
    const normalizedName = document.normalized;
    const scopedIssueNumber = issueNumberFromScope(scope);

    let issue: GithubIssueSummary | null = null;

    if (scopedIssueNumber) {
      issue = await this.findIssueByNumber(scopedIssueNumber);
    } else if (document.kind === "project") {
      issue = await this.findIssueByDocumentTitle(normalizedName);
    } else if (document.kataId) {
      issue = await this.findIssueByKataId(document.kataId, document.kind);
    }

    if (!issue) return null;

    return this.readDocumentFromIssue(issue, normalizedName);
  }

  async writeDocument(name: string, content: string, scope?: DocumentScope): Promise<void> {
    const document = parseDocumentName(name);
    const normalizedName = document.normalized;
    const metadataSeed = this.buildMetadataForDocument(document, scope);
    const scopedIssueNumber = issueNumberFromScope(scope);

    const issue = await this.ensureIssue(metadataSeed, {
      preferredIssueNumber: scopedIssueNumber,
      title:
        document.kind === "project"
          ? `KATA-DOC: ${normalizedName}`
          : defaultIssueTitle(metadataSeed.kind, metadataSeed.kataId),
      labels: [primaryLabel(this.config.labelPrefix, metadataSeed.kind)],
    });

    const existingMetadataParse = parseGithubArtifactMetadata(issue.body ?? "");
    if (!existingMetadataParse.ok && existingMetadataParse.error.code !== "missing_metadata") {
      emitPlanningSignal("github_planning_metadata_parse_error", {
        issueNumber: issue.number,
        document: normalizedName,
        code: existingMetadataParse.error.code,
      });
    }

    const existingMetadata = existingMetadataParse.ok
      ? existingMetadataParse.metadata
      : metadataSeed;

    const mergedMetadata = ensureMetadataDocumentTitle(existingMetadata, normalizedName);

    let nextBody = upsertGithubArtifactMetadata(issue.body ?? "", mergedMetadata);
    nextBody = upsertEmbeddedDocument(nextBody, normalizedName, content);

    await this.updateIssue(issue.number, { body: nextBody });

    emitPlanningSignal("github_planning_artifact_upsert", {
      stage: "update",
      entity: mergedMetadata.kind,
      kataId: mergedMetadata.kataId,
      document: normalizedName,
      issueNumber: issue.number,
    });

    const roundTrip = await this.readDocument(normalizedName, { issueId: String(issue.number) });
    if (roundTrip?.trim() !== content.trim()) {
      emitPlanningSignal("github_planning_roundtrip_mismatch", {
        entity: mergedMetadata.kind,
        stage: "readback",
        kataId: mergedMetadata.kataId,
        document: normalizedName,
        issueNumber: issue.number,
      });
    }

    if (document.kind === "milestone" && normalizedName.endsWith("-ROADMAP") && document.kataId) {
      await this.materializeRoadmapDependencies(document.kataId, content);
    }

    if (document.kind === "slice" && normalizedName.endsWith("-PLAN") && document.kataId) {
      const latestIssue = await this.findIssueByNumber(issue.number);
      if (latestIssue) {
        await this.materializeSliceTasks(document.kataId, latestIssue, content);
      }
    }

    this.invalidateStateCache();
  }

  async documentExists(name: string, scope?: DocumentScope): Promise<boolean> {
    const content = await this.readDocument(name, scope);
    return content !== null && content.trim().length > 0;
  }

  async listDocuments(scope?: DocumentScope): Promise<string[]> {
    const scopedIssueNumber = issueNumberFromScope(scope);
    const docs = new Set<string>();

    const collectFromIssue = (issue: GithubIssueSummary): void => {
      const body = issue.body ?? "";
      const metadata = maybeParseGithubArtifactMetadata(body);

      for (const embedded of listEmbeddedDocuments(body)) {
        docs.add(embedded);
      }

      const declared = metadata?.documentTitles ?? [];
      for (const title of declared) {
        docs.add(title.toUpperCase());
      }

      if (metadata) {
        const fallback = bodyFallbackDocumentName(metadata);
        const plainBody = stripEmbeddedDocuments(stripGithubArtifactMetadata(body)).trim();
        if (fallback && plainBody.length > 0) {
          docs.add(fallback.toUpperCase());
        }
      }
    };

    if (scopedIssueNumber) {
      const issue = await this.findIssueByNumber(scopedIssueNumber);
      if (issue) collectFromIssue(issue);
      return [...docs].sort();
    }

    const issues = await this.listIssues();
    for (const issue of issues) {
      collectFromIssue(issue);
    }

    return [...docs].sort();
  }

  async resolveSliceScope(milestoneId: string, sliceId: string): Promise<DocumentScope | undefined> {
    const issue = await this.findIssueByKataId(sliceId, "slice", { milestoneId });
    if (!issue) return undefined;
    return { issueId: String(issue.number) };
  }

  async isSlicePlanned(milestoneId: string, sliceId: string): Promise<boolean> {
    const issues = await this.listIssues();
    const normalizedSliceId = sliceId.trim().toUpperCase();
    const normalizedMilestoneId = milestoneId.trim().toUpperCase();

    return issues.some((issue) => {
      const metadata = inferMetadataFromIssue(issue);
      if (!metadata || metadata.kind !== "task") return false;
      if (metadata.sliceId?.toUpperCase() !== normalizedSliceId) return false;
      if (metadata.milestoneId && metadata.milestoneId.toUpperCase() !== normalizedMilestoneId) {
        return false;
      }
      return true;
    });
  }

  private buildGithubPlanMilestoneOps(mid: string): OpsBlock {
    const backendRules = [
      "Hard rule: In GitHub mode, never use Linear tools (`kata_*`, `linear_*`) to read or write planning artifacts.",
      "Use GitHub issues as the source of truth and include `KATA:GITHUB_ARTIFACT` metadata markers for every milestone/slice/task artifact.",
    ].join("\n");

    const backendOps = [
      "6. Idempotency check:",
      "   - Use GitHub backend list/search operations to find existing `[M###]` and `[S##]` issues before creating anything.",
      `   - If \`${mid}-ROADMAP\` already exists in the milestone issue metadata, update in place instead of creating duplicates.`,
      "7. Upsert milestone roadmap artifact:",
      "   - Ensure a milestone issue exists with stable kata ID in title (`[M###] ...`).",
      "   - Write the roadmap content into GitHub issue metadata as the canonical roadmap artifact.",
      "8. Upsert slice artifacts from roadmap:",
      "   - Ensure every roadmap slice (`[S##]`) exists as a GitHub issue with canonical metadata.",
      "   - Preserve stable Kata IDs and do not create duplicate issues on rerun.",
      "9. Materialize dependencies:",
      "   - For each `depends:[...]` entry in the roadmap, write durable dependency metadata on the dependent slice issue.",
      "   - Emit/read back dependency wiring deterministically before finishing.",
    ].join("\n");

    return {
      backendRules,
      backendOps,
      backendMustComplete:
        `**You MUST persist \`${mid}-ROADMAP\` plus slice dependency metadata with idempotent readback before finishing.**\n\n` +
        "Reference: follow KATA-WORKFLOW.md GitHub-mode artifact conventions.",
    };
  }

  private buildGithubPlanSliceOps(sid: string): OpsBlock {
    const backendRules = [
      "Hard rule: In GitHub mode, do not call Linear tools for planning writes.",
      "Slice and task planning artifacts must be GitHub issue-backed and include `KATA:GITHUB_ARTIFACT` metadata.",
    ].join("\n");

    const backendOps = [
      "10. Idempotency check:",
      `    - Find existing \`[${sid}]\` slice issue and existing task issues (\`[T##]\`) before creating anything.`,
      "    - Re-run planning as update-in-place when artifacts already exist.",
      "11. Upsert slice plan artifact:",
      "    - Persist the canonical slice plan artifact to the slice issue with stable metadata markers.",
      "12. Upsert task artifacts:",
      "    - For each planned task (`T##`), create or update a GitHub issue with task metadata linking to the slice.",
      "    - Ensure reruns update existing task issues rather than creating duplicates.",
      "13. Dependency readback check:",
      "    - Read dependency metadata from the slice issue and confirm each referenced dependency is still resolvable.",
      "    - If dependency readback fails, stop with a concrete mismatch diagnostic.",
    ].join("\n");

    return {
      backendRules,
      backendOps,
      backendMustComplete:
        `**You MUST persist \`${sid}-PLAN\` and all planned task artifacts with stable IDs before finishing.**\n\n` +
        "Reference: follow KATA-WORKFLOW.md GitHub-mode artifact conventions.",
    };
  }

  private async buildPlanMilestonePrompt(state: KataState): Promise<string> {
    const mid = state.activeMilestone?.id ?? "unknown";
    const mTitle = state.activeMilestone?.title ?? "unknown";

    const inlinedContext = [
      "## Context Retrieval (read these before proceeding)",
      "",
      "1. Confirm active milestone from GitHub-backed state.",
      "2. Read required context artifacts if present:",
      `   - ${mid}-CONTEXT`,
      "3. Read optional project artifacts when available:",
      "   - PROJECT",
      "   - REQUIREMENTS",
      "   - DECISIONS",
    ].join("\n");

    const ops = this.buildGithubPlanMilestoneOps(mid);

    return loadPrompt("plan-milestone", {
      milestoneId: mid,
      milestoneTitle: mTitle,
      inlinedContext,
      backendRules: ops.backendRules,
      backendOps: ops.backendOps,
      backendMustComplete: ops.backendMustComplete,
    });
  }

  private async buildPlanSlicePrompt(state: KataState): Promise<string> {
    const mid = state.activeMilestone?.id ?? "unknown";
    const sid = state.activeSlice?.id ?? "unknown";
    const sTitle = state.activeSlice?.title ?? "unknown";

    const dependencySummaries = [
      "- Inspect roadmap `depends:[]` for this slice.",
      "- Read dependency metadata from GitHub slice issues (KATA:GITHUB_ARTIFACT).",
      "- Validate dependency targets still exist before finalizing the slice plan.",
    ].join("\n");

    const inlinedContext = [
      "## Context Retrieval (read these before proceeding)",
      "",
      "1. Confirm active milestone/slice from GitHub-backed state.",
      "2. Read required artifact:",
      `   - ${mid}-ROADMAP`,
      "3. Read optional artifacts when present:",
      `   - ${sid}-RESEARCH`,
      "   - REQUIREMENTS",
      "   - DECISIONS",
    ].join("\n");

    const ops = this.buildGithubPlanSliceOps(sid);

    return loadPrompt("plan-slice", {
      milestoneId: mid,
      sliceId: sid,
      sliceTitle: sTitle,
      inlinedContext,
      dependencySummaries,
      backendRules: ops.backendRules,
      backendOps: ops.backendOps,
      backendMustComplete: ops.backendMustComplete,
    });
  }

  async buildPrompt(
    phase: Phase,
    state: KataState,
    _options?: PromptOptions,
  ): Promise<string> {
    if (phase === "pre-planning") {
      return this.buildPlanMilestonePrompt(state);
    }

    if (phase === "planning") {
      return this.buildPlanSlicePrompt(state);
    }

    if (SUPPORTED_PHASES.includes(phase)) {
      return "";
    }

    throw new Error(
      `GitHub prompt generation for phase "${phase}" is not yet supported beyond planning in S02.`,
    );
  }

  buildDiscussPrompt(nextId: string, preamble: string): string {
    return [
      preamble,
      "",
      `Requested milestone: ${nextId}`,
      "",
      "GitHub mode discussion is enabled.",
      "Persist planning artifacts to GitHub issues with stable Kata IDs and metadata markers.",
    ].join("\n");
  }

  async bootstrap(): Promise<void> {
    ensureGitRepo(this.basePath, this.gitRoot);
    ensureGitignore(this.gitRoot);
    mkdirSync(join(this.basePath, ".kata"), { recursive: true });
  }

  async checkMilestoneCreated(milestoneId: string): Promise<boolean> {
    const issue = await this.findIssueByKataId(milestoneId, "milestone");
    return Boolean(issue);
  }

  async loadDashboardData(): Promise<DashboardData> {
    const state = await this.deriveState();

    const sliceViews = state.activeSlice
      ? [
          {
            id: state.activeSlice.id,
            title: state.activeSlice.title,
            done: false,
            risk: "",
            active: true,
            tasks: state.activeTask
              ? [
                  {
                    id: state.activeTask.id,
                    title: state.activeTask.title,
                    done: false,
                    active: true,
                  },
                ]
              : [],
            taskProgress: state.progress?.tasks,
          },
        ]
      : [];

    return {
      state,
      sliceProgress: state.progress?.slices ?? null,
      taskProgress: state.progress?.tasks ?? null,
      sliceViews,
    };
  }

  async preparePrContext(milestoneId: string, sliceId: string): Promise<PrContext> {
    const scope = await this.resolveSliceScope(milestoneId, sliceId);
    const plan = scope ? await this.readDocument(`${sliceId}-PLAN`, scope) : null;
    const summary = scope ? await this.readDocument(`${sliceId}-SUMMARY`, scope) : null;

    return {
      branch: getCurrentBranch(this.basePath),
      documents: {
        ...(plan ? { PLAN: plan } : {}),
        ...(summary ? { SUMMARY: summary } : {}),
      },
    };
  }
}
