import {
  resolveSymphonyConfigFromRuntime,
  type ResolveSymphonyConfigOptions,
} from "./config.js";
import {
  streamSymphonyEvents,
  type SymphonyWebSocketFactory,
} from "./stream.js";
import {
  SymphonyError,
  type SymphonyConnectionConfig,
  type SymphonyEventEnvelope,
  type SymphonyEventFilter,
  type SymphonyOrchestratorState,
  type SymphonyPendingEscalation,
  type SymphonyWatchOptions,
  type SymphonyWorkerSessionInfo,
} from "./types.js";

export interface SymphonySteerResult {
  ok: boolean;
  status: number;
  issue_id?: string;
  issue_identifier?: string;
  delivered?: boolean;
  instruction_preview?: string;
  error?: string;
}

export interface SymphonyClient {
  getConnectionConfig(): SymphonyConnectionConfig;
  getState(signal?: AbortSignal): Promise<SymphonyOrchestratorState>;
  getPendingEscalations(signal?: AbortSignal): Promise<SymphonyPendingEscalation[]>;
  respondToEscalation(
    requestId: string,
    response: unknown,
    responderId?: string,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; status: number }>;
  steer(
    issueIdentifier: string,
    instruction: string,
    signal?: AbortSignal,
  ): Promise<SymphonySteerResult>;
  watchEvents(
    filter: SymphonyEventFilter,
    options?: SymphonyWatchOptions,
  ): AsyncIterable<SymphonyEventEnvelope>;
}

export interface SymphonyClientOptions {
  resolveConfig?: () => SymphonyConnectionConfig;
  fetchImpl?: typeof fetch;
  createWebSocket?: SymphonyWebSocketFactory;
}

export class SymphonyHttpClient implements SymphonyClient {
  private readonly resolveConfig: () => SymphonyConnectionConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly createWebSocket?: SymphonyWebSocketFactory;

  constructor(options: SymphonyClientOptions = {}) {
    this.resolveConfig =
      options.resolveConfig ?? (() => resolveSymphonyConfigFromRuntime());
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.createWebSocket = options.createWebSocket;
  }

  getConnectionConfig(): SymphonyConnectionConfig {
    return this.resolveConfig();
  }

  async getState(signal?: AbortSignal): Promise<SymphonyOrchestratorState> {
    const connection = this.getConnectionConfig();
    const endpoint = buildEndpoint(connection.url, "/api/v1/state");

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal,
      });
    } catch (error) {
      throw normalizeTransportError(error, {
        code: "connection_failed",
        endpoint,
        origin: connection.origin,
        reason: "fetch_failed",
        retryable: true,
      });
    }

    if (!response.ok) {
      throw new SymphonyError(
        `Symphony state request failed with HTTP ${response.status}.`,
        {
          code: "connection_failed",
          endpoint,
          origin: connection.origin,
          status: response.status,
          reason: "http_error",
          retryable: response.status >= 500,
        },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SymphonyError("Failed to decode Symphony state response.", {
        code: "decode_error",
        endpoint,
        origin: connection.origin,
        reason: "invalid_json",
      });
    }

    return decodeState(payload, connection, endpoint);
  }

  async getPendingEscalations(signal?: AbortSignal): Promise<SymphonyPendingEscalation[]> {
    const connection = this.getConnectionConfig();
    const endpoint = buildEndpoint(connection.url, "/api/v1/escalations");

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal,
      });
    } catch (error) {
      throw normalizeTransportError(error, {
        code: "connection_failed",
        endpoint,
        origin: connection.origin,
        reason: "fetch_failed",
        retryable: true,
      });
    }

    if (!response.ok) {
      throw new SymphonyError(
        `Symphony escalation listing failed with HTTP ${response.status}.`,
        {
          code: "connection_failed",
          endpoint,
          origin: connection.origin,
          status: response.status,
          reason: "http_error",
          retryable: response.status >= 500,
        },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SymphonyError("Failed to decode Symphony escalations response.", {
        code: "decode_error",
        endpoint,
        origin: connection.origin,
        reason: "invalid_json",
      });
    }

    if (!isRecord(payload)) {
      throw new SymphonyError("Failed to decode Symphony escalations response.", {
        code: "decode_error",
        endpoint,
        origin: connection.origin,
        reason: "invalid_root",
      });
    }

    const pending = payload.pending;
    if (pending === undefined) {
      return [];
    }

    if (!Array.isArray(pending)) {
      throw new SymphonyError("Failed to decode Symphony escalations response.", {
        code: "decode_error",
        endpoint,
        origin: connection.origin,
        reason: "invalid_shape",
      });
    }

    return pending as SymphonyPendingEscalation[];
  }

  async respondToEscalation(
    requestId: string,
    responsePayload: unknown,
    responderId?: string,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; status: number }> {
    const connection = this.getConnectionConfig();
    const endpoint = buildEndpoint(
      connection.url,
      `/api/v1/escalations/${encodeURIComponent(requestId)}/respond`,
    );

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          response: responsePayload,
          ...(responderId ? { responder_id: responderId } : {}),
        }),
        signal,
      });
    } catch (error) {
      throw normalizeTransportError(error, {
        code: "connection_failed",
        endpoint,
        origin: connection.origin,
        reason: "fetch_failed",
        retryable: true,
      });
    }

    return {
      ok: response.ok,
      status: response.status,
    };
  }

  async steer(
    issueIdentifier: string,
    instruction: string,
    signal?: AbortSignal,
  ): Promise<SymphonySteerResult> {
    const connection = this.getConnectionConfig();
    const endpoint = buildEndpoint(connection.url, "/api/v1/steer");

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          issue_identifier: issueIdentifier,
          instruction,
        }),
        signal,
      });
    } catch (error) {
      throw normalizeTransportError(error, {
        code: "connection_failed",
        endpoint,
        origin: connection.origin,
        reason: "fetch_failed",
        retryable: true,
      });
    }

    const payload = await safeReadJson(response);

    if (response.ok) {
      const parsed = isRecord(payload) ? payload : {};
      return {
        ok: true,
        status: response.status,
        ...(typeof parsed.issue_id === "string" ? { issue_id: parsed.issue_id } : {}),
        ...(typeof parsed.issue_identifier === "string"
          ? { issue_identifier: parsed.issue_identifier }
          : {}),
        ...(typeof parsed.delivered === "boolean" ? { delivered: parsed.delivered } : {}),
        ...(typeof parsed.instruction_preview === "string"
          ? { instruction_preview: parsed.instruction_preview }
          : {}),
      };
    }

    return {
      ok: false,
      status: response.status,
      error: mapSteerError(response.status, payload),
    };
  }

  async *watchEvents(
    filter: SymphonyEventFilter,
    options: SymphonyWatchOptions = {},
  ): AsyncIterable<SymphonyEventEnvelope> {
    const connection = this.getConnectionConfig();

    const iterator = streamSymphonyEvents({
      connection,
      filter: normalizeFilter(filter),
      ...options,
      ...(this.createWebSocket
        ? { createWebSocket: this.createWebSocket }
        : {}),
    });

    try {
      for await (const event of iterator) {
        yield event;
      }
    } catch (error) {
      if (error instanceof SymphonyError) {
        throw error;
      }

      throw normalizeTransportError(error, {
        code: "stream_closed",
        endpoint: buildEndpoint(connection.url, "/api/v1/events"),
        origin: connection.origin,
        reason: "stream_error",
        retryable: true,
      });
    }
  }
}

export function createSymphonyClient(
  options: SymphonyClientOptions & {
    config?: ResolveSymphonyConfigOptions;
  } = {},
): SymphonyClient {
  if (options.resolveConfig) {
    return new SymphonyHttpClient({
      resolveConfig: options.resolveConfig,
      fetchImpl: options.fetchImpl,
      createWebSocket: options.createWebSocket,
    });
  }

  return new SymphonyHttpClient({
    fetchImpl: options.fetchImpl,
    createWebSocket: options.createWebSocket,
    resolveConfig: () => resolveSymphonyConfigFromRuntime(options.config),
  });
}

function buildEndpoint(baseUrl: string, path: string): string {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), normalized).toString();
}

function decodeState(
  payload: unknown,
  connection: SymphonyConnectionConfig,
  endpoint: string,
): SymphonyOrchestratorState {
  if (!payload || typeof payload !== "object") {
    throw new SymphonyError("Failed to decode Symphony state response.", {
      code: "decode_error",
      endpoint,
      origin: connection.origin,
      reason: "invalid_root",
    });
  }

  const obj = payload as Record<string, unknown>;

  if (
    typeof obj.poll_interval_ms !== "number" ||
    typeof obj.max_concurrent_agents !== "number" ||
    !isRecord(obj.running) ||
    !Array.isArray(obj.retry_queue) ||
    !Array.isArray(obj.completed) ||
    !isRecord(obj.codex_totals) ||
    !isRecord(obj.polling)
  ) {
    throw new SymphonyError("Failed to decode Symphony state response.", {
      code: "decode_error",
      endpoint,
      origin: connection.origin,
      reason: "invalid_shape",
    });
  }

  return {
    poll_interval_ms: obj.poll_interval_ms,
    max_concurrent_agents: obj.max_concurrent_agents,
    running: obj.running as SymphonyOrchestratorState["running"],
    retry_queue: obj.retry_queue as SymphonyOrchestratorState["retry_queue"],
    completed: obj.completed as SymphonyOrchestratorState["completed"],
    codex_totals: obj.codex_totals as SymphonyOrchestratorState["codex_totals"],
    polling: obj.polling as SymphonyOrchestratorState["polling"],
    running_session_info: isRecord(obj.running_session_info)
      ? sanitizeRunningSessionInfo(obj.running_session_info)
      : undefined,
    blocked: Array.isArray(obj.blocked)
      ? (obj.blocked as Array<Record<string, unknown>>)
      : undefined,
    pending_escalations: Array.isArray(obj.pending_escalations)
      ? (obj.pending_escalations as SymphonyPendingEscalation[])
      : undefined,
  };
}

function sanitizeRunningSessionInfo(
  raw: Record<string, unknown>,
): Record<string, SymphonyWorkerSessionInfo> {
  const sanitized: Record<string, SymphonyWorkerSessionInfo> = {};

  for (const [issueId, value] of Object.entries(raw)) {
    if (!isRecord(value)) {
      continue;
    }

    const info = sanitizeWorkerSessionInfo(value);
    sanitized[issueId] = info;
  }

  return sanitized;
}

function sanitizeWorkerSessionInfo(value: Record<string, unknown>): SymphonyWorkerSessionInfo {
  const turnCount =
    typeof value.turn_count === "number" ? value.turn_count : undefined;
  const maxTurns =
    typeof value.max_turns === "number" ? value.max_turns : undefined;

  const lastActivityMs =
    typeof value.last_activity_ms === "number"
      ? value.last_activity_ms
      : value.last_activity_ms === null
        ? null
        : undefined;

  const currentToolName =
    typeof value.current_tool_name === "string"
      ? value.current_tool_name
      : value.current_tool_name === null
        ? null
        : undefined;

  const currentToolArgsPreview =
    typeof value.current_tool_args_preview === "string"
      ? value.current_tool_args_preview
      : value.current_tool_args_preview === null
        ? null
        : undefined;

  return {
    ...(turnCount !== undefined ? { turn_count: turnCount } : {}),
    ...(maxTurns !== undefined ? { max_turns: maxTurns } : {}),
    ...(lastActivityMs !== undefined ? { last_activity_ms: lastActivityMs } : {}),
    ...(currentToolName !== undefined ? { current_tool_name: currentToolName } : {}),
    ...(currentToolArgsPreview !== undefined
      ? { current_tool_args_preview: currentToolArgsPreview }
      : {}),
  };
}

function normalizeFilter(filter: SymphonyEventFilter): SymphonyEventFilter {
  const issue = normalizeIssueFilter(filter.issue);

  return {
    ...(issue ? { issue } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.severity ? { severity: filter.severity } : {}),
  };
}

function normalizeIssueFilter(value: unknown): string | string[] | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.toUpperCase() : undefined;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => String(entry).trim().toUpperCase())
      .filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
  }

  return undefined;
}

async function safeReadJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function mapSteerError(status: number, payload: unknown): string {
  const code =
    isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === "string"
      ? payload.error.code
      : undefined;

  if (code) {
    return code;
  }

  if (status === 404) {
    return "issue_not_running";
  }
  if (status === 409) {
    return "no_active_session";
  }
  if (status === 400) {
    return "invalid_request";
  }

  return "steer_failed";
}

function normalizeTransportError(
  error: unknown,
  context: ConstructorParameters<typeof SymphonyError>[1],
): SymphonyError {
  if (error instanceof SymphonyError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new SymphonyError(message, context);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
