import { describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerSymphonyTools } from "../tools.js";
import type { SymphonyClient } from "../client.js";
import { SymphonyError, type SymphonyEventEnvelope } from "../types.js";

interface RegisteredTool {
  name: string;
  parameters: Record<string, unknown>;
  execute: (...args: any[]) => Promise<any>;
}

function makeClient(overrides: Partial<SymphonyClient> = {}): SymphonyClient {
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
    watchEvents: async function* () {
      return;
    },
    ...overrides,
  };
}

function registerWithClient(client: SymphonyClient): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();

  const api = {
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
  } as unknown as ExtensionAPI;

  registerSymphonyTools(api, client);
  return tools;
}

function makeEvent(sequence: number): SymphonyEventEnvelope {
  return {
    version: "v1",
    sequence,
    timestamp: new Date(sequence * 1000).toISOString(),
    kind: "worker",
    severity: "info",
    issue: "KAT-920",
    event: "worker_progress",
    payload: {},
  };
}

describe("registerSymphonyTools", () => {
  it("registers all symphony tools with strict schemas", () => {
    const tools = registerWithClient(makeClient());
    expect([...tools.keys()].sort()).toEqual([
      "symphony_logs",
      "symphony_status",
      "symphony_steer",
      "symphony_watch",
    ]);

    const status = tools.get("symphony_status")!;
    const watch = tools.get("symphony_watch")!;
    const logs = tools.get("symphony_logs")!;
    const steer = tools.get("symphony_steer")!;

    expect(status.parameters.additionalProperties).toBe(false);
    expect(watch.parameters.additionalProperties).toBe(false);
    expect(logs.parameters.additionalProperties).toBe(false);
    expect(steer.parameters.additionalProperties).toBe(false);
  });

  it("executes symphony_status and returns structured details", async () => {
    const tools = registerWithClient(makeClient());
    const statusTool = tools.get("symphony_status")!;

    const result = await statusTool.execute("call-1", {}, undefined, undefined, {});

    expect(result.isError).toBeUndefined();
    expect(result.details.connection).toMatchObject({
      url: "http://localhost:8080",
      connected: true,
    });
    expect(result.details.capabilities.status.available).toBe(true);

    const payload = JSON.parse(result.content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.summary.runningWorkers).toBe(0);
  });

  it("executes symphony_watch against live client stream", async () => {
    const tools = registerWithClient(
      makeClient({
        watchEvents: async function* () {
          yield makeEvent(1);
          yield makeEvent(2);
        },
      }),
    );

    const watchTool = tools.get("symphony_watch")!;
    const result = await watchTool.execute(
      "call-2",
      { issue: "KAT-920", maxEvents: 10, timeoutMs: 2_000 },
      undefined,
      undefined,
      {},
    );

    expect(result.isError).toBeUndefined();
    expect(result.details.capabilities.watch.available).toBe(true);

    const payload = JSON.parse(result.content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.received).toBe(2);
    expect(payload.events).toHaveLength(2);
  });

  it("returns deterministic capability_unavailable payloads for logs and steer", async () => {
    const tools = registerWithClient(makeClient());

    const logsResult = await tools
      .get("symphony_logs")!
      .execute("call-logs", { issue: "KAT-920" }, undefined, undefined, {});
    const steerResult = await tools
      .get("symphony_steer")!
      .execute(
        "call-steer",
        { issue: "KAT-920", instruction: "pause" },
        undefined,
        undefined,
        {},
      );

    const logsPayload = JSON.parse(logsResult.content[0].text);
    const steerPayload = JSON.parse(steerResult.content[0].text);

    expect(logsPayload.code).toBe("capability_unavailable");
    expect(logsPayload.capability).toBe("logs");
    expect(steerPayload.code).toBe("capability_unavailable");
    expect(steerPayload.capability).toBe("steer");

    expect(logsResult.details.capabilities.logs.available).toBe(false);
    expect(steerResult.details.capabilities.steer.available).toBe(false);
  });

  it("normalizes status/watch failures into stable tool errors", async () => {
    const tools = registerWithClient(
      makeClient({
        getState: async () => {
          throw new SymphonyError("missing config", {
            code: "config_missing",
            reason: "missing symphony.url",
          });
        },
        watchEvents: async function* () {
          throw new SymphonyError("stream closed", {
            code: "stream_closed",
            reason: "reconnect_exhausted",
          });
        },
      }),
    );

    const statusResult = await tools
      .get("symphony_status")!
      .execute("call-3", {}, undefined, undefined, {});
    const watchResult = await tools
      .get("symphony_watch")!
      .execute("call-4", { issue: "KAT-920" }, undefined, undefined, {});

    expect(statusResult.isError).toBe(true);
    expect(statusResult.content[0].text).toContain("config_missing");
    expect(statusResult.details.connection.connected).toBe(false);

    expect(watchResult.isError).toBe(true);
    expect(watchResult.content[0].text).toContain("stream_closed");
    expect(watchResult.details.connection.connected).toBe(false);
  });
});
