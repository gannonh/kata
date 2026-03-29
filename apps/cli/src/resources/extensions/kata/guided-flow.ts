/**
 * Kata Guided Flow — Smart Entry Wizard
 *
 * Contextual command entry points for /kata.
 * Linear mode only — no filesystem artifact fallbacks.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { showNextAction } from "../shared/next-action-ui.js";
import { parseRoadmap } from "./files.js";
import { loadPrompt } from "./prompt-loader.js";
import { startAuto } from "./auto.js";
import { createBackend } from "./backend-factory.js";
import { readCrashLock, clearLock, formatCrashInfo } from "./crash-recovery.js";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEffectiveKataPreferences } from "./preferences.js";
import { enablePrPreferencesInContent } from "./pr-preferences-content.js";
import {
  getWorkflowEntrypointGuard,
  type WorkflowEntrypoint,
} from "./linear-config.js";
import type { KataBackend } from "./backend.js";
import type {
  KataState,
  RoadmapSliceEntry,
} from "./types.js";
import {
  isProjectConfigured,
} from "./onboarding.js";

// ─── PR onboarding helpers ─────────────────────────────────────────────────

function detectGithubRemote(basePath: string): boolean {
  try {
    const url = execSync("git remote get-url origin", {
      cwd: basePath,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return url.includes("github.com");
  } catch {
    return false;
  }
}

function enablePrPreferences(basePath: string): "enabled" | "already-enabled" | "failed" {
  const preferencesPath = join(basePath, ".kata", "preferences.md");
  try {
    const content = readFileSync(preferencesPath, "utf-8");
    const transformed = enablePrPreferencesInContent(content);
    if (!transformed.enabled) return "failed";
    if (!transformed.changed) return "already-enabled";
    writeFileSync(preferencesPath, transformed.content, "utf-8");
    return "enabled";
  } catch {
    return "failed";
  }
}

// ─── Auto-start after discuss ──────────────────────────────────────────────

let pendingAutoStart: {
  ctx: ExtensionCommandContext;
  pi: ExtensionAPI;
  basePath: string;
  milestoneId: string;
} | null = null;

export async function checkAutoStartAfterDiscuss(): Promise<boolean> {
  if (!pendingAutoStart) return false;

  const { ctx, pi, basePath, milestoneId } = pendingAutoStart;

  let created = false;
  try {
    const backend = await createBackend(basePath);
    created = await backend.checkMilestoneCreated(milestoneId);
  } catch {
    return false;
  }

  if (!created) return false;
  pendingAutoStart = null;

  const choice = await showNextAction(ctx as any, {
    title: `Kata — ${milestoneId} Ready`,
    summary: [`Context written for ${milestoneId}. Ready to plan and execute.`],
    actions: [
      {
        id: "auto",
        label: "Go auto",
        description:
          "Start auto-mode — research, plan, and execute automatically.",
        recommended: true,
      },
    ],
    notYetMessage: "Continue manually. Run /kata auto when ready.",
  });

  if (choice === "auto") {
    try {
      await startAuto(ctx, pi, basePath, false);
    } catch (error) {
      ctx.ui.notify(
        `Failed to start auto-mode: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error",
      );
    }
  }

  return true;
}

type UIContext = ExtensionContext;

function dispatchWorkflow(
  ctx: UIContext,
  pi: ExtensionAPI,
  note: string,
  customType = "kata-run",
  entrypoint: WorkflowEntrypoint = "smart-entry",
): boolean {
  const gate = getWorkflowEntrypointGuard(entrypoint);
  if (!gate.allow) {
    ctx.ui.notify(
      gate.notice ?? "Workflow mode is not supported here.",
      gate.noticeLevel,
    );
    return false;
  }
  pi.sendMessage(
    {
      customType,
      content: `Follow the Kata Workflow protocol in your system prompt.\n\n## Your Task\n\n${note}`,
      display: false,
    },
    { triggerTurn: true },
  );
  return true;
}

function milestoneIdsFromRegistry(state: KataState): string[] {
  return state.registry
    .map((e) => e.id)
    .filter((id) => /^M\d+$/.test(id))
    .sort();
}

function nextMilestoneId(state: KataState): string {
  const ids = milestoneIdsFromRegistry(state);
  const maxNum = ids.reduce((max, id) => {
    const n = parseInt(id.slice(1), 10);
    return n > max ? n : max;
  }, 0);
  return `M${String(maxNum + 1).padStart(3, "0")}`;
}

function getSliceDisplayStatus(
  state: KataState,
  slice: RoadmapSliceEntry,
  _idx: number,
): "done" | "active" | "pending" {
  if (slice.done) return "done";
  if (state.activeSlice?.id === slice.id) return "active";
  return "pending";
}

async function buildPlanningContext(
  state: KataState,
  backend: KataBackend,
  milestoneId: string,
): Promise<string> {
  const milestoneTitle = state.activeMilestone?.title ?? milestoneId;
  const parts: string[] = [
    `Active milestone: ${milestoneId} — ${milestoneTitle}`,
    `Phase: ${state.phase}`,
  ];

  const roadmapContent = await backend.readDocument(`${milestoneId}-ROADMAP`);
  if (!roadmapContent) {
    parts.push("Roadmap: not created yet.");
  } else {
    const roadmap = parseRoadmap(roadmapContent);
    const total = roadmap.slices.length;
    const done = roadmap.slices.filter((s) => s.done).length;
    const pending = total - done;

    parts.push(`Roadmap summary: ${done}/${total} slices complete, ${pending} pending.`);
    parts.push("Slices:");
    for (let i = 0; i < roadmap.slices.length; i++) {
      const slice = roadmap.slices[i]!;
      const status = getSliceDisplayStatus(state, slice, i);
      const dep = slice.depends.length > 0 ? ` depends:[${slice.depends.join(",")}]` : "";
      parts.push(`- ${slice.id}: ${slice.title} (${status}, risk:${slice.risk}${dep})`);
    }
  }

  if (state.blockers && state.blockers.length > 0) {
    parts.push(`Blockers: ${state.blockers.join("; ")}`);
  } else {
    parts.push("Blockers: none");
  }

  return parts.join("\n");
}

// ─── Queue ──────────────────────────────────────────────────────────────────

export async function showQueue(
  ctx: ExtensionCommandContext,
  _pi: ExtensionAPI,
  _basePath: string,
): Promise<void> {
  const modeGate = getWorkflowEntrypointGuard("queue");
  if (!modeGate.allow) {
    ctx.ui.notify(
      modeGate.notice ?? "Workflow mode is not supported here.",
      modeGate.noticeLevel,
    );
    return;
  }

  ctx.ui.notify("/kata queue is not yet available in Linear mode.", "warning");
}

// ─── Discuss ────────────────────────────────────────────────────────────────

async function buildDiscussSlicePrompt(
  mid: string,
  sid: string,
  sTitle: string,
  backend: KataBackend,
): Promise<string> {
  const inlined: string[] = [];

  const roadmapContent = await backend.readDocument(`${mid}-ROADMAP`);
  if (roadmapContent) {
    inlined.push(`### Milestone Roadmap\n\n${roadmapContent.trim()}`);
  }

  const contextContent = await backend.readDocument(`${mid}-CONTEXT`);
  if (contextContent) {
    inlined.push(`### Milestone Context\n\n${contextContent.trim()}`);
  }

  const researchContent = await backend.readDocument(`${mid}-RESEARCH`);
  if (researchContent) {
    inlined.push(`### Milestone Research\n\n${researchContent.trim()}`);
  }

  const decisionsContent = await backend.readDocument("DECISIONS");
  if (decisionsContent) {
    inlined.push(`### Decisions Register\n\n${decisionsContent.trim()}`);
  }

  if (roadmapContent) {
    const roadmap = parseRoadmap(roadmapContent);
    for (const s of roadmap.slices) {
      if (!s.done || s.id === sid) continue;
      const scope = backend.resolveSliceScope
        ? await backend.resolveSliceScope(mid, s.id)
        : undefined;
      const summaryContent = await backend.readDocument(`${s.id}-SUMMARY`, scope);
      if (summaryContent) {
        inlined.push(`### ${s.id} Summary (completed)\n\n${summaryContent.trim()}`);
      }
    }
  }

  const inlinedContext =
    inlined.length > 0
      ? `## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`
      : `## Inlined Context\n\n_(no context files found yet — ask broad grounding questions first)_`;

  const outputInstructions = [
    "**CRITICAL: Linear mode only — do NOT write local files, do NOT run mkdir, do NOT run git commit for planning artifacts.**",
    "",
    "Once the user is ready to wrap up:",
    "1. Read the slice context template at `~/.kata-cli/agent/extensions/kata/templates/slice-context.md`",
    `2. Resolve the slice issue UUID via \`kata_list_slices\` for ${mid}/${sid}`,
    `3. Write the context doc: \`kata_write_document("${sid}-CONTEXT", content, { issueId: "<slice-issue-uuid>" })\``,
    `4. Say exactly: "${sid} context written." — nothing else.`,
  ].join("\n");

  return loadPrompt("guided-discuss-slice", {
    milestoneId: mid,
    sliceId: sid,
    sliceTitle: sTitle,
    inlinedContext,
    outputInstructions,
  });
}

export async function showDiscuss(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  basePath: string,
): Promise<void> {
  const modeGate = getWorkflowEntrypointGuard("discuss");
  if (!modeGate.allow) {
    ctx.ui.notify(
      modeGate.notice ?? "Workflow mode is not supported here.",
      modeGate.noticeLevel,
    );
    return;
  }

  let backend: Awaited<ReturnType<typeof createBackend>>;
  try {
    backend = await createBackend(basePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Backend init failed: ${msg}`, "error");
    return;
  }

  const state = await backend.deriveState();
  if (!state.activeMilestone) {
    ctx.ui.notify("No active milestone. Run /kata to create one first.", "warning");
    return;
  }

  const mid = state.activeMilestone.id;
  const milestoneTitle = state.activeMilestone.title;

  const roadmapContent = await backend.readDocument(`${mid}-ROADMAP`);
  if (!roadmapContent) {
    ctx.ui.notify("No roadmap yet for this milestone. Run /kata plan first.", "warning");
    return;
  }

  const roadmap = parseRoadmap(roadmapContent);
  const pendingSlices = roadmap.slices.filter((s) => !s.done);
  if (pendingSlices.length === 0) {
    ctx.ui.notify("All slices are complete — nothing to discuss.", "info");
    return;
  }

  while (true) {
    const actions = pendingSlices.map((s, i) => ({
      id: s.id,
      label: `${s.id}: ${s.title}`,
      description: state.activeSlice?.id === s.id ? "active slice" : "upcoming",
      recommended: i === 0,
    }));

    const choice = await showNextAction(ctx as any, {
      title: "Kata — Discuss a slice",
      summary: [
        `${mid}: ${milestoneTitle}`,
        "Pick a slice to interview. Context is saved to a Linear document.",
      ],
      actions,
      notYetMessage: "Run /kata discuss when ready.",
    });

    if (choice === "not_yet") return;

    const chosen = pendingSlices.find((s) => s.id === choice);
    if (!chosen) return;

    const prompt = await buildDiscussSlicePrompt(mid, chosen.id, chosen.title, backend);
    if (!dispatchWorkflow(ctx, pi, prompt, "kata-discuss", "discuss")) return;

    await ctx.waitForIdle();
  }
}

// ─── Plan ───────────────────────────────────────────────────────────────────

export async function showPlan(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  basePath: string,
): Promise<void> {
  const modeGate = getWorkflowEntrypointGuard("plan");
  if (!modeGate.allow) {
    ctx.ui.notify(
      modeGate.notice ?? "Workflow mode is not supported here.",
      modeGate.noticeLevel,
    );
    return;
  }

  let backend: Awaited<ReturnType<typeof createBackend>>;
  try {
    backend = await createBackend(basePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Backend init failed: ${msg}`, "error");
    return;
  }

  const state = await backend.deriveState();
  if (state.phase === "blocked") {
    ctx.ui.notify(
      `Blocked: ${state.blockers?.join(", ")}. Fix and run /kata plan.`,
      "warning",
    );
    return;
  }

  // State A: no milestones
  if (!state.activeMilestone && state.registry.length === 0) {
    const nextId = nextMilestoneId(state);
    const choice = await showNextAction(ctx as any, {
      title: "Kata — Plan",
      summary: ["No milestones yet."],
      actions: [
        {
          id: "plan_new_milestone",
          label: "Plan new milestone",
          description: `Create and plan ${nextId}.`,
          recommended: true,
        },
      ],
      notYetMessage: "Run /kata plan when ready.",
    });

    if (choice === "plan_new_milestone") {
      dispatchWorkflow(
        ctx,
        pi,
        backend.buildDiscussPrompt(nextId, `New milestone ${nextId}.`),
        "kata-plan",
        "plan",
      );
    }
    return;
  }

  // State E: all milestones complete (can have no active milestone)
  if (state.phase === "complete") {
    const nextId = nextMilestoneId(state);
    const discussionMilestone =
      state.activeMilestone ?? state.registry[state.registry.length - 1] ?? null;
    const discussionMilestoneId = discussionMilestone?.id ?? nextId;
    const discussionMilestoneTitle =
      discussionMilestone?.title ?? "Completed milestones";

    const currentState = discussionMilestone
      ? await buildPlanningContext(state, backend, discussionMilestone.id)
      : [
          "All milestones are complete.",
          `Completed milestones: ${state.registry.length}.`,
          state.blockers && state.blockers.length > 0
            ? `Blockers: ${state.blockers.join(", ")}`
            : "Blockers: none.",
        ].join("\n");

    const choice = await showNextAction(ctx as any, {
      title: "Kata — Plan",
      summary: ["All milestones are complete."],
      actions: [
        {
          id: "plan_new_milestone",
          label: "Plan new milestone",
          description: `Create and plan ${nextId}.`,
          recommended: true,
        },
        {
          id: "discuss_planning",
          label: "Discuss planning",
          description: "Freeform planning discussion.",
        },
      ],
      notYetMessage: "Run /kata plan when ready.",
    });

    if (choice === "plan_new_milestone") {
      dispatchWorkflow(
        ctx,
        pi,
        backend.buildDiscussPrompt(nextId, `New milestone ${nextId}.`),
        "kata-plan",
        "plan",
      );
      return;
    }

    if (choice === "discuss_planning") {
      dispatchWorkflow(
        ctx,
        pi,
        loadPrompt("guided-discuss-planning", {
          milestoneId: discussionMilestoneId,
          milestoneTitle: discussionMilestoneTitle,
          currentState,
        }),
        "kata-plan",
        "plan",
      );
    }
    return;
  }

  const mid = state.activeMilestone?.id;
  const milestoneTitle = state.activeMilestone?.title;
  if (!mid || !milestoneTitle) {
    ctx.ui.notify("No active milestone. Run /kata to continue.", "warning");
    return;
  }

  const roadmapContent = await backend.readDocument(`${mid}-ROADMAP`);

  // State B: active milestone, no roadmap
  if (!roadmapContent) {
    const currentState = await buildPlanningContext(state, backend, mid);
    const choice = await showNextAction(ctx as any, {
      title: `Kata — Plan ${mid}`,
      summary: [
        `${mid}: ${milestoneTitle}`,
        "No roadmap exists yet for this milestone.",
      ],
      actions: [
        {
          id: "plan_milestone_roadmap",
          label: "Plan milestone roadmap",
          description: "Decompose this milestone into slices.",
          recommended: true,
        },
        {
          id: "discuss_planning",
          label: "Discuss planning",
          description: "Freeform planning discussion before making changes.",
        },
      ],
      notYetMessage: "Run /kata plan when ready.",
    });

    if (choice === "plan_milestone_roadmap") {
      dispatchWorkflow(
        ctx,
        pi,
        loadPrompt("guided-plan-milestone", {
          milestoneId: mid,
          milestoneTitle,
        }),
        "kata-plan",
        "plan",
      );
      return;
    }

    if (choice === "discuss_planning") {
      dispatchWorkflow(
        ctx,
        pi,
        loadPrompt("guided-discuss-planning", {
          milestoneId: mid,
          milestoneTitle,
          currentState,
        }),
        "kata-plan",
        "plan",
      );
    }
    return;
  }

  const roadmap = parseRoadmap(roadmapContent);
  const pendingSlices = roadmap.slices.filter((s) => !s.done);

  const unplannedSlices = (
    await Promise.all(
      pendingSlices.map(async (slice) => {
        const scope = backend.resolveSliceScope
          ? await backend.resolveSliceScope(mid, slice.id)
          : undefined;
        const hasPlan = await backend.documentExists(`${slice.id}-PLAN`, scope);
        return hasPlan ? null : slice;
      }),
    )
  ).filter((slice): slice is RoadmapSliceEntry => slice !== null);

  const currentState = await buildPlanningContext(state, backend, mid);

  // State D: all slices complete in active milestone
  if (pendingSlices.length === 0) {
    const nextId = nextMilestoneId(state);
    const choice = await showNextAction(ctx as any, {
      title: `Kata — Plan ${mid}`,
      summary: [
        `${mid}: ${milestoneTitle}`,
        "All slices in this milestone are complete.",
      ],
      actions: [
        {
          id: "plan_new_milestone",
          label: "Plan new milestone",
          description: `Create and plan ${nextId}.`,
          recommended: true,
        },
        {
          id: "add_slice",
          label: "Add slices to current milestone",
          description: "Add new slices to this milestone roadmap.",
        },
        {
          id: "revise_roadmap",
          label: "Revise milestone roadmap",
          description: "Reshape scope and slice structure.",
        },
        {
          id: "discuss_planning",
          label: "Discuss planning",
          description: "Freeform planning discussion.",
        },
      ],
      notYetMessage: "Run /kata plan when ready.",
    });

    if (choice === "plan_new_milestone") {
      dispatchWorkflow(
        ctx,
        pi,
        backend.buildDiscussPrompt(nextId, `New milestone ${nextId}.`),
        "kata-plan",
        "plan",
      );
      return;
    }

    if (choice === "add_slice") {
      dispatchWorkflow(
        ctx,
        pi,
        loadPrompt("guided-add-slice", {
          milestoneId: mid,
          milestoneTitle,
        }),
        "kata-plan",
        "plan",
      );
      return;
    }

    if (choice === "revise_roadmap") {
      dispatchWorkflow(
        ctx,
        pi,
        loadPrompt("guided-revise-roadmap", {
          milestoneId: mid,
          milestoneTitle,
        }),
        "kata-plan",
        "plan",
      );
      return;
    }

    if (choice === "discuss_planning") {
      dispatchWorkflow(
        ctx,
        pi,
        loadPrompt("guided-discuss-planning", {
          milestoneId: mid,
          milestoneTitle,
          currentState,
        }),
        "kata-plan",
        "plan",
      );
    }
    return;
  }

  // State C: active milestone has roadmap + pending slices
  const actions: Array<{
    id: string;
    label: string;
    description: string;
    recommended?: boolean;
  }> = [];

  if (unplannedSlices.length > 0) {
    const nextSlice = unplannedSlices[0]!;
    actions.push({
      id: "plan_next_unplanned",
      label: `Plan next unplanned slice (${nextSlice.id})`,
      description: `${nextSlice.id}: ${nextSlice.title}`,
      recommended: true,
    });
  }

  if (pendingSlices.length > 1) {
    actions.push({
      id: "pick_slice",
      label: "Pick a slice to plan",
      description: `Choose from ${pendingSlices.length} pending slices.`,
      recommended: actions.length === 0,
    });
  }

  actions.push(
    {
      id: "add_slice",
      label: "Add a new slice",
      description: "Append a new slice to this milestone roadmap.",
    },
    {
      id: "resequence_slices",
      label: "Resequence slices",
      description: "Reorder slices and dependencies.",
    },
    {
      id: "revise_roadmap",
      label: "Revise milestone roadmap",
      description: "Broader roadmap revision across slices/scope.",
    },
    {
      id: "plan_new_milestone",
      label: "Plan new milestone",
      description: "Define a subsequent milestone now.",
    },
    {
      id: "discuss_planning",
      label: "Discuss planning",
      description: "Freeform planning discussion.",
    },
  );

  const choice = await showNextAction(ctx as any, {
    title: `Kata — Plan ${mid}`,
    summary: [
      `${mid}: ${milestoneTitle}`,
      `${pendingSlices.length} pending slice(s), ${unplannedSlices.length} unplanned.`,
    ],
    actions,
    notYetMessage: "Run /kata plan when ready.",
  });

  if (choice === "not_yet") return;

  if (choice === "plan_next_unplanned" && unplannedSlices.length > 0) {
    const nextSlice = unplannedSlices[0]!;
    dispatchWorkflow(
      ctx,
      pi,
      loadPrompt("guided-plan-slice", {
        milestoneId: mid,
        sliceId: nextSlice.id,
        sliceTitle: nextSlice.title,
      }),
      "kata-plan",
      "plan",
    );
    return;
  }

  if (choice === "pick_slice") {
    const sliceActions = pendingSlices.map((slice, i) => ({
      id: slice.id,
      label: `${slice.id}: ${slice.title}`,
      description: unplannedSlices.some((s) => s.id === slice.id)
        ? "unplanned"
        : "has plan — replan",
      recommended: i === 0,
    }));

    const sliceChoice = await showNextAction(ctx as any, {
      title: "Kata — Pick slice to plan",
      summary: [`${mid}: ${milestoneTitle}`],
      actions: sliceActions,
      notYetMessage: "Run /kata plan when ready.",
    });

    if (sliceChoice === "not_yet") return;

    const picked = pendingSlices.find((s) => s.id === sliceChoice);
    if (!picked) return;

    dispatchWorkflow(
      ctx,
      pi,
      loadPrompt("guided-plan-slice", {
        milestoneId: mid,
        sliceId: picked.id,
        sliceTitle: picked.title,
      }),
      "kata-plan",
      "plan",
    );
    return;
  }

  if (choice === "add_slice") {
    dispatchWorkflow(
      ctx,
      pi,
      loadPrompt("guided-add-slice", {
        milestoneId: mid,
        milestoneTitle,
      }),
      "kata-plan",
      "plan",
    );
    return;
  }

  if (choice === "resequence_slices") {
    dispatchWorkflow(
      ctx,
      pi,
      loadPrompt("guided-resequence-slices", {
        milestoneId: mid,
        milestoneTitle,
      }),
      "kata-plan",
      "plan",
    );
    return;
  }

  if (choice === "revise_roadmap") {
    dispatchWorkflow(
      ctx,
      pi,
      loadPrompt("guided-revise-roadmap", {
        milestoneId: mid,
        milestoneTitle,
      }),
      "kata-plan",
      "plan",
    );
    return;
  }

  if (choice === "plan_new_milestone") {
    const nextId = nextMilestoneId(state);
    dispatchWorkflow(
      ctx,
      pi,
      backend.buildDiscussPrompt(nextId, `New milestone ${nextId}.`),
      "kata-plan",
      "plan",
    );
    return;
  }

  if (choice === "discuss_planning") {
    dispatchWorkflow(
      ctx,
      pi,
      loadPrompt("guided-discuss-planning", {
        milestoneId: mid,
        milestoneTitle,
        currentState,
      }),
      "kata-plan",
      "plan",
    );
  }
}

// ─── Smart Entry ────────────────────────────────────────────────────────────

export async function showSmartEntry(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  basePath: string,
): Promise<void> {
  // Onboarding guard: if unconfigured, show a brief message and return.
  // commands.ts is the authoritative entry point for triggering the wizard.
  if (!isProjectConfigured(basePath)) {
    ctx.ui.notify("Run /kata to set up Linear integration.", "info");
    return;
  }

  const modeGate = getWorkflowEntrypointGuard("smart-entry");
  if (!modeGate.allow) {
    ctx.ui.notify(
      modeGate.notice ?? "Workflow mode is not supported here.",
      modeGate.noticeLevel,
    );
    return;
  }

  let backend: Awaited<ReturnType<typeof createBackend>>;
  try {
    backend = await createBackend(basePath);
    await backend.bootstrap();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Backend init failed: ${msg}`, "error");
    return;
  }

  const crashLock = readCrashLock(basePath);
  if (crashLock) {
    clearLock(basePath);
    const resume = await showNextAction(ctx as any, {
      title: "Kata — Interrupted Session Detected",
      summary: [formatCrashInfo(crashLock)],
      actions: [
        {
          id: "resume",
          label: "Resume with /kata auto",
          description: "Pick up where it left off",
          recommended: true,
        },
        {
          id: "continue",
          label: "Continue manually",
          description: "Open the wizard as normal",
        },
      ],
    });

    if (resume === "resume") {
      await startAuto(ctx, pi, basePath, false);
      return;
    }
  }

  const state = await backend.deriveState();
  if (state.phase === "blocked") {
    ctx.ui.notify(
      `Blocked: ${state.blockers?.join(", ")}. Fix and run /kata.`,
      "warning",
    );
    return;
  }

  if (!state.activeMilestone) {
    if (pendingAutoStart?.basePath === basePath) {
      ctx.ui.notify(
        "Discussion already in progress — answer the question above to continue.",
        "info",
      );
      return;
    }

    const nextId = nextMilestoneId(state);
    const isFirst = state.registry.length === 0;

    if (isFirst) {
      pendingAutoStart = { ctx, pi, basePath, milestoneId: nextId };
      if (
        !dispatchWorkflow(
          ctx,
          pi,
          backend.buildDiscussPrompt(nextId, `New project, milestone ${nextId}.`),
          "kata-run",
          "smart-entry",
        )
      ) {
        pendingAutoStart = null;
      }
      return;
    }

    const choice = await showNextAction(ctx as any, {
      title: "Kata — Kata Workflow",
      summary: ["No active milestone."],
      actions: [
        {
          id: "new_milestone",
          label: "Create next milestone",
          description: "Define what to build next.",
          recommended: true,
        },
      ],
      notYetMessage: "Run /kata when ready.",
    });

    if (choice === "new_milestone") {
      pendingAutoStart = { ctx, pi, basePath, milestoneId: nextId };
      if (
        !dispatchWorkflow(
          ctx,
          pi,
          backend.buildDiscussPrompt(nextId, `New milestone ${nextId}.`),
          "kata-run",
          "smart-entry",
        )
      ) {
        pendingAutoStart = null;
      }
    }
    return;
  }

  const milestoneId = state.activeMilestone.id;
  const milestoneTitle = state.activeMilestone.title;

  if (state.phase === "complete") {
    const choice = await showNextAction(ctx as any, {
      title: `Kata — ${milestoneId}: ${milestoneTitle}`,
      summary: ["All milestones complete."],
      actions: [
        {
          id: "new_milestone",
          label: "Start new milestone",
          description: "Define and plan the next milestone.",
          recommended: true,
        },
        {
          id: "status",
          label: "View status",
          description: "Review what was built.",
        },
      ],
      notYetMessage: "Run /kata when ready.",
    });

    if (choice === "new_milestone") {
      const nextId = nextMilestoneId(state);
      pendingAutoStart = { ctx, pi, basePath, milestoneId: nextId };
      if (
        !dispatchWorkflow(
          ctx,
          pi,
          backend.buildDiscussPrompt(nextId, `New milestone ${nextId}.`),
          "kata-run",
          "smart-entry",
        )
      ) {
        pendingAutoStart = null;
      }
      return;
    }

    if (choice === "status") {
      const { fireStatusViaCommand } = await import("./commands.js");
      await fireStatusViaCommand(ctx);
    }
    return;
  }

  if (!state.activeSlice) {
    const hasRoadmap = await backend.documentExists(`${milestoneId}-ROADMAP`);

    if (!hasRoadmap) {
      const hasContext = await backend.documentExists(`${milestoneId}-CONTEXT`);
      const actions = [
        {
          id: "plan",
          label: "Create roadmap",
          description: hasContext
            ? "Context captured. Decompose into slices with a boundary map."
            : "Decompose the milestone into slices with a boundary map.",
          recommended: true,
        },
        ...(!hasContext
          ? [
              {
                id: "discuss",
                label: "Discuss first",
                description: "Capture decisions on gray areas before planning.",
              },
            ]
          : []),
      ];

      const choice = await showNextAction(ctx as any, {
        title: `Kata — ${milestoneId}: ${milestoneTitle}`,
        summary: [
          hasContext
            ? "Context captured. Ready to create roadmap."
            : "New milestone — no roadmap yet.",
        ],
        actions,
        notYetMessage: "Run /kata when ready.",
      });

      if (choice === "plan") {
        dispatchWorkflow(
          ctx,
          pi,
          loadPrompt("guided-plan-milestone", {
            milestoneId,
            milestoneTitle,
          }),
          "kata-run",
          "smart-entry",
        );
        return;
      }

      if (choice === "discuss") {
        dispatchWorkflow(
          ctx,
          pi,
          loadPrompt("guided-discuss-milestone", {
            milestoneId,
            milestoneTitle,
          }),
          "kata-run",
          "smart-entry",
        );
      }
      return;
    }

    const hasGithubRemote = detectGithubRemote(basePath);
    const effectivePrefs = loadEffectiveKataPreferences();
    const prEnabled = effectivePrefs?.preferences?.pr?.enabled === true;
    const { getPrOnboardingRecommendation } = await import("./pr-command.js");
    const prRecommendation = getPrOnboardingRecommendation(prEnabled, hasGithubRemote);

    const summaryLines = ["Roadmap exists. Ready to execute."];
    if (prRecommendation) summaryLines.push(prRecommendation);

    const actions = [
      {
        id: "auto",
        label: "Go auto",
        description:
          "Execute everything automatically until milestone complete.",
        recommended: true,
      },
      ...(prRecommendation && hasGithubRemote && !prEnabled
        ? [
            {
              id: "setup_pr",
              label: "Set up PR lifecycle",
              description:
                "Enable PR creation, review, and merge for this project.",
            },
          ]
        : []),
      {
        id: "status",
        label: "View status",
        description: "See milestone progress and blockers.",
      },
    ];

    const choice = await showNextAction(ctx as any, {
      title: `Kata — ${milestoneId}: ${milestoneTitle}`,
      summary: summaryLines,
      actions,
      notYetMessage: "Run /kata status for details.",
    });

    if (choice === "auto") {
      await startAuto(ctx, pi, basePath, false);
      return;
    }

    if (choice === "setup_pr") {
      const enableResult = enablePrPreferences(basePath);
      if (enableResult === "enabled") {
        ctx.ui.notify(
          "PR lifecycle enabled. Set auto_create, base_branch, and review_on_create in .kata/preferences.md as needed.",
          "info",
        );
      } else if (enableResult === "already-enabled") {
        ctx.ui.notify(
          "PR lifecycle is already enabled in .kata/preferences.md.",
          "info",
        );
      } else {
        ctx.ui.notify(
          "Could not update .kata/preferences.md automatically. Please set pr.enabled: true manually.",
          "warning",
        );
      }
      return;
    }

    if (choice === "status") {
      const { fireStatusViaCommand } = await import("./commands.js");
      await fireStatusViaCommand(ctx);
    }
    return;
  }

  const sliceId = state.activeSlice.id;
  const sliceTitle = state.activeSlice.title;

  if (state.phase === "planning") {
    const sliceScope = backend.resolveSliceScope
      ? await backend.resolveSliceScope(milestoneId, sliceId)
      : undefined;
    const hasContext = await backend.documentExists(`${sliceId}-CONTEXT`, sliceScope);
    const hasResearch = await backend.documentExists(`${sliceId}-RESEARCH`, sliceScope);

    const actions = [
      {
        id: "plan",
        label: `Plan ${sliceId}`,
        description: `Decompose "${sliceTitle}" into tasks with must-haves.`,
        recommended: true,
      },
      ...(!hasContext
        ? [
            {
              id: "discuss",
              label: `Discuss ${sliceId} first`,
              description: "Capture context and decisions for this slice.",
            },
          ]
        : []),
      ...(!hasResearch
        ? [
            {
              id: "research",
              label: `Research ${sliceId} first`,
              description: "Scout codebase and relevant docs.",
            },
          ]
        : []),
      {
        id: "status",
        label: "View status",
        description: "See milestone progress.",
      },
    ];

    const summaryParts: string[] = [];
    if (hasContext) summaryParts.push("context ✓");
    if (hasResearch) summaryParts.push("research ✓");

    const choice = await showNextAction(ctx as any, {
      title: `Kata — ${milestoneId} / ${sliceId}: ${sliceTitle}`,
      summary: [
        summaryParts.length > 0
          ? `${sliceId}: ${sliceTitle} (${summaryParts.join(", ")})`
          : `${sliceId}: ${sliceTitle} — ready for planning.`,
      ],
      actions,
      notYetMessage: "Run /kata when ready.",
    });

    if (choice === "plan") {
      dispatchWorkflow(
        ctx,
        pi,
        loadPrompt("guided-plan-slice", {
          milestoneId,
          sliceId,
          sliceTitle,
        }),
        "kata-run",
        "smart-entry",
      );
      return;
    }

    if (choice === "discuss") {
      const prompt = await buildDiscussSlicePrompt(milestoneId, sliceId, sliceTitle, backend);
      dispatchWorkflow(ctx, pi, prompt, "kata-run", "smart-entry");
      return;
    }

    if (choice === "research") {
      dispatchWorkflow(
        ctx,
        pi,
        loadPrompt("guided-research-slice", {
          milestoneId,
          sliceId,
          sliceTitle,
        }),
        "kata-run",
        "smart-entry",
      );
      return;
    }

    if (choice === "status") {
      const { fireStatusViaCommand } = await import("./commands.js");
      await fireStatusViaCommand(ctx);
    }
    return;
  }

  if (state.phase === "summarizing") {
    const choice = await showNextAction(ctx as any, {
      title: `Kata — ${milestoneId} / ${sliceId}: ${sliceTitle}`,
      summary: ["All tasks complete. Ready for slice summary."],
      actions: [
        {
          id: "complete",
          label: `Complete ${sliceId}`,
          description:
            "Write summary/UAT, mark done, and finish the slice lifecycle.",
          recommended: true,
        },
        {
          id: "status",
          label: "View status",
          description: "Review progress before completing.",
        },
      ],
      notYetMessage: "Run /kata when ready.",
    });

    if (choice === "complete") {
      dispatchWorkflow(
        ctx,
        pi,
        loadPrompt("guided-complete-slice", {
          milestoneId,
          sliceId,
          sliceTitle,
        }),
        "kata-run",
        "smart-entry",
      );
      return;
    }

    if (choice === "status") {
      const { fireStatusViaCommand } = await import("./commands.js");
      await fireStatusViaCommand(ctx);
    }
    return;
  }

  if (state.activeTask) {
    const taskId = state.activeTask.id;
    const taskTitle = state.activeTask.title;

    const choice = await showNextAction(ctx as any, {
      title: `Kata — ${milestoneId} / ${sliceId}: ${sliceTitle}`,
      summary: [`Next: ${taskId} — ${taskTitle}`],
      actions: [
        {
          id: "execute",
          label: `Execute ${taskId}`,
          description: `Start working on "${taskTitle}".`,
          recommended: true,
        },
        {
          id: "auto",
          label: "Go auto",
          description: "Execute this and remaining tasks automatically.",
        },
        {
          id: "status",
          label: "View status",
          description: "See slice progress before starting.",
        },
      ],
      notYetMessage: "Run /kata when ready.",
    });

    if (choice === "auto") {
      await startAuto(ctx, pi, basePath, false);
      return;
    }

    if (choice === "execute") {
      const promptName = state.phase === "verifying" ? "guided-resume-task" : "guided-execute-task";
      dispatchWorkflow(
        ctx,
        pi,
        loadPrompt(promptName, {
          milestoneId,
          sliceId,
          taskId,
          taskTitle,
        }),
        "kata-run",
        "smart-entry",
      );
      return;
    }

    if (choice === "status") {
      const { fireStatusViaCommand } = await import("./commands.js");
      await fireStatusViaCommand(ctx);
    }
    return;
  }

  const { fireStatusViaCommand } = await import("./commands.js");
  await fireStatusViaCommand(ctx);
}
