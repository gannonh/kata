/**
 * GitHub Tracker Config Resolver
 *
 * Reads GitHub tracker settings from WORKFLOW.md frontmatter,
 * resolves auth token from environment / auth store, and emits
 * actionable, redacted diagnostics when configuration is incomplete.
 *
 * Field contract (matches Symphony config.rs `RawTrackerConfig` + Desktop workflow-config-reader):
 *   tracker:
 *     kind: github
 *     repo_owner: <org-or-user>
 *     repo_name: <repo>
 *     github_project_number: <positive-integer>   (optional; enables Projects v2 mode)
 *     label_prefix: kata:                          (optional; defaults to "kata:")
 *
 * Token resolution order:
 *   KATA_GITHUB_TOKEN → GH_TOKEN → GITHUB_TOKEN → auth.json "github" provider
 *
 * Redaction constraint: diagnostics reference key names only — never token values.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { WorkflowMode } from "./preferences.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GithubStateMode = "projects_v2" | "labels";

/** Parsed GitHub tracker configuration from WORKFLOW.md frontmatter. */
export interface GithubTrackerConfig {
  repoOwner: string;
  repoName: string;
  stateMode: GithubStateMode;
  githubProjectNumber?: number;
  labelPrefix?: string;
}

export type GithubConfigDiagnosticCode =
  | "missing_workflow_file"
  | "invalid_workflow_file"
  | "unsupported_tracker_kind"
  | "missing_repo_owner"
  | "missing_repo_name"
  | "invalid_github_project_number"
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
  /** Key name of the token source, never the value (e.g. "KATA_GITHUB_TOKEN"). */
  tokenSource: string | null;
  trackerConfig: GithubTrackerConfig | null;
  diagnostics: GithubConfigDiagnostic[];
}

// ─── WORKFLOW.md parsing ──────────────────────────────────────────────────────

/**
 * Resolve the WORKFLOW.md path for the given base directory.
 * Checks KATA_GITHUB_WORKFLOW_PATH env var first (enables testing override).
 * Falls back to `<basePath>/WORKFLOW.md`.
 */
export function resolveGithubWorkflowPath(basePath: string = process.cwd()): string {
  return process.env.KATA_GITHUB_WORKFLOW_PATH ?? join(basePath, "WORKFLOW.md");
}

/**
 * Parse WORKFLOW.md frontmatter and extract GitHub tracker configuration.
 * Returns a diagnostic on every error so callers get field-specific feedback.
 */
export function loadGithubTrackerConfig(
  workflowPath?: string,
  basePath?: string,
): { config: GithubTrackerConfig | null; diagnostic: GithubConfigDiagnostic | null } {
  const resolvedPath = workflowPath ?? resolveGithubWorkflowPath(basePath);

  if (!existsSync(resolvedPath)) {
    return {
      config: null,
      diagnostic: {
        code: "missing_workflow_file",
        message: `WORKFLOW.md not found at ${resolvedPath}. Create it with a tracker: block to configure GitHub mode.`,
        field: "WORKFLOW.md",
        retryable: false,
      },
    };
  }

  let content: string;
  try {
    content = readFileSync(resolvedPath, "utf-8");
  } catch (err) {
    return {
      config: null,
      diagnostic: {
        code: "invalid_workflow_file",
        message: `Unable to read WORKFLOW.md: ${err instanceof Error ? err.message : String(err)}`,
        field: "WORKFLOW.md",
        retryable: false,
      },
    };
  }

  // Strip optional BOM, extract YAML frontmatter
  const frontmatterMatch = content.replace(/^\uFEFF/, "").match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch?.[1]) {
    return {
      config: null,
      diagnostic: {
        code: "invalid_workflow_file",
        message: "WORKFLOW.md is missing YAML frontmatter (---). Add a tracker: block at the top.",
        field: "WORKFLOW.md",
        retryable: false,
      },
    };
  }

  const frontmatter = frontmatterMatch[1];
  const trackerBlock = extractNestedBlock(frontmatter, "tracker");

  if (!trackerBlock) {
    // No tracker block means default Linear — but caller is in GitHub mode,
    // so this is a missing-config situation.
    return {
      config: null,
      diagnostic: {
        code: "unsupported_tracker_kind",
        message:
          "No tracker: block found in WORKFLOW.md. Add `tracker:\\n  kind: github` (plus repo_owner and repo_name) to configure GitHub mode.",
        field: "tracker.kind",
        retryable: false,
      },
    };
  }

  const fields = parseSimpleYamlObject(trackerBlock);
  const kind = stripYamlWrapping(fields.kind ?? "").toLowerCase();

  if (kind !== "github") {
    return {
      config: null,
      diagnostic: {
        code: "unsupported_tracker_kind",
        message: `tracker.kind is "${kind || "(unset)"}" but workflow.mode is "github". Set tracker.kind: github in WORKFLOW.md.`,
        field: "tracker.kind",
        retryable: false,
      },
    };
  }

  const repoOwner = stripYamlWrapping(fields.repo_owner ?? "");
  if (!repoOwner) {
    return {
      config: null,
      diagnostic: {
        code: "missing_repo_owner",
        message:
          "tracker.repo_owner is required when tracker.kind is github. Add it to WORKFLOW.md.",
        field: "tracker.repo_owner",
        retryable: false,
      },
    };
  }

  const repoName = stripYamlWrapping(fields.repo_name ?? "");
  if (!repoName) {
    return {
      config: null,
      diagnostic: {
        code: "missing_repo_name",
        message:
          "tracker.repo_name is required when tracker.kind is github. Add it to WORKFLOW.md.",
        field: "tracker.repo_name",
        retryable: false,
      },
    };
  }

  const projectNumberRaw = stripYamlWrapping(fields.github_project_number ?? "");
  let githubProjectNumber: number | undefined;
  if (projectNumberRaw) {
    const parsed = Number(projectNumberRaw);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      return {
        config: null,
        diagnostic: {
          code: "invalid_github_project_number",
          message:
            "tracker.github_project_number must be a positive integer in WORKFLOW.md.",
          field: "tracker.github_project_number",
          retryable: false,
        },
      };
    }
    githubProjectNumber = parsed;
  }

  const labelPrefix =
    stripYamlWrapping(fields.label_prefix ?? "") || undefined;

  return {
    config: {
      repoOwner,
      repoName,
      stateMode: githubProjectNumber ? "projects_v2" : "labels",
      ...(githubProjectNumber !== undefined && { githubProjectNumber }),
      ...(labelPrefix !== undefined && { labelPrefix }),
    },
    diagnostic: null,
  };
}

// ─── Token resolution ─────────────────────────────────────────────────────────

export interface ResolvedGithubToken {
  /** The token value, or null if not found. Never log or display this. */
  token: string | null;
  /** Human-readable key name of the token source (safe to display). */
  source: string | null;
}

/**
 * Resolve GitHub auth token using the canonical priority order:
 *   KATA_GITHUB_TOKEN → GH_TOKEN → GITHUB_TOKEN → auth.json "github" provider
 *
 * Returns { token, source } where token is null when not found.
 * Safe to call without an auth store — auth.json lookup is best-effort.
 */
export function resolveGithubToken(authFilePath?: string): ResolvedGithubToken {
  // 1. KATA_GITHUB_TOKEN — Kata-specific override
  const kataToken = process.env.KATA_GITHUB_TOKEN;
  if (kataToken) return { token: kataToken, source: "KATA_GITHUB_TOKEN" };

  // 2. GH_TOKEN — gh CLI standard
  const ghToken = process.env.GH_TOKEN;
  if (ghToken) return { token: ghToken, source: "GH_TOKEN" };

  // 3. GITHUB_TOKEN — broad GitHub convention
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) return { token: githubToken, source: "GITHUB_TOKEN" };

  // 4. auth.json "github" provider — Kata auth store
  const authPath = authFilePath ?? join(homedir(), ".kata-cli", "agent", "auth.json");
  try {
    if (existsSync(authPath)) {
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
  } catch {
    // auth.json read failure is non-fatal — fall through to not-found
  }

  return { token: null, source: null };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidateGithubConfigOptions {
  workflowPath?: string;
  basePath?: string;
  authFilePath?: string;
}

/**
 * Validate the full GitHub configuration (tracker config + token).
 * Returns a structured result with diagnostics for every failure mode.
 *
 * This is the single entry point for GitHub config readiness checks,
 * consumed by `/kata prefs status` and backend initialization.
 */
export function validateGithubConfig(
  options: ValidateGithubConfigOptions = {},
): GithubConfigValidationResult {
  const { workflowPath, basePath, authFilePath } = options;

  const { token, source } = resolveGithubToken(authFilePath);
  const tokenPresent = token !== null;

  const { config, diagnostic: trackerDiagnostic } = loadGithubTrackerConfig(
    workflowPath,
    basePath,
  );

  const diagnostics: GithubConfigDiagnostic[] = [];

  if (trackerDiagnostic) {
    diagnostics.push(trackerDiagnostic);
  }

  if (!tokenPresent) {
    diagnostics.push({
      code: "missing_github_token",
      message:
        "No GitHub token found. Set KATA_GITHUB_TOKEN, GH_TOKEN, GITHUB_TOKEN, or store a credential via Kata onboarding.",
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

// ─── Status formatting ────────────────────────────────────────────────────────

/**
 * Format a GitHub config validation result into human-readable status lines.
 * Mirrors `formatLinearConfigStatus` — safe to display, no secret values.
 */
export function formatGithubConfigStatus(
  result: GithubConfigValidationResult,
): GithubConfigStatusReport {
  const lines: string[] = [
    `GITHUB_TOKEN: ${result.tokenPresent ? `present (via ${result.tokenSource})` : "missing"}`,
  ];

  if (result.trackerConfig) {
    lines.push(`tracker.repo: ${result.trackerConfig.repoOwner}/${result.trackerConfig.repoName}`);
    lines.push(`tracker.state_mode: ${result.trackerConfig.stateMode}`);
    if (result.trackerConfig.githubProjectNumber !== undefined) {
      lines.push(`tracker.github_project_number: ${result.trackerConfig.githubProjectNumber}`);
    }
    if (result.trackerConfig.labelPrefix !== undefined) {
      lines.push(`tracker.label_prefix: ${result.trackerConfig.labelPrefix}`);
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
      return "set KATA_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN in your environment.";
    case "missing_workflow_file":
      return "create WORKFLOW.md in the project root with a tracker: block.";
    case "invalid_workflow_file":
      return "check WORKFLOW.md for valid YAML frontmatter (--- delimiters).";
    case "unsupported_tracker_kind":
      return "set tracker.kind: github in WORKFLOW.md.";
    case "missing_repo_owner":
      return "add tracker.repo_owner: <org-or-user> to WORKFLOW.md.";
    case "missing_repo_name":
      return "add tracker.repo_name: <repo> to WORKFLOW.md.";
    case "invalid_github_project_number":
      return "set tracker.github_project_number to a positive integer, or remove it to use label mode.";
    default:
      return null;
  }
}

// ─── YAML parsing helpers ─────────────────────────────────────────────────────
// Minimal YAML parsers — handles only the simple key: value structure
// used in WORKFLOW.md tracker blocks. No dependency on a full YAML library.

function extractNestedBlock(frontmatter: string, key: string): string | null {
  const lines = frontmatter.split(/\r?\n/);
  const anchorIndex = lines.findIndex((line) =>
    new RegExp(`^\\s*${escapeRegex(key)}:\\s*$`).test(line),
  );

  if (anchorIndex === -1) return null;

  const anchorIndent = indentationOf(lines[anchorIndex] ?? "");
  const nested: string[] = [];

  for (let i = anchorIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      nested.push(line);
      continue;
    }
    const indent = indentationOf(line);
    if (indent <= anchorIndent) break;
    nested.push(line.slice(anchorIndent + 2));
  }

  return nested.join("\n");
}

function parseSimpleYamlObject(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1] ?? "";
    const raw = match[2] ?? "";
    result[key] = stripInlineComment(raw).trim();
  }
  return result;
}

function stripInlineComment(value: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === "#" && !inSingle && !inDouble) return value.slice(0, i);
  }
  return value;
}

function stripYamlWrapping(value: string): string {
  return value.replace(/^['"]/, "").replace(/['"]$/, "").trim();
}

function indentationOf(line: string): number {
  return (line.match(/^\s*/)?.[0].length) ?? 0;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
