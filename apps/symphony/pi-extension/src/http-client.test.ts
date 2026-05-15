import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SymphonyHttpClient } from "./http-client.ts";
import { SymphonyExtensionError } from "./errors.ts";

let server: Server | undefined;

async function serve(handler: (req: { method?: string; url?: string }, body: string) => { status: number; body: unknown; contentType?: string }): Promise<string> {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += String(chunk)));
    req.on("end", () => {
      const response = handler(req, body);
      res.statusCode = response.status;
      res.setHeader("content-type", response.contentType ?? "application/json");
      res.end(typeof response.body === "string" ? response.body : JSON.stringify(response.body));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("expected TCP address");
  return `http://127.0.0.1:${address.port}`;
}

function validState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tracker_project_url: "https://github.com/gannonh/kata/projects/1",
    running: { one: { issue_identifier: "KAT-1" } },
    retry_queue: [{ identifier: "KAT-2" }],
    blocked: [],
    completed: [{ identifier: "KAT-3" }],
    polling: { checking: false, next_poll_in_ms: 1000, poll_interval_ms: 30000, poll_count: 2 },
    ...overrides,
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  if (!server) return;
  await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
  server = undefined;
});

describe("SymphonyHttpClient", () => {
  it("fetches state and summarizes health", async () => {
    const baseUrl = await serve((req) => {
      expect(req.url).toBe("/api/v1/state");
      return {
        status: 200,
        body: validState(),
      };
    });

    const client = new SymphonyHttpClient(baseUrl);
    const state = await client.getState();
    expect(state.tracker_project_url).toBe("https://github.com/gannonh/kata/projects/1");
    expect(client.toHealthSummary(state).runningCount).toBe(1);
    expect(client.toHealthSummary(state).retryCount).toBe(1);
    expect(client.toHealthSummary(state).completedCount).toBe(1);
  });

  it("normalizes base URL path and query before requesting state", async () => {
    const baseUrl = await serve((req) => {
      expect(req.url).toBe("/dashboard/api/v1/state");
      return { status: 200, body: validState() };
    });

    const client = new SymphonyHttpClient(`${baseUrl}/dashboard///?debug=true#panel`);
    expect(client.baseUrl).toBe(`${baseUrl}/dashboard`);
    await expect(client.verify()).resolves.toMatchObject({ running: expect.any(Object) });
  });

  it("normalizes Symphony API error envelopes", async () => {
    const baseUrl = await serve(() => ({
      status: 409,
      body: { error: { code: "no_active_session", message: "issue has no active RPC session", status: 409 } },
    }));

    const client = new SymphonyHttpClient(baseUrl);
    await expect(client.getState()).rejects.toMatchObject({
      kind: "api_error",
      message: "issue has no active RPC session",
    } satisfies Partial<SymphonyExtensionError>);
  });

  it("normalizes non-OK null JSON responses", async () => {
    const baseUrl = await serve(() => ({ status: 500, body: null }));
    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.getState()).rejects.toMatchObject({
      kind: "non_symphony_response",
      message: "Symphony HTTP API returned an unexpected error response",
      details: expect.objectContaining({ status: 500, body: null }),
    } satisfies Partial<SymphonyExtensionError>);
  });

  it.each([
    ["array", []],
    ["empty object", {}],
    ["unrelated object", { ok: true }],
  ])("rejects invalid state shape: %s", async (_name, body) => {
    const baseUrl = await serve(() => ({ status: 200, body }));
    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.verify()).rejects.toMatchObject({
      kind: "non_symphony_response",
      message: "Response did not look like Symphony state",
    } satisfies Partial<SymphonyExtensionError>);
  });

  it.each([
    ["running", validState({ running: [] }), "running"],
    ["retry_queue", validState({ retry_queue: {} }), "retry_queue"],
    ["polling.next_poll_in_ms", validState({ polling: { checking: false, next_poll_in_ms: "1000", poll_interval_ms: 30000 } }), "polling.next_poll_in_ms"],
  ])("rejects malformed state field: %s", async (_name, body, field) => {
    const baseUrl = await serve(() => ({ status: 200, body }));
    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.getState()).rejects.toMatchObject({
      kind: "non_symphony_response",
      details: expect.objectContaining({ field }),
    } satisfies Partial<SymphonyExtensionError>);
  });

  it("rejects state missing blocked", async () => {
    const stateMissingBlocked = validState();
    delete stateMissingBlocked.blocked;
    const baseUrl = await serve(() => ({ status: 200, body: stateMissingBlocked }));
    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.getState()).rejects.toMatchObject({
      kind: "non_symphony_response",
      details: expect.objectContaining({ missingFields: ["blocked"] }),
    } satisfies Partial<SymphonyExtensionError>);
  });

  it("rejects invalid JSON", async () => {
    const baseUrl = await serve(() => ({ status: 200, body: "not-json", contentType: "application/json" }));
    const client = new SymphonyHttpClient(baseUrl);
    await expect(client.getState()).rejects.toMatchObject({ kind: "invalid_json" } satisfies Partial<SymphonyExtensionError>);
  });

  it("normalizes unreachable fetch failures", async () => {
    const fetchStub: typeof fetch = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    vi.stubGlobal("fetch", fetchStub);

    const client = new SymphonyHttpClient("http://127.0.0.1:65535");
    await expect(client.getState()).rejects.toMatchObject({
      kind: "attach_unreachable",
      details: expect.objectContaining({ cause: "connect ECONNREFUSED" }),
    } satisfies Partial<SymphonyExtensionError>);
  });

  it("preserves fetch abort cancellation", async () => {
    const controller = new AbortController();
    controller.abort();

    const client = new SymphonyHttpClient("http://127.0.0.1:65535");
    await expect(client.getState(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("preserves body read abort cancellation", async () => {
    const fetchStub: typeof fetch = async () =>
      ({
        ok: true,
        status: 200,
        text: async () => {
          throw new DOMException("The operation was aborted.", "AbortError");
        },
      }) as unknown as Response;
    vi.stubGlobal("fetch", fetchStub);

    const client = new SymphonyHttpClient("http://127.0.0.1:65535");
    await expect(client.getState(new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("normalizes non-abort body read failures", async () => {
    const fetchStub: typeof fetch = async () =>
      ({
        ok: true,
        status: 200,
        text: async () => {
          throw new Error("terminated");
        },
      }) as unknown as Response;
    vi.stubGlobal("fetch", fetchStub);

    const client = new SymphonyHttpClient("http://127.0.0.1:65535");
    await expect(client.getState()).rejects.toMatchObject({
      kind: "non_symphony_response",
      message: "Could not read Symphony HTTP API response body",
      details: expect.objectContaining({ status: 200, cause: "terminated" }),
    } satisfies Partial<SymphonyExtensionError>);
  });
});
