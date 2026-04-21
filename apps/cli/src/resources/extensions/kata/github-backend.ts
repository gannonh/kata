import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type {
  DashboardData,
  DocumentScope,
  KataBackend,
  KataIssueRecord,
  KataIssueDetailRecord,
  KataIssueCommentRecord,
  KataCommentUpsertInput,
  KataFollowupIssueInput,
  KataIssueStateUpdateResult,
  KataMilestoneRecord,
  KataWorkflowPhase,
  KataIssueStatePhase,
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
  githubProjectNumber?: number;
  apiBaseUrl?: string;
}

interface GithubApiIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: Array<{ name: string }>;
  body?: string | null;
  updated_at?: string | null;
  pull_request?: unknown;
}

interface GithubIssueMutation {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
}

interface GithubIssueComment {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GithubBackendClient extends GithubStateClient {
  getIssue(number: number): Promise<GithubIssueSummary | null>;
  createIssue(payload: { title: string; body?: string; labels?: string[] }): Promise<GithubIssueSummary>;
  updateIssue(number: number, payload: GithubIssueMutation): Promise<GithubIssueSummary>;
  listSubIssueNumbers(parentIssueNumber: number): Promise<number[]>;
  addSubIssue(parentIssueNumber: number, subIssueNumber: number): Promise<void>;
  listIssueComments(issueNumber: number): Promise<GithubIssueComment[]>;
  createIssueComment(issueNumber: number, body: string): Promise<GithubIssueComment>;
  updateIssueComment(commentId: number, body: string): Promise<GithubIssueComment>;
  updateProjectV2ItemStatus(issueNumber: number, stateName: string): Promise<string>;
}

class GithubApiClient implements GithubBackendClient {
  private repositoryIdCache: string | null = null;
  private readonly labelIdCache = new Map<string, string>();

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

  private async graphqlRequest<TData>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<TData> {
    const payload = await this.request<{ data?: TData; errors?: Array<{ message?: string }> }>(
      "/graphql",
      {
        method: "POST",
        body: {
          query,
          variables,
        },
      },
    );

    if (payload.errors && payload.errors.length > 0) {
      const message = payload.errors
        .map((entry) => entry.message)
        .filter((msg): msg is string => Boolean(msg && msg.trim()))
        .join("; ");
      throw new Error(
        `GitHub GraphQL request failed for ${this.config.repoOwner}/${this.config.repoName}: ${message || "unknown error"}`,
      );
    }

    if (!payload.data) {
      throw new Error(
        `GitHub GraphQL request returned no data for ${this.config.repoOwner}/${this.config.repoName}`,
      );
    }

    return payload.data;
  }

  // ── Projects v2 support ──────────────────────────────────────────────────

  private projectV2StatusFieldCache: {
    projectId: string;
    fieldId: string;
    options: Array<{ id: string; name: string }>;
  } | null = null;

  async resolveProjectV2StatusField(): Promise<{
    projectId: string;
    fieldId: string;
    options: Array<{ id: string; name: string }>;
  }> {
    if (this.projectV2StatusFieldCache) return this.projectV2StatusFieldCache;

    const projectNumber = this.config.githubProjectNumber;
    if (!projectNumber) {
      throw new Error("Projects v2 status field resolution requires githubProjectNumber in config");
    }

    const data = await this.graphqlRequest<{
      repository: {
        owner:
          | {
              __typename: "User";
              login: string;
              projectV2: {
                id: string;
                field: { id?: string; options?: Array<{ id: string; name: string }> } | null;
              } | null;
            }
          | {
              __typename: "Organization";
              login: string;
              projectV2: {
                id: string;
                field: { id?: string; options?: Array<{ id: string; name: string }> } | null;
              } | null;
            }
          | null;
      } | null;
    }>(
      `query($projectNumber: Int!, $owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          owner {
            __typename
            login
            ... on User {
              projectV2(number: $projectNumber) {
                id
                field(name: "Status") {
                  ... on ProjectV2SingleSelectField {
                    id
                    options { id name }
                  }
                }
              }
            }
            ... on Organization {
              projectV2(number: $projectNumber) {
                id
                field(name: "Status") {
                  ... on ProjectV2SingleSelectField {
                    id
                    options { id name }
                  }
                }
              }
            }
          }
        }
      }`,
      { projectNumber, owner: this.config.repoOwner, repo: this.config.repoName },
    );

    const project = data.repository?.owner?.projectV2;
    if (!project) {
      throw new Error(`GitHub Project #${projectNumber} not found for owner ${this.config.repoOwner}`);
    }
    if (!project.field?.id || !project.field.options?.length) {
      throw new Error(
        `Status field is not a single-select on GitHub Project #${projectNumber}`,
      );
    }

    this.projectV2StatusFieldCache = {
      projectId: project.id,
      fieldId: project.field.id,
      options: project.field.options,
    };
    return this.projectV2StatusFieldCache;
  }

  async findProjectV2ItemId(issueNumber: number): Promise<string | null> {
    const statusField = await this.resolveProjectV2StatusField();
    let after: string | null = null;

    for (;;) {
      const payload: {
        node: {
          items: {
            nodes: Array<{ id: string; content: { number?: number } | null }>;
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        } | null;
      } = await this.graphqlRequest(
        `query($projectId: ID!, $first: Int!, $after: String) {
          node(id: $projectId) {
            ... on ProjectV2 {
              items(first: $first, after: $after) {
                nodes {
                  id
                  content { ... on Issue { number } }
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }`,
        { projectId: statusField.projectId, first: 100, after },
      );

      const items = payload.node?.items;
      if (!items) break;

      for (const item of items.nodes) {
        if (item.content?.number === issueNumber) return item.id;
      }

      if (items.pageInfo.hasNextPage && items.pageInfo.endCursor) {
        after = items.pageInfo.endCursor;
      } else {
        break;
      }
    }

    return null;
  }

  async updateProjectV2ItemStatus(issueNumber: number, stateName: string): Promise<string> {
    const statusField = await this.resolveProjectV2StatusField();
    if (!statusField.options.length) {
      throw new Error(
        `Status field is not a single-select on GitHub Project #${this.config.githubProjectNumber}`,
      );
    }

    const normalizedTarget = stateName.trim().toLowerCase().replace(/[_-]+/g, " ");
    const option = statusField.options.find(
      (opt) => opt.name.trim().toLowerCase().replace(/[_-]+/g, " ") === normalizedTarget,
    );
    if (!option) {
      const available = statusField.options.map((opt) => opt.name).join(", ");
      throw new Error(
        `Projects v2 status option '${stateName}' not found; available: [${available}]`,
      );
    }

    const itemId = await this.findProjectV2ItemId(issueNumber);
    if (!itemId) {
      throw new Error(
        `Issue #${issueNumber} is not on GitHub Project #${this.config.githubProjectNumber}`,
      );
    }

    await this.graphqlRequest<{
      updateProjectV2ItemFieldValue: { projectV2Item: { id: string } } | null;
    }>(
      `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $singleSelectOptionId: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $singleSelectOptionId }
          }
        ) {
          projectV2Item { id }
        }
      }`,
      {
        projectId: statusField.projectId,
        itemId,
        fieldId: statusField.fieldId,
        singleSelectOptionId: option.id,
      },
    );

    return option.name;
  }

  private toSummary(issue: GithubApiIssue): GithubIssueSummary {
    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      labels: issue.labels.map((label) => label.name),
      body: issue.body,
      updatedAt: issue.updated_at ?? null,
    };
  }

  private async getRepositoryId(): Promise<string> {
    if (this.repositoryIdCache) return this.repositoryIdCache;

    const data = await this.graphqlRequest<{
      repository: { id: string } | null;
    }>(
      `query RepositoryId($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
        }
      }`,
      {
        owner: this.config.repoOwner,
        repo: this.config.repoName,
      },
    );

    const repositoryId = data.repository?.id;
    if (!repositoryId) {
      throw new Error(
        `Unable to resolve repository id for ${this.config.repoOwner}/${this.config.repoName}`,
      );
    }

    this.repositoryIdCache = repositoryId;
    return repositoryId;
  }

  private async resolveIssueNodeId(number: number): Promise<string> {
    const data = await this.graphqlRequest<{
      repository: { issue: { id: string } | null } | null;
    }>(
      `query IssueNodeId($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            id
          }
        }
      }`,
      {
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        number,
      },
    );

    const issueId = data.repository?.issue?.id;
    if (!issueId) {
      throw new Error(
        `Unable to resolve issue node id for #${number} in ${this.config.repoOwner}/${this.config.repoName}`,
      );
    }

    return issueId;
  }

  private async ensureLabelId(labelName: string): Promise<string> {
    const normalized = labelName.trim();
    if (!normalized) {
      throw new Error("GitHub label names must be non-empty");
    }

    const cached = this.labelIdCache.get(normalized.toLowerCase());
    if (cached) return cached;

    const repositoryId = await this.getRepositoryId();
    const safeAlias = `label_${this.labelIdCache.size + 1}`;
    const queryData = await this.graphqlRequest<{
      repository: Record<string, { id: string } | null> | null;
    }>(
      `query ResolveLabel($owner: String!, $repo: String!, $name: String!) {
        repository(owner: $owner, name: $repo) {
          ${safeAlias}: label(name: $name) { id }
        }
      }`,
      {
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        name: normalized,
      },
    );

    const existingId = queryData.repository?.[safeAlias]?.id;
    if (existingId) {
      this.labelIdCache.set(normalized.toLowerCase(), existingId);
      return existingId;
    }

    const created = await this.graphqlRequest<{
      createLabel: { label: { id: string } | null } | null;
    }>(
      `mutation CreateLabel($repositoryId: ID!, $name: String!, $color: String!) {
        createLabel(input: { repositoryId: $repositoryId, name: $name, color: $color }) {
          label { id }
        }
      }`,
      {
        repositoryId,
        name: normalized,
        color: defaultGithubLabelColor(normalized),
      },
    );

    const createdId = created.createLabel?.label?.id;
    if (!createdId) {
      throw new Error(`Unable to create GitHub label \"${normalized}\"`);
    }

    this.labelIdCache.set(normalized.toLowerCase(), createdId);
    return createdId;
  }

  private async ensureLabelIds(labelNames: string[] | undefined): Promise<string[] | undefined> {
    if (!labelNames || labelNames.length === 0) return undefined;

    const ids: string[] = [];
    for (const labelName of labelNames) {
      ids.push(await this.ensureLabelId(labelName));
    }
    return ids;
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
    const repositoryId = await this.getRepositoryId();
    const labelIds = await this.ensureLabelIds(payload.labels);

    const data = await this.graphqlRequest<{
      createIssue: {
        issue: { number: number } | null;
      } | null;
    }>(
      `mutation CreateIssue($repositoryId: ID!, $title: String!, $body: String, $labelIds: [ID!]) {
        createIssue(input: { repositoryId: $repositoryId, title: $title, body: $body, labelIds: $labelIds }) {
          issue { number }
        }
      }`,
      {
        repositoryId,
        title: payload.title,
        body: payload.body ?? "",
        labelIds,
      },
    );

    const issueNumber = data.createIssue?.issue?.number;
    if (!issueNumber) {
      throw new Error(
        `GitHub GraphQL createIssue returned no issue number for ${this.config.repoOwner}/${this.config.repoName}`,
      );
    }

    const created = await this.getIssue(issueNumber);
    if (!created) {
      throw new Error(
        `GitHub issue #${issueNumber} was created but could not be read back from ${this.config.repoOwner}/${this.config.repoName}`,
      );
    }

    return created;
  }

  async updateIssue(number: number, payload: GithubIssueMutation): Promise<GithubIssueSummary> {
    const issueId = await this.resolveIssueNodeId(number);
    const labelIds = payload.labels !== undefined ? await this.ensureLabelIds(payload.labels) : undefined;

    const data = await this.graphqlRequest<{
      updateIssue: {
        issue: { number: number } | null;
      } | null;
    }>(
      `mutation UpdateIssue($id: ID!, $title: String, $body: String, $labelIds: [ID!]) {
        updateIssue(input: { id: $id, title: $title, body: $body, labelIds: $labelIds }) {
          issue { number }
        }
      }`,
      {
        id: issueId,
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.body !== undefined ? { body: payload.body } : {}),
        ...(labelIds !== undefined ? { labelIds } : {}),
      },
    );

    const updatedNumber = data.updateIssue?.issue?.number;
    if (!updatedNumber) {
      throw new Error(
        `GitHub GraphQL updateIssue returned no issue number for #${number} in ${this.config.repoOwner}/${this.config.repoName}`,
      );
    }

    if (payload.state) {
      await this.setIssueOpenState(updatedNumber, payload.state);
    }

    const updated = await this.getIssue(updatedNumber);
    if (!updated) {
      throw new Error(
        `GitHub issue #${updatedNumber} was updated but could not be read back from ${this.config.repoOwner}/${this.config.repoName}`,
      );
    }

    return updated;
  }

  private async setIssueOpenState(number: number, nextState: "open" | "closed"): Promise<void> {
    const issueId = await this.resolveIssueNodeId(number);

    if (nextState === "closed") {
      await this.graphqlRequest<{
        closeIssue: { issue: { number: number } | null } | null;
      }>(
        `mutation CloseIssue($issueId: ID!) {
          closeIssue(input: { issueId: $issueId }) {
            issue { number }
          }
        }`,
        { issueId },
      );
      return;
    }

    await this.graphqlRequest<{
      reopenIssue: { issue: { number: number } | null } | null;
    }>(
      `mutation ReopenIssue($issueId: ID!) {
        reopenIssue(input: { issueId: $issueId }) {
          issue { number }
        }
      }`,
      { issueId },
    );
  }

  async listSubIssueNumbers(parentIssueNumber: number): Promise<number[]> {
    const numbers: number[] = [];
    let after: string | null = null;

    for (;;) {
      const payload: {
        repository: {
          issue: {
            subIssues: {
              nodes: Array<{ number: number }>;
              pageInfo: { hasNextPage: boolean; endCursor: string | null };
            };
          } | null;
        } | null;
      } = await this.graphqlRequest(
        `query ListSubIssues($owner: String!, $repo: String!, $number: Int!, $after: String) {
          repository(owner: $owner, name: $repo) {
            issue(number: $number) {
              subIssues(first: 100, after: $after) {
                nodes { number }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }`,
        {
          owner: this.config.repoOwner,
          repo: this.config.repoName,
          number: parentIssueNumber,
          after,
        },
      );

      const issue = payload.repository?.issue;
      if (!issue) return numbers;

      for (const node of issue.subIssues.nodes) {
        numbers.push(node.number);
      }

      if (!issue.subIssues.pageInfo.hasNextPage) {
        return numbers;
      }

      after = issue.subIssues.pageInfo.endCursor;
      if (!after) {
        return numbers;
      }
    }
  }

  async addSubIssue(parentIssueNumber: number, subIssueNumber: number): Promise<void> {
    if (parentIssueNumber === subIssueNumber) return;

    const existingSubIssues = await this.listSubIssueNumbers(parentIssueNumber);
    if (existingSubIssues.includes(subIssueNumber)) {
      return;
    }

    const data = await this.graphqlRequest<{
      repository: {
        parentIssue: { id: string; number: number } | null;
        childIssue: { id: string; number: number; parent: { number: number } | null } | null;
      } | null;
    }>(
      `query ResolveIssueIds($owner: String!, $repo: String!, $parent: Int!, $child: Int!) {
        repository(owner: $owner, name: $repo) {
          parentIssue: issue(number: $parent) { id number }
          childIssue: issue(number: $child) { id number parent { number } }
        }
      }`,
      {
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        parent: parentIssueNumber,
        child: subIssueNumber,
      },
    );

    const parentIssue = data.repository?.parentIssue;
    const childIssue = data.repository?.childIssue;
    if (!parentIssue || !childIssue) {
      throw new Error(
        `Unable to resolve parent/child issues for sub-issue link (${parentIssueNumber} -> ${subIssueNumber})`,
      );
    }

    if (childIssue.parent?.number === parentIssueNumber) {
      return;
    }
    if (childIssue.parent && childIssue.parent.number !== parentIssueNumber) {
      throw new Error(
        `Task #${subIssueNumber} is already attached to parent #${childIssue.parent.number}; refusing to relink automatically.`,
      );
    }

    await this.graphqlRequest<{
      addSubIssue: {
        issue: { number: number };
        subIssue: { number: number };
      };
    }>(
      `mutation AddSubIssue($issueId: ID!, $subIssueId: ID!) {
        addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) {
          issue { number }
          subIssue { number }
        }
      }`,
      {
        issueId: parentIssue.id,
        subIssueId: childIssue.id,
      },
    );
  }

  async listIssueComments(issueNumber: number): Promise<GithubIssueComment[]> {
    const comments: GithubIssueComment[] = [];

    for (let page = 1; ; page++) {
      const pageComments = await this.request<GithubIssueComment[]>(
        `/repos/${this.config.repoOwner}/${this.config.repoName}/issues/${issueNumber}/comments`,
        {
          query: { per_page: "100", page: String(page) },
        },
      );

      comments.push(...pageComments);
      if (pageComments.length < 100) {
        return comments;
      }
    }
  }

  async createIssueComment(issueNumber: number, body: string): Promise<GithubIssueComment> {
    return this.request(
      `/repos/${this.config.repoOwner}/${this.config.repoName}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        body: { body },
      },
    );
  }

  async updateIssueComment(commentId: number, body: string): Promise<GithubIssueComment> {
    return this.request(
      `/repos/${this.config.repoOwner}/${this.config.repoName}/issues/comments/${commentId}`,
      {
        method: "PATCH",
        body: { body },
      },
    );
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

function compareGithubKataOrder(leftTitle: string, rightTitle: string): number {
  const left = parseGithubKataTitle(leftTitle)?.kataId;
  const right = parseGithubKataTitle(rightTitle)?.kataId;
  if (!left && !right) return leftTitle.localeCompare(rightTitle);
  if (!left) return 1;
  if (!right) return -1;

  const leftPrefix = left[0] ?? "";
  const rightPrefix = right[0] ?? "";
  if (leftPrefix !== rightPrefix) return leftPrefix.localeCompare(rightPrefix);

  const leftOrdinal = Number.parseInt(left.slice(1), 10);
  const rightOrdinal = Number.parseInt(right.slice(1), 10);
  return leftOrdinal - rightOrdinal;
}

function composeArtifactIssueBody(
  existingBody: string | null | undefined,
  metadata: GithubArtifactMetadataV1,
  plainBody?: string,
): string {
  const source = existingBody ?? "";
  const preservedPlainBody = stripEmbeddedDocuments(stripGithubArtifactMetadata(source)).trim();
  const nextPlainBody = plainBody !== undefined ? plainBody.trim() : preservedPlainBody;

  let body = serializeGithubArtifactMetadata(metadata);
  if (nextPlainBody.length > 0) {
    body += `\n\n${nextPlainBody}`;
  }

  for (const documentName of listEmbeddedDocuments(source)) {
    const embedded = readEmbeddedDocument(source, documentName);
    if (embedded !== null) {
      body = upsertEmbeddedDocument(body, documentName, embedded);
    }
  }

  return body;
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

function parseGithubIssueNumber(input: string): number | null {
  const normalized = input.trim();
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const hashMatch = normalized.match(/#(\d+)\s*$/);
  if (!hashMatch) return null;

  const parsed = Number.parseInt(hashMatch[1] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function requireGithubIssueNumber(input: string, kind: "issue" | "slice issue" = "issue"): number {
  const parsed = parseGithubIssueNumber(input);
  if (!parsed) {
    throw new Error(`Invalid GitHub ${kind} id: ${input}`);
  }
  return parsed;
}

function issueNumberFromScope(scope: DocumentScope | undefined): number | undefined {
  if (!scope || !("issueId" in scope)) return undefined;
  return parseGithubIssueNumber(scope.issueId) ?? undefined;
}

const KATA_STATE_LABEL_SUFFIXES = [
  "backlog",
  "planning",
  "executing",
  "verifying",
  "todo",
  "in-progress",
  "agent-review",
  "human-review",
  "merging",
  "rework",
  "done",
  "closed",
] as const;

function stateLabelSuffix(phase: KataIssueStatePhase): string {
  return phase;
}

/**
 * Map a KataIssueStatePhase to the display name expected by GitHub Projects v2
 * Status field options. These match the canonical Kata phase names used in
 * Symphony WORKFLOW.md `active_states` / `terminal_states`.
 */
function phaseToProjectsV2StatusName(phase: KataIssueStatePhase): string {
  switch (phase) {
    case "backlog":      return "Backlog";
    case "todo":         return "Todo";
    case "planning":     return "Planning";
    case "executing":    return "In Progress";
    case "in-progress":  return "In Progress";
    case "verifying":    return "In Progress";
    case "agent-review": return "Agent Review";
    case "human-review": return "Human Review";
    case "merging":      return "Merging";
    case "rework":       return "Rework";
    case "done":         return "Done";
    case "closed":       return "Closed";
    default:             return phase;
  }
}

function defaultGithubLabelColor(labelName: string): string {
  const normalized = labelName.trim().toLowerCase();
  if (normalized.endsWith("milestone")) return "7C3AED";
  if (normalized.endsWith("slice")) return "2563EB";
  if (normalized.endsWith("task")) return "16A34A";
  if (normalized.endsWith("backlog")) return "94A3B8";
  if (normalized.endsWith("planning")) return "0EA5E9";
  if (normalized.endsWith("todo")) return "0EA5E9";
  if (normalized.endsWith("executing")) return "F59E0B";
  if (normalized.endsWith("in-progress")) return "F59E0B";
  if (normalized.endsWith("agent-review")) return "8B5CF6";
  if (normalized.endsWith("human-review")) return "6366F1";
  if (normalized.endsWith("merging")) return "14B8A6";
  if (normalized.endsWith("rework")) return "EF4444";
  if (normalized.endsWith("verifying")) return "8B5CF6";
  if (normalized.endsWith("done")) return "22C55E";
  if (normalized.endsWith("closed")) return "64748B";
  return "5319E7";
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

function titleFallbackDocumentName(issue: GithubIssueSummary): string | null {
  const parsed = parseGithubKataTitle(issue.title);
  if (!parsed) return null;

  if (parsed.kataId.startsWith("M")) return `${parsed.kataId}-ROADMAP`;
  if (parsed.kataId.startsWith("S")) return `${parsed.kataId}-PLAN`;
  if (parsed.kataId.startsWith("T")) return `${parsed.kataId}-PLAN`;
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function issueMentionsScopedId(issue: GithubIssueSummary, scopedId: string): boolean {
  const normalized = scopedId.trim().toUpperCase();
  if (!normalized) return false;
  const text = `${issue.title}\n${issue.body ?? ""}`;
  const matcher = new RegExp(`\\b${escapeRegex(normalized)}\\b`, "i");
  return matcher.test(text);
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

function extractPlainArtifactBody(issue: GithubIssueSummary): string {
  return stripEmbeddedDocuments(stripGithubArtifactMetadata(issue.body ?? "")).trim();
}

function parseTargetDateFromIssue(issue: GithubIssueSummary): string | null {
  const plainBody = extractPlainArtifactBody(issue);
  const match = plainBody.match(/^Target date:\s*(.+)$/im);
  return match?.[1]?.trim() || null;
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

  private extractCommentMarker(body: string): string | null {
    const htmlMarker = body.match(/^\s*<!--\s*([^>]+?)\s*-->/m)?.[1]?.trim();
    if (htmlMarker) return htmlMarker;
    return null;
  }

  private hasCommentMarker(body: string, marker: string): boolean {
    const normalized = marker.trim();
    if (!normalized) return false;

    if (this.extractCommentMarker(body) === normalized) {
      return true;
    }

    const escaped = escapeRegex(normalized);
    if (new RegExp(`^\\s*${escaped}\\s*$`, "im").test(body)) {
      return true;
    }

    return new RegExp(`^\\s{0,3}#{1,6}\\s+${escaped}\\s*$`, "im").test(body);
  }

  private withCommentMarker(body: string, marker?: string): string {
    const normalized = marker?.trim();
    if (!normalized) return body;
    if (this.hasCommentMarker(body, normalized)) return body;
    return `<!-- ${normalized} -->\n\n${body}`;
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

    const fallback = issues
      .map((issue) => ({ issue, parsed: parseGithubKataTitle(issue.title) }))
      .filter((entry) => entry.parsed?.kataId === normalizedKataId)
      .map((entry) => entry.issue)
      .sort((a, b) => a.number - b.number);

    const hasExplicitScope = Boolean(normalizedMilestoneId || normalizedSliceId);
    if (!hasExplicitScope) {
      return fallback[0] ?? null;
    }

    const scopedFallback = fallback.filter((issue) => {
      if (normalizedMilestoneId && !issueMentionsScopedId(issue, normalizedMilestoneId)) {
        return false;
      }
      if (normalizedSliceId && !issueMentionsScopedId(issue, normalizedSliceId)) {
        return false;
      }
      return true;
    });

    if (scopedFallback.length > 0) {
      return scopedFallback[0] ?? null;
    }

    // Backward compatibility: when there is only one title match, prefer it
    // even if scoped metadata/text is missing.
    if (fallback.length === 1) {
      return fallback[0] ?? null;
    }

    return null;
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
    if (metadata) {
      const fallbackName = bodyFallbackDocumentName(metadata);
      if (fallbackName === normalizedName) {
        const raw = stripEmbeddedDocuments(stripGithubArtifactMetadata(body)).trim();
        return raw.length > 0 ? raw : null;
      }
    }

    // Backward compatibility for issues authored without explicit
    // KATA:GITHUB_ARTIFACT metadata.
    const titleFallback = titleFallbackDocumentName(issue);
    if (titleFallback === normalizedName) {
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

      await this.client.addSubIssue(sliceIssue.number, issue.number);
      emitPlanningSignal("github_planning_subissue_linked", {
        sliceId,
        sliceIssueNumber: sliceIssue.number,
        taskId: normalizedTaskId,
        taskIssueNumber: issue.number,
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

  private toMilestoneRecord(issue: GithubIssueSummary): KataMilestoneRecord {
    return {
      id: String(issue.number),
      name: issue.title,
      targetDate: parseTargetDateFromIssue(issue),
      updatedAt: issue.updatedAt ?? null,
      trackerIssueId: String(issue.number),
    };
  }

  private toIssueRecord(issue: GithubIssueSummary): KataIssueRecord {
    const metadata = inferMetadataFromIssue(issue);
    return {
      id: String(issue.number),
      identifier: `#${issue.number}`,
      title: issue.title,
      state: issue.state,
      labels: issue.labels,
      updatedAt: issue.updatedAt ?? null,
      projectName: `${this.config.repoOwner}/${this.config.repoName}`,
      milestoneName: metadata?.kind === "slice" ? (metadata.milestoneId ?? null) : null,
      parentIdentifier: null,
    };
  }

  async createMilestone(input: {
    kataId: string;
    title: string;
    description?: string;
    targetDate?: string;
  }): Promise<KataMilestoneRecord> {
    const metadata: GithubArtifactMetadataV1 = {
      schema: "kata/github-artifact/v1",
      kind: "milestone",
      kataId: input.kataId.trim().toUpperCase(),
    };
    const milestonePlainBody = [
      input.description?.trim(),
      input.targetDate ? `Target date: ${input.targetDate}` : undefined,
    ].filter(Boolean).join("\n\n") || undefined;

    const issue = await this.ensureIssue(metadata, {
      title: `[${metadata.kataId}] ${input.title}`,
      labels: [primaryLabel(this.config.labelPrefix, "milestone")],
      body: composeArtifactIssueBody(undefined, metadata, milestonePlainBody),
    });

    const nextBody = milestonePlainBody
      ? composeArtifactIssueBody(issue.body, metadata, milestonePlainBody)
      : issue.body ?? composeArtifactIssueBody(undefined, metadata, undefined);

    const updated = await this.updateIssue(issue.number, {
      title: `[${metadata.kataId}] ${input.title}`,
      body: nextBody,
    });
    this.invalidateStateCache();
    return this.toMilestoneRecord(updated);
  }

  async createSlice(input: {
    kataId: string;
    title: string;
    description?: string;
    milestoneId?: string;
    initialPhase?: KataWorkflowPhase;
  }): Promise<KataIssueRecord> {
    const metadata: GithubArtifactMetadataV1 = {
      schema: "kata/github-artifact/v1",
      kind: "slice",
      kataId: input.kataId.trim().toUpperCase(),
      ...(input.milestoneId ? { milestoneId: input.milestoneId.trim().toUpperCase() } : {}),
    };

    const phasePrefix = this.config.labelPrefix.endsWith(":") ? this.config.labelPrefix : `${this.config.labelPrefix}:`;
    const phaseLabel = input.initialPhase ? `${phasePrefix}${input.initialPhase}` : undefined;
    const issue = await this.ensureIssue(metadata, {
      title: `[${metadata.kataId}] ${input.title}`,
      labels: [primaryLabel(this.config.labelPrefix, "slice"), ...(phaseLabel ? [phaseLabel] : [])],
      body: composeArtifactIssueBody(undefined, ensureMetadataDocumentTitle(metadata, `${metadata.kataId}-PLAN`), input.description),
    });

    const mergedMetadata = ensureMetadataDocumentTitle({
      ...(maybeParseGithubArtifactMetadata(issue.body ?? "") ?? metadata),
      ...(input.milestoneId ? { milestoneId: input.milestoneId.trim().toUpperCase() } : {}),
    }, `${metadata.kataId}-PLAN`);
    const nextBody = composeArtifactIssueBody(issue.body, mergedMetadata, input.description);
    const updated = await this.updateIssue(issue.number, {
      title: `[${metadata.kataId}] ${input.title}`,
      body: nextBody,
      ...(phaseLabel ? { labels: [primaryLabel(this.config.labelPrefix, "slice"), phaseLabel] } : {}),
    });
    this.invalidateStateCache();
    return this.toIssueRecord(updated);
  }

  async createTask(input: {
    kataId: string;
    title: string;
    sliceIssueId: string;
    description?: string;
    initialPhase?: KataWorkflowPhase;
  }): Promise<KataIssueRecord> {
    const parentIssueNumber = requireGithubIssueNumber(input.sliceIssueId, "slice issue");

    const parentIssue = await this.findIssueByNumber(parentIssueNumber);
    if (!parentIssue) {
      throw new Error(`Slice issue not found: ${input.sliceIssueId}`);
    }

    const parentMetadata = maybeParseGithubArtifactMetadata(parentIssue.body ?? "");
    const sliceId = parentMetadata?.kataId ?? parseGithubKataTitle(parentIssue.title)?.kataId;
    if (!sliceId) {
      throw new Error(`Unable to derive slice id from parent issue #${parentIssueNumber}`);
    }

    const metadata: GithubArtifactMetadataV1 = {
      schema: "kata/github-artifact/v1",
      kind: "task",
      kataId: input.kataId.trim().toUpperCase(),
      sliceId,
      ...(parentMetadata?.milestoneId ? { milestoneId: parentMetadata.milestoneId } : {}),
    };

    const phasePrefix = this.config.labelPrefix.endsWith(":") ? this.config.labelPrefix : `${this.config.labelPrefix}:`;
    const phaseLabel = input.initialPhase ? `${phasePrefix}${input.initialPhase}` : undefined;
    const issue = await this.ensureIssue(metadata, {
      title: `[${metadata.kataId}] ${input.title}`,
      labels: [
        primaryLabel(this.config.labelPrefix, "task"),
        `${phasePrefix}slice:${sliceId.toLowerCase()}`,
        ...(phaseLabel ? [phaseLabel] : []),
      ],
      body: composeArtifactIssueBody(undefined, ensureMetadataDocumentTitle(metadata, `${metadata.kataId}-PLAN`), input.description),
    });

    const mergedMetadata = ensureMetadataDocumentTitle({
      ...(maybeParseGithubArtifactMetadata(issue.body ?? "") ?? metadata),
      sliceId,
      ...(parentMetadata?.milestoneId ? { milestoneId: parentMetadata.milestoneId } : {}),
    }, `${metadata.kataId}-PLAN`);
    const nextBody = composeArtifactIssueBody(issue.body, mergedMetadata, input.description);
    const updated = await this.updateIssue(issue.number, {
      title: `[${metadata.kataId}] ${input.title}`,
      body: nextBody,
      labels: [
        primaryLabel(this.config.labelPrefix, "task"),
        `${phasePrefix}slice:${sliceId.toLowerCase()}`,
        ...(phaseLabel ? [phaseLabel] : []),
      ],
    });

    await this.client.addSubIssue(parentIssueNumber, updated.number);
    this.invalidateStateCache();
    return this.toIssueRecord(updated);
  }

  async listMilestones(): Promise<KataMilestoneRecord[]> {
    const issues = await this.listIssues();
    return issues
      .filter((issue) => inferMetadataFromIssue(issue)?.kind === "milestone")
      .sort((a, b) => compareGithubKataOrder(a.title, b.title))
      .map((issue) => this.toMilestoneRecord(issue));
  }

  private async getRoadmapSliceIds(milestoneId: string): Promise<Set<string> | null> {
    const roadmap = await this.readDocument(`${milestoneId}-ROADMAP`);
    if (!roadmap) return null;

    try {
      const parsed = parseRoadmap(roadmap);
      return new Set(parsed.slices.map((slice) => slice.id.trim().toUpperCase()));
    } catch {
      return null;
    }
  }

  async listSlices(input: { milestoneId?: string } = {}): Promise<KataIssueRecord[]> {
    const milestoneId = input.milestoneId?.trim().toUpperCase();
    const roadmapSliceIds = milestoneId ? await this.getRoadmapSliceIds(milestoneId) : null;
    const issues = await this.listIssues();
    return issues
      .filter((issue) => {
        const metadata = inferMetadataFromIssue(issue);
        if (metadata?.kind !== "slice") return false;
        if (!milestoneId) return true;
        if (metadata.milestoneId === milestoneId) return true;

        const parsedTitle = parseGithubKataTitle(issue.title);
        return Boolean(parsedTitle?.kataId && roadmapSliceIds?.has(parsedTitle.kataId.trim().toUpperCase()));
      })
      .sort((a, b) => compareGithubKataOrder(a.title, b.title))
      .map((issue) => this.toIssueRecord(issue));
  }

  async listTasks(sliceIssueId: string): Promise<KataIssueRecord[]> {
    const parentIssueNumber = requireGithubIssueNumber(sliceIssueId, "slice issue");

    const subIssueNumbers = await this.client.listSubIssueNumbers(parentIssueNumber);
    const issues = await Promise.all(subIssueNumbers.map((number) => this.findIssueByNumber(number)));
    return issues
      .filter((issue): issue is GithubIssueSummary => issue !== null)
      .sort((a, b) => compareGithubKataOrder(a.title, b.title))
      .map((issue) => ({
        ...this.toIssueRecord(issue),
        parentIdentifier: sliceIssueId,
      }));
  }

  async getIssue(
    issueId: string,
    opts: { includeChildren?: boolean; includeComments?: boolean } = {},
  ): Promise<KataIssueDetailRecord | null> {
    const issueNumber = requireGithubIssueNumber(issueId, "issue");

    const includeChildren = opts.includeChildren ?? true;
    const includeComments = opts.includeComments ?? true;

    const issue = await this.findIssueByNumber(issueNumber);
    if (!issue) return null;

    const children = includeChildren
      ? (await Promise.all(
          (await this.client.listSubIssueNumbers(issueNumber))
            .map((number) => this.findIssueByNumber(number)),
        ))
          .filter((child): child is GithubIssueSummary => child !== null)
          .map((child) => ({
            ...this.toIssueRecord(child),
            parentIdentifier: `#${issueNumber}`,
          }))
      : [];

    const comments = includeComments
      ? (await this.client.listIssueComments(issueNumber)).map((comment) => ({
          id: String(comment.id),
          issueId: String(issueNumber),
          body: comment.body,
          marker: this.extractCommentMarker(comment.body),
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
          url: comment.html_url,
        }))
      : [];

    return {
      ...this.toIssueRecord(issue),
      description: issue.body ?? null,
      children,
      comments,
    };
  }

  async upsertComment(input: KataCommentUpsertInput): Promise<KataIssueCommentRecord> {
    const issueNumber = requireGithubIssueNumber(input.issueId, "issue");

    const marker = input.marker?.trim() || undefined;
    const nextBody = this.withCommentMarker(input.body, marker);

    if (marker) {
      const comments = await this.client.listIssueComments(issueNumber);
      const existing = comments
        .filter((comment) => this.hasCommentMarker(comment.body, marker))
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
      if (existing) {
        const updated = await this.client.updateIssueComment(existing.id, nextBody);
        return {
          id: String(updated.id),
          issueId: String(issueNumber),
          body: updated.body,
          marker,
          action: "updated",
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
          url: updated.html_url,
        };
      }
    }

    const created = await this.client.createIssueComment(issueNumber, nextBody);
    return {
      id: String(created.id),
      issueId: String(issueNumber),
      body: created.body,
      marker: marker ?? this.extractCommentMarker(created.body),
      action: "created",
      createdAt: created.created_at,
      updatedAt: created.updated_at,
      url: created.html_url,
    };
  }

  async createFollowupIssue(input: KataFollowupIssueInput): Promise<KataIssueRecord> {
    if (input.relationType && !input.parentIssueId) {
      throw new Error("parentIssueId is required when relationType is provided");
    }

    let parentIssueNumber: number | undefined;
    if (input.parentIssueId) {
      parentIssueNumber = requireGithubIssueNumber(input.parentIssueId, "issue");
      const parentIssue = await this.findIssueByNumber(parentIssueNumber);
      if (!parentIssue) {
        throw new Error(`Parent GitHub issue not found: ${input.parentIssueId}`);
      }
    }

    const phasePrefix = this.config.labelPrefix.endsWith(":")
      ? this.config.labelPrefix
      : `${this.config.labelPrefix}:`;

    const created = await this.createIssue({
      title: input.title,
      body: input.description,
      labels: [`${phasePrefix}backlog`],
    });

    if (parentIssueNumber && input.relationType !== "relates_to") {
      await this.client.addSubIssue(parentIssueNumber, created.number);
    }

    this.invalidateStateCache();
    return {
      ...this.toIssueRecord(created),
      parentIdentifier: parentIssueNumber ? `#${parentIssueNumber}` : null,
    };
  }

  async updateIssueState(
    issueId: string,
    phase: KataIssueStatePhase,
  ): Promise<KataIssueStateUpdateResult> {
    const number = requireGithubIssueNumber(issueId, "issue");

    const issue = await this.findIssueByNumber(number);
    if (!issue) {
      throw new Error(`GitHub issue not found: ${issueId}`);
    }

    const phasePrefix = this.config.labelPrefix.endsWith(":")
      ? this.config.labelPrefix
      : `${this.config.labelPrefix}:`;
    const knownPhaseLabels = new Set(
      KATA_STATE_LABEL_SUFFIXES.map((suffix) => `${phasePrefix}${suffix}`.toLowerCase()),
    );
    const preservedLabels = issue.labels.filter((label) => !knownPhaseLabels.has(label.toLowerCase()));
    const labelSuffix = stateLabelSuffix(phase);
    const nextPhaseLabel = `${phasePrefix}${labelSuffix}`;
    const shouldClose = phase === "done" || phase === "closed";
    const nextLabels = [...preservedLabels, nextPhaseLabel];

    // Projects v2 mode: mutate the project board Status field directly and keep
    // canonical phase labels synchronized so label-based state derivation stays accurate.
    if (this.config.stateMode === "projects_v2" && this.config.githubProjectNumber) {
      const displayName = phaseToProjectsV2StatusName(phase);
      const actualStatus = await this.client.updateProjectV2ItemStatus(number, displayName);

      await this.updateIssue(number, {
        labels: nextLabels,
        state: shouldClose ? "closed" : "open",
      });

      this.invalidateStateCache();
      return {
        issueId: String(number),
        identifier: `#${number}`,
        phase,
        state: actualStatus,
      };
    }

    // Label mode: swap state labels.
    const updated = await this.updateIssue(number, {
      labels: nextLabels,
      state: shouldClose ? "closed" : "open",
    });
    this.invalidateStateCache();
    return {
      issueId: String(updated.number),
      identifier: `#${updated.number}`,
      phase,
      state: shouldClose ? "closed" : nextPhaseLabel,
    };
  }

  async resolveSliceScope(milestoneId: string, sliceId: string): Promise<DocumentScope | undefined> {
    const issue = await this.findIssueByKataId(sliceId, "slice", { milestoneId });
    if (!issue) return undefined;
    return { issueId: String(issue.number) };
  }

  async isSlicePlanned(milestoneId: string, sliceId: string): Promise<boolean> {
    const normalizedSliceId = sliceId.trim().toUpperCase();
    const normalizedMilestoneId = milestoneId.trim().toUpperCase();

    const sliceIssue = await this.findIssueByKataId(normalizedSliceId, "slice", {
      milestoneId: normalizedMilestoneId,
    });
    if (!sliceIssue) return false;

    const existingSubIssueNumbers = await this.client.listSubIssueNumbers(sliceIssue.number);
    if (existingSubIssueNumbers.length > 0) return true;

    const issues = await this.listIssues();
    return issues.some((issue) => {
      const metadata = inferMetadataFromIssue(issue);
      const parsedTitle = parseGithubKataTitle(issue.title);
      const isTask = metadata?.kind === "task" || /^T\d{2}$/.test(parsedTitle?.kataId ?? "");
      if (!isTask) return false;
      if (metadata?.milestoneId && metadata.milestoneId !== normalizedMilestoneId) return false;

      const metadataSlice = metadata?.sliceId?.trim().toUpperCase();
      if (metadataSlice === normalizedSliceId) {
        return true;
      }

      const normalizedSliceLabel = normalizedSliceId.toLowerCase();
      const labelPrefix = this.config.labelPrefix.endsWith(":")
        ? this.config.labelPrefix.toLowerCase()
        : `${this.config.labelPrefix.toLowerCase()}:`;
      const labels = new Set(issue.labels.map((label) => label.trim().toLowerCase()));
      if (
        labels.has(`${labelPrefix}slice:${normalizedSliceLabel}`) ||
        labels.has(`slice:${normalizedSliceLabel}`) ||
        labels.has(`${labelPrefix}parent:${normalizedSliceLabel}`)
      ) {
        return true;
      }

      const body = issue.body ?? "";
      const escapedMilestone = escapeRegex(normalizedMilestoneId);
      const escapedSlice = escapeRegex(normalizedSliceId);
      const milestoneField = new RegExp(
        `^\\s*(?:\\*\\*)?Milestone:(?:\\*\\*)?\\s*${escapedMilestone}(?:\\b|\\s|$)`,
        "im",
      ).test(body);
      const sliceField = new RegExp(
        `^\\s*(?:\\*\\*)?Slice:(?:\\*\\*)?\\s*${escapedSlice}(?:\\b|\\s|$)`,
        "im",
      ).test(body);
      return milestoneField && sliceField;
    });
  }

  private buildGithubPlanMilestoneOps(mid: string): OpsBlock {
    const backendRules = [
      "Hard rule: In GitHub mode, never use `linear_*` tools to read or write planning artifacts.",
      "Hard rule: Never read local `.kata/*.md` planning files in GitHub mode — they are not canonical and may not exist.",
      "Use backend-aware `kata_*` tools as the primary write path for milestone/slice/task artifacts and documents.",
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
      "Hard rule: In GitHub mode, do not call `linear_*` tools for planning writes.",
      "Hard rule: Do not read/write local `.kata/*.md` planning files in GitHub mode.",
      "Use backend-aware `kata_*` tools as the primary write path for slice/task planning artifacts.",
      "Slice and task planning artifacts must be GitHub issue-backed and include `KATA:GITHUB_ARTIFACT` metadata.",
    ].join("\n");

    const backendOps = [
      "10. Idempotency check:",
      `    - Find existing \`[${sid}]\` slice issue and existing task issues (\`[T##]\`) before creating anything.`,
      "    - Re-run planning as update-in-place when artifacts already exist.",
      "11. Upsert slice plan artifact:",
      "    - Persist the canonical slice plan artifact to the slice issue with stable metadata markers.",
      "12. Upsert task artifacts:",
      "    - For each planned task (`T##`), create or update a GitHub issue with task metadata.",
      "    - Link every task to the slice via real GitHub sub-issue relationships (parent = slice issue).",
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
      "2. Read required context artifacts from GitHub issues (never from local `.kata/*.md` files):",
      `   - ${mid}-CONTEXT`,
      "3. Read optional project artifacts from GitHub issues when available:",
      "   - PROJECT",
      "   - REQUIREMENTS",
      "   - DECISIONS",
      "4. If you need raw issue content, use `kata_get_issue({ issueId })` (and `kata_read_document(...)` for document artifacts).",
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
      "2. Read required artifact from GitHub issues (never from local `.kata/*.md` files):",
      `   - ${mid}-ROADMAP`,
      "3. Read optional artifacts from GitHub issues when present:",
      `   - ${sid}-RESEARCH`,
      "   - REQUIREMENTS",
      "   - DECISIONS",
      "4. If you need raw issue content, use `kata_get_issue({ issueId })` (and `kata_read_document(...)` for document artifacts)."
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
      "Do not read or write local `.kata/*.md` planning artifacts.",
      "Do not use `linear_*` tools in GitHub mode. Prefer backend-aware `kata_*` tools.",
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
