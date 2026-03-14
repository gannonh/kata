/**
 * Kata Command — /kata
 *
 * One command, one wizard. Routes to smart entry or status.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveState } from "./state.js";
import type { KataState } from "./types.js";
import { LinearClient } from "../linear/linear-client.js";
import { ensureKataLabels } from "../linear/linear-entities.js";
import { deriveLinearState } from "../linear/linear-state.js";
import { KataDashboardOverlay } from "./dashboard-overlay.js";
import { showSmartEntry, showQueue, showDiscuss } from "./guided-flow.js";
import { startAuto, stopAuto, isAutoActive, isAutoPaused } from "./auto.js";
import {
  getGlobalKataPreferencesPath,
  getLegacyGlobalKataPreferencesPath,
  getProjectKataPreferencesPath,
  loadGlobalKataPreferences,
  loadProjectKataPreferences,
  loadEffectiveKataPreferences,
  resolveAllSkillReferences,
  type LoadedKataPreferences,
} from "./preferences.js";
import {
  getPrSubcommandCompletions,
  buildPrStatusReport,
  type PrStatusDependencies,
} from "./pr-command.js";
import {
  formatLinearConfigStatus,
  getWorkflowEntrypointGuard,
  isLinearMode,
  loadEffectiveLinearProjectConfig,
  validateLinearProjectConfig,
  type LinearConfigValidationResult,
  type ValidateLinearProjectConfigOptions,
} from "./linear-config.js";
import { loadFile, saveFile } from "./files.js";
import { getCurrentBranch } from "../pr-lifecycle/gh-utils.js";
import { getPRNumber } from "../pr-lifecycle/pr-merge-utils.js";
import {
  formatDoctorIssuesForPrompt,
  formatDoctorReport,
  runKataDoctor,
  selectDoctorScope,
  filterDoctorIssues,
} from "./doctor.js";
import { loadPrompt } from "./prompt-loader.js";

function dispatchDoctorHeal(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  scope: string | undefined,
  reportText: string,
  structuredIssues: string,
): boolean {
  const gate = getWorkflowEntrypointGuard("doctor-heal");
  if (!gate.allow) {
    ctx.ui.notify(gate.notice ?? "Workflow mode is not supported here.", gate.noticeLevel);
    return false;
  }
  if (!gate.protocol.path) {
    ctx.ui.notify(
      `Could not load ${gate.protocol.documentName} for ${gate.mode} mode.`,
      "error",
    );
    return false;
  }

  const workflow = readFileSync(gate.protocol.path, "utf-8");
  const prompt = loadPrompt("doctor-heal", {
    doctorSummary: reportText,
    structuredIssues,
    scopeLabel: scope ?? "active milestone / blocking scope",
    doctorCommandSuffix: scope ? ` ${scope}` : "",
  });

  const content = `Read the following Kata workflow protocol and execute exactly.\n\n${workflow}\n\n## Your Task\n\n${prompt}`;

  pi.sendMessage(
    { customType: "kata-doctor-heal", content, display: false },
    { triggerTurn: true },
  );
  return true;
}

export interface PrefsStatusReport {
  level: "info" | "warning";
  message: string;
}

export interface PrefsStatusDependencies {
  getGlobalKataPreferencesPath: typeof getGlobalKataPreferencesPath;
  getLegacyGlobalKataPreferencesPath: typeof getLegacyGlobalKataPreferencesPath;
  getProjectKataPreferencesPath: typeof getProjectKataPreferencesPath;
  loadGlobalKataPreferences: typeof loadGlobalKataPreferences;
  loadProjectKataPreferences: typeof loadProjectKataPreferences;
  loadEffectiveKataPreferences: typeof loadEffectiveKataPreferences;
  resolveAllSkillReferences: typeof resolveAllSkillReferences;
  validateLinearProjectConfig: (
    options?: ValidateLinearProjectConfigOptions,
  ) => Promise<LinearConfigValidationResult>;
}

const defaultPrefsStatusDependencies: PrefsStatusDependencies = {
  getGlobalKataPreferencesPath,
  getLegacyGlobalKataPreferencesPath,
  getProjectKataPreferencesPath,
  loadGlobalKataPreferences,
  loadProjectKataPreferences,
  loadEffectiveKataPreferences,
  resolveAllSkillReferences,
  validateLinearProjectConfig,
};

export async function buildPrefsStatusReport(
  deps: PrefsStatusDependencies = defaultPrefsStatusDependencies,
): Promise<PrefsStatusReport> {
  const globalPrefs = deps.loadGlobalKataPreferences();
  const projectPrefs = deps.loadProjectKataPreferences();
  const effective = deps.loadEffectiveKataPreferences();
  const validation = await deps.validateLinearProjectConfig({
    loadedPreferences: effective,
  });

  const globalStatus = describeGlobalPreferences(globalPrefs, deps);
  const projectStatus = projectPrefs
    ? `present: ${projectPrefs.path}`
    : `missing: ${deps.getProjectKataPreferencesPath()}`;
  const effectiveStatus = effective
    ? `${effective.path} (${effective.scope})`
    : "none (defaults only)";

  const lines = [
    "Kata prefs status",
    `mode: ${validation.mode}`,
    `effective preferences: ${effectiveStatus}`,
    `global preferences: ${globalStatus}`,
    `project preferences: ${projectStatus}`,
    ...formatLinearConfigStatus(validation).lines,
  ];

  let hasUnresolvedSkills = false;
  if (effective) {
    const skillStatus = describeSkillResolution(effective, deps);
    hasUnresolvedSkills = skillStatus.hasUnresolvedSkills;
    lines.push(...skillStatus.lines);
  }

  // ── PR lifecycle config ──────────────────────────────────────────────────────
  const prPrefs = effective?.preferences.pr;
  if (prPrefs?.enabled) {
    lines.push(`pr.enabled: ${prPrefs.enabled}`);
    lines.push(`pr.auto_create: ${prPrefs.auto_create ?? false}`);
    if (prPrefs.base_branch) {
      lines.push(`pr.base_branch: ${prPrefs.base_branch}`);
    }
  } else {
    lines.push("pr: disabled");
  }

  return {
    level:
      validation.status === "invalid" || hasUnresolvedSkills ? "warning" : "info",
    message: lines.join("\n"),
  };
}

function describeGlobalPreferences(
  globalPrefs: LoadedKataPreferences | null,
  deps: PrefsStatusDependencies,
): string {
  if (!globalPrefs) {
    return `missing: ${deps.getGlobalKataPreferencesPath()}`;
  }

  const legacyGlobal = deps.getLegacyGlobalKataPreferencesPath();
  return `present: ${globalPrefs.path}${globalPrefs.path === legacyGlobal ? " (legacy fallback)" : ""}`;
}

function describeSkillResolution(
  effective: LoadedKataPreferences,
  deps: PrefsStatusDependencies,
): { hasUnresolvedSkills: boolean; lines: string[] } {
  const report = deps.resolveAllSkillReferences(effective.preferences, process.cwd());
  const resolved = [...report.resolutions.values()].filter(
    (resolution) => resolution.method !== "unresolved",
  );
  const hasUnresolvedSkills = report.warnings.length > 0;

  if (resolved.length === 0 && !hasUnresolvedSkills) {
    return { hasUnresolvedSkills: false, lines: [] };
  }

  const lines = [
    `skills: ${resolved.length} resolved, ${report.warnings.length} unresolved`,
  ];
  if (hasUnresolvedSkills) {
    lines.push(`unresolved skills: ${report.warnings.join(", ")}`);
  }

  return { hasUnresolvedSkills, lines };
}

export function registerKataCommand(pi: ExtensionAPI): void {
  pi.registerCommand("kata", {
    description:
      "Kata — Kata Workflow: /kata auto|stop|status|queue|prefs|doctor|pr",

    getArgumentCompletions: (prefix: string) => {
      const subcommands = [
        "auto",
        "stop",
        "status",
        "queue",
        "discuss",
        "prefs",
        "doctor",
        "pr",
      ];
      const parts = prefix.trim().split(/\s+/);

      if (parts.length <= 1) {
        return subcommands
          .filter((cmd) => cmd.startsWith(parts[0] ?? ""))
          .map((cmd) => ({ value: cmd, label: cmd }));
      }

      if (parts[0] === "auto" && parts.length <= 2) {
        const flagPrefix = parts[1] ?? "";
        return ["--verbose"]
          .filter((f) => f.startsWith(flagPrefix))
          .map((f) => ({ value: `auto ${f}`, label: f }));
      }

      if (parts[0] === "prefs" && parts.length <= 2) {
        const subPrefix = parts[1] ?? "";
        return ["global", "project", "status"]
          .filter((cmd) => cmd.startsWith(subPrefix))
          .map((cmd) => ({ value: `prefs ${cmd}`, label: cmd }));
      }

      if (parts[0] === "doctor") {
        const modePrefix = parts[1] ?? "";
        const modes = ["fix", "heal", "audit"];

        if (parts.length <= 2) {
          return modes
            .filter((cmd) => cmd.startsWith(modePrefix))
            .map((cmd) => ({ value: `doctor ${cmd}`, label: cmd }));
        }

        return [];
      }

      if (parts[0] === "pr" && parts.length <= 2) {
        const subPrefix = parts[1] ?? "";
        return getPrSubcommandCompletions(subPrefix).map((c) => ({
          value: `pr ${c.value}`,
          label: c.label,
        }));
      }

      return [];
    },

    async handler(args: string, ctx: ExtensionCommandContext) {
      const trimmed = (typeof args === "string" ? args : "").trim();

      if (trimmed === "status") {
        await handleStatus(ctx);
        return;
      }

      if (trimmed === "prefs" || trimmed.startsWith("prefs ")) {
        await handlePrefs(trimmed.replace(/^prefs\s*/, "").trim(), ctx);
        return;
      }

      if (trimmed === "doctor" || trimmed.startsWith("doctor ")) {
        await handleDoctor(trimmed.replace(/^doctor\s*/, "").trim(), ctx, pi);
        return;
      }

      if (trimmed === "auto" || trimmed.startsWith("auto ")) {
        const verboseMode = trimmed.includes("--verbose");
        await startAuto(ctx, pi, process.cwd(), verboseMode);
        return;
      }

      if (trimmed === "stop") {
        if (!isAutoActive() && !isAutoPaused()) {
          ctx.ui.notify("Auto-mode is not running.", "info");
          return;
        }
        await stopAuto(ctx, pi);
        return;
      }

      if (trimmed === "queue") {
        await showQueue(ctx, pi, process.cwd());
        return;
      }

      if (trimmed === "discuss") {
        await showDiscuss(ctx, pi, process.cwd());
        return;
      }

      if (trimmed === "pr" || trimmed.startsWith("pr ")) {
        await handlePr(trimmed.replace(/^pr\s*/, "").trim(), ctx, pi);
        return;
      }

      if (trimmed === "") {
        await showSmartEntry(ctx, pi, process.cwd());
        return;
      }

      ctx.ui.notify(
        `Unknown: /kata ${trimmed}. Use /kata, /kata auto, /kata stop, /kata status, /kata queue, /kata discuss, /kata prefs [global|project|status], /kata doctor [audit|fix|heal] [M###/S##], or /kata pr [status|create|review|address|merge].`,
        "warning",
      );
    },
  });
}

/**
 * Mode-aware state derivation.
 *
 * In Linear mode: queries the Linear API via `deriveLinearState`.
 * In file mode: reads `.kata/` files via `deriveState`.
 *
 * Errors from the Linear API are caught and returned as a "blocked" KataState
 * with a diagnostic message in `blockers[]` — the overlay surfaces this rather
 * than crashing.
 */
async function deriveKataState(basePath: string): Promise<KataState> {
  if (!isLinearMode()) {
    return deriveState(basePath);
  }

  const config = loadEffectiveLinearProjectConfig();
  const apiKey = process.env.LINEAR_API_KEY;

  if (!apiKey) {
    return {
      phase: "blocked",
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
      blockers: ["LINEAR_API_KEY is not set"],
      recentDecisions: [],
      nextAction: "Set LINEAR_API_KEY to use Linear mode.",
      registry: [],
      progress: { milestones: { done: 0, total: 0 } },
    };
  }

  const { projectId, teamId } = config.linear;
  if (!projectId || !teamId) {
    return {
      phase: "blocked",
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
      blockers: [
        "Linear project not configured — set linear.teamId and linear.projectId in .kata/preferences.md.",
      ],
      recentDecisions: [],
      nextAction: "Run /kata prefs project to configure the Linear project.",
      registry: [],
      progress: { milestones: { done: 0, total: 0 } },
    };
  }

  try {
    const client = new LinearClient(apiKey);
    const labelSet = await ensureKataLabels(client, teamId);
    return await deriveLinearState(client, {
      projectId,
      teamId,
      sliceLabelId: labelSet.slice.id,
      basePath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      phase: "blocked",
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
      blockers: [`Linear API error: ${message}`],
      recentDecisions: [],
      nextAction: "Check LINEAR_API_KEY and Linear project config, then retry.",
      registry: [],
      progress: { milestones: { done: 0, total: 0 } },
    };
  }
}

async function handleStatus(ctx: ExtensionCommandContext): Promise<void> {
  const modeGate = getWorkflowEntrypointGuard("status");
  if (!modeGate.allow) {
    ctx.ui.notify(
      modeGate.notice ?? "Workflow mode is not supported here.",
      modeGate.noticeLevel,
    );
    return;
  }

  const basePath = process.cwd();
  const state = await deriveKataState(basePath);

  if (state.registry.length === 0) {
    ctx.ui.notify("No Kata milestones found. Run /kata to start.", "info");
    return;
  }

  await ctx.ui.custom<void>(
    (tui, theme, _kb, done) => {
      return new KataDashboardOverlay(tui, theme, () => done());
    },
    {
      overlay: true,
      overlayOptions: {
        width: "70%",
        minWidth: 60,
        maxHeight: "90%",
        anchor: "center",
      },
    },
  );
}

export async function fireStatusViaCommand(
  ctx: import("@mariozechner/pi-coding-agent").ExtensionContext,
): Promise<void> {
  await handleStatus(ctx as ExtensionCommandContext);
}

async function handlePrefs(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const trimmed = args.trim();

  if (trimmed === "" || trimmed === "global") {
    await ensurePreferencesFile(getGlobalKataPreferencesPath(), ctx, "global");
    return;
  }

  if (trimmed === "project") {
    await ensurePreferencesFile(getProjectKataPreferencesPath(), ctx, "project");
    return;
  }

  if (trimmed === "status") {
    const report = await buildPrefsStatusReport();
    ctx.ui.notify(report.message, report.level);
    return;
  }

  ctx.ui.notify("Usage: /kata prefs [global|project|status]", "info");
}

/**
 * Builds the real PrStatusDependencies using live accessors.
 *
 * - getCurrentBranch: reads from git via gh-utils
 * - getOpenPrNumber: queries `gh pr view` via pr-merge-utils
 * - getPrEnabled / getPrAutoCreate / getPrBaseBranch: read from effective preferences
 */
function buildLivePrStatusDeps(): PrStatusDependencies {
  const effective = loadEffectiveKataPreferences();
  const pr = effective?.preferences.pr;
  return {
    getCurrentBranch: () => getCurrentBranch(process.cwd()),
    getOpenPrNumber: async () => {
      // getPRNumber is synchronous — wrap in a resolved Promise for interface compat
      return getPRNumber(process.cwd());
    },
    getPrEnabled: () => pr?.enabled === true,
    getPrAutoCreate: () => pr?.auto_create === true,
    getPrBaseBranch: () => pr?.base_branch ?? "main",
  };
}

async function handlePr(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const trimmed = args.trim();

  // `status` is deterministic — no LLM turn required
  if (trimmed === "status" || trimmed === "") {
    const report = await buildPrStatusReport(buildLivePrStatusDeps());
    ctx.ui.notify(report.message, report.level);
    return;
  }

  if (trimmed === "create") {
    const effective = loadEffectiveKataPreferences();
    const prPrefs = effective?.preferences.pr;
    const baseBranch = prPrefs?.base_branch ?? "main";
    const reviewOnCreate = prPrefs?.review_on_create === true;

    const reviewOnCreateSection = reviewOnCreate
      ? "After the PR is created successfully, immediately continue with `/kata pr review` " +
        "to run the parallel review workflow (pr.review_on_create is enabled)."
      : "After the PR is created, inform the user of the PR URL. " +
        "They can run `/kata pr review` manually when ready.";

    const prompt = loadPrompt("pr-create", {
      baseBranch,
      reviewOnCreate: reviewOnCreateSection,
    });

    pi.sendMessage(
      { customType: "kata-pr-create", content: prompt, display: false },
      { triggerTurn: true },
    );
    return;
  }

  if (trimmed === "review") {
    const prompt = loadPrompt("pr-review");
    pi.sendMessage(
      { customType: "kata-pr-review", content: prompt, display: false },
      { triggerTurn: true },
    );
    return;
  }

  if (trimmed === "address") {
    const prompt = loadPrompt("pr-address");
    pi.sendMessage(
      { customType: "kata-pr-address", content: prompt, display: false },
      { triggerTurn: true },
    );
    return;
  }

  if (trimmed === "merge") {
    const prompt = loadPrompt("pr-merge");
    pi.sendMessage(
      { customType: "kata-pr-merge", content: prompt, display: false },
      { triggerTurn: true },
    );
    return;
  }

  ctx.ui.notify(
    "Usage: /kata pr [status|create|review|address|merge]",
    "info",
  );
}

async function handleDoctor(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const modeGate = getWorkflowEntrypointGuard("doctor");
  if (!modeGate.allow) {
    ctx.ui.notify(
      modeGate.notice ?? "Workflow mode is not supported here.",
      modeGate.noticeLevel,
    );
    return;
  }

  const trimmed = args.trim();
  const parts = trimmed ? trimmed.split(/\s+/) : [];
  const mode =
    parts[0] === "fix" || parts[0] === "heal" || parts[0] === "audit"
      ? parts[0]
      : "doctor";
  const requestedScope = mode === "doctor" ? parts[0] : parts[1];
  const scope = await selectDoctorScope(process.cwd(), requestedScope);
  const effectiveScope = mode === "audit" ? requestedScope : scope;
  const report = await runKataDoctor(process.cwd(), {
    fix: mode === "fix" || mode === "heal",
    scope: effectiveScope,
  });

  const reportText = formatDoctorReport(report, {
    scope: effectiveScope,
    includeWarnings: mode === "audit",
    maxIssues: mode === "audit" ? 50 : 12,
    title:
      mode === "audit"
        ? "Kata doctor audit."
        : mode === "heal"
          ? "Kata doctor heal prep."
          : undefined,
  });

  ctx.ui.notify(reportText, report.ok ? "info" : "warning");

  if (mode === "heal") {
    const unresolved = filterDoctorIssues(report.issues, {
      scope: effectiveScope,
      includeWarnings: true,
    });
    const actionable = unresolved.filter(
      (issue) =>
        issue.severity === "error" ||
        issue.code === "all_tasks_done_missing_slice_uat" ||
        issue.code === "slice_checked_missing_uat",
    );
    if (actionable.length === 0) {
      ctx.ui.notify(
        "Doctor heal found nothing actionable to hand off to the LLM.",
        "info",
      );
      return;
    }

    const structuredIssues = formatDoctorIssuesForPrompt(actionable);
    const dispatched = dispatchDoctorHeal(
      ctx,
      pi,
      effectiveScope,
      reportText,
      structuredIssues,
    );
    if (dispatched) {
      ctx.ui.notify(
        `Doctor heal dispatched ${actionable.length} issue(s) to the LLM.`,
        "info",
      );
    }
  }
}

async function ensurePreferencesFile(
  path: string,
  ctx: ExtensionCommandContext,
  scope: "global" | "project",
): Promise<void> {
  if (!existsSync(path)) {
    const template = await loadFile(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "templates",
        "preferences.md",
      ),
    );
    if (!template) {
      ctx.ui.notify("Could not load Kata preferences template.", "error");
      return;
    }
    await saveFile(path, template);
    ctx.ui.notify(`Created ${scope} Kata skill preferences at ${path}`, "info");
  } else {
    ctx.ui.notify(
      `Using existing ${scope} Kata skill preferences at ${path}`,
      "info",
    );
  }

  await ctx.waitForIdle();
  await ctx.reload();
  ctx.ui.notify(
    `Edit ${path} to update ${scope} Kata skill preferences.`,
    "info",
  );
}
