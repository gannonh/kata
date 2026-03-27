import type {
  SymphonyEventEnvelope,
  SymphonyOrchestratorState,
} from "./types.js";

export function renderSymphonyStatus(state: SymphonyOrchestratorState): string {
  const running = Object.values(state.running ?? {});
  const retryQueue = state.retry_queue ?? [];

  const lines: string[] = [];
  lines.push("Symphony Status");
  lines.push("");
  lines.push(`Running workers: ${running.length}`);
  lines.push(`Retry queue: ${retryQueue.length}`);
  lines.push(`Completed: ${state.completed?.length ?? 0}`);

  if (running.length > 0) {
    lines.push("");
    lines.push("Active issues:");
    for (const run of running.slice(0, 8)) {
      lines.push(
        `- ${run.issue_identifier} · ${run.status}${run.linear_state ? ` · ${run.linear_state}` : ""}`,
      );
    }
  }

  if (retryQueue.length > 0) {
    lines.push("");
    lines.push("Retry queue:");
    for (const retry of retryQueue.slice(0, 8)) {
      lines.push(
        `- ${retry.identifier} · attempt ${retry.attempt} · due in ${retry.due_in_ms}ms`,
      );
    }
  }

  return lines.join("\n");
}

export function renderSymphonyWatchEvent(event: SymphonyEventEnvelope): string {
  const parts = [
    `#${event.sequence}`,
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

export function renderSymphonyUsage(): string {
  return [
    "Symphony commands:",
    "  /symphony status              Show live worker/queue state",
    "  /symphony watch <ISSUE>       Stream live events for an issue",
  ].join("\n");
}
