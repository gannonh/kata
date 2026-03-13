/**
 * pr-lifecycle extension — registers the `kata_create_pr` tool.
 *
 * The tool runs a three-stage pre-flight (gh installed, gh authenticated,
 * python3 available), composes the PR body from Kata slice artifacts, writes
 * it to a temp file, and delegates to the bundled `create_pr_safe.py` script
 * to create the GitHub PR safely.
 *
 * All failure paths return a structured `{ ok: false, phase, error, hint }`
 * object — the tool never throws.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
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
import {
  fetchPRContext,
  scopeReviewers,
  buildReviewerTaskPrompt,
} from "./pr-review-utils.js";

/** Shell-escape a single argument (single-quote wrapping with embedded-quote escaping). */
function shellEscape(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

// ---------------------------------------------------------------------------
// Reviewer instructions — loaded from bundled agent .md files at module init
// ---------------------------------------------------------------------------

const agentsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "agents",
);

function loadReviewerInstructions(agentName: string): string {
  try {
    const raw = readFileSync(join(agentsDir, `${agentName}.md`), "utf8");
    // Strip YAML frontmatter (everything between the first two --- delimiters)
    const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    return match ? match[1].trim() : raw.trim();
  } catch {
    return `You are a ${agentName} reviewer. Review the provided diff for issues.`;
  }
}

const REVIEWER_INSTRUCTIONS: Record<string, string> = {
  "pr-code-reviewer": loadReviewerInstructions("pr-code-reviewer"),
  "pr-failure-finder": loadReviewerInstructions("pr-failure-finder"),
  "pr-test-analyzer": loadReviewerInstructions("pr-test-analyzer"),
  "pr-code-simplifier": loadReviewerInstructions("pr-code-simplifier"),
  "pr-type-design-analyzer": loadReviewerInstructions("pr-type-design-analyzer"),
  "pr-comment-analyzer": loadReviewerInstructions("pr-comment-analyzer"),
};

export default function (pi: ExtensionAPI): void {
  pi.addTool({
    name: "kata_create_pr",
    description: [
      "Create a GitHub PR for the current Kata slice branch.",
      "Composes the PR body from .kata/ slice artifacts (S01-PLAN.md, S01-SUMMARY.md, task plans).",
      "Pre-flight checks: gh CLI installed, gh authenticated, python3 available.",
      "Uses `milestoneId`/`sliceId` from params when provided; auto-detects from branch name otherwise.",
      "Returns { ok: true, url } on success; { ok: false, phase, error, hint } on any failure.",
    ].join(" "),
    parameters: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "PR title. Required.",
        },
        base_branch: {
          type: "string",
          description: "Target base branch (default: main).",
        },
        milestoneId: {
          type: "string",
          description:
            "Kata milestone ID, e.g. 'M003'. Auto-detected from branch when omitted.",
        },
        sliceId: {
          type: "string",
          description:
            "Kata slice ID, e.g. 'S01'. Auto-detected from branch when omitted.",
        },
        cwd: {
          type: "string",
          description:
            "Project root directory (must contain .kata/). Defaults to process.cwd().",
        },
      },
      required: ["title"],
    },
    handler: async (params: {
      title: string;
      base_branch?: string;
      milestoneId?: string;
      sliceId?: string;
      cwd?: string;
    }) => {
      const { title, base_branch = "main" } = params;
      const cwd = params.cwd ?? process.cwd();

      // ── Pre-flight checks ──────────────────────────────────────────────────

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

      // ── Resolve milestone / slice IDs ──────────────────────────────────────

      let milestoneId = params.milestoneId;
      let sliceId = params.sliceId;

      if (!milestoneId || !sliceId) {
        const branch = getCurrentBranch(cwd);
        if (!branch) {
          return {
            ok: false,
            phase: "branch-parse-failed",
            error: "Could not determine current git branch",
            hint:
              "Run from a git repository, or pass milestoneId and sliceId explicitly.",
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

      // ── Compose PR body ────────────────────────────────────────────────────

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

      // ── Write body to temp file ────────────────────────────────────────────

      const tmpPath = join(tmpdir(), randomUUID() + ".md");
      let prUrl: string;

      try {
        writeFileSync(tmpPath, body, "utf8");

        // ── Resolve script path ──────────────────────────────────────────────

        const scriptPath = join(
          dirname(fileURLToPath(import.meta.url)),
          "scripts",
          "create_pr_safe.py",
        );

        // ── Run create_pr_safe.py ────────────────────────────────────────────

        const cmd = [
          "python3",
          shellEscape(scriptPath),
          "--title",
          shellEscape(title),
          "--base",
          shellEscape(base_branch),
          "--body-file",
          shellEscape(tmpPath),
        ].join(" ");

        try {
          const stdout = execSync(cmd, {
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
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
    },
  });

  // ── kata_review_pr ─────────────────────────────────────────────────────────

  pi.addTool({
    name: "kata_review_pr",
    description: [
      "Prepares a parallel PR review dispatch plan.",
      "Pre-flights gh CLI, fetches the open PR diff for the current branch,",
      "scopes which of the 6 bundled reviewer subagents to run based on diff content,",
      "and builds a per-reviewer task prompt.",
      "Returns { ok: true, prNumber, selectedReviewers, reviewerTasks } on success —",
      "pass reviewerTasks to the `subagent` tool in parallel mode to dispatch reviewers.",
      "Returns { ok: false, phase, error, hint } for: gh-missing, gh-unauth, not-in-pr, diff-empty.",
    ].join(" "),
    parameters: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project root directory. Defaults to process.cwd().",
        },
        reviewers: {
          type: "array",
          items: { type: "string" },
          description:
            "Override reviewer list. When omitted, scopeReviewers auto-selects based on diff content.",
        },
      },
      required: [],
    },
    handler: async (params: { cwd?: string; reviewers?: string[] }) => {
      const cwd = params.cwd ?? process.cwd();

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

      const ctx = fetchPRContext(cwd);
      if (!ctx) {
        return {
          ok: false,
          phase: "not-in-pr",
          error: "No open PR found for current branch",
          hint: "Ensure the branch has been pushed and has an open PR on GitHub.",
        };
      }
      if (!ctx.diff.trim()) {
        return {
          ok: false,
          phase: "diff-empty",
          error: "PR diff is empty — no changes to review",
          hint: "Ensure the PR branch has commits not in the base branch.",
        };
      }

      const selectedReviewers =
        params.reviewers ??
        scopeReviewers({ diff: ctx.diff, changedFiles: ctx.changedFiles });

      const reviewerTasks = selectedReviewers.map((reviewerName) => ({
        agent: reviewerName,
        task: buildReviewerTaskPrompt({
          reviewer: reviewerName,
          prTitle: ctx.title,
          prNumber: ctx.prNumber,
          diff: ctx.diff,
          changedFiles: ctx.changedFiles,
          prBody: ctx.body,
          reviewerInstructions:
            REVIEWER_INSTRUCTIONS[reviewerName] ??
            `Review the PR diff as ${reviewerName}.`,
        }),
      }));

      return {
        ok: true,
        prNumber: ctx.prNumber,
        title: ctx.title,
        diff: ctx.diff,
        selectedReviewers,
        reviewerTasks,
      };
    },
  });
}
