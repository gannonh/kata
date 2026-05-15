import { WebSocket } from "ws";
import type { SymphonyEventEnvelope } from "./http-client.ts";

export interface EventStreamOptions {
  baseUrl: string;
  onEvent: (event: SymphonyEventEnvelope) => void;
  onError: (error: Error) => void;
}

export interface EventStreamHandle {
  close: () => void;
}

export function eventStreamUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/events`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function startSymphonyEventStream(options: EventStreamOptions): EventStreamHandle {
  const socket = new WebSocket(eventStreamUrl(options.baseUrl));

  socket.on("message", (data) => {
    try {
      options.onEvent(parseEventEnvelope(data.toString()));
    } catch (error) {
      options.onError(error instanceof Error ? error : new Error(String(error)));
    }
  });

  socket.on("error", (error) => {
    options.onError(error instanceof Error ? error : new Error(String(error)));
  });

  return {
    close: () => {
      socket.close();
    },
  };
}

function parseEventEnvelope(text: string): SymphonyEventEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid Symphony event JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(value)) throw new Error("invalid Symphony event: envelope was not an object");
  if (value.version !== "v1") throw new Error("invalid Symphony event: version was not v1");
  if (typeof value.sequence !== "number") throw new Error("invalid Symphony event: sequence was not a number");
  if (typeof value.timestamp !== "string") throw new Error("invalid Symphony event: timestamp was not a string");
  if (typeof value.kind !== "string") throw new Error("invalid Symphony event: kind was not a string");
  if (typeof value.severity !== "string") throw new Error("invalid Symphony event: severity was not a string");
  if (value.issue !== undefined && typeof value.issue !== "string") throw new Error("invalid Symphony event: issue was not a string");
  if (typeof value.event !== "string") throw new Error("invalid Symphony event: event was not a string");

  return {
    version: value.version,
    sequence: value.sequence,
    timestamp: value.timestamp,
    kind: value.kind,
    severity: value.severity,
    issue: value.issue,
    event: value.event,
    payload: value.payload,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
