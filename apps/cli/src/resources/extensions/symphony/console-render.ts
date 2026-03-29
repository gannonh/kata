import {
  CONSOLE_STALE_AFTER_MS,
  formatDurationMs,
  type ConsolePanelState,
} from "./console-state.js";

export interface RenderConsolePanelOptions {
  now?: () => number;
}

const CONNECTION_ICON: Record<ConsolePanelState["connectionStatus"], string> = {
  connected: "🟢",
  disconnected: "🔴",
  reconnecting: "🟡",
};

export function renderConsolePanel(
  state: ConsolePanelState,
  options: RenderConsolePanelOptions = {},
): string[] {
  const now = options.now ?? Date.now;
  const nowMs = now();
  const lines: string[] = [];

  const erroringWorkers = state.workers.filter((worker) => !!worker.lastError).length;

  lines.push(renderConnectionHeader(state));
  lines.push(
    `Workers: ${state.workers.length} running · ${erroringWorkers} erroring · ${state.queueCount} queue`,
  );
  lines.push(`Completed: ${state.completedCount}`);

  lines.push("── Status ─────────────────────────────");
  if (state.lastUpdateAt !== null) {
    lines.push(`Last event ${formatDurationMs(Math.max(0, nowMs - state.lastUpdateAt))} ago`);
  } else {
    lines.push("Last event n/a");
  }

  if (isConsoleStateStale(state, nowMs)) {
    lines.push(
      `⚠ Data is stale (>30s without events) — latest update ${formatDurationMs(
        nowMs - (state.lastUpdateAt ?? nowMs),
      )} ago`,
    );
  }

  if (state.error) {
    lines.push(`✗ ${state.error}`);
  }

  if (state.message) {
    lines.push(`ℹ ${state.message}`);
  }

  lines.push("── Workers ────────────────────────────");

  if (state.workers.length === 0) {
    lines.push("  (no active workers)");
  } else {
    const escalatedIssues = new Set(
      state.escalations.map((escalation) => escalation.issueIdentifier),
    );

    for (const worker of state.workers) {
      const marker = worker.lastError
        ? "✗"
        : escalatedIssues.has(worker.identifier)
          ? "⚠"
          : "✓";

      const identifier = worker.identifier.padEnd(12, " ");
      const linearState = worker.linearState.padEnd(14, " ");

      lines.push(
        `  ${marker} ${identifier} ${linearState} tool:${worker.currentTool} · ${worker.lastActivityAge} · ${worker.model}`,
      );
      if (worker.issueTitle && worker.issueTitle !== worker.identifier) {
        lines.push(`    ${worker.issueTitle}`);
      }
      if (worker.lastError) {
        lines.push(`    error: ${worker.lastError}`);
      }
    }
  }

  lines.push("── Escalations ────────────────────────");
  if (state.escalations.length > 0) {
    lines.push(`⚠ Pending escalations (${state.escalations.length})`);
    for (const [index, escalation] of state.escalations.entries()) {
      const waitingMs = Math.max(0, nowMs - escalation.waitingSince);
      lines.push(
        `  [${index + 1}] ${escalation.requestId} · ${escalation.issueIdentifier} · waiting ${formatDurationMs(waitingMs)} / ${formatDurationMs(escalation.timeoutMs)}`,
      );
      if (escalation.issueTitle && escalation.issueTitle !== escalation.issueIdentifier) {
        lines.push(`      ${escalation.issueTitle}`);
      }
      lines.push(`      ${escalation.questionPreview}`);
    }
    lines.push(
      state.escalations.length === 1
        ? "  Reply: !respond <answer>"
        : "  Reply: !respond <request-id|index> <answer>",
    );
  } else {
    lines.push("Escalations: none pending");
  }

  lines.push("── End ────────────────────────────────");

  return lines;
}

export function isConsoleStateStale(state: ConsolePanelState, nowMs: number): boolean {
  return state.lastUpdateAt !== null && nowMs - state.lastUpdateAt > CONSOLE_STALE_AFTER_MS;
}

function renderConnectionHeader(state: ConsolePanelState): string {
  const icon = CONNECTION_ICON[state.connectionStatus];
  const label = state.connectionStatus.replace("_", " ");
  const endpoint = state.connectionUrl || "(not configured)";
  return `Symphony Console ${icon} ${label} · ${endpoint}`;
}
