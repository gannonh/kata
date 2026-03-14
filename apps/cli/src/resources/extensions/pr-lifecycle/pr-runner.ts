/**
 * pr-runner.ts — Shared PR creation orchestration.
 *
 * Extracted from the `kata_create_pr` tool handler so both the tool and
 * auto-mode can invoke the same deterministic PR creation implementation.
 *
 * All failure paths return a structured `{ ok: false, phase, error, hint }`
 * object — the runner never throws.
 */

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  isGhInstalled,
  isGhAuthenticated,
  getCurrentBranch,
  parseBranchToSlice,
} from "./gh-utils.js";
import { composePRBody } from "./pr-body-composer.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PrCreateResult =
  | { ok: true; url: string }
  | { ok: false; phase: string; error: string; hint: string };

export interface PrCreateOptions {
  title: string;
  baseBranch?: string;
  milestoneId?: string;
  sliceId?: string;
  cwd?: string;
}

// ─── Shell escaping ───────────────────────────────────────────────────────────

/** Shell-escape a single argument (single-quote wrapping with embedded-quote escaping). */
function shellEscape(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

// ─── Runner ───────────────────────────────────────────────────────────────────

/**
 * Creates a GitHub PR for the current Kata slice.
 *
 * Performs pre-flight checks (gh installed, gh authenticated, python3 available),
 * resolves milestone/slice IDs from the current branch when not provided,
 * composes the PR body from Kata slice artifacts, and delegates to the bundled
 * `create_pr_safe.py` script.
 *
 * Returns `{ ok: true, url }` on success; `{ ok: false, phase, error, hint }` on
 * any failure. Never throws.
 */
export async function runCreatePr(options: PrCreateOptions): Promise<PrCreateResult> {
  const { title, baseBranch = "main" } = options;
  const cwd = options.cwd ?? process.cwd();

  // ── Pre-flight checks ────────────────────────────────────────────────────────

  if (!isGhInstalled()) {
    return {
      ok: false,
      phase: "gh-missing",
      error: "gh CLI not found in PATH",
      hint: "Install gh CLI: https://cli.github.com",
    };
  }

  if (!isGhAuthenticated()) {
    return {
      ok: false,
      phase: "gh-unauth",
      error: "gh CLI not authenticated",
      hint: "Run: gh auth login",
    };
  }

  try {
    execSync("python3 --version", {
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch {
    return {
      ok: false,
      phase: "python3-missing",
      error: "python3 not found in PATH",
      hint: "Install Python 3: https://python.org",
    };
  }

  // ── Resolve milestone / slice IDs ────────────────────────────────────────────

  let milestoneId = options.milestoneId;
  let sliceId = options.sliceId;

  if (!milestoneId || !sliceId) {
    const branch = getCurrentBranch(cwd);
    if (!branch) {
      return {
        ok: false,
        phase: "branch-parse-failed",
        error: "Could not determine current git branch",
        hint: "Run from a git repository, or pass milestoneId and sliceId explicitly.",
      };
    }
    const parsed = parseBranchToSlice(branch);
    if (!parsed) {
      return {
        ok: false,
        phase: "branch-parse-failed",
        error: `Current branch '${branch}' does not match kata/<MilestoneId>/<SliceId> pattern`,
        hint:
          "Switch to a Kata slice branch (e.g. kata/M003/S01) or pass milestoneId and sliceId explicitly.",
      };
    }
    milestoneId = parsed.milestoneId;
    sliceId = parsed.sliceId;
  }

  // ── Compose PR body ──────────────────────────────────────────────────────────

  let body: string;
  try {
    body = await composePRBody(milestoneId, sliceId, cwd);
  } catch (err) {
    return {
      ok: false,
      phase: "artifact-error",
      error: `Failed to compose PR body: ${err instanceof Error ? err.message : String(err)}`,
      hint: `Ensure .kata/milestones/${milestoneId}/slices/${sliceId}/ exists and contains a slice plan.`,
    };
  }

  // ── Write body to temp file and invoke create_pr_safe.py ────────────────────

  const tmpPath = join(tmpdir(), randomUUID() + ".md");
  let prUrl: string;

  try {
    writeFileSync(tmpPath, body, "utf8");

    const scriptPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "scripts",
      "create_pr_safe.py",
    );

    const cmd = [
      "python3",
      shellEscape(scriptPath),
      "--title",
      shellEscape(title),
      "--base",
      shellEscape(baseBranch),
      "--body-file",
      shellEscape(tmpPath),
    ].join(" ");

    try {
      const stdout = execSync(cmd, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        cwd,
      });
      prUrl = stdout.trim();
    } catch (err) {
      const stderr =
        err instanceof Error && "stderr" in err
          ? String((err as NodeJS.ErrnoException & { stderr?: string }).stderr)
          : String(err);
      return {
        ok: false,
        phase: "create-failed",
        error: `create_pr_safe.py failed: ${stderr || String(err)}`,
        hint:
          "Verify the branch has been pushed and the repo is accessible. Check gh auth status.",
      };
    }
  } finally {
    // Always clean up the temp file regardless of success or failure
    try {
      unlinkSync(tmpPath);
    } catch {
      // missing_ok — ignore if already gone
    }
  }

  return { ok: true, url: prUrl };
}
