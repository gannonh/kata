import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { CONFIG_FIELD_DEFINITIONS, type ConfigEditorModel } from "./config-model.js";
import { applyModelToConfig } from "./config-parser.js";

const VALID_NOTIFICATION_EVENTS = new Set([
  "todo",
  "in_progress",
  "agent_review",
  "human_review",
  "merging",
  "rework",
  "done",
  "closed",
  "cancelled",
  "stalled",
  "failed",
  "all",
]);

const ENUM_VALUE_SET = new Map(
  CONFIG_FIELD_DEFINITIONS.filter((field) => field.type === "enum").map((field) => [
    field.path.join("."),
    new Set(field.enumValues ?? []),
  ]),
);

export interface ConfigValidationIssue {
  path: string;
  message: string;
}

export interface ValidateConfigModelOptions {
  workflowDir?: string;
}

export function validateConfigModel(
  model: ConfigEditorModel,
  options: ValidateConfigModelOptions = {},
): ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  const config = applyModelToConfig(model);

  assertRequired(config, ["tracker", "kind"], issues);
  assertRequired(config, ["tracker", "api_key"], issues);
  assertRequired(config, ["tracker", "project_slug"], issues);

  assertNumber(config, ["polling", "interval_ms"], (value) => value > 0, issues, {
    message: "polling.interval_ms must be greater than 0",
    optional: true,
  });
  assertNumber(
    config,
    ["agent", "max_concurrent_agents"],
    (value) => value >= 1,
    issues,
    {
      message: "agent.max_concurrent_agents must be >= 1",
      optional: true,
    },
  );
  assertNumber(config, ["agent", "max_turns"], (value) => value >= 1, issues, {
    message: "agent.max_turns must be >= 1",
    optional: true,
  });

  assertEnumValues(config, issues);
  assertWorkspaceCompatibility(config, issues);
  assertNotifications(config, issues);
  assertPromptPaths(config, issues, options.workflowDir);

  return issues;
}

function assertRequired(
  config: Record<string, unknown>,
  path: string[],
  issues: ConfigValidationIssue[],
): void {
  const value = readPath(config, path);
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({
      path: path.join("."),
      message: `${path.join(".")} is required`,
    });
  }
}

function assertNumber(
  config: Record<string, unknown>,
  path: string[],
  predicate: (value: number) => boolean,
  issues: ConfigValidationIssue[],
  options: { message: string; optional: boolean },
): void {
  const value = readPath(config, path);
  if (value === undefined || value === null) {
    if (!options.optional) {
      issues.push({ path: path.join("."), message: options.message });
    }
    return;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || !predicate(value)) {
    issues.push({
      path: path.join("."),
      message: options.message,
    });
  }
}

function assertEnumValues(
  config: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  for (const [path, allowedValues] of ENUM_VALUE_SET) {
    const value = readPath(config, path.split("."));
    if (value === undefined || value === null || value === "") continue;

    if (typeof value !== "string" || !allowedValues.has(value)) {
      issues.push({
        path,
        message: `${path} must be one of: ${Array.from(allowedValues).join(", ")}`,
      });
    }
  }
}

function assertWorkspaceCompatibility(
  config: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  const repo = toOptionalString(readPath(config, ["workspace", "repo"]));
  const gitStrategy = toOptionalString(readPath(config, ["workspace", "git_strategy"]));
  const isolation = toOptionalString(readPath(config, ["workspace", "isolation"]));

  if (gitStrategy === "worktree" && repo && isRemoteRepository(repo)) {
    issues.push({
      path: "workspace.git_strategy",
      message: "worktree strategy requires workspace.repo to be a local path",
    });
  }

  if (isolation === "docker" && gitStrategy === "clone-local") {
    issues.push({
      path: "workspace.isolation",
      message: "docker isolation is incompatible with workspace.git_strategy=clone-local",
    });
  }
}

function assertNotifications(
  config: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  const webhook = toOptionalString(
    readPath(config, ["notifications", "slack", "webhook_url"]),
  );

  if (webhook) {
    try {
      const parsed = new URL(webhook);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
    } catch {
      issues.push({
        path: "notifications.slack.webhook_url",
        message: "notifications.slack.webhook_url must be a valid http(s) URL",
      });
    }
  }

  const events = readPath(config, ["notifications", "slack", "events"]);
  if (events !== undefined && events !== null) {
    if (!Array.isArray(events)) {
      issues.push({
        path: "notifications.slack.events",
        message: "notifications.slack.events must be a list of event names",
      });
      return;
    }

    for (const event of events) {
      const normalized = String(event).trim().toLowerCase();
      if (!normalized) continue;
      if (!VALID_NOTIFICATION_EVENTS.has(normalized)) {
        issues.push({
          path: "notifications.slack.events",
          message: `Unknown notification event '${event}'`,
        });
      }
    }

    if (events.length > 0 && !webhook) {
      issues.push({
        path: "notifications.slack.webhook_url",
        message: "Slack webhook_url is required when notifications.slack.events is set",
      });
    }
  }
}

function assertPromptPaths(
  config: Record<string, unknown>,
  issues: ConfigValidationIssue[],
  workflowDir?: string,
): void {
  if (!workflowDir) return;

  const promptPaths: Array<{ path: string; value: unknown }> = [
    { path: "prompts.shared", value: readPath(config, ["prompts", "shared"]) },
    { path: "prompts.default", value: readPath(config, ["prompts", "default"]) },
  ];

  for (const promptPath of promptPaths) {
    const value = toOptionalString(promptPath.value);
    if (!value) continue;

    const resolved = isAbsolute(value) ? value : join(workflowDir, value);
    if (!existsSync(resolved)) {
      issues.push({
        path: promptPath.path,
        message: `Prompt path does not exist: ${value}`,
      });
    }
  }
}

function readPath(root: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRemoteRepository(repo: string): boolean {
  return (
    repo.includes("://") ||
    repo.startsWith("git@") ||
    repo.startsWith("ssh://")
  );
}
