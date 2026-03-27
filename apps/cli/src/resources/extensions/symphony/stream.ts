import {
  SymphonyError,
  type SymphonyClientLifecycleEvent,
  type SymphonyConnectionConfig,
  type SymphonyEventEnvelope,
  type SymphonyEventFilter,
  type SymphonyEventKind,
  type SymphonyEventSeverity,
  type SymphonyWatchOptions,
} from "./types.js";

const DEFAULT_RECONNECT_ATTEMPTS = 2;
const DEFAULT_RECONNECT_DELAY_MS = 400;
const RETRYABLE_CLOSE_CODES = new Set([1006, 1011, 1012, 1013]);
const NORMAL_CLOSE_CODES = new Set([1000, 1001]);

export interface SymphonyWebSocketLike {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data?: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string; wasClean?: boolean }) => void) | null;
  close(code?: number, reason?: string): void;
}

export type SymphonyWebSocketFactory = (url: string) => SymphonyWebSocketLike;

export interface SymphonyEventStreamOptions extends SymphonyWatchOptions {
  connection: SymphonyConnectionConfig;
  filter: SymphonyEventFilter;
  createWebSocket?: SymphonyWebSocketFactory;
}

interface CloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
}

export async function* streamSymphonyEvents(
  options: SymphonyEventStreamOptions,
): AsyncGenerator<SymphonyEventEnvelope> {
  const reconnectAttempts =
    options.reconnectAttempts ?? DEFAULT_RECONNECT_ATTEMPTS;
  const reconnectDelayMs =
    options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  const maxEvents = options.maxEvents ?? Number.POSITIVE_INFINITY;
  const deadline =
    options.timeoutMs && options.timeoutMs > 0
      ? Date.now() + options.timeoutMs
      : Number.POSITIVE_INFINITY;

  const createWebSocket = options.createWebSocket ?? defaultWebSocketFactory;

  let reconnectAttempt = 0;
  let emitted = 0;

  while (true) {
    if (options.signal?.aborted) {
      return;
    }
    if (Date.now() >= deadline) {
      return;
    }

    const wsUrl = buildSymphonyEventsUrl(options.connection, options.filter);

    const socket = openSocket(wsUrl, createWebSocket, options.connection);

    const queue: SymphonyEventEnvelope[] = [];
    let wake: (() => void) | null = null;
    let open = false;
    let closeInfo: CloseInfo | null = null;
    let terminalError: SymphonyError | null = null;
    let localClose = false;

    const wakeWaiter = () => {
      const waiter = wake;
      wake = null;
      waiter?.();
    };

    socket.onopen = () => {
      open = true;
      const successfulAttempt = reconnectAttempt;
      reconnectAttempt = 0;
      options.onLifecycle?.({
        type: "symphony_client_connected",
        details: {
          url: options.connection.url,
          origin: options.connection.origin,
          connected: true,
          endpoint: wsUrl,
          attempt: successfulAttempt,
        },
      });
      wakeWaiter();
    };

    socket.onmessage = (event) => {
      const decoded = decodeEnvelope(event.data, options.connection, wsUrl);
      if (!decoded.ok) {
        terminalError = decoded.error;
        localClose = true;
        safeClose(socket, 1007, "decode_error");
        options.onLifecycle?.({
          type: "symphony_watch_event_dropped",
          details: {
            reason: "decode_error",
          },
        });
        wakeWaiter();
        return;
      }

      queue.push(decoded.value);
      options.onLifecycle?.({
        type: "symphony_watch_event_received",
        details: {
          sequence: decoded.value.sequence,
          issue: decoded.value.issue,
          kind: decoded.value.kind,
        },
      });
      wakeWaiter();
    };

    socket.onerror = () => {
      if (!terminalError) {
        terminalError = new SymphonyError(
          "Symphony event stream connection failed.",
          {
            code: "connection_failed",
            endpoint: wsUrl,
            origin: options.connection.origin,
            reason: "websocket_error",
            retryable: true,
            attempt: reconnectAttempt,
          },
        );
      }
      wakeWaiter();
    };

    socket.onclose = (event) => {
      closeInfo = {
        code: event.code ?? 1006,
        reason: event.reason ?? "",
        wasClean: event.wasClean ?? false,
      };
      wakeWaiter();
    };

    // Wait for open or immediate failure.
    while (!open && !closeInfo && !terminalError) {
      if (options.signal?.aborted) {
        localClose = true;
        safeClose(socket, 1000, "aborted");
        return;
      }
      if (Date.now() >= deadline) {
        localClose = true;
        safeClose(socket, 1000, "timeout");
        return;
      }
      await waitForSignal(
        () => {
          if (open) return true;
          if (closeInfo) return true;
          if (terminalError) return true;
          return false;
        },
        (resolve) => {
          wake = resolve;
        },
      );
    }

    if (!open) {
      if (terminalError) {
        throw terminalError;
      }

      if (!closeInfo) {
        throw new SymphonyError(
          "Symphony event stream closed before connection opened.",
          {
            code: "stream_closed",
            endpoint: wsUrl,
            origin: options.connection.origin,
            reason: "closed_before_open",
            retryable: true,
            attempt: reconnectAttempt,
          },
        );
      }

      if (!shouldReconnect(closeInfo.code)) {
        throw new SymphonyError(
          "Symphony event stream closed before connection opened.",
          {
            code: "stream_closed",
            endpoint: wsUrl,
            origin: options.connection.origin,
            reason: closeInfo.reason || "closed_before_open",
            status: closeInfo.code,
            retryable: false,
            attempt: reconnectAttempt,
          },
        );
      }
    }

    while (true) {
      while (queue.length > 0) {
        const envelope = queue.shift()!;
        yield envelope;
        emitted += 1;

        if (emitted >= maxEvents) {
          localClose = true;
          safeClose(socket, 1000, "max_events_reached");
          return;
        }
      }

      if (terminalError) {
        throw terminalError;
      }

      if (options.signal?.aborted) {
        localClose = true;
        safeClose(socket, 1000, "aborted");
        return;
      }

      if (Date.now() >= deadline) {
        localClose = true;
        safeClose(socket, 1000, "timeout");
        return;
      }

      if (closeInfo) {
        break;
      }

      await waitForSignal(
        () => queue.length > 0 || !!closeInfo || !!terminalError,
        (resolve) => {
          wake = resolve;
        },
      );
    }

    if (!closeInfo) {
      throw new SymphonyError("Symphony event stream closed unexpectedly.", {
        code: "stream_closed",
        endpoint: wsUrl,
        origin: options.connection.origin,
        reason: "close_missing",
        attempt: reconnectAttempt,
      });
    }

    options.onLifecycle?.({
      type: "symphony_client_disconnected",
      details: {
        url: options.connection.url,
        origin: options.connection.origin,
        connected: false,
        endpoint: wsUrl,
        attempt: reconnectAttempt,
      },
    });

    if (localClose || NORMAL_CLOSE_CODES.has(closeInfo.code)) {
      return;
    }

    if (!shouldReconnect(closeInfo.code)) {
      throw new SymphonyError("Symphony event stream closed.", {
        code: "stream_closed",
        endpoint: wsUrl,
        origin: options.connection.origin,
        reason: closeInfo.reason || "stream_closed",
        status: closeInfo.code,
        retryable: false,
        attempt: reconnectAttempt,
      });
    }

    reconnectAttempt += 1;
    if (reconnectAttempt > reconnectAttempts) {
      throw new SymphonyError(
        "Symphony event stream closed after exhausting reconnect attempts.",
        {
          code: "stream_closed",
          endpoint: wsUrl,
          origin: options.connection.origin,
          reason: closeInfo.reason || "reconnect_exhausted",
          status: closeInfo.code,
          retryable: false,
          attempt: reconnectAttempt,
        },
      );
    }

    options.onLifecycle?.({
      type: "symphony_client_reconnecting",
      details: {
        url: options.connection.url,
        origin: options.connection.origin,
        connected: false,
        reconnecting: true,
        endpoint: wsUrl,
        attempt: reconnectAttempt,
      },
    });

    await delayWithCancellation(
      reconnectDelayMs * reconnectAttempt,
      options.signal,
      deadline,
    );
  }
}

export function buildSymphonyEventsUrl(
  connection: SymphonyConnectionConfig,
  filter: SymphonyEventFilter,
): string {
  const base = new URL("api/v1/events", ensureTrailingSlash(connection.url));

  const issue = toQueryValue(filter.issue, (value) => value.toUpperCase());
  const type = toQueryValue(filter.type);
  const severity = toQueryValue(filter.severity);

  if (issue) base.searchParams.set("issue", issue);
  if (type) base.searchParams.set("type", type);
  if (severity) base.searchParams.set("severity", severity);

  if (base.protocol === "http:") {
    base.protocol = "ws:";
  } else if (base.protocol === "https:") {
    base.protocol = "wss:";
  } else {
    throw new SymphonyError(
      `Unsupported Symphony protocol for WebSocket stream: ${base.protocol}`,
      {
        code: "connection_failed",
        origin: connection.origin,
        endpoint: connection.url,
        reason: "unsupported_protocol",
      },
    );
  }

  return base.toString();
}

function decodeEnvelope(
  payload: unknown,
  connection: SymphonyConnectionConfig,
  endpoint: string,
):
  | { ok: true; value: SymphonyEventEnvelope }
  | { ok: false; error: SymphonyError } {
  const raw =
    typeof payload === "string"
      ? payload
      : payload instanceof ArrayBuffer
        ? new TextDecoder().decode(payload)
        : payload != null
          ? String(payload)
          : "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: new SymphonyError("Failed to decode Symphony event payload.", {
        code: "decode_error",
        endpoint,
        origin: connection.origin,
        reason: "invalid_json",
      }),
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      error: new SymphonyError("Failed to decode Symphony event envelope.", {
        code: "decode_error",
        endpoint,
        origin: connection.origin,
        reason: "invalid_envelope",
      }),
    };
  }

  const obj = parsed as Record<string, unknown>;
  const kind = asEventKind(obj.kind);
  const severity = asEventSeverity(obj.severity);

  if (
    typeof obj.version !== "string" ||
    typeof obj.sequence !== "number" ||
    typeof obj.timestamp !== "string" ||
    !kind ||
    !severity ||
    typeof obj.event !== "string"
  ) {
    return {
      ok: false,
      error: new SymphonyError("Failed to decode Symphony event envelope.", {
        code: "decode_error",
        endpoint,
        origin: connection.origin,
        reason: "invalid_envelope_shape",
      }),
    };
  }

  return {
    ok: true,
    value: {
      version: obj.version,
      sequence: obj.sequence,
      timestamp: obj.timestamp,
      kind,
      severity,
      issue:
        typeof obj.issue === "string"
          ? obj.issue
          : obj.issue == null
            ? null
            : undefined,
      event: obj.event,
      payload: obj.payload,
    },
  };
}

function asEventKind(value: unknown): SymphonyEventKind | null {
  if (typeof value !== "string") return null;
  if (
    value === "snapshot" ||
    value === "runtime" ||
    value === "worker" ||
    value === "tool" ||
    value === "heartbeat" ||
    value === "escalation_created" ||
    value === "escalation_responded" ||
    value === "escalation_timed_out" ||
    value === "escalation_cancelled"
  ) {
    return value;
  }
  return null;
}

function asEventSeverity(value: unknown): SymphonyEventSeverity | null {
  if (typeof value !== "string") return null;
  if (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
  ) {
    return value;
  }
  return null;
}

function openSocket(
  url: string,
  createWebSocket: SymphonyWebSocketFactory,
  connection: SymphonyConnectionConfig,
): SymphonyWebSocketLike {
  try {
    return createWebSocket(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SymphonyError(`Failed to open Symphony stream: ${message}`, {
      code: "connection_failed",
      endpoint: url,
      origin: connection.origin,
      reason: "websocket_open_failed",
      retryable: true,
    });
  }
}

function shouldReconnect(closeCode: number): boolean {
  return RETRYABLE_CLOSE_CODES.has(closeCode);
}

function safeClose(
  socket: SymphonyWebSocketLike,
  code: number,
  reason: string,
): void {
  try {
    socket.close(code, reason);
  } catch {
    // no-op
  }
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function toQueryValue(
  value: unknown,
  mapValue: (value: string) => string = (input) => input,
): string | null {
  if (value === undefined || value === null) return null;

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => mapValue(String(entry).trim()))
      .filter(Boolean);
    return normalized.length > 0 ? normalized.join(",") : null;
  }

  const normalized = mapValue(String(value).trim());
  return normalized.length > 0 ? normalized : null;
}

function defaultWebSocketFactory(url: string): SymphonyWebSocketLike {
  const Constructor = globalThis.WebSocket as
    | (new (url: string) => SymphonyWebSocketLike)
    | undefined;

  if (!Constructor) {
    throw new SymphonyError(
      "WebSocket runtime is unavailable in this environment.",
      {
        code: "connection_failed",
        reason: "websocket_unavailable",
      },
    );
  }

  return new Constructor(url);
}

async function waitForSignal(
  predicate: () => boolean,
  registerWaiter: (resolve: () => void) => void,
): Promise<void> {
  if (predicate()) return;

  await new Promise<void>((resolve) => {
    registerWaiter(resolve);
  });
}

async function delayWithCancellation(
  delayMs: number,
  signal: AbortSignal | undefined,
  deadline: number,
): Promise<void> {
  if (signal?.aborted) {
    return;
  }

  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return;
  }

  const actualDelay = Math.min(delayMs, remaining);

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, actualDelay);

    if (!signal) return;

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
