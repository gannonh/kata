/**
 * Kata Auto Mode — Fresh Session Per Unit
 *
 * Unified dispatch loop backed by KataBackend.
 * The backend handles state derivation, prompt building, and document I/O.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

import type { KataState } from "./types.js";
import type { KataBackend, PromptOptions } from "./backend.js";
import { createBackend } from "./backend-factory.js";
import { saveActivityLog } from "./activity-log.js";
import {
  synthesizeCrashRecovery,
  getDeepDiagnostic,
} from "./session-forensics.js";
import {
  writeLock,
  clearLock,
  readCrashLock,
  formatCrashInfo,
} from "./crash-recovery.js";
import {
  acquireSessionLock,
  releaseSessionLock,
  updateSessionLock,
} from "./session-lock.js";
import {
  clearUnitRuntimeRecord,
  readUnitRuntimeRecord,
  writeUnitRuntimeRecord,
} from "./unit-runtime.js";
import {
  resolveAutoSupervisorConfig,
  resolveModelForUnit,
  resolveSkillDiscoveryMode,
  loadEffectiveKataPreferences,
} from "./preferences.js";
import {
  decidePostCompleteSliceAction,
} from "./pr-auto.js";
import { initDebugLog, closeDebugLog, dlog } from "./debug-log.js";
import { runCreatePr } from "../pr-lifecycle/pr-runner.js";
import { getWorkflowEntrypointGuard } from "./linear-config.js";
import { snapshotSkills, clearSkillSnapshot } from "./skill-discovery.js";
import {
  initMetrics,
  resetMetrics,
  snapshotUnitMetrics,
  getLedger,
  getProjectTotals,
  formatCost,
  formatTokenCount,
} from "./metrics.js";
import { join } from "node:path";
import { kataRoot } from "./paths.js";
import { unitVerb, unitPhaseLabel } from "./unit-display.js";
import { formatDuration } from "./markdown-utils.js";
import {
  autoCommitCurrentBranch,
  ensureSliceBranch,
  switchToMain,
  mergeSliceToMain,
} from "./worktree.ts";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { makeUI, GLYPH, INDENT } from "../shared/ui.js";

import { resolveModelSwitch, computeSupervisorTimeouts } from "./auto-helpers.js";
export { resolveModelSwitch, computeSupervisorTimeouts } from "./auto-helpers.js";
export type { ModelSwitchResult } from "./auto-helpers.js";
import { deriveUnitType, deriveUnitId, peekNext } from "./auto-dispatch.js";
export { deriveUnitType, deriveUnitId, peekNext } from "./auto-dispatch.js";
const providerBackoffMs = [5000, 10000, 30000];

// ─── State ────────────────────────────────────────────────────────────────────

let active = false;
let paused = false;
let stepActive = false;
let verbose = false;
let cmdCtx: ExtensionCommandContext | null = null;
let basePath = "";
let backend: KataBackend | null = null;

/** Track last dispatched unit to detect stuck loops */
let lastUnit: { type: string; id: string } | null = null;
let retryCount = 0;
const MAX_RETRIES = 1;

/** Provider error retry state */
const MAX_PROVIDER_RETRIES = 10;
let providerErrorStreak = 0;

/** Crash recovery prompt — set by startAuto, consumed by first dispatchNextUnit */
let pendingCrashRecovery: string | null = null;

/** Dashboard tracking */
let autoStartTime: number = 0;
let completedUnits: {
  type: string;
  id: string;
  startedAt: number;
  finishedAt: number;
}[] = [];
let currentUnit: { type: string; id: string; startedAt: number } | null = null;

/** Track current milestone to detect transitions */
let currentMilestoneId: string | null = null;

/** Model the user had selected before auto-mode started */
let originalModelId: string | null = null;

/** Progress-aware timeout supervision */
let unitTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let wrapupWarningHandle: ReturnType<typeof setTimeout> | null = null;
let idleWatchdogHandle: ReturnType<typeof setInterval> | null = null;

/** Dashboard data for the overlay */
export interface AutoDashboardData {
  active: boolean;
  paused: boolean;
  startTime: number;
  elapsed: number;
  currentUnit: { type: string; id: string; startedAt: number } | null;
  completedUnits: {
    type: string;
    id: string;
    startedAt: number;
    finishedAt: number;
  }[];
  basePath: string;
  /** Running cost and token totals from metrics ledger */
  totalCost: number;
  totalTokens: number;
}

export function getAutoDashboardData(): AutoDashboardData {
  const ledger = getLedger();
  const totals = ledger ? getProjectTotals(ledger.units) : null;
  return {
    active,
    paused,
    startTime: autoStartTime,
    elapsed: active || paused ? Date.now() - autoStartTime : 0,
    currentUnit: currentUnit ? { ...currentUnit } : null,
    completedUnits: [...completedUnits],
    basePath,
    totalCost: totals?.cost ?? 0,
    totalTokens: totals?.tokens.total ?? 0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isAutoActive(): boolean {
  return active;
}

export function isAutoPaused(): boolean {
  return paused;
}

export function isStepActive(): boolean {
  return stepActive;
}

export function setStepActive(v: boolean): void {
  stepActive = v;
}

function clearUnitTimeout(): void {
  if (unitTimeoutHandle) {
    clearTimeout(unitTimeoutHandle);
    unitTimeoutHandle = null;
  }
  if (wrapupWarningHandle) {
    clearTimeout(wrapupWarningHandle);
    wrapupWarningHandle = null;
  }
  if (idleWatchdogHandle) {
    clearInterval(idleWatchdogHandle);
    idleWatchdogHandle = null;
  }
}

export async function stopAuto(
  ctx?: ExtensionContext,
  pi?: ExtensionAPI,
): Promise<void> {
  if (!active && !paused) return;
  clearUnitTimeout();
  if (basePath) {
    releaseSessionLock(basePath);
  }
  clearSkillSnapshot();

  providerErrorStreak = 0;
  dlog("stop", { reason: "explicit" });
  closeDebugLog();

  // Show final cost summary before resetting
  const ledger = getLedger();
  if (ledger && ledger.units.length > 0) {
    const totals = getProjectTotals(ledger.units);
    ctx?.ui.notify(
      `Auto-mode stopped. Session: ${formatCost(totals.cost)} · ${formatTokenCount(totals.tokens.total)} tokens · ${ledger.units.length} units`,
      "info",
    );
  } else {
    ctx?.ui.notify("Auto-mode stopped.", "info");
  }

  resetMetrics();
  active = false;
  paused = false;
  lastUnit = null;
  currentUnit = null;
  currentMilestoneId = null;
  cachedSliceProgress = null;
  pendingCrashRecovery = null;
  backend = null;
  ctx?.ui.setStatus("kata-auto", undefined);
  ctx?.ui.setWidget("kata-progress", undefined);

  // Restore the user's original model
  if (pi && ctx && originalModelId) {
    const original = ctx.modelRegistry.find("anthropic", originalModelId);
    if (original) await pi.setModel(original);
    originalModelId = null;
  }

  cmdCtx = null;
}

/**
 * Pause auto-mode without destroying state. Context is preserved.
 * The user can interact with the agent, then `/kata auto` resumes
 * from disk state. Called when the user presses Escape during auto-mode.
 */
export async function pauseAuto(
  ctx?: ExtensionContext,
  _pi?: ExtensionAPI,
): Promise<void> {
  if (!active) return;
  clearUnitTimeout();
  if (basePath) {
    releaseSessionLock(basePath);
  }
  active = false;
  paused = true;
  // Preserve: lastUnit, currentUnit, basePath, verbose, cmdCtx,
  // completedUnits, autoStartTime, currentMilestoneId, originalModelId, backend
  // — all needed for resume and dashboard display
  ctx?.ui.setStatus("kata-auto", "paused");
  ctx?.ui.setWidget("kata-progress", undefined);
  ctx?.ui.notify(
    "Auto-mode paused (Escape). Type to interact, or /kata auto to resume.",
    "info",
  );
}

export async function startAuto(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  base: string,
  verboseMode: boolean,
): Promise<void> {
  const modeGate = getWorkflowEntrypointGuard("auto");
  if (!modeGate.allow) {
    ctx.ui.notify(
      modeGate.notice ?? "Workflow mode is not supported here.",
      modeGate.noticeLevel,
    );
    return;
  }

  // If resuming from paused state, just re-activate and dispatch next unit.
  // The conversation is still intact — no need to reinitialize everything.
  if (paused) {
    const lockResult = acquireSessionLock(base);
    if (!lockResult.acquired) {
      const pidSuffix = lockResult.existingPid
        ? ` Existing PID: ${lockResult.existingPid}.`
        : "";
      ctx.ui.notify(
        `Auto-mode resume blocked by session lock: ${lockResult.reason}${pidSuffix}`,
        "error",
      );
      return;
    }

    paused = false;
    active = true;
    stepActive = false;
    verbose = verboseMode;
    cmdCtx = ctx;
    basePath = base;
    // Re-initialize metrics in case ledger was lost during pause
    if (!getLedger()) initMetrics(base);
    ctx.ui.setStatus("kata-auto", "auto");
    ctx.ui.notify("Auto-mode resumed.", "info");
    await dispatchNextUnit(ctx, pi);
    return;
  }

  // Create backend (handles mode detection internally)
  try {
    backend = await createBackend(base);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Backend init failed: ${msg}`, "error");
    return;
  }

  // Bootstrap (git init, .kata/ dir, etc. — backend handles mode-specific setup)
  await backend.bootstrap();

  // Check for crash recovery (shared — crash lock is always in .kata/)
  const crashLock = readCrashLock(base);
  if (crashLock) {
    const activityDir = join(kataRoot(base), "activity");
    const recovery = synthesizeCrashRecovery(
      base,
      crashLock.unitType,
      crashLock.unitId,
      crashLock.sessionFile,
      activityDir,
    );
    if (recovery && recovery.trace.toolCallCount > 0) {
      pendingCrashRecovery = recovery.prompt;
      ctx.ui.notify(
        `${formatCrashInfo(crashLock)}\nRecovered ${recovery.trace.toolCallCount} tool calls from crashed session. Resuming with full context.`,
        "warning",
      );
    } else {
      ctx.ui.notify(
        `${formatCrashInfo(crashLock)}\nNo session data recovered. Resuming from disk state.`,
        "warning",
      );
    }
    clearLock(base);
  }

  // Derive state
  const state = await backend.deriveState();

  if (!state.activeMilestone || state.phase === "complete") {
    const { showSmartEntry } = await import("./guided-flow.js");
    await showSmartEntry(ctx, pi, base);
    return;
  }

  if (state.phase === "blocked") {
    ctx.ui.notify(
      `Blocked: ${state.blockers?.join(", ")}. Fix and run /kata auto.`,
      "warning",
    );
    return;
  }

  if (state.phase === "pre-planning") {
    const hasContext = await backend.documentExists(
      `${state.activeMilestone.id}-CONTEXT`,
    );
    if (!hasContext) {
      const { showSmartEntry } = await import("./guided-flow.js");
      await showSmartEntry(ctx, pi, base);
      return;
    }
  }

  const lockResult = acquireSessionLock(base);
  if (!lockResult.acquired) {
    const pidSuffix = lockResult.existingPid
      ? ` Existing PID: ${lockResult.existingPid}.`
      : "";
    ctx.ui.notify(
      `Auto-mode start blocked by session lock: ${lockResult.reason}${pidSuffix}`,
      "error",
    );
    return;
  }

  active = true;
  stepActive = false;
  verbose = verboseMode;
  cmdCtx = ctx;
  basePath = base;
  lastUnit = null;
  retryCount = 0;
  autoStartTime = Date.now();
  completedUnits = [];
  currentUnit = null;
  currentMilestoneId = state.activeMilestone?.id ?? null;
  originalModelId = ctx.model?.id ?? null;

  // Initialize metrics — loads existing ledger from disk
  initMetrics(base);

  // Snapshot installed skills so we can detect new ones after research
  if (resolveSkillDiscoveryMode() !== "off") {
    snapshotSkills();
  }

  providerErrorStreak = 0;
  initDebugLog(base);
  dlog("init", {
    basePath: base,
    phase: state.phase,
    milestone: state.activeMilestone?.id ?? null,
    slice: state.activeSlice?.id ?? null,
    task: state.activeTask?.id ?? null,
    model: ctx.model?.id ?? null,
  });

  ctx.ui.setStatus("kata-auto", "auto");
  const pendingCount = state.registry.filter(
    (m) => m.status !== "complete",
  ).length;
  const scopeMsg =
    pendingCount > 1
      ? `Will loop through ${pendingCount} milestones.`
      : "Will loop until milestone complete.";
  ctx.ui.notify(`Auto-mode started. ${scopeMsg}`, "info");

  // Dispatch the first unit
  await dispatchNextUnit(ctx, pi);
}

// ─── Agent End Handler ────────────────────────────────────────────────────────

/**
 * Handle a provider/network error during auto-mode.
 * Retries with exponential backoff up to MAX_PROVIDER_RETRIES before pausing.
 */
export async function handleProviderError(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  errorMsg: string,
): Promise<void> {
  if (!active || !cmdCtx) return;

  providerErrorStreak++;
  const backoffIndex = providerErrorStreak - 1;
  const delayMs =
    providerBackoffMs[backoffIndex] ??
    providerBackoffMs[providerBackoffMs.length - 1]!;
  const delaySec = Math.round(delayMs / 1000);

  dlog("provider-error", {
    error: errorMsg,
    streak: providerErrorStreak,
    backoffSec: delaySec,
  });

  if (providerErrorStreak >= MAX_PROVIDER_RETRIES) {
    dlog("pause", { reason: "provider-error-exhausted", streak: providerErrorStreak });
    ctx.ui.notify(
      `Auto-mode paused: ${providerErrorStreak} consecutive provider errors (${errorMsg}). Run /kata auto to retry.`,
      "warning",
    );
    providerErrorStreak = 0;
    await pauseAuto(ctx, pi);
    return;
  }

  ctx.ui.notify(
    `Provider error (${errorMsg}). Retrying in ${delaySec}s (${providerErrorStreak}/${MAX_PROVIDER_RETRIES})...`,
    "warning",
  );

  await new Promise((r) => setTimeout(r, delayMs));

  if (!active) return; // user stopped during backoff

  dlog("provider-retry", { streak: providerErrorStreak });

  try {
    await handleAgentEnd(ctx, pi, /* resetStreak */ false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dlog("provider-retry-error", { error: message });
    ctx.ui.notify(`Auto-mode error during retry: ${message}`, "error");
    await stopAuto(ctx, pi);
  }
}

export async function handleAgentEnd(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  resetStreak = true,
): Promise<void> {
  if (!active || !cmdCtx) return;

  // Reset provider error streak only on normal completion, not during retries
  if (resetStreak) providerErrorStreak = 0;

  dlog("agent-end", {
    unit: currentUnit?.type ?? "none",
    id: currentUnit?.id ?? "none",
  });

  // Unit completed — clear its timeout
  clearUnitTimeout();

  // Small delay to let files settle (git commits, file writes)
  await new Promise((r) => setTimeout(r, 500));

  // Auto-commit any dirty files the LLM left behind on the current branch.
  if (currentUnit) {
    try {
      const commitMsg = autoCommitCurrentBranch(
        basePath,
        currentUnit.type,
        currentUnit.id,
      );
      if (commitMsg) {
        dlog("autocommit", { unit: currentUnit.type, id: currentUnit.id });
        ctx.ui.notify(`Auto-committed uncommitted changes.`, "info");
      }
    } catch (err) {
      dlog("autocommit-error", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal
    }
  }

  try {
    await dispatchNextUnit(ctx, pi);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dlog("dispatch-error", { error: message });
    ctx.ui.notify(`Auto-mode error: ${message}`, "error");
    await stopAuto(ctx, pi);
  }
}

// ─── Progress Widget ──────────────────────────────────────────────────────

/** Right-align helper: build a line with left content and right content. */
function rightAlign(left: string, right: string, width: number): string {
  const leftVis = visibleWidth(left);
  const rightVis = visibleWidth(right);
  const gap = Math.max(1, width - leftVis - rightVis);
  return truncateToWidth(left + " ".repeat(gap) + right, width);
}

function updateProgressWidget(
  ctx: ExtensionContext,
  unitType: string,
  unitId: string,
  state: KataState,
): void {
  if (!ctx.hasUI) return;

  const verb = unitVerb(unitType);
  const phaseLabel = unitPhaseLabel(unitType);
  const mid = state.activeMilestone;
  const slice = state.activeSlice;
  const task = state.activeTask;
  const next = peekNext(unitType, state);
  const preferredModel = resolveModelForUnit(unitType);

  ctx.ui.setWidget("kata-progress", (tui, theme) => {
    let pulseBright = true;
    let cachedLines: string[] | undefined;
    let cachedWidth: number | undefined;

    const pulseTimer = setInterval(() => {
      pulseBright = !pulseBright;
      cachedLines = undefined;
      tui.requestRender();
    }, 800);

    return {
      render(width: number): string[] {
        if (cachedLines && cachedWidth === width) return cachedLines;

        const ui = makeUI(theme, width);
        const lines: string[] = [];
        const pad = INDENT.base;

        // ── Line 1: Top bar ───────────────────────────────────────────────
        lines.push(...ui.bar());

        const dot = pulseBright
          ? theme.fg("accent", GLYPH.statusActive)
          : theme.fg("dim", GLYPH.statusPending);
        const elapsed = formatAutoElapsed();
        const headerLeft = `${pad}${dot} ${theme.fg("accent", theme.bold("Kata"))}  ${theme.fg("success", "AUTO")}`;
        const headerRight = elapsed ? theme.fg("dim", elapsed) : "";
        lines.push(rightAlign(headerLeft, headerRight, width));

        lines.push("");

        if (mid) {
          lines.push(
            truncateToWidth(`${pad}${theme.fg("dim", mid.title)}`, width),
          );
        }

        if (
          slice &&
          unitType !== "research-milestone" &&
          unitType !== "plan-milestone"
        ) {
          lines.push(
            truncateToWidth(
              `${pad}${theme.fg("text", theme.bold(`${slice.id}: ${slice.title}`))}`,
              width,
            ),
          );
        }

        lines.push("");

        const target = task ? `${task.id}: ${task.title}` : unitId;
        const actionLeft = `${pad}${theme.fg("accent", "▸")} ${theme.fg("accent", verb)}  ${theme.fg("text", target)}`;
        const phaseBadge = theme.fg("dim", phaseLabel);
        lines.push(rightAlign(actionLeft, phaseBadge, width));
        lines.push("");

        if (mid) {
          const roadmapSlices = getRoadmapSlicesSync();
          if (roadmapSlices) {
            const { done, total, activeSliceTasks } = roadmapSlices;
            const barWidth = Math.max(8, Math.min(24, Math.floor(width * 0.3)));
            const pct = total > 0 ? done / total : 0;
            const filled = Math.round(pct * barWidth);
            const bar =
              theme.fg("success", "█".repeat(filled)) +
              theme.fg("dim", "░".repeat(barWidth - filled));

            let meta = theme.fg("dim", `${done}/${total} slices`);

            if (activeSliceTasks && activeSliceTasks.total > 0) {
              meta += theme.fg(
                "dim",
                `  ·  task ${activeSliceTasks.done + 1}/${activeSliceTasks.total}`,
              );
            }

            lines.push(truncateToWidth(`${pad}${bar}  ${meta}`, width));
          }
        }

        lines.push("");

        if (next) {
          lines.push(
            truncateToWidth(
              `${pad}${theme.fg("dim", "→")} ${theme.fg("dim", `then ${next}`)}`,
              width,
            ),
          );
        }

        const hintParts: string[] = [];
        if (preferredModel) hintParts.push(preferredModel);
        hintParts.push("esc pause");
        hintParts.push("Ctrl+Alt+G dashboard");
        lines.push(...ui.hints(hintParts));

        lines.push(...ui.bar());

        cachedLines = lines;
        cachedWidth = width;
        return lines;
      },
      invalidate() {
        cachedLines = undefined;
        cachedWidth = undefined;
      },
      dispose() {
        clearInterval(pulseTimer);
      },
    };
  });
}

function formatAutoElapsed(): string {
  if (!autoStartTime) return "";
  return formatDuration(Date.now() - autoStartTime);
}

/** Cached slice progress for the widget — avoid async in render */
let cachedSliceProgress: {
  done: number;
  total: number;
  milestoneId: string;
  /** Real task progress for the active slice, if its plan file exists */
  activeSliceTasks: { done: number; total: number } | null;
} | null = null;

/**
 * Update the cached slice progress from KataState.progress if available.
 */
function updateSliceProgressFromState(
  state: KataState,
  mid: string,
): void {
  if (state.progress?.slices) {
    cachedSliceProgress = {
      done: state.progress.slices.done,
      total: state.progress.slices.total,
      milestoneId: mid,
      activeSliceTasks: state.progress?.tasks
        ? { done: state.progress.tasks.done, total: state.progress.tasks.total }
        : null,
    };
    return;
  }
  // Clear stale cache when milestone changes and no slice progress is available
  if (!cachedSliceProgress || cachedSliceProgress.milestoneId !== mid) {
    cachedSliceProgress = null;
  }
}

function getRoadmapSlicesSync(): {
  done: number;
  total: number;
  activeSliceTasks: { done: number; total: number } | null;
} | null {
  return cachedSliceProgress;
}

const SLICE_SCOPED_UNIT_TYPES = new Set([
  "research-slice",
  "plan-slice",
  "execute-task",
  "complete-slice",
  "replan-slice",
  "reassess-roadmap",
  "run-uat",
]);

function getSliceBranchTarget(
  unitType: string,
  unitId: string,
): { milestoneId: string; sliceId: string } | null {
  if (!SLICE_SCOPED_UNIT_TYPES.has(unitType)) return null;
  const [milestoneId, sliceId] = unitId.split("/");
  if (!milestoneId || !sliceId) return null;
  return { milestoneId, sliceId };
}

// ─── Dispatch Helpers ─────────────────────────────────────────────────────────

async function resolveDispatchOptions(
  be: KataBackend,
  state: KataState,
  prevUnit: { type: string; id: string } | null,
): Promise<PromptOptions> {
  const options: PromptOptions = {};
  const mid = state.activeMilestone?.id;
  const sid = state.activeSlice?.id;

  // Research-before-plan
  if (state.phase === "pre-planning" && mid) {
    if (!(await be.documentExists(`${mid}-RESEARCH`))) {
      options.dispatchResearch = "milestone";
    }
  } else if (state.phase === "planning" && sid) {
    if (!(await be.documentExists(`${sid}-RESEARCH`))) {
      options.dispatchResearch = "slice";
    }
  }

  // UAT + reassessment on slice transition
  const prevSliceKey = prevUnit?.id
    ? prevUnit.id.split("/").slice(0, 2).join("/")
    : null;
  const nextSliceKey = [mid, sid].filter(Boolean).join("/");
  const sliceChanged = prevSliceKey !== null && prevSliceKey !== nextSliceKey;

  if (sliceChanged && prevSliceKey) {
    const [, prevSid] = prevSliceKey.split("/");
    if (prevSid) {
      const prefs = loadEffectiveKataPreferences()?.preferences;
      if (prefs?.uat_dispatch) {
        const hasUat = await be.documentExists(`${prevSid}-UAT`);
        const hasResult = await be.documentExists(`${prevSid}-UAT-RESULT`);
        if (hasUat && !hasResult) options.uatSliceId = prevSid;
      }
      if (!options.uatSliceId) {
        const hasSummary = await be.documentExists(`${prevSid}-SUMMARY`);
        const hasAssessment = await be.documentExists(`${prevSid}-ASSESSMENT`);
        if (hasSummary && !hasAssessment) options.reassessSliceId = prevSid;
      }
    }
  }

  return options;
}

// ─── PR Gate Helper ───────────────────────────────────────────────────────────

/**
 * Run the PR gate for a completed slice. Returns "handled" if the gate took
 * action (created PR, notified user, or merged), "skipped" if PR lifecycle
 * is disabled or conditions don't apply.
 *
 * Extracted so it can be called from both the normal step-9 location AND the
 * early-exit at step 3 (when Linear auto-closes the last slice and phase
 * jumps straight to "complete").
 */
async function runPrGate(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  be: KataBackend,
  completedUnit: { type: string; id: string },
  completedMid: string,
  completedSid: string,
): Promise<"handled" | "skipped"> {
  const postPrefs = loadEffectiveKataPreferences()?.preferences;
  const postDecision = decidePostCompleteSliceAction(postPrefs?.pr);

  if (postDecision === "auto-create-and-pause") {
    try {
      const dashData = await be.loadDashboardData();
      const sliceTitle =
        dashData.sliceViews?.find((s) => s.id === completedSid)?.title ??
        completedSid;

      const prCtx = await be.preparePrContext(completedMid, completedSid);
      const prResult = await runCreatePr({
        cwd: be.gitRoot,
        milestoneId: completedMid,
        sliceId: completedSid,
        baseBranch: postPrefs?.pr?.base_branch ?? "main",
        title: sliceTitle,
        linearDocuments: prCtx.documents,
      });
      if (prResult.ok) {
        await stopAuto(ctx, pi);
        ctx.ui.notify(
          `PR created: ${prResult.url}\n\nReview and merge the PR, then run /kata auto to continue.`,
          "info",
        );
        return "handled";
      }
      // PR failed — pause and ask the agent to help the user recover
      await stopAuto(ctx, pi);
      pi.sendMessage(
        {
          content: [
            `PR auto-create failed for slice ${completedSid}. The code is committed on branch \`${prCtx.branch}\` — no work was lost.`,
            ``,
            `**Error:** ${prResult.error}`,
            ``,
            `Help the user resolve this. Common causes:`,
            `- No git remote configured → offer to set up a GitHub remote (\`gh repo create\` or \`git remote add origin\`)`,
            `- \`gh\` CLI not authenticated → guide them through \`gh auth login\``,
            `- Branch not pushed → push the branch and retry`,
            `- Network/rate limit → suggest waiting and retrying with \`/kata pr create\``,
            ``,
            `Once resolved, the user can run \`/kata pr create\` to create the PR manually, then \`/kata auto\` to continue.`,
          ].join("\n"),
        },
        { triggerTurn: true },
      );
      return "handled";
    } catch (err) {
      // preparePrContext failed — pause and surface the error conversationally
      await stopAuto(ctx, pi);
      const msg = err instanceof Error ? err.message : String(err);
      pi.sendMessage(
        {
          content: [
            `PR preparation failed for the completed slice. The code is committed — no work was lost.`,
            ``,
            `**Error:** ${msg}`,
            ``,
            `Help the user resolve this, then they can run \`/kata pr create\` followed by \`/kata auto\` to continue.`,
          ].join("\n"),
        },
        { triggerTurn: true },
      );
      return "handled";
    }
  } else if (postDecision === "skip-notify") {
    ctx.ui.notify(
      `Slice complete. PR lifecycle is enabled — run /kata pr create to open a PR, then merge before continuing.\nAuto-mode paused.`,
      "info",
    );
    await stopAuto(ctx, pi);
    return "handled";
  } else if (postDecision === "legacy-squash-merge") {
    // legacy-squash-merge: file-mode only — merge slice branch to main
    try {
      const legacyDash = await be.loadDashboardData();
      const legacyTitle =
        legacyDash.sliceViews?.find((s) => s.id === completedSid)?.title ??
        completedSid;
      switchToMain(be.gitRoot);
      const mergeResult = mergeSliceToMain(
        be.gitRoot,
        completedMid,
        completedSid,
        legacyTitle,
      );
      ctx.ui.notify(`Merged ${mergeResult.branch} → main.`, "info");
    } catch (error) {
      await stopAuto(ctx, pi);
      ctx.ui.notify(
        `Slice merge failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      return "handled";
    }
  }

  return "skipped";
}

// ─── Core Loop ────────────────────────────────────────────────────────────────

async function dispatchNextUnit(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (!active || !cmdCtx || !backend) return;

  // Invalidate cached state before each dispatch to avoid stale re-dispatches
  backend.invalidateStateCache?.();

  // 1. Derive state (backend handles file vs Linear)
  const state = await backend.deriveState();
  let mid = state.activeMilestone?.id;
  const midTitle = state.activeMilestone?.title;

  dlog("derive-state", {
    phase: state.phase,
    milestone: mid ?? null,
    slice: state.activeSlice?.id ?? null,
    task: state.activeTask?.id ?? null,
  });

  // 2. Milestone transition detection
  if (mid && currentMilestoneId && mid !== currentMilestoneId) {
    ctx.ui.notify(
      `Milestone ${currentMilestoneId} complete. Advancing to ${mid}: ${midTitle}.`,
      "info",
    );
    lastUnit = null;
    retryCount = 0;
  }
  if (mid) currentMilestoneId = mid;

  // 3. Complete/blocked/no-milestone checks
  //
  // ── Auto-close recovery ──────────────────────────────────────────────
  // Linear can auto-close a parent issue when all its children reach a
  // terminal state (team setting "Auto-close parent issues"). When this
  // happens for the last task in a slice, the slice issue transitions to
  // Done immediately — skipping the complete-slice unit that writes the
  // slice summary and triggers the PR gate.
  //
  // Detection: the previous unit was execute-task, the phase jumped to
  // "complete" or "completing-milestone", and the slice summary document
  // doesn't exist yet. In that case, override the derived state to force
  // a complete-slice dispatch before stopping.
  //
  // After complete-slice runs, the next dispatch will hit this block
  // again (phase is still "complete"). At that point, prev unit is
  // complete-slice, so we run the PR gate before stopping.
  if (
    !mid ||
    state.phase === "complete" ||
    state.phase === "completing-milestone"
  ) {
    // Recovery path A: force complete-slice if Linear auto-closed the slice
    if (
      currentUnit?.type === "execute-task" &&
      backend &&
      currentUnit.id.split("/").length >= 2
    ) {
      const parts = currentUnit.id.split("/");
      const recoveryMid = parts[0]!;
      const recoverySid = parts[1]!;
      const hasSummary = await backend.documentExists(`${recoverySid}-SUMMARY`);
      if (!hasSummary) {
        dlog("auto-close-recovery", {
          phase: "force-complete-slice",
          mid: recoveryMid,
          sid: recoverySid,
          reason: "linear-auto-closed-parent",
        });
        ctx.ui.notify(
          `Linear auto-closed slice ${recoverySid} when its last task completed. Dispatching complete-slice.`,
          "info",
        );
        // Override state so the dispatch logic builds a complete-slice prompt.
        // Titles are cosmetic — the agent reads the plan document for details.
        const registryEntry = state.registry?.find(
          (m) => m.id === recoveryMid,
        );
        state.phase = "summarizing";
        state.activeMilestone = {
          id: recoveryMid,
          title: registryEntry?.title ?? recoveryMid,
        };
        state.activeSlice = { id: recoverySid, title: recoverySid };
        state.activeTask = null;
        // Update mid to reflect the override — stale mid would cause
        // the normal stop block below to fire and undo the recovery.
        mid = recoveryMid;
        // Fall through to dispatch logic — don't stop
      }
    }

    // Recovery path B: run PR gate before stopping after complete-slice
    // When the milestone is the last one, phase is "complete" after
    // complete-slice finishes. The normal PR gate at step 9 never runs
    // because this early-exit fires first. Run it here instead.
    if (
      (state.phase === "complete" || state.phase === "completing-milestone" || !mid) &&
      currentUnit &&
      (currentUnit.type === "complete-slice" ||
        currentUnit.type === "linear-summarizing")
    ) {
      // Finalize the current unit before the PR gate may return early
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(
        ctx,
        currentUnit.type,
        currentUnit.id,
        currentUnit.startedAt,
        modelId,
      );
      saveActivityLog(ctx, basePath, currentUnit.type, currentUnit.id);

      const [completedMid, completedSid] = currentUnit.id.split("/");
      if (completedMid && completedSid) {
        const gateResult = await runPrGate(
          ctx,
          pi,
          backend!,
          currentUnit,
          completedMid,
          completedSid,
        );
        if (gateResult === "handled") {
          // PR gate took action (created PR, notified, or merged) — stop
          return;
        }
        // "skipped" — fall through to normal stop
      }
    }

    // Normal stop: no recovery needed or recovery already applied above
    if (state.phase === "complete" || state.phase === "completing-milestone" || !mid) {
      if (currentUnit) {
        const modelId = ctx.model?.id ?? "unknown";
        snapshotUnitMetrics(
          ctx,
          currentUnit.type,
          currentUnit.id,
          currentUnit.startedAt,
          modelId,
        );
        saveActivityLog(ctx, basePath, currentUnit.type, currentUnit.id);
      }
      await stopAuto(ctx, pi);
      return;
    }
  }

  if (state.phase === "blocked") {
    if (currentUnit) {
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(
        ctx,
        currentUnit.type,
        currentUnit.id,
        currentUnit.startedAt,
        modelId,
      );
      saveActivityLog(ctx, basePath, currentUnit.type, currentUnit.id);
    }
    await stopAuto(ctx, pi);
    ctx.ui.notify(
      `Blocked: ${state.blockers.join(", ")}. Fix and run /kata auto.`,
      "warning",
    );
    return;
  }

  // 4. Dispatch-time routing
  const dispatchOptions = await resolveDispatchOptions(backend, state, currentUnit);

  // 5. Build prompt (backend handles file-inline vs Linear instructions)
  const prompt = await backend.buildPrompt(state.phase, state, dispatchOptions);
  if (!prompt) {
    if (currentUnit) {
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(
        ctx,
        currentUnit.type,
        currentUnit.id,
        currentUnit.startedAt,
        modelId,
      );
      saveActivityLog(ctx, basePath, currentUnit.type, currentUnit.id);
    }
    await stopAuto(ctx, pi);
    ctx.ui.notify(
      `Unexpected phase: ${state.phase}. Stopping auto-mode.`,
      "warning",
    );
    return;
  }

  // 6. Derive unit type and ID
  const unitType = deriveUnitType(state, dispatchOptions);
  const unitId = deriveUnitId(state, dispatchOptions);

  // Ensure slice-scoped units always execute on the correct slice branch.
  const sliceBranchTarget = getSliceBranchTarget(unitType, unitId);
  if (sliceBranchTarget) {
    try {
      const created = ensureSliceBranch(
        basePath,
        sliceBranchTarget.milestoneId,
        sliceBranchTarget.sliceId,
      );
      dlog("ensure-slice-branch", {
        unit: unitType,
        id: unitId,
        milestone: sliceBranchTarget.milestoneId,
        slice: sliceBranchTarget.sliceId,
        created,
      });
    } catch (error) {
      await stopAuto(ctx, pi);
      ctx.ui.notify(
        `Failed to prepare slice branch for ${unitId}: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      return;
    }
  }

  dlog("dispatch", {
    unit: unitType,
    id: unitId,
    phase: state.phase,
    promptLen: prompt.length,
  });

  ctx.ui.notify(`Auto-mode: ${unitType} — ${unitId}`, "info");

  // 7. Stuck detection
  if (lastUnit && lastUnit.type === unitType && lastUnit.id === unitId) {
    retryCount++;
    dlog("retry", { unit: unitType, id: unitId, retryCount });
    if (retryCount > MAX_RETRIES) {
      if (currentUnit) {
        const modelId = ctx.model?.id ?? "unknown";
        snapshotUnitMetrics(
          ctx,
          currentUnit.type,
          currentUnit.id,
          currentUnit.startedAt,
          modelId,
        );
      }
      saveActivityLog(ctx, basePath, lastUnit.type, lastUnit.id);

      await stopAuto(ctx, pi);
      ctx.ui.notify(
        `Stuck: ${unitType} ${unitId} fired ${retryCount + 1} times without durable progress. Check Linear artifacts and activity logs.`,
        "error",
      );
      return;
    }
    ctx.ui.notify(
      `${unitType} ${unitId} didn't produce expected artifact. Retrying (${retryCount}/${MAX_RETRIES}).`,
      "warning",
    );
  } else {
    retryCount = 0;
  }

  // 8. Snapshot + activity log for PREVIOUS unit
  if (currentUnit) {
    const modelId = ctx.model?.id ?? "unknown";
    snapshotUnitMetrics(
      ctx,
      currentUnit.type,
      currentUnit.id,
      currentUnit.startedAt,
      modelId,
    );
    saveActivityLog(ctx, basePath, currentUnit.type, currentUnit.id);
    completedUnits.push({
      type: currentUnit.type,
      id: currentUnit.id,
      startedAt: currentUnit.startedAt,
      finishedAt: Date.now(),
    });
    clearUnitRuntimeRecord(basePath, currentUnit.type, currentUnit.id);
  }

  // 9. PR gate on slice transition
  const prevSliceKey = currentUnit?.id
    ? currentUnit.id.split("/").slice(0, 2).join("/")
    : null;
  const nextSliceKey = unitId.split("/").slice(0, 2).join("/");
  const sliceChanged =
    prevSliceKey !== null && prevSliceKey !== nextSliceKey;
  const wasSummarizing =
    currentUnit?.type === "complete-slice" ||
    currentUnit?.type === "linear-summarizing";
  const wasCompletingMilestone =
    currentUnit?.type === "complete-milestone" ||
    currentUnit?.type === "linear-completing-milestone";

  if (wasSummarizing || wasCompletingMilestone || sliceChanged) {
    const [completedMid, completedSid] = currentUnit!.id.split("/");
    if (completedMid && completedSid && !wasCompletingMilestone) {
      const gateResult = await runPrGate(
        ctx,
        pi,
        backend,
        currentUnit!,
        completedMid,
        completedSid,
      );
      if (gateResult === "handled") return;
      // "skipped" — fall through to dispatch
    }
  }

  // 10. Budget ceiling
  const prefs = loadEffectiveKataPreferences()?.preferences;
  const budgetCeiling = prefs?.budget_ceiling;
  if (budgetCeiling !== undefined) {
    const currentLedger = getLedger();
    const totalCost = currentLedger
      ? getProjectTotals(currentLedger.units).cost
      : 0;
    if (totalCost >= budgetCeiling) {
      ctx.ui.notify(
        `Budget ceiling ${formatCost(budgetCeiling)} reached (spent ${formatCost(totalCost)}). Pausing auto-mode — /kata auto to continue.`,
        "warning",
      );
      await pauseAuto(ctx, pi);
      return;
    }
  }

  // 11. Update tracking state
  lastUnit = { type: unitType, id: unitId };
  currentUnit = { type: unitType, id: unitId, startedAt: Date.now() };

  // 12. Unit runtime record
  writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
    phase: "dispatched",
    wrapupWarningSent: false,
    timeoutAt: null,
    lastProgressAt: currentUnit.startedAt,
    progressCount: 0,
    lastProgressKind: "dispatch",
  });

  // 13. Status + progress widget
  ctx.ui.setStatus("kata-auto", "auto");
  if (mid) {
    updateSliceProgressFromState(state, mid);
  }
  updateProgressWidget(ctx, unitType, unitId, state);

  // 14. Fresh session
  const result = await cmdCtx!.newSession();
  if (result.cancelled) {
    await stopAuto(ctx, pi);
    ctx.ui.notify("New session cancelled — auto-mode stopped.", "warning");
    return;
  }

  // 16. Lock file
  const sessionFile = ctx.sessionManager.getSessionFile();
  writeLock(basePath, unitType, unitId, completedUnits.length, sessionFile);
  updateSessionLock(
    basePath,
    unitType,
    unitId,
    completedUnits.length,
    sessionFile,
  );

  // 17. Crash recovery + retry diagnostic
  let finalPrompt = prompt;
  if (pendingCrashRecovery) {
    finalPrompt = `${pendingCrashRecovery}\n\n---\n\n${finalPrompt}`;
    pendingCrashRecovery = null;
  } else if (retryCount > 0) {
    const diagnostic = getDeepDiagnostic(basePath);
    if (diagnostic) {
      finalPrompt = `**RETRY — your previous attempt did not produce the required artifact.**\n\nDiagnostic from previous attempt:\n${diagnostic}\n\nFix whatever went wrong and make sure you write the required file this time.\n\n---\n\n${finalPrompt}`;
    }
  }

  // 18. Model switching
  const switchResult = resolveModelSwitch(
    unitType,
    ctx.modelRegistry.getAll().map((m) => m.id),
    ctx.model?.id,
  );
  if (switchResult.action === "switch") {
    const model = ctx.modelRegistry.getAll().find((m) => m.id === switchResult.preferredModelId);
    if (model) {
      const ok = await pi.setModel(model);
      if (ok) ctx.ui.notify(`Model: ${switchResult.preferredModelId}`, "info");
    }
  } else if (switchResult.action === "not-found") {
    ctx.ui.notify(
      `Model preference '${switchResult.preferredModelId}' not found in registry — using current model. Available: ${switchResult.availableModels.slice(0, 5).join(", ")}...`,
      "warning",
    );
  }
  if (switchResult.statusLabel) {
    ctx.ui.setStatus("kata-auto", switchResult.statusLabel);
  }

  // 19. Timeout supervision
  clearUnitTimeout();
  const supervisor = resolveAutoSupervisorConfig();
  const { softMs: softTimeoutMs, idleMs: idleTimeoutMs, hardMs: hardTimeoutMs } =
    computeSupervisorTimeouts(supervisor);

  wrapupWarningHandle = setTimeout(() => {
    wrapupWarningHandle = null;
    if (!active || !currentUnit) return;
    writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
      phase: "wrapup-warning-sent",
      wrapupWarningSent: true,
    });
    pi.sendMessage(
      {
        customType: "kata-auto-wrapup",
        display: verbose,
        content: [
          "**TIME BUDGET WARNING — keep going only if progress is real.**",
          "This unit crossed the soft time budget.",
          "If you are making progress, continue. If not, switch to wrap-up mode now:",
          "1. rerun the minimal required verification",
          "2. write or update the required durable artifacts",
          "3. mark task or slice state on disk correctly",
          "4. leave precise resume notes if anything remains unfinished",
        ].join("\n"),
      },
      { triggerTurn: true },
    );
  }, softTimeoutMs);

  idleWatchdogHandle = setInterval(async () => {
    if (!active || !currentUnit) return;
    const runtime = readUnitRuntimeRecord(basePath, unitType, unitId);
    if (!runtime) return;
    if (Date.now() - runtime.lastProgressAt < idleTimeoutMs) return;

    if (currentUnit) {
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(
        ctx,
        currentUnit.type,
        currentUnit.id,
        currentUnit.startedAt,
        modelId,
      );
    }
    saveActivityLog(ctx, basePath, unitType, unitId);

    const recovery = await recoverTimedOutUnit(
      ctx,
      pi,
      unitType,
      unitId,
      "idle",
    );
    if (recovery === "recovered") return;

    writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
      phase: "paused",
    });
    ctx.ui.notify(
      `Unit ${unitType} ${unitId} made no meaningful progress for ${supervisor.idle_timeout_minutes}min. Pausing auto-mode.`,
      "warning",
    );
    await pauseAuto(ctx, pi);
  }, 15000);

  unitTimeoutHandle = setTimeout(async () => {
    unitTimeoutHandle = null;
    if (!active) return;
    if (currentUnit) {
      writeUnitRuntimeRecord(
        basePath,
        unitType,
        unitId,
        currentUnit.startedAt,
        {
          phase: "timeout",
          timeoutAt: Date.now(),
        },
      );
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(
        ctx,
        currentUnit.type,
        currentUnit.id,
        currentUnit.startedAt,
        modelId,
      );
    }
    saveActivityLog(ctx, basePath, unitType, unitId);

    const recovery = await recoverTimedOutUnit(
      ctx,
      pi,
      unitType,
      unitId,
      "hard",
    );
    if (recovery === "recovered") return;

    ctx.ui.notify(
      `Unit ${unitType} ${unitId} exceeded ${supervisor.hard_timeout_minutes}min hard timeout. Pausing auto-mode.`,
      "warning",
    );
    await pauseAuto(ctx, pi);
  }, hardTimeoutMs);

  // 20. Dispatch
  pi.sendMessage(
    { customType: "kata-auto", content: finalPrompt, display: verbose },
    { triggerTurn: true },
  );

  // For non-artifact-driven UAT types, pause auto-mode after sending the prompt.
  if (dispatchOptions.uatSliceId && prefs?.uat_dispatch) {
    // Check UAT type to decide if we should pause for human execution
    const uatContent = await backend.readDocument(`${dispatchOptions.uatSliceId}-UAT`);
    if (uatContent) {
      const { extractUatType } = await import("./files.js");
      const uatType = extractUatType(uatContent) ?? "human-experience";
      if (uatType !== "artifact-driven") {
        ctx.ui.notify(
          "UAT requires human execution. Auto-mode will pause after this unit writes the result file.",
          "info",
        );
        await pauseAuto(ctx, pi);
      }
    }
  }
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

async function recoverTimedOutUnit(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  unitType: string,
  unitId: string,
  reason: "idle" | "hard",
): Promise<"recovered" | "paused"> {
  if (!currentUnit) return "paused";

  const runtime = readUnitRuntimeRecord(basePath, unitType, unitId);
  const recoveryAttempts = runtime?.recoveryAttempts ?? 0;
  const maxRecoveryAttempts = reason === "idle" ? 2 : 1;

  if (recoveryAttempts < maxRecoveryAttempts) {
    const isEscalation = recoveryAttempts > 0;
    writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
      phase: "recovered",
      recoveryAttempts: recoveryAttempts + 1,
      lastRecoveryReason: reason,
      lastProgressAt: Date.now(),
      progressCount: (runtime?.progressCount ?? 0) + 1,
      lastProgressKind:
        reason === "idle" ? "idle-recovery-retry" : "hard-recovery-retry",
    });

    const steeringLines = isEscalation
      ? [
          `**FINAL ${reason === "idle" ? "IDLE" : "HARD TIMEOUT"} RECOVERY — last chance before pause.**`,
          `You are still executing ${unitType} ${unitId}.`,
          `Recovery attempt ${recoveryAttempts + 1} of ${maxRecoveryAttempts}.`,
          "Immediately finish and persist durable outputs in Linear documents/issues.",
          "If full completion is impossible, write a partial artifact and explicitly describe the blocker.",
        ]
      : [
          `**${reason === "idle" ? "IDLE" : "HARD TIMEOUT"} RECOVERY — stay in auto-mode.**`,
          `You are still executing ${unitType} ${unitId}.`,
          `Recovery attempt ${recoveryAttempts + 1} of ${maxRecoveryAttempts}.`,
          "Stop broad exploration and write the required durable output now.",
          "If blocked, record the blocker explicitly instead of going silent.",
        ];

    pi.sendMessage(
      {
        customType: "kata-auto-timeout-recovery",
        display: verbose,
        content: steeringLines.join("\n"),
      },
      { triggerTurn: true, deliverAs: "steer" },
    );

    ctx.ui.notify(
      `${reason === "idle" ? "Idle" : "Timeout"} recovery: steering ${unitType} ${unitId} (attempt ${recoveryAttempts + 1}/${maxRecoveryAttempts}).`,
      "warning",
    );
    return "recovered";
  }

  writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
    phase: "paused",
    recoveryAttempts: recoveryAttempts + 1,
    lastRecoveryReason: reason,
  });
  return "paused";
}
