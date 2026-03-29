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
 *   session_before_compact — block during auto
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import { registerKataCommand } from "./commands.js";
import { loadPrompt } from "./prompt-loader.js";
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
import { isProjectConfigured } from "./onboarding.js";
import { setHeaderCtx, renderHeader } from "./header.js";
import { Key } from "@mariozechner/pi-tui";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

// Provider error retry is handled in auto.ts — see handleProviderError()

export default function (pi: ExtensionAPI) {
  registerKataCommand(pi);

  // ── session_start: render branded Kata header ───────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    setHeaderCtx(ctx);
    // isProjectConfigured reads prefs from disk — guard against unreadable/corrupt files
    // so a recoverable config issue doesn't prevent the extension from initializing.
    // Note: this is evaluated once at session start. If the user completes onboarding,
    // clearHeaderHint() removes the hint. Mid-session cwd changes won't re-evaluate.
    let configured = false;
    try {
      configured = isProjectConfigured(process.cwd());
    } catch {
      // Prefs file unreadable or corrupt — treat as unconfigured, show hint
    }
    renderHeader(!configured);
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
        const workflowDoc = await readFile(modeGate.protocol.path, "utf-8");
        workflowDocBlock = `\n\n${workflowDoc}`;
      } catch {
        // File disappeared between the existsSync check and the read — skip injection silently
      }
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n[SYSTEM CONTEXT — Kata]\n\n${systemContent}${workflowModeBlock}${preferenceBlock}${newSkillsBlock}${workflowDocBlock}`,
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
    if (isAutoActive() || isAutoPaused()) {
      return { cancel: true };
    }
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
