/**
 * gh-utils.ts — Pre-flight detection and parsing utilities for `kata_create_pr`.
 *
 * All functions are pure (no side effects, no logging) and return null/false on
 * failure — they never throw. Callers are responsible for surfacing errors.
 */

import { execSync } from "node:child_process";

const PIPE = { stdio: ["pipe", "pipe", "pipe"] as [string, string, string] };

/**
 * Returns true when the `gh` CLI binary is installed and callable.
 */
export function isGhInstalled(): boolean {
  try {
    execSync("gh --version", PIPE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true when the user is currently authenticated with `gh auth`.
 * A non-zero exit code (returned when unauthenticated) surfaces as false.
 */
export function isGhAuthenticated(): boolean {
  try {
    execSync("gh auth status", PIPE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the current git branch name, or null on any failure.
 */
export function getCurrentBranch(cwd: string): string | null {
  try {
    const result = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      ...PIPE,
    });
    const branch = result.trim();
    return branch || null;
  } catch {
    return null;
  }
}

/**
 * Parses a Kata-convention slice branch into structured milestone/slice IDs.
 *
 * Accepted formats:
 * - Namespaced: `kata/<scope>/<MilestoneId>/<SliceId>`
 * - Legacy:     `kata/<MilestoneId>/<SliceId>`
 *
 * Returns null when the branch does not match either accepted pattern.
 *
 * @example
 * parseBranchToSlice("kata/apps-cli/M001/S01") // → { milestoneId: "M001", sliceId: "S01" }
 * parseBranchToSlice("kata/M001/S01")          // → { milestoneId: "M001", sliceId: "S01" }
 * parseBranchToSlice("main")                   // → null
 */
export function parseBranchToSlice(
  branch: string,
): { milestoneId: string; sliceId: string } | null {
  const namespaced = branch.match(/^kata\/[^/]+\/([A-Z]\d+)\/([A-Z]\d+)$/);
  if (namespaced) {
    return { milestoneId: namespaced[1], sliceId: namespaced[2] };
  }

  const legacy = branch.match(/^kata\/([A-Z]\d+)\/([A-Z]\d+)$/);
  if (!legacy) return null;
  return { milestoneId: legacy[1], sliceId: legacy[2] };
}

/**
 * Detects the GitHub remote from `origin` and parses owner/repo from the URL.
 * Handles both SSH (`git@github.com:owner/repo.git`) and HTTPS
 * (`https://github.com/owner/repo.git`) formats.
 * Returns null on any failure.
 */
export function detectGitHubRepo(
  cwd: string,
): { owner: string; repo: string } | null {
  try {
    const url = execSync("git remote get-url origin", {
      cwd,
      encoding: "utf8",
      ...PIPE,
    }).trim();

    // SSH: git@github.com:owner/repo.git
    const sshMatch = url.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = url.match(
      /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
    );
    if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

    return null;
  } catch {
    return null;
  }
}
