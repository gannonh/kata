import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const kataHome = process.env.KATA_HOME || join(homedir(), ".kata-cli");

/**
 * Get the git remote URL for "origin", or "" if no remote is configured.
 * Uses `git config` rather than `git remote get-url` for broader compatibility.
 */
export function getRemoteUrl(basePath: string): string {
  try {
    return execFileSync("git", ["config", "--get", "remote.origin.url"], {
      cwd: basePath,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Canonicalize paths when possible while still handling missing paths.
 */
export function canonicalizeExistingPath(pathValue: string): string {
  try {
    return realpathSync(pathValue);
  } catch {
    return resolve(pathValue);
  }
}

/**
 * Resolve git common dir for normal repos and worktrees.
 */
export function resolveGitCommonDir(basePath: string): string {
  try {
    return execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: basePath,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5_000,
      },
    ).trim();
  } catch {
    const raw = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: basePath,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim();
    return resolve(basePath, raw);
  }
}

/**
 * Resolve absolute git-dir for the current checkout.
 */
export function resolveGitDir(basePath: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-dir"], {
      cwd: basePath,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim();
  } catch {
    const raw = execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: basePath,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim();
    return resolve(basePath, raw);
  }
}

function resolveGitRoot(basePath: string): string {
  try {
    const commonDir = resolveGitCommonDir(basePath);
    const normalizedCommonDir = commonDir.replaceAll("\\", "/");

    if (normalizedCommonDir.endsWith("/.git")) {
      return canonicalizeExistingPath(resolve(commonDir, ".."));
    }

    const worktreeMarker = "/.git/worktrees/";
    if (normalizedCommonDir.includes(worktreeMarker)) {
      return canonicalizeExistingPath(resolve(commonDir, "..", ".."));
    }

    return canonicalizeExistingPath(
      execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: basePath,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5_000,
      }).trim(),
    );
  } catch {
    return resolve(basePath);
  }
}

/**
 * Validate that a project id is a full SHA-256 hex digest.
 */
export function validateProjectId(id: string): boolean {
  return /^[a-f0-9]{64}$/i.test(id);
}

/**
 * Compute a stable repository identity.
 *
 * If KATA_PROJECT_ID is set, use it after validation. Otherwise compute
 * SHA-256 of `${remoteUrl}\n${resolvedRoot}`.
 */
export function repoIdentity(basePath: string): string {
  const projectId = process.env.KATA_PROJECT_ID;
  if (projectId) {
    if (!validateProjectId(projectId)) {
      throw new Error(
        "KATA_PROJECT_ID must be a 64-character SHA-256 hex string.",
      );
    }
    return projectId.toLowerCase();
  }

  const remoteUrl = getRemoteUrl(basePath);
  const root = resolveGitRoot(basePath);
  const input = `${remoteUrl}\n${root}`;
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Compute the external kata state directory for a repository.
 *
 * Returns `$KATA_STATE_DIR/projects/<hash>` if `KATA_STATE_DIR` is set,
 * otherwise `~/.kata-cli/projects/<hash>`.
 */
export function externalKataRoot(basePath: string): string {
  const base = process.env.KATA_STATE_DIR || kataHome;
  return join(base, "projects", repoIdentity(basePath));
}

/**
 * Check if the given directory is a git worktree (not the main repo).
 *
 * Git worktrees have a `.git` file containing a `gitdir:` pointer.
 */
export function isInsideWorktree(cwd: string): boolean {
  try {
    const commonDir = canonicalizeExistingPath(resolveGitCommonDir(cwd))
      .replaceAll("\\", "/");
    const gitDir = canonicalizeExistingPath(resolveGitDir(cwd))
      .replaceAll("\\", "/");

    if (gitDir.includes("/.git/worktrees/")) return true;
    return gitDir !== commonDir;
  } catch {
    // Fallback for very old git versions or non-git directories.
    const gitPath = join(cwd, ".git");
    try {
      const stat = lstatSync(gitPath);
      if (!stat.isFile()) return false;
      const content = readFileSync(gitPath, "utf-8").trim();
      return content.startsWith("gitdir:");
    } catch {
      return false;
    }
  }
}
