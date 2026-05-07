import { describe, expect, it, vi } from "vitest";

import { createLinearClient, type LinearConnection } from "../backends/linear/client.js";

describe("createLinearClient", () => {
  it("sends authenticated GraphQL requests to Linear", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { viewer: { id: "viewer-id", name: "Kata User" } },
          }),
          { status: 200 },
        ),
    );

    const client = createLinearClient({ token: "lin_test", fetch });
    const result = await client.graphql<{ viewer: { id: string; name: string } }>({
      query: "query Viewer { viewer { id name } }",
      variables: { includeArchived: false },
    });

    expect(result.viewer).toEqual({ id: "viewer-id", name: "Kata User" });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.linear.app/graphql",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "lin_test",
          "Content-Type": "application/json",
          "User-Agent": "@kata-sh/cli",
        },
        body: JSON.stringify({
          query: "query Viewer { viewer { id name } }",
          variables: { includeArchived: false },
        }),
      }),
    );
  });

  it("rejects GraphQL errors with a domain error", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            errors: [{ message: "Forbidden" }],
          }),
          { status: 200 },
        ),
    );
    const client = createLinearClient({ token: "lin_test", fetch });

    await expect(client.graphql({ query: "query Viewer { viewer { id } }" })).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Forbidden",
    });
  });

  it("rejects GraphQL errors when the response also includes data", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { viewer: { id: "viewer-id" } },
            errors: [{ message: "Cannot query field" }],
          }),
          { status: 200 },
        ),
    );
    const client = createLinearClient({ token: "lin_test", fetch });

    await expect(client.graphql({ query: "query Viewer { viewer { id missingField } }" })).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Cannot query field",
    });
  });

  it("rejects null GraphQL responses with a missing data domain error", async () => {
    const fetch = vi.fn(async () => new Response("null", { status: 200 }));
    const client = createLinearClient({ token: "lin_test", fetch });

    await expect(client.graphql({ query: "query Viewer { viewer { id } }" })).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Linear GraphQL response did not include data.",
    });
  });

  it("rejects malformed GraphQL errors with a missing data domain error", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            errors: { length: 1, message: "Forbidden" },
          }),
          { status: 200 },
        ),
    );
    const client = createLinearClient({ token: "lin_test", fetch });

    await expect(client.graphql({ query: "query Viewer { viewer { id } }" })).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Linear GraphQL response did not include data.",
    });
  });

  it("normalizes invalid JSON responses to a network domain error", async () => {
    const fetch = vi.fn(async () => new Response("not json", { status: 200 }));
    const client = createLinearClient({ token: "lin_test", fetch });

    await expect(client.graphql({ query: "query Viewer { viewer { id } }" })).rejects.toMatchObject({
      code: "NETWORK",
      message: "Linear response was not valid JSON.",
    });
  });

  it("maps 401 responses to unauthorized domain errors", async () => {
    const fetch = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
    const client = createLinearClient({ token: "lin_test", fetch });

    await expect(client.graphql({ query: "query Viewer { viewer { id } }" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Linear request failed (401): Unauthorized",
    });
  });

  it("maps 429 responses to rate limited domain errors", async () => {
    const fetch = vi.fn(async () => new Response("Too Many Requests", { status: 429 }));
    const client = createLinearClient({ token: "lin_test", fetch });

    await expect(client.graphql({ query: "query Viewer { viewer { id } }" })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "Linear request failed (429): Too Many Requests",
    });
  });

  it("paginates Linear connections across pages", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              workflowStates: {
                nodes: [{ id: "state-1" }, null],
                pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              workflowStates: {
                nodes: [{ id: "state-2" }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
          { status: 200 },
        ),
      );
    const client = createLinearClient({ token: "lin_test", fetch });

    const nodes = await client.paginate<{ id: string }, { workflowStates: LinearConnection<{ id: string }> }>({
      query: "query WorkflowStates($first: Int!, $after: String) { workflowStates(first: $first, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } } }",
      variables: { first: 2 },
      selectConnection: (data) => data.workflowStates,
    });

    expect(nodes).toEqual([{ id: "state-1" }, { id: "state-2" }]);
    const firstBody = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
    expect(firstBody.variables).toEqual({ first: 2 });
    expect(secondBody.variables).toEqual({ first: 2, after: "cursor-1" });
  });

  it("rejects pagination when Linear reports another page without an end cursor", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              workflowStates: {
                nodes: [{ id: "state-1" }],
                pageInfo: { hasNextPage: true, endCursor: null },
              },
            },
          }),
          { status: 200 },
        ),
    );
    const client = createLinearClient({ token: "lin_test", fetch });

    await expect(
      client.paginate<{ id: string }, { workflowStates: LinearConnection<{ id: string }> }>({
        query: "query WorkflowStates($after: String) { workflowStates(after: $after) { nodes { id } pageInfo { hasNextPage endCursor } } }",
        selectConnection: (data) => data.workflowStates,
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Linear connection reported another page without an end cursor.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects pagination when maxPages is exhausted", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              workflowStates: {
                nodes: [{ id: "state-1" }],
                pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              workflowStates: {
                nodes: [{ id: "state-2" }],
                pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
              },
            },
          }),
          { status: 200 },
        ),
      );
    const client = createLinearClient({ token: "lin_test", fetch });

    await expect(
      client.paginate<{ id: string }, { workflowStates: LinearConnection<{ id: string }> }>({
        query: "query WorkflowStates($after: String) { workflowStates(after: $after) { nodes { id } pageInfo { hasNextPage endCursor } } }",
        selectConnection: (data) => data.workflowStates,
        maxPages: 2,
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Unable to paginate Linear connection after 2 full pages.",
    });
  });
});
