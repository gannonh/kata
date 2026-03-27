import { describe, expect, it } from "vitest";
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
  it("parses status, watch, and config commands", () => {
    expect(parseSymphonyCommand("status")).toEqual({ type: "status" });

    expect(
      parseSymphonyCommand("watch kat-920 --max-events 3 --timeout-ms 2000"),
    ).toEqual({
      type: "watch",
      issue: "KAT-920",
      maxEvents: 3,
      timeoutMs: 2000,
    });

    expect(parseSymphonyCommand("config")).toEqual({ type: "config" });
    expect(parseSymphonyCommand("config ./WORKFLOW.md")).toEqual({
      type: "config",
      workflowPathArg: "./WORKFLOW.md",
    });
  });

  it("falls back to usage on invalid watch syntax", () => {
    expect(parseSymphonyCommand("watch")).toEqual({ type: "usage" });
    expect(parseSymphonyCommand("watch KAT-1 --timeout-ms nope")).toEqual({
      type: "usage",
    });
    expect(parseSymphonyCommand("unknown")).toEqual({ type: "usage" });
  });
});

describe("executeSymphonyCommand", () => {
  it("renders status output", async () => {
    const { sink, info, error } = makeSink();
    const client = createClient({});

    await executeSymphonyCommand({ type: "status" }, client, sink);

    expect(error).toHaveLength(0);
    expect(info[0]).toContain("Symphony Status");
    expect(info[0]).toContain("Running workers:");
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
      { now: () => 1_000 },
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

    await executeSymphonyCommand({ type: "status" }, client, sink);

    expect(error).toHaveLength(1);
    expect(error[0]).toContain("config_missing");
    expect(error[0]).toContain("configure symphony.url");
  });
});
