import { describe, expect, it, vi } from "vitest";

import { createGithubClient } from "../backends/github-projects-v2/client.js";

describe("createGithubClient", () => {
  it("sends authenticated GraphQL requests", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { viewer: { login: "gannonhall" } },
          }),
          { status: 200 },
        ),
    );

    const client = createGithubClient({ token: "ghp_test", fetch });
    const result = await client.graphql<{ viewer: { login: string } }>({
      query: "query { viewer { login } }",
    });

    expect(result.viewer.login).toBe("gannonhall");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/graphql",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_test",
        }),
      }),
    );
  });

  it("sends REST requests to repository endpoints", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ number: 1 }), { status: 201 }));
    const client = createGithubClient({ token: "ghp_test", fetch });

    const result = await client.rest<{ number: number }>({
      method: "POST",
      path: "/repos/kata-sh/uat/issues",
      body: { title: "Issue" },
    });

    expect(result.number).toBe(1);
    expect(fetch).toHaveBeenCalledWith("https://api.github.com/repos/kata-sh/uat/issues", expect.any(Object));
  });
});
