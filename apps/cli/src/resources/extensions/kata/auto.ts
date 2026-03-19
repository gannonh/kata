/**
 * Kata Auto Mode — Fresh Session Per Unit
 *
 * Unified dispatch loop backed by KataBackend. No isLinearMode() forks.
 * The backend (FileBackend or LinearBackend) handles mode-specific state
 * derivation, prompt building, and document I/O.
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
  clearUnitRuntimeRecord,
  formatExecuteTaskRecoveryStatus,
  inspectExecuteTaskDurability,
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
  formatPrAutoCreateFailure,
} from "./pr-auto.js";
import { runCreatePr } from "../pr-lifecycle/pr-runner.js";
import {
  validatePlanBoundary,
  validateExecuteBoundary,
  validateCompleteBoundary,
  formatValidationIssues,
} from "./observability-validator.js";
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
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  kataRoot,
  resolveMilestoneFile,
  resolveSliceFile,
  resolveSlicePath,
  resolveMilestonePath,
  resolveDir,
  resolveTasksDir,
  resolveTaskFiles,
  relMilestoneFile,
  relSliceFile,
  relSlicePath,
  relMilestonePath,
  milestonesDir,
  buildMilestoneFileName,
  buildSliceFileName,
  buildTaskFileName,
} from "./paths.js";
import {
  loadFile,
  parseRoadmap,
  parsePlan,
} from "./files.js";
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

// ─── State ────────────────────────────────────────────────────────────────────

let active = false;
let paused = false;
let verbose = false;
let cmdCtx: ExtensionCommandContext | null = null;
let basePath = "";
let backend: KataBackend | null = null;

/** Track last dispatched unit to detect stuck loops */
let lastUnit: { type: string; id: string } | null = null;
let retryCount = 0;
const MAX_RETRIES = 1;

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
  if (basePath) clearLock(basePath);
  clearSkillSnapshot();

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
  if (basePath) clearLock(basePath);
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
    paused = false;
    active = true;
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

  active = true;
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

export async function handleAgentEnd(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (!active || !cmdCtx) return;

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
        ctx.ui.notify(`Auto-committed uncommitted changes.`, "info");
      }
    } catch {
      // Non-fatal
    }
  }

  try {
    await dispatchNextUnit(ctx, pi);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Auto-mode error: ${message}`, "error");
    await stopAuto(ctx, pi);
  }
}

// ─── Progress Widget ──────────────────────────────────────────────────────


function peekNext(unitType: string, state: KataState): string {
  const sid = state.activeSlice?.id ?? "";
  switch (unitType) {
    case "research-milestone":
      return "plan milestone roadmap";
    case "plan-milestone":
      return "research first slice";
    case "research-slice":
      return `plan ${sid}`;
    case "plan-slice":
      return "execute first task";
    case "execute-task":
      return `continue ${sid}`;
    case "complete-slice":
      return "reassess roadmap";
    case "replan-slice":
      return `re-execute ${sid}`;
    case "reassess-roadmap":
      return "advance to next slice";
    case "run-uat":
      return "reassess roadmap";
    default:
      return "";
  }
}

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

function updateSliceProgressCache(
  base: string,
  mid: string,
  activeSid?: string,
): void {
  try {
    const roadmapFile = resolveMilestoneFile(base, mid, "ROADMAP");
    if (!roadmapFile) return;
    const content = readFileSync(roadmapFile, "utf-8");
    const roadmap = parseRoadmap(content);

    let activeSliceTasks: { done: number; total: number } | null = null;
    if (activeSid) {
      try {
        const planFile = resolveSliceFile(base, mid, activeSid, "PLAN");
        if (planFile && existsSync(planFile)) {
          const planContent = readFileSync(planFile, "utf-8");
          const plan = parsePlan(planContent);
          activeSliceTasks = {
            done: plan.tasks.filter((t) => t.done).length,
            total: plan.tasks.length,
          };
        }
      } catch {
        // Non-fatal — just omit task count
      }
    }

    cachedSliceProgress = {
      done: roadmap.slices.filter((s) => s.done).length,
      total: roadmap.slices.length,
      milestoneId: mid,
      activeSliceTasks,
    };
  } catch {
    // Non-fatal — widget just won't show progress bar
  }
}

/**
 * Update the cached slice progress from KataState.progress if available.
 * Used when the backend provides progress data directly (e.g., LinearBackend).
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

function deriveUnitType(state: KataState, options: PromptOptions): string {
  if (options.uatSliceId) return "run-uat";
  if (options.reassessSliceId) return "reassess-roadmap";
  if (options.dispatchResearch === "milestone") return "research-milestone";
  if (options.dispatchResearch === "slice") return "research-slice";
  switch (state.phase) {
    case "pre-planning":
      return "plan-milestone";
    case "planning":
      return "plan-slice";
    case "executing":
    case "verifying":
      return "execute-task";
    case "summarizing":
      return "complete-slice";
    case "completing-milestone":
      return "complete-milestone";
    case "replanning-slice":
      return "replan-slice";
    default:
      return `unknown-${state.phase}`;
  }
}

function deriveUnitId(state: KataState, options?: PromptOptions): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  // UAT and reassessment target the *previous* (completed) slice, not the
  // now-active one. Use the dispatch option IDs when available so the unit
  // key correctly identifies the work being done.
  const sid = options?.uatSliceId ?? options?.reassessSliceId ?? state.activeSlice?.id;
  const tid = state.activeTask?.id;
  if (tid && sid && !options?.uatSliceId && !options?.reassessSliceId) return `${mid}/${sid}/${tid}`;
  if (sid) return `${mid}/${sid}`;
  return mid;
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
  const mid = state.activeMilestone?.id;
  const midTitle = state.activeMilestone?.title;

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
  if (!mid || state.phase === "complete") {
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

  ctx.ui.notify(`Auto-mode: ${unitType} — ${unitId}`, "info");

  await emitObservabilityWarnings(ctx, unitType, unitId);

  // 7. Stuck detection
  if (lastUnit && lastUnit.type === unitType && lastUnit.id === unitId) {
    retryCount++;
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

      const expected = diagnoseExpectedArtifact(unitType, unitId, basePath);
      await stopAuto(ctx, pi);
      ctx.ui.notify(
        `Stuck: ${unitType} ${unitId} fired ${retryCount + 1} times. Expected artifact not found.${expected ? `\n   Expected: ${expected}` : ""}\n   Check .kata/ and activity logs.`,
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
    const postPrefs = loadEffectiveKataPreferences()?.preferences;
    const postDecision = decidePostCompleteSliceAction(postPrefs?.pr);

    if (postDecision === "auto-create-and-pause" && !wasCompletingMilestone) {
      const [completedMid, completedSid] = currentUnit!.id.split("/");
      if (!completedSid) {
        // Milestone-only ID — no slice to create a PR for; fall through
        // to let the dispatch loop continue instead of stalling.
      } else {
        try {
          // Resolve human-readable slice title from dashboard data
          const dashData = await backend.loadDashboardData();
          const sliceTitle = dashData.sliceViews
            ?.find((s) => s.id === completedSid)?.title ?? completedSid!;

          const prCtx = await backend.preparePrContext(completedMid!, completedSid!);
          const prResult = await runCreatePr({
            cwd: backend.gitRoot,
            milestoneId: completedMid!,
            sliceId: completedSid!,
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
            return;
          }
          // PR failed — pause and ask the agent to help the user recover
          await stopAuto(ctx, pi);
          const diagnostic = formatPrAutoCreateFailure({
            phase: prResult.phase,
            error: prResult.error,
            hint: prResult.hint ?? "",
          });
          pi.sendMessage({
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
          }, { triggerTurn: true });
          return;
        } catch (err) {
          // preparePrContext failed — pause and surface the error conversationally
          await stopAuto(ctx, pi);
          const msg = err instanceof Error ? err.message : String(err);
          pi.sendMessage({
            content: [
              `PR preparation failed for the completed slice. The code is committed — no work was lost.`,
              ``,
              `**Error:** ${msg}`,
              ``,
              `Help the user resolve this, then they can run \`/kata pr create\` followed by \`/kata auto\` to continue.`,
            ].join("\n"),
          }, { triggerTurn: true });
          return;
        }
      }
    } else if (postDecision === "skip-notify") {
      ctx.ui.notify(
        `Slice complete. PR lifecycle is enabled — run /kata pr create to open a PR, then merge before continuing.\nAuto-mode paused.`,
        "info",
      );
      await stopAuto(ctx, pi);
      return;
    } else if (postDecision === "legacy-squash-merge" && currentUnit) {
      // legacy-squash-merge: file-mode only — merge slice branch to main
      const [cMid, cSid] = currentUnit.id.split("/");
      if (cMid && cSid) {
        try {
          const legacyDash = await backend.loadDashboardData();
          const legacyTitle = legacyDash.sliceViews
            ?.find((s) => s.id === cSid)?.title ?? cSid;
          switchToMain(backend.gitRoot);
          const mergeResult = mergeSliceToMain(backend.gitRoot, cMid, cSid, legacyTitle);
          ctx.ui.notify(`Merged ${mergeResult.branch} → main.`, "info");
        } catch (error) {
          ctx.ui.notify(
            `Slice merge failed: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        }
      }
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
    // Try file-based cache first (works for FileBackend), fall back to state.progress
    updateSliceProgressCache(basePath, mid, state.activeSlice?.id);
    if (!cachedSliceProgress) {
      updateSliceProgressFromState(state, mid);
    }
  }
  updateProgressWidget(ctx, unitType, unitId, state);

  // 14. ensurePreconditions — file-mode creates directories and branches
  try {
    ensurePreconditions(unitType, unitId, basePath, state);
  } catch {
    /* non-fatal */
  }

  // 15. Fresh session
  const result = await cmdCtx!.newSession();
  if (result.cancelled) {
    await stopAuto(ctx, pi);
    ctx.ui.notify("New session cancelled — auto-mode stopped.", "warning");
    return;
  }

  // 16. Lock file
  const sessionFile = ctx.sessionManager.getSessionFile();
  writeLock(basePath, unitType, unitId, completedUnits.length, sessionFile);

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
  const preferredModelId = resolveModelForUnit(unitType);
  if (preferredModelId) {
    const allModels = ctx.modelRegistry.getAll();
    const model = allModels.find((m) => m.id === preferredModelId);
    if (model) {
      const ok = await pi.setModel(model);
      if (ok) ctx.ui.notify(`Model: ${preferredModelId}`, "info");
    } else {
      ctx.ui.notify(
        `Model preference '${preferredModelId}' not found in registry — using current model. Available: ${allModels.map((m) => m.id).slice(0, 5).join(", ")}...`,
        "warning",
      );
    }
    if (preferredModelId && preferredModelId === ctx.state.selectedModel?.id) {
      ctx.ui.setStatus("kata-auto", `auto · ${preferredModelId}`);
    } else {
      ctx.ui.setStatus("kata-auto", "auto");
    }
  }

  // 19. Timeout supervision
  clearUnitTimeout();
  const supervisor = resolveAutoSupervisorConfig();
  const softTimeoutMs = supervisor.soft_timeout_minutes * 60 * 1000;
  const idleTimeoutMs = supervisor.idle_timeout_minutes * 60 * 1000;
  const hardTimeoutMs = supervisor.hard_timeout_minutes * 60 * 1000;

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

// ─── Preconditions ────────────────────────────────────────────────────────────

/**
 * Ensure directories, branches, and other prerequisites exist before
 * dispatching a unit. The LLM should never need to mkdir or git checkout.
 */
function ensurePreconditions(
  unitType: string,
  unitId: string,
  base: string,
  _state: KataState,
): void {
  const parts = unitId.split("/");
  const mid = parts[0]!;

  // Always ensure milestone dir exists
  const mDir = resolveMilestonePath(base, mid);
  if (!mDir) {
    const newDir = join(milestonesDir(base), mid);
    mkdirSync(join(newDir, "slices"), { recursive: true });
  }

  // For slice-level units, ensure slice dir exists
  if (parts.length >= 2) {
    const sid = parts[1]!;

    // Re-resolve milestone path after potential creation
    const mDirResolved = resolveMilestonePath(base, mid);
    if (mDirResolved) {
      const slicesDir = join(mDirResolved, "slices");
      const sDir = resolveDir(slicesDir, sid);
      if (!sDir) {
        // Create slice dir with bare ID
        const newSliceDir = join(slicesDir, sid);
        mkdirSync(join(newSliceDir, "tasks"), { recursive: true });
      } else {
        // Ensure tasks/ subdir exists
        const tasksDir = join(slicesDir, sDir, "tasks");
        if (!existsSync(tasksDir)) {
          mkdirSync(tasksDir, { recursive: true });
        }
      }
    }
  }

  if (
    [
      "research-slice",
      "plan-slice",
      "execute-task",
      "complete-slice",
      "replan-slice",
    ].includes(unitType) &&
    parts.length >= 2
  ) {
    const sid = parts[1]!;
    ensureSliceBranch(base, mid, sid);
  }
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

async function emitObservabilityWarnings(
  ctx: ExtensionContext,
  unitType: string,
  unitId: string,
): Promise<void> {
  const parts = unitId.split("/");
  const mid = parts[0];
  const sid = parts[1];
  const tid = parts[2];

  if (!mid || !sid) return;

  let issues = [] as Awaited<ReturnType<typeof validatePlanBoundary>>;

  if (unitType === "plan-slice") {
    issues = await validatePlanBoundary(basePath, mid, sid);
  } else if (unitType === "execute-task" && tid) {
    issues = await validateExecuteBoundary(basePath, mid, sid, tid);
  } else if (unitType === "complete-slice") {
    issues = await validateCompleteBoundary(basePath, mid, sid);
  }

  if (issues.length === 0) return;

  ctx.ui.notify(
    `Observability check (${unitType}) found ${issues.length} warning${issues.length === 1 ? "" : "s"}:\n${formatValidationIssues(issues)}`,
    "warning",
  );
}

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

  if (unitType === "execute-task") {
    const status = await inspectExecuteTaskDurability(basePath, unitId);
    if (!status) return "paused";

    writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
      recovery: status,
    });

    const durableComplete =
      status.summaryExists && status.taskChecked && status.nextActionAdvanced;
    if (durableComplete) {
      writeUnitRuntimeRecord(
        basePath,
        unitType,
        unitId,
        currentUnit.startedAt,
        {
          phase: "finalized",
          recovery: status,
        },
      );
      ctx.ui.notify(
        `${reason === "idle" ? "Idle" : "Timeout"} recovery: ${unitType} ${unitId} already completed on disk. Continuing auto-mode.`,
        "info",
      );
      await dispatchNextUnit(ctx, pi);
      return "recovered";
    }

    if (recoveryAttempts < maxRecoveryAttempts) {
      const isEscalation = recoveryAttempts > 0;
      writeUnitRuntimeRecord(
        basePath,
        unitType,
        unitId,
        currentUnit.startedAt,
        {
          phase: "recovered",
          recovery: status,
          recoveryAttempts: recoveryAttempts + 1,
          lastRecoveryReason: reason,
          lastProgressAt: Date.now(),
          progressCount: (runtime?.progressCount ?? 0) + 1,
          lastProgressKind:
            reason === "idle" ? "idle-recovery-retry" : "hard-recovery-retry",
        },
      );

      const steeringLines = isEscalation
        ? [
            `**FINAL ${reason === "idle" ? "IDLE" : "HARD TIMEOUT"} RECOVERY — last chance before this task is skipped.**`,
            `You are still executing ${unitType} ${unitId}.`,
            `Recovery attempt ${recoveryAttempts + 1} of ${maxRecoveryAttempts}.`,
            `Current durability status: ${formatExecuteTaskRecoveryStatus(status)}.`,
            "You MUST finish the durable output NOW, even if incomplete.",
            "Write the task summary with whatever you have accomplished so far.",
            "Mark the task [x] in the plan. Commit your work.",
            "A partial summary is infinitely better than no summary.",
          ]
        : [
            `**${reason === "idle" ? "IDLE" : "HARD TIMEOUT"} RECOVERY — do not stop.**`,
            `You are still executing ${unitType} ${unitId}.`,
            `Recovery attempt ${recoveryAttempts + 1} of ${maxRecoveryAttempts}.`,
            `Current durability status: ${formatExecuteTaskRecoveryStatus(status)}.`,
            "Do not keep exploring.",
            "Immediately finish the required durable output for this unit.",
            "If full completion is impossible, write the partial artifact/state needed for recovery and make the blocker explicit.",
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
        `${reason === "idle" ? "Idle" : "Timeout"} recovery: steering ${unitType} ${unitId} to finish durable output (attempt ${recoveryAttempts + 1}/${maxRecoveryAttempts}).`,
        "warning",
      );
      return "recovered";
    }

    // Retries exhausted — write missing durable artifacts and advance.
    const diagnostic = formatExecuteTaskRecoveryStatus(status);
    const [mid, sid, tid] = unitId.split("/");
    const skipped =
      mid && sid && tid
        ? skipExecuteTask(
            basePath,
            mid,
            sid,
            tid,
            status,
            reason,
            maxRecoveryAttempts,
          )
        : false;

    if (skipped) {
      writeUnitRuntimeRecord(
        basePath,
        unitType,
        unitId,
        currentUnit.startedAt,
        {
          phase: "skipped",
          recovery: status,
          recoveryAttempts: recoveryAttempts + 1,
          lastRecoveryReason: reason,
        },
      );
      ctx.ui.notify(
        `${unitType} ${unitId} skipped after ${maxRecoveryAttempts} recovery attempts (${diagnostic}). Blocker artifacts written. Advancing pipeline.`,
        "warning",
      );
      await dispatchNextUnit(ctx, pi);
      return "recovered";
    }

    // Fallback: couldn't write skip artifacts — pause as before.
    writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
      phase: "paused",
      recovery: status,
      recoveryAttempts: recoveryAttempts + 1,
      lastRecoveryReason: reason,
    });
    ctx.ui.notify(
      `${reason === "idle" ? "Idle" : "Timeout"} recovery check for ${unitType} ${unitId}: ${diagnostic}`,
      "warning",
    );
    return "paused";
  }

  const expected =
    diagnoseExpectedArtifact(unitType, unitId, basePath) ??
    "required durable artifact";

  // Check if the artifact already exists on disk — agent may have written it
  // without signaling completion.
  const artifactPath = resolveExpectedArtifactPath(unitType, unitId, basePath);
  if (artifactPath && existsSync(artifactPath)) {
    writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
      phase: "finalized",
      recoveryAttempts: recoveryAttempts + 1,
      lastRecoveryReason: reason,
    });
    ctx.ui.notify(
      `${reason === "idle" ? "Idle" : "Timeout"} recovery: ${unitType} ${unitId} artifact already exists on disk. Advancing.`,
      "info",
    );
    await dispatchNextUnit(ctx, pi);
    return "recovered";
  }

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
          `**FINAL ${reason === "idle" ? "IDLE" : "HARD TIMEOUT"} RECOVERY — last chance before skip.**`,
          `You are still executing ${unitType} ${unitId}.`,
          `Recovery attempt ${recoveryAttempts + 1} of ${maxRecoveryAttempts} — next failure skips this unit.`,
          `Expected durable output: ${expected}.`,
          "You MUST write the artifact file NOW, even if incomplete.",
          "Write whatever you have — partial research, preliminary findings, best-effort analysis.",
          "A partial artifact is infinitely better than no artifact.",
          "If you are truly blocked, write the file with a BLOCKER section explaining why.",
        ]
      : [
          `**${reason === "idle" ? "IDLE" : "HARD TIMEOUT"} RECOVERY — stay in auto-mode.**`,
          `You are still executing ${unitType} ${unitId}.`,
          `Recovery attempt ${recoveryAttempts + 1} of ${maxRecoveryAttempts}.`,
          `Expected durable output: ${expected}.`,
          "Stop broad exploration.",
          "Write the required artifact now.",
          "If blocked, write the partial artifact and explicitly record the blocker instead of going silent.",
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
      `${reason === "idle" ? "Idle" : "Timeout"} recovery: steering ${unitType} ${unitId} to produce ${expected} (attempt ${recoveryAttempts + 1}/${maxRecoveryAttempts}).`,
      "warning",
    );
    return "recovered";
  }

  // Retries exhausted — write a blocker placeholder and advance the pipeline
  const placeholder = writeBlockerPlaceholder(
    unitType,
    unitId,
    basePath,
    `${reason} recovery exhausted ${maxRecoveryAttempts} attempts without producing the artifact.`,
  );

  if (placeholder) {
    writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
      phase: "skipped",
      recoveryAttempts: recoveryAttempts + 1,
      lastRecoveryReason: reason,
    });
    ctx.ui.notify(
      `${unitType} ${unitId} skipped after ${maxRecoveryAttempts} recovery attempts. Blocker placeholder written to ${placeholder}. Advancing pipeline.`,
      "warning",
    );
    await dispatchNextUnit(ctx, pi);
    return "recovered";
  }

  // Fallback: couldn't resolve artifact path — pause as before.
  writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
    phase: "paused",
    recoveryAttempts: recoveryAttempts + 1,
    lastRecoveryReason: reason,
  });
  return "paused";
}

/**
 * Write skip artifacts for a stuck execute-task: a blocker task summary and
 * the [x] checkbox in the slice plan. Returns true if artifacts were written.
 */
export function skipExecuteTask(
  base: string,
  mid: string,
  sid: string,
  tid: string,
  status: { summaryExists: boolean; taskChecked: boolean },
  reason: string,
  maxAttempts: number,
): boolean {
  // Write a blocker task summary if missing.
  if (!status.summaryExists) {
    const tasksDir = resolveTasksDir(base, mid, sid);
    const sDir = resolveSlicePath(base, mid, sid);
    const targetDir = tasksDir ?? (sDir ? join(sDir, "tasks") : null);
    if (!targetDir) return false;
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
    const summaryPath = join(targetDir, buildTaskFileName(tid, "SUMMARY"));
    const content = [
      `# BLOCKER — task skipped by auto-mode recovery`,
      ``,
      `Task \`${tid}\` in slice \`${sid}\` (milestone \`${mid}\`) failed to complete after ${reason} recovery exhausted ${maxAttempts} attempts.`,
      ``,
      `This placeholder was written by auto-mode so the pipeline can advance.`,
      `Review this task manually and replace this file with a real summary.`,
    ].join("\n");
    writeFileSync(summaryPath, content, "utf-8");
  }

  // Mark [x] in the slice plan if not already checked.
  if (!status.taskChecked) {
    const planAbs = resolveSliceFile(base, mid, sid, "PLAN");
    if (planAbs && existsSync(planAbs)) {
      const planContent = readFileSync(planAbs, "utf-8");
      const escapedTid = tid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^(- \\[) \\] (\\*\\*${escapedTid}:)`, "m");
      if (re.test(planContent)) {
        writeFileSync(planAbs, planContent.replace(re, "$1x] $2"), "utf-8");
      }
    }
  }

  return true;
}

/**
 * Resolve the expected artifact for a non-execute-task unit to an absolute path.
 * Returns null for unit types that don't produce a single file (execute-task,
 * complete-slice, replan-slice).
 */
export function resolveExpectedArtifactPath(
  unitType: string,
  unitId: string,
  base: string,
): string | null {
  const parts = unitId.split("/");
  const mid = parts[0]!;
  const sid = parts[1];
  switch (unitType) {
    case "research-milestone": {
      const dir = resolveMilestonePath(base, mid);
      return dir ? join(dir, buildMilestoneFileName(mid, "RESEARCH")) : null;
    }
    case "plan-milestone": {
      const dir = resolveMilestonePath(base, mid);
      return dir ? join(dir, buildMilestoneFileName(mid, "ROADMAP")) : null;
    }
    case "research-slice": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "RESEARCH")) : null;
    }
    case "plan-slice": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "PLAN")) : null;
    }
    case "reassess-roadmap": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "ASSESSMENT")) : null;
    }
    case "run-uat": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "UAT-RESULT")) : null;
    }
    case "complete-milestone": {
      const dir = resolveMilestonePath(base, mid);
      return dir ? join(dir, buildMilestoneFileName(mid, "SUMMARY")) : null;
    }
    default:
      return null;
  }
}

/**
 * Write a placeholder artifact so the pipeline can advance past a stuck unit.
 * Returns the relative path written, or null if the path couldn't be resolved.
 */
export function writeBlockerPlaceholder(
  unitType: string,
  unitId: string,
  base: string,
  reason: string,
): string | null {
  const absPath = resolveExpectedArtifactPath(unitType, unitId, base);
  if (!absPath) return null;
  const dir = absPath.substring(0, absPath.lastIndexOf("/"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const content = [
    `# BLOCKER — auto-mode recovery failed`,
    ``,
    `Unit \`${unitType}\` for \`${unitId}\` failed to produce this artifact after idle recovery exhausted all retries.`,
    ``,
    `**Reason**: ${reason}`,
    ``,
    `This placeholder was written by auto-mode so the pipeline can advance.`,
    `Review and replace this file before relying on downstream artifacts.`,
  ].join("\n");
  writeFileSync(absPath, content, "utf-8");
  return diagnoseExpectedArtifact(unitType, unitId, base);
}

function diagnoseExpectedArtifact(
  unitType: string,
  unitId: string,
  base: string,
): string | null {
  const parts = unitId.split("/");
  const mid = parts[0];
  const sid = parts[1];
  switch (unitType) {
    case "research-milestone":
      return `${relMilestoneFile(base, mid!, "RESEARCH")} (milestone research)`;
    case "plan-milestone":
      return `${relMilestoneFile(base, mid!, "ROADMAP")} (milestone roadmap)`;
    case "research-slice":
      return `${relSliceFile(base, mid!, sid!, "RESEARCH")} (slice research)`;
    case "plan-slice":
      return `${relSliceFile(base, mid!, sid!, "PLAN")} (slice plan)`;
    case "execute-task": {
      const tid = parts[2];
      return `Task ${tid} marked [x] in ${relSliceFile(base, mid!, sid!, "PLAN")} + summary written`;
    }
    case "complete-slice":
      return `Slice ${sid} marked [x] in ${relMilestoneFile(base, mid!, "ROADMAP")} + summary written`;
    case "replan-slice":
      return `${relSliceFile(base, mid!, sid!, "REPLAN")} + updated ${relSliceFile(base, mid!, sid!, "PLAN")}`;
    case "reassess-roadmap":
      return `${relSliceFile(base, mid!, sid!, "ASSESSMENT")} (roadmap reassessment)`;
    case "run-uat":
      return `${relSliceFile(base, mid!, sid!, "UAT-RESULT")} (UAT result)`;
    case "complete-milestone":
      return `${relMilestoneFile(base, mid!, "SUMMARY")} (milestone summary)`;
    default:
      return null;
  }
}
