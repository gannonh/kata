import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleActiveConsoleShortcut, openConsole, SymphonyConsoleComponent } from "./console.ts";
import { startSymphonyEventStream } from "./event-stream.ts";
import type { SymphonyEventEnvelope, SymphonyStateResponse } from "./http-client.ts";
import type { SymphonyRuntime } from "./runtime.ts";
import { createDefaultState } from "./state.ts";

vi.mock("./event-stream.ts", () => ({
  startSymphonyEventStream: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(startSymphonyEventStream).mockReset();
  vi.mocked(startSymphonyEventStream).mockImplementation(() => ({ close: vi.fn() }));
});

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
    retry_queue: [{ issue_id: "issue-retry", identifier: "SIM-200", attempt: 3, due_in_ms: 90000, error: "rate limit", worker_host: "host-b", workspace_path: "/tmp/retry" }],
    blocked: [{ issue_id: "issue-blocked", identifier: "SIM-300", title: "Blocked work", state: "Todo", blocker_identifiers: ["SIM-100", "SIM-101"] }],
    pending_escalations: [{ request_id: "esc-1", issue_id: "issue-123", issue_identifier: "SIM-123", method: "approval", preview: "Approve cargo test?", created_at: "2026-05-14T12:06:00Z", timeout_ms: 600000 }],
    completed: [{ issue_id: "issue-done", identifier: "SIM-400", title: "Done work", completed_at: "2026-05-14T13:00:00Z" }],
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

function fakeTheme() {
  return {
    fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
    bg: (color: string, text: string) => `<bg:${color}>${text}</bg:${color}>`,
    bold: (text: string) => `<bold>${text}</bold>`,
  };
}

describe("SymphonyConsoleComponent", () => {
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

    const consoleComponent = new SymphonyConsoleComponent({
      state,
      getState: () => undefined,
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    const output = consoleComponent.render(120).join("\n");
    expect(output).toContain("Symphony Console");
    expect(output).toContain("dashboard: http://127.0.0.1:8080");
    expect(output).toContain("project: https://github.com/gannonh/kata/projects/1");
    expect(output).toContain("running: 2");
    expect(output).toContain("retry: 1");
    expect(output).toContain("owned process: pid 123");
  });

  it("renders running workers, selected issue details, and recent runtime events", () => {
    const state = createDefaultState();
    state.console.showDetails = true;
    const consoleComponent = new SymphonyConsoleComponent({
      state,
      getState: () => workerStateFixture(),
      getEvents: () => runtimeEventsFixture(),
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    const output = consoleComponent.render(160).join("\n");

    expect(output).toContain("Running Workers");
    expect(output).toContain("> SIM-123");
    expect(output).toContain("SIM-777");
    expect(output).toContain("Selected Issue");
    expect(output).toContain("issue: SIM-123 Worker one");
    expect(output).toContain("tracker state: In Progress");
    expect(output).toContain("attempt: 2");
    expect(output).toContain("turns: 3 / 20");
    expect(output).toContain("last activity: 2026-05-14T12:04:00.000Z");
    expect(output).toContain("worker host: worker-a");
    expect(output).toContain("workspace: /tmp/symphony/issue-123");
    expect(output).toContain("Events");
    expect(output).toContain("worker_failed usage limit");
  });

  it("renders retry, blocked, completed, and selected issue sections", () => {
    const state = createDefaultState();
    state.console.showDetails = true;
    const consoleComponent = new SymphonyConsoleComponent({
      state,
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    const output = consoleComponent.render(180).join("\n");

    expect(output).toContain("Retry Queue");
    expect(output).toContain("Blocked Issues");
    expect(output).toContain("Completed Issues");
    expect(output).toContain("Selected Issue");
    expect(output).toContain("SIM-200");
    expect(output).toContain("retry in 1m 30s");
    expect(output).toContain("SIM-300");
    expect(output).toContain("SIM-100, SIM-101");
    expect(output).toContain("SIM-400");
    expect(output).toContain("2026-05-14T13:00:00Z");
  });

  it("moves selection across retry, blocked, and completed rows and limits steering to running rows", () => {
    const state = createDefaultState();
    state.console.showDetails = true;
    const steer = vi.fn(async () => undefined);
    const notify = vi.fn();
    const consoleComponent = new SymphonyConsoleComponent({
      state,
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer,
      respondToEscalation: async () => undefined,
      prompt: async () => "not used",
      close: () => undefined,
      requestRender: () => undefined,
      notify,
    });

    consoleComponent.handleInput("\u001b[B");
    consoleComponent.handleInput("\u001b[B");
    let output = consoleComponent.render(180).join("\n");
    expect(output).toContain("> SIM-200");
    expect(output).toContain("issue: SIM-200 rate limit");
    expect(output).toContain("kind: retry");
    expect(output).toContain("status: retry in 1m 30s");
    expect(output).toContain("workspace: /tmp/retry");

    consoleComponent.handleInput("s");
    expect(steer).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Select a running worker before steering", "warning");

    consoleComponent.handleInput("\u001b[B");
    output = consoleComponent.render(180).join("\n");
    expect(output).toContain("> SIM-300");
    expect(output).toContain("issue: SIM-300 Blocked work");
    expect(output).toContain("kind: blocked");
    expect(output).toContain("blockers: SIM-100, SIM-101");

    consoleComponent.handleInput("\u001b[B");
    output = consoleComponent.render(180).join("\n");
    expect(output).toContain("> SIM-400");
    expect(output).toContain("issue: SIM-400 Done work");
    expect(output).toContain("kind: completed");
    expect(output).toContain("completed at: 2026-05-14T13:00:00Z");
  });

  it("renders pending escalations and selected escalation details", () => {
    const state = createDefaultState();
    state.console.showDetails = true;
    const consoleComponent = new SymphonyConsoleComponent({
      state,
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    consoleComponent.handleInput("\u001b[B");
    consoleComponent.handleInput("\u001b[B");
    consoleComponent.handleInput("\u001b[B");
    consoleComponent.handleInput("\u001b[B");
    consoleComponent.handleInput("\u001b[B");

    const output = consoleComponent.render(180).join("\n");
    expect(output).toContain("Pending Escalations");
    expect(output).toContain("> esc-1");
    expect(output).toContain("SIM-123");
    expect(output).toContain("approval");
    expect(output).toContain("Approve cargo test?");
    expect(output).toContain("Selected Escalation");
    expect(output).toContain("request: esc-1");
    expect(output).toContain("timeout: 10m 0s");
  });

  it("expands keyboard shortcuts onto one row when the terminal is wide", () => {
    const state = createDefaultState();
    state.attachedBaseUrl = "http://127.0.0.1:8080";
    const consoleComponent = new SymphonyConsoleComponent({
      state,
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    const output = consoleComponent.render(220).join("\n");

    expect(output).toContain("Keyboard: ctrl+shift+↑/↓ select  •  ctrl+shift+r refresh  •  ctrl+shift+s steer  •  ctrl+shift+e escalation  •  ctrl+shift+i details  •  ctrl+shift+q close");
  });

  it("renders boxed colored sections and command actions for console readability", () => {
    const state = createDefaultState();
    state.attachedBaseUrl = "http://127.0.0.1:8080";
    state.lastKnownState = {
      baseUrl: state.attachedBaseUrl,
      trackerProjectUrl: "https://github.com/gannonh/kata/projects/1",
      runningCount: 2,
      retryCount: 1,
      blockedCount: 1,
      completedCount: 4,
      pollingChecking: false,
      nextPollInMs: 5000,
      updatedAt: "2026-05-14T00:00:01Z",
    };
    const consoleComponent = new SymphonyConsoleComponent({
      state,
      getState: () => workerStateFixture(),
      getEvents: () => runtimeEventsFixture(),
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
      theme: fakeTheme(),
    });

    const output = consoleComponent.render(220).join("\n");

    expect(output).toContain("┌");
    expect(output).toContain("└");
    expect(output).toContain("Status");
    expect(output).toContain("Worker Summary");
    expect(output).toContain("Running Workers");
    expect(output).toContain("Selected Issue");
    expect(output).toContain("Events");
    expect(output).toContain("Keyboard");
    expect(output).toContain("ctrl+shift+↑/↓ select");
    expect(output).toContain("ctrl+shift+r refresh");
    expect(output).toContain("ctrl+shift+s steer");
    expect(output).toContain("ctrl+shift+e escalation");
    expect(output).toContain("ctrl+shift+i details");
    expect(output).toContain("ctrl+shift+q close");
    expect(output).toContain("Keyboard: ctrl+shift+↑/↓ select  •  ctrl+shift+r refresh  •  ctrl+shift+s steer  •  ctrl+shift+e escalation  •  ctrl+shift+i details  •  ctrl+shift+q close");
    expect(output).toContain("<borderAccent>┌</borderAccent>");
    expect(output).toContain("<success>running: 2</success>");
    expect(output).toContain("<warning>retry: 1</warning>");
    expect(output).toContain("<error>blocked: 1</error>");
    expect(output).toContain("<bg:selectedBg><accent><bold>> SIM-123");
    expect(output).not.toContain("Running workers");
    expect(output).not.toContain("Selected worker");
    expect(output).not.toContain("Recent worker/runtime events");
  });

  it("moves selection with arrow keys", () => {
    const state = createDefaultState();
    const consoleComponent = new SymphonyConsoleComponent({
      state,
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    consoleComponent.handleInput("\u001b[B");

    const output = consoleComponent.render(160).join("\n");
    expect(output).toContain("> SIM-777");
    expect(output).toContain("issue: SIM-777 Worker two");
  });

  it("toggles selected issue details", () => {
    const state = createDefaultState();
    state.console.showDetails = true;
    const consoleComponent = new SymphonyConsoleComponent({
      state,
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    consoleComponent.handleInput("d");

    expect(consoleComponent.render(160).join("\n")).not.toContain("issue: SIM-123 Worker one");
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
    const consoleComponent = new SymphonyConsoleComponent({
      state: createDefaultState(),
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer,
      respondToEscalation: async () => undefined,
      prompt: async () => "Use the existing auth module",
      close: () => undefined,
      requestRender: () => undefined,
      notify,
    });

    consoleComponent.handleInput("s");
    await steered;
    await notified;

    expect(steer).toHaveBeenCalledWith("SIM-123", "Use the existing auth module");
    expect(notify).toHaveBeenCalledWith("Steer delivered to SIM-123", "info");
  });

  it("responds to the selected escalation with parsed JSON input", async () => {
    let resolveResponded: (() => void) | undefined;
    const responded = new Promise<void>((resolve) => {
      resolveResponded = resolve;
    });
    const respondToEscalation = vi.fn(async () => {
      resolveResponded?.();
    });
    let resolveNotified: (() => void) | undefined;
    const notified = new Promise<void>((resolve) => {
      resolveNotified = resolve;
    });
    const notify = vi.fn(() => {
      resolveNotified?.();
    });
    const consoleComponent = new SymphonyConsoleComponent({
      state: createDefaultState(),
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation,
      prompt: async () => '{"approved":true}',
      close: () => undefined,
      requestRender: () => undefined,
      notify,
    });

    for (let index = 0; index < 5; index += 1) consoleComponent.handleInput("\u001b[B");
    consoleComponent.handleInput("e");
    await responded;
    await notified;

    expect(respondToEscalation).toHaveBeenCalledWith("esc-1", { approved: true });
    expect(notify).toHaveBeenCalledWith("Escalation response sent for esc-1", "info");
  });

  it("responds to the selected escalation with plain text when input is not JSON", async () => {
    let resolveResponded: (() => void) | undefined;
    const responded = new Promise<void>((resolve) => {
      resolveResponded = resolve;
    });
    const respondToEscalation = vi.fn(async () => {
      resolveResponded?.();
    });
    const consoleComponent = new SymphonyConsoleComponent({
      state: createDefaultState(),
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation,
      prompt: async () => "approved",
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    for (let index = 0; index < 5; index += 1) consoleComponent.handleInput("\u001b[B");
    consoleComponent.handleInput("e");
    await responded;

    expect(respondToEscalation).toHaveBeenCalledWith("esc-1", "approved");
  });

  it("notifies when escalation response is requested without a selected escalation", () => {
    const notify = vi.fn();
    const consoleComponent = new SymphonyConsoleComponent({
      state: createDefaultState(),
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify,
    });

    consoleComponent.handleInput("e");

    expect(notify).toHaveBeenCalledWith("Select an escalation before responding", "warning");
  });

  it("notifies and requests render when steering prompt fails", async () => {
    const notify = vi.fn();
    const requestRender = vi.fn();
    const consoleComponent = new SymphonyConsoleComponent({
      state: createDefaultState(),
      getState: () => workerStateFixture(),
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => {
        throw new Error("prompt failed");
      },
      close: () => undefined,
      requestRender,
      notify,
    });

    consoleComponent.handleInput("s");
    await expect.poll(() => notify.mock.calls.length, { interval: 10, timeout: 1000 }).toBe(1);

    expect(notify).toHaveBeenCalledWith("prompt failed", "error");
    expect(requestRender).toHaveBeenCalledOnce();
  });

  it("closes on q", () => {
    const close = vi.fn();
    const consoleComponent = new SymphonyConsoleComponent({
      state: createDefaultState(),
      getState: () => undefined,
      getEvents: () => [],
      refresh: async () => undefined,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    consoleComponent.handleInput("q");
    expect(close).toHaveBeenCalledOnce();
  });

  it("ignores refresh input while a refresh is already running", async () => {
    let resolveRefresh: (() => void) | undefined;
    const refreshDone = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const refresh = vi.fn(() => refreshDone);
    const consoleComponent = new SymphonyConsoleComponent({
      state: createDefaultState(),
      getState: () => undefined,
      getEvents: () => [],
      refresh,
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    consoleComponent.handleInput("r");
    consoleComponent.handleInput("r");

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
    const consoleComponent = new SymphonyConsoleComponent({
      state: createDefaultState(),
      getState: () => undefined,
      getEvents: () => [],
      refresh: async () => {
        throw new Error("refresh failed");
      },
      steer: async () => undefined,
      respondToEscalation: async () => undefined,
      prompt: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify,
    });

    consoleComponent.handleInput("r");
    await notified;

    expect(notify).toHaveBeenCalledWith("refresh failed", "error");
  });
});

describe("openConsole", () => {
  it("renders as an above-editor widget and refreshes stale state from events", async () => {
    const state = createDefaultState();
    state.attachedBaseUrl = "http://127.0.0.1:8080";
    state.lastKnownState = {
      baseUrl: state.attachedBaseUrl,
      runningCount: 0,
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

    const requestRender = vi.fn();
    const custom = vi.fn();
    const setWidget = vi.fn((_key: string, factory: unknown) => {
      const component = (factory as (tui: { requestRender: () => void }, theme: ReturnType<typeof fakeTheme>) => SymphonyConsoleComponent)({ requestRender }, fakeTheme());
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
      return component;
    });
    const ctx = { ui: { notify: vi.fn(), custom, input: vi.fn(), setWidget } } as unknown as ExtensionContext;
    const refreshState = vi.fn(async function (this: { lastState?: SymphonyStateResponse }) {
      this.lastState = workerStateFixture();
      return this.lastState;
    });
    const runtime = {
      client: {},
      state,
      lastState: undefined,
      recentEvents: [],
      recordEvent: vi.fn(function (this: { recentEvents: SymphonyEventEnvelope[] }, event: SymphonyEventEnvelope) {
        this.recentEvents.push(event);
      }),
      requestRefresh: vi.fn(async () => undefined),
      refreshState,
      steerWorker: vi.fn(async () => undefined),
      errorText: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    } as unknown as SymphonyRuntime;

    await openConsole(ctx, runtime);

    expect(custom).not.toHaveBeenCalled();
    expect(setWidget).toHaveBeenCalledWith("symphony-console", expect.any(Function));
    expect(startSymphonyEventStream).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "http://127.0.0.1:8080" }));
    await expect.poll(() => refreshState.mock.calls.length, { interval: 10, timeout: 1000 }).toBe(2);
    expect(requestRender).toHaveBeenCalled();
  });

  it("reports stream close errors after malformed stream messages", async () => {
    const state = createDefaultState();
    state.attachedBaseUrl = "http://127.0.0.1:8080";

    let capturedOnError: ((error: Error) => void) | undefined;
    vi.mocked(startSymphonyEventStream).mockImplementation((options) => {
      capturedOnError = options.onError;
      return { close: vi.fn() };
    });

    const notify = vi.fn();
    const setWidget = vi.fn((_key: string, factory: unknown) => {
      (factory as (tui: { requestRender: () => void }, theme: ReturnType<typeof fakeTheme>) => SymphonyConsoleComponent)({ requestRender: vi.fn() }, fakeTheme());
    });
    const ctx = { ui: { notify, custom: vi.fn(), input: vi.fn(), setWidget } } as unknown as ExtensionContext;
    const runtime = {
      client: {},
      state,
      lastState: workerStateFixture(),
      recentEvents: [],
      refreshState: vi.fn(async () => workerStateFixture()),
      requestRefresh: vi.fn(async () => workerStateFixture()),
      steerWorker: vi.fn(async () => undefined),
      errorText: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    } as unknown as SymphonyRuntime;

    await openConsole(ctx, runtime);
    capturedOnError?.(new Error("invalid Symphony event JSON"));
    capturedOnError?.(new Error("Symphony event stream closed with code 1006"));

    expect(notify).toHaveBeenCalledWith("Symphony event stream unavailable: invalid Symphony event JSON", "warning");
    expect(notify).toHaveBeenCalledWith("Symphony event stream unavailable: Symphony event stream closed with code 1006", "warning");
  });

  it("lets global shortcuts control the active above-editor console", async () => {
    const state = createDefaultState();
    state.attachedBaseUrl = "http://127.0.0.1:8080";
    state.console.showDetails = true;

    vi.mocked(startSymphonyEventStream).mockImplementation(() => ({ close: vi.fn() }));

    let component: SymphonyConsoleComponent | undefined;
    const requestRender = vi.fn();
    const setWidget = vi.fn((_key: string, factory: unknown) => {
      component = (factory as (tui: { requestRender: () => void }, theme: ReturnType<typeof fakeTheme>) => SymphonyConsoleComponent)({ requestRender }, fakeTheme());
    });
    const ctx = { ui: { notify: vi.fn(), custom: vi.fn(), input: vi.fn(), setWidget } } as unknown as ExtensionContext;
    const runtime = {
      client: {},
      state,
      lastState: workerStateFixture(),
      recentEvents: [],
      refreshState: vi.fn(async () => workerStateFixture()),
      requestRefresh: vi.fn(async () => workerStateFixture()),
      steerWorker: vi.fn(async () => undefined),
      errorText: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    } as unknown as SymphonyRuntime;

    await openConsole(ctx, runtime);
    await handleActiveConsoleShortcut("selectNext", ctx);
    await handleActiveConsoleShortcut("toggleDetails", ctx);

    const output = component?.render(160).join("\n") ?? "";
    expect(output).toContain("> SIM-777");
    expect(output).not.toContain("issue: <accent>SIM-777</accent> Worker two");
    expect(requestRender).toHaveBeenCalled();
  });

  it("notifies and still renders the widget when launch refresh fails", async () => {
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

    const notify = vi.fn();
    const setWidget = vi.fn((_key: string, factory: unknown) => {
      const component = (factory as (tui: { requestRender: () => void }, theme: ReturnType<typeof fakeTheme>) => SymphonyConsoleComponent)({ requestRender: vi.fn() }, fakeTheme());
      expect(component.render(120).join("\n")).toContain("running: 1");
    });
    const ctx = { ui: { notify, custom: vi.fn(), input: vi.fn(), setWidget } } as unknown as ExtensionContext;
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

    await openConsole(ctx, runtime);

    expect(notify).toHaveBeenCalledWith("formatted: launch refresh failed", "error");
    expect(setWidget).toHaveBeenCalledOnce();
  });
});
