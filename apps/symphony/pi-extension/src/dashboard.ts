import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { buildWorkerRows, formatEventRows, type WorkerRow } from "./dashboard-model.ts";
import type { SymphonyEventEnvelope, SymphonyStateResponse } from "./http-client.ts";
import type { SymphonyRuntime } from "./runtime.ts";
import type { ExtensionState } from "./state.ts";

export interface DashboardOptions {
  state: ExtensionState;
  getState: () => SymphonyStateResponse | undefined;
  getEvents: () => SymphonyEventEnvelope[];
  refresh: () => Promise<void>;
  steer: (issueIdentifier: string, instruction: string) => Promise<void>;
  prompt: (title: string, label: string) => Promise<string | undefined>;
  close: () => void;
  requestRender: () => void;
  notify: (message: string, level: "info" | "warning" | "error") => void;
}

export class SymphonyDashboardComponent {
  private refreshing = false;
  private selectedWorkerIndex = 0;

  constructor(private readonly options: DashboardOptions) {}

  handleInput(data: string): void {
    if (data === "q" || data === "Q" || matchesKey(data, "escape")) {
      this.options.close();
      return;
    }

    if (data === "r" || data === "R") {
      void this.refresh();
      return;
    }

    if (data === "d" || data === "D") {
      this.options.state.dashboard.showDetails = !this.options.state.dashboard.showDetails;
      this.options.requestRender();
      return;
    }

    if (data === "s" || data === "S") {
      void this.steerSelectedWorker();
      return;
    }

    if (data === "\u001b[A" || matchesKey(data, "up")) {
      this.moveSelection(-1);
      return;
    }

    if (data === "\u001b[B" || matchesKey(data, "down")) {
      this.moveSelection(1);
    }
  }

  render(width: number): string[] {
    const state = this.options.state;
    const health = state.lastKnownState;
    const workers = buildWorkerRows(this.options.getState());
    this.clampSelection(workers.length);
    const selectedWorker = workers[this.selectedWorkerIndex];
    const lines = [
      "Symphony Dashboard",
      "",
      `connection: ${state.attachedBaseUrl ? "attached" : "detached"}`,
      `base url: ${state.attachedBaseUrl ?? "none"}`,
      `project: ${health?.trackerProjectUrl ?? "none"}`,
      `polling: ${health?.pollingChecking ? "checking" : "idle"} | next poll: ${health?.nextPollInMs ?? 0}ms`,
      `workers: running: ${health?.runningCount ?? workers.length} | retry: ${health?.retryCount ?? 0} | blocked: ${health?.blockedCount ?? 0} | completed: ${health?.completedCount ?? 0}`,
      `owned process: ${state.ownedProcess ? `pid ${state.ownedProcess.pid}` : "none"}`,
      `updated: ${health?.updatedAt ?? "never"}`,
      "",
      this.refreshing ? "refreshing..." : "keys: ↑/↓ select | r refresh | s steer | d details | q/esc close",
      "",
      ...renderWorkerTable(workers, this.selectedWorkerIndex),
      ...renderSelectedWorkerDetails(selectedWorker, state.dashboard.showDetails),
      ...renderRecentEvents(formatEventRows(this.options.getEvents())),
    ];

    return lines.map((line) => truncateToWidth(line, width));
  }

  invalidate(): void {}

  private moveSelection(delta: number): void {
    const workers = buildWorkerRows(this.options.getState());
    if (workers.length === 0) return;
    this.selectedWorkerIndex = Math.max(0, Math.min(workers.length - 1, this.selectedWorkerIndex + delta));
    this.options.requestRender();
  }

  private clampSelection(workerCount: number): void {
    if (workerCount === 0) {
      this.selectedWorkerIndex = 0;
      return;
    }
    this.selectedWorkerIndex = Math.max(0, Math.min(workerCount - 1, this.selectedWorkerIndex));
  }

  private async steerSelectedWorker(): Promise<void> {
    const workers = buildWorkerRows(this.options.getState());
    this.clampSelection(workers.length);
    const worker = workers[this.selectedWorkerIndex];
    if (!worker) {
      this.options.notify("No running worker is selected", "warning");
      return;
    }

    try {
      const instruction = (await this.options.prompt("Steer Symphony worker", `Instruction for ${worker.issueIdentifier}`))?.trim();
      if (!instruction) return;

      await this.options.steer(worker.issueIdentifier, instruction);
      this.options.notify(`Steer delivered to ${worker.issueIdentifier}`, "info");
    } catch (error) {
      this.options.notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      this.options.requestRender();
    }
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) return;

    this.refreshing = true;
    this.options.requestRender();
    try {
      await this.options.refresh();
    } catch (error) {
      this.options.notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      this.refreshing = false;
      this.options.requestRender();
    }
  }
}

function renderWorkerTable(workers: WorkerRow[], selectedIndex: number): string[] {
  const lines = ["Running workers", "sel issue    state           attempt turns   host      last activity"];
  if (workers.length === 0) return [...lines, "-   no running workers"];

  for (const [index, worker] of workers.entries()) {
    const selected = index === selectedIndex ? ">" : " ";
    lines.push(
      [
        selected,
        pad(worker.issueIdentifier, 8),
        pad(worker.trackerState, 15),
        pad(worker.attempt, 7),
        pad(`${worker.turnCount}/${worker.maxTurns}`, 7),
        pad(worker.workerHost, 9),
        worker.lastActivity,
      ].join(" "),
    );
  }
  return lines;
}

function renderSelectedWorkerDetails(worker: WorkerRow | undefined, showDetails: boolean): string[] {
  if (!showDetails) return [];
  if (!worker) return ["", "Selected worker", "none"];
  return [
    "",
    "Selected worker",
    `issue: ${worker.issueIdentifier} ${worker.title}`,
    `tracker state: ${worker.trackerState}`,
    `attempt: ${worker.attempt}`,
    `turns: ${worker.turnCount} / ${worker.maxTurns}`,
    `last activity: ${worker.lastActivity}`,
    `worker host: ${worker.workerHost}`,
    `workspace: ${worker.workspacePath}`,
    `error: ${worker.errorPreview}`,
  ];
}

function renderRecentEvents(events: string[]): string[] {
  const lines = ["", "Recent worker/runtime events"];
  if (events.length === 0) return [...lines, "none"];
  return [...lines, ...events];
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  return value.padEnd(width, " ");
}

export async function openDashboard(ctx: ExtensionContext, runtime: SymphonyRuntime): Promise<void> {
  if (!runtime.client) {
    ctx.ui.notify("No Symphony server is attached. Use /symphony:start or /symphony:attach first.", "warning");
    return;
  }

  try {
    await runtime.refreshState();
  } catch (error) {
    ctx.ui.notify(runtime.errorText(error), "error");
  }

  await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
    const component = new SymphonyDashboardComponent({
      state: runtime.state,
      getState: () => runtime.lastState,
      getEvents: () => runtime.recentEvents,
      refresh: async () => {
        await runtime.requestRefresh();
      },
      steer: async (issueIdentifier, instruction) => {
        await runtime.steerWorker(issueIdentifier, instruction);
      },
      prompt: async (title, label) => ctx.ui.input(title, label),
      close: () => done(undefined),
      requestRender: () => tui.requestRender(),
      notify: (message, level) => ctx.ui.notify(message, level),
    });
    return component;
  });
}
