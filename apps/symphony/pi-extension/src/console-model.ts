import type { RunAttemptResponse, SymphonyEventEnvelope, SymphonyStateResponse } from "./http-client.ts";

export interface WorkerRow {
  issueId: string;
  issueIdentifier: string;
  title: string;
  trackerState: string;
  attempt: string;
  turnCount: string;
  maxTurns: string;
  lastActivity: string;
  workerHost: string;
  workspacePath: string;
  status: string;
  errorPreview: string;
}

export function buildWorkerRows(state: SymphonyStateResponse | undefined): WorkerRow[] {
  return Object.entries(state?.running ?? {})
    .map(([issueId, attempt]) => buildWorkerRow(issueId, attempt, state))
    .sort((left, right) => left.issueIdentifier.localeCompare(right.issueIdentifier));
}

export function formatEventRows(events: SymphonyEventEnvelope[], limit = 8): string[] {
  return events
    .filter((event) => event.kind === "worker" || event.kind === "runtime")
    .slice(-limit)
    .reverse()
    .map((event) => [event.timestamp, event.severity, event.kind, event.issue ?? "-", event.event, eventSummary(event)].filter(Boolean).join(" "));
}

function buildWorkerRow(issueId: string, attempt: RunAttemptResponse, state: SymphonyStateResponse | undefined): WorkerRow {
  const session = state?.running_sessions?.[issueId];
  const info = state?.running_session_info?.[issueId];
  const turnCount = info?.turn_count ?? session?.turn_count;
  const lastError = attempt.error ?? info?.last_error ?? session?.last_error;

  return {
    issueId,
    issueIdentifier: attempt.issue_identifier,
    title: attempt.issue_title ?? "-",
    trackerState: attempt.tracker_state ?? "-",
    attempt: String(attempt.attempt ?? 1),
    turnCount: turnCount === undefined ? "-" : String(turnCount),
    maxTurns: info?.max_turns === undefined ? "-" : String(info.max_turns),
    lastActivity: formatLastActivity(info?.last_activity_ms, session?.last_activity_at),
    workerHost: attempt.worker_host ?? "local",
    workspacePath: attempt.workspace_path,
    status: attempt.status,
    errorPreview: lastError ? truncateText(lastError, 120) : "-",
  };
}

function formatLastActivity(lastActivityMs: number | null | undefined, lastActivityAt: string | null | undefined): string {
  if (typeof lastActivityMs === "number" && Number.isFinite(lastActivityMs)) {
    return new Date(lastActivityMs).toISOString();
  }
  return lastActivityAt ?? "-";
}

function eventSummary(event: SymphonyEventEnvelope): string {
  if (!isRecord(event.payload)) return "";
  const preferred = event.payload.error_preview ?? event.payload.summary ?? event.payload.message ?? event.payload.reason ?? event.payload.error ?? event.payload.instruction_preview;
  return typeof preferred === "string" ? truncateText(preferred, 120) : "";
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
