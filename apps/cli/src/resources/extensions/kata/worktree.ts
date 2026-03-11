/**
 * Kata Slice Branch Management
 *
 * Simple branch-per-slice workflow. No worktrees, no registry.
 * Runtime state (metrics, activity, lock, STATE.md) is gitignored
 * so branch switches are clean.
 *
 * Flow:
 *   1. ensureSliceBranch() — create + checkout slice branch
 *   2. agent does work, commits
 *   3. mergeSliceToMain() — checkout main, squash-merge, delete branch
 */

import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

export interface MergeSliceResult {
  branch: string;
  mergedCommitMessage: string;
  deletedBranch: boolean;
}

function runGit(basePath: string, args: string[], options: { allowFailure?: boolean } = {}): string {
  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`git ${args.join(" ")} failed in ${basePath}: ${message}`);
  }
}

export function getSliceBranchName(milestoneId: string, sliceId: string): string {
  return `kata/${milestoneId}/${sliceId}`;
}

export function getMainBranch(basePath: string): string {
  const symbolic = runGit(basePath, ["symbolic-ref", "refs/remotes/origin/HEAD"], { allowFailure: true });
  if (symbolic) {
    const match = symbolic.match(/refs\/remotes\/origin\/(.+)$/);
    if (match) return match[1]!;
  }

  const mainExists = runGit(basePath, ["show-ref", "--verify", "refs/heads/main"], { allowFailure: true });
  if (mainExists) return "main";

  const masterExists = runGit(basePath, ["show-ref", "--verify", "refs/heads/master"], { allowFailure: true });
  if (masterExists) return "master";

  return runGit(basePath, ["branch", "--show-current"]);
}

export function getCurrentBranch(basePath: string): string {
  return runGit(basePath, ["branch", "--show-current"]);
}

function branchExists(basePath: string, branch: string): boolean {
  try {
    runGit(basePath, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the slice branch exists and is checked out.
 * Creates the branch from main if it doesn't exist.
 * Returns true if the branch was newly created.
 */
export function ensureSliceBranch(basePath: string, milestoneId: string, sliceId: string): boolean {
  const branch = getSliceBranchName(milestoneId, sliceId);
  const current = getCurrentBranch(basePath);

  if (current === branch) return false;

  const mainBranch = getMainBranch(basePath);
  let created = false;

  if (!branchExists(basePath, branch)) {
    runGit(basePath, ["branch", branch, mainBranch]);
    created = true;
  }

  runGit(basePath, ["checkout", branch]);
  return created;
}

/**
 * Auto-commit any dirty files in the current working tree.
 * Returns the commit message used, or null if already clean.
 */
export function autoCommitCurrentBranch(
  basePath: string, unitType: string, unitId: string,
): string | null {
  const status = runGit(basePath, ["status", "--short"]);
  if (!status.trim()) return null;

  runGit(basePath, ["add", "-A"]);

  const staged = runGit(basePath, ["diff", "--cached", "--stat"]);
  if (!staged.trim()) return null;

  const message = `chore(${unitId}): auto-commit after ${unitType}`;
  runGit(basePath, ["commit", "-m", JSON.stringify(message)]);
  return message;
}

/**
 * Switch to main, auto-committing any dirty files on the current branch first.
 */
export function switchToMain(basePath: string): void {
  const mainBranch = getMainBranch(basePath);
  const current = getCurrentBranch(basePath);
  if (current === mainBranch) return;

  // Auto-commit if dirty
  autoCommitCurrentBranch(basePath, "pre-switch", current);

  runGit(basePath, ["checkout", mainBranch]);
}

/**
 * Squash-merge a completed slice branch to main.
 * Expects to already be on main (call switchToMain first).
 * Deletes the branch after merge.
 */
export function mergeSliceToMain(
  basePath: string, milestoneId: string, sliceId: string, sliceTitle: string,
): MergeSliceResult {
  const branch = getSliceBranchName(milestoneId, sliceId);
  const mainBranch = getMainBranch(basePath);

  const current = getCurrentBranch(basePath);
  if (current !== mainBranch) {
    throw new Error(`Expected to be on ${mainBranch}, found ${current}`);
  }

  if (!branchExists(basePath, branch)) {
    throw new Error(`Slice branch ${branch} does not exist`);
  }

  const ahead = runGit(basePath, ["rev-list", "--count", `${mainBranch}..${branch}`]);
  if (Number(ahead) <= 0) {
    throw new Error(`Slice branch ${branch} has no commits ahead of ${mainBranch}`);
  }

  runGit(basePath, ["merge", "--squash", branch]);
  const mergedCommitMessage = `feat(${milestoneId}/${sliceId}): ${sliceTitle}`;
  runGit(basePath, ["commit", "-m", JSON.stringify(mergedCommitMessage)]);
  runGit(basePath, ["branch", "-D", branch]);

  return {
    branch,
    mergedCommitMessage,
    deletedBranch: true,
  };
}

/**
 * Check if we're currently on a slice branch (not main).
 */
export function isOnSliceBranch(basePath: string): boolean {
  const current = getCurrentBranch(basePath);
  return current.startsWith("kata/");
}

/**
 * Get the active slice branch name, or null if on main.
 */
export function getActiveSliceBranch(basePath: string): string | null {
  try {
    const current = getCurrentBranch(basePath);
    return current.startsWith("kata/") ? current : null;
  } catch {
    return null;
  }
}
