import { describe, expect, it, vi } from "vitest";

import {
  formatLinearArtifactMarker,
  parseLinearArtifactMarker,
  upsertLinearIssueArtifactComment,
  upsertLinearMilestoneDocument,
} from "../backends/linear/artifacts.js";

describe("Linear artifacts", () => {
  it("formats and parses artifact markers", () => {
    const body = formatLinearArtifactMarker({ scopeType: "slice", scopeId: "S001", artifactType: "plan", content: "# Plan" });
    expect(parseLinearArtifactMarker(body)).toEqual({ scopeType: "slice", scopeId: "S001", artifactType: "plan", content: "# Plan" });
  });

  it("returns null for malformed artifact markers", () => {
    expect(parseLinearArtifactMarker("<!-- kata:artifact {bad json} -->\ncontent")).toBeNull();
    expect(parseLinearArtifactMarker("plain comment")).toBeNull();
    expect(parseLinearArtifactMarker('<!-- kata:artifact {"scopeType":"slice","scopeId":"","artifactType":"plan"} -->')).toBeNull();
  });

  it("parses artifact markers with CRLF newlines", () => {
    const body = '<!-- kata:artifact {"scopeType":"slice","scopeId":"S001","artifactType":"plan"} -->\r\n# Plan';
    expect(parseLinearArtifactMarker(body)).toEqual({
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "# Plan",
    });
  });

  it("updates an existing Linear issue artifact comment", async () => {
    const client = {
      graphql: vi.fn(async (request: any) => {
        if (request.query.includes("LinearKataIssueComments")) {
          return { issue: { comments: { nodes: [{ id: "comment-1", body: formatLinearArtifactMarker({ scopeType: "slice", scopeId: "S001", artifactType: "plan", content: "old" }) }], pageInfo: { hasNextPage: false, endCursor: null } } } };
        }
        return { commentUpdate: { success: true, comment: { id: "comment-1", body: request.variables.input.body } } };
      }),
      paginate: vi.fn(async (input: any) => {
        const data = await client.graphql({ query: input.query, variables: input.variables });
        return input.selectConnection(data)?.nodes ?? [];
      }),
    };

    const result = await upsertLinearIssueArtifactComment({ client: client as any, issueId: "issue-1", scopeType: "slice", scopeId: "S001", artifactType: "plan", content: "new" });
    expect(result.backendId).toBe("comment:comment-1");
    expect(result.body).toContain("new");
    expect(client.graphql).toHaveBeenCalledWith(expect.objectContaining({ query: expect.stringContaining("commentUpdate") }));
  });

  it("creates a Linear issue artifact comment when none exists", async () => {
    const client = {
      graphql: vi.fn(async (request: any) => {
        if (request.query.includes("LinearKataIssueComments")) {
          return { issue: { comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } };
        }
        return { commentCreate: { success: true, comment: { id: "comment-2", body: request.variables.input.body } } };
      }),
      paginate: vi.fn(async (input: any) => {
        const data = await client.graphql({ query: input.query, variables: input.variables });
        return input.selectConnection(data)?.nodes ?? [];
      }),
    };

    const result = await upsertLinearIssueArtifactComment({ client: client as any, issueId: "issue-1", scopeType: "task", scopeId: "T001", artifactType: "verification", content: "verified" });
    expect(result.backendId).toBe("comment:comment-2");
    expect(client.graphql).toHaveBeenCalledWith(expect.objectContaining({ query: expect.stringContaining("commentCreate") }));
  });

  it("updates an existing milestone document by marker", async () => {
    const client = {
      graphql: vi.fn(async (request: any) => {
        if (request.query.includes("LinearKataProjectDocuments")) {
          return { project: { documents: { nodes: [{ id: "doc-1", title: "M001 Requirements", content: formatLinearArtifactMarker({ scopeType: "milestone", scopeId: "M001", artifactType: "requirements", content: "old" }), updatedAt: "2026-05-06T00:00:00.000Z" }], pageInfo: { hasNextPage: false, endCursor: null } } } };
        }
        return { documentUpdate: { success: true, document: { id: "doc-1", title: request.variables.input.title, content: request.variables.input.content, updatedAt: "2026-05-06T00:00:00.000Z" } } };
      }),
      paginate: vi.fn(async (input: any) => {
        const data = await client.graphql({ query: input.query, variables: input.variables });
        return input.selectConnection(data)?.nodes ?? [];
      }),
    };

    const result = await upsertLinearMilestoneDocument({ client: client as any, projectId: "project-1", scopeId: "M001", artifactType: "requirements", title: "Requirements", content: "# Requirements" });
    expect(result.backendId).toBe("document:doc-1");
    expect(result.body).toContain("# Requirements");
  });
});
