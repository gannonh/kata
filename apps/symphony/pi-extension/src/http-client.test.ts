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
    running: {
      one: {
        issue_id: "issue-1",
        issue_identifier: "KAT-1",
        workspace_path: "/tmp/symphony/issue-1",
        started_at: "2026-05-14T12:00:00Z",
        status: "running",
      },
    },
    retry_queue: [
      {
        issue_id: "issue-2",
        identifier: "KAT-2",
        attempt: 2,
        due_in_ms: 1500,
        error: "rate limited",
        worker_host: "host-1",
        workspace_path: "/tmp/symphony/issue-2",
      },
    ],
    blocked: [],
    completed: [{ issue_id: "issue-3", identifier: "KAT-3", title: "Done", completed_at: null, issue_url: null }],
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

  it("fetches typed Wave 3 state entries", async () => {
    const baseUrl = await serve((req) => {
      expect(req.url).toBe("/api/v1/state");
      return {
        status: 200,
        body: validState({
          retry_queue: [
            {
              issue_id: "issue-retry-1",
              identifier: "KAT-10",
              attempt: 3,
              due_in_ms: 2500,
              error: null,
              worker_host: "worker-a",
              workspace_path: "/tmp/kata/KAT-10",
            },
          ],
          blocked: [
            {
              issue_id: "issue-blocked-1",
              identifier: "KAT-11",
              title: "Blocked issue",
              state: "blocked",
              blocker_identifiers: ["KAT-9"],
            },
          ],
          pending_escalations: [
            {
              request_id: "esc-1",
              issue_id: "issue-pending-1",
              issue_identifier: "KAT-12",
              method: "request_approval",
              preview: "Approve deploy",
              created_at: "2026-05-14T12:00:00Z",
              timeout_ms: 60000,
            },
          ],
          completed: [
            {
              issue_id: "issue-completed-1",
              identifier: "KAT-13",
              title: "Completed issue",
              completed_at: "2026-05-14T13:00:00Z",
              issue_url: "https://github.com/gannonh/kata/issues/13",
            },
          ],
        }),
      };
    });

    const client = new SymphonyHttpClient(baseUrl);
    const state = await client.getState();

    expect(state.retry_queue?.[0]).toMatchObject({ issue_id: "issue-retry-1", identifier: "KAT-10", attempt: 3, due_in_ms: 2500 });
    expect(state.blocked?.[0]).toMatchObject({ issue_id: "issue-blocked-1", identifier: "KAT-11", title: "Blocked issue", blocker_identifiers: ["KAT-9"] });
    expect(state.pending_escalations?.[0]).toMatchObject({ request_id: "esc-1", issue_identifier: "KAT-12", timeout_ms: 60000 });
    expect(state.completed?.[0]).toMatchObject({ issue_id: "issue-completed-1", identifier: "KAT-13", title: "Completed issue" });
  });

  it("fetches pending escalations", async () => {
    const pending = [
      {
        request_id: "esc-1",
        issue_id: "issue-1",
        issue_identifier: "KAT-1",
        method: "request_approval",
        preview: "Approve deploy",
        created_at: "2026-05-14T12:00:00Z",
        timeout_ms: 60000,
      },
    ];
    const baseUrl = await serve((req) => {
      expect(req.method).toBe("GET");
      expect(req.url).toBe("/api/v1/escalations");
      return { status: 200, body: { pending } };
    });

    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.getEscalations()).resolves.toEqual({ pending });
  });

  it("responds to a pending escalation", async () => {
    const baseUrl = await serve((req, body) => {
      expect(req.method).toBe("POST");
      expect(req.url).toBe("/api/v1/escalations/esc-1/respond");
      expect(JSON.parse(body)).toEqual({ response: { approved: true }, responder_id: "pi-dashboard" });
      return { status: 200, body: { ok: true } };
    });

    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.respondEscalation("esc-1", { approved: true })).resolves.toEqual({ ok: true });
  });

  it.each([
    ["missing", 404, "escalation_not_found"],
    ["resolved", 409, "escalation_already_resolved"],
  ])("normalizes simple escalation API errors: %s", async (_name, status, error) => {
    const baseUrl = await serve(() => ({ status, body: { error } }));
    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.getEscalations()).rejects.toMatchObject({
      kind: "api_error",
      message: error,
      details: expect.objectContaining({ code: error, status }),
    } satisfies Partial<SymphonyExtensionError>);
  });

  it.each([
    ["retry_queue.0.issue_id", validState({ retry_queue: [{ identifier: "KAT-2", attempt: 1, due_in_ms: 1000 }] })],
    [
      "blocked.0.title",
      validState({
        blocked: [{ issue_id: "issue-2", identifier: "KAT-2", state: "blocked", blocker_identifiers: [] }],
      }),
    ],
    [
      "pending_escalations.0.issue_id",
      validState({
        pending_escalations: [
          {
            request_id: "esc-1",
            issue_identifier: "KAT-2",
            method: "request_approval",
            preview: "Approve deploy",
            created_at: "2026-05-14T12:00:00Z",
            timeout_ms: 60000,
          },
        ],
      }),
    ],
    ["completed.0.title", validState({ completed: [{ issue_id: "issue-3", identifier: "KAT-3" }] })],
  ])("rejects malformed Wave 3 state entry: %s", async (field, body) => {
    const baseUrl = await serve(() => ({ status: 200, body }));
    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.getState()).rejects.toMatchObject({
      kind: "non_symphony_response",
      details: expect.objectContaining({ field }),
    } satisfies Partial<SymphonyExtensionError>);
  });

  it("requests a Symphony poll refresh", async () => {
    const baseUrl = await serve((req) => {
      expect(req.method).toBe("POST");
      expect(req.url).toBe("/api/v1/refresh");
      return { status: 202, body: { queued: true, coalesced: false, pending_requests: 1 } };
    });

    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.refresh()).resolves.toEqual({ queued: true, coalesced: false, pendingRequests: 1 });
  });

  it("sends a steer instruction for a running issue", async () => {
    const baseUrl = await serve((req, body) => {
      expect(req.method).toBe("POST");
      expect(req.url).toBe("/api/v1/steer");
      expect(JSON.parse(body)).toEqual({ issue_identifier: "SIM-123", instruction: "Use the existing auth module" });
      return {
        status: 200,
        body: {
          ok: true,
          issue_id: "issue-123",
          issue_identifier: "SIM-123",
          delivered: true,
          instruction_preview: "Use the existing auth module",
        },
      };
    });

    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.steer("SIM-123", "Use the existing auth module")).resolves.toEqual({
      ok: true,
      issueId: "issue-123",
      issueIdentifier: "SIM-123",
      delivered: true,
      instructionPreview: "Use the existing auth module",
    });
  });

  it("rejects malformed refresh responses", async () => {
    const baseUrl = await serve(() => ({ status: 202, body: { queued: true } }));
    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.refresh()).rejects.toMatchObject({
      kind: "non_symphony_response",
      message: "Response did not look like Symphony refresh response",
    } satisfies Partial<SymphonyExtensionError>);
  });

  it("normalizes steer API errors", async () => {
    const baseUrl = await serve(() => ({
      status: 404,
      body: { error: { code: "issue_not_running", message: "issue is not running", status: 404 } },
    }));
    const client = new SymphonyHttpClient(baseUrl);

    await expect(client.steer("SIM-404", "check logs")).rejects.toMatchObject({
      kind: "api_error",
      message: "issue is not running",
      details: expect.objectContaining({ code: "issue_not_running", status: 404 }),
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
    ["running entry", validState({ running: { one: { issue_identifier: "KAT-1" } } }), "running.one.issue_id"],
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
