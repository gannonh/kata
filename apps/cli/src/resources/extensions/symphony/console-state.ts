import type {
  SymphonyOrchestratorState,
  SymphonyPendingEscalation,
  SymphonyRunAttempt,
  SymphonyWorkerSessionInfo,
} from "./types.js";
import { truncateText } from "./text-utils.js";

export type ConsoleConnectionStatus = "connected" | "disconnected" | "reconnecting";

export type ConsolePanelPosition = "below-output" | "above-status";

export const DEFAULT_CONSOLE_POSITION: ConsolePanelPosition = "below-output";
export const CONSOLE_STALE_AFTER_MS = 30_000;

export interface WorkerRow {
  issueId: string;
  identifier: string;
  issueTitle: string;
  linearState: string;
  currentTool: string;
  lastActivityAge: string;
  model: string;
  lastError?: string;
}

export interface EscalationDisplayItem {
  requestId: string;
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  questionPreview: string;
  waitingSince: number;
  timeoutMs: number;
}

export interface ConsolePanelState {
  workers: WorkerRow[];
  escalations: EscalationDisplayItem[];
  connectionStatus: ConsoleConnectionStatus;
  connectionUrl: string;
  lastUpdateAt: number | null;
  queueCount: number;
  completedCount: number;
  message?: string;
  error?: string;
}

export interface BuildConsoleStateOptions {
  now?: () => number;
  previous?: ConsolePanelState;
  connectionStatus?: ConsoleConnectionStatus;
  connectionUrl?: string;
}

export function createEmptyConsolePanelState(connectionUrl: string): ConsolePanelState {
  return {
    workers: [],
    escalations: [],
    connectionStatus: "disconnected",
    connectionUrl,
    lastUpdateAt: null,
    queueCount: 0,
    completedCount: 0,
  };
}

export function resolveConsolePosition(value: unknown): ConsolePanelPosition {
  if (value === "above-status") {
    return "above-status";
  }

  return DEFAULT_CONSOLE_POSITION;
}

export function buildConsolePanelStateFromSnapshot(
  snapshot: SymphonyOrchestratorState,
  options: BuildConsoleStateOptions = {},
): ConsolePanelState {
  const now = options.now ?? Date.now;
  const nowMs = now();

  const workers = buildWorkerRows(snapshot, nowMs);
  const issueTitles = new Map<string, string>(
    workers.map((worker) => [worker.identifier, worker.issueTitle]),
  );

  const escalations = buildEscalationItems(
    snapshot.pending_escalations ?? [],
    issueTitles,
  );

  return {
    workers,
    escalations,
    connectionStatus:
      options.connectionStatus ?? options.previous?.connectionStatus ?? "connected",
    connectionUrl: options.connectionUrl ?? options.previous?.connectionUrl ?? "",
    lastUpdateAt: nowMs,
    queueCount: snapshot.retry_queue.length,
    completedCount: snapshot.completed.length,
    ...(options.previous?.message ? { message: options.previous.message } : {}),
    ...(options.previous?.error ? { error: options.previous.error } : {}),
  };
}

export function buildWorkerRows(
  snapshot: Pick<SymphonyOrchestratorState, "running" | "running_session_info">,
  nowMs: number,
): WorkerRow[] {
  const workers = Object.values(snapshot.running ?? {});
  const sessionInfo = snapshot.running_session_info ?? {};

  return workers
    .map((run) => workerRowFromRun(run, sessionInfo[run.issue_id], nowMs))
    .sort((left, right) => left.identifier.localeCompare(right.identifier));
}

export function buildEscalationItems(
  pending: SymphonyPendingEscalation[],
  issueTitleByIdentifier: Map<string, string> = new Map(),
): EscalationDisplayItem[] {
  return pending
    .map((item) => {
      const waitingSince = Date.parse(item.created_at);
      return {
        requestId: item.request_id,
        issueId: item.issue_id,
        issueIdentifier: item.issue_identifier,
        issueTitle:
          issueTitleByIdentifier.get(item.issue_identifier) ?? item.issue_identifier,
        questionPreview: truncateText(item.preview, 160),
        waitingSince: Number.isFinite(waitingSince) ? waitingSince : Date.now(),
        timeoutMs: item.timeout_ms,
      };
    })
    .sort((left, right) => left.waitingSince - right.waitingSince);
}

export function formatDurationMs(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));

  if (clamped < 1_000) {
    return `${clamped}ms`;
  }

  const seconds = Math.floor(clamped / 1_000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainder = seconds % 60;
    return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

function workerRowFromRun(
  run: SymphonyRunAttempt,
  info: SymphonyWorkerSessionInfo | undefined,
  nowMs: number,
): WorkerRow {
  const lastActivityMs =
    typeof info?.last_activity_ms === "number"
      ? info.last_activity_ms
      : run.started_at
        ? Date.parse(run.started_at)
        : nowMs;

  const ageMs = Number.isFinite(lastActivityMs)
    ? Math.max(0, nowMs - lastActivityMs)
    : 0;

  return {
    issueId: run.issue_id,
    identifier: run.issue_identifier,
    issueTitle: run.issue_title?.trim() || run.issue_identifier,
    linearState: run.linear_state?.trim() || run.status,
    currentTool: info?.current_tool_name?.trim() || "idle",
    lastActivityAge: formatDurationMs(ageMs),
    model: run.model?.trim() || "default",
    ...(run.error?.trim() ? { lastError: run.error.trim() } : {}),
  };
}

