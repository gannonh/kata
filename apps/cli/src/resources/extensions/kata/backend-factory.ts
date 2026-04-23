/**
 * Backend factory — creates the workflow backend for the active mode.
 *
 * Supported modes:
 * - linear (default)
 * - github
 */

import { debuglog } from "node:util";
import type { KataBackend } from "./backend.js";
import { GithubBackend } from "./github-backend.js";
import {
  formatGithubConfigStatus,
  resolveGithubToken,
  validateGithubConfig,
  type GithubConfigValidationResult,
} from "./github-config.js";
import {
  loadEffectiveLinearProjectConfig,
  resolveConfiguredLinearProjectId,
  resolveConfiguredLinearTeamId,
} from "./linear-config.js";
import { loadEffectiveKataPreferences, type LoadedKataPreferences } from "./preferences.js";
import { LinearClient } from "../linear/linear-client.js";
import { ensureKataLabels } from "../linear/linear-entities.js";
import { LinearBackend } from "./linear-backend.js";

interface BackendBootstrapEvent {
  backend: "linear" | "github";
  status: "ready" | "invalid_config" | "error";
  detail?: string;
  diagnostics?: string[];
}

const debugBackendBootstrap = debuglog("kata_backend_bootstrap");

function emitBackendBootstrap(event: BackendBootstrapEvent): void {
  // Keep this silent for end users by default (slash command output should not
  // be polluted by internal bootstrap telemetry). Enable explicit logging when
  // diagnosing backend selection issues.
  if (process.env.KATA_BACKEND_BOOTSTRAP_LOG === "1") {
    process.stderr.write(`[kata][backend-bootstrap] ${JSON.stringify(event)}\n`);
    return;
  }

  debugBackendBootstrap("%j", event);
}

function buildGithubBootstrapError(
  validation: GithubConfigValidationResult,
): Error {
  const report = formatGithubConfigStatus(validation);
  const relevantLines = report.lines.filter((line) =>
    line.startsWith("GITHUB_TOKEN:") ||
    line.startsWith("github.") ||
    line.startsWith("validation:") ||
    line.startsWith("diagnostic:") ||
    line.startsWith("action:"),
  );

  const message = [
    "GitHub backend is not ready.",
    ...relevantLines,
    "Run /kata prefs status for full diagnostics.",
  ].join("\n");

  return new Error(message);
}

async function createGithubBackend(
  basePath: string,
  loadedPreferences: LoadedKataPreferences | null,
): Promise<KataBackend> {
  const validation = validateGithubConfig({ basePath, loadedPreferences });

  if (!validation.ok || !validation.trackerConfig) {
    const diagnostics = validation.diagnostics.map((diagnostic) => diagnostic.code);
    emitBackendBootstrap({
      backend: "github",
      status: "invalid_config",
      diagnostics,
    });
    throw buildGithubBootstrapError(validation);
  }

  const tokenResolution = resolveGithubToken();
  if (!tokenResolution.token) {
    emitBackendBootstrap({
      backend: "github",
      status: "invalid_config",
      diagnostics: ["missing_github_token"],
    });
    throw buildGithubBootstrapError({
      ...validation,
      ok: false,
      status: "invalid",
      tokenPresent: false,
      tokenSource: null,
      diagnostics: [
        ...validation.diagnostics,
        {
          code: "missing_github_token",
          message:
            "No GitHub token found. Token resolution order is KATA_GITHUB_TOKEN -> GH_TOKEN -> GITHUB_TOKEN -> gh auth token (when KATA_GITHUB_ENABLE_GH_CLI_FALLBACK is enabled) -> ~/.kata-cli/agent/auth.json (github.key). Set KATA_GITHUB_TOKEN/GH_TOKEN/GITHUB_TOKEN, run `gh auth login`, or add a github credential entry to ~/.kata-cli/agent/auth.json. Set KATA_GITHUB_ENABLE_GH_CLI_FALLBACK=false to skip gh CLI fallback.",
          field: "KATA_GITHUB_TOKEN",
          retryable: false,
        },
      ],
    });
  }

  emitBackendBootstrap({
    backend: "github",
    status: "ready",
    detail: `${validation.trackerConfig.repoOwner}/${validation.trackerConfig.repoName} (${validation.trackerConfig.stateMode})`,
  });

  return new GithubBackend(basePath, {
    token: tokenResolution.token,
    repoOwner: validation.trackerConfig.repoOwner,
    repoName: validation.trackerConfig.repoName,
    stateMode: validation.trackerConfig.stateMode,
    githubProjectNumber: validation.trackerConfig.githubProjectNumber,
    labelPrefix: validation.trackerConfig.labelPrefix ?? "kata:",
    apiBaseUrl: process.env.KATA_GITHUB_API_BASE_URL,
  });
}

async function createLinearBackend(
  basePath: string,
  loadedPreferences: LoadedKataPreferences | null,
): Promise<KataBackend> {
  const apiKey = process.env.KATA_LINEAR_API_KEY ?? process.env.LINEAR_API_KEY;
  if (!apiKey) {
    emitBackendBootstrap({
      backend: "linear",
      status: "invalid_config",
      diagnostics: ["missing_linear_api_key"],
    });
    throw new Error(
      "LINEAR_API_KEY is not set. Set it in your environment to use Linear mode (KATA_LINEAR_API_KEY or LINEAR_API_KEY).",
    );
  }

  const client = new LinearClient(apiKey);

  // Resolve projectId slug → UUID if needed (filter expressions require UUIDs).
  const projectResolution = await resolveConfiguredLinearProjectId(client, loadedPreferences);
  if (!projectResolution.projectId) {
    emitBackendBootstrap({
      backend: "linear",
      status: "invalid_config",
      diagnostics: ["missing_linear_project"],
    });
    throw new Error(
      projectResolution.error ??
        "Linear project not configured — set linear.projectSlug in .kata/preferences.md.",
    );
  }
  const projectId = projectResolution.projectId;

  // Retry API calls up to 3 times with backoff — Linear API can be transiently unavailable.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const teamResolution = await resolveConfiguredLinearTeamId(
        client,
        loadedPreferences,
      );
      if (!teamResolution.teamId) {
        throw new Error(
          teamResolution.error ??
            "Linear team could not be resolved. Check linear.teamId or linear.teamKey in preferences.",
        );
      }

      const labelSet = await ensureKataLabels(client, teamResolution.teamId);

      emitBackendBootstrap({
        backend: "linear",
        status: "ready",
        detail: `${projectId} / ${teamResolution.teamId}`,
      });

      return new LinearBackend(basePath, {
        apiKey,
        projectId,
        teamId: teamResolution.teamId,
        labelSet,
      });
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Don't retry config errors — they won't resolve on retry.
      // Rate-limit errors ARE retriable (backoff handles the wait).
      if (
        msg.includes("not set") ||
        msg.includes("not configured") ||
        msg.includes("could not be resolved")
      ) {
        emitBackendBootstrap({
          backend: "linear",
          status: "invalid_config",
          detail: msg,
        });
        throw err;
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  emitBackendBootstrap({
    backend: "linear",
    status: "error",
    detail: lastError instanceof Error ? lastError.message : String(lastError ?? "unknown"),
  });
  throw lastError ?? new Error("LinearBackend initialization failed after retries");
}

/**
 * Create the configured workflow backend for the current project.
 */
export async function createBackend(basePath: string): Promise<KataBackend> {
  const loadedPreferences = loadEffectiveKataPreferences(basePath);
  const config = loadEffectiveLinearProjectConfig(loadedPreferences);

  if (config.isGithubMode) {
    return createGithubBackend(basePath, loadedPreferences);
  }

  return createLinearBackend(basePath, loadedPreferences);
}
