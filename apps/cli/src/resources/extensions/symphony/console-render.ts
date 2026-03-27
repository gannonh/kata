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

  lines.push(renderConnectionHeader(state));
  lines.push(
    `Queue ${state.queueCount} · Completed ${state.completedCount} · Workers ${state.workers.length}`,
  );

  if (state.lastUpdateAt !== null) {
    lines.push(`Last event ${formatDurationMs(Math.max(0, nowMs - state.lastUpdateAt))} ago`);
  } else {
    lines.push("Last event n/a");
  }

  if (isConsoleStateStale(state, nowMs)) {
    lines.push(
      `⚠️ Data is stale (>30s without events) — latest update ${formatDurationMs(
        nowMs - (state.lastUpdateAt ?? nowMs),
      )} ago`,
    );
  }

  if (state.error) {
    lines.push(`⚠️ ${state.error}`);
  }

  lines.push("");
  lines.push("Workers");

  if (state.workers.length === 0) {
    lines.push("  (no active workers)");
  } else {
    for (const worker of state.workers) {
      lines.push(
        `  • ${worker.identifier} · ${worker.linearState} · tool:${worker.currentTool} · ${worker.lastActivityAge} · ${worker.model}`,
      );
      if (worker.issueTitle && worker.issueTitle !== worker.identifier) {
        lines.push(`    ${worker.issueTitle}`);
      }
    }
  }

  lines.push("");
  if (state.escalations.length > 0) {
    lines.push(`⚠️ Pending escalations (${state.escalations.length})`);
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
    lines.push("  Reply: !respond <answer> or !respond <request-id|index> <answer>");
  } else {
    lines.push("Escalations: none pending");
  }

  if (state.message) {
    lines.push("");
    lines.push(`ℹ️ ${state.message}`);
  }

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
