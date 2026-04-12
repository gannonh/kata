import { describe, it, expect } from "vitest";
import { LinearClient } from "../linear-client.js";

describe("LinearClient.listIssues", () => {
  it("includes projectMilestone filter when projectMilestoneId is provided", async () => {
    const client = new LinearClient("test-key", "https://linear.test/graphql");
    const graphqlCalls: Array<Record<string, unknown> | undefined> = [];

    (client as any).graphql = async (_query: string, variables?: Record<string, unknown>) => {
      graphqlCalls.push(variables);
      return {
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    };

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

    (client as any).graphql = async (_query: string, variables?: Record<string, unknown>) => {
      graphqlCalls.push(variables);
      return {
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    };

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

    (client as any).graphql = async (query: string) => {
      queries.push(query);
      return {
        documents: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    };

    await (client as any).listDocumentSummaries({ projectId: "proj-1" });

    expect(queries[0]).not.toContain("content");
    expect(queries[0]).toContain("title");
    expect(queries[0]).toContain("updatedAt");
  });

  it("listIssueSummaries omits description from the GraphQL field set", async () => {
    const client = new LinearClient("test-key", "https://linear.test/graphql");
    const queries: string[] = [];

    (client as any).graphql = async (query: string) => {
      queries.push(query);
      return {
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    };

    await (client as any).listIssueSummaries({ projectId: "proj-1" });

    expect(queries[0]).not.toContain("description");
    expect(queries[0]).toContain("identifier");
    expect(queries[0]).toContain("labels");
  });
});
