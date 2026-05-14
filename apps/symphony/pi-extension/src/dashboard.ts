import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { SymphonyRuntime } from "./runtime.ts";
import type { ExtensionState } from "./state.ts";

export interface DashboardOptions {
  state: ExtensionState;
  refresh: () => Promise<void>;
  close: () => void;
  requestRender: () => void;
  notify: (message: string, level: "info" | "warning" | "error") => void;
}

export class SymphonyDashboardComponent {
  private refreshing = false;

  constructor(private readonly options: DashboardOptions) {}

  handleInput(data: string): void {
    if (data === "q" || data === "Q" || matchesKey(data, "escape")) {
      this.options.close();
      return;
    }

    if (data === "r" || data === "R") {
      void this.refresh();
    }
  }

  render(width: number): string[] {
    const state = this.options.state;
    const health = state.lastKnownState;
    const lines = [
      "Symphony Dashboard",
      "",
      `connection: ${state.attachedBaseUrl ? "attached" : "detached"}`,
      `base url: ${state.attachedBaseUrl ?? "none"}`,
      `project: ${health?.trackerProjectUrl ?? "none"}`,
      `polling: ${health?.pollingChecking ? "checking" : "idle"} | next poll: ${health?.nextPollInMs ?? 0}ms`,
      `workers: running: ${health?.runningCount ?? 0} | retry: ${health?.retryCount ?? 0} | blocked: ${health?.blockedCount ?? 0} | completed: ${health?.completedCount ?? 0}`,
      `owned process: ${state.ownedProcess ? `pid ${state.ownedProcess.pid}` : "none"}`,
      `updated: ${health?.updatedAt ?? "never"}`,
      "",
      this.refreshing ? "refreshing..." : "keys: r refresh | q/esc close",
    ];

    return lines.map((line) => truncateToWidth(line, width));
  }

  invalidate(): void {}

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
      refresh: async () => {
        await runtime.refreshState();
      },
      close: () => done(undefined),
      requestRender: () => tui.requestRender(),
      notify: (message, level) => ctx.ui.notify(message, level),
    });
    return component;
  });
}
