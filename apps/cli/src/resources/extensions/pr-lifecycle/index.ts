/**
 * pr-lifecycle extension — registers the `kata_create_pr` tool.
 *
 * The tool runs a three-stage pre-flight (gh installed, gh authenticated,
 * gh authenticated), composes the PR body from Kata slice artifacts, and
 * creates the GitHub PR via `gh pr create` with body integrity verification.
 *
 * All failure paths return a structured `{ ok: false, phase, error, hint }`
 * object — the tool never throws.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isGhInstalled,
  isGhAuthenticated,
  getCurrentBranch,
  parseBranchToSlice,
} from "./gh-utils.js";
import { runCreatePr, type PrCreateOptions } from "./pr-runner.js";
import {
  fetchPRContext,
  scopeReviewers,
  buildReviewerTaskPrompt,
  runReviewers,
} from "./pr-review-utils.js";
import {
  parseCIChecks,
  getPRNumber,
  mergeGitHubPR,
  syncLocalAfterMerge,
  markSliceDoneInRoadmap,
} from "./pr-merge-utils.js";
import { resolveThread, replyToThread, fetchPrComments } from "./pr-address-utils.js";
import {
  shouldCrossLink,
  resolveSliceLinearIdentifier,
  advanceSliceIssueState,
} from "../kata/linear-crosslink.js";
import { loadEffectiveKataPreferences } from "../kata/preferences.js";
import { loadEffectiveLinearProjectConfig, isLinearMode } from "../kata/linear-config.js";

// ---------------------------------------------------------------------------
// Shell escaping
// ---------------------------------------------------------------------------

/** Shell-escape a single argument (single-quote wrapping with embedded-quote escaping). */
function shellEscape(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

// ---------------------------------------------------------------------------
// Tool result helpers — pi agent-core requires { content: [...], details? }
// ---------------------------------------------------------------------------

function toolOk(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

function toolFail(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
    isError: true,
  };
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
  pi.registerTool({
    name: "kata_create_pr",
    description: [
      "Create a GitHub PR for the current Kata slice branch.",
      "Composes the PR body from .kata/ slice artifacts (S01-PLAN.md, S01-SUMMARY.md, task plans).",
      "Pre-flight checks: gh CLI installed, gh authenticated.",
      "Uses `milestoneId`/`sliceId` from params when provided; auto-detects from branch name otherwise.",
      "Returns { ok: true, url } on success; { ok: false, phase, error, hint } on any failure.",
    ].join(" "),
    promptSnippet: "Create a GitHub PR for the current Kata slice branch.",
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
    async execute(_id: string, params: {
      title: string;
      base_branch?: string;
      milestoneId?: string;
      sliceId?: string;
      cwd?: string;
    }, _signal: unknown, _onUpdate: unknown, ctx: ExtensionContext) {
      // Build Linear cross-linking config when applicable
      let linearConfig: PrCreateOptions["linearConfig"];
      try {
        const effectivePrefs = loadEffectiveKataPreferences();
        const prPrefs = effectivePrefs?.preferences?.pr;
        const config = loadEffectiveLinearProjectConfig(effectivePrefs);
        const apiKey = process.env.LINEAR_API_KEY;

        if (
          shouldCrossLink(prPrefs, config.workflowMode) &&
          apiKey &&
          config.linear.projectId
        ) {
          linearConfig = {
            prPrefs: prPrefs!,
            workflowMode: config.workflowMode,
            projectId: config.linear.projectId,
            apiKey,
          };
        }
      } catch {
        // Best-effort — proceed without Linear config
      }

      const result = await runCreatePr({
        title: params.title,
        baseBranch: params.base_branch,
        milestoneId: params.milestoneId,
        sliceId: params.sliceId,
        cwd: params.cwd ?? ctx.cwd,
        linearConfig,
      });
      return result.ok ? toolOk(result) : toolFail(result);
    },
  });

  // ── kata_review_pr ─────────────────────────────────────────────────────────

  pi.registerTool({
    name: "kata_review_pr",
    description: [
      "Runs a parallel PR review for the open GitHub PR on the current branch.",
      "Pre-flights gh CLI, fetches the PR diff, selects reviewer subagents based on diff content,",
      "spawns them in parallel, and returns aggregated findings.",
      "Returns { ok: true, prNumber, selectedReviewers, findings } on success.",
      "Returns { ok: false, phase, error, hint } for: gh-missing, gh-unauth, not-in-pr, diff-empty.",
    ].join(" "),
    promptSnippet: "Runs a parallel PR review for the open GitHub PR on the current branch.",
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
    async execute(_id: string, params: { cwd?: string; reviewers?: string[] }, signal: AbortSignal | undefined, onUpdate: ((partial: any) => void) | undefined, ctx: ExtensionContext) {
      const cwd = params.cwd ?? ctx.cwd;

      if (!isGhInstalled()) {
        return toolFail({
          ok: false,
          phase: "gh-missing",
          error: "gh CLI not found in PATH",
          hint: "Install gh CLI: https://cli.github.com",
        });
      }
      if (!isGhAuthenticated()) {
        return toolFail({
          ok: false,
          phase: "gh-unauth",
          error: "gh CLI not authenticated",
          hint: "Run: gh auth login",
        });
      }

      const prCtx = fetchPRContext(cwd);
      if (!prCtx) {
        return toolFail({
          ok: false,
          phase: "not-in-pr",
          error: "No open PR found for current branch",
          hint: "Ensure the branch has been pushed and has an open PR on GitHub.",
        });
      }
      if (!prCtx.diff.trim()) {
        return toolFail({
          ok: false,
          phase: "diff-empty",
          error: "PR diff is empty — no changes to review",
          hint: "Ensure the PR branch has commits not in the base branch.",
        });
      }

      const selectedReviewers =
        params.reviewers ??
        scopeReviewers({ diff: prCtx.diff, changedFiles: prCtx.changedFiles });

      // Build tasks with system prompts for internal dispatch
      const tasks = selectedReviewers.map((reviewerName) => ({
        agent: reviewerName,
        systemPrompt:
          REVIEWER_INSTRUCTIONS[reviewerName] ??
          `You are a ${reviewerName} reviewer. Review the provided diff for issues.`,
        task: buildReviewerTaskPrompt({
          reviewer: reviewerName,
          prTitle: prCtx.title,
          prNumber: prCtx.prNumber,
          diff: prCtx.diff,
          changedFiles: prCtx.changedFiles,
          prBody: prCtx.body,
          reviewerInstructions:
            REVIEWER_INSTRUCTIONS[reviewerName] ??
            `Review the PR diff as ${reviewerName}.`,
        }),
      }));

      // Resolve review model from preferences (pr.review_model or models.review)
      let reviewModel: string | undefined;
      try {
        const prefs = loadEffectiveKataPreferences();
        reviewModel = prefs?.preferences?.models?.review;
      } catch { /* best-effort */ }

      // Dispatch reviewers internally — diff never enters parent context
      ctx.ui.setWorkingMessage(`PR Review: dispatching ${tasks.length} reviewers${reviewModel ? ` (model: ${reviewModel})` : ""}...`);
      let result: Awaited<ReturnType<typeof runReviewers>>;
      try {
        result = await runReviewers({
          tasks,
          cwd,
          model: reviewModel,
          signal: signal ?? undefined,
          onProgress: (completed, total, agent) => {
            ctx.ui.setWorkingMessage(`PR Review: ${completed}/${total} reviewers complete (latest: ${agent})`);
          },
          onActivity: (agent, activity) => {
            ctx.ui.setWorkingMessage(`PR Review: ${activity}`);
          },
        });
      } catch (err) {
        return toolFail({
          ok: false,
          phase: "review-failed",
          error: err instanceof Error ? err.message : String(err),
          hint: "Reviewer dispatch failed. Retry or inspect reviewer agent logs.",
        });
      } finally {
        ctx.ui.setWorkingMessage(); // always restore default
      }

      const diffLines = prCtx.diff.split("\n").length;
      const diffChars = prCtx.diff.length;
      const { MAX_DIFF_CHARS: maxChars } = await import("./pr-review-utils.js");

      return toolOk({
        ok: true,
        prNumber: prCtx.prNumber,
        title: prCtx.title,
        diffStats: {
          lines: diffLines,
          files: prCtx.changedFiles.length,
          chars: diffChars,
          truncatedInReviewerPrompts: diffChars > maxChars,
        },
        selectedReviewers,
        reviewerOutputs: result.reviewerOutputs,
        findings: result.findings,
      });
    },
  });

  // ── kata_fetch_pr_comments ─────────────────────────────────────────────────

  pi.registerTool({
    name: "kata_fetch_pr_comments",
    description: [
      "Fetches all PR comments for the open PR on the current branch.",
      "Returns structured JSON with:",
      "pull_request metadata, conversation_comments, reviews, and review_threads.",
      "Pre-flight checks: gh CLI installed, gh authenticated.",
      "Returns { ok: true, pull_request, conversation_comments, reviews, review_threads } on success.",
      "Returns { ok: false, phase, error, hint } on any failure.",
    ].join(" "),
    promptSnippet: "Fetches all PR comments for the open PR on the current branch.",
    parameters: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project root directory. Defaults to process.cwd().",
        },
      },
      required: [],
    },
    async execute(_id: string, params: { cwd?: string }, _signal: unknown, _onUpdate: unknown, ctx: ExtensionContext) {
      const cwd = params.cwd ?? ctx.cwd;

      if (!isGhInstalled()) {
        return toolFail({
          ok: false,
          phase: "gh-missing",
          error: "gh CLI not found in PATH",
          hint: "Install gh CLI: https://cli.github.com",
        });
      }

      if (!isGhAuthenticated()) {
        return toolFail({
          ok: false,
          phase: "gh-unauth",
          error: "gh CLI not authenticated",
          hint: "Run: gh auth login",
        });
      }

      const result = fetchPrComments(cwd);
      if ("ok" in result && result.ok === false) {
        return toolFail({
          ok: false,
          phase: "fetch-failed",
          error: result.error,
          hint: "Ensure the current branch has an open PR and gh is authenticated.",
        });
      }
      return toolOk({ ok: true, ...result });
    },
  });

  // ── kata_resolve_thread ────────────────────────────────────────────────────

  pi.registerTool({
    name: "kata_resolve_thread",
    description: [
      "Resolves an inline GitHub PR review thread via the `resolveReviewThread` GraphQL mutation.",
      "Pre-flights gh CLI and auth.",
      "Returns { ok: true, thread: { id, isResolved } } on success,",
      "or { ok: false, phase, error } on failure.",
      "Phase enum: gh-missing | gh-unauth | resolve-failed.",
      "Note: check isResolved before calling — GitHub returns an error if the thread is already resolved.",
    ].join(" "),
    promptSnippet: "Resolves an inline GitHub PR review thread via the `resolveReviewThread` GraphQL mutation.",
    parameters: {
      type: "object" as const,
      properties: {
        threadId: {
          type: "string",
          description: "The GitHub node ID of the review thread to resolve.",
        },
        cwd: {
          type: "string",
          description: "Project root directory. Defaults to process.cwd().",
        },
      },
      required: ["threadId"],
    },
    async execute(_id: string, params: { threadId: string; cwd?: string }, _signal: unknown, _onUpdate: unknown, ctx: ExtensionContext) {
      const { threadId } = params;
      const cwd = params.cwd ?? ctx.cwd;

      if (!isGhInstalled()) {
        return toolFail({
          ok: false,
          phase: "gh-missing",
          error: "gh CLI not found in PATH",
          hint: "Install gh CLI: https://cli.github.com",
        });
      }

      if (!isGhAuthenticated()) {
        return toolFail({
          ok: false,
          phase: "gh-unauth",
          error: "gh CLI not authenticated",
          hint: "Run: gh auth login",
        });
      }

      const result = resolveThread(threadId, cwd);
      return (result as any).ok ? toolOk(result) : toolFail(result);
    },
  });

  // ── kata_reply_to_thread ───────────────────────────────────────────────────

  pi.registerTool({
    name: "kata_reply_to_thread",
    description: [
      "Replies to an inline GitHub PR review thread via the",
      "`addPullRequestReviewThreadReply` GraphQL mutation.",
      "Writes reply body to a temp file to prevent shell interpolation of newlines and quotes.",
      "Pre-flights gh CLI and auth.",
      "Returns { ok: true, comment: { id, body } } on success,",
      "or { ok: false, phase, error } on failure.",
      "Phase enum: gh-missing | gh-unauth | reply-failed.",
    ].join(" "),
    promptSnippet: "Replies to an inline GitHub PR review thread via the",
    parameters: {
      type: "object" as const,
      properties: {
        threadId: {
          type: "string",
          description: "The GitHub node ID of the review thread to reply to.",
        },
        body: {
          type: "string",
          description: "The reply comment body text (markdown supported).",
        },
        cwd: {
          type: "string",
          description: "Project root directory. Defaults to process.cwd().",
        },
      },
      required: ["threadId", "body"],
    },
    async execute(_id: string, params: { threadId: string; body: string; cwd?: string }, _signal: unknown, _onUpdate: unknown, ctx: ExtensionContext) {
      const { threadId, body } = params;
      const cwd = params.cwd ?? ctx.cwd;

      if (!isGhInstalled()) {
        return toolFail({
          ok: false,
          phase: "gh-missing",
          error: "gh CLI not found in PATH",
          hint: "Install gh CLI: https://cli.github.com",
        });
      }

      if (!isGhAuthenticated()) {
        return toolFail({
          ok: false,
          phase: "gh-unauth",
          error: "gh CLI not authenticated",
          hint: "Run: gh auth login",
        });
      }

      const result = replyToThread(threadId, body, cwd);
      return (result as any).ok ? toolOk(result) : toolFail(result);
    },
  });

  // ── kata_merge_pr ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "kata_merge_pr",
    description: [
      "Merge the open GitHub PR for the current Kata slice branch.",
      "Validates CI checks, squash-merges the PR via `gh pr merge`,",
      "deletes the branch, syncs the local repo to the default branch,",
      "and marks the slice done in the milestone roadmap.md checkbox.",
      "Pre-flight checks: gh CLI installed, gh authenticated.",
      "Auto-detects PR number from the current branch when prNumber is omitted.",
      "Returns { ok: true, url, branch, milestoneId, sliceId } on success;",
      "{ ok: false, phase, error, hint } on any failure.",
      "Phase enum: gh-missing | gh-unauth | branch-parse-failed | pr-detect-failed |",
      "ci-failing | ci-pending | merge-failed.",
    ].join(" "),
    promptSnippet: "Merge the open GitHub PR for the current Kata slice branch.",
    parameters: {
      type: "object" as const,
      properties: {
        prNumber: {
          type: "number",
          description:
            "PR number to merge. Auto-detected from `gh pr view --json number` when omitted.",
        },
        strategy: {
          type: "string",
          enum: ["squash", "merge", "rebase"],
          description: 'Merge strategy (default: "squash").',
        },
        skipCICheck: {
          type: "boolean",
          description:
            "Skip CI status check (default: false). Use when repo has no CI or CI is flaky.",
        },
        cwd: {
          type: "string",
          description:
            "Project root directory (must contain .kata/). Defaults to process.cwd().",
        },
      },
      required: [],
    },
    async execute(_id: string, params: {
      prNumber?: number;
      strategy?: "squash" | "merge" | "rebase";
      skipCICheck?: boolean;
      cwd?: string;
    }, _signal: unknown, _onUpdate: unknown, ctx: ExtensionContext) {
      const cwd = params.cwd ?? ctx.cwd;
      const strategy = params.strategy ?? "squash";

      // ── (a) Pre-flight: gh installed + authenticated ────────────────────────

      if (!isGhInstalled()) {
        return toolFail({
          ok: false,
          phase: "gh-missing",
          error: "gh CLI not found in PATH",
          hint: "Install gh CLI: https://cli.github.com",
        });
      }

      if (!isGhAuthenticated()) {
        return toolFail({
          ok: false,
          phase: "gh-unauth",
          error: "gh CLI not authenticated",
          hint: "Run: gh auth login",
        });
      }

      // ── (b) Detect branch + milestone/slice IDs ────────────────────────────

      const branch = getCurrentBranch(cwd);
      if (!branch) {
        return toolFail({
          ok: false,
          phase: "branch-parse-failed",
          error: "Could not determine current git branch",
          hint: "Run from a git repository, or pass milestoneId and sliceId explicitly.",
        });
      }

      const parsed = parseBranchToSlice(branch);
      if (!parsed) {
        return toolFail({
          ok: false,
          phase: "branch-parse-failed",
          error:
            `Current branch '${branch}' does not match supported Kata slice branch formats: `
            + "kata/<scope>/<MilestoneId>/<SliceId> or legacy kata/<MilestoneId>/<SliceId>",
          hint:
            "Switch to a Kata slice branch (e.g. kata/apps-cli/M003/S04, or legacy kata/M003/S04 during transition) or pass milestoneId and sliceId explicitly.",
        });
      }

      const { milestoneId, sliceId } = parsed;

      // ── (c) Detect PR number ───────────────────────────────────────────────

      let prNumber: number;
      if (params.prNumber != null) {
        prNumber = params.prNumber;
      } else {
        const detected = getPRNumber(cwd);
        if (detected == null) {
          return toolFail({
            ok: false,
            phase: "pr-detect-failed",
            error: "Could not detect open PR for current branch",
            hint: "Ensure the branch has been pushed and has an open PR. You can also pass prNumber explicitly.",
          });
        }
        prNumber = detected;
      }

      // ── (d) CI check (unless skipCICheck) ─────────────────────────────────

      if (!params.skipCICheck) {
        let ciResult = { allPassing: true, failing: [] as string[], pending: [] as string[] };

        try {
          const ciOutput = execSync(
            `gh pr checks ${prNumber} --json name,status,conclusion`,
            {
              cwd,
              encoding: "utf8",
              stdio: ["pipe", "pipe", "pipe"],
            },
          );
          ciResult = parseCIChecks(ciOutput);
        } catch {
          // execSync throw → no CI configured or gh error → treat as allPassing (D047)
          ciResult = { allPassing: true, failing: [], pending: [] };
        }

        if (!ciResult.allPassing) {
          if (ciResult.failing.length > 0) {
            return toolFail({
              ok: false,
              phase: "ci-failing",
              error: "CI checks failing: " + ciResult.failing.join(", "),
              hint: "Fix failing checks or pass skipCICheck: true to override.",
            });
          }
          if (ciResult.pending.length > 0) {
            return toolFail({
              ok: false,
              phase: "ci-pending",
              error: "CI checks still running: " + ciResult.pending.join(", "),
              hint: "Wait for CI to complete or pass skipCICheck: true to override.",
            });
          }
        }
      }

      // ── (e) Merge ──────────────────────────────────────────────────────────

      const mergeResult = await mergeGitHubPR(prNumber, strategy, cwd);
      if (!mergeResult.ok) {
        return toolFail({
          ok: false,
          phase: mergeResult.phase,
          error: mergeResult.error,
          hint: "Check gh auth status and ensure PR is open and mergeable.",
        });
      }

      // ── (f) Sync local state (best-effort, never blocks return) ────────────

      try {
        syncLocalAfterMerge(branch, cwd);
      } catch {
        // syncLocalAfterMerge should never throw, but guard anyway
      }

      // ── (g) Update roadmap ─────────────────────────────────────────────────

      const roadmapUpdated = markSliceDoneInRoadmap(milestoneId, sliceId, cwd);

      // ── (h) Linear cross-linking: advance slice issue to done (best-effort) ──

      let linearStateAdvance: "done" | "failed" | "skipped" = "skipped";

      try {
        const effectivePrefs = loadEffectiveKataPreferences();
        const prPrefs = effectivePrefs?.preferences?.pr;
        const config = loadEffectiveLinearProjectConfig(effectivePrefs);

        if (
          shouldCrossLink(prPrefs, config.workflowMode) &&
          process.env.LINEAR_API_KEY
        ) {
          const { LinearClient } = await import("../linear/linear-client.js");
          const client = new LinearClient(process.env.LINEAR_API_KEY);
          const teamId = config.linear.teamId;
          const projectId = config.linear.projectId;

          if (teamId && projectId) {
            const resolved = await resolveSliceLinearIdentifier(
              client,
              projectId,
              sliceId,
            );
            if (resolved) {
              const advResult = await advanceSliceIssueState(
                client,
                resolved.issueId,
                teamId,
              );
              linearStateAdvance = advResult.ok ? "done" : "failed";
            }
          }
        }
      } catch {
        linearStateAdvance = "failed";
      }

      // ── (i) Return ─────────────────────────────────────────────────────────

      const finalResult: {
        ok: true;
        url: string;
        branch: string;
        milestoneId: string;
        sliceId: string;
        roadmapUpdateFailed?: boolean;
        linearStateAdvance?: "done" | "failed" | "skipped";
      } = {
        ok: true,
        url: mergeResult.url,
        branch,
        milestoneId,
        sliceId,
        linearStateAdvance,
      };

      if (!roadmapUpdated) {
        finalResult.roadmapUpdateFailed = true;
      }

      return toolOk(finalResult);
    },
  });
}
