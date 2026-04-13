/**
 * pr-runner.ts — Shared PR creation orchestration.
 *
 * Extracted from the `kata_create_pr` tool handler so both the tool and
 * auto-mode can invoke the same deterministic PR creation implementation.
 *
 * All failure paths return a structured `{ ok: false, phase, error, hint }`
 * object — the runner never throws.
 *
 * Orchestration side effects (command execution, temp files, pre-flight checks)
 * are delegated to an injectable `PrRunnerRuntime`. Production callers use
 * the default runtime automatically; tests inject a mock runtime for
 * deterministic assertion coverage.
 */

import { composePRBody } from "./pr-body-composer.js";
import {
  shouldCrossLink,
  resolveSliceLinearIdentifier,
  postPrLinkComment,
} from "../kata/linear-crosslink.js";
import { defaultRuntime, type PrRunnerRuntime } from "./pr-runner-runtime.js";

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
  /** Injectable runtime for testing. Uses defaultRuntime when omitted. */
  _runtime?: PrRunnerRuntime;
}

// ─── Shell escaping ───────────────────────────────────────────────────────────

/** Shell-escape a single argument (single-quote wrapping with embedded-quote escaping). */
function shellEscape(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

type PrLinearDocument = { title: string; content: string; updatedAt?: string };
type PrLinearIssueRecord = { description?: string | null };
type PrLinearClient = {
  graphql: (query: string, variables?: Record<string, unknown>) => Promise<unknown>;
  listDocuments: (opts?: {
    projectId?: string;
    issueId?: string;
    title?: string;
    first?: number;
  }) => Promise<PrLinearDocument[]>;
};

function pickNewestDocument(docs: PrLinearDocument[]): PrLinearDocument | null {
  if (docs.length === 0) return null;
  return [...docs].sort((a, b) => {
    const aTs = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bTs = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bTs - aTs;
  })[0] ?? null;
}

async function loadLinearPrDocuments(
  client: PrLinearClient,
  projectId: string,
  sliceId: string,
  issueId: string | undefined,
  seed?: Record<string, string>,
): Promise<Record<string, string> | undefined> {
  const out: Record<string, string> = { ...(seed ?? {}) };

  try {
    if (issueId && !out.PLAN) {
      const result = await client.graphql(
        `query PrSliceIssueDescription($id: String!) {
          issue(id: $id) {
            description
          }
        }`,
        { id: issueId },
      ) as { issue?: PrLinearIssueRecord | null };
      const description = result?.issue?.description?.trim();
      if (description) out.PLAN = description;
    }

    if (issueId && !out.SUMMARY) {
      const docs = await client.listDocuments({ issueId, first: 100 });
      const summaryDoc = pickNewestDocument(docs.filter((d) => d.title === `${sliceId}-SUMMARY`));
      if (summaryDoc?.content) out.SUMMARY = summaryDoc.content;
    }

    if (!out.SUMMARY) {
      const docs = await client.listDocuments({
        projectId,
        title: `${sliceId}-SUMMARY`,
        first: 20,
      });
      const summaryDoc = pickNewestDocument(docs);
      if (summaryDoc?.content) out.SUMMARY = summaryDoc.content;
    }
  } catch {
    // Best-effort loader — caller will report missing required slice description if needed.
  }

  return Object.keys(out).length > 0 ? out : undefined;
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
  const rt = options._runtime ?? defaultRuntime;

  if (typeof title !== "string" || title.trim().length === 0) {
    return {
      ok: false,
      phase: "title-missing",
      error: "PR title is required",
      hint: "Pass a non-empty title when calling runCreatePr().",
    };
  }

  // ── Pre-flight checks ────────────────────────────────────────────────────────

  if (!rt.isGhInstalled()) {
    return {
      ok: false,
      phase: "gh-missing",
      error: "gh CLI not found in PATH",
      hint: "Install gh CLI: https://cli.github.com",
    };
  }

  if (!rt.isGhAuthenticated()) {
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
    const branch = rt.getCurrentBranch(cwd);
    if (!branch) {
      return {
        ok: false,
        phase: "branch-parse-failed",
        error: "Could not determine current git branch",
        hint: "Run from a git repository, or pass milestoneId and sliceId explicitly.",
      };
    }
    const parsed = rt.parseBranchToSlice(branch);
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

  // ── Resolve Linear metadata and artifacts (best-effort) ─────────────────────

  let linearReferences: string[] | undefined;
  let linearIssueId: string | undefined;
  let linearClient: PrLinearClient | undefined;
  let linearDocuments = options.linearDocuments;

  const lc = options.linearConfig;
  const crossLinkActive = lc ? shouldCrossLink(lc.prPrefs, lc.workflowMode) : false;

  if (lc) {
    try {
      // Dynamically import LinearClient to avoid hard dependency when not in Linear mode
      const { LinearClient } = await import("../linear/linear-client.js");
      linearClient = new LinearClient(lc.apiKey) as PrLinearClient;

      const resolved = await resolveSliceLinearIdentifier(
        linearClient,
        lc.projectId,
        sliceId!,
        lc.sliceLabelId,
      );
      if (resolved) {
        linearIssueId = resolved.issueId;
        if (crossLinkActive) {
          linearReferences = [resolved.identifier];
        }
      }

      if (!linearDocuments?.PLAN || !linearDocuments?.SUMMARY) {
        linearDocuments = await loadLinearPrDocuments(
          linearClient,
          lc.projectId,
          sliceId!,
          linearIssueId,
          linearDocuments,
        );
      }
    } catch {
      // Best-effort — proceed without Linear references/documents
    }
  }

  // Ensure we have the required slice plan from the slice issue description.
  if (!linearDocuments?.PLAN) {
    return {
      ok: false,
      phase: "artifact-error",
      error: `Missing required slice issue description for ${sliceId}`,
      hint: `Populate the ${sliceId} slice issue description before creating a PR.`,
    };
  }

  // ── Compose PR body ──────────────────────────────────────────────────────────

  let body: string;
  try {
    body = await composePRBody(milestoneId, sliceId, cwd, {
      linearReferences,
      linearDocuments,
    });
  } catch (err) {
    return {
      ok: false,
      phase: "artifact-error",
      error: `Failed to compose PR body: ${err instanceof Error ? err.message : String(err)}`,
      hint: `Ensure the ${sliceId} slice issue description exists and optional summary artifacts are available.`,
    };
  }

  // ── Create PR via gh CLI with body-file ──────────────────────────────────────

  const tmpPath = rt.tempFilePath(".md");
  let prUrl: string;

  try {
    rt.writeFile(tmpPath, body);

    const ghEnv = { ...process.env, GH_PAGER: "" };

    // Resolve branch and ensure it's pushed to the remote
    const head = rt.getCurrentBranch(cwd) ?? "";

    if (head) {
      // Check if branch exists on remote; push if not
      try {
        const remoteRef = rt.exec(
          `git ls-remote --heads origin ${head}`,
          { cwd },
        ).trim();
        if (!remoteRef) {
          // Branch not on remote — push with upstream tracking
          try {
            rt.exec(
              `git push -u origin ${head}`,
              { cwd },
            );
          } catch (pushErr) {
            const pe = pushErr as { stderr?: string; message?: string };
            return {
              ok: false,
              phase: "push-failed",
              error: `Branch '${head}' is not on the remote and push failed: ${pe.stderr ?? pe.message ?? String(pushErr)}`,
              hint: "Check git remote configuration and network connectivity. Run: git remote -v",
            };
          }
        }
      } catch {
        // ls-remote failed (no remote configured, network error, etc.)
        // Proceed anyway — gh pr create will surface the real error
      }
    }

    // Prefix title with branch name for monorepo identification
    // e.g. "[kata/apps-context/M002/S02] Slice title here"
    const normalizedTitle = head && !title.includes(head)
      ? `[${head}] ${title}`
      : title;

    try {
      rt.exec(
        [
          "gh", "pr", "create",
          "--title", shellEscape(normalizedTitle),
          "--base", shellEscape(baseBranch),
          "--head", shellEscape(head),
          "--body-file", shellEscape(tmpPath),
        ].join(" "),
        { cwd, env: ghEnv },
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
      const actualBody = rt.exec(
        "gh pr view --json body --jq .body",
        { cwd, env: ghEnv },
      );

      if (normalize(actualBody) !== expected) {
        // Auto-repair via gh pr edit
        const prNumber = rt.exec(
          "gh pr view --json number --jq .number",
          { cwd, env: ghEnv },
        ).trim();
        rt.exec(
          ["gh", "pr", "edit", prNumber, "--body-file", shellEscape(tmpPath)].join(" "),
          { cwd, env: ghEnv },
        );
      }
    } catch {
      // Body verification is best-effort — PR was already created
    }

    // Get the PR URL
    try {
      prUrl = rt.exec(
        "gh pr view --json url --jq .url",
        { cwd, env: ghEnv },
      ).trim();
    } catch {
      prUrl = "(PR created but could not retrieve URL)";
    }
  } finally {
    rt.removeFile(tmpPath);
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
