import { describe, expect, it, vi } from "vitest";
import {
  formatArtifactComment,
  parseArtifactComment,
  upsertArtifactComment,
} from "../backends/github-projects-v2/artifacts.js";

describe("GitHub artifact comments", () => {
  it("formats and parses artifact comments", () => {
    const comment = formatArtifactComment({
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "# Plan",
    });

    expect(parseArtifactComment(comment)).toEqual({
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "# Plan",
    });
  });

  it("returns null for malformed artifact markers", () => {
    expect(parseArtifactComment("<!-- kata:artifact {bad json} -->\ncontent")).toBeNull();
    expect(
      parseArtifactComment('<!-- kata:artifact {"scopeType":"slice","scopeId":"","artifactType":"plan"} -->\ncontent'),
    ).toBeNull();
    expect(
      parseArtifactComment(
        '<!-- kata:artifact {"scopeType":"slice","scopeId":"S001","artifactType":"unknown"} -->\ncontent',
      ),
    ).toBeNull();
  });

  it("returns null when marker-like content is not on the first line", () => {
    const body = [
      "regular comment body",
      formatArtifactComment({
        scopeType: "slice",
        scopeId: "S001",
        artifactType: "plan",
        content: "not a marker",
      }),
    ].join("\n");

    expect(parseArtifactComment(body)).toBeNull();
  });

  it("updates an existing artifact comment instead of duplicating it", async () => {
    const client = {
      rest: vi.fn(async (request: any) => {
        if (request.method === "GET") {
          return [
            {
              id: 10,
              body: formatArtifactComment({
                scopeType: "slice",
                scopeId: "S001",
                artifactType: "plan",
                content: "old",
              }),
            },
          ];
        }

        return { id: 10, body: request.body.body };
      }),
    };

    const result = await upsertArtifactComment({
      client: client as any,
      owner: "kata-sh",
      repo: "uat",
      issueNumber: 5,
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "new",
    });

    expect(result.backendId).toBe("comment:10");
    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        path: "/repos/kata-sh/uat/issues/comments/10",
      }),
    );
  });

  it("updates an existing artifact comment found on the second page", async () => {
    const pageOne = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      body: `non artifact ${index + 1}`,
    }));
    const client = {
      rest: vi.fn(async (request: any) => {
        if (
          request.method === "GET" &&
          (request.path === "/repos/kata-sh/uat/issues/5/comments" || request.path.endsWith("page=1"))
        ) {
          return pageOne;
        }

        if (request.method === "GET" && request.path.endsWith("page=2")) {
          return [
            {
              id: 201,
              body: formatArtifactComment({
                scopeType: "slice",
                scopeId: "S001",
                artifactType: "plan",
                content: "old",
              }),
            },
          ];
        }

        return { id: 201, body: request.body.body };
      }),
    };

    const result = await upsertArtifactComment({
      client: client as any,
      owner: "kata-sh",
      repo: "uat",
      issueNumber: 5,
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "new",
    });

    expect(result.backendId).toBe("comment:201");
    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        path: "/repos/kata-sh/uat/issues/comments/201",
      }),
    );
    expect(client.rest).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("creates a new artifact comment when no matching marker exists", async () => {
    const client = {
      rest: vi.fn(async (request: any) => {
        if (request.method === "GET") {
          return [
            {
              id: 9,
              body: formatArtifactComment({
                scopeType: "slice",
                scopeId: "S002",
                artifactType: "plan",
                content: "other",
              }),
            },
          ];
        }

        return { id: 11, body: request.body.body };
      }),
    };

    const result = await upsertArtifactComment({
      client: client as any,
      owner: "kata-sh",
      repo: "uat",
      issueNumber: 5,
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "new",
    });

    expect(result.backendId).toBe("comment:11");
    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/issues/5/comments",
      }),
    );
  });

  it("skips comments with null or missing bodies", async () => {
    const client = {
      rest: vi.fn(async (request: any) => {
        if (request.method === "GET") {
          return [
            { id: 7, body: null },
            { id: 8 },
            {
              id: 9,
              body: formatArtifactComment({
                scopeType: "slice",
                scopeId: "S001",
                artifactType: "plan",
                content: "old",
              }),
            },
          ];
        }

        return { id: 9, body: request.body.body };
      }),
    };

    const result = await upsertArtifactComment({
      client: client as any,
      owner: "kata-sh",
      repo: "uat",
      issueNumber: 5,
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "new",
    });

    expect(result.backendId).toBe("comment:9");
    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        path: "/repos/kata-sh/uat/issues/comments/9",
      }),
    );
  });
});
