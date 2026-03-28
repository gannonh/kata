import type { ExtensionUIContext, Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { createEmptyConsolePanelState, type ConsolePanelPosition, type ConsolePanelState } from "./console-state.js";
import { renderConsolePanel } from "./console-render.js";

export interface ConsolePanelOptions {
  widgetKey?: string;
  statusKey?: string;
  position?: ConsolePanelPosition;
  now?: () => number;
}

export class ConsolePanel {
  private readonly widgetKey: string;
  private readonly statusKey: string;
  private readonly now: () => number;
  private position: ConsolePanelPosition;
  private state: ConsolePanelState = createEmptyConsolePanelState("");
  private mounted = false;
  private widgetRef: { requestRender: () => void } | null = null;

  constructor(
    private readonly ui: ExtensionUIContext,
    options: ConsolePanelOptions = {},
  ) {
    this.widgetKey = options.widgetKey ?? "symphony-console-panel";
    this.statusKey = options.statusKey ?? "symphony-console-panel";
    this.position = options.position ?? "below-output";
    this.now = options.now ?? Date.now;
  }

  update(state: ConsolePanelState): void {
    this.state = state;
    if (!this.mounted) {
      this.mount();
    }

    this.ui.setStatus(this.statusKey, this.statusSummary(state));
    this.widgetRef?.requestRender();
  }

  setPosition(position: ConsolePanelPosition): void {
    if (this.position === position) {
      return;
    }

    this.position = position;

    if (!this.mounted) {
      return;
    }

    this.unmount();
    this.mount();
    this.widgetRef?.requestRender();
  }

  close(): void {
    this.unmount();
    this.ui.setStatus(this.statusKey, undefined);
    this.state = createEmptyConsolePanelState(this.state.connectionUrl);
  }

  isOpen(): boolean {
    return this.mounted;
  }

  private mount(): void {
    if (this.mounted) {
      return;
    }

    this.ui.setWidget(
      this.widgetKey,
      (tui: TUI, _theme: Theme) => {
        this.widgetRef = {
          requestRender: () => tui.requestRender(),
        };

        return {
          render: () => renderConsolePanel(this.state, { now: this.now }),
          invalidate: () => undefined,
        };
      },
      this.widgetPlacement(),
    );

    this.mounted = true;
  }

  private unmount(): void {
    if (!this.mounted) {
      return;
    }

    this.ui.setWidget(this.widgetKey, undefined);
    this.widgetRef = null;
    this.mounted = false;
  }

  private widgetPlacement(): { placement: "belowEditor" } | undefined {
    if (this.position === "above-status") {
      return { placement: "belowEditor" };
    }

    return undefined;
  }

  private statusSummary(state: ConsolePanelState): string {
    const icon =
      state.connectionStatus === "connected"
        ? "🟢"
        : state.connectionStatus === "reconnecting"
          ? "🟡"
          : "🔴";

    return `${icon} Symphony console (${state.escalations.length} escalation${state.escalations.length === 1 ? "" : "s"})`;
  }
}
