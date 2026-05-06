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
import { createLinearClient } from "../backends/linear/client.js";
import { resolveLinearAuthToken } from "../backends/linear/config.js";
import { LinearKataAdapter } from "../backends/linear/adapter.js";
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
  linearClient?: ReturnType<typeof createLinearClient>;
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
          : "Parsed backend config: linear",
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
      }
      if (config.kind === "linear") {
        const token = resolveLinearAuthToken({ authEnv: config.authEnv, env });
        checks.push({
          name: "linear-auth",
          status: token || input.linearClient ? "ok" : "invalid",
          message: token || input.linearClient
            ? "Linear auth is configured."
            : "Linear mode requires LINEAR_API_KEY/LINEAR_TOKEN or the env var configured by linear.authEnv.",
          ...(token || input.linearClient
            ? {}
            : { action: "Set LINEAR_API_KEY, LINEAR_TOKEN, or the env var named by linear.authEnv." }),
        });

        if (token || input.linearClient) {
          const client = input.linearClient ?? createLinearClient({ token: token ?? "" });
          try {
            const adapter = new LinearKataAdapter({ client, config, workspacePath: cwd });
            await adapter.getProjectContext();
            checks.push({
              name: "linear-project",
              status: "ok",
              message: `Linear workspace ${config.workspace}, team ${config.team}, and project ${config.project} are accessible.`,
            });
            checks.push({
              name: "linear-workflow-states",
              status: "ok",
              message: "Linear workflow states required by Kata are available.",
            });
            checks.push({
              name: "linear-metadata",
              status: "ok",
              message: "Linear documents, comments, sub-issues, and issue relations are available through GraphQL.",
            });
          } catch (error) {
            checks.push({
              name: "linear-project",
              status: "invalid",
              message: error instanceof Error ? error.message : "Unable to validate Linear project access.",
              action: "Verify linear.workspace, linear.team, linear.project, auth, and configured state names.",
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
