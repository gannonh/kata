import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import {
  canonicalizeExistingPath,
  isInsideWorktree,
  resolveGitCommonDir,
} from "./repo-identity.js";

function runGit(basePath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: basePath,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5_000,
  }).trim();
}

function resolveAbsoluteGitDir(basePath: string): string {
  try {
    return runGit(basePath, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  } catch {
    const raw = runGit(basePath, ["rev-parse", "--git-dir"]);
    return resolve(basePath, raw);
  }
}

/**
 * Returns true when basePath points at a git worktree checkout.
 */
export function isInWorktree(basePath: string): boolean {
  return isInsideWorktree(basePath);
}

/**
 * Returns the worktree name when basePath is a worktree, otherwise null.
 */
export function getWorktreeName(basePath: string): string | null {
  if (!isInWorktree(basePath)) return null;

  const gitDir = resolveAbsoluteGitDir(basePath).replaceAll("\\", "/");
  const marker = "/.git/worktrees/";
  const idx = gitDir.indexOf(marker);
  if (idx < 0) return null;

  const remainder = gitDir.slice(idx + marker.length);
  const name = remainder.split("/")[0];
  return name || null;
}

/**
 * Resolves the main (non-worktree) repository root path.
 */
export function getMainRepoPath(basePath: string): string {
  const commonDir = resolveGitCommonDir(basePath);
  const normalized = commonDir.replaceAll("\\", "/");

  if (normalized.endsWith("/.git")) {
    return canonicalizeExistingPath(resolve(commonDir, ".."));
  }

  const worktreeMarker = "/.git/worktrees/";
  if (normalized.includes(worktreeMarker)) {
    return canonicalizeExistingPath(resolve(commonDir, "..", ".."));
  }

  return canonicalizeExistingPath(runGit(basePath, ["rev-parse", "--show-toplevel"]));
}

/**
 * Returns the effective basePath:
 * - main repository path when running in a worktree
 * - provided path (canonicalized) otherwise
 */
export function resolveWorktreeBasePath(basePath: string): string {
  const canonicalBasePath = canonicalizeExistingPath(basePath);
  if (isInWorktree(canonicalBasePath)) {
    return getMainRepoPath(canonicalBasePath);
  }
  return canonicalBasePath;
}
