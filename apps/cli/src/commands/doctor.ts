import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { readTrackerConfig } from "../backends/read-tracker-config.js";
import {
  PI_SETUP_MARKER_FILENAME,
  PI_SETTINGS_FILENAME,
  detectHarness,
  resolveSkillsSource,
  resolvePiAgentDir,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function runDoctor(input: RunDoctorInput = {}): Promise<DoctorReport> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const harness = detectHarness(env);
  const checks: DoctorCheck[] = [
    {
      name: "harness",
      status: "ok",
      message: `Detected harness: ${harness}`,
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

  const bundledSkills = resolveSkillsSource(cwd);
  checks.push({
    name: "skills-source",
    status: bundledSkills.exists ? "ok" : "invalid",
    message: bundledSkills.exists
      ? `Kata skills source found at ${bundledSkills.path} (${bundledSkills.resolution})`
      : bundledSkills.resolution === "orchestrator-dist"
        ? `Orchestrator skills not found at ${bundledSkills.path}`
        : `Bundled skills source not found at ${bundledSkills.path}`,
    ...(bundledSkills.exists
      ? {}
      : bundledSkills.resolution === "orchestrator-dist"
        ? { action: "Run `pnpm --dir apps/orchestrator run build:skills` from the monorepo root." }
        : { action: "Reinstall @kata-sh/cli so the packaged skill bundle is present." }),
  });

  if (harness === "pi") {
    const piAgentDir = resolvePiAgentDir(env);
    const piSkillsDir = join(piAgentDir.path, "skills");
    const markerPath = join(piAgentDir.path, PI_SETUP_MARKER_FILENAME);
    const settingsPath = join(piAgentDir.path, PI_SETTINGS_FILENAME);
    const skillsDirExists = await existsDirectory(piSkillsDir);
    const markerExists = existsSync(markerPath);

    checks.push({
      name: "pi-skills-dir",
      status: skillsDirExists ? "ok" : "invalid",
      message: skillsDirExists
        ? `Pi skills directory is present at ${piSkillsDir}`
        : `Pi skills directory is missing at ${piSkillsDir}`,
      ...(skillsDirExists
        ? {}
        : { action: "Run `kata setup --pi` to install bundled skills." }),
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
        status: "invalid",
        message: `Pi settings file is missing at ${settingsPath}`,
        action: "Run `kata setup --pi` to create Pi integration settings.",
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
        const hasGithubToken = Boolean((env.GITHUB_TOKEN ?? env.GH_TOKEN)?.trim());
        checks.push({
          name: "github-token",
          status: hasGithubToken ? "ok" : "invalid",
          message: hasGithubToken
            ? "GitHub token is configured; doctor did not perform live Project v2 field validation."
            : "GitHub mode requires GITHUB_TOKEN or GH_TOKEN.",
          ...(hasGithubToken
            ? {}
            : { action: "Set GITHUB_TOKEN or GH_TOKEN with access to the configured GitHub Project v2." }),
        });
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
