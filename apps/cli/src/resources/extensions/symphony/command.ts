import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { loadEffectiveKataPreferences } from "../kata/preferences.js";
import type { SymphonyClient } from "./client.js";
import type { ConsoleManager } from "./console.js";
import { runConfigEditor } from "./config-editor.js";
import {
  parseWorkflowConfig,
  WorkflowConfigParseError,
} from "./config-parser.js";
import { validateConfigModel } from "./config-validator.js";
import { writeWorkflowConfigFile } from "./config-writer.js";
import {
  renderSymphonyCommandError,
  renderSymphonyStatus,
  renderSymphonyUsage,
  renderSymphonyWatchEmpty,
  renderSymphonyWatchEvent,
  renderSymphonyWatchStart,
  renderSymphonyWatchSummary,
} from "./render.js";
import { isSymphonyError } from "./types.js";

const DEFAULT_WATCH_TIMEOUT_MS = 30_000;
const DEFAULT_WATCH_MAX_EVENTS = 50;

export type SymphonyCommandAction =
  | { type: "usage" }
  | { type: "status" }
  | {
      type: "watch";
      issue: string;
      maxEvents?: number;
      timeoutMs?: number;
    }
  | {
      type: "config";
      workflowPathArg?: string;
    }
  | {
      type: "console";
      mode: "toggle" | "off" | "refresh";
    };

export interface SymphonyCommandSink {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export interface SymphonyCommandOptions {
  now?: () => number;
  defaultWatchTimeoutMs?: number;
  defaultWatchMaxEvents?: number;
}

export function parseSymphonyCommand(input: string): SymphonyCommandAction {
  const tokens = tokenize(input);

  if (tokens.length === 0 || tokens[0] === "help") {
    return { type: "usage" };
  }

  if (tokens[0] === "status") {
    return { type: "status" };
  }

  if (tokens[0] === "config") {
    const workflowPathArg = input.trim().slice("config".length).trim();
    return {
      type: "config",
      ...(workflowPathArg ? { workflowPathArg } : {}),
    };
  }

  if (tokens[0] === "console") {
    const modeToken = tokens[1]?.toLowerCase();

    if (!modeToken) {
      return { type: "console", mode: "toggle" };
    }

    if (modeToken === "off" || modeToken === "close") {
      return { type: "console", mode: "off" };
    }

    if (modeToken === "refresh") {
      return { type: "console", mode: "refresh" };
    }

    return { type: "usage" };
  }

  if (tokens[0] === "watch") {
    const issue = tokens[1]?.trim().toUpperCase();
    if (!issue) {
      return { type: "usage" };
    }

    const parsedFlags = parseWatchFlags(tokens.slice(2));
    if (!parsedFlags.ok) {
      return { type: "usage" };
    }

    return {
      type: "watch",
      issue,
      ...(parsedFlags.maxEvents ? { maxEvents: parsedFlags.maxEvents } : {}),
      ...(parsedFlags.timeoutMs ? { timeoutMs: parsedFlags.timeoutMs } : {}),
    };
  }

  return { type: "usage" };
}

export async function executeSymphonyCommand(
  action: SymphonyCommandAction,
  client: SymphonyClient,
  sink: SymphonyCommandSink,
  options: SymphonyCommandOptions = {},
): Promise<void> {
  const now = options.now ?? Date.now;

  try {
    if (action.type === "usage") {
      sink.info(renderSymphonyUsage());
      return;
    }

    if (action.type === "status") {
      const state = await client.getState();
      sink.info(renderSymphonyStatus(state));
      return;
    }

    if (action.type === "config" || action.type === "console") {
      sink.info(renderSymphonyUsage());
      return;
    }

    const timeoutMs =
      action.timeoutMs ?? options.defaultWatchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS;
    const maxEvents =
      action.maxEvents ?? options.defaultWatchMaxEvents ?? DEFAULT_WATCH_MAX_EVENTS;

    sink.info(renderSymphonyWatchStart(action.issue, { timeoutMs, maxEvents }));

    const startedAt = now();
    let received = 0;

    for await (const event of client.watchEvents(
      { issue: action.issue },
      { timeoutMs, maxEvents },
    )) {
      sink.info(renderSymphonyWatchEvent(event));
      received += 1;
    }

    const elapsedMs = now() - startedAt;
    if (received === 0) {
      sink.warning(renderSymphonyWatchEmpty(action.issue, timeoutMs));
      return;
    }

    sink.info(renderSymphonyWatchSummary(action.issue, received, elapsedMs));
  } catch (error) {
    if (isSymphonyError(error)) {
      sink.error(renderSymphonyCommandError(error));
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    sink.error(`symphony_command_failed: ${message}`);
  }
}

export function registerSymphonyCommand(
  pi: ExtensionAPI,
  client: SymphonyClient,
  consoleManager?: ConsoleManager,
): void {
  pi.registerCommand("symphony", {
    description: "Symphony operator workflows: status, watch, config, console",
    getArgumentCompletions(prefix: string) {
      const tokens = tokenize(prefix);

      if (tokens.length <= 1) {
        const options = ["status", "watch", "config", "console"];
        const query = tokens[0] ?? "";
        return options
          .filter((option) => option.startsWith(query))
          .map((value) => ({ value, label: value }));
      }

      if (tokens[0] === "watch" && tokens.length <= 2) {
        return [{ value: "watch KAT-920", label: "watch <ISSUE>" }];
      }

      if (tokens[0] === "watch") {
        return [
          { value: "--max-events", label: "--max-events <n>" },
          { value: "--timeout-ms", label: "--timeout-ms <ms>" },
        ];
      }

      if (tokens[0] === "config" && tokens.length <= 2) {
        return [{ value: "config WORKFLOW.md", label: "config [WORKFLOW.md]" }];
      }

      if (tokens[0] === "console" && tokens.length <= 2) {
        return [
          { value: "console", label: "console" },
          { value: "console off", label: "console off" },
          { value: "console refresh", label: "console refresh" },
        ];
      }

      return [];
    },
    handler: async (args, ctx) => {
      const action = parseSymphonyCommand(args);

      if (action.type === "config") {
        await executeSymphonyConfigCommand(action, client, ctx);
        return;
      }

      if (action.type === "console") {
        if (!consoleManager) {
          ctx.ui.notify(
            "Symphony console manager is unavailable in this session.",
            "error",
          );
          return;
        }

        if (action.mode === "off") {
          consoleManager.close(ctx);
          return;
        }

        if (action.mode === "refresh") {
          if (!consoleManager.isActive()) {
            ctx.ui.notify(
              "Symphony console is not active. Run /symphony console first.",
              "warning",
            );
            return;
          }
          await consoleManager.refresh(ctx);
          ctx.ui.notify("Symphony console refreshed.", "info");
          return;
        }

        const result = await consoleManager.toggle(ctx);
        if (result === "opened") {
          ctx.ui.notify("Symphony console opened.", "info");
        } else {
          ctx.ui.notify("Symphony console closed.", "info");
        }
        return;
      }

      await executeSymphonyCommand(
        action,
        client,
        {
          info: (message) => ctx.ui.notify(message, "info"),
          warning: (message) => ctx.ui.notify(message, "warning"),
          error: (message) => ctx.ui.notify(message, "error"),
        },
        {
          now: Date.now,
        },
      );
    },
  });
}

export async function executeSymphonyConfigCommand(
  action: Extract<SymphonyCommandAction, { type: "config" }>,
  client: SymphonyClient,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const resolvedPath = resolveWorkflowPath(action.workflowPathArg, process.cwd());

  if (!resolvedPath.ok) {
    ctx.ui.notify(resolvedPath.message, "error");
    return;
  }

  const workflowPath = resolvedPath.path;
  let content: string;
  try {
    content = readFileSync(workflowPath, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Unable to read ${workflowPath}: ${message}`, "error");
    return;
  }

  let model;
  try {
    model = parseWorkflowConfig(content, { filePath: workflowPath });
  } catch (error) {
    if (error instanceof WorkflowConfigParseError) {
      const lineInfo = error.line ? ` (line ${error.line})` : "";
      ctx.ui.notify(`Failed to parse YAML frontmatter${lineInfo}: ${error.message}`, "error");
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to parse ${workflowPath}: ${message}`, "error");
    return;
  }

  ctx.ui.notify(`config_editor_opened: ${workflowPath}`, "info");

  const editorResult = await runConfigEditor(
    model,
    {
      select: (title, options) => ctx.ui.select(title, options),
      input: (title, placeholder) => ctx.ui.input(title, placeholder),
      confirm: (title, message) => ctx.ui.confirm(title, message),
      editor: (title, prefill) => ctx.ui.editor(title, prefill),
      notify: (message, type) => ctx.ui.notify(message, type),
    },
    {
      workflowPath,
      connectionStatus: resolveConnectionStatus(client),
    },
  );

  if (editorResult.type === "cancelled") {
    ctx.ui.notify("Config editor cancelled.", "warning");
    return;
  }

  const validationIssues = validateConfigModel(editorResult.model, {
    workflowDir: dirname(workflowPath),
  });

  if (validationIssues.length > 0) {
    const summary = validationIssues
      .slice(0, 20)
      .map((issue) => `- ${issue.path}: ${issue.message}`)
      .join("\n");

    ctx.ui.notify(`config_editor_validation_failed\n${summary}`, "error");
    return;
  }

  try {
    writeWorkflowConfigFile(workflowPath, editorResult.model);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to write ${workflowPath}: ${message}`, "error");
    return;
  }

  const diffLines = editorResult.changes.slice(0, 20).join("\n");
  ctx.ui.notify(
    `config_editor_saved: ${workflowPath}\n${editorResult.changes.length} change(s)\n${diffLines}`,
    "info",
  );
}

function tokenize(input: string): string[] {
  return input
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseWatchFlags(tokens: string[]):
  | { ok: true; timeoutMs?: number; maxEvents?: number }
  | { ok: false } {
  let timeoutMs: number | undefined;
  let maxEvents: number | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--timeout-ms") {
      const raw = tokens[index + 1];
      const parsed = Number(raw);
      if (!raw || !Number.isFinite(parsed) || parsed <= 0) {
        return { ok: false };
      }
      timeoutMs = parsed;
      index += 1;
      continue;
    }

    if (token === "--max-events") {
      const raw = tokens[index + 1];
      const parsed = Number(raw);
      if (!raw || !Number.isFinite(parsed) || parsed <= 0) {
        return { ok: false };
      }
      maxEvents = parsed;
      index += 1;
      continue;
    }

    return { ok: false };
  }

  return {
    ok: true,
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(maxEvents ? { maxEvents } : {}),
  };
}

function resolveConnectionStatus(client: SymphonyClient): string {
  try {
    const config = client.getConnectionConfig();
    return `${config.url} (${config.origin})`;
  } catch {
    return "not configured";
  }
}

export function resolveWorkflowPath(
  workflowPathArg: string | undefined,
  cwd: string,
  preferences: ReturnType<typeof loadEffectiveKataPreferences>["preferences"] | null =
    loadEffectiveKataPreferences(cwd)?.preferences ?? null,
): { ok: true; path: string } | { ok: false; message: string } {
  if (workflowPathArg) {
    const explicit = toAbsolutePath(workflowPathArg, cwd);
    if (!existsSync(explicit)) {
      return {
        ok: false,
        message: `Workflow file not found: ${explicit}`,
      };
    }
    return { ok: true, path: explicit };
  }

  const configuredPath = preferences?.symphony?.workflow_path;
  if (configuredPath) {
    const preferred = toAbsolutePath(configuredPath, cwd);
    if (!existsSync(preferred)) {
      return {
        ok: false,
        message: `Configured symphony.workflow_path does not exist: ${preferred}`,
      };
    }
    return { ok: true, path: preferred };
  }

  const localDefault = join(cwd, "WORKFLOW.md");
  if (existsSync(localDefault)) {
    return { ok: true, path: localDefault };
  }

  return {
    ok: false,
    message:
      "No WORKFLOW.md path is known. Pass `/symphony config <path>` or set `symphony.workflow_path` in preferences.",
  };
}

function toAbsolutePath(target: string, cwd: string): string {
  const expanded =
    target === "~" || target.startsWith("~/")
      ? join(homedir(), target === "~" ? "" : target.slice(2))
      : target;

  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}
