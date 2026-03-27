import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { createSymphonyClient } from "./client.js";
import { registerSymphonyCommand } from "./command.js";
import { EscalationQueue } from "./escalation.js";
import { registerSymphonyTools } from "./tools.js";
import { isEscalationEvent } from "./types.js";

export default function (pi: ExtensionAPI): void {
  const client = createSymphonyClient();

  registerSymphonyCommand(pi, client);
  registerSymphonyTools(pi, client);

  let abortController: AbortController | null = null;

  pi.on("session_start", async (_event, ctx) => {
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;

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
            queue.enqueue(event);
            continue;
          }

          if (event.event === "escalation_timed_out") {
            const requestId = extractRequestId(event.payload);
            if (requestId) {
              queue.removeByRequestId(requestId);
            }
            ctx.ui.notify("Escalation timed out — worker continued without answer.", "warning");
          } else if (event.event === "escalation_cancelled") {
            const requestId = extractRequestId(event.payload);
            if (requestId) {
              queue.removeByRequestId(requestId);
            }
            ctx.ui.notify("Escalation cancelled.", "warning");
          }
        }
      } catch (error) {
        const aborted =
          controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
        if (aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        console.error("[symphony] escalation watch error:", error);
        ctx.ui.notify(`Symphony escalation listener disconnected: ${message}`, "warning");
      }
    })();
  });

  pi.on("session_shutdown", async () => {
    abortController?.abort();
    abortController = null;
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
