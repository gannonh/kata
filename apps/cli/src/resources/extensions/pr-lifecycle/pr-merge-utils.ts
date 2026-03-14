/**
 * pr-merge-utils.ts — CI validation, GitHub PR merge, local branch cleanup,
 * and roadmap checkbox update utilities for `kata_merge_pr`.
 *
 * All functions are designed to be safe:
 * - `parseCIChecks` never throws (returns fail-closed on invalid JSON per D047)
 * - `mergeGitHubPR` returns structured result, never throws
 * - `syncLocalAfterMerge` best-effort, never propagates exceptions
 * - `markSliceDoneInRoadmap` returns boolean, never throws
 *
 * D046: `updateSliceInRoadmap` uses `^` + `m` anchored regex for line matching.
 * D047: `parseCIChecks` invalid JSON → `{ allPassing: false }` fail-closed.
 *       `execSync` throw in tool handler (no CI configured) → treat as allPassing.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CICheckResult {
  allPassing: boolean;
  failing: string[];
  pending: string[];
}

export type MergeResult =
  | { ok: true; url: string }
  | { ok: false; phase: string; error: string };

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Conclusions that are treated as failures (O(1) lookup per D047). */
const FAILING_CONCLUSIONS = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "startup_failure",
  "stale",
]);

const PIPE = {
  stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
};

// ---------------------------------------------------------------------------
// parseCIChecks
// ---------------------------------------------------------------------------

/**
 * Parses the JSON output of `gh pr checks --json name,status,conclusion`.
 *
 * - Empty array → `{ allPassing: true, failing: [], pending: [] }`
 * - Status !== "completed" → added to `pending`
 * - Conclusion in FAILING_CONCLUSIONS → added to `failing`
 * - Invalid JSON → `{ allPassing: false, failing: [], pending: [] }` (fail-closed, D047)
 */
export function parseCIChecks(rawJson: string): CICheckResult {
  try {
    const checks = JSON.parse(rawJson) as Array<{
      name: string;
      status: string;
      conclusion: string | null;
    }>;

    if (!Array.isArray(checks) || checks.length === 0) {
      return { allPassing: true, failing: [], pending: [] };
    }

    const failing: string[] = [];
    const pending: string[] = [];

    for (const check of checks) {
      if (check.status !== "completed") {
        pending.push(check.name);
      } else if (check.conclusion && FAILING_CONCLUSIONS.has(check.conclusion)) {
        failing.push(check.name);
      }
    }

    return {
      allPassing: failing.length === 0 && pending.length === 0,
      failing,
      pending,
    };
  } catch {
    // Invalid JSON → fail-closed (D047)
    return { allPassing: false, failing: [], pending: [] };
  }
}

// ---------------------------------------------------------------------------
// getPRNumber
// ---------------------------------------------------------------------------

/**
 * Detects the open PR number for the current branch via `gh pr view`.
 * Returns null when no open PR is found or on any error.
 */
export function getPRNumber(cwd: string): number | null {
  try {
    const stdout = execSync("gh pr view --json number", {
      cwd,
      encoding: "utf8",
      ...PIPE,
    });
    const data = JSON.parse(stdout) as { number?: number };
    return typeof data.number === "number" ? data.number : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// mergeGitHubPR
// ---------------------------------------------------------------------------

/**
 * Merges a GitHub PR via `gh pr merge`.
 *
 * Fetches the PR URL before merging so it can be returned even after the
 * branch is deleted. On `gh` error, returns structured `{ ok: false, phase,
 * error }` containing raw stderr.
 */
export async function mergeGitHubPR(
  prNumber: number,
  strategy: string,
  cwd: string,
): Promise<MergeResult> {
  // Fetch PR URL before merging (branch deletion would invalidate `gh pr view` after merge)
  let url = "";
  try {
    const prData = execSync(`gh pr view ${prNumber} --json url`, {
      cwd,
      encoding: "utf8",
      ...PIPE,
    });
    const parsed = JSON.parse(prData) as { url?: string };
    if (parsed.url) url = parsed.url;
  } catch {
    // Best-effort URL fetch — proceed with fallback URL
  }

  // Build strategy flag
  const strategyFlag =
    strategy === "rebase"
      ? "--rebase"
      : strategy === "merge"
        ? "--merge"
        : "--squash";

  try {
    execSync(
      `gh pr merge ${prNumber} ${strategyFlag} --delete-branch`,
      {
        cwd,
        encoding: "utf8",
        ...PIPE,
      },
    );
    return { ok: true, url };
  } catch (err) {
    const stderr =
      (err as { stderr?: string }).stderr?.trim() ?? String(err);
    return { ok: false, phase: "merge-failed", error: stderr };
  }
}

// ---------------------------------------------------------------------------
// syncLocalAfterMerge
// ---------------------------------------------------------------------------

/**
 * Best-effort local state sync after a successful merge:
 * 1. Detect the default branch via `git symbolic-ref refs/remotes/origin/HEAD`
 *    (falls back to "main" — mirrors worktree.ts getMainBranch pattern)
 * 2. Checkout the default branch
 * 3. Pull the latest changes
 * 4. Delete the slice branch locally (if it still exists)
 *
 * Never throws — all errors are silently swallowed per the task plan spec.
 */
export function syncLocalAfterMerge(branch: string, cwd: string): void {
  try {
    // Detect main branch via symbolic-ref; fall back to "main"
    let mainBranch = "main";
    try {
      const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
        cwd,
        encoding: "utf8",
        ...PIPE,
      }).trim();
      // ref is e.g. "refs/remotes/origin/main"
      const refParts = ref.split("/");
      if (refParts.length >= 1) {
        mainBranch = refParts[refParts.length - 1];
      }
    } catch {
      // Fall back to "main"
    }

    // Checkout default branch
    execSync(`git checkout '${mainBranch.replace(/'/g, "'\\''")}'`, {
      cwd,
      encoding: "utf8",
      ...PIPE,
    });

    // Pull latest
    execSync(`git pull`, {
      cwd,
      encoding: "utf8",
      ...PIPE,
    });

    // Delete the slice branch locally (may already be deleted by gh pr merge --delete-branch)
    try {
      execSync(`git branch -D '${branch.replace(/'/g, "'\\''")}'`, {
        cwd,
        encoding: "utf8",
        ...PIPE,
      });
    } catch {
      // Branch may already be deleted — ignore
    }
  } catch {
    // Best-effort — never propagate exceptions
  }
}

// ---------------------------------------------------------------------------
// updateSliceInRoadmap (pure — operates on string content)
// ---------------------------------------------------------------------------

/**
 * Flips a slice's `- [ ] **<sliceId>:` checkbox to `- [x] **<sliceId>:`
 * in roadmap.md content.
 *
 * Uses `^` + `m` anchored regex (D046). No-op when already checked.
 * Leaves all other slice entries untouched.
 */
export function updateSliceInRoadmap(
  content: string,
  sliceId: string,
): string {
  // Match exactly: leading whitespace, "- [ ] ", "**<sliceId>:" — multiline
  const regex = new RegExp(
    `^([ \\t]*- )\\[ \\]([ \\t]*\\*\\*${sliceId}:)`,
    "m",
  );
  return content.replace(regex, "$1[x]$2");
}

// ---------------------------------------------------------------------------
// markSliceDoneInRoadmap
// ---------------------------------------------------------------------------

/**
 * Reads the milestone roadmap file, flips the target slice checkbox to [x],
 * and writes the file back. Returns `true` on success, `false` on any error.
 * Never throws.
 */
export function markSliceDoneInRoadmap(
  milestoneId: string,
  sliceId: string,
  cwd: string,
): boolean {
  try {
    const roadmapPath = join(
      cwd,
      ".kata",
      "milestones",
      milestoneId,
      `${milestoneId}-ROADMAP.md`,
    );

    const content = readFileSync(roadmapPath, "utf8");
    const updated = updateSliceInRoadmap(content, sliceId);

    if (updated === content) {
      // No change — either already done or pattern not found; return true (idempotent)
      return true;
    }

    writeFileSync(roadmapPath, updated, "utf8");
    return true;
  } catch {
    return false;
  }
}
