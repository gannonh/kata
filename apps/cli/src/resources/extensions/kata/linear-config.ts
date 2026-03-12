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

export interface LinearConfigValidationClient {
  getTeam(idOrKey: string): Promise<LinearTeam | null>;
  getProject(id: string): Promise<LinearProject | null>;
}

export interface ValidateLinearProjectConfigOptions {
  loadedPreferences?: LoadedKataPreferences | null;
  apiKey?: string | null;
  createClient?: (apiKey: string) => LinearConfigValidationClient;
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
