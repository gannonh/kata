import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SymphonyClient } from "./client.js";
import {
  isSymphonyError,
  type SymphonyCapabilityDetails,
  type SymphonyConnectionDetails,
  type SymphonyToolCapabilities,
  type SymphonyToolDetails,
} from "./types.js";

function capabilityAvailable(reason?: string): SymphonyCapabilityDetails {
  return {
    available: true,
    ...(reason ? { reason } : {}),
  };
}

function capabilityUnavailable(reason: string): SymphonyCapabilityDetails {
  return {
    available: false,
    code: "capability_unavailable",
    reason,
  };
}

function buildCapabilities(): SymphonyToolCapabilities {
  return {
    status: capabilityAvailable(),
    watch: capabilityAvailable(),
    logs: capabilityUnavailable("logs endpoint not available in this Symphony slice"),
    steer: capabilityUnavailable(
      "steer endpoint not available in this Symphony slice",
    ),
  };
}

function buildConnection(client: SymphonyClient): SymphonyConnectionDetails {
  const config = client.getConnectionConfig();
  return {
    url: config.url,
    origin: config.origin,
    connected: true,
    endpoint: config.url,
  };
}

function makeToolDetails(client: SymphonyClient): SymphonyToolDetails {
  return {
    connection: buildConnection(client),
    capabilities: buildCapabilities(),
  };
}

export function registerSymphonyTools(pi: ExtensionAPI, client: SymphonyClient): void {
  pi.registerTool({
    name: "symphony_status",
    label: "Symphony Status",
    description:
      "Fetch current Symphony worker/queue state from /api/v1/state.",
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute() {
      try {
        const state = await client.getState();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(state, null, 2),
            },
          ],
          details: makeToolDetails(client),
        };
      } catch (error) {
        const details = makeToolDetails(client);
        if (isSymphonyError(error)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${error.code}: ${error.message}`,
              },
            ],
            details,
            isError: true,
          };
        }

        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `connection_failed: ${message}`,
            },
          ],
          details,
          isError: true,
        };
      }
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("symphony_status")), 0, 0);
    },
  });

  pi.registerTool({
    name: "symphony_watch",
    label: "Symphony Watch",
    description:
      "Watch issue-scoped Symphony events from /api/v1/events.",
    parameters: Type.Object({
      issue: Type.String({ description: "Issue identifier, e.g. KAT-920" }),
      maxEvents: Type.Optional(
        Type.Number({ description: "Maximum events to collect (default 20)" }),
      ),
      timeoutMs: Type.Optional(
        Type.Number({ description: "Watch timeout in milliseconds (default 20000)" }),
      ),
    }),
    async execute(_toolCallId, params) {
      try {
        const events: unknown[] = [];
        const iterator = client.watchEvents(
          { issue: params.issue },
          {
            maxEvents: params.maxEvents,
            timeoutMs: params.timeoutMs,
          },
        );

        for await (const event of iterator) {
          events.push(event);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  issue: params.issue,
                  received: events.length,
                  events,
                },
                null,
                2,
              ),
            },
          ],
          details: makeToolDetails(client),
        };
      } catch (error) {
        const details = makeToolDetails(client);
        if (isSymphonyError(error)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${error.code}: ${error.message}`,
              },
            ],
            details,
            isError: true,
          };
        }

        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `stream_closed: ${message}`,
            },
          ],
          details,
          isError: true,
        };
      }
    },
    renderCall(args, theme) {
      const issue = typeof args.issue === "string" ? args.issue : "?";
      return new Text(
        theme.fg("toolTitle", theme.bold("symphony_watch ")) +
          theme.fg("accent", issue),
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "symphony_logs",
    label: "Symphony Logs",
    description:
      "Reserved tool surface for Symphony log retrieval. Returns deterministic capability status until endpoint is available.",
    parameters: Type.Object({
      issue: Type.Optional(
        Type.String({ description: "Issue identifier to scope logs" }),
      ),
    }),
    async execute() {
      return {
        content: [
          {
            type: "text" as const,
            text: "capability_unavailable: Symphony logs endpoint is not available yet.",
          },
        ],
        details: makeToolDetails(client),
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("symphony_logs")), 0, 0);
    },
  });

  pi.registerTool({
    name: "symphony_steer",
    label: "Symphony Steer",
    description:
      "Reserved tool surface for Symphony steering commands. Returns deterministic capability status until endpoint is available.",
    parameters: Type.Object({
      issue: Type.String({ description: "Issue identifier to steer" }),
      instruction: Type.String({ description: "Steering instruction" }),
    }),
    async execute() {
      return {
        content: [
          {
            type: "text" as const,
            text: "capability_unavailable: Symphony steer endpoint is not available yet.",
          },
        ],
        details: makeToolDetails(client),
      };
    },
    renderCall(args, theme) {
      const issue = typeof args.issue === "string" ? args.issue : "?";
      return new Text(
        theme.fg("toolTitle", theme.bold("symphony_steer ")) +
          theme.fg("accent", issue),
        0,
        0,
      );
    },
  });
}
