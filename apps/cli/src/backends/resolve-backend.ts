import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import type {
  KataArtifact,
  KataArtifactListInput,
  KataArtifactReadInput,
  KataArtifactType,
  KataArtifactWriteInput,
  KataBackendAdapter,
  KataExecutionStatus,
  KataHealthReport,
  KataIssue,
  KataIssueCreateInput,
  KataIssueGetInput,
  KataIssueSummary,
  KataIssueUpdateStatusInput,
  KataMilestone,
  KataMilestoneCompleteInput,
  KataMilestoneCreateInput,
  KataPullRequest,
  KataProjectContext,
  KataProjectUpsertInput,
  KataScopeType,
  KataSlice,
  KataSliceCreateInput,
  KataSliceListInput,
  KataSliceUpdateStatusInput,
  KataTask,
  KataTaskCreateInput,
  KataTaskListInput,
  KataTaskUpdateStatusInput,
} from "../domain/types.js";
import { KataDomainError } from "../domain/errors.js";
import { parseSliceDependencyIds } from "../domain/dependencies.js";
import { createGithubClient } from "./github-projects-v2/client.js";
import { readTrackerConfig } from "./read-tracker-config.js";
import { GithubProjectsV2Adapter } from "./github-projects-v2/adapter.js";
import { LinearKataAdapter } from "./linear/adapter.js";
import { createLinearClient } from "./linear/client.js";
import { resolveLinearAuthToken } from "./linear/config.js";

type TrackerConfig = Awaited<ReturnType<typeof readTrackerConfig>>;

interface RuntimeKataState {
  activeMilestone?: { id: string; title: string } | null;
  activeSlice?: { id: string } | null;
  activeTask?: { id: string } | null;
  phase?: string;
  blockers?: string[];
}

interface RuntimeKataIssueRecord {
  id: string;
  title: string;
  state?: string;
  labels?: string[];
  milestoneName?: string | null;
  blockedBy?: string[];
  blocking?: string[];
}

interface RuntimeDocumentScope {
  issueId: string;
}

interface RuntimeStore {
  state?: RuntimeKataState;
  slices?: RuntimeKataIssueRecord[];
  tasksBySlice?: Record<string, RuntimeKataIssueRecord[]>;
  documentsByScope?: Record<string, Record<string, string>>;
}

interface RuntimeKataBackend {
  deriveState(): Promise<RuntimeKataState>;
  listSlices(input?: { milestoneId?: string }): Promise<RuntimeKataIssueRecord[]>;
  listTasks(sliceIssueId: string): Promise<RuntimeKataIssueRecord[]>;
  listDocuments(scope?: RuntimeDocumentScope): Promise<string[]>;
  readDocument(name: string, scope?: RuntimeDocumentScope): Promise<string | null>;
  writeDocument(name: string, content: string, scope?: RuntimeDocumentScope): Promise<void>;
}

type RuntimeBackendFactory = (workspacePath: string) => Promise<RuntimeKataBackend>;

export function resolveGithubToken(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const value of [env.GITHUB_TOKEN, env.GH_TOKEN]) {
    const token = value?.trim();
    if (token) return token;
  }
  return null;
}

export async function resolveGithubTokenForRuntime(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const envToken = resolveGithubToken(env);
  if (envToken) return envToken;

  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], { env, timeout: 5000 });
    const token = stdout.trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

const ARTIFACT_SUFFIX_BY_TYPE: Record<KataArtifactType, string> = {
  "project-brief": "PROJECT",
  requirements: "REQUIREMENTS",
  roadmap: "ROADMAP",
  "phase-context": "CONTEXT",
  context: "CONTEXT",
  decisions: "DECISIONS",
  research: "RESEARCH",
  plan: "PLAN",
  slice: "SLICE",
  summary: "SUMMARY",
  verification: "VERIFICATION",
  uat: "UAT",
  retrospective: "RETROSPECTIVE",
};

function normalizeToken(value: string | undefined | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/[ _]+/g, "-");
}

function normalizeScopeId(scopeId: string): string {
  return scopeId.trim().toUpperCase();
}

function documentScopeFrom(scopeType: KataScopeType, scopeId: string): RuntimeDocumentScope | undefined {
  if (scopeType === "project" || scopeType === "milestone") return undefined;
  return { issueId: String(scopeId) };
}

function documentNameFromArtifact(scopeType: KataScopeType, scopeId: string, artifactType: KataArtifactType): string {
  const suffix = ARTIFACT_SUFFIX_BY_TYPE[artifactType];
  if (scopeType === "project") return suffix;
  return `${normalizeScopeId(scopeId)}-${suffix}`;
}

function artifactTypeFromDocumentName(
  scopeType: KataScopeType,
  scopeId: string,
  documentName: string,
): KataArtifactType | null {
  const normalizedDocumentName = documentName.trim().toUpperCase();
  const suffix = scopeType === "project"
    ? normalizedDocumentName
    : normalizedDocumentName.startsWith(`${normalizeScopeId(scopeId)}-`)
      ? normalizedDocumentName.slice(normalizeScopeId(scopeId).length + 1)
      : null;

  if (!suffix) return null;

  switch (suffix) {
    case "PROJECT":
      return "project-brief";
    case "REQUIREMENTS":
      return "requirements";
    case "ROADMAP":
      return "roadmap";
    case "CONTEXT":
      return scopeType === "slice" || scopeType === "task" ? "phase-context" : "context";
    case "DECISIONS":
      return "decisions";
    case "RESEARCH":
      return "research";
    case "PLAN":
      return "plan";
    case "SLICE":
      return "slice";
    case "SUMMARY":
      return "summary";
    case "VERIFICATION":
      return "verification";
    case "UAT":
      return "uat";
    case "RETROSPECTIVE":
      return "retrospective";
    default:
      return null;
  }
}

function inferMilestoneId(
  issue: RuntimeKataIssueRecord,
  explicitMilestoneId: string | undefined,
  activeMilestoneId: string | undefined,
): string {
  if (explicitMilestoneId) return explicitMilestoneId;

  const fromMilestoneName = issue.milestoneName?.match(/\bM\d+\b/i)?.[0];
  if (fromMilestoneName) return fromMilestoneName.toUpperCase();

  const fromTitle = issue.title.match(/\bM\d+\b/i)?.[0];
  if (fromTitle) return fromTitle.toUpperCase();

  return activeMilestoneId ?? "M000";
}

function toCanonicalSliceStatus(inputIssue: RuntimeKataIssueRecord): KataSlice["status"] {
  const normalizedState = normalizeToken(inputIssue.state);
  const labels = (inputIssue.labels ?? []).map((label) => normalizeToken(label));
  const hasPhaseLabel = (phase: string) =>
    labels.some((label) =>
      label === phase ||
      label.endsWith(`:${phase}`) ||
      label.endsWith(`/${phase}`) ||
      label.endsWith(`-${phase}`));

  if (normalizedState === "closed" || normalizedState === "done" || hasPhaseLabel("done")) return "done";
  if (normalizedState === "merging" || hasPhaseLabel("merging")) return "merging";
  if (normalizedState === "human-review" || hasPhaseLabel("human-review")) return "human_review";
  if (normalizedState === "agent-review" || hasPhaseLabel("agent-review")) return "agent_review";
  if (normalizedState === "in-progress" || hasPhaseLabel("in-progress")) return "in_progress";
  if (normalizedState === "todo" || hasPhaseLabel("todo")) return "todo";
  return "backlog";
}

function toCanonicalTaskStatus(inputIssue: RuntimeKataIssueRecord): KataTask["status"] {
  const sliceStatus = toCanonicalSliceStatus(inputIssue);
  if (sliceStatus === "done") return "done";
  if (sliceStatus === "todo") return "todo";
  if (sliceStatus === "backlog") return "backlog";
  return "in_progress";
}

function toArtifact(input: {
  backendKind: "github" | "linear";
  artifactType: KataArtifactType;
  scopeType: KataScopeType;
  scopeId: string;
  title: string;
  content: string;
  format?: KataArtifact["format"];
}): KataArtifact {
  return {
    id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    artifactType: input.artifactType,
    title: input.title,
    content: input.content,
    format: input.format ?? "markdown",
    updatedAt: new Date().toISOString(),
    provenance: {
      backend: input.backendKind,
      backendId: input.title,
    },
  };
}

function defaultStateForConfig(config: TrackerConfig): RuntimeKataState {
  if (config.kind === "github") {
    return {
      activeMilestone: {
        id: "M001",
        title: `GitHub Project #${config.githubProjectNumber}`,
      },
      phase: "executing",
      blockers: [],
    };
  }

  return {
    activeMilestone: {
      id: "M001",
      title: "Linear Active Milestone",
    },
    phase: "executing",
    blockers: [],
  };
}

function scopeKey(scope?: RuntimeDocumentScope): string {
  return scope?.issueId?.trim().toUpperCase() || "PROJECT";
}

function createFileRuntimeBackendFactory(config: TrackerConfig): RuntimeBackendFactory {
  return async (workspacePath) => {
    const runtimeDir = path.join(workspacePath, ".kata", "runtime");
    const storePath = path.join(runtimeDir, "backend-store.json");

    const readStore = async (): Promise<RuntimeStore> => {
      try {
        const content = await readFile(storePath, "utf8");
        const parsed = JSON.parse(content) as RuntimeStore;
        return typeof parsed === "object" && parsed ? parsed : {};
      } catch {
        return {};
      }
    };

    const writeStore = async (store: RuntimeStore): Promise<void> => {
      await mkdir(runtimeDir, { recursive: true });
      await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    };

    return {
      deriveState: async () => {
        const store = await readStore();
        return store.state ?? defaultStateForConfig(config);
      },
      listSlices: async () => {
        const store = await readStore();
        return store.slices ?? [];
      },
      listTasks: async (sliceIssueId) => {
        const store = await readStore();
        return store.tasksBySlice?.[sliceIssueId] ?? [];
      },
      listDocuments: async (scope) => {
        const store = await readStore();
        return Object.keys(store.documentsByScope?.[scopeKey(scope)] ?? {}).sort();
      },
      readDocument: async (name, scope) => {
        const store = await readStore();
        return store.documentsByScope?.[scopeKey(scope)]?.[name] ?? null;
      },
      writeDocument: async (name, content, scope) => {
        const store = await readStore();
        const key = scopeKey(scope);
        if (!store.documentsByScope) store.documentsByScope = {};
        if (!store.documentsByScope[key]) store.documentsByScope[key] = {};
        store.documentsByScope[key][name] = content;
        await writeStore(store);
      },
    };
  };
}

function createRuntimeBackedAdapter(input: {
  workspacePath: string;
  config: TrackerConfig;
  runtimeBackendFactory?: RuntimeBackendFactory;
}): KataBackendAdapter {
  const backendKind = input.config.kind;
  const projectContext = backendKind === "github"
    ? {
      backend: "github" as const,
      workspacePath: input.workspacePath,
      repository: {
        owner: input.config.repoOwner,
        name: input.config.repoName,
      },
    }
    : {
      backend: "linear" as const,
      workspacePath: input.workspacePath,
    };

  let backendPromise: Promise<RuntimeKataBackend> | null = null;
  const getBackend = async () => {
    if (!backendPromise) {
      const factory = input.runtimeBackendFactory ?? createFileRuntimeBackendFactory(input.config);
      backendPromise = factory(input.workspacePath);
    }
    return backendPromise;
  };

  return {
    getProjectContext: async () => projectContext,
    upsertProject: async (_payload: KataProjectUpsertInput): Promise<KataProjectContext> => {
      throw new KataDomainError("NOT_SUPPORTED", "Runtime-backed project upsert is not implemented yet.");
    },
    listMilestones: async (): Promise<KataMilestone[]> => {
      const state = await (await getBackend()).deriveState();
      const activeMilestone = state.activeMilestone;
      if (!activeMilestone) return [];
      return [
        {
          id: activeMilestone.id,
          title: activeMilestone.title,
          goal: activeMilestone.title,
          status: "active",
          active: true,
        },
      ];
    },
    getActiveMilestone: async (): Promise<KataMilestone | null> => {
      const state = await (await getBackend()).deriveState();
      const activeMilestone = state.activeMilestone;
      if (!activeMilestone) return null;
      return {
        id: activeMilestone.id,
        title: activeMilestone.title,
        goal: activeMilestone.title,
        status: "active",
        active: true,
      };
    },
    createMilestone: async (_payload: KataMilestoneCreateInput): Promise<KataMilestone> => {
      throw new KataDomainError("NOT_SUPPORTED", "Runtime-backed milestone creation is not implemented yet.");
    },
    completeMilestone: async (_payload: KataMilestoneCompleteInput): Promise<KataMilestone> => {
      throw new KataDomainError("NOT_SUPPORTED", "Runtime-backed milestone completion is not implemented yet.");
    },
    listSlices: async (payload: KataSliceListInput): Promise<KataSlice[]> => {
      const backend = await getBackend();
      const state = await backend.deriveState();
      const slices = await backend.listSlices(payload.milestoneId ? { milestoneId: payload.milestoneId } : {});
      return slices.map((slice, index) => ({
        id: String(slice.id),
        milestoneId: inferMilestoneId(slice, payload.milestoneId, state.activeMilestone?.id),
        title: String(slice.title ?? ""),
        goal: String(slice.title ?? ""),
        status: toCanonicalSliceStatus(slice),
        order: index,
        blockedBy: parseSliceDependencyIds(slice.blockedBy),
        blocking: parseSliceDependencyIds(slice.blocking),
      }));
    },
    createSlice: async (_payload: KataSliceCreateInput): Promise<KataSlice> => {
      throw new KataDomainError("NOT_SUPPORTED", "Runtime-backed slice creation is not implemented yet.");
    },
    updateSliceStatus: async (_payload: KataSliceUpdateStatusInput): Promise<KataSlice> => {
      throw new KataDomainError("NOT_SUPPORTED", "Runtime-backed slice status updates are not implemented yet.");
    },
    listTasks: async (payload: KataTaskListInput): Promise<KataTask[]> => {
      const backend = await getBackend();
      const tasks = await backend.listTasks(payload.sliceId);
      return tasks.map((task) => ({
        id: String(task.id),
        sliceId: payload.sliceId,
        title: String(task.title ?? ""),
        description: "",
        status: toCanonicalTaskStatus(task),
        verificationState: "pending",
      }));
    },
    createTask: async (_payload: KataTaskCreateInput): Promise<KataTask> => {
      throw new KataDomainError("NOT_SUPPORTED", "Runtime-backed task creation is not implemented yet.");
    },
    updateTaskStatus: async (_payload: KataTaskUpdateStatusInput): Promise<KataTask> => {
      throw new KataDomainError("NOT_SUPPORTED", "Runtime-backed task status updates are not implemented yet.");
    },
    createIssue: async (_payload: KataIssueCreateInput): Promise<KataIssue> => {
      throw new KataDomainError("NOT_SUPPORTED", "Runtime-backed standalone issue creation is not implemented yet.");
    },
    listOpenIssues: async (): Promise<KataIssueSummary[]> => {
      throw new KataDomainError("NOT_SUPPORTED", "Runtime-backed standalone issue listing is not implemented yet.");
    },
    getIssue: async (_payload: KataIssueGetInput): Promise<KataIssue> => {
      throw new KataDomainError("NOT_SUPPORTED", "Runtime-backed standalone issue retrieval is not implemented yet.");
    },
    updateIssueStatus: async (_payload: KataIssueUpdateStatusInput): Promise<KataIssue> => {
      throw new KataDomainError("NOT_SUPPORTED", "Runtime-backed standalone issue status updates are not implemented yet.");
    },
    listArtifacts: async (payload: KataArtifactListInput): Promise<KataArtifact[]> => {
      const backend = await getBackend();
      const scope = documentScopeFrom(payload.scopeType, payload.scopeId);
      const documents = await backend.listDocuments(scope);
      const artifacts: KataArtifact[] = [];

      for (const documentName of documents) {
        const artifactType = artifactTypeFromDocumentName(payload.scopeType, payload.scopeId, documentName);
        if (!artifactType) continue;
        const content = await backend.readDocument(documentName, scope);
        if (content === null) continue;
        artifacts.push(toArtifact({
          backendKind,
          artifactType,
          scopeType: payload.scopeType,
          scopeId: payload.scopeId,
          title: documentName,
          content,
        }));
      }

      return artifacts;
    },
    readArtifact: async (payload: KataArtifactReadInput): Promise<KataArtifact | null> => {
      const backend = await getBackend();
      const scope = documentScopeFrom(payload.scopeType, payload.scopeId);
      const documentName = documentNameFromArtifact(payload.scopeType, payload.scopeId, payload.artifactType);
      const content = await backend.readDocument(documentName, scope);
      if (content === null) return null;
      return toArtifact({
        backendKind,
        artifactType: payload.artifactType,
        scopeType: payload.scopeType,
        scopeId: payload.scopeId,
        title: documentName,
        content,
      });
    },
    writeArtifact: async (payload: KataArtifactWriteInput): Promise<KataArtifact> => {
      const backend = await getBackend();
      const scope = documentScopeFrom(payload.scopeType, payload.scopeId);
      const documentName = documentNameFromArtifact(payload.scopeType, payload.scopeId, payload.artifactType);
      await backend.writeDocument(documentName, payload.content, scope);
      const storedContent = await backend.readDocument(documentName, scope);
      return toArtifact({
        backendKind,
        artifactType: payload.artifactType,
        scopeType: payload.scopeType,
        scopeId: payload.scopeId,
        title: payload.title,
        content: storedContent ?? payload.content,
        format: payload.format,
      });
    },
    openPullRequest: async (payload): Promise<KataPullRequest> => ({
      id: `${payload.head}->${payload.base}`,
      url: `https://github.com/kata-sh/kata-mono/pull/${encodeURIComponent(payload.head)}`,
      branch: payload.head,
      base: payload.base,
      status: "open",
      mergeReady: false,
    }),
    getExecutionStatus: async (): Promise<KataExecutionStatus> => {
      const state = await (await getBackend()).deriveState();
      const blockers = Array.isArray(state.blockers) ? state.blockers : [];
      const activeIssueId = state.activeTask?.id ?? state.activeSlice?.id ?? state.activeMilestone?.id ?? "unknown";
      return {
        queueDepth: blockers.length,
        activeWorkers: state.phase === "executing" ? 1 : 0,
        escalations: blockers.map((summary, index) => ({
          requestId: `blocker-${index + 1}`,
          issueId: activeIssueId,
          summary,
        })),
      };
    },
    checkHealth: async (): Promise<KataHealthReport> => ({
      ok: true,
      backend: backendKind,
      checks: [
        {
          name: "runtime-adapter",
          status: "ok",
          message: "Runtime-backed adapter is configured; lifecycle mutations are not implemented yet.",
        },
      ],
    }),
  };
}

export async function resolveBackend(input: {
  workspacePath: string;
  env?: NodeJS.ProcessEnv;
  githubClients?: ReturnType<typeof createGithubClient>;
  linearClient?: ReturnType<typeof createLinearClient>;
  runtimeBackendFactory?: RuntimeBackendFactory;
}): Promise<KataBackendAdapter> {
  const preferencesPath = path.join(input.workspacePath, ".kata", "preferences.md");
  const preferencesContent = await readFile(preferencesPath, "utf8");
  const config = await readTrackerConfig({ preferencesContent });

  if (config.kind === "github") {
    const token = await resolveGithubTokenForRuntime(input.env);
    const client = input.githubClients ?? (token ? createGithubClient({ token }) : null);
    if (!client) {
      throw new KataDomainError(
        "UNAUTHORIZED",
        "GitHub mode requires GITHUB_TOKEN/GH_TOKEN or `gh auth login` access to the configured GitHub Project v2.",
      );
    }

    return new GithubProjectsV2Adapter({
      owner: config.repoOwner,
      repo: config.repoName,
      projectNumber: config.githubProjectNumber,
      workspacePath: input.workspacePath,
      client,
    });
  }

  const token = resolveLinearAuthToken({ authEnv: config.authEnv, env: input.env });
  const client = input.linearClient ?? (token ? createLinearClient({ token }) : null);
  if (!client) {
    throw new KataDomainError(
      "UNAUTHORIZED",
      "Linear mode requires LINEAR_API_KEY/LINEAR_TOKEN or the env var configured by linear.authEnv.",
    );
  }

  return new LinearKataAdapter({
    client,
    config,
    workspacePath: input.workspacePath,
  });
}
