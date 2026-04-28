import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { createSymphonyClient } from "./client.js";
import { registerSymphonyCommand } from "./command.js";
import { isSymphonyConfigured } from "./config.js";
import { createConsoleManager } from "./console.js";
import { EscalationQueue } from "./escalation.js";
import { registerSymphonyTools } from "./tools.js";
import { isEscalationEvent, isSymphonyError } from "./types.js";

export default function (pi: ExtensionAPI): void {
  const client = createSymphonyClient();
  const consoleManager = createConsoleManager(client);

  registerSymphonyCommand(pi, client, consoleManager);
  registerSymphonyTools(pi, client);

  let escalationAbortController: AbortController | null = null;

  pi.registerShortcut(Key.ctrlAlt("s"), {
    description: "Refresh Symphony console panel",
    handler: async (ctx) => {
      consoleManager.setContext(ctx as unknown as ExtensionCommandContext);

      if (!consoleManager.isActive()) {
        ctx.ui.notify(
          "Symphony console is not active. Run /symphony console first.",
          "warning",
        );
        return;
      }

      await consoleManager.refresh(ctx as unknown as ExtensionCommandContext);
      ctx.ui.notify("Symphony console refreshed.", "info");
    },
  });

  pi.on("input", async (event, ctx) => {
    consoleManager.setContext(ctx as unknown as ExtensionCommandContext);
    const handled = await consoleManager.handleInput(
      event.text,
      ctx as unknown as ExtensionCommandContext,
    );

    if (handled) {
      return { action: "handled" as const };
    }

    return { action: "continue" as const };
  });

  pi.on("session_start", async (_event, ctx) => {
    consoleManager.setContext(ctx as unknown as ExtensionCommandContext);

    if (!isSymphonyConfigured()) return;

    escalationAbortController?.abort();
    const controller = new AbortController();
    escalationAbortController = controller;

    const queue = new EscalationQueue(
      client,
      ctx as unknown as ExtensionCommandContext,
      "kata-cli",
    );

    (async () => {
      try {
        for await (const event of client.watchEvents(
          { type: ["escalation_created", "escalation_timed_out", "escalation_cancelled"] },
          { signal: controller.signal, reconnectAttempts: 5, reconnectDelayMs: 1_000 },
        )) {
          if (isEscalationEvent(event)) {
            if (!consoleManager.isActive()) {
              queue.enqueue(event);
            }
            continue;
          }

          if (event.event === "escalation_timed_out") {
            const requestId = extractRequestId(event.payload);
            if (requestId) {
              queue.removeByRequestId(requestId);
            }

            if (!consoleManager.isActive()) {
              ctx.ui.notify("Escalation timed out — worker continued without answer.", "warning");
            }
          } else if (event.event === "escalation_cancelled") {
            const requestId = extractRequestId(event.payload);
            if (requestId) {
              queue.removeByRequestId(requestId);
            }

            if (!consoleManager.isActive()) {
              ctx.ui.notify("Escalation cancelled.", "warning");
            }
          }
        }
      } catch (error) {
        const aborted =
          controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
        if (aborted) {
          return;
        }

        const expectedDisconnect =
          isSymphonyError(error) &&
          (error.code === "connection_failed" || error.code === "stream_closed");

        const message = error instanceof Error ? error.message : String(error);
        if (!expectedDisconnect) {
          console.warn(`[symphony] escalation watch unexpected failure: ${message}`);
        }

        ctx.ui.notify(`Symphony escalation listener disconnected: ${message}`, "warning");
      }
    })();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    escalationAbortController?.abort();
    escalationAbortController = null;
    consoleManager.dispose(ctx as unknown as ExtensionCommandContext);
  });
}

function extractRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const requestId = (payload as Record<string, unknown>).request_id;
  return typeof requestId === "string" && requestId.length > 0
    ? requestId
    : null;
}
