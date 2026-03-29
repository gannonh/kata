import { describe, expect, it, vi } from "vitest";
import {
  executeSymphonyCommand,
  parseSymphonyCommand,
  type SymphonyCommandSink,
} from "../command.js";
import type { SymphonyClient } from "../client.js";
import { SymphonyError, type SymphonyEventEnvelope } from "../types.js";

function makeSink() {
  const info: string[] = [];
  const warning: string[] = [];
  const error: string[] = [];

  const sink: SymphonyCommandSink = {
    info: (message) => info.push(message),
    warning: (message) => warning.push(message),
    error: (message) => error.push(message),
  };

  return { sink, info, warning, error };
}

function createClient(overrides: Partial<SymphonyClient>): SymphonyClient {
  return {
    getConnectionConfig: () => ({
      url: "http://localhost:8080",
      origin: "preferences",
    }),
    getState: async () => ({
      poll_interval_ms: 30_000,
      max_concurrent_agents: 10,
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
    steer: async () => ({
      ok: true,
      status: 200,
      issue_id: "issue-920",
      issue_identifier: "KAT-920",
    }),
    watchEvents: async function* (_filter, _options) {
      return;
    },
    ...overrides,
  };
}

function makeEvent(sequence: number, event: string): SymphonyEventEnvelope {
  return {
    version: "v1",
    sequence,
    timestamp: new Date(1_000 * sequence).toISOString(),
    kind: "worker",
    severity: "info",
    issue: "KAT-920",
    event,
    payload: {},
  };
}

describe("parseSymphonyCommand", () => {
  it("parses status, watch, steer, and config commands", () => {
    expect(parseSymphonyCommand("status")).toEqual({ type: "status" });

    expect(
      parseSymphonyCommand("watch kat-920 --max-events 3 --timeout-ms 2000"),
    ).toEqual({
      type: "watch",
      issue: "KAT-920",
      maxEvents: 3,
      timeoutMs: 2000,
    });

    expect(
      parseSymphonyCommand(
        "steer kat-920 Use the existing auth module instead of creating a new one",
      ),
    ).toEqual({
      type: "steer",
      issue: "KAT-920",
      instruction: "Use the existing auth module instead of creating a new one",
    });

    expect(parseSymphonyCommand("config")).toEqual({ type: "config" });
    expect(parseSymphonyCommand("config ./WORKFLOW.md")).toEqual({
      type: "config",
      workflowPathArg: "./WORKFLOW.md",
    });
    expect(
      parseSymphonyCommand("config ~/Library/Mobile Documents/WORKFLOW.md"),
    ).toEqual({
      type: "config",
      workflowPathArg: "~/Library/Mobile Documents/WORKFLOW.md",
    });
  });

  it("falls back to usage on invalid watch syntax", () => {
    expect(parseSymphonyCommand("watch")).toEqual({ type: "usage" });
    expect(parseSymphonyCommand("watch KAT-1 --timeout-ms nope")).toEqual({
      type: "usage",
    });
    expect(parseSymphonyCommand("steer KAT-1")).toEqual({ type: "usage" });
    expect(parseSymphonyCommand("unknown")).toEqual({ type: "usage" });
  });
});

describe("executeSymphonyCommand", () => {
  it("shows info-level guidance when status is called without config", async () => {
    const { sink, info, error } = makeSink();
    const client = createClient({});

    await executeSymphonyCommand({ type: "status" }, client, sink, {
      checkConfigured: () => false,
    });

    expect(error).toHaveLength(0);
    expect(info).toHaveLength(1);
    expect(info[0]).toContain("Symphony is not configured");
    expect(info[0]).toContain("symphony.url");
    expect(info[0]).toContain("SYMPHONY_URL");
    expect(info[0]).toContain("KATA_SYMPHONY_URL");
  });

  it("shows info-level guidance when watch is called without config", async () => {
    const { sink, info, error } = makeSink();
    const client = createClient({});

    await executeSymphonyCommand(
      { type: "watch", issue: "KAT-920" },
      client,
      sink,
      { checkConfigured: () => false },
    );

    expect(error).toHaveLength(0);
    expect(info).toHaveLength(1);
    expect(info[0]).toContain("Symphony is not configured");
    expect(info[0]).toContain("symphony.url");
  });

  it("does not gate usage action on config", async () => {
    const { sink, info, error } = makeSink();
    const client = createClient({});

    await executeSymphonyCommand({ type: "usage" }, client, sink, {
      checkConfigured: () => false,
    });

    expect(error).toHaveLength(0);
    expect(info).toHaveLength(1);
    expect(info[0]).toContain("Symphony command usage");
  });

  it("renders status output", async () => {
    const { sink, info, error } = makeSink();
    const client = createClient({});

    await executeSymphonyCommand({ type: "status" }, client, sink, {
      checkConfigured: () => true,
    });

    expect(error).toHaveLength(0);
    expect(info[0]).toContain("Symphony Status");
    expect(info[0]).toContain("Running workers:");
  });

  it("executes steer and renders success confirmation", async () => {
    const { sink, info, error } = makeSink();
    const steer = vi
      .fn<SymphonyClient["steer"]>()
      .mockResolvedValue({
        ok: true,
        status: 200,
        issue_id: "issue-920",
        issue_identifier: "KAT-920",
      });

    const client = createClient({ steer });

    await executeSymphonyCommand(
      { type: "steer", issue: "KAT-920", instruction: "Use existing auth" },
      client,
      sink,
      { checkConfigured: () => true },
    );

    expect(error).toHaveLength(0);
    expect(steer).toHaveBeenCalledWith("KAT-920", "Use existing auth");
    expect(info[0]).toContain("✓ Steered KAT-920: Use existing auth");
  });

  it("executes steer and renders actionable failure", async () => {
    const { sink, error } = makeSink();
    const client = createClient({
      steer: async () => ({ ok: false, status: 409, error: "no_active_session" }),
    });

    await executeSymphonyCommand(
      { type: "steer", issue: "KAT-920", instruction: "Use existing auth" },
      client,
      sink,
      { checkConfigured: () => true },
    );

    expect(error).toEqual(["✗ Steer failed: no_active_session"]);
  });

  it("streams watch events and emits summary", async () => {
    const { sink, info, warning, error } = makeSink();
    const client = createClient({
      watchEvents: async function* () {
        yield makeEvent(1, "worker_started");
        yield makeEvent(2, "worker_finished");
      },
    });

    await executeSymphonyCommand(
      { type: "watch", issue: "KAT-920", timeoutMs: 2000, maxEvents: 5 },
      client,
      sink,
      { now: () => 1_000, checkConfigured: () => true },
    );

    expect(error).toHaveLength(0);
    expect(warning).toHaveLength(0);
    expect(info[0]).toContain("Watching KAT-920");
    expect(info.some((line) => line.includes("worker_started"))).toBe(true);
    expect(info.some((line) => line.includes("worker_finished"))).toBe(true);
    expect(info[info.length - 1]).toContain("Watch finished for KAT-920");
  });

  it("warns when watch receives no events", async () => {
    const { sink, info, warning, error } = makeSink();
    const client = createClient({
      watchEvents: async function* () {
        return;
      },
    });

    await executeSymphonyCommand(
      { type: "watch", issue: "KAT-920", timeoutMs: 500, maxEvents: 2 },
      client,
      sink,
      { checkConfigured: () => true },
    );

    expect(error).toHaveLength(0);
    expect(info[0]).toContain("Watching KAT-920");
    expect(warning[0]).toContain("No events received");
  });

  it("maps normalized errors to actionable command output", async () => {
    const { sink, error } = makeSink();
    const client = createClient({
      getState: async () => {
        throw new SymphonyError("missing config", {
          code: "config_missing",
          reason: "missing symphony.url",
        });
      },
    });

    await executeSymphonyCommand({ type: "status" }, client, sink, {
      checkConfigured: () => true,
    });

    expect(error).toHaveLength(1);
    expect(error[0]).toContain("config_missing");
    expect(error[0]).toContain("configure symphony.url");
  });
});
