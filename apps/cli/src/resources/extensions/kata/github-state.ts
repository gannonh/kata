import type { GithubStateMode } from "./github-config.js";
import type { ActiveRef, KataState, MilestoneRegistryEntry, Phase } from "./types.js";
import { getActiveSliceBranch, parseSliceBranchName } from "./worktree.js";
import {
  maybeParseGithubArtifactMetadata,
  parseGithubKataTitle,
  type GithubArtifactMetadataV1,
} from "./github-artifacts.js";

export interface GithubIssueSummary {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  body?: string | null;
}

export interface GithubStateClient {
  listIssues(): Promise<GithubIssueSummary[]>;
}

export interface DeriveGithubStateConfig {
  repoOwner: string;
  repoName: string;
  stateMode: GithubStateMode;
  labelPrefix?: string;
  basePath?: string;
}

interface ParsedKataTitle {
  id: string;
  title: string;
}

interface ParsedIssue {
  issue: GithubIssueSummary;
  parsed: ParsedKataTitle;
  metadata: GithubArtifactMetadataV1 | null;
}

const MILESTONE_RE = /^M\d{3}$/;
const SLICE_RE = /^S\d{2}$/;
const TASK_RE = /^T\d{2}$/;

function parseKataTitle(title: string): ParsedKataTitle | null {
  const parsed = parseGithubKataTitle(title);
  if (!parsed) return null;
  return {
    id: parsed.kataId,
    title: parsed.title,
  };
}

function parseOrdinal(id: string): number {
  const digits = id.slice(1);
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function compareKataIds(a: string, b: string): number {
  const aPrefix = a[0] ?? "";
  const bPrefix = b[0] ?? "";
  if (aPrefix !== bPrefix) return aPrefix.localeCompare(bPrefix);
  return parseOrdinal(a) - parseOrdinal(b);
}

function toActiveRef(issue: GithubIssueSummary, parsed: ParsedKataTitle): ActiveRef {
  return {
    id: parsed.id,
    title: parsed.title,
    trackerIssueId: String(issue.number),
  };
}

function labelSet(issue: GithubIssueSummary): Set<string> {
  return new Set(issue.labels.map((label) => label.trim().toLowerCase()));
}

function resolvePhaseFromSliceLabels(
  issue: GithubIssueSummary,
  labelPrefix: string,
): Phase | null {
  const prefix = labelPrefix.trim().toLowerCase();
  const labels = labelSet(issue);

  const mapping: Array<{ suffix: string; phase: Phase }> = [
    { suffix: "planning", phase: "planning" },
    { suffix: "executing", phase: "executing" },
    { suffix: "verifying", phase: "verifying" },
    { suffix: "summarizing", phase: "summarizing" },
    { suffix: "blocked", phase: "blocked" },
  ];

  for (const entry of mapping) {
    if (labels.has(`${prefix}${entry.suffix}`)) {
      return entry.phase;
    }
  }

  return null;
}

function computePhaseFallback(
  activeSlice: GithubIssueSummary | null,
  openTasks: GithubIssueSummary[],
  closedTasks: GithubIssueSummary[],
): Phase {
  if (!activeSlice) return "pre-planning";

  if (openTasks.length === 0 && closedTasks.length === 0) {
    return "planning";
  }

  if (openTasks.length === 0 && closedTasks.length > 0) {
    return "summarizing";
  }

  if (closedTasks.length === 0) {
    return "executing";
  }

  return "verifying";
}

function nextActionForPhase(phase: Phase): string {
  switch (phase) {
    case "pre-planning":
      return "Create the next milestone roadmap.";
    case "planning":
      return "Plan the active slice tasks.";
    case "executing":
      return "Execute the next open task.";
    case "verifying":
      return "Verify and finish remaining open tasks.";
    case "summarizing":
      return "Write the active slice summary.";
    case "completing-milestone":
      return "Write the milestone completion summary.";
    case "complete":
      return "Start the next milestone.";
    default:
      return "";
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function taskBelongsToSlice(
  issue: GithubIssueSummary,
  sliceId: string,
  metadata: GithubArtifactMetadataV1 | null,
): boolean {
  const normalizedSliceId = sliceId.trim().toLowerCase();
  if (!normalizedSliceId) return false;

  const metadataSlice = metadata?.sliceId?.trim().toLowerCase();
  if (metadataSlice && metadataSlice === normalizedSliceId) {
    return true;
  }

  const labels = labelSet(issue);
  if (
    labels.has(`kata:slice:${normalizedSliceId}`) ||
    labels.has(`slice:${normalizedSliceId}`) ||
    labels.has(`kata:parent:${normalizedSliceId}`)
  ) {
    return true;
  }

  const contextText = `${issue.title}\n${issue.body ?? ""}`;
  const sliceIdMatcher = new RegExp(`\\b${escapeRegex(sliceId)}\\b`, "i");
  return sliceIdMatcher.test(contextText);
}

export async function deriveGithubState(
  client: GithubStateClient,
  config: DeriveGithubStateConfig,
): Promise<KataState> {
  const labelPrefix = config.labelPrefix ?? "kata:";
  const basePath = config.basePath ?? process.cwd();
  const activeBranch = getActiveSliceBranch(basePath) ?? undefined;
  const branchRef = activeBranch ? parseSliceBranchName(activeBranch) : null;

  const issues = await client.listIssues();
  const parsedIssues = issues
    .map((issue) => {
      const parsed = parseKataTitle(issue.title);
      if (!parsed) return null;
      const metadata = maybeParseGithubArtifactMetadata(issue.body ?? "");
      return { issue, parsed, metadata } satisfies ParsedIssue;
    })
    .filter((entry): entry is ParsedIssue => entry !== null);

  const milestones = parsedIssues
    .filter((entry) => {
      if (entry.metadata?.kind === "milestone") return true;
      return MILESTONE_RE.test(entry.parsed.id);
    })
    .sort((a, b) => compareKataIds(a.parsed.id, b.parsed.id));

  const slices = parsedIssues
    .filter((entry) => {
      if (entry.metadata?.kind === "slice") return true;
      return SLICE_RE.test(entry.parsed.id);
    })
    .sort((a, b) => compareKataIds(a.parsed.id, b.parsed.id));

  const tasks = parsedIssues
    .filter((entry) => {
      if (entry.metadata?.kind === "task") return true;
      return TASK_RE.test(entry.parsed.id);
    })
    .sort((a, b) => compareKataIds(a.parsed.id, b.parsed.id));

  const registry: MilestoneRegistryEntry[] = [];

  let activeMilestoneEntry: (typeof milestones)[number] | null = null;

  if (milestones.length > 0) {
    const openMilestones = milestones.filter((entry) => entry.issue.state !== "closed");

    if (branchRef?.milestoneId) {
      activeMilestoneEntry =
        openMilestones.find((entry) => entry.parsed.id === branchRef.milestoneId) ?? null;
    }

    if (!activeMilestoneEntry) {
      activeMilestoneEntry = openMilestones[0] ?? null;
    }

    for (const milestone of milestones) {
      const status: MilestoneRegistryEntry["status"] =
        milestone.issue.state === "closed"
          ? "complete"
          : milestone.parsed.id === activeMilestoneEntry?.parsed.id
            ? "active"
            : "pending";

      registry.push({
        id: milestone.parsed.id,
        title: milestone.parsed.title,
        status,
      });
    }
  }

  const allMilestonesDone =
    milestones.length > 0 && milestones.every((milestone) => milestone.issue.state === "closed");

  if (milestones.length === 0) {
    return {
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
      phase: "pre-planning",
      recentDecisions: [],
      blockers: [],
      nextAction: nextActionForPhase("pre-planning"),
      activeBranch,
      registry,
      progress: {
        milestones: { done: 0, total: 0 },
        slices: { done: slices.filter((slice) => slice.issue.state === "closed").length, total: slices.length },
        tasks: { done: tasks.filter((task) => task.issue.state === "closed").length, total: tasks.length },
      },
    };
  }

  if (allMilestonesDone) {
    return {
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
      phase: "complete",
      recentDecisions: [],
      blockers: [],
      nextAction: nextActionForPhase("complete"),
      activeBranch,
      registry,
      progress: {
        milestones: {
          done: milestones.length,
          total: milestones.length,
        },
        slices: { done: slices.filter((slice) => slice.issue.state === "closed").length, total: slices.length },
        tasks: { done: tasks.filter((task) => task.issue.state === "closed").length, total: tasks.length },
      },
    };
  }

  const openSlices = slices.filter((slice) => slice.issue.state !== "closed");
  const closedSlices = slices.filter((slice) => slice.issue.state === "closed");

  let activeSliceEntry: (typeof openSlices)[number] | null = null;
  if (branchRef?.sliceId) {
    activeSliceEntry =
      openSlices.find((slice) => slice.parsed.id === branchRef.sliceId) ?? null;
  }
  if (!activeSliceEntry) {
    activeSliceEntry = openSlices[0] ?? null;
  }

  const openTasks = tasks.filter((task) => task.issue.state !== "closed");
  const closedTasks = tasks.filter((task) => task.issue.state === "closed");

  const activeSliceId = activeSliceEntry?.parsed.id ?? null;
  const scopedOpenTasks = activeSliceId
    ? openTasks.filter((task) => taskBelongsToSlice(task.issue, activeSliceId, task.metadata))
    : [];
  const scopedClosedTasks = activeSliceId
    ? closedTasks.filter((task) => taskBelongsToSlice(task.issue, activeSliceId, task.metadata))
    : [];

  const activeTaskEntry = scopedOpenTasks[0] ?? null;

  let phase: Phase;

  if (activeSliceEntry) {
    const labelPhase = resolvePhaseFromSliceLabels(activeSliceEntry.issue, labelPrefix);

    phase = labelPhase ?? computePhaseFallback(
      activeSliceEntry.issue,
      scopedOpenTasks.map((t) => t.issue),
      scopedClosedTasks.map((t) => t.issue),
    );
  } else {
    phase = "pre-planning";
  }

  const activeMilestone = activeMilestoneEntry
    ? toActiveRef(activeMilestoneEntry.issue, activeMilestoneEntry.parsed)
    : null;

  const activeSlice = activeSliceEntry
    ? toActiveRef(activeSliceEntry.issue, activeSliceEntry.parsed)
    : null;

  const activeTask = activeTaskEntry
    ? toActiveRef(activeTaskEntry.issue, activeTaskEntry.parsed)
    : null;

  // If the active slice has no open task but there are closed tasks, this slice
  // is likely complete and ready for summary.
  if (activeSlice && !activeTask && scopedClosedTasks.length > 0) {
    phase = "summarizing";
  }

  return {
    activeMilestone,
    activeSlice,
    activeTask,
    phase,
    recentDecisions: [],
    blockers: [],
    nextAction: nextActionForPhase(phase),
    activeBranch,
    registry,
    progress: {
      milestones: {
        done: milestones.filter((milestone) => milestone.issue.state === "closed").length,
        total: milestones.length,
      },
      slices: {
        done: closedSlices.length,
        total: slices.length,
      },
      tasks: {
        done: closedTasks.length,
        total: tasks.length,
      },
    },
  };
}
