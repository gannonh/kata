import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it("clears recent events when attaching to a new server", async () => {
    const runtime = new SymphonyRuntime();
    runtime.recordEvent({ version: "v1", sequence: 1, timestamp: "2026-05-14T12:00:00Z", kind: "worker", severity: "error", event: "worker_failed", payload: {} });
    const response = {
      tracker_project_url: "https://linear.app/kata-sh/project/symphony",
      running: {},
      retry_queue: [],
      blocked: [],
      completed: [],
      polling: { checking: false, next_poll_in_ms: 1000, poll_interval_ms: 30000 },
    };
    const fetchStub: typeof fetch = async () =>
      ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(response),
      }) as unknown as Response;
    vi.stubGlobal("fetch", fetchStub);

    await expect(runtime.attach("http://127.0.0.1:8080")).resolves.toEqual(response);

    expect(runtime.recentEvents).toEqual([]);
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

  it("returns steer result even if post-steer refresh fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = new SymphonyRuntime();
    runtime.client = {
      steer: vi.fn(async () => ({ ok: true, issueId: "issue-123", issueIdentifier: "SIM-123", delivered: true, instructionPreview: "Use auth" })),
      getState: vi.fn(async () => {
        throw new Error("temporary state fetch failure");
      }),
      toHealthSummary: vi.fn(() => lastKnownState("http://127.0.0.1:8080")),
    } as unknown as SymphonyRuntime["client"];

    await expect(runtime.steerWorker("SIM-123", "Use auth")).resolves.toMatchObject({ delivered: true });

    expect(runtime.client?.steer).toHaveBeenCalledWith("SIM-123", "Use auth", undefined);
    expect(runtime.client?.getState).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("Symphony state refresh failed after steer", expect.any(Error));
  });

  it("responds to an escalation and refreshes state", async () => {
    const runtime = new SymphonyRuntime();
    const response = {
      running: {},
      retry_queue: [],
      blocked: [],
      completed: [],
      polling: { checking: false, next_poll_in_ms: 1000, poll_interval_ms: 30000 },
    };
    const escalationResponse = { ok: true };
    const escalationDecision = { approved: true };
    runtime.client = {
      respondEscalation: vi.fn(async () => escalationResponse),
      getState: vi.fn(async () => response),
      toHealthSummary: vi.fn(() => lastKnownState("http://127.0.0.1:8080")),
    } as unknown as SymphonyRuntime["client"];

    await expect(runtime.respondToEscalation("esc-1", escalationDecision)).resolves.toEqual({ ok: true });

    expect(runtime.client?.respondEscalation).toHaveBeenCalledWith("esc-1", escalationDecision, "pi-dashboard", undefined);
    expect(runtime.client?.getState).toHaveBeenCalledOnce();
    expect(runtime.lastState).toBe(response);
  });

  it("returns escalation response result even if post-response refresh fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = new SymphonyRuntime();
    runtime.client = {
      respondEscalation: vi.fn(async () => ({ ok: true })),
      getState: vi.fn(async () => {
        throw new Error("temporary state fetch failure");
      }),
      toHealthSummary: vi.fn(() => lastKnownState("http://127.0.0.1:8080")),
    } as unknown as SymphonyRuntime["client"];

    await expect(runtime.respondToEscalation("esc-1", "approved")).resolves.toEqual({ ok: true });

    expect(runtime.client?.respondEscalation).toHaveBeenCalledWith("esc-1", "approved", "pi-dashboard", undefined);
    expect(runtime.client?.getState).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("Symphony state refresh failed after escalation response", expect.any(Error));
  });

  it("retains recent escalation lifecycle events", () => {
    const runtime = new SymphonyRuntime();

    runtime.recordEvent({ version: "v1", sequence: 1, timestamp: "2026-05-14T12:00:00Z", kind: "escalation_created", severity: "info", event: "escalation_created", payload: {} });
    runtime.recordEvent({ version: "v1", sequence: 2, timestamp: "2026-05-14T12:00:01Z", kind: "escalation_responded", severity: "info", event: "escalation_responded", payload: {} });
    runtime.recordEvent({ version: "v1", sequence: 3, timestamp: "2026-05-14T12:00:02Z", kind: "heartbeat", severity: "info", event: "heartbeat", payload: {} });

    expect(runtime.recentEvents.map((event) => event.kind)).toEqual(["escalation_created", "escalation_responded"]);
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
