import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SymphonyClient } from "./client.js";
import {
  isSymphonyError,
  SymphonyError,
  type SymphonyCapabilityDetails,
  type SymphonyConfigOrigin,
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
    logs: capabilityUnavailable(
      "logs endpoint is not available yet in Symphony server",
    ),
    steer: capabilityUnavailable(
      "steer endpoint is not available yet in Symphony server",
    ),
  };
}

function getConnectionFromClient(client: SymphonyClient): SymphonyConnectionDetails {
  const config = client.getConnectionConfig();
  return {
    url: config.url,
    origin: config.origin,
    connected: true,
    endpoint: config.url,
  };
}

function getFallbackConnection(
  error?: unknown,
): SymphonyConnectionDetails {
  const symphonyError = isSymphonyError(error) ? error : null;

  const origin =
    (symphonyError?.context.origin as SymphonyConfigOrigin | undefined) ??
    "preferences";

  return {
    url: symphonyError?.context.endpoint ?? "",
    origin,
    connected: false,
    ...(symphonyError?.context.endpoint
      ? { endpoint: symphonyError.context.endpoint }
      : {}),
  };
}

function makeToolDetails(
  client: SymphonyClient,
  options: {
    error?: unknown;
    connected?: boolean;
  } = {},
): SymphonyToolDetails {
  let baseConnection: SymphonyConnectionDetails;

  if (options.error) {
    baseConnection = getFallbackConnection(options.error);
  } else {
    try {
      baseConnection = getConnectionFromClient(client);
    } catch (error) {
      baseConnection = getFallbackConnection(error);
    }
  }

  return {
    connection: {
      ...baseConnection,
      connected: options.connected ?? baseConnection.connected,
    },
    capabilities: buildCapabilities(),
  };
}

function capabilityUnavailablePayload(
  capability: "logs" | "steer",
  message: string,
) {
  return {
    ok: false,
    code: "capability_unavailable",
    capability,
    message,
  };
}

export function registerSymphonyTools(pi: ExtensionAPI, client: SymphonyClient): void {
  pi.registerTool({
    name: "symphony_status",
    label: "Symphony Status",
    description:
      "Fetch live Symphony worker/queue state from /api/v1/state.",
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute() {
      try {
        const state = await client.getState();
        const runningWorkers = Object.keys(state.running ?? {}).length;
        const retryQueue = state.retry_queue?.length ?? 0;
        const completed = state.completed?.length ?? 0;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  summary: {
                    runningWorkers,
                    retryQueue,
                    completed,
                  },
                  state,
                },
                null,
                2,
              ),
            },
          ],
          details: makeToolDetails(client),
        };
      } catch (error) {
        if (isSymphonyError(error)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${error.code}: ${error.message}`,
              },
            ],
            details: makeToolDetails(client, { error, connected: false }),
            isError: true,
          };
        }

        const fallback = new SymphonyError(
          error instanceof Error ? error.message : String(error),
          {
            code: "connection_failed",
            reason: "status_execution_failed",
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `${fallback.code}: ${fallback.message}`,
            },
          ],
          details: makeToolDetails(client, { error: fallback, connected: false }),
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
      "Watch issue-scoped Symphony event stream from /api/v1/events.",
    parameters: Type.Object(
      {
        issue: Type.String({ description: "Issue identifier, e.g. KAT-920" }),
        maxEvents: Type.Optional(
          Type.Number({ description: "Maximum events to capture (default 25)" }),
        ),
        timeoutMs: Type.Optional(
          Type.Number({ description: "Watch timeout in milliseconds (default 30000)" }),
        ),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params) {
      try {
        const maxEvents =
          typeof params.maxEvents === "number" && params.maxEvents > 0
            ? params.maxEvents
            : 25;
        const timeoutMs =
          typeof params.timeoutMs === "number" && params.timeoutMs > 0
            ? params.timeoutMs
            : 30_000;

        const events: unknown[] = [];
        const iterator = client.watchEvents(
          { issue: params.issue },
          {
            maxEvents,
            timeoutMs,
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
                  ok: true,
                  issue: params.issue,
                  received: events.length,
                  timeoutMs,
                  maxEvents,
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
        if (isSymphonyError(error)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${error.code}: ${error.message}`,
              },
            ],
            details: makeToolDetails(client, { error, connected: false }),
            isError: true,
          };
        }

        const fallback = new SymphonyError(
          error instanceof Error ? error.message : String(error),
          {
            code: "stream_closed",
            reason: "watch_execution_failed",
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `${fallback.code}: ${fallback.message}`,
            },
          ],
          details: makeToolDetails(client, { error: fallback, connected: false }),
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
      "Capability-safe placeholder for future Symphony log retrieval endpoint.",
    parameters: Type.Object(
      {
        issue: Type.Optional(
          Type.String({ description: "Issue identifier to scope log retrieval" }),
        ),
        limit: Type.Optional(
          Type.Number({ description: "Optional line limit for future endpoint" }),
        ),
      },
      { additionalProperties: false },
    ),
    async execute() {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              capabilityUnavailablePayload(
                "logs",
                "Symphony log retrieval endpoint is unavailable in this server version.",
              ),
              null,
              2,
            ),
          },
        ],
        details: makeToolDetails(client, { connected: false }),
        isError: true,
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
      "Capability-safe placeholder for future Symphony steering endpoint.",
    parameters: Type.Object(
      {
        issue: Type.String({ description: "Issue identifier to steer" }),
        instruction: Type.String({ description: "Steering instruction payload" }),
      },
      { additionalProperties: false },
    ),
    async execute() {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              capabilityUnavailablePayload(
                "steer",
                "Symphony steer endpoint is unavailable in this server version.",
              ),
              null,
              2,
            ),
          },
        ],
        details: makeToolDetails(client, { connected: false }),
        isError: true,
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
