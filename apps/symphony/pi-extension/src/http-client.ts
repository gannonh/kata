import { SymphonyExtensionError } from "./errors.ts";
import { normalizeBaseUrl, type LastKnownSymphonyState } from "./state.ts";

export interface RunAttemptResponse {
  issue_id: string;
  issue_identifier: string;
  issue_title?: string | null;
  attempt?: number | null;
  workspace_path: string;
  started_at: string;
  status: string;
  error?: string | null;
  worker_host?: string | null;
  model?: string | null;
  tracker_state?: string | null;
  issue_url?: string | null;
}

export interface RunningSessionSnapshotResponse {
  turn_count?: number;
  last_activity_at?: string | null;
  total_tokens?: number;
  last_event?: string | null;
  last_event_message?: string | null;
  session_id?: string | null;
  current_tool_name?: string | null;
  current_tool_args_preview?: string | null;
  last_error?: string | null;
}

export interface WorkerSessionInfoResponse {
  turn_count?: number;
  max_turns?: number;
  last_activity_ms?: number | null;
  session_tokens?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  current_tool_name?: string | null;
  current_tool_args_preview?: string | null;
  last_error?: string | null;
}

export interface SymphonyStateResponse {
  tracker_project_url?: string | null;
  running?: Record<string, RunAttemptResponse>;
  running_sessions?: Record<string, RunningSessionSnapshotResponse>;
  running_session_info?: Record<string, WorkerSessionInfoResponse>;
  retry_queue?: unknown[];
  blocked?: unknown[];
  completed?: unknown[];
  polling?: {
    checking?: boolean;
    next_poll_in_ms?: number;
    poll_interval_ms?: number;
    poll_count?: number;
    last_poll_at?: string | null;
  };
}

export interface RefreshResponse {
  queued: boolean;
  coalesced: boolean;
  pendingRequests: number;
}

export interface SteerResponse {
  ok: boolean;
  issueId: string;
  issueIdentifier: string;
  delivered: boolean;
  instructionPreview: string;
}

export interface SymphonyEventEnvelope {
  version: string;
  sequence: number;
  timestamp: string;
  kind: string;
  severity: string;
  issue?: string;
  event: string;
  payload: unknown;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    status?: number;
    details?: unknown;
  };
}

export class SymphonyHttpClient {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async getState(signal?: AbortSignal): Promise<SymphonyStateResponse> {
    const path = "/api/v1/state";
    const json = await this.requestJson(path, { method: "GET", signal });
    return validateSymphonyStateResponse(json, { baseUrl: this.baseUrl, path });
  }

  async verify(signal?: AbortSignal): Promise<SymphonyStateResponse> {
    return this.getState(signal);
  }

  async refresh(signal?: AbortSignal): Promise<RefreshResponse> {
    const path = "/api/v1/refresh";
    const json = await this.requestJson(path, { method: "POST", signal });
    return validateRefreshResponse(json, { baseUrl: this.baseUrl, path });
  }

  async steer(issueIdentifier: string, instruction: string, signal?: AbortSignal): Promise<SteerResponse> {
    const path = "/api/v1/steer";
    const json = await this.requestJson(path, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issue_identifier: issueIdentifier, instruction }),
    });
    return validateSteerResponse(json, { baseUrl: this.baseUrl, path, issueIdentifier });
  }

  toHealthSummary(state: SymphonyStateResponse): LastKnownSymphonyState {
    return {
      baseUrl: this.baseUrl,
      trackerProjectUrl: state.tracker_project_url ?? undefined,
      runningCount: Object.keys(state.running ?? {}).length,
      retryCount: state.retry_queue?.length ?? 0,
      blockedCount: state.blocked?.length ?? 0,
      completedCount: state.completed?.length ?? 0,
      pollingChecking: Boolean(state.polling?.checking),
      nextPollInMs: state.polling?.next_poll_in_ms ?? 0,
      updatedAt: new Date().toISOString(),
    };
  }

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers: { accept: "application/json", ...(init.headers ?? {}) } });
    } catch (error) {
      if (isAbortError(error, init.signal)) throw error;
      throw new SymphonyExtensionError("attach_unreachable", "Could not reach Symphony HTTP API", {
        url,
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      if (isAbortError(error, init.signal)) throw error;
      throw new SymphonyExtensionError("non_symphony_response", "Could not read Symphony HTTP API response body", {
        url,
        status: response.status,
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new SymphonyExtensionError("invalid_json", "Symphony HTTP API returned invalid JSON", {
        url,
        status: response.status,
        bodyPreview: text.slice(0, 200),
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    if (!response.ok) {
      const envelope = parseApiErrorEnvelope(json);
      if (envelope?.error?.message) {
        throw new SymphonyExtensionError("api_error", envelope.error.message, {
          url,
          status: response.status,
          code: envelope.error.code,
          details: envelope.error.details,
        });
      }
      throw new SymphonyExtensionError("non_symphony_response", "Symphony HTTP API returned an unexpected error response", {
        url,
        status: response.status,
        body: json,
      });
    }

    return json;
  }
}

function validateSymphonyStateResponse(value: unknown, details: Record<string, unknown>): SymphonyStateResponse {
  if (!isRecord(value)) {
    throwNonSymphonyState(details, "state response was not an object");
  }

  const missingFields = ["running", "retry_queue", "blocked", "completed", "polling"].filter((field) => !(field in value));
  if (missingFields.length > 0) {
    throwNonSymphonyState(details, "state response was missing Symphony state fields", { missingFields });
  }

  validateOptionalStringOrNull(value, "tracker_project_url", details);
  validateOptionalRecord(value, "running", details);
  validateRunningAttempts(value.running, details);
  validateOptionalArray(value, "retry_queue", details);
  validateOptionalArray(value, "blocked", details);
  validateOptionalArray(value, "completed", details);
  validateOptionalNumber(value, "poll_interval_ms", details);
  validateOptionalNumber(value, "max_concurrent_agents", details);
  validateOptionalRecord(value, "running_sessions", details);
  validateOptionalRecord(value, "running_session_info", details);
  validateOptionalArray(value, "claimed", details);
  validateOptionalArray(value, "pending_escalations", details);
  validateOptionalRecord(value, "shared_context", details);
  validateOptionalRecord(value, "supervisor", details);
  validateOptionalRecord(value, "codex_totals", details);
  validateOptionalRecordOrNull(value, "codex_rate_limits", details);

  if (!isRecord(value.polling)) {
    throwNonSymphonyState(details, "state response field had an invalid shape", { field: "polling", expected: "object" });
  }
  validateRequiredBoolean(value.polling, "checking", details, "polling.checking");
  validateRequiredNumber(value.polling, "next_poll_in_ms", details, "polling.next_poll_in_ms");
  validateRequiredNumber(value.polling, "poll_interval_ms", details, "polling.poll_interval_ms");
  validateOptionalNumber(value.polling, "poll_count", details, "polling.poll_count");
  validateOptionalStringOrNull(value.polling, "last_poll_at", details, "polling.last_poll_at");

  return value;
}

function validateRefreshResponse(value: unknown, details: Record<string, unknown>): RefreshResponse {
  if (!isRecord(value)) {
    throwNonSymphonyRefresh(details, "refresh response was not an object");
  }
  if (typeof value.queued !== "boolean") {
    throwNonSymphonyRefresh(details, "refresh response field had an invalid shape", { field: "queued", expected: "boolean" });
  }
  if (typeof value.coalesced !== "boolean") {
    throwNonSymphonyRefresh(details, "refresh response field had an invalid shape", { field: "coalesced", expected: "boolean" });
  }
  if (!isFiniteNumber(value.pending_requests)) {
    throwNonSymphonyRefresh(details, "refresh response field had an invalid shape", { field: "pending_requests", expected: "number" });
  }

  return {
    queued: value.queued,
    coalesced: value.coalesced,
    pendingRequests: value.pending_requests,
  };
}

function validateSteerResponse(value: unknown, details: Record<string, unknown>): SteerResponse {
  if (!isRecord(value)) {
    throwNonSymphonySteer(details, "steer response was not an object");
  }
  if (typeof value.ok !== "boolean") {
    throwNonSymphonySteer(details, "steer response field had an invalid shape", { field: "ok", expected: "boolean" });
  }
  if (typeof value.issue_id !== "string") {
    throwNonSymphonySteer(details, "steer response field had an invalid shape", { field: "issue_id", expected: "string" });
  }
  if (typeof value.issue_identifier !== "string") {
    throwNonSymphonySteer(details, "steer response field had an invalid shape", { field: "issue_identifier", expected: "string" });
  }
  if (typeof value.delivered !== "boolean") {
    throwNonSymphonySteer(details, "steer response field had an invalid shape", { field: "delivered", expected: "boolean" });
  }
  if (typeof value.instruction_preview !== "string") {
    throwNonSymphonySteer(details, "steer response field had an invalid shape", { field: "instruction_preview", expected: "string" });
  }

  return {
    ok: value.ok,
    issueId: value.issue_id,
    issueIdentifier: value.issue_identifier,
    delivered: value.delivered,
    instructionPreview: value.instruction_preview,
  };
}

function throwNonSymphonyRefresh(details: Record<string, unknown>, reason: string, extraDetails: Record<string, unknown> = {}): never {
  throw new SymphonyExtensionError("non_symphony_response", "Response did not look like Symphony refresh response", {
    ...details,
    reason,
    ...extraDetails,
  });
}

function throwNonSymphonySteer(details: Record<string, unknown>, reason: string, extraDetails: Record<string, unknown> = {}): never {
  throw new SymphonyExtensionError("non_symphony_response", "Response did not look like Symphony steer response", {
    ...details,
    reason,
    ...extraDetails,
  });
}

function parseApiErrorEnvelope(value: unknown): ApiErrorEnvelope | undefined {
  if (!isRecord(value) || !isRecord(value.error)) return undefined;
  return {
    error: {
      code: typeof value.error.code === "string" ? value.error.code : undefined,
      message: typeof value.error.message === "string" ? value.error.message : undefined,
      status: isFiniteNumber(value.error.status) ? value.error.status : undefined,
      details: value.error.details,
    },
  };
}

function validateRunningAttempts(value: unknown, details: Record<string, unknown>): void {
  if (value === undefined) return;
  if (!isRecord(value)) return;
  for (const [key, attempt] of Object.entries(value)) {
    validateRunAttemptResponse(attempt, details, `running.${key}`);
  }
}

function validateRunAttemptResponse(value: unknown, details: Record<string, unknown>, detailField: string): void {
  if (!isRecord(value)) {
    throwNonSymphonyState(details, "state response field had an invalid shape", { field: detailField, expected: "object" });
  }
  validateRequiredString(value, "issue_id", details, `${detailField}.issue_id`);
  validateRequiredString(value, "issue_identifier", details, `${detailField}.issue_identifier`);
  validateRequiredString(value, "workspace_path", details, `${detailField}.workspace_path`);
  validateRequiredString(value, "started_at", details, `${detailField}.started_at`);
  validateRequiredString(value, "status", details, `${detailField}.status`);
  validateOptionalStringOrNull(value, "issue_title", details, `${detailField}.issue_title`);
  validateOptionalNumberOrNull(value, "attempt", details, `${detailField}.attempt`);
  validateOptionalStringOrNull(value, "error", details, `${detailField}.error`);
  validateOptionalStringOrNull(value, "worker_host", details, `${detailField}.worker_host`);
  validateOptionalStringOrNull(value, "model", details, `${detailField}.model`);
  validateOptionalStringOrNull(value, "tracker_state", details, `${detailField}.tracker_state`);
  validateOptionalStringOrNull(value, "issue_url", details, `${detailField}.issue_url`);
}

function validateOptionalArray(value: Record<string, unknown>, field: string, details: Record<string, unknown>, detailField = field): void {
  const fieldValue = value[field];
  if (fieldValue === undefined) return;
  if (!Array.isArray(fieldValue)) {
    throwNonSymphonyState(details, "state response field had an invalid shape", { field: detailField, expected: "array" });
  }
}

function validateOptionalRecord(value: Record<string, unknown>, field: string, details: Record<string, unknown>, detailField = field): void {
  const fieldValue = value[field];
  if (fieldValue === undefined) return;
  if (!isRecord(fieldValue)) {
    throwNonSymphonyState(details, "state response field had an invalid shape", { field: detailField, expected: "object" });
  }
}

function validateOptionalRecordOrNull(value: Record<string, unknown>, field: string, details: Record<string, unknown>, detailField = field): void {
  const fieldValue = value[field];
  if (fieldValue === undefined || fieldValue === null) return;
  if (!isRecord(fieldValue)) {
    throwNonSymphonyState(details, "state response field had an invalid shape", { field: detailField, expected: "object or null" });
  }
}

function validateOptionalStringOrNull(value: Record<string, unknown>, field: string, details: Record<string, unknown>, detailField = field): void {
  const fieldValue = value[field];
  if (fieldValue === undefined || fieldValue === null) return;
  if (typeof fieldValue !== "string") {
    throwNonSymphonyState(details, "state response field had an invalid shape", { field: detailField, expected: "string or null" });
  }
}

function validateOptionalNumber(value: Record<string, unknown>, field: string, details: Record<string, unknown>, detailField = field): void {
  const fieldValue = value[field];
  if (fieldValue === undefined) return;
  if (!isFiniteNumber(fieldValue)) {
    throwNonSymphonyState(details, "state response field had an invalid shape", { field: detailField, expected: "number" });
  }
}

function validateOptionalNumberOrNull(value: Record<string, unknown>, field: string, details: Record<string, unknown>, detailField = field): void {
  const fieldValue = value[field];
  if (fieldValue === undefined || fieldValue === null) return;
  if (!isFiniteNumber(fieldValue)) {
    throwNonSymphonyState(details, "state response field had an invalid shape", { field: detailField, expected: "number or null" });
  }
}

function validateRequiredString(value: Record<string, unknown>, field: string, details: Record<string, unknown>, detailField = field): void {
  if (typeof value[field] !== "string") {
    throwNonSymphonyState(details, "state response field had an invalid shape", { field: detailField, expected: "string" });
  }
}

function validateRequiredBoolean(value: Record<string, unknown>, field: string, details: Record<string, unknown>, detailField = field): void {
  if (typeof value[field] !== "boolean") {
    throwNonSymphonyState(details, "state response field had an invalid shape", { field: detailField, expected: "boolean" });
  }
}

function validateRequiredNumber(value: Record<string, unknown>, field: string, details: Record<string, unknown>, detailField = field): void {
  if (!isFiniteNumber(value[field])) {
    throwNonSymphonyState(details, "state response field had an invalid shape", { field: detailField, expected: "number" });
  }
}

function throwNonSymphonyState(details: Record<string, unknown>, reason: string, extraDetails: Record<string, unknown> = {}): never {
  throw new SymphonyExtensionError("non_symphony_response", "Response did not look like Symphony state", {
    ...details,
    reason,
    ...extraDetails,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isAbortError(error: unknown, signal?: AbortSignal | null): boolean {
  return Boolean(signal?.aborted) || (error instanceof Error && error.name === "AbortError");
}
