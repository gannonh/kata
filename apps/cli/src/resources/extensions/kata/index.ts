/**
 * Kata Extension — /kata
 *
 * One command, one wizard. Reads state from disk, shows contextual options,
 * dispatches through KATA-WORKFLOW.md. The LLM does the rest.
 *
 * Auto-mode: /kata auto loops fresh sessions until milestone complete.
 *
 * Commands:
 *   /kata        — contextual wizard (smart entry point)
 *   /kata auto   — start auto-mode (fresh session per unit)
 *   /kata stop   — stop auto-mode gracefully
 *   /kata status — progress dashboard
 *
 * Hooks:
 *   before_agent_start — inject Kata system context for Kata projects
 *   agent_end — auto-mode advancement
 *   session_before_compact — save continue.md OR block during auto
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import { registerKataCommand } from "./commands.js";
import {
  saveFile,
  formatContinue,
  loadFile,
  parseContinue,
  parseSummary,
} from "./files.js";
import { loadPrompt } from "./prompt-loader.js";
import { deriveState } from "./state.js";
import {
  isAutoActive,
  isAutoPaused,
  isStepActive,
  setStepActive,
  handleAgentEnd,
  handleProviderError,
  pauseAuto,
  getAutoDashboardData,
} from "./auto.js";
import { dlog } from "./debug-log.js";
import { saveActivityLog } from "./activity-log.js";
import { checkAutoStartAfterDiscuss } from "./guided-flow.js";
import { KataDashboardOverlay } from "./dashboard-overlay.js";
import {
  loadEffectiveKataPreferences,
  renderPreferencesForSystemPrompt,
  resolveAllSkillReferences,
} from "./preferences.js";
import {
  hasSkillSnapshot,
  detectNewSkills,
  formatSkillsXml,
} from "./skill-discovery.js";
import { getWorkflowEntrypointGuard } from "./linear-config.js";
import {
  resolveSlicePath,
  resolveSliceFile,
  resolveTaskFile,
  resolveTaskFiles,
  resolveTasksDir,
  relSliceFile,
  relSlicePath,
  relTaskFile,
  buildSliceFileName,
  kataRoot,
} from "./paths.js";
import { Key } from "@mariozechner/pi-tui";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { Text } from "@mariozechner/pi-tui";
import {
  extractMarkdownSection,
  escapeRegExp,
  oneLine,
  extractSliceExecutionExcerpt,
} from "./markdown-utils.js";

// ── ASCII logo ────────────────────────────────────────────────────────────
const KATA_LOGO_LINES = [
  "  ██╗  ██╗ █████╗ ████████╗ █████╗ ",
  "  ██║ ██╔╝██╔══██╗╚══██╔══╝██╔══██╗",
  "  █████╔╝ ███████║   ██║   ███████║",
  "  ██╔═██╗ ██╔══██║   ██║   ██╔══██║",
  "  ██║  ██╗██║  ██║   ██║   ██║  ██║",
  "  ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝",
];

// Provider error retry is handled in auto.ts — see handleProviderError()

export default function (pi: ExtensionAPI) {
  registerKataCommand(pi);

  // ── session_start: render branded Kata header ───────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    // Patch Opus 4.6 context window — pi-mono caps at 200K but
    // Anthropic's API supports 1M natively.
    for (const model of ctx.modelRegistry.getAll()) {
      if (model.id === "claude-opus-4-6" && model.provider === "anthropic") {
        model.contextWindow = 1_000_000;
      }
    }

    const theme = ctx.ui.theme;
    const version = process.env.KATA_VERSION || "0.0.0";

    const logoText = KATA_LOGO_LINES.map((line) =>
      theme.fg("accent", line),
    ).join("\n");
    const titleLine = `  ${theme.bold("Kata CLI")} ${theme.fg("dim", `v${version}`)}`;

    const headerContent = `${logoText}\n${titleLine}`;
    ctx.ui.setHeader((_ui, _theme) => new Text(headerContent, 1, 0));
  });

  // ── Ctrl+Alt+G shortcut — Kata dashboard overlay ────────────────────────
  pi.registerShortcut(Key.ctrlAlt("g"), {
    description: "Open Kata dashboard",
    handler: async (ctx) => {
      const modeGate = getWorkflowEntrypointGuard("dashboard");
      if (!modeGate.allow) {
        ctx.ui.notify(
          modeGate.notice ?? "Workflow mode is not supported here.",
          modeGate.noticeLevel,
        );
        return;
      }

      // Only show if .kata/ exists
      if (!existsSync(join(process.cwd(), ".kata"))) {
        ctx.ui.notify("No .kata/ directory found. Run /kata to start.", "info");
        return;
      }

      await ctx.ui.custom<void>(
        (tui, theme, _kb, done) => {
          return new KataDashboardOverlay(tui, theme, () => done());
        },
        {
          overlay: true,
          overlayOptions: {
            width: "90%",
            minWidth: 80,
            maxHeight: "92%",
            anchor: "center",
          },
        },
      );
    },
  });

  // ── before_agent_start: inject Kata contract into true system prompt ─────
  pi.on("before_agent_start", async (event, ctx: ExtensionContext) => {
    if (!existsSync(join(process.cwd(), ".kata"))) return;

    const systemContent = loadPrompt("system");
    const loadedPreferences = loadEffectiveKataPreferences();
    const modeGate = getWorkflowEntrypointGuard(
      "system-prompt",
      loadedPreferences,
    );
    const workflowModeBlock = modeGate.notice
      ? `\n\n## Workflow Mode\n\n- mode: ${modeGate.mode}\n- ${modeGate.notice}`
      : "";
    let preferenceBlock = "";
    if (loadedPreferences) {
      const cwd = process.cwd();
      const report = resolveAllSkillReferences(
        loadedPreferences.preferences,
        cwd,
      );
      preferenceBlock = `\n\n${renderPreferencesForSystemPrompt(loadedPreferences.preferences, report.resolutions)}`;

      // Emit warnings for unresolved skill references
      if (report.warnings.length > 0) {
        ctx.ui.notify(
          `Kata skill preferences: ${report.warnings.length} unresolved skill${report.warnings.length === 1 ? "" : "s"}: ${report.warnings.join(", ")}`,
          "warning",
        );
      }
    }

    // Detect skills installed during this auto-mode session
    let newSkillsBlock = "";
    if (hasSkillSnapshot()) {
      const newSkills = detectNewSkills();
      if (newSkills.length > 0) {
        newSkillsBlock = formatSkillsXml(newSkills);
      }
    }

    // Inject workflow protocol doc when protocol is ready (Linear mode)
    let workflowDocBlock = "";
    if (modeGate.protocol.ready && modeGate.protocol.path) {
      try {
        const workflowDoc = readFileSync(modeGate.protocol.path, "utf-8");
        workflowDocBlock = `\n\n${workflowDoc}`;
      } catch {
        // File disappeared between the existsSync check and the read — skip injection silently
      }
    }

    const injection = await buildGuidedExecuteContextInjection(
      event.prompt,
      process.cwd(),
    );

    return {
      systemPrompt: `${event.systemPrompt}\n\n[SYSTEM CONTEXT — Kata]\n\n${systemContent}${workflowModeBlock}${preferenceBlock}${newSkillsBlock}${workflowDocBlock}`,
      ...(injection
        ? {
            message: {
              customType: "kata-guided-context",
              content: injection,
              display: false,
            },
          }
        : {}),
    };
  });

  // ── agent_end: auto-mode advancement or auto-start after discuss ───────────
  pi.on("agent_end", async (event, ctx: ExtensionContext) => {
    // If discuss phase just finished, ask user whether to start auto-mode
    if (await checkAutoStartAfterDiscuss()) return;

    // If a step turn just finished, clear the step badge and return
    if (isStepActive()) {
      setStepActive(false);
      ctx.ui.setStatus("kata-auto", undefined);
      return;
    }

    // If auto-mode is already running, advance to next unit
    if (!isAutoActive()) return;

    // If the agent was aborted (user pressed Escape), pause auto-mode
    // instead of advancing. This preserves the conversation so the user
    // can inspect what happened, interact with the agent, or resume.
    const lastMsg = event.messages[event.messages.length - 1];
    const stopReason =
      lastMsg && "stopReason" in lastMsg ? lastMsg.stopReason : undefined;

    dlog("agent-end-event", {
      stopReason: stopReason ?? "end_turn",
      messages: event.messages.length,
    });

    if (stopReason === "aborted") {
      dlog("pause", { reason: "user-abort" });
      await pauseAuto(ctx, pi);
      return;
    }

    // If the agent session ended with a provider/network error, retry
    // with exponential backoff instead of advancing (which would burn
    // through the stuck-detection budget on transient failures).
    if (stopReason === "error") {
      const errorMsg =
        lastMsg && "errorMessage" in lastMsg
          ? (lastMsg as Record<string, unknown>).errorMessage
          : "unknown";
      await handleProviderError(ctx, pi, String(errorMsg));
      return;
    }

    await handleAgentEnd(ctx, pi);
  });

  // ── session_before_compact ────────────────────────────────────────────────
  pi.on("session_before_compact", async (_event, _ctx: ExtensionContext) => {
    // Block compaction during auto-mode — each unit is a fresh session
    // Also block during paused state — context is valuable for the user
    if (isAutoActive() || isAutoPaused()) {
      return { cancel: true };
    }

    const basePath = process.cwd();
    const state = await deriveState(basePath);

    // Only save continue.md if we're actively executing a task
    if (!state.activeMilestone || !state.activeSlice || !state.activeTask)
      return;
    if (state.phase !== "executing") return;

    const sDir = resolveSlicePath(
      basePath,
      state.activeMilestone.id,
      state.activeSlice.id,
    );
    if (!sDir) return;

    // Check for existing continue file (new naming or legacy)
    const existingFile = resolveSliceFile(
      basePath,
      state.activeMilestone.id,
      state.activeSlice.id,
      "CONTINUE",
    );
    if (existingFile && (await loadFile(existingFile))) return;
    const legacyContinue = join(sDir, "continue.md");
    if (await loadFile(legacyContinue)) return;

    const continuePath = join(
      sDir,
      buildSliceFileName(state.activeSlice.id, "CONTINUE"),
    );

    const continueData = {
      frontmatter: {
        milestone: state.activeMilestone.id,
        slice: state.activeSlice.id,
        task: state.activeTask.id,
        step: 0,
        totalSteps: 0,
        status: "compacted" as const,
        savedAt: new Date().toISOString(),
      },
      completedWork: `Task ${state.activeTask.id} (${state.activeTask.title}) was in progress when compaction occurred.`,
      remainingWork: "Check the task plan for remaining steps.",
      decisions: "Check task summary files for prior decisions.",
      context: "Session was auto-compacted by Pi. Resume with /kata.",
      nextAction: `Resume task ${state.activeTask.id}: ${state.activeTask.title}.`,
    };

    await saveFile(continuePath, formatContinue(continueData));
  });

  // ── session_shutdown: save activity log on Ctrl+C / SIGTERM ─────────────
  pi.on("session_shutdown", async (_event, ctx: ExtensionContext) => {
    if (!isAutoActive() && !isAutoPaused()) return;

    // Save the current session — the lock file stays on disk
    // so the next /kata auto knows it was interrupted
    const dash = getAutoDashboardData();
    if (dash.currentUnit) {
      saveActivityLog(
        ctx,
        dash.basePath,
        dash.currentUnit.type,
        dash.currentUnit.id,
      );
    }
  });
}

async function buildGuidedExecuteContextInjection(
  prompt: string,
  basePath: string,
): Promise<string | null> {
  const executeMatch = prompt.match(
    /Execute the next task:\s+(T\d+)\s+\("([^"]+)"\)\s+in slice\s+(S\d+)\s+of milestone\s+(M\d+)/i,
  );
  if (executeMatch) {
    const [, taskId, taskTitle, sliceId, milestoneId] = executeMatch;
    return buildTaskExecutionContextInjection(
      basePath,
      milestoneId,
      sliceId,
      taskId,
      taskTitle,
    );
  }

  const resumeMatch = prompt.match(
    /Resume interrupted work\.[\s\S]*?slice\s+(S\d+)\s+of milestone\s+(M\d+)/i,
  );
  if (resumeMatch) {
    const [, sliceId, milestoneId] = resumeMatch;
    const state = await deriveState(basePath);
    if (
      state.activeMilestone?.id === milestoneId &&
      state.activeSlice?.id === sliceId &&
      state.activeTask
    ) {
      return buildTaskExecutionContextInjection(
        basePath,
        milestoneId,
        sliceId,
        state.activeTask.id,
        state.activeTask.title,
      );
    }
  }

  return null;
}

async function buildTaskExecutionContextInjection(
  basePath: string,
  milestoneId: string,
  sliceId: string,
  taskId: string,
  taskTitle: string,
): Promise<string> {
  const taskPlanPath = resolveTaskFile(
    basePath,
    milestoneId,
    sliceId,
    taskId,
    "PLAN",
  );
  const taskPlanRelPath = relTaskFile(
    basePath,
    milestoneId,
    sliceId,
    taskId,
    "PLAN",
  );
  const taskPlanContent = taskPlanPath ? await loadFile(taskPlanPath) : null;
  const taskPlanInline = taskPlanContent
    ? [
        "## Inlined Task Plan (authoritative local execution contract)",
        `Source: \`${taskPlanRelPath}\``,
        "",
        taskPlanContent.trim(),
      ].join("\n")
    : [
        "## Inlined Task Plan (authoritative local execution contract)",
        `Task plan not found at dispatch time. Read \`${taskPlanRelPath}\` before executing.`,
      ].join("\n");

  const slicePlanPath = resolveSliceFile(
    basePath,
    milestoneId,
    sliceId,
    "PLAN",
  );
  const slicePlanRelPath = relSliceFile(basePath, milestoneId, sliceId, "PLAN");
  const slicePlanContent = slicePlanPath ? await loadFile(slicePlanPath) : null;
  const slicePlanExcerpt = extractSliceExecutionExcerpt(
    slicePlanContent,
    slicePlanRelPath,
  );

  const priorTaskLines = await buildCarryForwardLines(
    basePath,
    milestoneId,
    sliceId,
    taskId,
  );
  const resumeSection = await buildResumeSection(
    basePath,
    milestoneId,
    sliceId,
  );

  return [
    "[Kata Guided Execute Context]",
    "Use this injected context as startup context for guided task execution. Treat the inlined task plan as the authoritative local execution contract. Use source artifacts to verify details and run checks.",
    "",
    resumeSection,
    "",
    "## Carry-Forward Context",
    ...priorTaskLines,
    "",
    taskPlanInline,
    "",
    slicePlanExcerpt,
    "",
    "## Backing Source Artifacts",
    `- Slice plan: \`${slicePlanRelPath}\``,
    `- Task plan source: \`${taskPlanRelPath}\``,
  ].join("\n");
}

async function buildCarryForwardLines(
  basePath: string,
  milestoneId: string,
  sliceId: string,
  taskId: string,
): Promise<string[]> {
  const tDir = resolveTasksDir(basePath, milestoneId, sliceId);
  if (!tDir) return ["- No prior task summaries in this slice."];

  const currentNum = parseInt(taskId.replace(/^T/, ""), 10);
  const sRel = relSlicePath(basePath, milestoneId, sliceId);
  const summaryFiles = resolveTaskFiles(tDir, "SUMMARY")
    .filter((file) => parseInt(file.replace(/^T/, ""), 10) < currentNum)
    .sort();

  if (summaryFiles.length === 0)
    return ["- No prior task summaries in this slice."];

  const lines = await Promise.all(
    summaryFiles.map(async (file) => {
      const absPath = join(tDir, file);
      const content = await loadFile(absPath);
      const relPath = `${sRel}/tasks/${file}`;
      if (!content) return `- \`${relPath}\``;

      const summary = parseSummary(content);
      const provided = summary.frontmatter.provides.slice(0, 2).join("; ");
      const decisions = summary.frontmatter.key_decisions
        .slice(0, 2)
        .join("; ");
      const patterns = summary.frontmatter.patterns_established
        .slice(0, 2)
        .join("; ");
      const diagnostics = extractMarkdownSection(content, "Diagnostics");

      const parts = [summary.title || relPath];
      if (summary.oneLiner) parts.push(summary.oneLiner);
      if (provided) parts.push(`provides: ${provided}`);
      if (decisions) parts.push(`decisions: ${decisions}`);
      if (patterns) parts.push(`patterns: ${patterns}`);
      if (diagnostics) parts.push(`diagnostics: ${oneLine(diagnostics)}`);

      return `- \`${relPath}\` — ${parts.join(" | ")}`;
    }),
  );

  return lines;
}

async function buildResumeSection(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): Promise<string> {
  const continueFile = resolveSliceFile(
    basePath,
    milestoneId,
    sliceId,
    "CONTINUE",
  );
  const legacyDir = resolveSlicePath(basePath, milestoneId, sliceId);
  const legacyPath = legacyDir ? join(legacyDir, "continue.md") : null;
  const continueContent = continueFile ? await loadFile(continueFile) : null;
  const legacyContent =
    !continueContent && legacyPath ? await loadFile(legacyPath) : null;
  const resolvedContent = continueContent ?? legacyContent;
  const resolvedRelPath = continueContent
    ? relSliceFile(basePath, milestoneId, sliceId, "CONTINUE")
    : legacyPath
      ? `${relSlicePath(basePath, milestoneId, sliceId)}/continue.md`
      : null;

  if (!resolvedContent || !resolvedRelPath) {
    return [
      "## Resume State",
      "- No continue file present. Start from the top of the task plan.",
    ].join("\n");
  }

  const cont = parseContinue(resolvedContent);
  const lines = [
    "## Resume State",
    `Source: \`${resolvedRelPath}\``,
    `- Status: ${cont.frontmatter.status || "in_progress"}`,
  ];

  if (cont.frontmatter.step && cont.frontmatter.totalSteps) {
    lines.push(
      `- Progress: step ${cont.frontmatter.step} of ${cont.frontmatter.totalSteps}`,
    );
  }
  if (cont.completedWork)
    lines.push(`- Completed: ${oneLine(cont.completedWork)}`);
  if (cont.remainingWork)
    lines.push(`- Remaining: ${oneLine(cont.remainingWork)}`);
  if (cont.decisions) lines.push(`- Decisions: ${oneLine(cont.decisions)}`);
  if (cont.nextAction) lines.push(`- Next action: ${oneLine(cont.nextAction)}`);

  return lines.join("\n");
}

