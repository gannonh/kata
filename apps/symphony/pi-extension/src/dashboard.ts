import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { buildWorkerRows, formatEventRows, type WorkerRow } from "./dashboard-model.ts";
import { startSymphonyEventStream, type EventStreamHandle } from "./event-stream.ts";
import type { SymphonyEventEnvelope, SymphonyStateResponse } from "./http-client.ts";
import type { SymphonyRuntime } from "./runtime.ts";
import type { ExtensionState } from "./state.ts";

type DashboardThemeColor = "accent" | "border" | "borderAccent" | "success" | "error" | "warning" | "muted" | "dim" | "text";

type DashboardThemeBg = "selectedBg";

interface DashboardTheme {
  fg(color: DashboardThemeColor, text: string): string;
  bg?(color: DashboardThemeBg, text: string): string;
  bold(text: string): string;
}

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
  theme?: DashboardTheme;
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
    const theme = this.options.theme;
    const connection = state.attachedBaseUrl ? color(theme, "success", "attached") : color(theme, "error", "detached");
    const polling = health?.pollingChecking ? color(theme, "warning", "checking") : color(theme, "success", "idle");
    const dashboardWidth = Math.max(44, Math.min(width, 120));
    const lines = [
      color(theme, "accent", bold(theme, "Symphony Dashboard")),
      "",
      ...boxLines("Status", [
        `connection: ${connection}`,
        `base url: ${color(theme, "dim", state.attachedBaseUrl ?? "none")}`,
        `project: ${color(theme, "dim", health?.trackerProjectUrl ?? "none")}`,
        `polling: ${polling} | next poll: ${health?.nextPollInMs ?? 0}ms`,
        `owned process: ${state.ownedProcess ? color(theme, "success", `pid ${state.ownedProcess.pid}`) : color(theme, "dim", "none")}`,
        `updated: ${color(theme, "dim", health?.updatedAt ?? "never")}`,
      ], dashboardWidth, theme),
      "",
      ...boxLines("Worker Summary", [
        `workers: ${color(theme, "success", `running: ${health?.runningCount ?? workers.length}`)} | ${color(theme, "warning", `retry: ${health?.retryCount ?? 0}`)} | ${color(theme, "error", `blocked: ${health?.blockedCount ?? 0}`)} | ${color(theme, "accent", `completed: ${health?.completedCount ?? 0}`)}`,
      ], dashboardWidth, theme),
      "",
      ...boxLines("Running Workers", renderWorkerTable(workers, this.selectedWorkerIndex, theme), dashboardWidth, theme),
      ...boxLines("Selected Worker", renderSelectedWorkerDetails(selectedWorker, state.dashboard.showDetails, theme), dashboardWidth, theme),
      ...boxLines("Events", renderRecentEvents(formatEventRows(this.options.getEvents()), theme), dashboardWidth, theme),
      "",
      ...boxLines("Help", [this.refreshing ? color(theme, "warning", "refreshing...") : "keys: ↑/↓ select | r refresh | s steer | d details | q/esc close"], dashboardWidth, theme),
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

function renderWorkerTable(workers: WorkerRow[], selectedIndex: number, theme?: DashboardTheme): string[] {
  const lines = [bold(theme, "Running workers"), color(theme, "dim", "sel issue    state           attempt turns   host      last activity")];
  if (workers.length === 0) return [...lines, color(theme, "dim", "-   no running workers")];

  for (const [index, worker] of workers.entries()) {
    const selected = index === selectedIndex ? ">" : " ";
    const line = [
      selected,
      pad(worker.issueIdentifier, 8),
      pad(worker.trackerState, 15),
      pad(worker.attempt, 7),
      pad(`${worker.turnCount}/${worker.maxTurns}`, 7),
      pad(worker.workerHost, 9),
      worker.lastActivity,
    ].join(" ");
    lines.push(index === selectedIndex ? selectedLine(theme, line) : line);
  }
  return lines;
}

function renderSelectedWorkerDetails(worker: WorkerRow | undefined, showDetails: boolean, theme?: DashboardTheme): string[] {
  if (!showDetails) return [];
  if (!worker) return [bold(theme, "Selected worker"), color(theme, "dim", "none")];
  return [
    bold(theme, "Selected worker"),
    `issue: ${color(theme, "accent", worker.issueIdentifier)} ${worker.title}`,
    `tracker state: ${color(theme, "success", worker.trackerState)}`,
    `attempt: ${worker.attempt}`,
    `turns: ${worker.turnCount} / ${worker.maxTurns}`,
    `last activity: ${color(theme, "dim", worker.lastActivity)}`,
    `worker host: ${worker.workerHost}`,
    `workspace: ${color(theme, "dim", worker.workspacePath)}`,
    `error: ${worker.errorPreview === "-" ? color(theme, "dim", worker.errorPreview) : color(theme, "error", worker.errorPreview)}`,
  ];
}

function renderRecentEvents(events: string[], theme?: DashboardTheme): string[] {
  const lines = [bold(theme, "Recent worker/runtime events")];
  if (events.length === 0) return [...lines, color(theme, "dim", "none")];
  return [...lines, ...events.map((event) => colorEventRow(event, theme))];
}

function colorEventRow(event: string, theme?: DashboardTheme): string {
  if (event.includes(" error ")) return color(theme, "error", event);
  if (event.includes(" warn ") || event.includes(" warning ")) return color(theme, "warning", event);
  if (event.includes(" debug ")) return color(theme, "dim", event);
  if (event.includes(" info ")) return color(theme, "success", event);
  return event;
}

function boxLines(title: string, content: string[], width: number, theme?: DashboardTheme): string[] {
  const innerWidth = Math.max(20, width - 4);
  const titleText = ` ${title} `;
  const border = (value: string) => color(theme, "borderAccent", value);
  const top = `${border("┌")}${border("─".repeat(1))}${bold(theme, titleText)}${border("─".repeat(Math.max(1, innerWidth + 1 - visibleLength(titleText))))}${border("┐")}`;
  const body = content.length === 0 ? [color(theme, "dim", "none")] : content;
  return [
    top,
    ...body.map((line) => `${border("│")} ${padVisible(line, innerWidth)} ${border("│")}`),
    `${border("└")}${border("─".repeat(innerWidth + 2))}${border("┘")}`,
  ];
}

function color(theme: DashboardTheme | undefined, name: DashboardThemeColor, value: string): string {
  return isDashboardTheme(theme) ? theme.fg(name, value) : value;
}

function bold(theme: DashboardTheme | undefined, value: string): string {
  return isDashboardTheme(theme) ? theme.bold(value) : value;
}

function selectedLine(theme: DashboardTheme | undefined, value: string): string {
  const styled = color(theme, "accent", bold(theme, value));
  return isDashboardTheme(theme) && theme.bg ? theme.bg("selectedBg", styled) : styled;
}

function isDashboardTheme(theme: DashboardTheme | undefined): theme is DashboardTheme {
  if (!theme) return false;
  return typeof theme.fg === "function" && typeof theme.bold === "function";
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  return value.padEnd(width, " ");
}

function padVisible(value: string, width: number): string {
  const visible = visibleLength(value);
  if (visible >= width) return value;
  return `${value}${" ".repeat(width - visible)}`;
}

function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
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
    let eventStream: EventStreamHandle | undefined;
    let eventStreamErrorNotified = false;
    let closed = false;
    let liveRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    let liveRefreshInFlight = false;
    let liveRefreshPending = false;

    const scheduleLiveRefresh = () => {
      liveRefreshPending = true;
      if (liveRefreshTimer) return;
      liveRefreshTimer = setTimeout(() => {
        liveRefreshTimer = undefined;
        if (!liveRefreshPending) return;
        liveRefreshPending = false;
        void runLiveRefresh();
      }, 100);
    };

    const runLiveRefresh = async () => {
      if (closed) return;
      if (liveRefreshInFlight) {
        liveRefreshPending = true;
        return;
      }
      liveRefreshInFlight = true;
      try {
        await runtime.refreshState();
      } catch (error) {
        ctx.ui.notify(`Symphony state refresh failed: ${runtime.errorText(error)}`, "warning");
      } finally {
        liveRefreshInFlight = false;
        tui.requestRender();
        if (liveRefreshPending && !closed) scheduleLiveRefresh();
      }
    };

    if (runtime.state.attachedBaseUrl) {
      eventStream = startSymphonyEventStream({
        baseUrl: runtime.state.attachedBaseUrl,
        onEvent: (event) => {
          runtime.recordEvent(event);
          tui.requestRender();
          scheduleLiveRefresh();
        },
        onError: (error) => {
          if (eventStreamErrorNotified) return;
          eventStreamErrorNotified = true;
          ctx.ui.notify(`Symphony event stream unavailable: ${error.message}`, "warning");
        },
      });
    }

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
      close: () => {
        closed = true;
        if (liveRefreshTimer) clearTimeout(liveRefreshTimer);
        eventStream?.close();
        done(undefined);
      },
      requestRender: () => tui.requestRender(),
      notify: (message, level) => ctx.ui.notify(message, level),
      theme: _theme,
    });
    return component;
  });
}
