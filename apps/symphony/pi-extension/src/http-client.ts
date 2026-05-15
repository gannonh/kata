import { SymphonyExtensionError } from "./errors.ts";
import { normalizeBaseUrl, type LastKnownSymphonyState } from "./state.ts";

export interface SymphonyStateResponse {
  tracker_project_url?: string | null;
  running?: Record<string, unknown>;
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
