import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { openDashboard, SymphonyDashboardComponent } from "./dashboard.ts";
import { startSymphonyEventStream } from "./event-stream.ts";
import type { SymphonyEventEnvelope, SymphonyStateResponse } from "./http-client.ts";
import type { SymphonyRuntime } from "./runtime.ts";
import { createDefaultState } from "./state.ts";

vi.mock("./event-stream.ts", () => ({
  startSymphonyEventStream: vi.fn(() => ({ close: vi.fn() })),
}));

function workerStateFixture(): SymphonyStateResponse {
  return {
    tracker_project_url: "https://linear.app/kata-sh/project/symphony",
    running: {
      "issue-123": {
        issue_id: "issue-123",
        issue_identifier: "SIM-123",
        issue_title: "Worker one",
        attempt: 2,
        workspace_path: "/tmp/symphony/issue-123",
        started_at: "2026-05-14T12:00:00Z",
        status: "running",
        worker_host: "worker-a",
        tracker_state: "In Progress",
      },
      "issue-777": {
        issue_id: "issue-777",
        issue_identifier: "SIM-777",
        issue_title: "Worker two",
        workspace_path: "/tmp/symphony/issue-777",
        started_at: "2026-05-14T12:05:00Z",
        status: "running",
        error: "usage limit",
        tracker_state: "Agent Review",
      },
    },
    running_sessions: {
      "issue-123": {
        turn_count: 2,
        last_activity_at: "2026-05-14T12:03:00Z",
        last_event: "tool_call_completed",
        last_event_message: "running cargo test",
      },
    },
    running_session_info: {
      "issue-123": { turn_count: 3, max_turns: 20, last_activity_ms: Date.parse("2026-05-14T12:04:00Z"), last_error: null },
      "issue-777": { turn_count: 1, max_turns: 10, last_activity_ms: null, last_error: "usage limit" },
    },
    retry_queue: [],
    blocked: [],
    completed: [],
    polling: { checking: false, next_poll_in_ms: 1000, poll_interval_ms: 30000 },
  };
}

function runtimeEventsFixture(): SymphonyEventEnvelope[] {
  return [
    {
      version: "v1",
      sequence: 1,
      timestamp: "2026-05-14T12:01:00Z",
      kind: "runtime",
      severity: "info",
      event: "poll_completed",
      payload: { summary: "checked tracker" },
    },
    {
      version: "v1",
      sequence: 2,
      timestamp: "2026-05-14T12:02:00Z",
      kind: "worker",
      severity: "error",
      issue: "SIM-777",
      event: "worker_failed",
      payload: { error_preview: "usage limit" },
    },
  ];
}

describe("SymphonyDashboardComponent", () => {
  it("renders Slice 1 health fields", () => {
    const state = createDefaultState();
    state.attachedBaseUrl = "http://127.0.0.1:8080";
    state.ownedProcess = { pid: 123, command: "symphony --no-tui", cwd: "/repo", baseUrl: state.attachedBaseUrl, startedAt: "2026-05-14T00:00:00Z" };
    state.lastKnownState = {
      baseUrl: state.attachedBaseUrl,
      trackerProjectUrl: "https://github.com/gannonh/kata/projects/1",
      runningCount: 2,
      retryCount: 1,
      blockedCount: 0,
      completedCount: 4,
      pollingChecking: false,
      nextPollInMs: 5000,
      updatedAt: "2026-05-14T00:00:01Z",
    };

    const dashboard = new SymphonyDashboardComponent({
      state,
      getState: () => undefined,
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    const output = dashboard.render(120).join("\n");
    expect(output).toContain("Symphony Dashboard");
    expect(output).toContain("http://127.0.0.1:8080");
    expect(output).toContain("project: https://github.com/gannonh/kata/projects/1");
    expect(output).toContain("running: 2");
    expect(output).toContain("retry: 1");
    expect(output).toContain("owned process: pid 123");
  });

  it("renders running workers, selected-worker details, and recent runtime events", () => {
    const state = createDefaultState();
    state.dashboard.showDetails = true;
    const dashboard = new SymphonyDashboardComponent({
      state,
      getState: () => workerStateFixture(),
      getEvents: () => runtimeEventsFixture(),
      refresh: async () => undefined,
      steer: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    const output = dashboard.render(160).join("\n");

    expect(output).toContain("Running workers");
    expect(output).toContain("> SIM-123");
    expect(output).toContain("SIM-777");
    expect(output).toContain("Selected worker");
    expect(output).toContain("issue: SIM-123 Worker one");
    expect(output).toContain("tracker state: In Progress");
    expect(output).toContain("attempt: 2");
    expect(output).toContain("turns: 3 / 20");
    expect(output).toContain("last activity: 2026-05-14T12:04:00.000Z");
    expect(output).toContain("worker host: worker-a");
    expect(output).toContain("workspace: /tmp/symphony/issue-123");
    expect(output).toContain("Recent worker/runtime events");
    expect(output).toContain("worker_failed usage limit");
  });

  it("moves selection with arrow keys", () => {
    const state = createDefaultState();
    const dashboard = new SymphonyDashboardComponent({
      state,
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    dashboard.handleInput("\u001b[B");

    const output = dashboard.render(160).join("\n");
    expect(output).toContain("> SIM-777");
    expect(output).toContain("issue: SIM-777 Worker two");
  });

  it("toggles selected-worker details", () => {
    const state = createDefaultState();
    state.dashboard.showDetails = true;
    const dashboard = new SymphonyDashboardComponent({
      state,
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    dashboard.handleInput("d");

    expect(dashboard.render(160).join("\n")).not.toContain("Selected worker");
  });

  it("prompts for a steer instruction and sends it to the selected worker", async () => {
    let resolveSteered: (() => void) | undefined;
    const steered = new Promise<void>((resolve) => {
      resolveSteered = resolve;
    });
    const steer = vi.fn(async () => {
      resolveSteered?.();
    });
    let resolveNotified: (() => void) | undefined;
    const notified = new Promise<void>((resolve) => {
      resolveNotified = resolve;
    });
    const notify = vi.fn(() => {
      resolveNotified?.();
    });
    const dashboard = new SymphonyDashboardComponent({
      state: createDefaultState(),
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer,
      prompt: async () => "Use the existing auth module",
      close: () => undefined,
      requestRender: () => undefined,
      notify,
    });

    dashboard.handleInput("s");
    await steered;
    await notified;

    expect(steer).toHaveBeenCalledWith("SIM-123", "Use the existing auth module");
    expect(notify).toHaveBeenCalledWith("Steer delivered to SIM-123", "info");
  });

  it("notifies and requests render when steering prompt fails", async () => {
    const notify = vi.fn();
    const requestRender = vi.fn();
    const dashboard = new SymphonyDashboardComponent({
      state: createDefaultState(),
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      prompt: async () => {
        throw new Error("prompt failed");
      },
      close: () => undefined,
      requestRender,
      notify,
    });

    dashboard.handleInput("s");
    await expect.poll(() => notify.mock.calls.length, { interval: 10, timeout: 1000 }).toBe(1);

    expect(notify).toHaveBeenCalledWith("prompt failed", "error");
    expect(requestRender).toHaveBeenCalledOnce();
  });

  it("closes on q", () => {
    const close = vi.fn();
    const dashboard = new SymphonyDashboardComponent({
      state: createDefaultState(),
      getState: () => undefined,
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      prompt: async () => undefined,
      close,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    dashboard.handleInput("q");
    expect(close).toHaveBeenCalledOnce();
  });

  it("ignores refresh input while a refresh is already running", async () => {
    let resolveRefresh: (() => void) | undefined;
    const refreshDone = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const refresh = vi.fn(() => refreshDone);
    const dashboard = new SymphonyDashboardComponent({
      state: createDefaultState(),
      getState: () => undefined,
      getEvents: () => [],
      refresh,
      steer: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    dashboard.handleInput("r");
    dashboard.handleInput("r");

    expect(refresh).toHaveBeenCalledOnce();
    resolveRefresh?.();
    await refreshDone;
  });

  it("notifies when a refresh fails", async () => {
    let resolveNotified: (() => void) | undefined;
    const notified = new Promise<void>((resolve) => {
      resolveNotified = resolve;
    });
    const notify = vi.fn((_message: string, _level: "info" | "warning" | "error") => {
      resolveNotified?.();
    });
    const dashboard = new SymphonyDashboardComponent({
      state: createDefaultState(),
      getState: () => undefined,
      getEvents: () => [],
      refresh: async () => {
        throw new Error("refresh failed");
      },
      steer: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify,
    });

    dashboard.handleInput("r");
    await notified;

    expect(notify).toHaveBeenCalledWith("refresh failed", "error");
  });
});

describe("openDashboard", () => {
  it("opens the event stream and records incoming dashboard events", async () => {
    const state = createDefaultState();
    state.attachedBaseUrl = "http://127.0.0.1:8080";
    state.lastKnownState = {
      baseUrl: state.attachedBaseUrl,
      runningCount: 1,
      retryCount: 0,
      blockedCount: 0,
      completedCount: 0,
      pollingChecking: false,
      nextPollInMs: 1000,
      updatedAt: "2026-05-14T12:00:00Z",
    };

    let capturedOnEvent: ((event: SymphonyEventEnvelope) => void) | undefined;
    vi.mocked(startSymphonyEventStream).mockImplementation((options) => {
      capturedOnEvent = options.onEvent;
      return { close: vi.fn() };
    });

    type CustomFactory = Parameters<ExtensionContext["ui"]["custom"]>[0];
    const requestRender = vi.fn();
    const custom = vi.fn(async (factory: CustomFactory): Promise<void> => {
      const component = await factory(
        { requestRender } as unknown as Parameters<CustomFactory>[0],
        {} as Parameters<CustomFactory>[1],
        {} as Parameters<CustomFactory>[2],
        (() => undefined) as Parameters<CustomFactory>[3],
      );
      capturedOnEvent?.({
        version: "v1",
        sequence: 1,
        timestamp: "2026-05-14T12:00:00Z",
        kind: "worker",
        severity: "info",
        issue: "SIM-123",
        event: "worker_started",
        payload: {},
      });
      expect(component.render(120).join("\n")).toContain("worker_started");
    });
    const ctx = { ui: { notify: vi.fn(), custom, input: vi.fn() } } as unknown as ExtensionContext;
    const runtime = {
      client: {},
      state,
      lastState: workerStateFixture(),
      recentEvents: [],
      recordEvent: vi.fn(function (this: { recentEvents: SymphonyEventEnvelope[] }, event: SymphonyEventEnvelope) {
        this.recentEvents.push(event);
      }),
      requestRefresh: vi.fn(async () => undefined),
      refreshState: vi.fn(async () => workerStateFixture()),
      steerWorker: vi.fn(async () => undefined),
      errorText: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    } as unknown as SymphonyRuntime;

    await openDashboard(ctx, runtime);

    expect(startSymphonyEventStream).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "http://127.0.0.1:8080" }));
    expect(requestRender).toHaveBeenCalled();
  });

  it("notifies and still opens when launch refresh fails", async () => {
    const state = createDefaultState();
    state.attachedBaseUrl = "http://127.0.0.1:8080";
    state.lastKnownState = {
      baseUrl: state.attachedBaseUrl,
      trackerProjectUrl: "https://github.com/gannonh/kata/projects/1",
      runningCount: 1,
      retryCount: 0,
      blockedCount: 0,
      completedCount: 2,
      pollingChecking: false,
      nextPollInMs: 1000,
      updatedAt: "2026-05-14T00:00:01Z",
    };

    type CustomFactory = Parameters<ExtensionContext["ui"]["custom"]>[0];
    const requestRender = vi.fn();
    const notify = vi.fn();
    const custom = vi.fn(async (factory: CustomFactory): Promise<void> => {
      const component = await factory(
        { requestRender } as unknown as Parameters<CustomFactory>[0],
        {} as Parameters<CustomFactory>[1],
        {} as Parameters<CustomFactory>[2],
        (() => undefined) as Parameters<CustomFactory>[3],
      );

      expect(component.render(120).join("\n")).toContain("running: 1");
    });
    const ctx = { ui: { notify, custom, input: vi.fn() } } as unknown as ExtensionContext;
    const runtime = {
      client: {},
      state,
      lastState: undefined,
      recentEvents: [],
      refreshState: vi.fn(async () => {
        throw new Error("launch refresh failed");
      }),
      requestRefresh: vi.fn(async () => undefined),
      steerWorker: vi.fn(async () => undefined),
      errorText: vi.fn((error: unknown) => (error instanceof Error ? `formatted: ${error.message}` : String(error))),
    } as unknown as SymphonyRuntime;

    await openDashboard(ctx, runtime);

    expect(notify).toHaveBeenCalledWith("formatted: launch refresh failed", "error");
    expect(custom).toHaveBeenCalledOnce();
  });
});
