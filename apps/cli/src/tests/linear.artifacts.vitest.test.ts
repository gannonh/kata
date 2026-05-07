import { describe, expect, it, vi } from "vitest";

import {
  formatLinearArtifactMarker,
  parseLinearArtifactMarker,
  upsertLinearIssueArtifactComment,
  upsertLinearMilestoneDocument,
} from "../backends/linear/artifacts.js";
import type { createLinearClient } from "../backends/linear/client.js";

type LinearClient = ReturnType<typeof createLinearClient>;
type FakeGraphqlRequest = {
  variables: {
    input: {
      body?: string;
      projectId?: string;
      title?: string;
      content?: string;
    };
  };
};

describe("Linear artifact markers", () => {
  it("formats and parses artifact markers", () => {
    const body = formatLinearArtifactMarker({
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "# Plan",
    });

    expect(parseLinearArtifactMarker(body)).toEqual({
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "# Plan",
    });
  });

  it("returns null for malformed artifact markers", () => {
    expect(parseLinearArtifactMarker("<!-- kata:artifact {bad json} -->\ncontent")).toBeNull();
    expect(parseLinearArtifactMarker("plain comment")).toBeNull();
    expect(
      parseLinearArtifactMarker(
        '<!-- kata:artifact {"scopeType":"slice","scopeId":" ","artifactType":"plan"} -->\ncontent',
      ),
    ).toBeNull();
    expect(
      parseLinearArtifactMarker(
        '<!-- kata:artifact {"scopeType":"unknown","scopeId":"S001","artifactType":"plan"} -->\ncontent',
      ),
    ).toBeNull();
    expect(
      parseLinearArtifactMarker(
        '<!-- kata:artifact {"scopeType":"slice","scopeId":"S001","artifactType":"unknown"} -->\ncontent',
      ),
    ).toBeNull();
  });
});

describe("Linear artifact upserts", () => {
  it("updates an existing issue comment when the artifact marker matches", async () => {
    const client = {
      paginate: vi.fn(async () => [
        {
          id: "comment-1",
          body: formatLinearArtifactMarker({
            scopeType: "slice",
            scopeId: "S001",
            artifactType: "plan",
            content: "old",
          }),
        },
      ]),
      graphql: vi.fn(async (request: FakeGraphqlRequest) => ({
        commentUpdate: {
          success: true,
          comment: {
            id: "comment-1",
            body: request.variables.input.body,
            updatedAt: "2026-05-06T12:00:00.000Z",
          },
        },
      })),
    };

    const result = await upsertLinearIssueArtifactComment({
      client: client as unknown as LinearClient,
      issueId: "issue-1",
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "new",
    });

    expect(result).toMatchObject({
      backendId: "comment:comment-1",
      body: expect.stringContaining("new"),
    });
    expect(client.paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { issueId: "issue-1", first: 100 },
      }),
    );
    expect(client.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("commentUpdate"),
        variables: {
          id: "comment-1",
          input: {
            body: expect.stringContaining("new"),
          },
        },
      }),
    );
  });

  it("creates an issue comment when none exists", async () => {
    const client = {
      paginate: vi.fn(async () => [
        {
          id: "comment-1",
          body: formatLinearArtifactMarker({
            scopeType: "slice",
            scopeId: "S002",
            artifactType: "plan",
            content: "other",
          }),
        },
      ]),
      graphql: vi.fn(async (request: FakeGraphqlRequest) => ({
        commentCreate: {
          success: true,
          comment: {
            id: "comment-2",
            body: request.variables.input.body,
            updatedAt: "2026-05-06T12:00:00.000Z",
          },
        },
      })),
    };

    const result = await upsertLinearIssueArtifactComment({
      client: client as unknown as LinearClient,
      issueId: "issue-1",
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "new",
    });

    expect(result.backendId).toBe("comment:comment-2");
    expect(client.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("commentCreate"),
        variables: {
          input: {
            issueId: "issue-1",
            body: expect.stringContaining("new"),
          },
        },
      }),
    );
  });

  it("updates an existing milestone document by artifact marker without keeping marker content", async () => {
    const client = {
      paginate: vi.fn(async () => [
        {
          id: "document-1",
          title: "M001 Plan",
          content: formatLinearArtifactMarker({
            scopeType: "milestone",
            scopeId: "M001",
            artifactType: "plan",
            content: "old",
          }),
          updatedAt: "2026-05-06T11:00:00.000Z",
        },
      ]),
      graphql: vi.fn(async (request: FakeGraphqlRequest) => ({
        documentUpdate: {
          success: true,
          document: {
            id: "document-1",
            title: request.variables.input.title,
            content: request.variables.input.content,
            updatedAt: "2026-05-06T12:00:00.000Z",
          },
        },
      })),
    };

    const result = await upsertLinearMilestoneDocument({
      client: client as unknown as LinearClient,
      projectId: "project-1",
      scopeId: "M001",
      artifactType: "plan",
      title: "M001 Plan",
      content: "new",
    });

    expect(result).toEqual({
      backendId: "document:document-1",
      body: "new",
      title: "M001 Plan",
      updatedAt: "2026-05-06T12:00:00.000Z",
    });
    expect(client.paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { projectId: "project-1", first: 100 },
      }),
    );
    expect(client.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("documentUpdate"),
        variables: {
          id: "document-1",
          input: {
            title: "M001 Plan",
            content: "new",
          },
        },
      }),
    );
  });

  it("updates an existing milestone document by title without marker content", async () => {
    const client = {
      paginate: vi.fn(async () => [
        {
          id: "document-1",
          title: "M001 Plan",
          content: "old",
          updatedAt: "2026-05-06T11:00:00.000Z",
        },
      ]),
      graphql: vi.fn(async (request: FakeGraphqlRequest) => ({
        documentUpdate: {
          success: true,
          document: {
            id: "document-1",
            title: request.variables.input.title,
            content: request.variables.input.content,
            updatedAt: "2026-05-06T12:00:00.000Z",
          },
        },
      })),
    };

    const result = await upsertLinearMilestoneDocument({
      client: client as unknown as LinearClient,
      projectId: "project-1",
      scopeId: "M001",
      artifactType: "plan",
      title: "M001 Plan",
      content: "new",
    });

    expect(result).toEqual({
      backendId: "document:document-1",
      body: "new",
      title: "M001 Plan",
      updatedAt: "2026-05-06T12:00:00.000Z",
    });
  });

  it("creates a milestone document without marker content or duplicate title prefix", async () => {
    const client = {
      paginate: vi.fn(async () => []),
      graphql: vi.fn(async (request: FakeGraphqlRequest) => ({
        documentCreate: {
          success: true,
          document: {
            id: "document-2",
            title: request.variables.input.title,
            content: request.variables.input.content,
            updatedAt: "2026-05-06T12:00:00.000Z",
          },
        },
      })),
    };

    const result = await upsertLinearMilestoneDocument({
      client: client as unknown as LinearClient,
      projectId: "project-1",
      scopeId: "M001",
      artifactType: "plan",
      title: "M001 Plan",
      content: "new",
    });

    expect(result).toEqual({
      backendId: "document:document-2",
      body: "new",
      title: "M001 Plan",
      updatedAt: "2026-05-06T12:00:00.000Z",
    });
    expect(client.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("documentCreate"),
        variables: {
          input: {
            projectId: "project-1",
            title: "M001 Plan",
            content: "new",
          },
        },
      }),
    );
  });

  it("rejects failed or malformed mutation payloads", async () => {
    await expect(
      upsertLinearIssueArtifactComment({
        client: {
          paginate: vi.fn(async () => []),
          graphql: vi.fn(async () => ({
            commentCreate: {
              success: true,
              comment: { id: " " },
            },
          })),
        } as unknown as LinearClient,
        issueId: "issue-1",
        scopeType: "slice",
        scopeId: "S001",
        artifactType: "plan",
        content: "new",
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Linear artifact comment create failed: mutation response did not include a comment id.",
    });

    await expect(
      upsertLinearIssueArtifactComment({
        client: {
          paginate: vi.fn(async () => [
            {
              id: "comment-1",
              body: formatLinearArtifactMarker({
                scopeType: "slice",
                scopeId: "S001",
                artifactType: "plan",
                content: "old",
              }),
            },
          ]),
          graphql: vi.fn(async () => ({
            commentUpdate: {
              success: false,
              comment: { id: "comment-1" },
            },
          })),
        } as unknown as LinearClient,
        issueId: "issue-1",
        scopeType: "slice",
        scopeId: "S001",
        artifactType: "plan",
        content: "new",
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Linear artifact comment update failed: mutation reported success=false.",
    });

    await expect(
      upsertLinearMilestoneDocument({
        client: {
          paginate: vi.fn(async () => []),
          graphql: vi.fn(async () => ({
            documentCreate: {
              success: false,
              document: { id: "document-1" },
            },
          })),
        } as unknown as LinearClient,
        projectId: "project-1",
        scopeId: "M001",
        artifactType: "plan",
        title: "Plan",
        content: "new",
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Linear artifact document create failed: mutation reported success=false.",
    });

    await expect(
      upsertLinearMilestoneDocument({
        client: {
          paginate: vi.fn(async () => [
            {
              id: "document-1",
              content: formatLinearArtifactMarker({
                scopeType: "milestone",
                scopeId: "M001",
                artifactType: "plan",
                content: "old",
              }),
            },
          ]),
          graphql: vi.fn(async () => ({
            documentUpdate: {
              success: true,
              document: null,
            },
          })),
        } as unknown as LinearClient,
        projectId: "project-1",
        scopeId: "M001",
        artifactType: "plan",
        title: "Plan",
        content: "new",
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Linear artifact document update failed: mutation response did not include a document id.",
    });
  });
});
