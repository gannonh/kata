import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { SymphonyClient } from "./client.js";
import {
  renderSymphonyStatus,
  renderSymphonyUsage,
  renderSymphonyWatchEvent,
} from "./render.js";
import { isSymphonyError } from "./types.js";

export type SymphonyCommandAction =
  | { type: "usage" }
  | { type: "status" }
  | { type: "watch"; issue: string };

export function parseSymphonyCommand(input: string): SymphonyCommandAction {
  const tokens = input
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0 || tokens[0] === "help") {
    return { type: "usage" };
  }

  if (tokens[0] === "status") {
    return { type: "status" };
  }

  if (tokens[0] === "watch") {
    const issue = tokens[1] ?? "";
    if (!issue) {
      return { type: "usage" };
    }
    return { type: "watch", issue: issue.toUpperCase() };
  }

  return { type: "usage" };
}

export async function runSymphonyCommand(
  action: SymphonyCommandAction,
  client: SymphonyClient,
  ctx: ExtensionContext,
): Promise<void> {
  try {
    if (action.type === "usage") {
      ctx.ui.notify(renderSymphonyUsage(), "info");
      return;
    }

    if (action.type === "status") {
      const state = await client.getState();
      ctx.ui.notify(renderSymphonyStatus(state), "info");
      return;
    }

    const iterator = client.watchEvents({ issue: action.issue }, {
      timeoutMs: 20_000,
      maxEvents: 20,
    });

    let count = 0;
    for await (const event of iterator) {
      count += 1;
      ctx.ui.notify(renderSymphonyWatchEvent(event), "info");
    }

    if (count === 0) {
      ctx.ui.notify(
        `No events received for ${action.issue} before watch window ended.`,
        "warning",
      );
    }
  } catch (error) {
    if (isSymphonyError(error)) {
      ctx.ui.notify(`${error.code}: ${error.message}`, "error");
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`symphony_command_failed: ${message}`, "error");
  }
}

export function registerSymphonyCommand(pi: ExtensionAPI, client: SymphonyClient): void {
  pi.registerCommand("symphony", {
    description: "Symphony operator workflows: status and watch",
    getArgumentCompletions(prefix: string) {
      const tokens = prefix.trim().split(/\s+/);
      if (tokens.length <= 1) {
        const options = ["status", "watch"];
        const query = tokens[0] ?? "";
        return options
          .filter((option) => option.startsWith(query))
          .map((value) => ({ value, label: value }));
      }

      if (tokens[0] === "watch" && tokens.length <= 2) {
        return [
          { value: "watch KAT-920", label: "watch <ISSUE>" },
        ];
      }

      return [];
    },
    handler: async (args, ctx) => {
      const action = parseSymphonyCommand(args);
      await runSymphonyCommand(action, client, ctx);
    },
  });
}
