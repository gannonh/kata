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

import path from "node:path";

import {
  autoCommitCurrentBranch as autoCommitCurrentBranchFromGitService,
  getCurrentBranch as getCurrentBranchFromGitService,
  getMainBranch as getMainBranchFromGitService,
  runGit,
} from "./git-service.ts";
import { resolveGitRoot } from "./git-utils.ts";

const LEGACY_SLICE_BRANCH_RE = /^kata\/([A-Z]\d+)\/([A-Z]\d+)$/;
const NAMESPACED_SLICE_BRANCH_RE = /^kata\/([^/]+)\/([A-Z]\d+)\/([A-Z]\d+)$/;

export interface MergeSliceResult {
  branch: string;
  mergedCommitMessage: string;
  deletedBranch: boolean;
}

function normalizeScopeSegment(scope: string): string {
  const sanitized = scope
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "root";
}

export function getProjectScope(basePath: string): string {
  const gitRoot = resolveGitRoot(basePath);
  const relative = path.relative(gitRoot, basePath);

  // If basePath is not inside gitRoot (e.g. a polluted GIT_DIR env),
  // avoid leaking absolute path structure into branch names.
  if (
    !relative
    || relative === "."
    || relative.startsWith(`..${path.sep}`)
    || relative === ".."
    || path.isAbsolute(relative)
  ) {
    return "root";
  }

  const normalized = relative
    .split(path.sep)
    .filter(Boolean)
    .join("-");

  return normalizeScopeSegment(normalized);
}

function getLegacySliceBranchName(milestoneId: string, sliceId: string): string {
  return `kata/${milestoneId}/${sliceId}`;
}

export function getSliceBranchName(basePath: string, milestoneId: string, sliceId: string): string {
  return `kata/${getProjectScope(basePath)}/${milestoneId}/${sliceId}`;
}

export function getMainBranch(basePath: string): string {
  return getMainBranchFromGitService(basePath);
}

export function getCurrentBranch(basePath: string): string {
  return getCurrentBranchFromGitService(basePath);
}

function branchExists(basePath: string, branch: string): boolean {
  try {
    runGit(basePath, ["show-ref", "--verify", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

function parseNamespacedSliceBranch(branch: string): {
  scope: string;
  milestoneId: string;
  sliceId: string;
} | null {
  const match = branch.match(NAMESPACED_SLICE_BRANCH_RE);
  if (!match) return null;
  const [, scope, milestoneId, sliceId] = match;
  return {
    scope: scope!,
    milestoneId: milestoneId!,
    sliceId: sliceId!,
  };
}

function parseLegacySliceBranch(branch: string): {
  milestoneId: string;
  sliceId: string;
} | null {
  const match = branch.match(LEGACY_SLICE_BRANCH_RE);
  if (!match) return null;
  const [, milestoneId, sliceId] = match;
  return {
    milestoneId: milestoneId!,
    sliceId: sliceId!,
  };
}

function listKataBranches(basePath: string): string[] {
  const refs = runGit(
    basePath,
    ["for-each-ref", "--format=%(refname:short)", "refs/heads/kata"],
    { allowFailure: true },
  );
  if (!refs) return [];
  return refs
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

function findConflictingNamespacedBranch(
  basePath: string,
  milestoneId: string,
  sliceId: string,
  expectedScope: string,
): string | null {
  for (const branch of listKataBranches(basePath)) {
    const parsed = parseNamespacedSliceBranch(branch);
    if (!parsed) continue;
    if (parsed.milestoneId !== milestoneId) continue;
    if (parsed.sliceId !== sliceId) continue;
    if (parsed.scope === expectedScope) continue;
    return branch;
  }

  return null;
}

function resolvePreferredSliceBranch(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): string | null {
  const namespacedBranch = getSliceBranchName(basePath, milestoneId, sliceId);
  if (branchExists(basePath, namespacedBranch)) {
    return namespacedBranch;
  }

  const legacyBranch = getLegacySliceBranchName(milestoneId, sliceId);
  if (!branchExists(basePath, legacyBranch)) {
    return null;
  }

  const expectedScope = getProjectScope(basePath);
  const conflictingBranch = findConflictingNamespacedBranch(
    basePath,
    milestoneId,
    sliceId,
    expectedScope,
  );
  if (conflictingBranch) {
    return null;
  }

  return legacyBranch;
}

/**
 * Ensure the slice branch exists and is checked out.
 * Creates the branch from main if it doesn't exist.
 * Returns true if the branch was newly created.
 */
export function ensureSliceBranch(basePath: string, milestoneId: string, sliceId: string): boolean {
  const namespacedBranch = getSliceBranchName(basePath, milestoneId, sliceId);
  const legacyBranch = getLegacySliceBranchName(milestoneId, sliceId);
  const current = getCurrentBranch(basePath);

  if (current === namespacedBranch) return false;

  const preferredExisting = resolvePreferredSliceBranch(basePath, milestoneId, sliceId);
  if (preferredExisting) {
    runGit(basePath, ["checkout", preferredExisting]);
    return false;
  }

  const expectedScope = getProjectScope(basePath);
  const conflictingBranch = findConflictingNamespacedBranch(
    basePath,
    milestoneId,
    sliceId,
    expectedScope,
  );
  if (conflictingBranch) {
    throw new Error(
      `Refusing to use legacy branch ${legacyBranch} for ${milestoneId}/${sliceId} due conflicting scope namespace: found ${conflictingBranch}; expected ${namespacedBranch} (scope ${expectedScope})`,
    );
  }

  const mainBranch = getMainBranch(basePath);
  runGit(basePath, ["branch", namespacedBranch, mainBranch]);
  runGit(basePath, ["checkout", namespacedBranch]);
  return true;
}

/**
 * Auto-commit any dirty files in the current working tree.
 * Returns the commit message used, or null if already clean.
 */
export function autoCommitCurrentBranch(
  basePath: string, unitType: string, unitId: string,
): string | null {
  return autoCommitCurrentBranchFromGitService(basePath, unitType, unitId);
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
  const namespacedBranch = getSliceBranchName(basePath, milestoneId, sliceId);
  const legacyBranch = getLegacySliceBranchName(milestoneId, sliceId);
  let branch = namespacedBranch;
  if (!branchExists(basePath, namespacedBranch)) {
    const expectedScope = getProjectScope(basePath);
    const conflictingBranch = findConflictingNamespacedBranch(
      basePath,
      milestoneId,
      sliceId,
      expectedScope,
    );
    if (conflictingBranch) {
      throw new Error(
        `Refusing to merge legacy branch ${legacyBranch} for ${milestoneId}/${sliceId} due conflicting scope namespace: found ${conflictingBranch}; expected ${namespacedBranch} (scope ${expectedScope})`,
      );
    }
    branch = legacyBranch;
  }

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

export function parseSliceBranchName(branch: string): {
  scope?: string;
  milestoneId: string;
  sliceId: string;
  namespaced: boolean;
} | null {
  const namespaced = parseNamespacedSliceBranch(branch);
  if (namespaced) {
    return {
      scope: namespaced.scope,
      milestoneId: namespaced.milestoneId,
      sliceId: namespaced.sliceId,
      namespaced: true,
    };
  }

  const legacy = parseLegacySliceBranch(branch);
  if (legacy) {
    return {
      milestoneId: legacy.milestoneId,
      sliceId: legacy.sliceId,
      namespaced: false,
    };
  }

  return null;
}
