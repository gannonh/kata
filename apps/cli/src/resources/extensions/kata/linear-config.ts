import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { classifyLinearError } from "../linear/http.js";
import { LinearClient } from "../linear/linear-client.js";
import type { LinearProject, LinearTeam } from "../linear/linear-types.js";
import {
  loadEffectiveKataPreferences,
  type LoadedKataPreferences,
  type WorkflowMode,
} from "./preferences.js";

export interface EffectiveLinearProjectConfig {
  path: string | null;
  scope: LoadedKataPreferences["scope"] | null;
  workflowMode: WorkflowMode;
  isLinearMode: boolean;
  isGithubMode: boolean;
  linear: {
    teamId: string | null;
    teamKey: string | null;
    projectId: string | null;
  };
}

export type LinearConfigDiagnosticCode =
  | "missing_linear_api_key"
  | "missing_linear_team"
  | "invalid_linear_team"
  | "invalid_linear_project"
  | "linear_auth_error"
  | "linear_network_error";

export interface LinearConfigDiagnostic {
  code: LinearConfigDiagnosticCode;
  message: string;
  field?: string;
  fields?: string[];
  retryable: boolean;
}

export interface LinearConfigValidationResult {
  ok: boolean;
  status: "valid" | "invalid" | "skipped";
  mode: WorkflowMode;
  isLinearMode: boolean;
  path: string | null;
  apiKeyPresent: boolean;
  config: EffectiveLinearProjectConfig;
  diagnostics: LinearConfigDiagnostic[];
  resolved: {
    team: Pick<LinearTeam, "id" | "key" | "name"> | null;
    project: Pick<
      LinearProject,
      "id" | "name" | "slugId" | "state" | "url"
    > | null;
  };
}

export interface LinearConfigStatusReport {
  level: "info" | "warning";
  lines: string[];
}

export interface LinearConfigValidationClient {
  getTeam(idOrKey: string): Promise<LinearTeam | null>;
  getProject(id: string): Promise<LinearProject | null>;
}

export interface ValidateLinearProjectConfigOptions {
  loadedPreferences?: LoadedKataPreferences | null;
  apiKey?: string | null;
  createClient?: (apiKey: string) => LinearConfigValidationClient;
}

export type WorkflowEntrypoint =
  | "smart-entry"
  | "queue"
  | "discuss"
  | "plan"
  | "status"
  | "dashboard"
  | "auto"
  | "system-prompt";

export interface WorkflowProtocolResolution {
  mode: WorkflowMode;
  documentName: "KATA-WORKFLOW.md";
  path: string | null;
  ready: boolean;
}

export interface WorkflowEntrypointGuard {
  mode: WorkflowMode;
  isLinearMode: boolean;
  allow: boolean;
  noticeLevel: "info" | "warning";
  notice: string | null;
  protocol: WorkflowProtocolResolution;
}

export function normalizeWorkflowMode(mode: unknown): WorkflowMode {
  if (mode === "file") {
    throw new Error(
      'File mode has been removed. Set workflow.mode to "linear" or "github" in your Kata preferences.',
    );
  }

  if (mode === undefined || mode === null) return "linear";

  if (typeof mode !== "string") {
    throw new Error('Invalid workflow.mode value. Set workflow.mode to "linear" or "github".');
  }

  const normalized = mode.trim().toLowerCase();
  if (normalized === "linear" || normalized === "github") {
    return normalized as WorkflowMode;
  }

  throw new Error(
    `Unsupported workflow.mode "${normalized}". Set workflow.mode to "linear" or "github".`,
  );
}

export function loadEffectiveLinearProjectConfig(
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): EffectiveLinearProjectConfig {
  const preferences = loadedPreferences?.preferences;
  const workflowMode = normalizeWorkflowMode(preferences?.workflow?.mode);

  // Resolve projectId: prefer projectSlug (human-readable, matches Linear URLs
  // and Symphony's tracker.project_slug), fall back to projectId (UUID, legacy).
  const projectId =
    preferences?.linear?.projectSlug ??
    preferences?.linear?.projectId ??
    null;

  return {
    path: loadedPreferences?.path ?? null,
    scope: loadedPreferences?.scope ?? null,
    workflowMode,
    isLinearMode: workflowMode === "linear",
    isGithubMode: workflowMode === "github",
    linear: {
      teamId: preferences?.linear?.teamId ?? null,
      teamKey: preferences?.linear?.teamKey ?? null,
      projectId,
    },
  };
}

export function getWorkflowMode(
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): WorkflowMode {
  return loadEffectiveLinearProjectConfig(loadedPreferences).workflowMode;
}

export function isLinearMode(
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): boolean {
  return loadEffectiveLinearProjectConfig(loadedPreferences).isLinearMode;
}

export function isGithubMode(
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): boolean {
  return loadEffectiveLinearProjectConfig(loadedPreferences).isGithubMode;
}

export function getLinearTeamId(
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): string | null {
  return loadEffectiveLinearProjectConfig(loadedPreferences).linear.teamId;
}

export function getLinearTeamKey(
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): string | null {
  return loadEffectiveLinearProjectConfig(loadedPreferences).linear.teamKey;
}

export function getLinearProjectId(
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): string | null {
  return loadEffectiveLinearProjectConfig(loadedPreferences).linear.projectId;
}

export interface ResolveConfiguredLinearTeamIdResult {
  teamId: string | null;
  teamLookup: string | null;
  error: string | null;
}

/**
 * Resolve the configured Linear team to a concrete team UUID.
 *
 * Preference order:
 * 1) linear.teamId (already concrete)
 * 2) linear.teamKey (resolved via API lookup)
 */
export async function resolveConfiguredLinearTeamId(
  client: Pick<LinearConfigValidationClient, "getTeam">,
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): Promise<ResolveConfiguredLinearTeamIdResult> {
  const config = loadEffectiveLinearProjectConfig(loadedPreferences);

  if (config.linear.teamId) {
    return {
      teamId: config.linear.teamId,
      teamLookup: config.linear.teamId,
      error: null,
    };
  }

  const teamKey = config.linear.teamKey;
  if (!teamKey) {
    return {
      teamId: null,
      teamLookup: null,
      error: "Linear team not configured — set linear.teamId or linear.teamKey in kata preferences.",
    };
  }

  const team = await client.getTeam(teamKey);
  if (!team) {
    return {
      teamId: null,
      teamLookup: teamKey,
      error: `Linear team could not be resolved: ${JSON.stringify(teamKey)}. Check linear.teamKey in preferences.`,
    };
  }

  return {
    teamId: team.id,
    teamLookup: teamKey,
    error: null,
  };
}

// =============================================================================
// Project ID resolution
// =============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolveConfiguredLinearProjectIdResult {
  projectId: string | null;
  projectLookup: string | null;
  error: string | null;
}

/**
 * Resolve the configured Linear project to a concrete project UUID.
 *
 * The preferences may contain a slug ID (e.g. "459f9835e809") via
 * `linear.projectSlug`, which works for `getProject` / `listMilestones`
 * but fails in filter expressions (`IssueFilter`, `DocumentFilter`) that
 * require a real UUID. This helper normalizes to a UUID for all consumers.
 */
export async function resolveConfiguredLinearProjectId(
  client: Pick<LinearConfigValidationClient, "getProject">,
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): Promise<ResolveConfiguredLinearProjectIdResult> {
  const config = loadEffectiveLinearProjectConfig(loadedPreferences);
  const rawProjectId = config.linear.projectId;

  if (!rawProjectId) {
    return {
      projectId: null,
      projectLookup: null,
      error: "Linear project not configured — set linear.projectSlug in .kata/preferences.md.",
    };
  }

  // Already a UUID — pass through.
  if (UUID_RE.test(rawProjectId)) {
    return {
      projectId: rawProjectId,
      projectLookup: rawProjectId,
      error: null,
    };
  }

  // Slug — resolve to UUID via getProject.
  const project = await client.getProject(rawProjectId);
  if (!project) {
    return {
      projectId: null,
      projectLookup: rawProjectId,
      error: `Linear project not found for "${rawProjectId}". Check linear.projectSlug in .kata/preferences.md.`,
    };
  }

  return {
    projectId: project.id,
    projectLookup: rawProjectId,
    error: null,
  };
}

export function resolveWorkflowProtocol(
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): WorkflowProtocolResolution {
  const mode = getWorkflowMode(loadedPreferences);

  // Both Linear and GitHub modes use the unified workflow document.
  const kataPath =
    process.env.KATA_WORKFLOW_PATH ??
    join(process.env.HOME ?? homedir(), ".kata-cli", "agent", "KATA-WORKFLOW.md");
  const ready = existsSync(kataPath);
  return {
    mode,
    documentName: "KATA-WORKFLOW.md",
    path: ready ? kataPath : null,
    ready,
  };
}

export function getWorkflowEntrypointGuard(
  entrypoint: WorkflowEntrypoint,
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): WorkflowEntrypointGuard {
  const protocol = resolveWorkflowProtocol(loadedPreferences);
  if (protocol.mode === "github") {
    return buildGithubEntrypointGuard(entrypoint, protocol);
  }
  return buildLinearEntrypointGuard(entrypoint, protocol);
}

export async function validateLinearProjectConfig(
  options: ValidateLinearProjectConfigOptions = {},
): Promise<LinearConfigValidationResult> {
  const config = loadEffectiveLinearProjectConfig(options.loadedPreferences);
  const apiKey = options.apiKey ?? process.env.LINEAR_API_KEY ?? "";
  const apiKeyPresent = Boolean(apiKey);
  const resolved: LinearConfigValidationResult["resolved"] = {
    team: null,
    project: null,
  };

  if (!apiKeyPresent) {
    return invalidResult(config, apiKeyPresent, [
      {
        code: "missing_linear_api_key",
        field: "LINEAR_API_KEY",
        message:
          "LINEAR_API_KEY is required to validate Linear mode configuration.",
        retryable: false,
      },
    ]);
  }

  const teamLookup = config.linear.teamId ?? config.linear.teamKey;
  if (!teamLookup) {
    return invalidResult(config, apiKeyPresent, [
      {
        code: "missing_linear_team",
        fields: ["linear.teamId", "linear.teamKey"],
        message: "Linear mode requires either linear.teamId or linear.teamKey.",
        retryable: false,
      },
    ]);
  }

  const createClient =
    options.createClient ??
    ((resolvedApiKey: string) => new LinearClient(resolvedApiKey));
  const client = createClient(apiKey);

  try {
    const team = await client.getTeam(teamLookup);
    if (!team) {
      return invalidResult(config, apiKeyPresent, [
        {
          code: "invalid_linear_team",
          field: config.linear.teamId ? "linear.teamId" : "linear.teamKey",
          message: `Configured Linear team could not be resolved: ${JSON.stringify(teamLookup)}.`,
          retryable: false,
        },
      ]);
    }

    resolved.team = summarizeTeam(team);

    if (config.linear.projectId) {
      const project = await client.getProject(config.linear.projectId);
      if (!project) {
        return invalidResult(config, apiKeyPresent, [
          {
            code: "invalid_linear_project",
            field: "linear.projectSlug",
            message: `Configured Linear project could not be resolved: ${JSON.stringify(config.linear.projectId)}.`,
            retryable: false,
          },
        ], resolved);
      }
      resolved.project = summarizeProject(project);
    }

    return {
      ok: true,
      status: "valid",
      mode: config.workflowMode,
      isLinearMode: true,
      path: config.path,
      apiKeyPresent: true,
      config,
      diagnostics: [],
      resolved,
    };
  } catch (error) {
    const classified = classifyLinearError(error);
    if (classified.kind === "auth_error") {
      return invalidResult(config, apiKeyPresent, [
        {
          code: "linear_auth_error",
          field: "LINEAR_API_KEY",
          message: classified.message,
          retryable: false,
        },
      ], resolved);
    }

    return invalidResult(config, apiKeyPresent, [
      {
        code: "linear_network_error",
        message: classified.message,
        retryable:
          classified.kind === "network_error" ||
          classified.kind === "rate_limited" ||
          classified.kind === "server_error",
      },
    ], resolved);
  }
}

function buildLinearEntrypointGuard(
  entrypoint: WorkflowEntrypoint,
  protocol: WorkflowProtocolResolution,
): WorkflowEntrypointGuard {
  switch (entrypoint) {
    case "smart-entry":
      return {
        mode: "linear",
        isLinearMode: true,
        allow: true,
        noticeLevel: "info",
        notice: "Running in Linear mode. Milestone artifacts stored in Linear.",
        protocol,
      };
    case "queue":
      return blockedLinearEntrypoint(
        protocol,
        "This project is configured for Linear mode. /kata queue still appends file-backed Kata artifacts and is blocked until Linear document storage is wired.",
      );
    case "discuss":
      return {
        mode: "linear",
        isLinearMode: true,
        allow: true,
        noticeLevel: "info",
        notice: "Running in Linear mode. Discussion artifacts stored in Linear.",
        protocol,
      };
    case "plan":
      return {
        mode: "linear",
        isLinearMode: true,
        allow: true,
        noticeLevel: "info",
        notice: "Running in Linear mode. Planning artifacts stored in Linear.",
        protocol,
      };
    case "status":
    case "dashboard":
      return {
        mode: "linear",
        isLinearMode: true,
        allow: true,
        noticeLevel: "info",
        notice: "Showing live progress derived from Linear API.",
        protocol,
      };
    case "auto":
      return {
        mode: "linear",
        isLinearMode: true,
        allow: true,
        noticeLevel: "info",
        notice: "Running in Linear mode. State derived from Linear API.",
        protocol,
      };
    case "system-prompt":
      return {
        mode: "linear",
        isLinearMode: true,
        allow: true,
        noticeLevel: "warning",
        notice: protocol.ready
          ? "Workflow mode is linear. Follow the Linear mode instructions in KATA-WORKFLOW.md. Do not fall back to file-backed .kata artifacts."
          : "Workflow mode is linear. Do not fall back to file-backed .kata artifacts. Workflow document not found — use `/kata prefs status` to inspect config.",
        protocol,
      };
    default:
      return blockedLinearEntrypoint(
        protocol,
        "This project is configured for Linear mode. This file-backed Kata entrypoint is blocked until the Linear workflow runtime is wired.",
      );
  }
}

function buildGithubEntrypointGuard(
  entrypoint: WorkflowEntrypoint,
  protocol: WorkflowProtocolResolution,
): WorkflowEntrypointGuard {
  // GitHub mode in S01 supports read-only/status-oriented flows.
  const supportedEntrypoints: WorkflowEntrypoint[] = [
    "smart-entry",
    "status",
    "dashboard",
    "discuss",
    "system-prompt",
  ];

  if (supportedEntrypoints.includes(entrypoint)) {
    const noticeMap: Partial<Record<WorkflowEntrypoint, string>> = {
      "smart-entry": "Running in GitHub mode. Milestone artifacts stored in GitHub.",
      status: "Showing live progress derived from GitHub API.",
      dashboard: "Showing live progress derived from GitHub API.",
      discuss: "Running in GitHub mode. Discussion artifacts stored in GitHub.",
      "system-prompt": protocol.ready
        ? "Workflow mode is GitHub. Follow the GitHub mode instructions in KATA-WORKFLOW.md. Do not fall back to file-backed .kata artifacts."
        : "Workflow mode is GitHub. Do not fall back to file-backed .kata artifacts. Workflow document not found — use `/kata prefs status` to inspect config.",
    };
    return {
      mode: "github",
      isLinearMode: false,
      allow: true,
      noticeLevel: entrypoint === "system-prompt" ? "warning" : "info",
      notice: noticeMap[entrypoint] ?? `Running in GitHub mode.`,
      protocol,
    };
  }

  if (entrypoint === "plan" || entrypoint === "auto") {
    return {
      mode: "github",
      isLinearMode: false,
      allow: false,
      noticeLevel: "warning",
      notice:
        "GitHub mode planning and auto execution are not available yet. Use `/kata status` or `/kata discuss` for S01 read-only workflows.",
      protocol,
    };
  }

  // Block unsupported file-backed entrypoints
  return {
    mode: "github",
    isLinearMode: false,
    allow: false,
    noticeLevel: "warning",
    notice: "This project is configured for GitHub mode. This file-backed Kata entrypoint is not supported in GitHub mode.",
    protocol,
  };
}

function blockedLinearEntrypoint(
  protocol: WorkflowProtocolResolution,
  notice: string,
  noticeLevel: WorkflowEntrypointGuard["noticeLevel"] = "warning",
): WorkflowEntrypointGuard {
  return {
    mode: "linear",
    isLinearMode: true,
    allow: false,
    noticeLevel,
    notice,
    protocol,
  };
}

function invalidResult(
  config: EffectiveLinearProjectConfig,
  apiKeyPresent: boolean,
  diagnostics: LinearConfigDiagnostic[],
  resolved: LinearConfigValidationResult["resolved"] = {
    team: null,
    project: null,
  },
): LinearConfigValidationResult {
  return {
    ok: false,
    status: "invalid",
    mode: config.workflowMode,
    isLinearMode: config.isLinearMode,
    path: config.path,
    apiKeyPresent,
    config,
    diagnostics,
    resolved,
  };
}

function summarizeTeam(team: LinearTeam): Pick<LinearTeam, "id" | "key" | "name"> {
  return {
    id: team.id,
    key: team.key,
    name: team.name,
  };
}

function summarizeProject(
  project: LinearProject,
): Pick<LinearProject, "id" | "name" | "slugId" | "state" | "url"> {
  return {
    id: project.id,
    name: project.name,
    slugId: project.slugId,
    state: project.state,
    url: project.url,
  };
}

export function formatLinearConfigStatus(
  result: LinearConfigValidationResult,
): LinearConfigStatusReport {
  const lines: string[] = [
    `LINEAR_API_KEY: ${result.apiKeyPresent ? "present" : "missing"}`,
  ];

  if (result.config.linear.teamId) {
    lines.push(`linear.teamId: ${result.config.linear.teamId}`);
  }
  if (result.config.linear.teamKey) {
    lines.push(`linear.teamKey: ${result.config.linear.teamKey}`);
  }
  if (result.config.linear.projectId) {
    // The normalized projectId may originate from projectSlug or legacy projectId.
    // Use the value shape (UUIDs contain dashes) to display the correct field name.
    const projectLabel = UUID_RE.test(result.config.linear.projectId)
      ? "linear.projectId (legacy)"
      : "linear.projectSlug";
    lines.push(`${projectLabel}: ${result.config.linear.projectId}`);
  }

  lines.push(`validation: ${result.status}`);

  if (result.resolved.team) {
    lines.push(`resolved team: ${formatResolvedTeam(result.resolved.team)}`);
  }
  if (result.resolved.project) {
    lines.push(`resolved project: ${formatResolvedProject(result.resolved.project)}`);
  }

  for (const diagnostic of result.diagnostics) {
    lines.push(`diagnostic: ${diagnostic.code} — ${diagnostic.message}`);
    const action = getLinearDiagnosticAction(diagnostic);
    if (action) lines.push(`action: ${action}`);
  }

  return {
    level: result.ok ? "info" : "warning",
    lines,
  };
}

function formatResolvedTeam(
  team: NonNullable<LinearConfigValidationResult["resolved"]["team"]>,
): string {
  const name = team.name || team.key || team.id;
  const detailParts = [team.key, team.id].filter(Boolean);
  return detailParts.length > 0
    ? `${name} (${detailParts.join(" · ")})`
    : name;
}

function formatResolvedProject(
  project: NonNullable<LinearConfigValidationResult["resolved"]["project"]>,
): string {
  const name = project.name || project.slugId || project.id;
  const detailParts = [project.id, project.state].filter(Boolean);
  return detailParts.length > 0
    ? `${name} (${detailParts.join(" · ")})`
    : name;
}

function getLinearDiagnosticAction(
  diagnostic: LinearConfigDiagnostic,
): string | null {
  switch (diagnostic.code) {
    case "missing_linear_api_key":
      return "set LINEAR_API_KEY to validate this Linear binding.";
    case "missing_linear_team":
      return "set linear.teamId or linear.teamKey in .kata/preferences.md.";
    case "invalid_linear_team":
      return diagnostic.field === "linear.teamId"
        ? "update linear.teamId to a valid Linear team." 
        : "update linear.teamKey to a valid Linear team.";
    case "invalid_linear_project":
      return "update linear.projectSlug to a valid Linear project.";
    case "linear_auth_error":
      return "refresh LINEAR_API_KEY before retrying validation.";
    case "linear_network_error":
      return diagnostic.retryable
        ? "retry validation after the Linear API/network recovers."
        : "check Linear connectivity and retry validation.";
    default:
      return null;
  }
}
