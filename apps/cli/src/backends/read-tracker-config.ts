import { load } from "js-yaml";

import { KataDomainError } from "../domain/errors.js";

interface ReadTrackerConfigInput {
  preferencesContent: string;
}

interface LinearTrackerConfig {
  kind: "linear";
  teamId: string | null;
  teamKey: string | null;
  projectId: string | null;
  projectSlug: string | null;
}

interface GithubTrackerConfig {
  kind: "github";
  repoOwner: string;
  repoName: string;
  stateMode: "projects_v2";
  githubProjectNumber: number;
}

type TrackerConfig = LinearTrackerConfig | GithubTrackerConfig;

function unwrapFrontmatter(preferencesContent: string): string {
  const trimmed = preferencesContent.trim();

  if (!trimmed.startsWith("---")) {
    return trimmed;
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines[0] !== "---") {
    return trimmed;
  }

  const endIndex = lines.indexOf("---", 1);
  return endIndex === -1 ? lines.slice(1).join("\n") : lines.slice(1, endIndex).join("\n");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  throw new KataDomainError("INVALID_CONFIG", `${fieldName} is required`);
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  throw new KataDomainError("INVALID_CONFIG", `${fieldName} must be a positive integer`);
}

export async function readTrackerConfig({ preferencesContent }: ReadTrackerConfigInput): Promise<TrackerConfig> {
  let parsedYaml: unknown;

  try {
    parsedYaml = load(unwrapFrontmatter(preferencesContent)) ?? {};
  } catch (error) {
    const message = error instanceof Error ? error.message : "Malformed preferences content";
    throw new KataDomainError("INVALID_CONFIG", `Unable to parse preferences content: ${message}`);
  }

  const parsed = asRecord(parsedYaml);
  const workflow = asRecord(parsed.workflow);
  const mode = requireNonEmptyString(workflow.mode, "workflow.mode");

  if (mode === "linear") {
    const linear = asRecord(parsed.linear);
    const projectSlug = optionalString(linear.projectSlug);
    return {
      kind: "linear",
      teamId: optionalString(linear.teamId),
      teamKey: optionalString(linear.teamKey),
      projectId: optionalString(linear.projectId),
      projectSlug,
    };
  }

  if (mode !== "github") {
    throw new KataDomainError("INVALID_CONFIG", `workflow.mode must be linear or github`);
  }

  const github = asRecord(parsed.github);
  const repoOwner = requireNonEmptyString(github.repoOwner, "github.repoOwner");
  const repoName = requireNonEmptyString(github.repoName, "github.repoName");
  const rawStateMode = github.stateMode;
  if (typeof rawStateMode !== "string" || rawStateMode.trim() === "") {
    throw new KataDomainError(
      "INVALID_CONFIG",
      "github.stateMode is required and must be projects_v2. Set github.stateMode: projects_v2 and github.githubProjectNumber to a positive integer.",
    );
  }

  const stateMode = rawStateMode.trim();

  if (stateMode === "labels") {
    throw new KataDomainError(
      "INVALID_CONFIG",
      "GitHub label mode is no longer supported. Use github.stateMode: projects_v2 and set github.githubProjectNumber.",
    );
  }

  if (stateMode !== "projects_v2") {
    throw new KataDomainError(
      "INVALID_CONFIG",
      "github.stateMode is required and must be projects_v2. Set github.stateMode: projects_v2 and github.githubProjectNumber to a positive integer.",
    );
  }

  return {
    kind: "github",
    repoOwner,
    repoName,
    stateMode: "projects_v2" as const,
    githubProjectNumber: requirePositiveInteger(github.githubProjectNumber, "github.githubProjectNumber"),
  };
}
