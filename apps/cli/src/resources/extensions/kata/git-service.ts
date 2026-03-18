/**
 * Kata Git Service
 *
 * Core git operations for Kata: types, constants, and pure helpers.
 * Higher-level operations (commit, staging, branching) build on these in T03.
 *
 * This module centralizes the GitPreferences interface, runtime exclusion
 * paths, commit type inference, and the runGit shell helper.
 */

import { execFileSync } from "node:child_process";

// ─── Environment ──────────────────────────────────────────────────────────────

/**
 * Environment variables that suppress interactive git prompts.
 * Spread with process.env in runGit so PATH and other vars are preserved.
 */
const GIT_NO_PROMPT_ENV = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_SSH_COMMAND: "ssh -o BatchMode=yes",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitPreferences {
  auto_push?: boolean;
  remote?: string;
  merge_strategy?: "squash" | "merge";
  main_branch?: string;
}

export interface CommitOptions {
  message: string;
  allowEmpty?: boolean;
}

/** Context for generating a meaningful commit message from task execution results. */
export interface TaskCommitContext {
  taskId: string;
  taskTitle: string;
  /** The one-liner from the task summary (e.g. "Added retry-aware worker status logging") */
  oneLiner?: string;
  /** Files modified by this task (from task summary frontmatter) */
  keyFiles?: string[];
}

/**
 * Thrown when a slice merge hits code conflicts.
 * The working tree is left in a conflicted state so the caller can dispatch
 * a fix-merge session to resolve it.
 */
export class MergeConflictError extends Error {
  readonly conflictedFiles: string[];
  readonly strategy: string;
  readonly branch: string;
  readonly mainBranch: string;

  constructor(props: {
    message: string;
    conflictedFiles: string[];
    strategy: string;
    branch: string;
    mainBranch: string;
  }) {
    super(props.message);
    this.name = "MergeConflictError";
    this.conflictedFiles = props.conflictedFiles;
    this.strategy = props.strategy;
    this.branch = props.branch;
    this.mainBranch = props.mainBranch;
  }
}

export interface MergeSliceResult {
  branch: string;
  mergedCommitMessage: string;
  deletedBranch: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Validates branch names against a safe character set.
 * Prevents shell injection via branch name arguments.
 * Accepts: letters, digits, dots, underscores, hyphens, slashes.
 */
export const VALID_BRANCH_NAME = /^[a-zA-Z0-9._\-\/]+$/;

/**
 * Kata runtime paths that should be excluded from smart staging.
 * These are transient/generated artifacts that should never be committed.
 * All entries use the .kata-cli/ prefix (not .gsd/).
 */
export const RUNTIME_EXCLUSION_PATHS: readonly string[] = [
  ".kata-cli/activity/",
  ".kata-cli/runtime/",
  ".kata-cli/worktrees/",
  ".kata-cli/auto.lock",
  ".kata-cli/metrics.json",
  ".kata-cli/completed-units.json",
  ".kata-cli/STATE.md",
];

// ─── Git Helper ───────────────────────────────────────────────────────────────

/**
 * Strip git-svn noise from error messages.
 * Some systems (notably Arch Linux) have a buggy git-svn Perl module that
 * emits warnings on every git invocation, confusing users.
 */
function filterGitSvnNoise(message: string): string {
  return message
    .replace(/Pseudo-merge base [^\n]*\n?/g, "")
    .replace(/Duplicate specification "[^"]*" for option "[^"]*"\n?/g, "")
    .replace(/Unable to determine upstream SVN information from .*\n?/g, "")
    .replace(/Perhaps the repository is empty\. at .*git-svn.*\n?/g, "")
    .trim();
}

/**
 * Run a git command in the given directory.
 * Returns trimmed stdout. Throws on non-zero exit unless allowFailure is set.
 * When `input` is provided, it is piped to stdin.
 *
 * Observability: on failure, the thrown Error.message includes both the git
 * command args and the filtered stderr — enabling a future agent to read the
 * exact git failure without re-running the command.
 */
export function runGit(
  basePath: string,
  args: string[],
  options: { allowFailure?: boolean; input?: string } = {},
): string {
  try {
    return execFileSync("git", args, {
      cwd: basePath,
      encoding: "utf-8",
      env: { ...process.env, ...GIT_NO_PROMPT_ENV },
      stdio: options.input != null ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      ...(options.input != null ? { input: options.input } : {}),
    }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `git ${args.join(" ")} failed in ${basePath}: ${filterGitSvnNoise(message)}`,
    );
  }
}

// ─── Commit Type Inference ────────────────────────────────────────────────────

/**
 * Keyword-to-commit-type mapping. Order matters — first match wins.
 * Each entry: [keywords[], commitType].
 * Word-boundary matching prevents partial matches (e.g. "fix" ≠ "prefix").
 * Multi-word keywords (e.g. "clean up") use substring matching.
 */
const COMMIT_TYPE_RULES: [string[], string][] = [
  [["fix", "fixed", "fixes", "bug", "patch", "hotfix", "repair", "correct"], "fix"],
  [["refactor", "restructure", "reorganize"], "refactor"],
  [["doc", "docs", "documentation", "readme", "changelog"], "docs"],
  [["test", "tests", "testing", "spec", "coverage"], "test"],
  [["perf", "performance", "optimize", "speed", "cache"], "perf"],
  [
    [
      "chore",
      "cleanup",
      "clean up",
      "dependencies",
      "deps",
      "bump",
      "config",
      "ci",
      "archive",
      "remove",
      "delete",
    ],
    "chore",
  ],
];

/**
 * Infer a conventional commit type from a title (and optional one-liner).
 * Uses case-insensitive word-boundary matching against known keywords.
 * Returns "feat" when no keywords match.
 *
 * Used for both slice squash-merge titles and task commit messages.
 */
export function inferCommitType(title: string, oneLiner?: string): string {
  const lower = `${title} ${oneLiner ?? ""}`.toLowerCase();

  for (const [keywords, commitType] of COMMIT_TYPE_RULES) {
    for (const keyword of keywords) {
      if (keyword.includes(" ")) {
        // Multi-word keyword: use substring match (word boundaries don't apply)
        if (lower.includes(keyword)) return commitType;
      } else {
        // Single word: use word-boundary regex to prevent partial matches
        const re = new RegExp(`\\b${keyword}\\b`, "i");
        if (re.test(lower)) return commitType;
      }
    }
  }

  return "feat";
}

// ─── Commit Message Builder ───────────────────────────────────────────────────

/**
 * Build a meaningful conventional commit message from task execution context.
 * Format: `{type}({taskId}): {description}`
 *
 * The description is the task summary one-liner if available (it describes
 * what was actually built), falling back to the task title (what was planned).
 * The commit type is inferred from the title and one-liner keywords.
 */
export function buildTaskCommitMessage(ctx: TaskCommitContext): string {
  const scope = ctx.taskId;
  const description = ctx.oneLiner ?? ctx.taskTitle;
  const type = inferCommitType(ctx.taskTitle, ctx.oneLiner);

  // Truncate description to keep subject line under ~72 chars
  const maxDescLen = 68 - type.length - scope.length;
  const truncated =
    description.length > maxDescLen
      ? description.slice(0, maxDescLen - 1).trimEnd() + "…"
      : description;

  const subject = `${type}(${scope}): ${truncated}`;

  // Build body with key files if available (capped at 8 to keep commit concise)
  if (ctx.keyFiles && ctx.keyFiles.length > 0) {
    const fileLines = ctx.keyFiles
      .slice(0, 8)
      .map((f) => `- ${f}`)
      .join("\n");
    return `${subject}\n\n${fileLines}`;
  }

  return subject;
}

// ─── Git I/O Stubs (implemented in T03) ──────────────────────────────────────
// Exported here so the module satisfies all named imports in the test file.
// T03 replaces these with real implementations.

/** Get the current branch name. Implemented in T03. */
export function getCurrentBranch(_basePath: string): string {
  throw new Error("getCurrentBranch not yet implemented — see T03");
}

/** Detect the integration (main) branch for the repo. Implemented in T03. */
export function getMainBranch(_basePath: string): string {
  throw new Error("getMainBranch not yet implemented — see T03");
}

/**
 * Smart-stage and auto-commit dirty working tree, excluding runtime paths.
 * Implemented in T03.
 */
export function autoCommitCurrentBranch(
  _basePath: string,
  _unitType: string,
  _unitId: string,
  _taskContext?: TaskCommitContext,
  _extraExclusions?: readonly string[],
): string | null {
  throw new Error("autoCommitCurrentBranch not yet implemented — see T03");
}

/**
 * Stage (smart) and commit with the given options.
 * Returns commit message on success, null when nothing to commit.
 * Implemented in T03.
 */
export function commit(_basePath: string, _opts: CommitOptions): string | null {
  throw new Error("commit not yet implemented — see T03");
}
