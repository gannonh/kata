import { describe, expect, it, vi } from "vitest";
import { ConsolePanel } from "../console-panel.js";
import { renderConsolePanel } from "../console-render.js";
import { createEmptyConsolePanelState, type ConsolePanelState } from "../console-state.js";

function makeState(overrides: Partial<ConsolePanelState> = {}): ConsolePanelState {
  return {
    workers: [],
    escalations: [],
    connectionStatus: "connected",
    connectionUrl: "http://127.0.0.1:8080",
    lastUpdateAt: 10_000,
    queueCount: 0,
    completedCount: 0,
    ...overrides,
  };
}

describe("renderConsolePanel", () => {
  it("renders worker and escalation sections", () => {
    const state = makeState({
      queueCount: 1,
      completedCount: 3,
      workers: [
        {
          issueId: "issue-1",
          identifier: "KAT-1304",
          issueTitle: "Operator Console",
          linearState: "In Progress",
          currentTool: "bash",
          lastActivityAge: "4s",
          model: "claude-sonnet-4-6",
        },
      ],
      escalations: [
        {
          requestId: "req-1",
          issueId: "issue-1",
          issueIdentifier: "KAT-1304",
          issueTitle: "Operator Console",
          questionPreview: "Can we deploy this now?",
          waitingSince: 5_000,
          timeoutMs: 300_000,
        },
      ],
    });

    const lines = renderConsolePanel(state, { now: () => 15_000 });
    const joined = lines.join("\n");

    expect(joined).toContain("Symphony Console 🟢 connected");
    expect(joined).toContain("Queue 1 · Completed 3 · Workers 1");
    expect(joined).toContain("KAT-1304 · In Progress · tool:bash · 4s · claude-sonnet-4-6");
    expect(joined).toContain("⚠️ Pending escalations (1)");
    expect(joined).toContain("Reply: !respond <answer>");
  });

  it("renders disconnected + stale state messaging", () => {
    const state = makeState({
      connectionStatus: "disconnected",
      lastUpdateAt: 0,
      error: "Symphony is not reachable",
    });

    const lines = renderConsolePanel(state, { now: () => 40_000 });
    const joined = lines.join("\n");

    expect(joined).toContain("Symphony Console 🔴 disconnected");
    expect(joined).toContain("⚠️ Data is stale (>30s without events)");
    expect(joined).toContain("⚠️ Symphony is not reachable");
    expect(joined).toContain("(no active workers)");
    expect(joined).toContain("Escalations: none pending");
  });
});

describe("ConsolePanel", () => {
  it("respects position preference and cleans up widgets", () => {
    const setWidget = vi.fn();
    const setStatus = vi.fn();

    const panel = new ConsolePanel(
      {
        setWidget,
        setStatus,
        theme: {
          fg: (_key: string, value: string) => value,
          bold: (value: string) => value,
          inverse: (value: string) => value,
        },
      } as any,
      { position: "above-status" },
    );

    const state = createEmptyConsolePanelState("http://127.0.0.1:8080");
    panel.update({ ...state, connectionStatus: "connected" });

    expect(setWidget).toHaveBeenCalledTimes(1);
    expect(setWidget.mock.calls[0][2]).toEqual({ placement: "belowEditor" });

    panel.setPosition("below-output");

    expect(setWidget).toHaveBeenCalledTimes(3);
    expect(setWidget.mock.calls[1]).toEqual(["symphony-console-panel", undefined]);
    expect(setWidget.mock.calls[2][2]).toBeUndefined();

    panel.close();

    expect(setWidget).toHaveBeenLastCalledWith("symphony-console-panel", undefined);
    expect(setStatus).toHaveBeenLastCalledWith("symphony-console-panel", undefined);
  });
});
