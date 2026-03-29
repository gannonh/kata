/**
 * Kata Command — /kata
 *
 * One command, one wizard. Routes to smart entry or status.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { KataState } from "./types.js";
import { KataDashboardOverlay } from "./dashboard-overlay.js";
import { showSmartEntry, showQueue, showDiscuss, showPlan } from "./guided-flow.js";
import { startAuto, stopAuto, isAutoActive, isAutoPaused, setStepActive } from "./auto.js";
import type { KataBackend } from "./backend.js";
import { createBackend } from "./backend-factory.js";
import {
  getGlobalKataPreferencesPath,
  getLegacyGlobalKataPreferencesPath,
  getProjectKataPreferencesPath,
  loadGlobalKataPreferences,
  loadProjectKataPreferences,
  loadEffectiveKataPreferences,
  resolveAllSkillReferences,
  resolveModelForUnit,
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
  loadEffectiveLinearProjectConfig,
  validateLinearProjectConfig,
  type LinearConfigValidationResult,
  type ValidateLinearProjectConfigOptions,
} from "./linear-config.js";
import { getCurrentBranch } from "../pr-lifecycle/gh-utils.js";
import { getPRNumber } from "../pr-lifecycle/pr-merge-utils.js";
import { loadPrompt } from "./prompt-loader.js";
import {
  isProjectConfigured,
  runOnboarding,
  shouldSkipOnboarding,
  setSkipOnboarding,
} from "./onboarding.js";
import { clearHeaderHint } from "./header.js";

// ─── Onboarding gate ──────────────────────────────────────────────────────────

/**
 * Ensure the project is configured (has .kata/ with linear config).
 * If not configured and not skipped, shows a setup-or-skip prompt.
 *
 * Returns true if the project is configured (or was just configured).
 * Returns false if the user skipped or onboarding was already skipped this session.
 */
async function ensureOnboarding(
  ctx: ExtensionCommandContext,
  basePath: string,
): Promise<boolean> {
  if (isProjectConfigured(basePath)) return true;
  if (shouldSkipOnboarding()) return false;

  const { showNextAction } = await import("../shared/next-action-ui.js");

  const choice = await showNextAction(ctx as any, {
    title: "Kata Setup",
    summary: [
      "This project hasn't been set up with Kata yet.",
      "You'll need a Linear API key to get started.",
    ],
    actions: [
      {
        id: "setup",
        label: "Set up Kata (Recommended)",
        description: "Configure Linear integration and create .kata/ directory.",
        recommended: true,
      },
    ],
    notYetMessage: "Run /kata to set up when ready.",
  });

  if (choice === "setup") {
    const result = await runOnboarding(ctx, basePath);
    if (result === "completed") {
      // API key saved and .kata/ created; isProjectConfigured() still returns
      // false until S02 adds team/project identifiers. Set the session skip
      // flag so the wizard doesn't re-trigger on every subsequent /kata call
      // within this session.
      setSkipOnboarding(true);
      clearHeaderHint();
      return true;
    }
    return false;
  }

  // "not_yet" (or Escape) — don't persist skip, just return false
  return false;
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
      "Kata — Kata Workflow: /kata step|auto|stop|status|queue|discuss|plan|config|prefs|pr",

    getArgumentCompletions: (prefix: string) => {
      const subcommands = [
        "step",
        "auto",
        "stop",
        "status",
        "queue",
        "discuss",
        "plan",
        "config",
        "prefs",
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

      if (trimmed === "config") {
        await handleConfig(ctx);
        return;
      }

      if (trimmed === "prefs" || trimmed.startsWith("prefs ")) {
        await handlePrefs(trimmed.replace(/^prefs\s*/, "").trim(), ctx);
        return;
      }

      if (trimmed === "auto" || trimmed.startsWith("auto ")) {
        const cwd = process.cwd();
        if (!await ensureOnboarding(ctx, cwd)) return;
        const verboseMode = trimmed.includes("--verbose");
        await startAuto(ctx, pi, cwd, verboseMode);
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
        const cwd = process.cwd();
        if (!await ensureOnboarding(ctx, cwd)) return;
        await showQueue(ctx, pi, cwd);
        return;
      }

      if (trimmed === "discuss") {
        const cwd = process.cwd();
        if (!await ensureOnboarding(ctx, cwd)) return;
        await showDiscuss(ctx, pi, cwd);
        return;
      }

      if (trimmed === "plan") {
        const cwd = process.cwd();
        if (!await ensureOnboarding(ctx, cwd)) return;
        await showPlan(ctx, pi, cwd);
        return;
      }

      if (trimmed === "pr" || trimmed.startsWith("pr ")) {
        await handlePr(trimmed.replace(/^pr\s*/, "").trim(), ctx, pi);
        return;
      }

      if (trimmed === "" || trimmed === "step") {
        const cwd = process.cwd();
        if (!await ensureOnboarding(ctx, cwd)) return;

        let stepBackend: KataBackend;
        try {
          stepBackend = await createBackend(cwd);
        } catch (err) {
          ctx.ui.notify(`Kata backend init failed: ${err instanceof Error ? err.message : String(err)}`, "error");
          return;
        }
        let state: KataState;
        try {
          state = await stepBackend.deriveState();
        } catch (err) {
          ctx.ui.notify(
            `Kata state derivation failed: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
          return;
        }

        if (state.phase === "blocked") {
          ctx.ui.notify(`Blocked: ${state.blockers.join(", ")}`, "warning");
          return;
        }
        if (state.phase === "complete" || !state.activeMilestone) {
          await showSmartEntry(ctx, pi, cwd);
          return;
        }

        // Ensure slice branch for slice-scoped phases (mirrors auto.ts ensurePreconditions)
        const sliceScopedPhases = ["planning", "executing", "verifying", "summarizing", "replanning-slice"];
        if (
          sliceScopedPhases.includes(state.phase) &&
          state.activeMilestone &&
          state.activeSlice
        ) {
          try {
            const { ensureSliceBranch } = await import("./worktree.js");
            ensureSliceBranch(cwd, state.activeMilestone.id, state.activeSlice.id);
          } catch (err) {
            ctx.ui.notify(
              `Branch setup failed: ${err instanceof Error ? err.message : String(err)}`,
              "error",
            );
            return;
          }
        }

        let prompt: string | null;
        try {
          prompt = await stepBackend.buildPrompt(state.phase, state);
        } catch (err) {
          ctx.ui.notify(
            `Prompt generation failed: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
          return;
        }
        if (!prompt) {
          ctx.ui.notify(`No prompt for phase: ${state.phase}`, "warning");
          return;
        }

        const unitId = state.activeTask
          ? `${state.activeMilestone.id}/${state.activeSlice?.id ?? "?"}/${state.activeTask.id}`
          : state.activeSlice
            ? `${state.activeMilestone.id}/${state.activeSlice.id}`
            : state.activeMilestone.id;

        // Apply model preference for this phase (mirrors auto.ts step 18)
        const stepUnitType = phaseToUnitType(state.phase);
        const preferredModelId = resolveModelForUnit(stepUnitType);
        if (preferredModelId) {
          const allModels = ctx.modelRegistry.getAll();
          const model = allModels.find((m) => m.id === preferredModelId);
          if (model) {
            const ok = await pi.setModel(model);
            if (ok) ctx.ui.notify(`Model: ${preferredModelId}`, "info");
          } else {
            ctx.ui.notify(
              `Model preference '${preferredModelId}' not found in registry — using current model.`,
              "warning",
            );
          }
        }

        ctx.ui.notify(`/kata step: ${state.phase} — ${unitId}`, "info");
        ctx.ui.setStatus("kata-auto", "step");
        setStepActive(true);
        pi.sendMessage({ customType: "kata-step", content: prompt, display: false }, { triggerTurn: true });
        return;
      }

      ctx.ui.notify(
        `Unknown: /kata ${trimmed}. Use /kata step, /kata auto, /kata stop, /kata status, /kata queue, /kata discuss, /kata plan, /kata config, /kata prefs [global|project|status], or /kata pr [status|create|review|address|merge].`,
        "warning",
      );
    },
  });
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
  let state: KataState;
  try {
    const statusBackend = await createBackend(basePath);
    state = await statusBackend.deriveState();
  } catch (err) {
    ctx.ui.notify(
      `Kata status failed: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
    return;
  }

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

async function handleConfig(ctx: ExtensionCommandContext): Promise<void> {
  try {
    const { executePreferencesConfigCommand } = await import("./prefs-config-command.js");
    await executePreferencesConfigCommand(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to load config editor: ${message}`, "error");
  }
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
  const config = loadEffectiveLinearProjectConfig(effective);
  return {
    getCurrentBranch: () => getCurrentBranch(process.cwd()),
    getOpenPrNumber: async () => {
      // getPRNumber is synchronous — wrap in a resolved Promise for interface compat
      return getPRNumber(process.cwd());
    },
    getPrEnabled: () => pr?.enabled === true,
    getPrAutoCreate: () => pr?.auto_create === true,
    getPrBaseBranch: () => pr?.base_branch ?? "main",
    getLinearLinkStatus: () => ({
      linearLink: pr?.linear_link === true,
      workflowMode: config.workflowMode,
    }),
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

async function ensurePreferencesFile(
  path: string,
  ctx: ExtensionCommandContext,
  scope: "global" | "project",
): Promise<void> {
  if (!existsSync(path)) {
    const templatePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "templates",
      "preferences.md",
    );

    let template: string;
    try {
      template = await readFile(templatePath, "utf-8");
    } catch {
      ctx.ui.notify("Could not load Kata preferences template.", "error");
      return;
    }

    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, template, "utf-8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[kata] failed to write preferences file at ${path}: ${message}\n`,
      );
      ctx.ui.notify(`Could not write preferences file at ${path}: ${message}`, "error");
      return;
    }

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

/**
 * Map a Kata state phase to the auto-mode unit type string used by
 * resolveModelForUnit(). Mirrors the default branch of deriveUnitType()
 * in auto.ts without requiring PromptOptions.
 */
function phaseToUnitType(phase: string): string {
  switch (phase) {
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
      return `unknown-${phase}`;
  }
}
