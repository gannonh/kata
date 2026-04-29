import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { fetchWithRetry } from "../http.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchWithRetry", () => {
  it("retries GraphQL-wrapped 5xx responses and succeeds on a subsequent attempt", async () => {
    let attempts = 0;

    globalThis.fetch = (async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response(
          JSON.stringify({
            errors: [{ message: "Transient upstream failure" }],
          }),
          {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "content-type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const response = await fetchWithRetry("https://example.invalid/graphql", { method: "POST" }, 1);

    assert.equal(response.status, 200);
    assert.equal(attempts, 2);
  });
});
