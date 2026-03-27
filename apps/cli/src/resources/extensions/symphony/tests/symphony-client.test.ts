import { describe, expect, it } from "vitest";
import { SymphonyHttpClient } from "../client.js";
import type { SymphonyConnectionConfig, SymphonyEventEnvelope } from "../types.js";
import type { SymphonyWebSocketLike } from "../stream.js";

class MockWebSocket implements SymphonyWebSocketLike {
  static scripts: Array<(socket: MockWebSocket) => void> = [];
  static openedUrls: string[] = [];

  readonly url: string;
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data?: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string; wasClean?: boolean }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.openedUrls.push(url);
    const script = MockWebSocket.scripts.shift();
    if (script) {
      queueMicrotask(() => script(this));
    }
  }

  close(code?: number, reason?: string): void {
    this.emitClose(code ?? 1000, reason ?? "", true);
  }

  emitOpen(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data });
  }

  emitError(): void {
    this.onerror?.({});
  }

  emitClose(code: number, reason: string, wasClean = true): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean });
  }
}

function makeClient(options: {
  fetchImpl?: typeof fetch;
} = {}): SymphonyHttpClient {
  const config: SymphonyConnectionConfig = {
    url: "http://localhost:8080",
    origin: "preferences",
  };

  return new SymphonyHttpClient({
    resolveConfig: () => config,
    fetchImpl: options.fetchImpl,
    createWebSocket: (url) => new MockWebSocket(url),
  });
}

function makeEnvelope(overrides: Partial<SymphonyEventEnvelope> = {}): SymphonyEventEnvelope {
  return {
    version: "v1",
    sequence: 1,
    timestamp: new Date().toISOString(),
    kind: "worker",
    severity: "info",
    issue: "KAT-920",
    event: "worker_started",
    payload: { ok: true },
    ...overrides,
  };
}

function makeStatePayload() {
  return {
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
      poll_count: 1,
      last_poll_at: new Date().toISOString(),
    },
  };
}

async function collectEvents(iterable: AsyncIterable<SymphonyEventEnvelope>) {
  const events: SymphonyEventEnvelope[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

describe("SymphonyHttpClient", () => {
  it("fetches /api/v1/state and returns decoded state", async () => {
    const payload = makeStatePayload();
    const fetchImpl = (async (url) => {
      expect(url).toBe("http://localhost:8080/api/v1/state");
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const client = makeClient({ fetchImpl });
    const state = await client.getState();

    expect(state.poll_interval_ms).toBe(30_000);
    expect(state.max_concurrent_agents).toBe(10);
    expect(state.retry_queue).toEqual([]);
  });

  it("normalizes HTTP failures as connection_failed", async () => {
    const fetchImpl = (async () =>
      new Response("upstream failed", {
        status: 503,
      })) as typeof fetch;

    const client = makeClient({ fetchImpl });

    await expect(client.getState()).rejects.toMatchObject({
      code: "connection_failed",
      context: expect.objectContaining({
        status: 503,
        endpoint: "http://localhost:8080/api/v1/state",
      }),
    });
  });

  it("builds filter query params and streams websocket events", async () => {
    MockWebSocket.openedUrls = [];
    MockWebSocket.scripts = [
      (socket) => {
        socket.emitOpen();
        socket.emitMessage(
          JSON.stringify(
            makeEnvelope({ sequence: 44, event: "worker_progress" }),
          ),
        );
        socket.emitClose(1000, "done", true);
      },
    ];

    const client = makeClient();
    const events = await collectEvents(
      client.watchEvents(
        {
          issue: "kat-920",
          type: ["worker", "tool"],
          severity: ["warn", "error"],
        },
        { timeoutMs: 5_000 },
      ),
    );

    expect(events).toHaveLength(1);
    expect(events[0].sequence).toBe(44);

    expect(MockWebSocket.openedUrls[0]).toContain("/api/v1/events");
    expect(MockWebSocket.openedUrls[0]).toContain("issue=KAT-920");
    expect(MockWebSocket.openedUrls[0]).toContain("type=worker%2Ctool");
    expect(MockWebSocket.openedUrls[0]).toContain("severity=warn%2Cerror");
  });

  it("reconnects on retryable close codes", async () => {
    MockWebSocket.openedUrls = [];
    MockWebSocket.scripts = [
      (socket) => {
        socket.emitOpen();
        socket.emitMessage(
          JSON.stringify(
            makeEnvelope({ sequence: 1, event: "worker_started" }),
          ),
        );
        socket.emitClose(1011, "transient", false);
      },
      (socket) => {
        socket.emitOpen();
        socket.emitMessage(
          JSON.stringify(
            makeEnvelope({ sequence: 2, event: "worker_finished" }),
          ),
        );
        socket.emitClose(1000, "done", true);
      },
    ];

    const client = makeClient();
    const events = await collectEvents(
      client.watchEvents({ issue: "KAT-920" }, { timeoutMs: 5_000 }),
    );

    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(MockWebSocket.openedUrls).toHaveLength(2);
  });

  it("raises decode_error when stream payload is malformed", async () => {
    MockWebSocket.openedUrls = [];
    MockWebSocket.scripts = [
      (socket) => {
        socket.emitOpen();
        socket.emitMessage("{not-json");
      },
    ];

    const client = makeClient();

    await expect(
      collectEvents(client.watchEvents({ issue: "KAT-920" }, { timeoutMs: 2_000 })),
    ).rejects.toMatchObject({
      code: "decode_error",
    });
  });
});
