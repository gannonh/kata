import { describe, expect, it, vi } from "vitest";

import { createGithubClient } from "../backends/github-projects-v2/client.js";
import { loadProjectFieldIndex } from "../backends/github-projects-v2/project-fields.js";

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

  it("normalizes invalid GraphQL JSON responses to a domain error", async () => {
    const fetch = vi.fn(async () => new Response("not json", { status: 200 }));
    const client = createGithubClient({ token: "ghp_test", fetch });

    await expect(client.graphql({ query: "query { viewer { login } }" })).rejects.toMatchObject({
      code: "NETWORK",
      message: "GitHub response was not valid JSON.",
    });
  });

  it("returns GraphQL data when GitHub also includes partial errors", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { user: { login: "gannonhall" }, organization: null },
            errors: [{ message: "Could not resolve to an Organization with the login of 'gannonhall'." }],
          }),
          { status: 200 },
        ),
    );
    const client = createGithubClient({ token: "ghp_test", fetch });

    const result = await client.graphql<{ user: { login: string }; organization: null }>({
      query: "query { user(login: \"gannonhall\") { login } organization(login: \"gannonhall\") { login } }",
    });

    expect(result.user.login).toBe("gannonhall");
    expect(result.organization).toBeNull();
  });

  it("rejects GraphQL errors when the response does not include data", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            errors: [{ message: "Could not resolve to a User with the login of 'missing'." }],
          }),
          { status: 200 },
        ),
    );
    const client = createGithubClient({ token: "ghp_test", fetch });

    await expect(client.graphql({ query: "query { user(login: \"missing\") { login } }" })).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Could not resolve to a User with the login of 'missing'.",
    });
  });

  it("rejects empty successful GraphQL responses with a missing data domain error", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 200 }));
    const client = createGithubClient({ token: "ghp_test", fetch });

    await expect(client.graphql({ query: "query { viewer { login } }" })).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "GitHub GraphQL response did not include data.",
    });
  });

  it("rejects REST paths without a leading slash before fetching", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ number: 1 }), { status: 200 }));
    const client = createGithubClient({ token: "ghp_test", fetch });

    await expect(
      client.rest({
        method: "GET",
        path: "repos/kata-sh/uat/issues/1",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      message: 'GitHub REST path must be root-relative and begin with exactly one "/".',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("loadProjectFieldIndex", () => {
  it("rejects when required project fields are missing", async () => {
    const client = {
      graphql: vi.fn(async () => ({
        organization: {
          projectV2: {
            id: "project-id",
            fields: {
              nodes: [{ id: "status-field-id", name: "Status", options: validStatusOptions() }],
            },
          },
        },
      })),
    } as unknown as Parameters<typeof loadProjectFieldIndex>[0]["client"];

    await expect(
      loadProjectFieldIndex({
        client,
        owner: "kata-sh",
        repo: "uat",
        projectNumber: 1,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      message: expect.stringContaining("GitHub Projects v2 project is missing required Kata fields:\n  - Kata Type"),
    });
  });

  it("allows missing Status options", async () => {
    const client = {
      graphql: vi.fn(async () => ({
        organization: {
          projectV2: {
            id: "project-id",
            fields: {
              nodes: validProjectFields({
                statusOptions: validStatusOptions().filter((option) => option.name !== "Done"),
              }),
            },
          },
        },
      })),
    } as unknown as Parameters<typeof loadProjectFieldIndex>[0]["client"];

    await expect(loadProjectFieldIndex({
      client,
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 1,
    })).resolves.toMatchObject({ projectId: "project-id" });
  });

  it("rejects required Kata fields with non-text Project v2 types", async () => {
    const client = {
      graphql: vi.fn(async () => ({
        organization: {
          projectV2: {
            id: "project-id",
            fields: {
              nodes: validProjectFields().map((field) =>
                field.name === "Kata ID" ? { ...field, dataType: "NUMBER" } : field
              ),
            },
          },
        },
      })),
    } as unknown as Parameters<typeof loadProjectFieldIndex>[0]["client"];

    await expect(loadProjectFieldIndex({
      client,
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 1,
    })).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      message: expect.stringContaining("Kata ID must be Text"),
    });
  });

  it("returns a field index with Status options for a valid project", async () => {
    const client = {
      graphql: vi.fn(async () => ({
        user: {
          projectV2: {
            id: "project-id",
            fields: {
              nodes: validProjectFields(),
            },
          },
        },
      })),
    } as unknown as Parameters<typeof loadProjectFieldIndex>[0]["client"];

    const index = await loadProjectFieldIndex({
      client,
      owner: "gannonhall",
      repo: "uat",
      projectNumber: 1,
    });

    expect(index.projectId).toBe("project-id");
    expect(index.fields.Status).toMatchObject({
      id: "status-field-id",
      options: {
        Backlog: "status-backlog",
        Done: "status-done",
      },
    });
    expect(index.fields["Kata ID"]).toMatchObject({ id: "kata-id-field-id" });
  });
});

function validProjectFields(input: { statusOptions?: Array<{ id: string; name: string }> } = {}) {
  return [
    { id: "status-field-id", name: "Status", options: input.statusOptions ?? validStatusOptions() },
    { id: "kata-type-field-id", name: "Kata Type", dataType: "TEXT" },
    { id: "kata-id-field-id", name: "Kata ID", dataType: "TEXT" },
    { id: "kata-parent-id-field-id", name: "Kata Parent ID", dataType: "TEXT" },
    { id: "kata-artifact-scope-field-id", name: "Kata Artifact Scope", dataType: "TEXT" },
    { id: "kata-verification-state-field-id", name: "Kata Verification State", dataType: "TEXT" },
    { id: "kata-blocking-field-id", name: "Kata Blocking", dataType: "TEXT" },
    { id: "kata-blocked-by-field-id", name: "Kata Blocked By", dataType: "TEXT" },
  ];
}

function validStatusOptions() {
  return [
    { id: "status-backlog", name: "Backlog" },
    { id: "status-todo", name: "Todo" },
    { id: "status-in-progress", name: "In Progress" },
    { id: "status-agent-review", name: "Agent Review" },
    { id: "status-human-review", name: "Human Review" },
    { id: "status-merging", name: "Merging" },
    { id: "status-done", name: "Done" },
  ];
}
