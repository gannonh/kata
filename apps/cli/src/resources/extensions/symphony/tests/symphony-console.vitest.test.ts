import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import {
  buildConsolePanelStateFromSnapshot,
  createEmptyConsolePanelState,
  resolveConsolePosition,
} from "../console-state.js";
import {
  applyConsoleEventTransition,
  createConsoleManager,
} from "../console.js";
import { EscalationResponseRouter } from "../console-escalation.js";
import {
  parseSymphonyCommand,
  registerSymphonyCommand,
} from "../command.js";
import type { SymphonyClient } from "../client.js";
import {
  SymphonyError,
  type SymphonyEventEnvelope,
  type SymphonyOrchestratorState,
} from "../types.js";


describe("console-state", () => {
  it("maps orchestrator snapshots into console panel state", () => {
    const snapshot: SymphonyOrchestratorState = {
      poll_interval_ms: 30_000,
      max_concurrent_agents: 4,
      running: {
        "issue-1": {
          issue_id: "issue-1",
          issue_identifier: "KAT-1304",
          issue_title: "Operator Console",
          status: "running",
          linear_state: "In Progress",
          started_at: new Date(0).toISOString(),
          model: "claude-sonnet-4-6",
        },
      },
      retry_queue: [
        {
          issue_id: "issue-2",
          identifier: "KAT-1305",
          attempt: 2,
          due_in_ms: 5_000,
        },
      ],
      completed: [
        {
          issue_id: "issue-0",
          identifier: "KAT-1299",
          title: "Done issue",
          completed_at: new Date(10_000).toISOString(),
        },
      ],
      codex_totals: {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      },
      polling: {
        checking: false,
        next_poll_in_ms: 10_000,
        poll_interval_ms: 30_000,
      },
      running_session_info: {
        "issue-1": {
          last_activity_ms: 18_000,
          current_tool_name: "bash",
        },
      },
      pending_escalations: [
        {
          request_id: "req-1",
          issue_id: "issue-1",
          issue_identifier: "KAT-1304",
          method: "ask_user_questions",
          preview: "Need operator input for rollout timing",
          created_at: new Date(12_000).toISOString(),
          timeout_ms: 300_000,
        },
      ],
    };

    const mapped = buildConsolePanelStateFromSnapshot(snapshot, {
      now: () => 20_000,
      connectionStatus: "connected",
      connectionUrl: "http://127.0.0.1:8080",
    });

    expect(mapped.connectionStatus).toBe("connected");
    expect(mapped.connectionUrl).toBe("http://127.0.0.1:8080");
    expect(mapped.queueCount).toBe(1);
    expect(mapped.completedCount).toBe(1);
    expect(mapped.workers).toHaveLength(1);
    expect(mapped.workers[0]).toMatchObject({
      issueId: "issue-1",
      identifier: "KAT-1304",
      issueTitle: "Operator Console",
      linearState: "In Progress",
      currentTool: "bash",
      model: "claude-sonnet-4-6",
    });
    expect(mapped.workers[0].lastActivityAge).toBe("2s");

    expect(mapped.escalations).toHaveLength(1);
    expect(mapped.escalations[0]).toMatchObject({
      requestId: "req-1",
      issueIdentifier: "KAT-1304",
      issueTitle: "Operator Console",
      questionPreview: "Need operator input for rollout timing",
      timeoutMs: 300_000,
    });
  });

  it("defaults console position when preference is unset or invalid", () => {
    expect(resolveConsolePosition(undefined)).toBe("below-output");
    expect(resolveConsolePosition("invalid")).toBe("below-output");
    expect(resolveConsolePosition("above-status")).toBe("above-status");
  });

  it("creates an empty disconnected panel state", () => {
    expect(createEmptyConsolePanelState("http://127.0.0.1:8080")).toEqual({
      workers: [],
      escalations: [],
      connectionStatus: "disconnected",
      connectionUrl: "http://127.0.0.1:8080",
      lastUpdateAt: null,
      queueCount: 0,
      completedCount: 0,
    });
  });
});

describe("symphony console preference parsing", () => {
  it("parses symphony.console_position from global and project preferences", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "kata-symphony-console-pref-"));
    const originalHome = process.env.HOME;

    try {
      const homeDir = join(tempDir, "home");
      const projectDir = join(tempDir, "project");
      mkdirSync(join(homeDir, ".kata-cli"), { recursive: true });
      mkdirSync(join(projectDir, ".kata"), { recursive: true });

      writeFileSync(
        join(homeDir, ".kata-cli", "preferences.md"),
        [
          "---",
          "version: 1",
          "symphony:",
          "  url: http://127.0.0.1:8080",
          "  console_position: above-status",
          "---",
          "",
        ].join("\n"),
        { encoding: "utf-8" },
      );

      writeFileSync(
        join(projectDir, ".kata", "preferences.md"),
        [
          "---",
          "version: 1",
          "symphony:",
          "  console_position: below-output",
          "---",
          "",
        ].join("\n"),
        { encoding: "utf-8" },
      );

      process.env.HOME = homeDir;

      vi.resetModules();
      vi.doMock("@mariozechner/pi-coding-agent", () => ({
        getAgentDir: () => join(homeDir, ".kata-cli", "agent"),
      }));

      const { loadEffectiveKataPreferences } = await import(
        "../../kata/preferences.js"
      );

      const loaded = loadEffectiveKataPreferences(projectDir);
      expect(loaded?.preferences.symphony).toEqual({
        url: "http://127.0.0.1:8080",
        console_position: "below-output",
      });
    } finally {
      vi.doUnmock("@mariozechner/pi-coding-agent");
      vi.resetModules();

      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }

      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("console event transitions", () => {
  it("tracks escalation lifecycle and refresh signals", () => {
    const base = createEmptyConsolePanelState("http://127.0.0.1:8080");

    const escalationCreated: SymphonyEventEnvelope = {
      version: "v1",
      sequence: 10,
      timestamp: new Date(10_000).toISOString(),
      kind: "escalation_created",
      severity: "warn",
      issue: "KAT-1304",
      event: "escalation_created",
      payload: {
        request_id: "req-10",
        issue_id: "issue-10",
        issue_identifier: "KAT-1304",
        method: "ask_user_questions",
        payload: { question: "Can this ship now?" },
        created_at: new Date(8_000).toISOString(),
        timeout_ms: 120_000,
      },
    };

    const created = applyConsoleEventTransition(base, escalationCreated, () => 12_000);
    expect(created.signal).toBe("console_escalation_displayed");
    expect(created.refreshFromServer).toBe(true);
    expect(created.nextState.escalations).toHaveLength(1);

    const timedOut: SymphonyEventEnvelope = {
      version: "v1",
      sequence: 11,
      timestamp: new Date(13_000).toISOString(),
      kind: "escalation_timed_out",
      severity: "warn",
      issue: "KAT-1304",
      event: "escalation_timed_out",
      payload: {
        request_id: "req-10",
      },
    };

    const cleared = applyConsoleEventTransition(created.nextState, timedOut, () => 13_000);
    expect(cleared.signal).toBe("console_escalation_cleared");
    expect(cleared.nextState.escalations).toHaveLength(0);
  });

  it("marks worker/runtime events for server refresh", () => {
    const base = createEmptyConsolePanelState("http://127.0.0.1:8080");

    const workerEvent: SymphonyEventEnvelope = {
      version: "v1",
      sequence: 2,
      timestamp: new Date(1_000).toISOString(),
      kind: "worker",
      severity: "info",
      issue: "KAT-1304",
      event: "worker_progress",
      payload: { summary: "step complete" },
    };

    const transition = applyConsoleEventTransition(base, workerEvent, () => 2_000);
    expect(transition.refreshFromServer).toBe(true);
    expect(transition.nextState.lastUpdateAt).toBe(2_000);
  });

  it("clears stale errors when applying snapshot events", () => {
    const base = {
      ...createEmptyConsolePanelState("http://127.0.0.1:8080"),
      connectionStatus: "reconnecting" as const,
      error: "Console stream disconnected: timeout",
    };

    const snapshotEvent: SymphonyEventEnvelope = {
      version: "v1",
      sequence: 3,
      timestamp: new Date(2_000).toISOString(),
      kind: "snapshot",
      severity: "info",
      issue: null,
      event: "snapshot",
      payload: {
        poll_interval_ms: 30_000,
        max_concurrent_agents: 4,
        running: {},
        retry_queue: [],
        completed: [],
        codex_totals: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        },
        polling: {
          checking: false,
          next_poll_in_ms: 10_000,
          poll_interval_ms: 30_000,
        },
      },
    };

    const transition = applyConsoleEventTransition(base, snapshotEvent, () => 2_500);
    expect(transition.signal).toBe("console_snapshot_applied");
    expect(transition.nextState.connectionStatus).toBe("reconnecting");
    expect(transition.nextState.error).toBeUndefined();
  });
});

describe("symphony console command routing", () => {
  it("parses console command variants", () => {
    expect(parseSymphonyCommand("console")).toEqual({
      type: "console",
      mode: "toggle",
    });

    expect(parseSymphonyCommand("console off")).toEqual({
      type: "console",
      mode: "off",
    });

    expect(parseSymphonyCommand("console refresh")).toEqual({
      type: "console",
      mode: "refresh",
    });
  });

  it("shows console subcommand completions after trailing space", () => {
    const registerCommand = vi.fn();
    const pi = {
      registerCommand,
    } as any;

    const client: SymphonyClient = {
      getConnectionConfig: () => ({
        url: "http://127.0.0.1:8080",
        origin: "preferences",
      }),
      getState: async () => {
        throw new Error("unused");
      },
      getPendingEscalations: async () => [],
      respondToEscalation: async () => ({ ok: true, status: 200 }),
      watchEvents: async function* () {
        return;
      },
    };

    registerSymphonyCommand(pi, client);

    const commandConfig = registerCommand.mock.calls[0][1];
    const completions = commandConfig.getArgumentCompletions("console ");

    expect(completions.map((entry: { value: string }) => entry.value)).toEqual(
      expect.arrayContaining(["console off", "console refresh"]),
    );
  });

  it("routes console commands through the console manager", async () => {
    const registerCommand = vi.fn();
    const pi = {
      registerCommand,
    } as any;

    const client: SymphonyClient = {
      getConnectionConfig: () => ({
        url: "http://127.0.0.1:8080",
        origin: "preferences",
      }),
      getState: async () => {
        throw new Error("unused");
      },
      getPendingEscalations: async () => [],
      respondToEscalation: async () => ({ ok: true, status: 200 }),
      watchEvents: async function* () {
        return;
      },
    };

    const manager = {
      isActive: vi.fn(() => false),
      getState: vi.fn(() => createEmptyConsolePanelState("http://127.0.0.1:8080")),
      setContext: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(async () => "opened" as const),
      refresh: vi.fn(),
      dispose: vi.fn(),
    };

    registerSymphonyCommand(pi, client, manager as any);

    const commandConfig = registerCommand.mock.calls[0][1];
    const notify = vi.fn();
    const ctx = {
      ui: {
        notify,
      },
    } as any;

    await commandConfig.handler("console", ctx);
    expect(manager.toggle).toHaveBeenCalledTimes(1);

    await commandConfig.handler("console off", ctx);
    expect(manager.close).toHaveBeenCalledTimes(1);

    manager.isActive.mockReturnValue(true);
    await commandConfig.handler("console refresh", ctx);
    expect(manager.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("EscalationResponseRouter", () => {
  it("routes single escalation responses without explicit selector", async () => {
    const respondToEscalation = vi.fn(async () => ({ ok: true, status: 200 }));

    const router = new EscalationResponseRouter(
      {
        getConnectionConfig: () => ({
          url: "http://127.0.0.1:8080",
          origin: "preferences",
        }),
        getState: async () => {
          throw new Error("unused");
        },
        getPendingEscalations: async () => [],
        respondToEscalation,
        watchEvents: async function* () {
          return;
        },
      },
      { now: () => 10_000 },
    );

    const result = await router.routeInput(
      "!respond Ship this now",
      [
        {
          requestId: "req-1",
          issueId: "issue-1",
          issueIdentifier: "KAT-1304",
          issueTitle: "Operator Console",
          questionPreview: "Ship now?",
          waitingSince: 5_000,
          timeoutMs: 300_000,
        },
      ],
      true,
    );

    expect(result.status).toBe("sent");
    expect(respondToEscalation).toHaveBeenCalledWith(
      "req-1",
      {
        source: "symphony-console",
        response: "Ship this now",
      },
      undefined,
    );
  });

  it("requires selector when multiple escalations are pending", async () => {
    const router = new EscalationResponseRouter({
      getConnectionConfig: () => ({
        url: "http://127.0.0.1:8080",
        origin: "preferences",
      }),
      getState: async () => {
        throw new Error("unused");
      },
      getPendingEscalations: async () => [],
      respondToEscalation: async () => ({ ok: true, status: 200 }),
      watchEvents: async function* () {
        return;
      },
    });

    const result = await router.routeInput(
      "!respond approve",
      [
        {
          requestId: "req-a",
          issueId: "issue-a",
          issueIdentifier: "KAT-1304",
          issueTitle: "A",
          questionPreview: "A",
          waitingSince: 0,
          timeoutMs: 10_000,
        },
        {
          requestId: "req-b",
          issueId: "issue-b",
          issueIdentifier: "KAT-1305",
          issueTitle: "B",
          questionPreview: "B",
          waitingSince: 0,
          timeoutMs: 10_000,
        },
      ],
      true,
    );

    expect(result.status).toBe("rejected");
    expect(result.message).toContain("Multiple escalations pending");
  });

  it("does not strip first-word prefixes for single-escalation replies", async () => {
    const respondToEscalation = vi.fn(async () => ({ ok: true, status: 200 }));

    const router = new EscalationResponseRouter({
      getConnectionConfig: () => ({
        url: "http://127.0.0.1:8080",
        origin: "preferences",
      }),
      getState: async () => {
        throw new Error("unused");
      },
      getPendingEscalations: async () => [],
      respondToEscalation,
      watchEvents: async function* () {
        return;
      },
    });

    const result = await router.routeInput(
      "!respond req please retry",
      [
        {
          requestId: "req-1",
          issueId: "issue-1",
          issueIdentifier: "KAT-1304",
          issueTitle: "Operator Console",
          questionPreview: "Ship now?",
          waitingSince: 5_000,
          timeoutMs: 300_000,
        },
      ],
      true,
    );

    expect(result.status).toBe("sent");
    expect(respondToEscalation).toHaveBeenCalledWith(
      "req-1",
      {
        source: "symphony-console",
        response: "req please retry",
      },
      undefined,
    );
  });

  it("queues retryable submission failures for reconnect", async () => {
    const router = new EscalationResponseRouter({
      getConnectionConfig: () => ({
        url: "http://127.0.0.1:8080",
        origin: "preferences",
      }),
      getState: async () => {
        throw new Error("unused");
      },
      getPendingEscalations: async () => [],
      respondToEscalation: async () => {
        throw new SymphonyError("network down", {
          code: "connection_failed",
          retryable: true,
        });
      },
      watchEvents: async function* () {
        return;
      },
    });

    const result = await router.routeInput(
      "!respond ship this",
      [
        {
          requestId: "req-1",
          issueId: "issue-1",
          issueIdentifier: "KAT-1304",
          issueTitle: "Operator Console",
          questionPreview: "Ship now?",
          waitingSince: 5_000,
          timeoutMs: 300_000,
        },
      ],
      true,
    );

    expect(result.status).toBe("queued");
    expect(result.message).toContain("queued response");
    expect(router.pendingQueueSize()).toBe(1);
  });

  it("queues disconnected responses and flushes on reconnect", async () => {
    const respondToEscalation = vi.fn(async () => ({ ok: true, status: 200 }));

    const router = new EscalationResponseRouter(
      {
        getConnectionConfig: () => ({
          url: "http://127.0.0.1:8080",
          origin: "preferences",
        }),
        getState: async () => {
          throw new Error("unused");
        },
        getPendingEscalations: async () => [],
        respondToEscalation,
        watchEvents: async function* () {
          return;
        },
      },
      { now: () => 20_000 },
    );

    const queued = await router.routeInput(
      "!respond req-1 retry after reconnect",
      [
        {
          requestId: "req-1",
          issueId: "issue-1",
          issueIdentifier: "KAT-1304",
          issueTitle: "Operator Console",
          questionPreview: "Ship now?",
          waitingSince: 5_000,
          timeoutMs: 300_000,
        },
      ],
      false,
    );

    expect(queued.status).toBe("queued");
    expect(router.pendingQueueSize()).toBe(1);

    const flushed = await router.flushQueue(
      [
        {
          requestId: "req-1",
          issueId: "issue-1",
          issueIdentifier: "KAT-1304",
          issueTitle: "Operator Console",
          questionPreview: "Ship now?",
          waitingSince: 5_000,
          timeoutMs: 300_000,
        },
      ],
      true,
    );

    expect(flushed).toHaveLength(1);
    expect(flushed[0].status).toBe("sent");
    expect(respondToEscalation).toHaveBeenCalledTimes(1);
  });

  it("surfaces timeout responses clearly", async () => {
    const router = new EscalationResponseRouter({
      getConnectionConfig: () => ({
        url: "http://127.0.0.1:8080",
        origin: "preferences",
      }),
      getState: async () => {
        throw new Error("unused");
      },
      getPendingEscalations: async () => [],
      respondToEscalation: async () => ({ ok: false, status: 404 }),
      watchEvents: async function* () {
        return;
      },
    });

    const result = await router.routeInput(
      "!respond req-1 ship",
      [
        {
          requestId: "req-1",
          issueId: "issue-1",
          issueIdentifier: "KAT-1304",
          issueTitle: "Operator Console",
          questionPreview: "Ship now?",
          waitingSince: 5_000,
          timeoutMs: 300_000,
        },
      ],
      true,
    );

    expect(result.status).toBe("rejected");
    expect(result.message).toContain("timed out");
  });
});

describe("ConsoleManager", () => {
  it("handles reconnect lifecycle and refreshes state from server", async () => {
    const notifications: string[] = [];

    const stateSnapshot: SymphonyOrchestratorState = {
      poll_interval_ms: 30_000,
      max_concurrent_agents: 4,
      running: {},
      retry_queue: [],
      completed: [],
      codex_totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
      polling: {
        checking: false,
        next_poll_in_ms: 10_000,
        poll_interval_ms: 30_000,
      },
      pending_escalations: [],
    };

    const client: SymphonyClient = {
      getConnectionConfig: () => ({
        url: "http://127.0.0.1:8080",
        origin: "preferences",
      }),
      getState: async () => stateSnapshot,
      getPendingEscalations: async () => [],
      respondToEscalation: async () => ({ ok: true, status: 200 }),
      watchEvents: async function* (_filter, options) {
        options?.onLifecycle?.({
          type: "symphony_client_connected",
          details: {
            url: "http://127.0.0.1:8080",
            origin: "preferences",
            connected: true,
          },
        });

        yield {
          version: "v1",
          sequence: 1,
          timestamp: new Date(10_000).toISOString(),
          kind: "heartbeat",
          severity: "info",
          issue: null,
          event: "heartbeat",
          payload: {
            connected_clients: 1,
          },
        };

        options?.onLifecycle?.({
          type: "symphony_client_reconnecting",
          details: {
            url: "http://127.0.0.1:8080",
            origin: "preferences",
            connected: false,
            reconnecting: true,
            attempt: 1,
          },
        });

        options?.onLifecycle?.({
          type: "symphony_client_connected",
          details: {
            url: "http://127.0.0.1:8080",
            origin: "preferences",
            connected: true,
            attempt: 1,
          },
        });
      },
    };

    const manager = createConsoleManager(client, {
      panelFactory: () => ({
        update: () => undefined,
        setPosition: () => undefined,
        close: () => undefined,
        isOpen: () => true,
      }),
    });

    const ctx = {
      ui: {
        notify: (message: string) => notifications.push(message),
      },
    } as any;

    await manager.open(ctx);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(manager.getState().connectionStatus).toBe("connected");
    expect(notifications).toContain("console_panel_opened");
    expect(notifications).toContain("console_stream_reconnected");

    manager.dispose(ctx);
  });

  it("preserves reconnecting status when refresh succeeds before stream connects", async () => {
    const stateSnapshot: SymphonyOrchestratorState = {
      poll_interval_ms: 30_000,
      max_concurrent_agents: 4,
      running: {},
      retry_queue: [],
      completed: [],
      codex_totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
      polling: {
        checking: false,
        next_poll_in_ms: 10_000,
        poll_interval_ms: 30_000,
      },
      pending_escalations: [],
    };

    const client: SymphonyClient = {
      getConnectionConfig: () => ({
        url: "http://127.0.0.1:8080",
        origin: "preferences",
      }),
      getState: async () => stateSnapshot,
      getPendingEscalations: async () => [],
      respondToEscalation: async () => ({ ok: true, status: 200 }),
      watchEvents: async function* () {
        return;
      },
    };

    const manager = createConsoleManager(client, {
      panelFactory: () => ({
        update: () => undefined,
        setPosition: () => undefined,
        close: () => undefined,
        isOpen: () => true,
      }),
    });

    const ctx = {
      ui: {
        notify: () => undefined,
      },
    } as any;

    await manager.open(ctx);
    expect(manager.getState().connectionStatus).toBe("reconnecting");

    manager.dispose(ctx);
  });

  it("does not start stream when closed during initial refresh", async () => {
    const stateSnapshot: SymphonyOrchestratorState = {
      poll_interval_ms: 30_000,
      max_concurrent_agents: 4,
      running: {},
      retry_queue: [],
      completed: [],
      codex_totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
      polling: {
        checking: false,
        next_poll_in_ms: 10_000,
        poll_interval_ms: 30_000,
      },
      pending_escalations: [],
    };

    let resolveState: ((value: SymphonyOrchestratorState) => void) | null = null;
    const pendingState = new Promise<SymphonyOrchestratorState>((resolve) => {
      resolveState = resolve;
    });

    let watchEventsCalls = 0;

    const client: SymphonyClient = {
      getConnectionConfig: () => ({
        url: "http://127.0.0.1:8080",
        origin: "preferences",
      }),
      getState: async () => pendingState,
      getPendingEscalations: async () => [],
      respondToEscalation: async () => ({ ok: true, status: 200 }),
      watchEvents: async function* () {
        watchEventsCalls += 1;
        return;
      },
    };

    const manager = createConsoleManager(client, {
      panelFactory: () => ({
        update: () => undefined,
        setPosition: () => undefined,
        close: () => undefined,
        isOpen: () => true,
      }),
    });

    const ctx = {
      ui: {
        notify: () => undefined,
      },
    } as any;

    const opening = manager.open(ctx);
    manager.close(ctx);

    resolveState?.(stateSnapshot);
    await opening;

    expect(watchEventsCalls).toBe(0);
    expect(manager.isActive()).toBe(false);
  });

  it("routes !respond input to pending escalation", async () => {
    const notifications: string[] = [];
    const respondToEscalation = vi.fn(async () => ({ ok: true, status: 200 }));

    const stateSnapshot: SymphonyOrchestratorState = {
      poll_interval_ms: 30_000,
      max_concurrent_agents: 4,
      running: {
        "issue-1": {
          issue_id: "issue-1",
          issue_identifier: "KAT-1304",
          issue_title: "Operator Console",
          status: "running",
          started_at: new Date(0).toISOString(),
        },
      },
      retry_queue: [],
      completed: [],
      codex_totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
      polling: {
        checking: false,
        next_poll_in_ms: 10_000,
        poll_interval_ms: 30_000,
      },
      pending_escalations: [
        {
          request_id: "req-1",
          issue_id: "issue-1",
          issue_identifier: "KAT-1304",
          method: "ask_user_questions",
          preview: "Ship now?",
          created_at: new Date(8_000).toISOString(),
          timeout_ms: 120_000,
        },
      ],
      running_session_info: {
        "issue-1": {
          last_activity_ms: 9_000,
        },
      },
    };

    const client: SymphonyClient = {
      getConnectionConfig: () => ({
        url: "http://127.0.0.1:8080",
        origin: "preferences",
      }),
      getState: async () => stateSnapshot,
      getPendingEscalations: async () => stateSnapshot.pending_escalations ?? [],
      respondToEscalation,
      watchEvents: async function* (_filter, options) {
        options?.onLifecycle?.({
          type: "symphony_client_connected",
          details: {
            url: "http://127.0.0.1:8080",
            origin: "preferences",
            connected: true,
          },
        });
      },
    };

    const manager = createConsoleManager(client, {
      panelFactory: () => ({
        update: () => undefined,
        setPosition: () => undefined,
        close: () => undefined,
        isOpen: () => true,
      }),
    });

    const ctx = {
      ui: {
        notify: (message: string) => notifications.push(message),
      },
    } as any;

    await manager.open(ctx);

    const handled = await manager.handleInput("!respond Proceed", ctx);
    expect(handled).toBe(true);
    expect(respondToEscalation).toHaveBeenCalledTimes(1);
    expect(notifications).toContain("console_escalation_responded");

    manager.dispose(ctx);
  });

  it("closes panel resources on dispose", async () => {
    const closePanel = vi.fn();

    const client: SymphonyClient = {
      getConnectionConfig: () => ({
        url: "http://127.0.0.1:8080",
        origin: "preferences",
      }),
      getState: async () => ({
        poll_interval_ms: 30_000,
        max_concurrent_agents: 4,
        running: {},
        retry_queue: [],
        completed: [],
        codex_totals: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        },
        polling: {
          checking: false,
          next_poll_in_ms: 10_000,
          poll_interval_ms: 30_000,
        },
      }),
      getPendingEscalations: async () => [],
      respondToEscalation: async () => ({ ok: true, status: 200 }),
      watchEvents: async function* (_filter, options) {
        while (!options?.signal?.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      },
    };

    const manager = createConsoleManager(client, {
      panelFactory: () => ({
        update: () => undefined,
        setPosition: () => undefined,
        close: closePanel,
        isOpen: () => true,
      }),
    });

    const ctx = {
      ui: {
        notify: () => undefined,
      },
    } as any;

    await manager.open(ctx);
    manager.dispose(ctx);

    expect(closePanel).toHaveBeenCalledTimes(1);
    expect(manager.isActive()).toBe(false);
  });
});
