import { describe, it, expect, vi } from "vitest";
import { LinearClient } from "../linear-client.js";

describe("LinearClient.listIssues", () => {
  it("includes projectMilestone filter when projectMilestoneId is provided", async () => {
    const client = new LinearClient("test-key", "https://linear.test/graphql");
    const graphqlCalls: Array<Record<string, unknown> | undefined> = [];

    vi.spyOn(client, "graphql").mockImplementation(async <T>(
      _query: string,
      variables?: Record<string, unknown>,
    ): Promise<T> => {
      graphqlCalls.push(variables);
      return {
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      } as T;
    });

    await client.listIssues({
      projectId: "proj-1",
      projectMilestoneId: "milestone-uuid",
      labelIds: ["label-slice"],
    });

    expect(graphqlCalls.length).toBe(1);
    expect(graphqlCalls[0]?.filter).toEqual({
      project: { id: { eq: "proj-1" } },
      projectMilestone: { id: { eq: "milestone-uuid" } },
      labels: { some: { id: { in: ["label-slice"] } } },
    });
  });

  it("omits projectMilestone filter when projectMilestoneId is absent", async () => {
    const client = new LinearClient("test-key", "https://linear.test/graphql");
    const graphqlCalls: Array<Record<string, unknown> | undefined> = [];

    vi.spyOn(client, "graphql").mockImplementation(async <T>(
      _query: string,
      variables?: Record<string, unknown>,
    ): Promise<T> => {
      graphqlCalls.push(variables);
      return {
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      } as T;
    });

    await client.listIssues({ projectId: "proj-1" });

    expect(graphqlCalls.length).toBe(1);
    expect(graphqlCalls[0]?.filter).toEqual({
      project: { id: { eq: "proj-1" } },
    });
  });
});

describe("LinearClient summary queries", () => {
  it("listDocumentSummaries omits content from the GraphQL field set", async () => {
    const client = new LinearClient("test-key", "https://linear.test/graphql");
    const queries: string[] = [];

    vi.spyOn(client, "graphql").mockImplementation(async <T>(query: string): Promise<T> => {
      queries.push(query);
      return {
        documents: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      } as T;
    });

    await client.listDocumentSummaries({ projectId: "proj-1" });

    expect(queries[0]).not.toContain("content");
    expect(queries[0]).toContain("title");
    expect(queries[0]).toContain("updatedAt");
  });

  it("listIssueSummaries omits description from the GraphQL field set", async () => {
    const client = new LinearClient("test-key", "https://linear.test/graphql");
    const queries: string[] = [];

    vi.spyOn(client, "graphql").mockImplementation(async <T>(query: string): Promise<T> => {
      queries.push(query);
      return {
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      } as T;
    });

    await client.listIssueSummaries({ projectId: "proj-1" });

    expect(queries[0]).not.toContain("description");
    expect(queries[0]).toContain("identifier");
    expect(queries[0]).toContain("labels");
  });

  it("builds the same issue GraphQL filter in summary and full-detail queries", async () => {
    const client = new LinearClient("test-key", "https://linear.test/graphql");
    const graphqlCalls: Array<{ query: string; variables?: Record<string, unknown> }> = [];

    vi.spyOn(client, "graphql").mockImplementation(async <T>(
      query: string,
      variables?: Record<string, unknown>,
    ): Promise<T> => {
      graphqlCalls.push({ query, variables });
      return {
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      } as T;
    });

    const filter = {
      teamId: "team-1",
      projectId: "proj-1",
      parentId: "issue-parent",
      projectMilestoneId: "milestone-1",
      stateId: "state-1",
      assigneeId: "user-1",
      labelIds: ["label-a", "label-b"],
      first: 17,
    };

    await client.listIssues(filter);
    await client.listIssueSummaries(filter);

    const expectedFilter = {
      team: { id: { eq: "team-1" } },
      project: { id: { eq: "proj-1" } },
      parent: { id: { eq: "issue-parent" } },
      projectMilestone: { id: { eq: "milestone-1" } },
      state: { id: { eq: "state-1" } },
      assignee: { id: { eq: "user-1" } },
      labels: { some: { id: { in: ["label-a", "label-b"] } } },
    };

    const listIssuesCall = graphqlCalls.find((call) => call.query.includes("query ListIssues"));
    const summaryCall = graphqlCalls.find((call) => call.query.includes("query ListIssueSummaries"));

    expect(listIssuesCall?.variables?.filter).toEqual(expectedFilter);
    expect(summaryCall?.variables?.filter).toEqual(expectedFilter);
    expect(summaryCall?.variables?.first).toBe(listIssuesCall?.variables?.first);
  });

  it("builds the same document GraphQL filter in summary and full-detail queries", async () => {
    const client = new LinearClient("test-key", "https://linear.test/graphql");
    const graphqlCalls: Array<{ query: string; variables?: Record<string, unknown> }> = [];

    vi.spyOn(client, "graphql").mockImplementation(async <T>(
      query: string,
      variables?: Record<string, unknown>,
    ): Promise<T> => {
      graphqlCalls.push({ query, variables });
      return {
        documents: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      } as T;
    });

    const filter = {
      projectId: "proj-1",
      issueId: "issue-1",
      title: "M001-ROADMAP",
      first: 12,
    };

    await client.listDocuments(filter);
    await client.listDocumentSummaries(filter);

    const expectedFilter = {
      project: { id: { eq: "proj-1" } },
      issue: { id: { eq: "issue-1" } },
      title: { eq: "M001-ROADMAP" },
    };

    const listDocumentsCall = graphqlCalls.find((call) => call.query.includes("query ListDocuments"));
    const summaryCall = graphqlCalls.find((call) => call.query.includes("query ListDocumentSummaries"));

    expect(listDocumentsCall?.variables?.filter).toEqual(expectedFilter);
    expect(summaryCall?.variables?.filter).toEqual(expectedFilter);
    expect(summaryCall?.variables?.first).toBe(listDocumentsCall?.variables?.first);
  });

  it("normalizes label connection shape to a flat LinearLabel array in issue summaries", async () => {
    const client = new LinearClient("test-key", "https://linear.test/graphql");

    const label = {
      id: "label-1",
      name: "kata:slice",
      color: "#ffffff",
      isGroup: false,
    };

    vi.spyOn(client, "graphql").mockImplementation(async <T>(): Promise<T> => {
      return {
        issues: {
          nodes: [
            {
              id: "issue-1",
              identifier: "KAT-1",
              title: "Summary Issue",
              priority: 0,
              estimate: 3,
              url: "https://linear.app/kata-sh/issue/KAT-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              state: {
                id: "state-1",
                name: "Backlog",
                type: "backlog",
                color: "#000000",
                position: 1,
              },
              labels: { nodes: [label] },
              parent: null,
              project: { id: "proj-1", name: "Kata CLI" },
              projectMilestone: { id: "mile-1", name: "[M001] Milestone" },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      } as T;
    });

    const summaries = await client.listIssueSummaries({ projectId: "proj-1" });

    expect(summaries).toHaveLength(1);
    expect(Array.isArray(summaries[0].labels)).toBe(true);
    expect(summaries[0].labels).toEqual([label]);
  });
});
