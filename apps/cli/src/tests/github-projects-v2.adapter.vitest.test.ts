import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { resolveBackend } from "../backends/resolve-backend.js";
import { GithubProjectsV2Adapter } from "../backends/github-projects-v2/adapter.js";
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

describe("GithubProjectsV2Adapter", () => {
  it("validates Project v2 fields before creating the project issue", async () => {
    const client = createFakeGithubClient({
      projectFields: [{ id: "status-field-id", name: "Status", options: validStatusOptions() }],
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await expect(adapter.upsertProject({
      title: "Launch Kata",
      description: "Project brief",
    })).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      message: expect.stringContaining("GitHub Projects v2 project is missing required Kata fields"),
    });

    expect(client.rest).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/issues",
      }),
    );
  });

  it("creates project, milestone, slice, task, and artifact records through GitHub and Project v2", async () => {
    const client = createFakeGithubClient();
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    const project = await adapter.upsertProject({
      title: "Launch Kata",
      description: "Project brief",
    });
    const milestone = await adapter.createMilestone({
      title: "Phase A",
      goal: "Real backend",
    });
    const slice = await adapter.createSlice({
      milestoneId: milestone.id,
      title: "Wire adapter",
      goal: "Use GitHub",
    });
    const task = await adapter.createTask({
      sliceId: slice.id,
      title: "Set project fields",
      description: "Add item and update fields",
    });
    const artifact = await adapter.writeArtifact({
      scopeType: "slice",
      scopeId: slice.id,
      artifactType: "plan",
      title: "Slice plan",
      content: "# Plan",
      format: "markdown",
    });

    expect(project).toMatchObject({
      backend: "github",
      workspacePath: "/workspace",
      title: "Launch Kata",
    });
    expect(milestone).toMatchObject({ id: "M001", title: "Phase A", status: "active" });
    expect(slice).toMatchObject({ id: "S001", milestoneId: "M001", status: "backlog" });
    expect(task).toMatchObject({ id: "T001", sliceId: "S001", status: "backlog" });
    expect(artifact).toMatchObject({
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      content: "# Plan",
    });

    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/milestones",
        body: expect.objectContaining({
          title: "[M001] Phase A",
          description: "Real backend",
        }),
      }),
    );
    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/issues/3/comments",
        body: expect.objectContaining({
          body: expect.stringContaining("<!-- kata:artifact "),
        }),
      }),
    );
    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/issues/3/sub_issues",
        body: { sub_issue_id: 4 },
      }),
    );

    const addCalls = client.graphql.mock.calls.filter(([input]) => input.query.includes("addProjectV2ItemById"));
    expect(addCalls).toHaveLength(4);
    expect(addCalls.map(([input]) => input.variables.contentId)).toEqual([
      "issue-node-1",
      "issue-node-2",
      "issue-node-3",
      "issue-node-4",
    ]);

    const updateCalls = client.graphql.mock.calls.filter(([input]) =>
      input.query.includes("updateProjectV2ItemFieldValue")
    );
    expect(updateCalls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            variables: expect.objectContaining({
              itemId: "project-item-1",
              fieldId: "kata-type-field-id",
              value: { text: "Project" },
            }),
          }),
        ],
        [
          expect.objectContaining({
            variables: expect.objectContaining({
              itemId: "project-item-2",
              fieldId: "kata-id-field-id",
              value: { text: "M001" },
            }),
          }),
        ],
        [
          expect.objectContaining({
            variables: expect.objectContaining({
              itemId: "project-item-3",
              fieldId: "kata-parent-id-field-id",
              value: { text: "M001" },
            }),
          }),
        ],
        [
          expect.objectContaining({
            variables: expect.objectContaining({
              itemId: "project-item-4",
              fieldId: "status-field-id",
              value: { singleSelectOptionId: "status-backlog" },
            }),
          }),
        ],
      ]),
    );
  });

  it("rediscovers marker issues before writing artifacts from a fresh adapter", async () => {
    const client = createFakeGithubClient({
      issues: [
        {
          id: 99,
          node_id: "issue-node-99",
          number: 42,
          title: "[S001] Existing Slice",
          body: '<!-- kata:entity {"kataId":"S001","type":"Slice","parentId":"M001"} -->\nExisting slice',
          state: "open",
          html_url: "https://github.test/kata-sh/uat/issues/42",
        },
      ],
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    const artifact = await adapter.writeArtifact({
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      title: "Existing slice plan",
      content: "Rediscovered",
      format: "markdown",
    });

    expect(artifact.provenance.backendId).toBe("comment:1");
    expect(client.rest).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/issues",
      }),
    );
    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/repos/kata-sh/uat/issues?state=all&per_page=100&page=1",
      }),
    );
    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/issues/42/comments",
      }),
    );
  });

  it("rediscovers updated slice status from marker metadata", async () => {
    const client = createFakeGithubClient({
      issues: [
        {
          id: 98,
          node_id: "issue-node-98",
          number: 41,
          title: "[S001] Existing Slice",
          body: '<!-- kata:entity {"kataId":"S001","type":"Slice","parentId":"M001"} -->\nExisting slice',
          state: "open",
          html_url: "https://github.test/kata-sh/uat/issues/41",
        },
      ],
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await adapter.updateSliceStatus({ sliceId: "S001", status: "agent_review" });

    const freshAdapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });
    await expect(freshAdapter.listSlices({ milestoneId: "M001" })).resolves.toMatchObject([
      { id: "S001", status: "agent_review" },
    ]);
  });

  it("rediscovers updated task status and verification state from marker metadata", async () => {
    const client = createFakeGithubClient({
      issues: [
        {
          id: 97,
          node_id: "issue-node-97",
          number: 40,
          title: "[T001] Existing Task",
          body: '<!-- kata:entity {"kataId":"T001","type":"Task","parentId":"S001"} -->\nExisting task',
          state: "open",
          html_url: "https://github.test/kata-sh/uat/issues/40",
        },
      ],
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await adapter.updateTaskStatus({ taskId: "T001", status: "in_progress", verificationState: "verified" });

    const freshAdapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });
    await expect(freshAdapter.listTasks({ sliceId: "S001" })).resolves.toMatchObject([
      { id: "T001", status: "in_progress", verificationState: "verified" },
    ]);
  });

  it("keeps the first duplicate marker issue when writing artifacts", async () => {
    const client = createFakeGithubClient({
      issues: [
        {
          id: 96,
          node_id: "issue-node-96",
          number: 39,
          title: "[S001] Newer Slice",
          body: '<!-- kata:entity {"kataId":"S001","type":"Slice","parentId":"M001"} -->\nNewer slice',
          state: "open",
          html_url: "https://github.test/kata-sh/uat/issues/39",
        },
        {
          id: 95,
          node_id: "issue-node-95",
          number: 38,
          title: "[S001] Stale Duplicate Slice",
          body: '<!-- kata:entity {"kataId":"S001","type":"Slice","parentId":"M001"} -->\nStale duplicate',
          state: "open",
          html_url: "https://github.test/kata-sh/uat/issues/38",
        },
      ],
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    const slices = await adapter.listSlices({ milestoneId: "M001" });
    expect(slices).toMatchObject([{ id: "S001", title: "Newer Slice" }]);

    await adapter.writeArtifact({
      scopeType: "slice",
      scopeId: "S001",
      artifactType: "plan",
      title: "Slice plan",
      content: "Prefer first issue",
      format: "markdown",
    });

    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/issues/39/comments",
      }),
    );
    expect(client.rest).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/issues/38/comments",
      }),
    );
  });
});

describe("resolveBackend GitHub token selection", () => {
  it("uses GH_TOKEN when GITHUB_TOKEN is empty", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-github-token-"));
    const workspaceDir = join(tmp, "repo");

    try {
      mkdirSync(join(workspaceDir, ".kata"), { recursive: true });
      writeFileSync(
        join(workspaceDir, ".kata", "preferences.md"),
        `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata-mono
  stateMode: projects_v2
  githubProjectNumber: 12
---
`,
        "utf8",
      );

      await expect(
        resolveBackend({
          workspacePath: workspaceDir,
          env: {
            GITHUB_TOKEN: "",
            GH_TOKEN: "ghp_test",
          },
        }),
      ).resolves.toBeInstanceOf(GithubProjectsV2Adapter);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

function createFakeGithubClient(input: { issues?: any[]; projectFields?: any[] } = {}) {
  const issues = [...(input.issues ?? [])];
  const commentsByIssue = new Map<number, any[]>();
  let nextIssueNumber = issues.reduce((max, issue) => Math.max(max, Number(issue.number) || 0), 0) + 1;
  let nextProjectItemNumber = 1;
  let nextCommentId = 1;

  return {
    graphql: vi.fn(async (request: any) => {
      if (request.query.includes("LoadKataProjectFields")) {
        return {
          organization: {
            projectV2: {
              id: "project-id",
              fields: {
                nodes: input.projectFields ?? [
                  { id: "status-field-id", name: "Status", options: validStatusOptions() },
                  { id: "kata-type-field-id", name: "Kata Type" },
                  { id: "kata-id-field-id", name: "Kata ID" },
                  { id: "kata-parent-id-field-id", name: "Kata Parent ID" },
                  { id: "kata-artifact-scope-field-id", name: "Kata Artifact Scope" },
                ],
              },
            },
          },
        };
      }

      if (request.query.includes("addProjectV2ItemById")) {
        return {
          addProjectV2ItemById: {
            item: { id: `project-item-${nextProjectItemNumber++}` },
          },
        };
      }

      return {
        updateProjectV2ItemFieldValue: {
          projectV2Item: { id: request.variables.itemId },
        },
      };
    }),
    rest: vi.fn(async (request: any) => {
      if (request.method === "GET" && request.path.startsWith("/repos/kata-sh/uat/issues?")) {
        const page = Number(new URL(`https://example.test${request.path}`).searchParams.get("page") ?? "1");
        return page === 1 ? issues : [];
      }

      const commentsMatch = request.path.match(/^\/repos\/kata-sh\/uat\/issues\/(\d+)\/comments(?:\?.*)?$/);
      if (request.method === "GET" && commentsMatch) {
        return commentsByIssue.get(Number(commentsMatch[1])) ?? [];
      }
      if (request.method === "POST" && commentsMatch) {
        const issueNumber = Number(commentsMatch[1]);
        const comment = { id: nextCommentId++, body: request.body.body };
        commentsByIssue.set(issueNumber, [...(commentsByIssue.get(issueNumber) ?? []), comment]);
        return comment;
      }

      const subIssuesMatch = request.path.match(/^\/repos\/kata-sh\/uat\/issues\/(\d+)\/sub_issues$/);
      if (request.method === "POST" && subIssuesMatch) {
        return {
          parent_issue_number: Number(subIssuesMatch[1]),
          sub_issue_id: request.body.sub_issue_id,
        };
      }

      if (request.method === "POST" && request.path === "/repos/kata-sh/uat/issues") {
        const number = nextIssueNumber++;
        const issue = {
          id: number,
          node_id: `issue-node-${number}`,
          number,
          title: request.body.title,
          body: request.body.body,
          state: "open",
          html_url: `https://github.test/kata-sh/uat/issues/${number}`,
        };
        issues.push(issue);
        return issue;
      }

      if (request.method === "POST" && request.path === "/repos/kata-sh/uat/milestones") {
        return {
          number: 1,
          title: request.body.title,
          description: request.body.description,
          state: "open",
        };
      }

      const issuePatchMatch = request.path.match(/^\/repos\/kata-sh\/uat\/issues\/(\d+)$/);
      if (request.method === "PATCH" && issuePatchMatch) {
        const issueNumber = Number(issuePatchMatch[1]);
        const issueIndex = issues.findIndex((issue) => issue.number === issueNumber);
        if (issueIndex === -1) {
          throw new Error(`Unhandled fake GitHub issue patch: ${request.method} ${request.path}`);
        }
        issues[issueIndex] = {
          ...issues[issueIndex],
          ...request.body,
        };
        return issues[issueIndex];
      }

      throw new Error(`Unhandled fake GitHub request: ${request.method} ${request.path}`);
    }),
  };
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
