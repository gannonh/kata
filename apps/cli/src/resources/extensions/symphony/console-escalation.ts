import type { SymphonyClient } from "./client.js";
import type { EscalationDisplayItem } from "./console-state.js";
import { isSymphonyError } from "./types.js";

export interface EscalationResponseRouterOptions {
  trigger?: string;
  responderId?: string;
  now?: () => number;
}

export interface EscalationRouteResult {
  handled: boolean;
  status: "ignored" | "sent" | "queued" | "rejected";
  message: string;
  requestId?: string;
}

interface QueuedResponse {
  requestId: string;
  responseText: string;
  queuedAt: number;
}

export class EscalationResponseRouter {
  private readonly trigger: string;
  private readonly responderId?: string;
  private readonly now: () => number;
  private readonly queue: QueuedResponse[] = [];

  constructor(
    private readonly client: SymphonyClient,
    options: EscalationResponseRouterOptions = {},
  ) {
    this.trigger = (options.trigger ?? "!respond").trim();
    this.responderId = options.responderId;
    this.now = options.now ?? Date.now;
  }

  matches(input: string): boolean {
    return input.trim().startsWith(this.trigger);
  }

  pendingQueueSize(): number {
    return this.queue.length;
  }

  async routeInput(
    input: string,
    escalations: EscalationDisplayItem[],
    connected: boolean,
  ): Promise<EscalationRouteResult> {
    if (!this.matches(input)) {
      return {
        handled: false,
        status: "ignored",
        message: "",
      };
    }

    const parsed = parseResponseCommand(this.trigger, input, escalations);
    if (!parsed.ok) {
      return {
        handled: true,
        status: "rejected",
        message: parsed.message,
      };
    }

    if (!connected) {
      this.queue.push({
        requestId: parsed.requestId,
        responseText: parsed.responseText,
        queuedAt: this.now(),
      });
      return {
        handled: true,
        status: "queued",
        requestId: parsed.requestId,
        message: `Connection lost — queued response for ${parsed.requestId}.`,
      };
    }

    return this.submit(parsed.requestId, parsed.responseText);
  }

  async flushQueue(
    escalations: EscalationDisplayItem[],
    connected: boolean,
  ): Promise<EscalationRouteResult[]> {
    if (!connected || this.queue.length === 0) {
      return [];
    }

    const pendingIds = new Set(escalations.map((entry) => entry.requestId));
    const queued = this.queue.splice(0, this.queue.length);

    const results: EscalationRouteResult[] = [];

    for (const entry of queued) {
      if (!pendingIds.has(entry.requestId)) {
        results.push({
          handled: true,
          status: "rejected",
          requestId: entry.requestId,
          message: `Queued escalation ${entry.requestId} is no longer pending.`,
        });
        continue;
      }

      results.push(await this.submit(entry.requestId, entry.responseText));
    }

    return results;
  }

  private async submit(
    requestId: string,
    responseText: string,
  ): Promise<EscalationRouteResult> {
    try {
      const response = await this.client.respondToEscalation(
        requestId,
        {
          source: "symphony-console",
          response: responseText,
        },
        this.responderId,
      );

      if (response.ok) {
        return {
          handled: true,
          status: "sent",
          requestId,
          message: `Escalation response sent for ${requestId}.`,
        };
      }

      if (response.status === 404) {
        return {
          handled: true,
          status: "rejected",
          requestId,
          message: `Escalation ${requestId} timed out before the response was submitted.`,
        };
      }

      if (response.status === 409) {
        return {
          handled: true,
          status: "rejected",
          requestId,
          message: `Escalation ${requestId} was already resolved by another responder.`,
        };
      }

      return {
        handled: true,
        status: "rejected",
        requestId,
        message: `Escalation response failed for ${requestId} (HTTP ${response.status}).`,
      };
    } catch (error) {
      if (isSymphonyError(error) && error.context.retryable) {
        this.queue.push({
          requestId,
          responseText,
          queuedAt: this.now(),
        });

        return {
          handled: true,
          status: "queued",
          requestId,
          message: `Connection lost — queued response for ${requestId}.`,
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      return {
        handled: true,
        status: "rejected",
        requestId,
        message: `Failed to submit escalation response for ${requestId}: ${message}`,
      };
    }
  }
}

function parseResponseCommand(
  trigger: string,
  input: string,
  escalations: EscalationDisplayItem[],
):
  | { ok: true; requestId: string; responseText: string }
  | { ok: false; message: string } {
  const remainder = input.trim().slice(trigger.length).trim();

  if (!remainder) {
    return {
      ok: false,
      message: `Usage: ${trigger} <answer> or ${trigger} <request-id|index> <answer>`,
    };
  }

  if (escalations.length === 0) {
    return {
      ok: false,
      message: "No pending escalations to respond to.",
    };
  }

  if (escalations.length === 1) {
    const single = escalations[0];
    const tokens = remainder.split(/\s+/);
    const first = tokens[0] ?? "";

    if ((first === "1" || first === single.requestId) && tokens.length > 1) {
      const responseText = remainder.slice(first.length).trim();
      if (!responseText) {
        return {
          ok: false,
          message: "Response text is required after the escalation selector.",
        };
      }

      return {
        ok: true,
        requestId: single.requestId,
        responseText,
      };
    }

    return {
      ok: true,
      requestId: single.requestId,
      responseText: remainder,
    };
  }

  const [selector, ...restTokens] = remainder.split(/\s+/);
  if (!selector || restTokens.length === 0) {
    return {
      ok: false,
      message:
        `Multiple escalations pending. Use ${trigger} <request-id|index> <answer> to choose one.`,
    };
  }

  const selected = resolveEscalationSelector(selector, escalations);
  if (!selected.ok) {
    return {
      ok: false,
      message: selected.message,
    };
  }

  const responseText = restTokens.join(" ").trim();
  if (!responseText) {
    return {
      ok: false,
      message: "Response text cannot be empty.",
    };
  }

  return {
    ok: true,
    requestId: selected.requestId,
    responseText,
  };
}

function resolveEscalationSelector(
  selector: string,
  escalations: EscalationDisplayItem[],
):
  | { ok: true; requestId: string }
  | { ok: false; message: string } {
  const parsedIndex = Number(selector);
  if (Number.isInteger(parsedIndex) && parsedIndex > 0) {
    const selected = escalations[parsedIndex - 1];
    if (!selected) {
      return {
        ok: false,
        message: `Escalation index ${selector} is out of range.`,
      };
    }

    return {
      ok: true,
      requestId: selected.requestId,
    };
  }

  const matches = escalations.filter((entry) =>
    matchesEscalationSelector(selector, [entry]),
  );

  if (matches.length === 1) {
    return {
      ok: true,
      requestId: matches[0].requestId,
    };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      message: `Escalation selector ${selector} is ambiguous. Use the full request id or index.`,
    };
  }

  return {
    ok: false,
    message: `Unknown escalation selector ${selector}.`,
  };
}

function matchesEscalationSelector(
  selector: string,
  escalations: EscalationDisplayItem[],
): boolean {
  return escalations.some((entry) => entry.requestId.startsWith(selector));
}
