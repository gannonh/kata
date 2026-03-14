/**
 * pr-command.ts — Pure helpers for the `/kata pr` command surface.
 *
 * All functions are deterministic and side-effect-free — no gh CLI calls,
 * no filesystem reads, no LLM involvement. Suitable for `/kata pr status`,
 * argument completions, and onboarding guidance.
 */

// ─── Subcommand completions ───────────────────────────────────────────────────

export interface PrSubcommandCompletion {
  value: string;
  label: string;
}

/** All PR subcommands in display order. */
const PR_SUBCOMMANDS: PrSubcommandCompletion[] = [
  { value: "status", label: "status — show PR readiness and config" },
  { value: "create", label: "create — create a GitHub PR for the current slice" },
  { value: "review", label: "review — run a parallel PR review" },
  { value: "address", label: "address — address review comments" },
  { value: "merge", label: "merge — merge the open PR and sync local state" },
];

/**
 * Returns `/kata pr` subcommand completions matching the given prefix.
 * Deterministic — same input always produces the same output.
 */
export function getPrSubcommandCompletions(prefix: string): PrSubcommandCompletion[] {
  const lower = prefix.toLowerCase();
  return PR_SUBCOMMANDS.filter((c) => c.value.startsWith(lower));
}

// ─── PR status report ─────────────────────────────────────────────────────────

/**
 * Dependency injection surface for buildPrStatusReport.
 * All accessors are injected so the report is fully testable without
 * filesystem access or gh CLI calls.
 */
export interface PrStatusDependencies {
  /** Returns the current git branch name, or null if not in a git repo. */
  getCurrentBranch: () => string | null;
  /** Returns the open PR number for the current branch, or null if none. */
  getOpenPrNumber: () => Promise<number | null>;
  /** Returns whether pr.enabled is true in effective project preferences. */
  getPrEnabled: () => boolean;
  /** Returns whether pr.auto_create is true in effective project preferences. */
  getPrAutoCreate: () => boolean;
  /** Returns the configured pr.base_branch (default: 'main'). */
  getPrBaseBranch: () => string;
  /** Returns the linear_link preference and workflow mode for status display. */
  getLinearLinkStatus?: () => { linearLink: boolean; workflowMode: string };
}

export interface PrStatusReport {
  level: "info" | "warning";
  message: string;
}

/**
 * Builds a deterministic PR status report from injected dependencies.
 * Never invokes the LLM or external services. Suitable for `/kata pr status`.
 */
export async function buildPrStatusReport(
  deps: PrStatusDependencies,
): Promise<PrStatusReport> {
  const branch = deps.getCurrentBranch();
  const prEnabled = deps.getPrEnabled();

  if (!prEnabled) {
    return {
      level: "warning",
      message: [
        `PR lifecycle: pr.enabled is false (disabled)`,
        `branch: ${branch ?? "(unknown)"}`,
        `Set pr.enabled: true in .kata/preferences.md to activate the PR workflow.`,
      ].join("\n"),
    };
  }

  const autoCreate = deps.getPrAutoCreate();
  const baseBranch = deps.getPrBaseBranch();
  const prNumber = await deps.getOpenPrNumber();

  const lines: string[] = [
    `PR lifecycle: enabled`,
    `branch: ${branch ?? "(unknown)"}`,
    `base_branch: ${baseBranch}`,
    `auto_create: ${autoCreate}`,
  ];

  if (prNumber != null) {
    lines.push(`open PR: #${prNumber} — ${branch ?? "(unknown)"}`);
  } else {
    lines.push("no open PR — not created yet");
  }

  // Linear cross-linking status
  if (deps.getLinearLinkStatus) {
    const { linearLink, workflowMode } = deps.getLinearLinkStatus();
    if (linearLink && workflowMode === "linear") {
      lines.push("linear_link: active");
    } else if (linearLink && workflowMode !== "linear") {
      lines.push("linear_link: requires linear mode");
    } else {
      lines.push("linear_link: disabled");
    }
  }

  return {
    level: "info",
    message: lines.join("\n"),
  };
}

// ─── Onboarding recommendation ────────────────────────────────────────────────

/**
 * Returns a human-readable onboarding recommendation for the `/kata` wizard
 * when PR lifecycle is not yet configured or the project lacks a GitHub remote.
 *
 * Returns an empty string when PR is already enabled and a remote is detected —
 * no setup guidance needed.
 */
export function getPrOnboardingRecommendation(
  prEnabled: boolean,
  hasGithubRemote: boolean,
): string {
  if (prEnabled && hasGithubRemote) {
    return "";
  }

  if (!hasGithubRemote) {
    return (
      "No GitHub remote detected. To enable the PR lifecycle, push your repository to GitHub " +
      "and add a GitHub remote (`git remote add origin <url>`)."
    );
  }

  // Has a GitHub remote but PR lifecycle is disabled
  return (
    "PR lifecycle is disabled. Set `pr.enabled: true` in .kata/preferences.md " +
    "(run `/kata prefs project`) to enable the PR workflow for this project."
  );
}
