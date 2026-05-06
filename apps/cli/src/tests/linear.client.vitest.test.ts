import { describe, expect, it, vi } from "vitest";

import { createLinearClient } from "../backends/linear/client.js";

describe("Linear GraphQL client", () => {
  it("sends GraphQL requests with the Linear token", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { viewer: { id: "user-1" } } })));
    const client = createLinearClient({ token: "lin_test", fetch: fetch as any });

    await expect(client.graphql({ query: "query Viewer { viewer { id } }" })).resolves.toEqual({ viewer: { id: "user-1" } });
    expect(fetch).toHaveBeenCalledWith("https://api.linear.app/graphql", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "lin_test",
        "Content-Type": "application/json",
        "User-Agent": "@kata-sh/cli",
      }),
    }));
  });

  it("throws a KataDomainError for GraphQL errors", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "Forbidden" }] })));
    const client = createLinearClient({ token: "lin_test", fetch: fetch as any });

    await expect(client.graphql({ query: "query Broken { viewer { id } }" })).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Forbidden",
    });
  });

  it("throws when GraphQL returns errors with partial data", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { viewer: { id: "user-1" } }, errors: [{ message: "Partial failure" }] })));
    const client = createLinearClient({ token: "lin_test", fetch: fetch as any });

    await expect(client.graphql({ query: "query Viewer { viewer { id } }" })).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Partial failure",
    });
  });

  it("throws a network error for non-2xx responses", async () => {
    const fetch = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
    const client = createLinearClient({ token: "lin_test", fetch: fetch as any });

    await expect(client.graphql({ query: "query Viewer { viewer { id } }" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Linear request failed (401): Unauthorized",
    });
  });

  it("adds Bearer prefix for OAuth tokens", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { viewer: { id: "user-1" } } })));
    const client = createLinearClient({ token: "lin_oauth_test", fetch: fetch as any });

    await client.graphql({ query: "query Viewer { viewer { id } }" });
    expect(fetch).toHaveBeenCalledWith("https://api.linear.app/graphql", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer lin_oauth_test" }),
    }));
  });

  it("paginates connection nodes", async () => {
    const fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body));
      const after = body.variables.after;
      return new Response(JSON.stringify({
        data: {
          teams: {
            nodes: after ? [{ id: "team-2" }] : [{ id: "team-1" }],
            pageInfo: { hasNextPage: !after, endCursor: after ? null : "cursor-1" },
          },
        },
      }));
    });
    const client = createLinearClient({ token: "lin_test", fetch: fetch as any });

    await expect(client.paginate<{ id: string }, { teams: any }>({
      query: "query Teams($after: String) { teams(first: 1, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } } }",
      variables: {},
      selectConnection: (data) => data.teams,
    })).resolves.toEqual([{ id: "team-1" }, { id: "team-2" }]);
  });
});
