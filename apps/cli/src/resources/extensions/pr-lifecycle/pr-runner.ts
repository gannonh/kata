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
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  isGhInstalled,
  isGhAuthenticated,
  getCurrentBranch,
  parseBranchToSlice,
} from "./gh-utils.js";
import { composePRBody } from "./pr-body-composer.js";
import {
  shouldCrossLink,
  resolveSliceLinearIdentifier,
  postPrLinkComment,
} from "../kata/linear-crosslink.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PrCreateResult =
  | { ok: true; url: string; linearComment?: "added" | "failed" | "skipped" }
  | { ok: false; phase: string; error: string; hint: string };

export interface PrCreateOptions {
  title: string;
  baseBranch?: string;
  milestoneId?: string;
  sliceId?: string;
  cwd?: string;
  /** Linear cross-linking configuration. When provided and shouldCrossLink is true,
   *  PR body includes Linear references and a comment is posted to the Linear issue. */
  linearConfig?: {
    prPrefs: { linear_link?: boolean };
    workflowMode: string;
    projectId: string;
    sliceLabelId?: string;
    apiKey: string;
  };
  /** Pre-fetched Linear document content for PR body (bypasses disk reads). */
  linearDocuments?: Record<string, string>;
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
 * Performs pre-flight checks (gh installed, gh authenticated),
 * resolves milestone/slice IDs from the current branch when not provided,
 * composes the PR body from Kata slice artifacts, creates the PR via `gh pr create`,
 * and verifies/repairs body integrity.
 *
 * Returns `{ ok: true, url }` on success; `{ ok: false, phase, error, hint }` on
 * any failure. Never throws.
 */
export async function runCreatePr(options: PrCreateOptions): Promise<PrCreateResult> {
  const { title, baseBranch = "main" } = options;
  const cwd = options.cwd ?? process.cwd();

  if (typeof title !== "string" || title.trim().length === 0) {
    return {
      ok: false,
      phase: "title-missing",
      error: "PR title is required",
      hint: "Pass a non-empty title when calling runCreatePr().",
    };
  }

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
        error:
          `Current branch '${branch}' does not match supported Kata slice branch formats: `
          + "kata/<scope>/<MilestoneId>/<SliceId> or legacy kata/<MilestoneId>/<SliceId>",
        hint:
          "Switch to a Kata slice branch (e.g. kata/apps-cli/M003/S01, or legacy kata/M003/S01 during transition) or pass milestoneId and sliceId explicitly.",
      };
    }
    milestoneId = parsed.milestoneId;
    sliceId = parsed.sliceId;
  }

  // ── Resolve Linear cross-linking (best-effort) ───────────────────────────────

  let linearReferences: string[] | undefined;
  let linearIssueId: string | undefined;
  let linearClient: { graphql: (query: string, variables?: Record<string, unknown>) => Promise<unknown> } | undefined;
  const lc = options.linearConfig;
  const crossLinkActive = lc && shouldCrossLink(lc.prPrefs, lc.workflowMode);

  if (crossLinkActive && lc) {
    try {
      // Dynamically import LinearClient to avoid hard dependency when not in Linear mode
      const { LinearClient } = await import("../linear/linear-client.js");
      linearClient = new LinearClient(lc.apiKey);
      const resolved = await resolveSliceLinearIdentifier(
        linearClient,
        lc.projectId,
        sliceId!,
        lc.sliceLabelId,
      );
      if (resolved) {
        linearReferences = [resolved.identifier];
        linearIssueId = resolved.issueId;
      }
    } catch {
      // Best-effort — proceed without Linear references
    }
  }

  // ── Compose PR body ──────────────────────────────────────────────────────────

  let body: string;
  try {
    body = await composePRBody(milestoneId, sliceId, cwd, {
      linearReferences,
      linearDocuments: options.linearDocuments,
    });
  } catch (err) {
    return {
      ok: false,
      phase: "artifact-error",
      error: `Failed to compose PR body: ${err instanceof Error ? err.message : String(err)}`,
      hint: `Ensure .kata/milestones/${milestoneId}/slices/${sliceId}/ exists and contains a slice plan.`,
    };
  }

  // ── Create PR via gh CLI with body-file ──────────────────────────────────────

  const tmpPath = join(tmpdir(), randomUUID() + ".md");
  let prUrl: string;

  try {
    writeFileSync(tmpPath, body, "utf8");

    const PIPE = { stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"] };
    const ghEnv = { ...process.env, GH_PAGER: "" };

    // Create the PR
    const head = getCurrentBranch(cwd) ?? "";

    // Prefix title with branch name for monorepo identification
    // e.g. "[kata/apps-context/M002/S02] Slice title here"
    const normalizedTitle = head && !title.includes(head)
      ? `[${head}] ${title}`
      : title;

    try {
      execSync(
        [
          "gh", "pr", "create",
          "--title", shellEscape(normalizedTitle),
          "--base", shellEscape(baseBranch),
          "--head", shellEscape(head),
          "--body-file", shellEscape(tmpPath),
        ].join(" "),
        { encoding: "utf8", cwd, env: ghEnv, ...PIPE },
      );
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      return {
        ok: false,
        phase: "create-failed",
        error: e.stderr ?? e.message ?? String(err),
        hint: "Verify the branch has been pushed and the repo is accessible. Check gh auth status.",
      };
    }

    // Verify body integrity — gh can mangle markdown in rare cases
    const normalize = (s: string) => s.replace(/\r\n/g, "\n").trimEnd() + "\n";
    const expected = normalize(body);

    try {
      const actualBody = execSync(
        "gh pr view --json body --jq .body",
        { encoding: "utf8", cwd, env: ghEnv, ...PIPE },
      );

      if (normalize(actualBody) !== expected) {
        // Auto-repair via gh pr edit
        const prNumber = execSync(
          "gh pr view --json number --jq .number",
          { encoding: "utf8", cwd, env: ghEnv, ...PIPE },
        ).trim();
        execSync(
          ["gh", "pr", "edit", prNumber, "--body-file", shellEscape(tmpPath)].join(" "),
          { encoding: "utf8", cwd, env: ghEnv, ...PIPE },
        );
      }
    } catch {
      // Body verification is best-effort — PR was already created
    }

    // Get the PR URL
    try {
      prUrl = execSync(
        "gh pr view --json url --jq .url",
        { encoding: "utf8", cwd, env: ghEnv, ...PIPE },
      ).trim();
    } catch {
      prUrl = "(PR created but could not retrieve URL)";
    }
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }

  // ── Post Linear comment (best-effort) ────────────────────────────────────────

  let linearComment: "added" | "failed" | "skipped" = "skipped";

  if (crossLinkActive && linearIssueId && lc && linearClient) {
    try {
      const result = await postPrLinkComment(linearClient, linearIssueId, prUrl);
      linearComment = result.ok ? "added" : "failed";
    } catch {
      linearComment = "failed";
    }
  }

  return { ok: true, url: prUrl, linearComment };
}
