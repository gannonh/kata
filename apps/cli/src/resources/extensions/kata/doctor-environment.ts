import { execFile } from "node:child_process";
import { statfs } from "node:fs/promises";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type EnvironmentCheckStatus = "pass" | "warn" | "fail" | "info";

export interface EnvironmentCheck {
  id: string;
  label: string;
  status: EnvironmentCheckStatus;
  message: string;
}

export interface EnvironmentCheckResult {
  ok: boolean;
  checkedAt: string;
  nodeVersion: string;
  minNodeVersion: string;
  gitVersion: string | null;
  minGitVersion: string;
  diskFreeBytes: number | null;
  os: string;
  shell: string | null;
  checks: EnvironmentCheck[];
}

export interface RunEnvironmentChecksOptions {
  basePath?: string;
  minNodeVersion?: string;
  minGitVersion?: string;
  diskWarnBytes?: number;
  diskFailBytes?: number;
  env?: NodeJS.ProcessEnv;
  overrides?: Partial<{
    checkedAt: string;
    nodeVersion: string;
    gitVersion: string | null;
    diskFreeBytes: number | null;
    platform: NodeJS.Platform;
    osRelease: string;
    shell: string | null;
  }>;
}

const DEFAULT_MIN_NODE_VERSION = "20.6.0";
const DEFAULT_MIN_GIT_VERSION = "2.25.0";
const DEFAULT_DISK_WARN_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const DEFAULT_DISK_FAIL_BYTES = 512 * 1024 * 1024; // 512 MB

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(input: string): ParsedVersion | null {
  const match = input.trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function normalizeNodeVersion(version: string): string {
  return version.startsWith("v") ? version.slice(1) : version;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} ${units[unit]}`;
  return `${value.toFixed(1)} ${units[unit]}`;
}

function formatStatus(status: EnvironmentCheckStatus): string {
  return status.toUpperCase();
}

async function detectGitVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["--version"], {
      encoding: "utf-8",
    });
    const match = stdout.trim().match(/(\d+\.\d+\.\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function detectDiskFreeBytes(basePath: string): Promise<number | null> {
  try {
    const fsStats = await statfs(basePath);
    return fsStats.bavail * fsStats.bsize;
  } catch {
    return null;
  }
}

export async function runEnvironmentChecks(
  options: RunEnvironmentChecksOptions = {},
): Promise<EnvironmentCheckResult> {
  const env = options.env ?? process.env;
  const checkedAt = options.overrides?.checkedAt ?? new Date().toISOString();
  const nodeVersion = normalizeNodeVersion(
    options.overrides?.nodeVersion ?? process.versions.node,
  );
  const minNodeVersion = options.minNodeVersion ?? DEFAULT_MIN_NODE_VERSION;
  const minGitVersion = options.minGitVersion ?? DEFAULT_MIN_GIT_VERSION;
  const diskWarnBytes = options.diskWarnBytes ?? DEFAULT_DISK_WARN_BYTES;
  const diskFailBytes = options.diskFailBytes ?? DEFAULT_DISK_FAIL_BYTES;
  const basePath = options.basePath ?? process.cwd();
  const platform = options.overrides?.platform ?? process.platform;
  const osRelease = options.overrides?.osRelease ?? os.release();
  const shell =
    options.overrides?.shell ??
    (platform === "win32" ? env.COMSPEC ?? env.SHELL ?? null : env.SHELL ?? null);

  const gitVersion =
    options.overrides?.gitVersion !== undefined
      ? options.overrides.gitVersion
      : await detectGitVersion();
  const diskFreeBytes =
    options.overrides?.diskFreeBytes !== undefined
      ? options.overrides.diskFreeBytes
      : await detectDiskFreeBytes(basePath);

  const checks: EnvironmentCheck[] = [];

  const parsedNode = parseVersion(nodeVersion);
  const parsedNodeMin = parseVersion(minNodeVersion);
  if (!parsedNode || !parsedNodeMin) {
    checks.push({
      id: "node_version",
      label: "Node.js",
      status: "warn",
      message: `Could not parse Node.js version check (${nodeVersion} vs >=${minNodeVersion})`,
    });
  } else if (compareVersions(parsedNode, parsedNodeMin) < 0) {
    checks.push({
      id: "node_version",
      label: "Node.js",
      status: "fail",
      message: `${nodeVersion} is below required >=${minNodeVersion}`,
    });
  } else {
    checks.push({
      id: "node_version",
      label: "Node.js",
      status: "pass",
      message: `${nodeVersion} (required >=${minNodeVersion})`,
    });
  }

  if (!gitVersion) {
    checks.push({
      id: "git_version",
      label: "Git",
      status: "fail",
      message: "git executable not found in PATH",
    });
  } else {
    const parsedGit = parseVersion(gitVersion);
    const parsedGitMin = parseVersion(minGitVersion);
    if (!parsedGit || !parsedGitMin) {
      checks.push({
        id: "git_version",
        label: "Git",
        status: "warn",
        message: `Found git ${gitVersion}, but could not validate minimum >=${minGitVersion}`,
      });
    } else if (compareVersions(parsedGit, parsedGitMin) < 0) {
      checks.push({
        id: "git_version",
        label: "Git",
        status: "warn",
        message: `${gitVersion} is below recommended >=${minGitVersion}`,
      });
    } else {
      checks.push({
        id: "git_version",
        label: "Git",
        status: "pass",
        message: `${gitVersion} (recommended >=${minGitVersion})`,
      });
    }
  }

  if (diskFreeBytes === null) {
    checks.push({
      id: "disk_space",
      label: "Disk space",
      status: "warn",
      message: `Could not read free disk space for ${basePath}`,
    });
  } else if (diskFreeBytes <= diskFailBytes) {
    checks.push({
      id: "disk_space",
      label: "Disk space",
      status: "fail",
      message: `${formatBytes(diskFreeBytes)} free (critical, <= ${formatBytes(diskFailBytes)})`,
    });
  } else if (diskFreeBytes <= diskWarnBytes) {
    checks.push({
      id: "disk_space",
      label: "Disk space",
      status: "warn",
      message: `${formatBytes(diskFreeBytes)} free (low, <= ${formatBytes(diskWarnBytes)})`,
    });
  } else {
    checks.push({
      id: "disk_space",
      label: "Disk space",
      status: "pass",
      message: `${formatBytes(diskFreeBytes)} free`,
    });
  }

  if (platform === "darwin" || platform === "linux" || platform === "win32") {
    checks.push({
      id: "os",
      label: "Operating system",
      status: "pass",
      message: `${platform} ${osRelease}`,
    });
  } else {
    checks.push({
      id: "os",
      label: "Operating system",
      status: "warn",
      message: `${platform} ${osRelease} (unverified platform)`,
    });
  }

  if (shell && shell.trim().length > 0) {
    checks.push({
      id: "shell",
      label: "Shell",
      status: "pass",
      message: shell,
    });
  } else {
    checks.push({
      id: "shell",
      label: "Shell",
      status: "warn",
      message: "No shell detected from SHELL/COMSPEC",
    });
  }

  const ok = !checks.some((check) => check.status === "fail");
  return {
    ok,
    checkedAt,
    nodeVersion,
    minNodeVersion,
    gitVersion,
    minGitVersion,
    diskFreeBytes,
    os: `${platform} ${osRelease}`,
    shell,
    checks,
  };
}

export function formatEnvironmentReport(result: EnvironmentCheckResult): string {
  const passCount = result.checks.filter((check) => check.status === "pass").length;
  const warnCount = result.checks.filter((check) => check.status === "warn").length;
  const failCount = result.checks.filter((check) => check.status === "fail").length;
  const infoCount = result.checks.filter((check) => check.status === "info").length;

  const lines: string[] = [];
  lines.push("Environment diagnostics:");
  lines.push(
    `Summary: ${passCount} pass, ${warnCount} warn, ${failCount} fail${infoCount > 0 ? `, ${infoCount} info` : ""}`,
  );
  for (const check of result.checks) {
    lines.push(`- ${check.label}: ${formatStatus(check.status)} - ${check.message}`);
  }
  return lines.join("\n");
}
