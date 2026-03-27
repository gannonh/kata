import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SymphonyClient } from "./client.js";
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

export function registerSymphonyCommand(pi: ExtensionAPI, client: SymphonyClient): void {
  pi.registerCommand("symphony", {
    description: "Symphony operator workflows: status and watch",
    getArgumentCompletions(prefix: string) {
      const tokens = tokenize(prefix);

      if (tokens.length <= 1) {
        const options = ["status", "watch"];
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

      return [];
    },
    handler: async (args, ctx) => {
      const action = parseSymphonyCommand(args);

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
