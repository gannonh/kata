import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type {
  DashboardData,
  DocumentScope,
  KataBackend,
  PrContext,
  PromptOptions,
} from "./backend.js";
import type { GithubStateMode } from "./github-config.js";
import { deriveGithubState, type GithubIssueSummary, type GithubStateClient } from "./github-state.js";
import type { KataState, Phase } from "./types.js";
import { ensureGitignore } from "./gitignore.js";
import { ensureGitRepo, resolveGitRoot } from "./git-utils.js";
import { getCurrentBranch } from "./worktree.js";

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

class GithubApiClient implements GithubStateClient {
  constructor(private readonly config: GithubBackendConfig) {}

  async listIssues(): Promise<GithubIssueSummary[]> {
    const issues: GithubIssueSummary[] = [];

    for (let page = 1; page <= 10; page++) {
      const url = new URL(
        `/repos/${this.config.repoOwner}/${this.config.repoName}/issues`,
        this.config.apiBaseUrl ?? "https://api.github.com",
      );
      url.searchParams.set("state", "all");
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "kata-cli-github-backend",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `GitHub API request failed (${response.status}) for ${this.config.repoOwner}/${this.config.repoName}: ${body || response.statusText}`,
        );
      }

      const pageIssues = (await response.json()) as GithubApiIssue[];
      const filtered = pageIssues.filter((issue) => issue.pull_request === undefined);

      issues.push(
        ...filtered.map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          labels: issue.labels.map((label) => label.name),
          body: issue.body,
        })),
      );

      if (pageIssues.length < 100) break;
    }

    return issues;
  }
}

const UNSUPPORTED_MESSAGE =
  "GitHub backend bootstrap is enabled for S01 status/derive flows only. Planning and artifact write operations land in later slices.";

export class GithubBackend implements KataBackend {
  readonly basePath: string;
  readonly gitRoot: string;
  readonly isLinearMode = false;

  private readonly config: GithubBackendConfig;
  private readonly client: GithubApiClient;
  private stateCache: { state: KataState; timestamp: number } | null = null;
  private static readonly STATE_CACHE_TTL_MS = 10_000;

  constructor(basePath: string, config: GithubBackendConfig) {
    this.basePath = basePath;
    this.gitRoot = resolveGitRoot(basePath);
    this.config = config;
    this.client = new GithubApiClient(config);
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

  async readDocument(_name: string, _scope?: DocumentScope): Promise<string | null> {
    return null;
  }

  async writeDocument(_name: string, _content: string, _scope?: DocumentScope): Promise<void> {
    throw new Error(UNSUPPORTED_MESSAGE);
  }

  async documentExists(_name: string, _scope?: DocumentScope): Promise<boolean> {
    return false;
  }

  async listDocuments(_scope?: DocumentScope): Promise<string[]> {
    return [];
  }

  async buildPrompt(
    phase: Phase,
    _state: KataState,
    _options?: PromptOptions,
  ): Promise<string> {
    throw new Error(
      `GitHub prompt generation for phase \"${phase}\" is not yet supported. ${UNSUPPORTED_MESSAGE}`,
    );
  }

  buildDiscussPrompt(nextId: string, preamble: string): string {
    return [
      preamble,
      "",
      `Requested milestone: ${nextId}`,
      "",
      UNSUPPORTED_MESSAGE,
      "Use /kata status and /kata prefs status to inspect backend readiness while S01 is in progress.",
    ].join("\n");
  }

  async bootstrap(): Promise<void> {
    ensureGitRepo(this.basePath, this.gitRoot);
    ensureGitignore(this.gitRoot);
    mkdirSync(join(this.basePath, ".kata"), { recursive: true });
  }

  async checkMilestoneCreated(milestoneId: string): Promise<boolean> {
    const state = await this.deriveState();
    return state.activeMilestone?.id === milestoneId;
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

  async preparePrContext(_milestoneId: string, _sliceId: string): Promise<PrContext> {
    return {
      branch: getCurrentBranch(this.basePath),
      documents: {},
    };
  }
}
