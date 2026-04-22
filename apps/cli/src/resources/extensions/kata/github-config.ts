/**
 * GitHub Tracker Config Resolver
 *
 * Reads GitHub tracker settings from `.kata/preferences.md` (`github` block),
 * resolves auth token from environment / auth store, and emits actionable,
 * redacted diagnostics when configuration is incomplete.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { debuglog } from "node:util";

import {
  loadEffectiveKataPreferences,
  type KataGithubPreferences,
  type LoadedKataPreferences,
  type WorkflowMode,
} from "./preferences.js";

const debug = debuglog("kata:github-config");

export type GithubStateMode = "projects_v2" | "labels";

export interface GithubTrackerConfig {
  repoOwner: string;
  repoName: string;
  stateMode: GithubStateMode;
  githubProjectNumber?: number;
  labelPrefix?: string;
}

export type GithubConfigDiagnosticCode =
  | "missing_github_config"
  | "missing_repo_owner"
  | "missing_repo_name"
  | "invalid_github_project_number"
  | "invalid_state_mode"
  | "missing_github_token";

export interface GithubConfigDiagnostic {
  code: GithubConfigDiagnosticCode;
  message: string;
  field?: string;
  retryable: boolean;
}

export interface GithubConfigStatusReport {
  level: "info" | "warning";
  lines: string[];
}

export interface GithubConfigValidationResult {
  ok: boolean;
  status: "valid" | "invalid" | "skipped";
  mode: WorkflowMode;
  tokenPresent: boolean;
  tokenSource: string | null;
  trackerConfig: GithubTrackerConfig | null;
  diagnostics: GithubConfigDiagnostic[];
}

/**
 * Legacy export kept for compatibility with existing callers/tests.
 * GitHub tracker config now lives in `.kata/preferences.md`.
 */
export function resolveGithubWorkflowPath(
  basePath: string = process.cwd(),
): string {
  return join(basePath, ".kata", "preferences.md");
}

function buildTrackerConfigFromPreferences(
  githubPrefs: KataGithubPreferences | undefined,
): {
  config: GithubTrackerConfig | null;
  diagnostic: GithubConfigDiagnostic | null;
} {
  if (!githubPrefs) {
    return {
      config: null,
      diagnostic: {
        code: "missing_github_config",
        message:
          "GitHub workflow mode requires a `github:` block in .kata/preferences.md.",
        field: "github",
        retryable: false,
      },
    };
  }

  const repoOwner = githubPrefs.repoOwner?.trim() ?? "";
  if (!repoOwner) {
    return {
      config: null,
      diagnostic: {
        code: "missing_repo_owner",
        message:
          "github.repoOwner is required when workflow.mode is github. Add it to .kata/preferences.md.",
        field: "github.repoOwner",
        retryable: false,
      },
    };
  }

  const repoName = githubPrefs.repoName?.trim() ?? "";
  if (!repoName) {
    return {
      config: null,
      diagnostic: {
        code: "missing_repo_name",
        message:
          "github.repoName is required when workflow.mode is github. Add it to .kata/preferences.md.",
        field: "github.repoName",
        retryable: false,
      },
    };
  }

  const githubProjectNumber = githubPrefs.githubProjectNumber;
  if (
    githubProjectNumber !== undefined &&
    (!Number.isFinite(githubProjectNumber) ||
      githubProjectNumber <= 0 ||
      !Number.isInteger(githubProjectNumber))
  ) {
    return {
      config: null,
      diagnostic: {
        code: "invalid_github_project_number",
        message: "github.githubProjectNumber must be a positive integer.",
        field: "github.githubProjectNumber",
        retryable: false,
      },
    };
  }

  const rawStateMode = githubPrefs.stateMode?.trim().toLowerCase();
  if (
    rawStateMode !== undefined &&
    rawStateMode !== "labels" &&
    rawStateMode !== "projects_v2"
  ) {
    return {
      config: null,
      diagnostic: {
        code: "invalid_state_mode",
        message: 'github.stateMode must be "labels" or "projects_v2".',
        field: "github.stateMode",
        retryable: false,
      },
    };
  }

  if (rawStateMode === "projects_v2" && githubProjectNumber === undefined) {
    return {
      config: null,
      diagnostic: {
        code: "invalid_github_project_number",
        message:
          "github.githubProjectNumber is required when github.stateMode is \"projects_v2\".",
        field: "github.githubProjectNumber",
        retryable: false,
      },
    };
  }

  const stateMode: GithubStateMode =
    (rawStateMode as GithubStateMode | undefined) ??
    (githubProjectNumber !== undefined ? "projects_v2" : "labels");

  return {
    config: {
      repoOwner,
      repoName,
      stateMode,
      ...(githubProjectNumber !== undefined && { githubProjectNumber }),
      ...(githubPrefs.labelPrefix
        ? { labelPrefix: githubPrefs.labelPrefix }
        : {}),
    },
    diagnostic: null,
  };
}

/**
 * Legacy signature preserved. `workflowPath` is ignored.
 */
export function loadGithubTrackerConfig(
  workflowPath?: string,
  basePath?: string,
  loadedPreferences?: LoadedKataPreferences | null,
): {
  config: GithubTrackerConfig | null;
  diagnostic: GithubConfigDiagnostic | null;
} {
  void workflowPath;

  const effective =
    loadedPreferences ??
    loadEffectiveKataPreferences(basePath ?? process.cwd());
  const githubPrefs = effective?.preferences.github;
  return buildTrackerConfigFromPreferences(githubPrefs);
}

export interface ResolvedGithubToken {
  token: string | null;
  source: string | null;
}

const GH_CLI_FALLBACK_DISABLE_VALUES = new Set([
  "0",
  "false",
  "no",
  "off",
  "disabled",
]);

const ghCliTokenCache = new Map<string, ResolvedGithubToken>();
let warnedInvalidGhCliApiBase = false;

function isGhCliFallbackEnabled(): boolean {
  const raw = (process.env.KATA_GITHUB_ENABLE_GH_CLI_FALLBACK ?? "")
    .trim()
    .toLowerCase();
  return !GH_CLI_FALLBACK_DISABLE_VALUES.has(raw);
}

function resolveGithubHostnameForGhCli(): string {
  const apiBase = process.env.KATA_GITHUB_API_BASE_URL?.trim();
  if (!apiBase) return "github.com";

  try {
    const parsed = new URL(apiBase);
    return parsed.hostname || "github.com";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    debug(
      "Invalid KATA_GITHUB_API_BASE_URL for gh CLI host resolution (%s): %s",
      apiBase,
      message,
    );
    if (!warnedInvalidGhCliApiBase) {
      warnedInvalidGhCliApiBase = true;
      console.warn(
        `[kata:github-config] Invalid KATA_GITHUB_API_BASE_URL for gh CLI host resolution (${apiBase}): ${message}. Falling back to github.com.`,
      );
    }
    return "github.com";
  }
}

/**
 * Test-only hook for deterministic gh-cli fallback tests.
 */
export function resetGithubTokenResolutionCacheForTests(): void {
  ghCliTokenCache.clear();
}

function resolveGithubTokenFromGhCli(): ResolvedGithubToken {
  if (!isGhCliFallbackEnabled()) {
    return { token: null, source: null };
  }

  const hostname = resolveGithubHostnameForGhCli();
  const cached = ghCliTokenCache.get(hostname);
  if (cached) return cached;

  const forcedOutput = process.env.KATA_TEST_GH_AUTH_TOKEN_OUTPUT;
  if (forcedOutput !== undefined) {
    if (forcedOutput === "__THROW__") {
      return { token: null, source: null };
    }
    const value = forcedOutput.trim();
    if (!value) return { token: null, source: null };
    const resolved = {
      token: value,
      source: `gh auth token (${hostname})`,
    };
    ghCliTokenCache.set(hostname, resolved);
    return resolved;
  }

  try {
    const output = execFileSync("gh", ["auth", "token", "--hostname", hostname], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 2000,
      windowsHide: true,
    }).trim();
    if (!output) return { token: null, source: null };
    const resolved = {
      token: output,
      source: `gh auth token (${hostname})`,
    };
    ghCliTokenCache.set(hostname, resolved);
    return resolved;
  } catch (err) {
    debug(
      "Unable to resolve token from gh auth token for host %s: %s",
      hostname,
      err instanceof Error ? err.message : String(err),
    );
    return { token: null, source: null };
  }
}

export function resolveGithubToken(authFilePath?: string): ResolvedGithubToken {
  const kataToken = process.env.KATA_GITHUB_TOKEN;
  if (kataToken) return { token: kataToken, source: "KATA_GITHUB_TOKEN" };

  const ghToken = process.env.GH_TOKEN;
  if (ghToken) return { token: ghToken, source: "GH_TOKEN" };

  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) return { token: githubToken, source: "GITHUB_TOKEN" };

  // Prefer the authenticated GitHub CLI token over stale persisted keys so
  // projects-v2 updates keep working without manual exports.
  const ghCliToken = resolveGithubTokenFromGhCli();
  if (ghCliToken.token) return ghCliToken;

  const authPath =
    authFilePath ?? join(homedir(), ".kata-cli", "agent", "auth.json");
  const authExists = existsSync(authPath);
  try {
    if (authExists) {
      const raw = readFileSync(authPath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const record = (parsed as Record<string, unknown>)["github"];
        if (
          record &&
          typeof record === "object" &&
          "type" in record &&
          "key" in record &&
          typeof (record as { key: unknown }).key === "string"
        ) {
          const key = (record as { key: string }).key;
          if (key) return { token: key, source: "auth.json (github provider)" };
        }
      }
    }
  } catch (err) {
    if (authExists) {
      debug(
        "Failed to parse auth.json (github provider) at %s: %s",
        authPath,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { token: null, source: null };
}

export interface ValidateGithubConfigOptions {
  basePath?: string;
  authFilePath?: string;
  loadedPreferences?: LoadedKataPreferences | null;
}

export function validateGithubConfig(
  options: ValidateGithubConfigOptions = {},
): GithubConfigValidationResult {
  const { basePath, authFilePath, loadedPreferences } = options;

  const { token, source } = resolveGithubToken(authFilePath);
  const tokenPresent = token !== null;

  const { config, diagnostic: trackerDiagnostic } = loadGithubTrackerConfig(
    undefined,
    basePath,
    loadedPreferences,
  );

  const diagnostics: GithubConfigDiagnostic[] = [];

  if (trackerDiagnostic) diagnostics.push(trackerDiagnostic);

  if (!tokenPresent) {
    const loginHint = isGhCliFallbackEnabled()
      ? "; run `gh auth login`"
      : "";
    diagnostics.push({
      code: "missing_github_token",
      message:
        `No GitHub token found. Set KATA_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN${loginHint}; or add a github credential entry to ~/.kata-cli/agent/auth.json.`,
      field: "KATA_GITHUB_TOKEN",
      retryable: false,
    });
  }

  const ok = diagnostics.length === 0;

  return {
    ok,
    status: ok ? "valid" : "invalid",
    mode: "github",
    tokenPresent,
    tokenSource: source,
    trackerConfig: config,
    diagnostics,
  };
}

export function formatGithubConfigStatus(
  result: GithubConfigValidationResult,
): GithubConfigStatusReport {
  const lines: string[] = [
    `GITHUB_TOKEN: ${result.tokenPresent ? `present (via ${result.tokenSource})` : "missing"}`,
  ];

  if (result.trackerConfig) {
    lines.push(
      `github.repo: ${result.trackerConfig.repoOwner}/${result.trackerConfig.repoName}`,
    );
    lines.push(`github.state_mode: ${result.trackerConfig.stateMode}`);
    if (result.trackerConfig.githubProjectNumber !== undefined) {
      lines.push(
        `github.githubProjectNumber: ${result.trackerConfig.githubProjectNumber}`,
      );
    }
    if (result.trackerConfig.labelPrefix !== undefined) {
      lines.push(`github.labelPrefix: ${result.trackerConfig.labelPrefix}`);
    }
  }

  lines.push(`validation: ${result.status}`);

  for (const diagnostic of result.diagnostics) {
    lines.push(`diagnostic: ${diagnostic.code} — ${diagnostic.message}`);
    const action = getGithubDiagnosticAction(diagnostic);
    if (action) lines.push(`action: ${action}`);
  }

  return {
    level: result.ok ? "info" : "warning",
    lines,
  };
}

function getGithubDiagnosticAction(
  diagnostic: GithubConfigDiagnostic,
): string | null {
  switch (diagnostic.code) {
    case "missing_github_token":
      return isGhCliFallbackEnabled()
        ? "set KATA_GITHUB_TOKEN/GH_TOKEN/GITHUB_TOKEN, or run `gh auth login` (Kata auto-reads `gh auth token`)."
        : "set KATA_GITHUB_TOKEN/GH_TOKEN/GITHUB_TOKEN in your environment or auth.json.";
    case "missing_github_config":
      return "add a github: block to .kata/preferences.md with repoOwner and repoName.";
    case "missing_repo_owner":
      return "set github.repoOwner in .kata/preferences.md.";
    case "missing_repo_name":
      return "set github.repoName in .kata/preferences.md.";
    case "invalid_github_project_number":
      return "set github.githubProjectNumber to a positive integer, or remove it.";
    case "invalid_state_mode":
      return 'set github.stateMode to "labels" or "projects_v2".';
    default:
      return null;
  }
}
