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
  | "status"
  | "dashboard"
  | "auto"
  | "doctor"
  | "doctor-heal"
  | "system-prompt";

export interface WorkflowProtocolResolution {
  mode: WorkflowMode;
  documentName: "KATA-WORKFLOW.md" | "LINEAR-WORKFLOW.md";
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
  if (typeof mode !== "string") return "file";
  const normalized = mode.trim().toLowerCase();
  return normalized === "linear" ? "linear" : "file";
}

export function loadEffectiveLinearProjectConfig(
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): EffectiveLinearProjectConfig {
  const preferences = loadedPreferences?.preferences;
  const workflowMode = normalizeWorkflowMode(preferences?.workflow?.mode);

  return {
    path: loadedPreferences?.path ?? null,
    scope: loadedPreferences?.scope ?? null,
    workflowMode,
    isLinearMode: workflowMode === "linear",
    linear: {
      teamId: preferences?.linear?.teamId ?? null,
      teamKey: preferences?.linear?.teamKey ?? null,
      projectId: preferences?.linear?.projectId ?? null,
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

export function resolveWorkflowProtocol(
  loadedPreferences: LoadedKataPreferences | null = loadEffectiveKataPreferences(),
): WorkflowProtocolResolution {
  const mode = getWorkflowMode(loadedPreferences);

  if (mode === "linear") {
    const linearPath =
      process.env.LINEAR_WORKFLOW_PATH ??
      join(process.env.HOME ?? homedir(), ".kata-cli", "LINEAR-WORKFLOW.md");
    const ready = existsSync(linearPath);
    return {
      mode,
      documentName: "LINEAR-WORKFLOW.md",
      path: ready ? linearPath : null,
      ready,
    };
  }

  const kataPath =
    process.env.KATA_WORKFLOW_PATH ??
    join(process.env.HOME ?? homedir(), ".kata-cli", "KATA-WORKFLOW.md");
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
  const mode = getWorkflowMode(loadedPreferences);
  const protocol = resolveWorkflowProtocol(loadedPreferences);

  if (mode !== "linear") {
    return {
      mode,
      isLinearMode: false,
      allow: true,
      noticeLevel: "info",
      notice: null,
      protocol,
    };
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

  if (!config.isLinearMode) {
    return {
      ok: true,
      status: "skipped",
      mode: config.workflowMode,
      isLinearMode: false,
      path: config.path,
      apiKeyPresent,
      config,
      diagnostics: [],
      resolved,
    };
  }

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
            field: "linear.projectId",
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
      return blockedLinearEntrypoint(
        protocol,
        "This project is configured for Linear mode. /kata still routes through the file-backed workflow wizard, so it stops here instead of silently falling back to .kata files. Use `/kata prefs status` to inspect the active mode and config health until S06 wires Linear dispatch.",
      );
    case "queue":
      return blockedLinearEntrypoint(
        protocol,
        "This project is configured for Linear mode. /kata queue still appends file-backed Kata artifacts and is blocked until Linear document storage is wired.",
      );
    case "discuss":
      return blockedLinearEntrypoint(
        protocol,
        "This project is configured for Linear mode. /kata discuss still dispatches the file-backed Kata workflow and is blocked until the Linear workflow prompt is available.",
      );
    case "status":
    case "dashboard":
      return blockedLinearEntrypoint(
        protocol,
        "This project is configured for Linear mode. /kata status and the dashboard still derive progress from local .kata files. Use `/kata prefs status` for mode/config inspection until S05 wires Linear state derivation.",
        "info",
      );
    case "auto":
      return blockedLinearEntrypoint(
        protocol,
        "This project is configured for Linear mode. /kata auto still executes the file-backed workflow and is blocked until S06 wires Linear execution.",
      );
    case "doctor":
      return blockedLinearEntrypoint(
        protocol,
        "This project is configured for Linear mode. /kata doctor still audits file-backed .kata artifacts and is blocked until Linear workflow storage and state derivation land.",
      );
    case "doctor-heal":
      return blockedLinearEntrypoint(
        protocol,
        "This project is configured for Linear mode. /kata doctor heal still dispatches the file-backed Kata workflow and is blocked until a Linear workflow prompt exists.",
      );
    case "system-prompt":
      return {
        mode: "linear",
        isLinearMode: true,
        allow: true,
        noticeLevel: "warning",
        notice: protocol.ready
          ? `Workflow mode is linear. Prefer ${protocol.documentName} and Linear-backed runtime surfaces instead of the file-backed .kata workflow. Do not silently fall back to KATA-WORKFLOW.md.`
          : "Workflow mode is linear. Do not silently fall back to the file-backed .kata workflow. Linear prompt/runtime wiring is still pending, so use `/kata prefs status` to inspect mode and config health until the Linear workflow prompt lands.",
        protocol,
      };
    default:
      return blockedLinearEntrypoint(
        protocol,
        "This project is configured for Linear mode. This file-backed Kata entrypoint is blocked until the Linear workflow runtime is wired.",
      );
  }
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
  if (!result.isLinearMode) {
    return {
      level: "info",
      lines: ["linear: inactive (file mode)"],
    };
  }

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
    lines.push(`linear.projectId: ${result.config.linear.projectId}`);
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
      return "update linear.projectId to a valid Linear project or remove it.";
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
