export const SYMPHONY_EVENT_STREAM_VERSION = "v1" as const;

export type SymphonyEventKind =
  | "snapshot"
  | "runtime"
  | "worker"
  | "tool"
  | "heartbeat"
  | "escalation_created"
  | "escalation_responded"
  | "escalation_timed_out"
  | "escalation_cancelled";

export type SymphonyEventSeverity = "debug" | "info" | "warn" | "error";

export type SymphonyErrorCode =
  | "config_missing"
  | "config_invalid"
  | "connection_failed"
  | "stream_closed"
  | "decode_error"
  | "capability_unavailable";

export type SymphonyConfigOrigin = "preferences" | "env";

export interface SymphonyConnectionConfig {
  url: string;
  origin: SymphonyConfigOrigin;
}

export interface SymphonyErrorContext {
  code: SymphonyErrorCode;
  endpoint?: string;
  origin?: SymphonyConfigOrigin;
  correlationId?: string;
  retryable?: boolean;
  status?: number;
  attempt?: number;
  reason?: string;
}

export class SymphonyError extends Error {
  readonly code: SymphonyErrorCode;
  readonly context: SymphonyErrorContext;

  constructor(message: string, context: SymphonyErrorContext) {
    super(message);
    this.name = "SymphonyError";
    this.code = context.code;
    this.context = context;
  }
}

export function isSymphonyError(error: unknown): error is SymphonyError {
  return error instanceof SymphonyError;
}

export interface SymphonyEventEnvelope {
  version: string;
  sequence: number;
  timestamp: string;
  kind: SymphonyEventKind;
  severity: SymphonyEventSeverity;
  issue?: string | null;
  event: string;
  payload: unknown;
}

export interface EscalationEvent {
  request_id: string;
  issue_id: string;
  issue_identifier: string;
  method: string;
  payload: unknown;
  created_at: string;
  timeout_ms: number;
}

export interface EscalationResponsePayload {
  response: unknown;
  responder_id?: string;
}

export function isEscalationEvent(
  event: SymphonyEventEnvelope,
): event is SymphonyEventEnvelope & { payload: EscalationEvent } {
  if (event.event !== "escalation_created") return false;
  if (!event.payload || typeof event.payload !== "object") return false;
  const payload = event.payload as Record<string, unknown>;
  return (
    typeof payload.request_id === "string" &&
    typeof payload.issue_id === "string" &&
    typeof payload.issue_identifier === "string" &&
    typeof payload.method === "string" &&
    typeof payload.created_at === "string" &&
    typeof payload.timeout_ms === "number"
  );
}

export interface SymphonyEventFilter {
  issue?: string | string[];
  type?: SymphonyEventKind | SymphonyEventKind[];
  severity?: SymphonyEventSeverity | SymphonyEventSeverity[];
}

export interface SymphonyWatchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxEvents?: number;
  reconnectAttempts?: number;
  reconnectDelayMs?: number;
  onLifecycle?: (event: SymphonyClientLifecycleEvent) => void;
}

export interface SymphonyRunAttempt {
  issue_id: string;
  issue_identifier: string;
  issue_title?: string | null;
  status: string;
  attempt?: number | null;
  error?: string | null;
  worker_host?: string | null;
  workspace_path?: string;
  started_at?: string;
  linear_state?: string | null;
}

export interface SymphonyRetryQueueEntry {
  issue_id: string;
  identifier: string;
  attempt: number;
  due_in_ms: number;
  error?: string | null;
  worker_host?: string | null;
  workspace_path?: string | null;
}

export interface SymphonyCompletedEntry {
  issue_id: string;
  identifier: string;
  title: string;
  completed_at?: string | null;
}

export interface SymphonyPollingSnapshot {
  checking: boolean;
  next_poll_in_ms: number;
  poll_interval_ms: number;
  last_poll_at?: string | null;
  poll_count?: number;
}

export interface SymphonyTokenTotals {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  event_count?: number;
  seconds_running?: number;
}

export interface SymphonyPendingEscalation {
  request_id: string;
  issue_id: string;
  issue_identifier: string;
  method: string;
  preview: string;
  created_at: string;
  timeout_ms: number;
}

export interface SymphonyOrchestratorState {
  poll_interval_ms: number;
  max_concurrent_agents: number;
  running: Record<string, SymphonyRunAttempt>;
  retry_queue: SymphonyRetryQueueEntry[];
  pending_escalations?: SymphonyPendingEscalation[];
  completed: SymphonyCompletedEntry[];
  codex_totals: SymphonyTokenTotals;
  polling: SymphonyPollingSnapshot;
  running_session_info?: Record<string, unknown>;
  blocked?: Array<Record<string, unknown>>;
}

export interface SymphonyConnectionDetails {
  url: string;
  origin: SymphonyConfigOrigin;
  connected: boolean;
  reconnecting?: boolean;
  attempt?: number;
  endpoint?: string;
  correlationId?: string;
}

export interface SymphonyCapabilityDetails {
  available: boolean;
  code?: "capability_unavailable";
  reason?: string;
}

export interface SymphonyToolCapabilities {
  status: SymphonyCapabilityDetails;
  watch: SymphonyCapabilityDetails;
  respond: SymphonyCapabilityDetails;
  logs: SymphonyCapabilityDetails;
  steer: SymphonyCapabilityDetails;
}

export interface SymphonyToolDetails {
  connection: SymphonyConnectionDetails;
  capabilities: SymphonyToolCapabilities;
}

export type SymphonyClientLifecycleEvent =
  | {
      type: "symphony_client_connected";
      details: SymphonyConnectionDetails;
    }
  | {
      type: "symphony_client_reconnecting";
      details: SymphonyConnectionDetails;
    }
  | {
      type: "symphony_client_disconnected";
      details: SymphonyConnectionDetails;
    }
  | {
      type: "symphony_watch_event_received";
      details: { sequence: number; issue?: string | null; kind: SymphonyEventKind };
    }
  | {
      type: "symphony_watch_event_dropped";
      details: { reason: string; sequence?: number };
    };
