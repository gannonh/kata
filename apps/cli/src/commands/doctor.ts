import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import { readTrackerConfig } from "../backends/read-tracker-config.js";
import { resolveGithubTokenForRuntime } from "../backends/resolve-backend.js";
import { createGithubClient } from "../backends/github-projects-v2/client.js";
import { loadProjectFieldIndex } from "../backends/github-projects-v2/project-fields.js";
import {
  createLinearHealthClient,
  type LinearHealthClient,
  type LinearKataMetadataSupport,
} from "../backends/linear/client.js";
import { KataDomainError } from "../domain/errors.js";
import {
  PI_SETUP_MARKER_FILENAME,
  PI_SETTINGS_FILENAME,
  detectHarness,
  resolvePiAgentDir,
  resolveSkillsSource,
} from "./setup.js";

export type DoctorCheckStatus = "ok" | "warn" | "invalid";

export interface DoctorCheck {
  name: string;
  status: DoctorCheckStatus;
  message: string;
  action?: string;
}

export interface DoctorReport {
  summary: string;
  status: DoctorCheckStatus;
  harness: string;
  packageVersion: string;
  checks: DoctorCheck[];
}

export function renderDoctorReport(input: {
  packageVersion: string;
  backendConfigStatus: "ok" | "invalid";
  backendConfigMessage: string;
  harness: string;
}): DoctorReport {
  return {
    summary: `kata doctor ${input.backendConfigStatus} (${input.harness})`,
    status: input.backendConfigStatus,
    harness: input.harness,
    packageVersion: input.packageVersion,
    checks: [
      {
        name: "harness",
        status: "ok",
        message: `Detected harness: ${input.harness}`,
      },
      {
        name: "backend-config",
        status: input.backendConfigStatus,
        message: input.backendConfigMessage,
      },
    ],
  };
}

export interface RunDoctorInput {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  packageVersion?: string;
  cliBinaryPath?: string;
  githubClients?: ReturnType<typeof createGithubClient>;
  linearHealthClientFactory?: (apiKey: string) => LinearHealthClient;
}

function aggregateStatus(checks: DoctorCheck[]): DoctorCheckStatus {
  if (checks.some((check) => check.status === "invalid")) return "invalid";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "ok";
}

async function existsDirectory(path: string): Promise<boolean> {
  try {
    const result = await stat(path);
    return result.isDirectory();
  } catch {
    return false;
  }
}

function hasKataSkills(skillsDir: string): boolean {
  return existsSync(join(skillsDir, "kata-setup", "SKILL.md")) ||
    existsSync(join(skillsDir, "kata-health", "SKILL.md"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGithubRemoteUrl(rawUrl: string): { owner: string; repo: string } | null {
  const trimmed = rawUrl.trim();
  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! };

  const httpsMatch = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (httpsMatch) return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };

  const sshUrlMatch = /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (sshUrlMatch) return { owner: sshUrlMatch[1]!, repo: sshUrlMatch[2]! };

  return null;
}

async function checkGithubRepositoryRemote(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  repoOwner: string;
  repoName: string;
}): Promise<DoctorCheck> {
  const expected = `${input.repoOwner}/${input.repoName}`;
  const expectedUrl = `https://github.com/${expected}.git`;

  try {
    const { stdout } = await execFileAsync("git", ["remote", "-v"], {
      cwd: input.cwd,
      env: input.env,
      timeout: 5000,
    });

    const remotes = stdout.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.endsWith("(fetch)"))
      .map((line) => {
        const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line);
        if (!match) return null;
        const parsed = parseGithubRemoteUrl(match[2]!);
        return parsed ? { name: match[1]!, url: match[2]!, ...parsed } : null;
      })
      .filter((remote): remote is { name: string; url: string; owner: string; repo: string } => Boolean(remote));

    const matchingRemote = remotes.find((remote) =>
      remote.owner.toLowerCase() === input.repoOwner.toLowerCase() &&
      remote.repo.toLowerCase() === input.repoName.toLowerCase()
    );

    if (matchingRemote) {
      return {
        name: "github-repository-remote",
        status: "ok",
        message: `Local Git remote '${matchingRemote.name}' points at ${expected}.`,
      };
    }

    const origin = remotes.find((remote) => remote.name === "origin");
    return {
      name: "github-repository-remote",
      status: "invalid",
      message: origin
        ? `Configured backend repo is ${expected}, but local Git origin points at ${origin.owner}/${origin.repo}.`
        : `Configured backend repo is ${expected}, but no matching GitHub remote is configured locally.`,
      action: origin
        ? `Run \`git remote set-url origin ${expectedUrl}\`, or update .kata/preferences.md to match this checkout.`
        : `Run \`git remote add origin ${expectedUrl}\`, or update .kata/preferences.md to match this checkout.`,
    };
  } catch {
    return {
      name: "github-repository-remote",
      status: "invalid",
      message: `Configured backend repo is ${expected}, but this workspace is not connected to that Git repository.`,
      action: `Run setup from a checkout of ${expected}, or run \`git init --initial-branch=main && git remote add origin ${expectedUrl}\`.`,
    };
  }
}

function resolveLinearApiKey(env: NodeJS.ProcessEnv): string | null {
  const value = env.LINEAR_API_KEY;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function listMissingLinearMetadataCapabilities(capabilities: LinearKataMetadataSupport): string[] {
  const missing: string[] = [];
  if (!capabilities.kataId) missing.push("Kata ID support");
  if (!capabilities.parentLinks) missing.push("parent link support");
  if (!capabilities.artifactScope) missing.push("artifact scope support");
  if (!capabilities.verificationState) missing.push("verification state support");
  if (!capabilities.dependencyBlocking) missing.push("dependency blocking support");
  if (!capabilities.blockedByRelations) missing.push("blocked-by relation support");
  return missing;
}

function classifyLinearError(error: unknown): "auth" | "network" | "other" {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    message.includes("401") ||
    message.includes("403") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("invalid api key") ||
    message.includes("authentication")
  ) {
    return "auth";
  }
  if (
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("etimedout")
  ) {
    return "network";
  }
  return "other";
}

export async function runDoctor(input: RunDoctorInput = {}): Promise<DoctorReport> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const harness = detectHarness(env);
  const homeDir = env.HOME?.trim() || homedir();
  const localAgentsSkillsDir = join(cwd, ".agents", "skills");
  const globalAgentsSkillsDir = join(homeDir, ".agents", "skills");
  const localClaudeSkillsDir = join(cwd, ".claude", "skills");
  const globalClaudeSkillsDir = join(homeDir, ".claude", "skills");
  const localCursorSkillsDir = join(cwd, ".cursor", "skills");
  const globalCursorSkillsDir = join(homeDir, ".cursor", "skills");
  const piAgentDir = resolvePiAgentDir(env);
  const piSkillsDir = join(piAgentDir.path, "skills");
  const skillsSource = resolveSkillsSource(cwd);
  const skillsSourceAvailable = skillsSource.exists && hasKataSkills(skillsSource.path);
  const detectedHarnesses = [
    hasKataSkills(localAgentsSkillsDir) ? "Harness detected (local): Universal (.agents/skills)" : null,
    hasKataSkills(globalAgentsSkillsDir) ? "Harness detected (global): Universal (~/.agents/skills)" : null,
    hasKataSkills(localClaudeSkillsDir) ? "Harness detected (local): Claude Code (.claude/skills)" : null,
    hasKataSkills(globalClaudeSkillsDir) ? "Harness detected (global): Claude Code (~/.claude/skills)" : null,
    hasKataSkills(localCursorSkillsDir) ? "Harness detected (local): Cursor (.cursor/skills)" : null,
    hasKataSkills(globalCursorSkillsDir) ? "Harness detected (global): Cursor (~/.cursor/skills)" : null,
    hasKataSkills(piSkillsDir) ? "Harness detected (pi): Pi agent skills" : null,
    harness === "skills-sh" && skillsSourceAvailable ? `Harness detected: skills-sh (${skillsSource.path})` : null,
  ].filter((message): message is string => Boolean(message));
  const checks: DoctorCheck[] = [
    {
      name: "harness",
      status: detectedHarnesses.length > 0 ? "ok" : "warn",
      message: detectedHarnesses.length > 0
        ? detectedHarnesses.join("\n")
        : "No Kata skill installation detected for Universal, Claude Code, or Cursor.",
      ...(detectedHarnesses.length > 0
        ? {}
        : { action: "Run `kata setup` to install Kata skills." }),
    },
  ];
  const explicitCliBinaryPath = input.cliBinaryPath?.trim() ?? "";
  const observedCliBinaryPath = process.argv[1]?.trim() ?? "";
  if (explicitCliBinaryPath.length > 0) {
    const cliBinaryAvailable = existsSync(explicitCliBinaryPath);
    checks.push({
      name: "cli-binary",
      status: cliBinaryAvailable ? "ok" : "warn",
      message: cliBinaryAvailable
        ? `CLI binary is available at ${explicitCliBinaryPath}`
        : `CLI binary is missing or unreadable at ${explicitCliBinaryPath}`,
      ...(cliBinaryAvailable
        ? {}
        : { action: "Run the installed `kata` binary from PATH or reinstall @kata-sh/cli." }),
    });
  } else if (observedCliBinaryPath.length > 0 && existsSync(observedCliBinaryPath)) {
    checks.push({
      name: "cli-binary",
      status: "ok",
      message: `CLI entrypoint resolved at ${observedCliBinaryPath}`,
    });
  } else {
    checks.push({
      name: "cli-binary",
      status: "ok",
      message: "CLI runtime is active; binary path could not be resolved in this host process.",
    });
  }

  const localKataSkillsInstalled = hasKataSkills(localAgentsSkillsDir);
  const globalKataSkillsInstalled = hasKataSkills(globalAgentsSkillsDir);
  const piKataSkillsInstalled = hasKataSkills(piSkillsDir);
  const sharedAgentsSkillsAvailable = localKataSkillsInstalled || globalKataSkillsInstalled;
  const kataSkillsAvailable = sharedAgentsSkillsAvailable || piKataSkillsInstalled || skillsSourceAvailable;
  checks.push({
    name: "kata-skills",
    status: kataSkillsAvailable ? "ok" : "warn",
    message: kataSkillsAvailable
      ? `Kata skills are available at ${
        localKataSkillsInstalled
          ? localAgentsSkillsDir
          : globalKataSkillsInstalled
            ? globalAgentsSkillsDir
            : piKataSkillsInstalled
              ? piSkillsDir
              : skillsSource.path
      }`
      : `Kata skills were not found in ${localAgentsSkillsDir} or ${globalAgentsSkillsDir}`,
    ...(kataSkillsAvailable
      ? {}
      : { action: "Run `kata setup` to install Kata skills into .agents/skills, or `kata setup --global`." }),
  });

  if (harness === "pi") {
    const markerPath = join(piAgentDir.path, PI_SETUP_MARKER_FILENAME);
    const settingsPath = join(piAgentDir.path, PI_SETTINGS_FILENAME);
    const skillsDirExists = await existsDirectory(piSkillsDir);
    const markerExists = existsSync(markerPath);

    checks.push({
      name: "pi-skills-dir",
      status: skillsDirExists ? "ok" : sharedAgentsSkillsAvailable ? "warn" : "invalid",
      message: skillsDirExists
        ? `Pi skills directory is present at ${piSkillsDir}`
        : sharedAgentsSkillsAvailable
          ? `Pi-specific skills directory is missing at ${piSkillsDir}, but shared .agents skills are installed.`
          : `Pi skills directory is missing at ${piSkillsDir}`,
      ...(skillsDirExists
        ? {}
        : sharedAgentsSkillsAvailable
          ? { action: "No Pi-specific install is required if this Pi build reads .agents/skills; run `kata setup --pi` only to repair the legacy Pi target." }
          : { action: "Run `kata setup` or `kata setup --pi` to install bundled skills." }),
    });

    checks.push({
      name: "pi-install-marker",
      status: markerExists ? "ok" : "warn",
      message: markerExists
        ? `Pi setup marker found at ${markerPath}`
        : `Pi setup marker missing at ${markerPath}`,
      ...(markerExists
        ? {}
        : { action: "Run `kata setup --pi` to create or refresh installation metadata." }),
    });

    if (!existsSync(settingsPath)) {
      checks.push({
        name: "pi-settings",
        status: sharedAgentsSkillsAvailable ? "warn" : "invalid",
        message: sharedAgentsSkillsAvailable
          ? `Pi settings file is missing at ${settingsPath}, but shared .agents skills are installed.`
          : `Pi settings file is missing at ${settingsPath}`,
        action: sharedAgentsSkillsAvailable
          ? "No Pi settings change is required if this Pi build reads .agents/skills; run `kata setup --pi` only to repair the legacy Pi target."
          : "Run `kata setup --pi` to create Pi integration settings.",
      });
    } else {
      try {
        const settingsContent = await readFile(settingsPath, "utf8");
        const parsed = JSON.parse(settingsContent);
        if (!isRecord(parsed)) {
          throw new Error("Pi settings must be a JSON object.");
        }
        const skills = Array.isArray(parsed.skills)
          ? parsed.skills.filter((entry): entry is string => typeof entry === "string")
          : [];
        const hasSkillsHook = skills.some((entry) => entry === "./skills" || entry === "skills");
        const skillCommandsEnabled = parsed.enableSkillCommands === true;
        const settingsHealthy = hasSkillsHook && skillCommandsEnabled;
        const missingBits = [
          hasSkillsHook ? null : "skills includes ./skills",
          skillCommandsEnabled ? null : "enableSkillCommands is true",
        ].filter((value): value is string => Boolean(value));
        checks.push({
          name: "pi-settings",
          status: settingsHealthy ? "ok" : "invalid",
          message: settingsHealthy
            ? `Pi integration settings are configured in ${settingsPath}`
            : `Pi integration settings are incomplete (${missingBits.join(", ")}) in ${settingsPath}`,
          ...(settingsHealthy
            ? {}
            : { action: "Run `kata setup --pi` to repair Pi integration settings." }),
        });
      } catch (error) {
        checks.push({
          name: "pi-settings",
          status: "invalid",
          message: error instanceof Error ? error.message : "Unable to parse Pi settings file",
          action: "Fix the JSON in Pi settings or rerun `kata setup --pi`.",
        });
      }
    }
  }

  const preferencesPath = join(cwd, ".kata", "preferences.md");
  if (!existsSync(preferencesPath)) {
    checks.push({
      name: "backend-config",
      status: "warn",
      message: `Backend preferences not found at ${preferencesPath}`,
      action: "Create .kata/preferences.md and configure workflow.mode before running runtime commands.",
    });
  } else {
    try {
      const preferencesContent = await readFile(preferencesPath, "utf8");
      const config = await readTrackerConfig({ preferencesContent });
      checks.push({
        name: "backend-config",
        status: "ok",
        message: config.kind === "github"
          ? `Parsed backend config: github projects_v2 (${config.repoOwner}/${config.repoName} #${config.githubProjectNumber})`
          : `Parsed backend config: linear (${config.teamKey ?? config.teamId ?? "missing team"}, ${config.projectSlug ?? config.projectId ?? "missing project"})`,
      });

      if (config.kind === "github") {
        checks.push(await checkGithubRepositoryRemote({
          cwd,
          env,
          repoOwner: config.repoOwner,
          repoName: config.repoName,
        }));

        const token = await resolveGithubTokenForRuntime(env);
        checks.push({
          name: "github-auth",
          status: token ? "ok" : "invalid",
          message: token
            ? "GitHub auth is configured."
            : "GitHub mode requires GITHUB_TOKEN/GH_TOKEN or gh auth.",
          ...(token
            ? {}
            : { action: "Run `gh auth login` or set GITHUB_TOKEN/GH_TOKEN with access to the configured GitHub Project v2." }),
        });

        if (token) {
          try {
            await loadProjectFieldIndex({
              client: input.githubClients ?? createGithubClient({ token }),
              owner: config.repoOwner,
              repo: config.repoName,
              projectNumber: config.githubProjectNumber,
            });
            checks.push({
              name: "github-project-fields",
              status: "ok",
              message: "GitHub Project v2 has the required Kata fields.",
            });
          } catch (error) {
            const isInvalidProjectConfig = error instanceof KataDomainError && error.code === "INVALID_CONFIG";
            checks.push({
              name: "github-project-fields",
              status: "invalid",
              message: error instanceof Error ? error.message : "Unable to validate GitHub Project v2 fields.",
              action: isInvalidProjectConfig
                ? "Add the required Kata Project fields, then rerun `kata doctor`."
                : "Verify GitHub auth, repository, and project number, then rerun `kata doctor`.",
            });
          }
        }
      } else {
        const linearApiKey = resolveLinearApiKey(env);
        if (!linearApiKey) {
          checks.push({
            name: "linear-auth",
            status: "invalid",
            message: "Linear mode requires LINEAR_API_KEY.",
            action: "Set LINEAR_API_KEY, then rerun `kata doctor`.",
          });
        } else {
          const linearClient = input.linearHealthClientFactory
            ? input.linearHealthClientFactory(linearApiKey)
            : createLinearHealthClient({ apiKey: linearApiKey });

          try {
            const viewer = await linearClient.getViewer();
            checks.push({
              name: "linear-auth",
              status: "ok",
              message: `Linear auth is configured for ${viewer.email}.`,
            });

            checks.push({
              name: "linear-workspace",
              status: viewer.organization ? "ok" : "invalid",
              message: viewer.organization
                ? `Workspace access confirmed: ${viewer.organization.name}.`
                : "Unable to resolve Linear workspace for authenticated user.",
              ...(viewer.organization
                ? {}
                : { action: "Confirm this API key can access the expected Linear workspace." }),
            });

            const teamLookup = config.teamId ?? config.teamKey;
            let teamResolved = false;
            if (!teamLookup) {
              checks.push({
                name: "linear-team-access",
                status: "invalid",
                message: "Linear mode requires linear.teamId or linear.teamKey.",
                action: "Set linear.teamId or linear.teamKey in .kata/preferences.md.",
              });
            } else {
              const team = await linearClient.getTeam(teamLookup);
              teamResolved = Boolean(team);
              checks.push({
                name: "linear-team-access",
                status: team ? "ok" : "invalid",
                message: team
                  ? `Team access confirmed: ${team.name} (${team.key}).`
                  : `Configured team could not be resolved: ${teamLookup}.`,
                ...(team
                  ? {}
                  : { action: "Update linear.teamId/linear.teamKey to a team the API key can access." }),
              });
            }

            const projectLookup = config.projectSlug ?? config.projectId;
            let projectResolved = false;
            if (!projectLookup) {
              checks.push({
                name: "linear-project-access",
                status: "invalid",
                message: "Linear mode requires linear.projectSlug or linear.projectId.",
                action: "Set linear.projectSlug in .kata/preferences.md.",
              });
            } else {
              const project = await linearClient.getProject(projectLookup);
              projectResolved = Boolean(project);
              checks.push({
                name: "linear-project-access",
                status: project ? "ok" : "invalid",
                message: project
                  ? `Project access confirmed: ${project.name} (${project.slugId}).`
                  : `Configured project could not be resolved: ${projectLookup}.`,
                ...(project
                  ? {}
                  : { action: "Update linear.projectSlug/linear.projectId to a project the API key can access." }),
              });
            }

            if (teamResolved && projectResolved) {
              const capabilities = await linearClient.getKataMetadataSupport();
              const missingCapabilities = listMissingLinearMetadataCapabilities(capabilities);
              checks.push({
                name: "linear-metadata-support",
                status: missingCapabilities.length === 0 ? "ok" : "invalid",
                message: missingCapabilities.length === 0
                  ? "Linear metadata support confirmed for Kata ID, parent links, artifact scope, verification state, and dependency relations."
                  : `Missing required metadata support: ${missingCapabilities.join(", ")}.`,
                ...(missingCapabilities.length === 0
                  ? {}
                  : { action: "Verify Linear relation and metadata capabilities for this workspace/team/project." }),
              });
            }
          } catch (error) {
            const kind = classifyLinearError(error);
            checks.push({
              name: "linear-auth",
              status: "invalid",
              message: error instanceof Error ? error.message : "Unable to validate Linear authentication.",
              action: kind === "network"
                ? "Check network connectivity to Linear and rerun `kata doctor`."
                : "Verify LINEAR_API_KEY and backend access, then rerun `kata doctor`.",
            });
          }
        }
      }
    } catch (error) {
      checks.push({
        name: "backend-config",
        status: "invalid",
        message: error instanceof Error ? error.message : "Unable to parse backend config",
        action: "Fix .kata/preferences.md so workflow.mode and backend fields are valid.",
      });
    }
  }

  const status = aggregateStatus(checks);
  return {
    summary: `kata doctor ${status} (${harness})`,
    status,
    harness,
    packageVersion: input.packageVersion ?? "0.0.0-dev",
    checks,
  };
}
