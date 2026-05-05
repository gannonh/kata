import type {
  SymphonyError,
  SymphonyEventEnvelope,
  SymphonyOrchestratorState,
} from "./types.js";

export function renderSymphonyUsage(): string {
  return [
    "Symphony command usage:",
    "  /symphony status",
    "  /symphony watch <ISSUE> [--max-events <n>] [--timeout-ms <ms>]",
    "  /symphony steer <ISSUE> <instruction>",
    "  /symphony console [off|refresh]",
    "  /symphony config [WORKFLOW.md]",
    "",
    "Examples:",
    "  /symphony status",
    "  /symphony watch KAT-920",
    "  /symphony steer KAT-920 \"Use the existing auth module\"",
    "  /symphony console",
    "  /symphony console off",
    "  /symphony config",
    "  /symphony config ./apps/symphony/WORKFLOW.md",
  ].join("\n");
}

export function renderSymphonyStatus(state: SymphonyOrchestratorState): string {
  const running = Object.values(state.running ?? {});
  const retryQueue = state.retry_queue ?? [];
  const completed = state.completed ?? [];

  const lines: string[] = [];
  lines.push("Symphony Status");
  lines.push("");
  lines.push(`Running workers: ${running.length}`);
  lines.push(`Retry queue: ${retryQueue.length}`);
  lines.push(`Completed issues: ${completed.length}`);

  lines.push("");
  lines.push("Runtime:");
  lines.push(`- Poll interval: ${state.poll_interval_ms}ms`);
  lines.push(`- Max workers: ${state.max_concurrent_agents}`);

  if (running.length > 0) {
    lines.push("");
    lines.push("Active workers:");
    for (const run of running.slice(0, 10)) {
      lines.push(
        `- ${run.issue_identifier} · ${run.status}${run.tracker_state ? ` · ${run.tracker_state}` : ""}${run.worker_host ? ` · ${run.worker_host}` : ""}`,
      );
    }
  }

  if (retryQueue.length > 0) {
    lines.push("");
    lines.push("Queued retries:");
    for (const retry of retryQueue.slice(0, 10)) {
      lines.push(
        `- ${retry.identifier} · attempt ${retry.attempt} · due in ${retry.due_in_ms}ms${retry.error ? ` · ${retry.error}` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

export function renderSymphonyWatchStart(
  issue: string,
  options: {
    timeoutMs: number;
    maxEvents: number;
  },
): string {
  return `Watching ${issue} (timeout ${options.timeoutMs}ms, max ${options.maxEvents} events)...`;
}

export function renderSymphonyWatchEvent(event: SymphonyEventEnvelope): string {
  const parts = [
    `[${event.sequence}]`,
    event.timestamp,
    event.kind,
    event.severity,
  ];

  if (event.issue) {
    parts.push(event.issue);
  }

  parts.push(event.event);
  return parts.join(" · ");
}

export function renderSymphonyWatchEmpty(
  issue: string,
  timeoutMs: number,
): string {
  return `No events received for ${issue} within ${timeoutMs}ms.`;
}

export function renderSymphonyWatchSummary(
  issue: string,
  received: number,
  elapsedMs: number,
): string {
  return `Watch finished for ${issue}: received ${received} event${received === 1 ? "" : "s"} in ${elapsedMs}ms.`;
}

export function renderSymphonyCommandError(error: SymphonyError): string {
  switch (error.code) {
    case "config_missing":
      return `${error.code}: ${error.message}\nHint: configure symphony.url in preferences or set KATA_SYMPHONY_URL / SYMPHONY_URL.`;
    case "config_invalid":
      return `${error.code}: ${error.message}\nHint: use an http(s) URL for Symphony.`;
    case "connection_failed":
      return `${error.code}: ${error.message}\nHint: verify Symphony is running and reachable at the configured URL.`;
    case "stream_closed":
      return `${error.code}: ${error.message}\nHint: check Symphony health and retry /symphony watch.`;
    case "decode_error":
      return `${error.code}: ${error.message}\nHint: confirm Symphony and Kata CLI are using compatible event contracts.`;
    case "capability_unavailable":
      return `${error.code}: ${error.message}`;
    default:
      return `${error.code}: ${error.message}`;
  }
}
