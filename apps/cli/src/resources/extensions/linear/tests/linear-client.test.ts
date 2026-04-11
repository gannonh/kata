import assert from "node:assert/strict";
import { LinearClient } from "../linear-client.ts";

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

    assert.equal(graphqlCalls.length, 1);
    assert.deepEqual(graphqlCalls[0]?.filter, {
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

    assert.equal(graphqlCalls.length, 1);
    assert.deepEqual(graphqlCalls[0]?.filter, {
      project: { id: { eq: "proj-1" } },
    });
  });
});
