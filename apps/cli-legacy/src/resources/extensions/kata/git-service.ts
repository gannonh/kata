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
  // Math.max(1, ...) guards against negative values when taskId is unusually long,
  // which would cause slice(0, negative) to strip from the end instead of truncating.
  const maxDescLen = Math.max(1, 68 - type.length - scope.length);
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

// ─── Module-level session state ───────────────────────────────────────────────

/**
 * Tracks repos where the one-time runtime-file index cleanup has already run.
 * Keyed by basePath. Persists for the process lifetime — this is correct
 * semantics: the cleanup fires at most once per repo per process.
 */
const _runtimeFilesCleanedUp = new Set<string>();

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Check whether a local branch exists.
 *
 * Uses try/catch instead of { allowFailure: true } because `--quiet` produces
 * no stdout on either success or failure — the output can't distinguish the
 * two cases. try/catch on exit code is reliable.
 */
function branchExists(basePath: string, branch: string): boolean {
  try {
    runGit(basePath, ["show-ref", "--verify", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stage all changes, then unstage each runtime exclusion path.
 *
 * On the first call for a given basePath, also removes tracked runtime files
 * from the git index (one-time cleanup for files that were historically
 * committed before .kata-cli/ was added to .gitignore).
 *
 * Ordering matters:
 *   1. `git add -A` stages everything (including tracked runtime file modifications)
 *   2. `git reset HEAD -- <path>` unstages each exclusion path
 *   3. `git rm --cached -r --force -- <path>` removes tracked runtime files from
 *      the index entirely (creates a "deleted" staging entry → committed in the
 *      first autoCommit as "untrack these files"). Guarded by _runtimeFilesCleanedUp.
 *
 * allowFailure is set on reset and rm because paths that are not staged or not
 * tracked simply produce a non-zero exit — not an error condition.
 */
function smartStage(basePath: string, extraExclusions: readonly string[] = []): void {
  const allExclusions = [...RUNTIME_EXCLUSION_PATHS, ...extraExclusions];

  // Stage everything first
  runGit(basePath, ["add", "-A"]);

  // Unstage each runtime/extra exclusion path
  for (const path of allExclusions) {
    runGit(basePath, ["reset", "HEAD", "--", path], { allowFailure: true });
  }

  // One-time cleanup: remove previously-tracked runtime files from the index.
  // Runs at most once per basePath per process lifetime.
  if (!_runtimeFilesCleanedUp.has(basePath)) {
    for (const path of allExclusions) {
      runGit(basePath, ["rm", "--cached", "-r", "--force", "--", path], {
        allowFailure: true,
      });
    }
    _runtimeFilesCleanedUp.add(basePath);
  }
}

// ─── Git I/O Functions ────────────────────────────────────────────────────────

/**
 * Get the current branch name.
 * Returns the branch name trimmed of whitespace.
 */
export function getCurrentBranch(basePath: string): string {
  return runGit(basePath, ["branch", "--show-current"]);
}

/**
 * Detect the integration (main) branch for the repo.
 *
 * Resolution order:
 *   1. Explicit `prefs.main_branch` override (if branch exists locally)
 *   2. `origin/HEAD` symbolic-ref (the remote's default branch)
 *   3. `refs/heads/main` — most common default name
 *   4. `refs/heads/master` — legacy default name
 *   5. Current branch (last resort / detached HEAD fallback)
 *
 * Observability: when no remote is configured (common in test repos), steps 2
 * and 3/4 fall through naturally and the current branch is returned — which
 * is correct for single-branch repos and test environments.
 */
export function getMainBranch(basePath: string, prefs?: GitPreferences): string {
  // Step 1: explicit preference override
  if (prefs?.main_branch && branchExists(basePath, prefs.main_branch)) {
    return prefs.main_branch;
  }

  // Step 2: origin/HEAD symbolic ref (remote's default branch)
  const originHead = runGit(
    basePath,
    ["symbolic-ref", "refs/remotes/origin/HEAD"],
    { allowFailure: true },
  );
  if (originHead) {
    const prefix = "refs/remotes/origin/";
    if (originHead.startsWith(prefix)) {
      const branch = originHead.slice(prefix.length).trim();
      if (branch && branchExists(basePath, branch)) return branch;
    }
  }

  // Step 3: check refs/heads/main
  if (runGit(basePath, ["show-ref", "--verify", "refs/heads/main"], { allowFailure: true })) {
    return "main";
  }

  // Step 4: check refs/heads/master
  if (runGit(basePath, ["show-ref", "--verify", "refs/heads/master"], { allowFailure: true })) {
    return "master";
  }

  // Step 5: fall back to current branch (detached HEAD / single-branch repo)
  return runGit(basePath, ["branch", "--show-current"]);
}

/**
 * Commit the current staging area with the given message.
 *
 * Returns opts.message on success (the caller can use this as the "what was committed"
 * signal), or null when nothing is staged and allowEmpty is not set.
 *
 * Uses `git commit -F -` (read message from stdin) for multi-line and special-character
 * safety — avoids shell quoting issues with `-m` and message contents.
 *
 * Observability: null return is the explicit "nothing to commit after exclusions"
 * signal — callers should treat null as a no-op, not an error.
 */
export function commit(basePath: string, opts: CommitOptions): string | null {
  const staged = runGit(basePath, ["diff", "--cached", "--name-only"], {
    allowFailure: true,
  });
  if (!staged && !opts.allowEmpty) return null;

  const args = ["commit", "-F", "-"];
  if (opts.allowEmpty) args.push("--allow-empty");
  runGit(basePath, args, { input: opts.message });
  return opts.message;
}

/**
 * Smart-stage all dirty files (excluding RUNTIME_EXCLUSION_PATHS and any
 * extra exclusions) and auto-commit.
 *
 * Returns the commit message string on success, null when nothing to commit
 * after exclusions (i.e. only runtime files were dirty).
 *
 * Commit message:
 *   - With taskContext: delegates to buildTaskCommitMessage for a meaningful
 *     conventional commit line derived from the task execution results.
 *   - Without taskContext: generic `chore(${unitId}): auto-commit after ${unitType}`
 *
 * Observability: null return signals the "only runtime files were dirty" condition
 * — callers can use this to skip logging a commit that didn't happen.
 */
export function autoCommitCurrentBranch(
  basePath: string,
  unitType: string,
  unitId: string,
  taskContext?: TaskCommitContext,
  extraExclusions?: readonly string[],
): string | null {
  smartStage(basePath, extraExclusions ?? []);

  // After exclusion-aware staging, check if anything is actually staged
  const staged = runGit(basePath, ["diff", "--cached", "--name-only"], {
    allowFailure: true,
  });
  if (!staged) return null;

  const message = taskContext
    ? buildTaskCommitMessage(taskContext)
    : `chore(${unitId}): auto-commit after ${unitType}`;

  return commit(basePath, { message });
}

/**
 * Squash-merge the current slice branch into the main/integration branch.
 *
 * Workflow:
 *   1. Capture current (slice) branch name
 *   2. Detect main branch
 *   3. Switch to main
 *   4. `git merge --squash <sliceBranch>` — stages all slice commits as one
 *   5. Commit with a conventional feat() message
 *
 * Throws MergeConflictError (not a generic Error) when the squash merge
 * encounters conflicts. The working tree is left in conflicted state so
 * the caller can dispatch a fix session.
 *
 * Observability: MergeConflictError exposes conflictedFiles[], branch, mainBranch,
 * and strategy — a future agent can inspect this without running git manually.
 */
export function mergeSliceToMain(
  basePath: string,
  milestoneId: string,
  sliceId: string,
  sliceTitle: string,
  prefs?: GitPreferences,
): MergeSliceResult {
  const sliceBranch = getCurrentBranch(basePath);
  const mainBranch = getMainBranch(basePath, prefs);

  runGit(basePath, ["switch", mainBranch]);

  // Only squash-merge is implemented; non-squash strategy is a future TODO.
  try {
    runGit(basePath, ["merge", "--squash", sliceBranch]);
  } catch (mergeErr) {
    // Collect conflicted files for the caller to act on
    const conflictedFiles = runGit(
      basePath,
      ["diff", "--name-only", "--diff-filter=U"],
      { allowFailure: true },
    )
      .split("\n")
      .filter(Boolean);

    // Non-conflict failure (missing branch, dirty index, invalid ref, etc.)
    // — rethrow the original git error rather than misclassifying it as a conflict.
    if (conflictedFiles.length === 0) {
      throw mergeErr;
    }

    throw new MergeConflictError({
      message: `Merge conflict while squashing ${sliceBranch} into ${mainBranch}`,
      conflictedFiles,
      strategy: "squash", // always squash — non-squash merge path not yet implemented
      branch: sliceBranch,
      mainBranch,
    });
  }

  const squashMsg = `feat(${milestoneId}/${sliceId}): ${sliceTitle}`;
  const committed = commit(basePath, { message: squashMsg });
  if (!committed) {
    throw new Error(
      `Squash of ${sliceBranch} into ${mainBranch} staged nothing — slice may be empty or already merged`,
    );
  }

  return { branch: sliceBranch, mergedCommitMessage: squashMsg, deletedBranch: false };
}
