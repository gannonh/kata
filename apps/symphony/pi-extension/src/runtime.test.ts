import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { SymphonyRuntime } from "./runtime.ts";
import { STATE_ENTRY_TYPE, type LastKnownSymphonyState } from "./state.ts";

function contextWithEntries(entries: unknown[]): ExtensionContext {
  return {
    sessionManager: {
      getEntries: () => entries,
    },
  } as unknown as ExtensionContext;
}

function lastKnownState(baseUrl: string): LastKnownSymphonyState {
  return {
    baseUrl,
    runningCount: 1,
    retryCount: 0,
    blockedCount: 0,
    completedCount: 2,
    pollingChecking: false,
    nextPollInMs: 1000,
    updatedAt: "2026-05-14T00:00:01.000Z",
  };
}

describe("SymphonyRuntime", () => {
  it("clears the active attachment and last known state", () => {
    const runtime = new SymphonyRuntime();
    const baseUrl = "http://127.0.0.1:8080";
    runtime.state.attachedBaseUrl = baseUrl;
    runtime.state.lastKnownState = lastKnownState(baseUrl);
    runtime.client = {} as SymphonyRuntime["client"];

    expect(runtime.clearAttachmentIfBaseUrl("http://127.0.0.1:8081")).toBe(false);
    expect(runtime.state.attachedBaseUrl).toBe(baseUrl);

    expect(runtime.clearAttachmentIfBaseUrl(baseUrl)).toBe(true);
    expect(runtime.state.attachedBaseUrl).toBeUndefined();
    expect(runtime.state.lastKnownState).toBeUndefined();
    expect(runtime.client).toBeUndefined();
  });

  it("keeps restored state shared with the process manager", async () => {
    const runtime = new SymphonyRuntime();

    runtime.restore(
      contextWithEntries([
        {
          type: "custom",
          customType: STATE_ENTRY_TYPE,
          data: {
            attachedBaseUrl: "http://127.0.0.1:8080",
            ownedProcess: {
              pid: 123,
              command: "symphony --no-tui",
              cwd: "/repo",
              baseUrl: "http://127.0.0.1:8080",
              startedAt: "2026-05-14T00:00:00.000Z",
            },
          },
        },
      ]),
    );

    expect(runtime.state.ownedProcess?.pid).toBe(123);

    await expect(runtime.processManager.stopOwned()).rejects.toMatchObject({ kind: "not_owned" });
    expect(runtime.state.ownedProcess).toBeUndefined();
  });

  it("keeps the latest raw Symphony state after refresh", async () => {
    const runtime = new SymphonyRuntime();
    const response = {
      tracker_project_url: "https://linear.app/kata-sh/project/symphony",
      running: {},
      retry_queue: [],
      blocked: [],
      completed: [],
      polling: { checking: false, next_poll_in_ms: 1000, poll_interval_ms: 30000 },
    };
    runtime.client = {
      getState: vi.fn(async () => response),
      toHealthSummary: vi.fn(() => lastKnownState("http://127.0.0.1:8080")),
    } as unknown as SymphonyRuntime["client"];

    await expect(runtime.refreshState()).resolves.toBe(response);

    expect(runtime.lastState).toBe(response);
    expect(runtime.state.lastKnownState?.runningCount).toBe(1);
  });

  it("requests a refresh before fetching the latest state", async () => {
    const runtime = new SymphonyRuntime();
    const calls: string[] = [];
    const response = {
      running: {},
      retry_queue: [],
      blocked: [],
      completed: [],
      polling: { checking: false, next_poll_in_ms: 1000, poll_interval_ms: 30000 },
    };
    runtime.client = {
      refresh: vi.fn(async () => {
        calls.push("refresh");
        return { queued: true, coalesced: false, pendingRequests: 1 };
      }),
      getState: vi.fn(async () => {
        calls.push("getState");
        return response;
      }),
      toHealthSummary: vi.fn(() => lastKnownState("http://127.0.0.1:8080")),
    } as unknown as SymphonyRuntime["client"];

    await runtime.requestRefresh();

    expect(calls).toEqual(["refresh", "getState"]);
    expect(runtime.lastState).toBe(response);
  });

  it("steers a worker and refreshes state", async () => {
    const runtime = new SymphonyRuntime();
    const response = {
      running: {},
      retry_queue: [],
      blocked: [],
      completed: [],
      polling: { checking: false, next_poll_in_ms: 1000, poll_interval_ms: 30000 },
    };
    runtime.client = {
      steer: vi.fn(async () => ({ ok: true, issueId: "issue-123", issueIdentifier: "SIM-123", delivered: true, instructionPreview: "Use auth" })),
      getState: vi.fn(async () => response),
      toHealthSummary: vi.fn(() => lastKnownState("http://127.0.0.1:8080")),
    } as unknown as SymphonyRuntime["client"];

    await expect(runtime.steerWorker("SIM-123", "Use auth")).resolves.toMatchObject({ delivered: true });

    expect(runtime.client?.steer).toHaveBeenCalledWith("SIM-123", "Use auth", undefined);
    expect(runtime.client?.getState).toHaveBeenCalledOnce();
  });

  it("retains the most recent worker and runtime events", () => {
    const runtime = new SymphonyRuntime();

    runtime.recordEvent({ version: "v1", sequence: 1, timestamp: "2026-05-14T12:00:00Z", kind: "heartbeat", severity: "info", event: "heartbeat", payload: {} });
    for (let sequence = 2; sequence <= 27; sequence += 1) {
      runtime.recordEvent({ version: "v1", sequence, timestamp: `2026-05-14T12:00:${String(sequence).padStart(2, "0")}Z`, kind: sequence % 2 === 0 ? "worker" : "runtime", severity: "info", event: "event", payload: {} });
    }

    expect(runtime.recentEvents).toHaveLength(20);
    expect(runtime.recentEvents[0]?.sequence).toBe(8);
    expect(runtime.recentEvents.at(-1)?.sequence).toBe(27);
  });
});
