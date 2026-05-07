import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { resolveBackend } from "../backends/resolve-backend.js";
import { GithubProjectsV2Adapter } from "../backends/github-projects-v2/adapter.js";
import { createKataDomainApi } from "../domain/service.js";
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

  it("does not require superfluous dependency text fields", async () => {
    const client = createFakeGithubClient({ projectFields: validProjectFields() });
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
    })).resolves.toMatchObject({
      backend: "github",
      title: "Launch Kata",
    });
  });

  it("requires Status to contain every Kata workflow option", async () => {
    const client = createFakeGithubClient({
      projectFields: validProjectFields({
        statusOptions: validStatusOptions().filter((option) => option.name !== "Done"),
      }),
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
      message: expect.stringContaining('Status" is missing option "Done"'),
    });
  });

  it("warns when Project v2 items are missing required Kata field values", async () => {
    const client = createFakeGithubClient({
      projectItems: [
        projectItem({
          itemId: "project-item-1",
          issueNodeId: "issue-node-1",
          issueId: 1,
          issueNumber: 1,
          title: "[S001] Prepare launch",
          body: "Slice work",
          state: "open",
          kataId: "S001",
          kataType: "",
        }),
      ],
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await expect(adapter.checkHealth()).resolves.toMatchObject({
      ok: false,
      backend: "github",
      checks: expect.arrayContaining([
        expect.objectContaining({
          name: "project-item-fields",
          status: "warn",
          message: expect.stringContaining("1 Project v2 item is missing required Kata field values"),
        }),
      ]),
    });
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
        path: "/repos/kata-sh/uat/issues",
        body: expect.objectContaining({
          title: "[S001] Wire adapter",
          milestone: 1,
        }),
      }),
    );
    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/issues",
        body: expect.objectContaining({
          title: "[T001] Set project fields",
          milestone: 1,
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
              fieldId: "kata-verification-state-field-id",
              value: { text: "pending" },
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

  it("writes user-facing issue bodies without kata entity metadata", async () => {
    const client = createFakeGithubClient();
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await adapter.upsertProject({
      title: "Launch Kata",
      description: "Project brief",
    });
    const milestone = await adapter.createMilestone({
      title: "Phase A",
      goal: "Milestone goal",
    });
    const slice = await adapter.createSlice({
      milestoneId: milestone.id,
      title: "Slice",
      goal: "Slice goal",
    });
    const task = await adapter.createTask({
      sliceId: slice.id,
      title: "Task",
      description: "Task details",
    });
    await adapter.createIssue({
      title: "Standalone",
      design: "Design body",
      plan: "Plan body",
    });
    await adapter.updateTaskStatus({
      taskId: task.id,
      status: "done",
      verificationState: "verified",
    });

    const issueBodies = client.rest.mock.calls
      .map(([request]) => request)
      .filter((request) => request.method === "POST" && request.path === "/repos/kata-sh/uat/issues")
      .map((request) => request.body.body);
    expect(issueBodies).toEqual([
      "Project brief",
      "Milestone goal",
      "Slice goal",
      "Task details",
      "# Design\n\nDesign body\n\n# Plan\n\nPlan body",
    ]);

    const taskStatusPatch = client.rest.mock.calls
      .map(([request]) => request)
      .find((request) => request.method === "PATCH" && request.path === "/repos/kata-sh/uat/issues/4");
    expect(taskStatusPatch?.body).toEqual({ state: "closed" });
  });

  it("creates native GitHub dependencies when creating blocked slices", async () => {
    const client = createFakeGithubClient();
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    const milestone = await adapter.createMilestone({
      title: "Phase A",
      goal: "Real backend",
    });
    const blocker = await adapter.createSlice({
      milestoneId: milestone.id,
      title: "Foundation",
      goal: "First slice",
    });
    const slice = await adapter.createSlice({
      milestoneId: milestone.id,
      title: "Wire dependencies",
      goal: "Use native relationships",
      blockedBy: [blocker.id, "[S001]", "bad"],
    });

    expect(slice).toMatchObject({
      id: "S002",
      blockedBy: ["S001"],
      blocking: [],
    });
    await expect(adapter.listSlices({ milestoneId: milestone.id })).resolves.toMatchObject([
      { id: "S001", blockedBy: [], blocking: ["S002"] },
      { id: "S002", blockedBy: ["S001"], blocking: [] },
    ]);
    expect(client.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("AddKataIssueBlockedBy"),
        variables: {
          issueId: "issue-node-3",
          blockingIssueId: "issue-node-2",
        },
      }),
    );
  });

  it("reflects native GitHub issue dependencies in project snapshots", async () => {
    const client = createFakeGithubClient({
      issues: [
        {
          id: 1,
          node_id: "issue-node-1",
          number: 1,
          title: "[M001] Existing Milestone",
          body: '<!-- kata:entity {"kataId":"M001","type":"Milestone"} -->\nExisting milestone',
          state: "open",
          html_url: "https://github.test/kata-sh/uat/issues/1",
          milestone: { number: 1 },
        },
        {
          id: 2,
          node_id: "issue-node-2",
          number: 2,
          title: "[S001] Foundation",
          body: '<!-- kata:entity {"kataId":"S001","type":"Slice","parentId":"M001"} -->\nFoundation slice',
          state: "open",
          html_url: "https://github.test/kata-sh/uat/issues/2",
          milestone: { number: 1 },
        },
        {
          id: 3,
          node_id: "issue-node-3",
          number: 3,
          title: "[S002] Dependent",
          body: '<!-- kata:entity {"kataId":"S002","type":"Slice","parentId":"M001"} -->\nDependent slice',
          state: "open",
          html_url: "https://github.test/kata-sh/uat/issues/3",
          milestone: { number: 1 },
        },
        {
          id: 4,
          node_id: "issue-node-4",
          number: 4,
          title: "[S003] Empty Fields",
          body: '<!-- kata:entity {"kataId":"S003","type":"Slice","parentId":"M001"} -->\nNo dependency fields',
          state: "open",
          html_url: "https://github.test/kata-sh/uat/issues/4",
          milestone: { number: 1 },
        },
      ],
      projectItems: [
        projectItem({
          itemId: "project-item-1",
          issueNodeId: "issue-node-1",
          issueNumber: 1,
          kataId: "M001",
          kataType: "Milestone",
          artifactScope: "M001",
          status: "Todo",
        }),
        projectItem({
          itemId: "project-item-2",
          issueNodeId: "issue-node-2",
          issueNumber: 2,
          kataId: "S001",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S001",
          status: "Backlog",
        }),
        projectItem({
          itemId: "project-item-3",
          issueNodeId: "issue-node-3",
          issueNumber: 3,
          kataId: "S002",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S002",
          status: "In Progress",
        }),
        projectItem({
          itemId: "project-item-4",
          issueNodeId: "issue-node-4",
          issueNumber: 4,
          kataId: "S003",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S003",
        }),
      ],
      nativeDependencies: [{ blocked: 3, blocker: 2 }],
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });
    const api = createKataDomainApi(adapter);

    const snapshot = await api.project.getSnapshot();

    expect(snapshot.slices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "S001", blockedBy: [], blocking: ["S002"], status: "backlog" }),
        expect.objectContaining({ id: "S002", blockedBy: ["S001"], blocking: [], status: "in_progress" }),
        expect.objectContaining({ id: "S003", blockedBy: [], blocking: [] }),
      ]),
    );
    expect(snapshot.roadmap.sliceDependencies).toMatchObject({
      S001: { blockedBy: [], blocking: ["S002"] },
      S002: { blockedBy: ["S001"], blocking: [] },
    });
    expect(client.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("LoadKataProjectItemFields"),
      }),
    );
    expect(client.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining('fieldValueByName(name: "Status")'),
      }),
    );
  });

  it("derives task parents from native GitHub sub-issues", async () => {
    const client = createFakeGithubClient({
      issues: [
        githubIssue({
          id: 1,
          node_id: "issue-node-1",
          number: 1,
          title: "[M001] Existing Milestone",
          body: '<!-- kata:entity {"kataId":"M001","type":"Milestone"} -->\nExisting milestone',
          state: "open",
          milestoneNumber: 1,
        }),
        githubIssue({
          id: 2,
          node_id: "issue-node-2",
          number: 2,
          title: "[S001] Stale Parent",
          body: '<!-- kata:entity {"kataId":"S001","type":"Slice","parentId":"M001"} -->\nStale parent slice',
          state: "open",
          milestoneNumber: 1,
        }),
        githubIssue({
          id: 3,
          node_id: "issue-node-3",
          number: 3,
          title: "[S002] Native Parent",
          body: '<!-- kata:entity {"kataId":"S002","type":"Slice","parentId":"M001"} -->\nNative parent slice',
          state: "open",
          milestoneNumber: 1,
        }),
        githubIssue({
          id: 4,
          node_id: "issue-node-4",
          number: 4,
          title: "[T001] Native Child",
          body: '<!-- kata:entity {"kataId":"T001","type":"Task","parentId":"S001","status":"todo"} -->\nNative child task',
          state: "open",
          milestoneNumber: 1,
        }),
      ],
      projectItems: [
        projectItem({
          itemId: "project-item-1",
          issueNodeId: "issue-node-1",
          issueNumber: 1,
          kataId: "M001",
          kataType: "Milestone",
          artifactScope: "M001",
          status: "Todo",
        }),
        projectItem({
          itemId: "project-item-2",
          issueNodeId: "issue-node-2",
          issueNumber: 2,
          kataId: "S001",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S001",
          status: "Todo",
        }),
        projectItem({
          itemId: "project-item-3",
          issueNodeId: "issue-node-3",
          issueNumber: 3,
          kataId: "S002",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S002",
          status: "Todo",
        }),
        projectItem({
          itemId: "project-item-4",
          issueNodeId: "issue-node-4",
          issueNumber: 4,
          kataId: "T001",
          kataType: "Task",
          parentId: "S001",
          artifactScope: "T001",
          status: "Todo",
          verificationState: "pending",
        }),
      ],
      subIssuesByParent: new Map([[3, [4]]]),
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await expect(adapter.listTasks({ sliceId: "S001" })).resolves.toEqual([]);
    await expect(adapter.listTasks({ sliceId: "S002" })).resolves.toEqual([
      expect.objectContaining({ id: "T001", sliceId: "S002" }),
    ]);
    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/repos/kata-sh/uat/issues/3/sub_issues?per_page=100&page=1",
      }),
    );
  });

  it("treats closed GitHub slice and task issues as done even when body metadata is stale", async () => {
    const client = createFakeGithubClient({
      issues: [
        githubIssue({
          id: 1,
          node_id: "issue-node-1",
          number: 1,
          title: "[M001] Existing Milestone",
          body: "Existing milestone",
          state: "open",
          milestoneNumber: 1,
        }),
        githubIssue({
          id: 2,
          node_id: "issue-node-2",
          number: 2,
          title: "[S001] Closed Slice",
          body: '<!-- kata:entity {"kataId":"S001","type":"Slice","parentId":"M001","status":"backlog"} -->\nClosed slice body',
          state: "closed",
          milestoneNumber: 1,
        }),
        githubIssue({
          id: 3,
          node_id: "issue-node-3",
          number: 3,
          title: "[T001] Closed Task",
          body: '<!-- kata:entity {"kataId":"T001","type":"Task","parentId":"S001","status":"backlog","verificationState":"pending"} -->\nClosed task body',
          state: "closed",
          milestoneNumber: 1,
        }),
      ],
      projectItems: [
        projectItem({
          itemId: "project-item-1",
          issueNodeId: "issue-node-1",
          issueNumber: 1,
          kataId: "M001",
          kataType: "Milestone",
          artifactScope: "M001",
          status: "Todo",
        }),
        projectItem({
          itemId: "project-item-2",
          issueNodeId: "issue-node-2",
          issueNumber: 2,
          kataId: "S001",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S001",
          status: "Backlog",
        }),
        projectItem({
          itemId: "project-item-3",
          issueNodeId: "issue-node-3",
          issueNumber: 3,
          kataId: "T001",
          kataType: "Task",
          parentId: "S001",
          artifactScope: "T001",
          status: "Backlog",
          verificationState: "verified",
        }),
      ],
      subIssuesByParent: new Map([[2, [3]]]),
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });
    const api = createKataDomainApi(adapter);

    const snapshot = await api.project.getSnapshot();

    expect(snapshot.slices).toEqual([
      expect.objectContaining({
        id: "S001",
        status: "done",
        tasks: [
          expect.objectContaining({
            id: "T001",
            sliceId: "S001",
            status: "done",
            verificationState: "verified",
          }),
        ],
      }),
    ]);
    expect(snapshot.readiness.allSlicesDone).toBe(true);
    expect(snapshot.readiness.allTasksDone).toBe(true);
    expect(snapshot.nextAction).toMatchObject({
      workflow: "kata-complete-milestone",
      target: { milestoneId: "M001" },
    });
  });

  it("preserves explicit pending verification for closed task issues", async () => {
    const client = createFakeGithubClient({
      issues: [
        githubIssue({
          id: 1,
          node_id: "issue-node-1",
          number: 1,
          title: "[M001] Existing Milestone",
          body: "Existing milestone",
          state: "open",
          milestoneNumber: 1,
        }),
        githubIssue({
          id: 2,
          node_id: "issue-node-2",
          number: 2,
          title: "[S001] Closed Slice",
          body: "Closed slice body",
          state: "closed",
          milestoneNumber: 1,
        }),
        githubIssue({
          id: 3,
          node_id: "issue-node-3",
          number: 3,
          title: "[T001] Closed Task",
          body: "Closed task body",
          state: "closed",
          milestoneNumber: 1,
        }),
      ],
      projectItems: [
        projectItem({
          itemId: "project-item-1",
          issueNodeId: "issue-node-1",
          issueNumber: 1,
          kataId: "M001",
          kataType: "Milestone",
          artifactScope: "M001",
          status: "Todo",
        }),
        projectItem({
          itemId: "project-item-2",
          issueNodeId: "issue-node-2",
          issueNumber: 2,
          kataId: "S001",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S001",
          status: "Done",
        }),
        projectItem({
          itemId: "project-item-3",
          issueNodeId: "issue-node-3",
          issueNumber: 3,
          kataId: "T001",
          kataType: "Task",
          parentId: "S001",
          artifactScope: "T001",
          status: "Done",
          verificationState: "pending",
        }),
      ],
      subIssuesByParent: new Map([[2, [3]]]),
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await expect(adapter.listTasks({ sliceId: "S001" })).resolves.toEqual([
      expect.objectContaining({
        id: "T001",
        status: "done",
        verificationState: "pending",
      }),
    ]);
  });

  it("discovers closed native-labeled slice and task issues when Kata fields are empty", async () => {
    const client = createFakeGithubClient({
      issues: [
        githubIssue({
          id: 1,
          node_id: "issue-node-1",
          number: 1,
          title: "[M001] Existing Milestone",
          body: "Existing milestone",
          state: "open",
          milestoneNumber: 1,
        }),
        githubIssue({
          id: 13,
          node_id: "issue-node-13",
          number: 13,
          title: "[S003] Define pay-for-performance offer",
          body: "Define the offer.",
          state: "closed",
          milestoneNumber: 1,
        }),
        githubIssue({
          id: 14,
          node_id: "issue-node-14",
          number: 14,
          title: "[T007] Define trial deliverable",
          body: "Define what the trial delivers.",
          state: "closed",
          milestoneNumber: 1,
        }),
      ],
      projectItems: [
        projectItem({
          itemId: "project-item-1",
          issueNodeId: "issue-node-1",
          issueNumber: 1,
          kataId: "M001",
          kataType: "Milestone",
          artifactScope: "M001",
          status: "Todo",
        }),
        {
          id: "project-item-13",
          content: {
            id: "issue-node-13",
            databaseId: 13,
            number: 13,
            title: "[S003] Define pay-for-performance offer",
            body: "Define the offer.",
            state: "CLOSED",
            url: "https://github.test/kata-sh/uat/issues/13",
            milestone: { number: 1, title: "[M001] Existing Milestone" },
            labels: { nodes: [{ name: "kata:slice" }] },
          },
          status: { name: "Done" },
        },
        {
          id: "project-item-14",
          content: {
            id: "issue-node-14",
            databaseId: 14,
            number: 14,
            title: "[T007] Define trial deliverable",
            body: "Define what the trial delivers.",
            state: "CLOSED",
            url: "https://github.test/kata-sh/uat/issues/14",
            milestone: { number: 1, title: "[M001] Existing Milestone" },
            labels: { nodes: [{ name: "kata:task" }] },
          },
          status: { name: "Done" },
        },
      ],
      subIssuesByParent: new Map([[13, [14]]]),
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });
    const api = createKataDomainApi(adapter);

    const snapshot = await api.project.getSnapshot();

    expect(snapshot.slices).toEqual([
      expect.objectContaining({
        id: "S003",
        milestoneId: "M001",
        status: "done",
        tasks: [
          expect.objectContaining({
            id: "T007",
            sliceId: "S003",
            status: "done",
            verificationState: "verified",
          }),
        ],
      }),
    ]);
    expect(snapshot.readiness).toMatchObject({
      allRoadmapSlicesExist: true,
      allSlicesDone: true,
      allTasksDone: true,
      allTasksVerified: true,
      milestoneCompletable: true,
    });
    expect(snapshot.nextAction).toMatchObject({
      workflow: "kata-complete-milestone",
      target: { milestoneId: "M001" },
    });
  });

  it("derives slice parent from native milestone number when milestone title is not Kata-prefixed", async () => {
    const client = createFakeGithubClient({
      projectItems: [
        {
          id: "project-item-1",
          content: {
            id: "issue-node-1",
            databaseId: 1,
            number: 1,
            title: "[M001] Imported Milestone",
            body: "Imported milestone",
            state: "OPEN",
            milestone: { number: 7, title: "Imported delivery phase" },
          },
          kataId: { text: "M001" },
          kataType: { text: "Milestone" },
          artifactScope: { text: "M001" },
          status: { name: "Todo" },
        },
        {
          id: "project-item-2",
          content: {
            id: "issue-node-2",
            databaseId: 2,
            number: 2,
            title: "[S001] Imported Slice",
            body: "Imported slice",
            state: "OPEN",
            milestone: { number: 7, title: "Imported delivery phase" },
          },
          kataId: { text: "S001" },
          kataType: { text: "Slice" },
          artifactScope: { text: "S001" },
          status: { name: "Todo" },
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

    await expect(adapter.listSlices({ milestoneId: "M001" })).resolves.toEqual([
      expect.objectContaining({ id: "S001", milestoneId: "M001" }),
    ]);
  });

  it("maps open GitHub slice status from Project v2 Status", async () => {
    const client = createFakeGithubClient({
      issues: [
        githubIssue({
          id: 1,
          node_id: "issue-node-1",
          number: 1,
          title: "[M001] Existing Milestone",
          body: '<!-- kata:entity {"kataId":"M001","type":"Milestone"} -->\nExisting milestone',
          state: "open",
          milestoneNumber: 1,
        }),
        githubIssue({
          id: 2,
          node_id: "issue-node-2",
          number: 2,
          title: "[S001] Open Slice",
          body: '<!-- kata:entity {"kataId":"S001","type":"Slice","parentId":"M001","status":"backlog"} -->\nOpen slice body',
          state: "open",
          milestoneNumber: 1,
        }),
      ],
      projectItems: [
        projectItem({
          itemId: "project-item-1",
          issueNodeId: "issue-node-1",
          issueNumber: 1,
          kataId: "M001",
          kataType: "Milestone",
          artifactScope: "M001",
          status: "Todo",
        }),
        projectItem({
          itemId: "project-item-2",
          issueNodeId: "issue-node-2",
          issueNumber: 2,
          kataId: "S001",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S001",
          status: "In Progress",
        }),
      ],
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await expect(adapter.listSlices({ milestoneId: "M001" })).resolves.toEqual([
      expect.objectContaining({
        id: "S001",
        status: "in_progress",
      }),
    ]);
  });

  it("allocates unique task IDs when separate adapters create tasks from the same discovered snapshot", async () => {
    const initialIssues = [
      {
        id: 1,
        node_id: "issue-node-1",
        number: 1,
        title: "[M001] Existing Milestone",
        body: '<!-- kata:entity {"kataId":"M001","type":"Milestone"} -->\nExisting milestone',
        state: "open",
        html_url: "https://github.test/kata-sh/uat/issues/1",
        milestone: { number: 1 },
      },
      {
        id: 2,
        node_id: "issue-node-2",
        number: 2,
        title: "[S001] Existing Slice",
        body: '<!-- kata:entity {"kataId":"S001","type":"Slice","parentId":"M001"} -->\nExisting slice',
        state: "open",
        html_url: "https://github.test/kata-sh/uat/issues/2",
        milestone: { number: 1 },
      },
    ];
    const client = createFakeGithubClient({
      issues: initialIssues,
      projectItems: [
        projectItem({
          itemId: "project-item-1",
          issueNodeId: "issue-node-1",
          issueNumber: 1,
          kataId: "M001",
          kataType: "Milestone",
          artifactScope: "M001",
          status: "Todo",
        }),
        projectItem({
          itemId: "project-item-2",
          issueNodeId: "issue-node-2",
          issueNumber: 2,
          kataId: "S001",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S001",
          status: "Backlog",
        }),
      ],
    });
    const firstAdapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });
    const secondAdapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    const [firstTask, secondTask] = await Promise.all([
      firstAdapter.createTask({
        sliceId: "S001",
        title: "First concurrent task",
        description: "Created by first adapter",
      }),
      secondAdapter.createTask({
        sliceId: "S001",
        title: "Second concurrent task",
        description: "Created by second adapter",
      }),
    ]);

    expect([firstTask.id, secondTask.id].sort()).toEqual(["T001", "T002"]);
    await expect(secondAdapter.listTasks({ sliceId: "S001" })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "T001", title: "First concurrent task" }),
        expect.objectContaining({ id: "T002", title: "Second concurrent task" }),
      ]),
    );
  });

  it("creates standalone planned issues as one Project v2 backlog item", async () => {
    const client = createFakeGithubClient();
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    const issue = await adapter.createIssue({
      title: "Plan isolated fix",
      design: "## Problem\n\nThe workflow needs one standalone issue.",
      plan: "## Tasks\n\n- [ ] Create one backend issue.",
    });

    expect(issue).toMatchObject({
      id: "I001",
      number: 1,
      title: "Plan isolated fix",
      status: "backlog",
      url: "https://github.test/kata-sh/uat/issues/1",
    });
    expect(issue.body).toContain("# Design");
    expect(issue.body).toContain("# Plan");

    await expect(adapter.listOpenIssues()).resolves.toEqual([
      expect.objectContaining({ id: "I001", number: 1, title: "Plan isolated fix", status: "backlog" }),
    ]);
    await expect(adapter.getIssue({ issueRef: "#1" })).resolves.toMatchObject({
      id: "I001",
      number: 1,
      body: expect.stringContaining("# Plan"),
    });
    await expect(adapter.getIssue({ issueRef: "isolated" })).resolves.toMatchObject({ id: "I001" });
    await expect(adapter.updateIssueStatus({ issueId: "I001", status: "in_progress" })).resolves.toMatchObject({
      id: "I001",
      status: "in_progress",
    });

    expect(client.rest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/issues",
        body: expect.objectContaining({
          title: "[I001] Plan isolated fix",
          body: "# Design\n\n## Problem\n\nThe workflow needs one standalone issue.\n\n# Plan\n\n## Tasks\n\n- [ ] Create one backend issue.",
        }),
      }),
    );

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
              value: { text: "Issue" },
            }),
          }),
        ],
        [
          expect.objectContaining({
            variables: expect.objectContaining({
              itemId: "project-item-1",
              fieldId: "status-field-id",
              value: { singleSelectOptionId: "status-backlog" },
            }),
          }),
        ],
        [
          expect.objectContaining({
            variables: expect.objectContaining({
              itemId: "project-item-1",
              fieldId: "status-field-id",
              value: { singleSelectOptionId: "status-in-progress" },
            }),
          }),
        ],
      ]),
    );
  });

  it("treats closed standalone Project v2 issues as done and excludes them from open issues", async () => {
    const client = createFakeGithubClient({
      projectItems: [
        projectItem({
          itemId: "project-item-1",
          issueNodeId: "issue-node-1",
          issueId: 1,
          issueNumber: 1,
          title: "[I001] Closed stale issue",
          body: '<!-- kata:entity {"kataId":"I001","type":"Issue","status":"backlog"} -->\nStale issue body',
          state: "closed",
          url: "https://github.test/kata-sh/uat/issues/1",
          kataId: "I001",
          kataType: "Issue",
          artifactScope: "I001",
          status: "Backlog",
        }),
      ],
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await expect(adapter.listOpenIssues()).resolves.toEqual([]);
    await expect(adapter.getIssue({ issueRef: "I001" })).resolves.toMatchObject({
      id: "I001",
      status: "done",
      body: "Stale issue body",
    });
  });

  it("preserves marker-free issue bodies discovered from Project v2 fields", async () => {
    const client = createFakeGithubClient({
      projectItems: [
        projectItem({
          itemId: "project-item-1",
          issueNodeId: "issue-node-1",
          issueId: 1,
          issueNumber: 1,
          title: "[I001] Marker-free issue",
          body: "Line one\nLine two",
          state: "open",
          url: "https://github.test/kata-sh/uat/issues/1",
          kataId: "I001",
          kataType: "Issue",
          artifactScope: "I001",
          status: "Todo",
        }),
      ],
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await expect(adapter.getIssue({ issueRef: "I001" })).resolves.toMatchObject({
      id: "I001",
      body: "Line one\nLine two",
    });
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
      projectItems: [
        projectItem({
          itemId: "project-item-99",
          issueNodeId: "issue-node-99",
          issueNumber: 42,
          kataId: "S001",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S001",
          status: "Backlog",
        }),
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
        method: "POST",
        path: "/repos/kata-sh/uat/issues/42/comments",
      }),
    );
    expect(client.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("LoadKataProjectItemFields"),
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
      projectItems: [
        projectItem({
          itemId: "project-item-98",
          issueNodeId: "issue-node-98",
          issueNumber: 41,
          kataId: "S001",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S001",
          status: "Backlog",
        }),
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
      projectItems: [
        projectItem({
          itemId: "project-item-97",
          issueNodeId: "issue-node-97",
          issueNumber: 40,
          kataId: "T001",
          kataType: "Task",
          parentId: "S001",
          artifactScope: "T001",
          status: "Backlog",
          verificationState: "pending",
        }),
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

    const updateCalls = client.graphql.mock.calls.filter(([input]) =>
      input.query.includes("updateProjectV2ItemFieldValue")
    );
    expect(updateCalls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            variables: expect.objectContaining({
              fieldId: "kata-verification-state-field-id",
              value: { text: "verified" },
            }),
          }),
        ],
      ]),
    );

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
      projectItems: [
        projectItem({
          itemId: "project-item-96",
          issueNodeId: "issue-node-96",
          issueNumber: 39,
          kataId: "S001",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S001",
          status: "Backlog",
        }),
        projectItem({
          itemId: "project-item-95",
          issueNodeId: "issue-node-95",
          issueNumber: 38,
          kataId: "S001",
          kataType: "Slice",
          parentId: "M001",
          artifactScope: "S001",
          status: "Backlog",
        }),
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

  it("rejects blank standalone issue refs before title matching", async () => {
    const client = createFakeGithubClient();
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await adapter.createIssue({
      title: "Plan isolated fix",
      design: "## Problem\n\nThe workflow needs one standalone issue.",
      plan: "## Tasks\n\n- [ ] Create one backend issue.",
    });

    await expect(adapter.getIssue({ issueRef: "   " })).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      message: "Standalone issue reference is required.",
    });
  });

  it("fails early when a Project v2 status option is missing", async () => {
    const client = createFakeGithubClient({
      projectFields: validProjectFields({
        statusOptions: validStatusOptions().filter((option) => option.name !== "In Progress"),
      }),
    });
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    await expect(adapter.createIssue({
      title: "Plan isolated fix",
      design: "## Problem\n\nThe workflow needs one standalone issue.",
      plan: "## Tasks\n\n- [ ] Create one backend issue.",
    })).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      message: expect.stringContaining('field "Status" is missing option "In Progress"'),
    });

    expect(client.rest).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/repos/kata-sh/uat/issues",
      }),
    );
  });

  it("keeps GitHub Projects v2 milestone, slice, task, artifact, and dependency behavior intact", async () => {
    const client = createFakeGithubClient();
    const adapter = new GithubProjectsV2Adapter({
      owner: "kata-sh",
      repo: "uat",
      projectNumber: 12,
      workspacePath: "/workspace",
      client: client as any,
    });

    const milestone = await adapter.createMilestone({ title: "Regression", goal: "Keep GitHub behavior" });
    const first = await adapter.createSlice({ milestoneId: milestone.id, title: "First", goal: "Foundation" });
    const second = await adapter.createSlice({
      milestoneId: milestone.id,
      title: "Second",
      goal: "Dependent",
      blockedBy: [first.id],
    });
    const task = await adapter.createTask({ sliceId: second.id, title: "Task", description: "Child issue" });
    const artifact = await adapter.writeArtifact({
      scopeType: "task",
      scopeId: task.id,
      artifactType: "verification",
      title: "Verification",
      content: "Verified",
      format: "markdown",
    });

    expect(milestone).toMatchObject({ id: "M001", status: "active" });
    expect(second).toMatchObject({ id: "S002", blockedBy: ["S001"] });
    expect(task).toMatchObject({ id: "T001", sliceId: "S002" });
    expect(artifact).toMatchObject({ scopeType: "task", scopeId: "T001", artifactType: "verification" });
    await expect(adapter.listSlices({ milestoneId: "M001" })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "S001", blocking: ["S002"] }),
      expect.objectContaining({ id: "S002", blockedBy: ["S001"] }),
    ]));
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

function githubIssue(input: {
  id: number;
  node_id: string;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  milestoneNumber?: number;
}) {
  return {
    id: input.id,
    node_id: input.node_id,
    number: input.number,
    title: input.title,
    body: input.body,
    state: input.state,
    html_url: `https://github.test/kata-sh/uat/issues/${input.number}`,
    milestone: input.milestoneNumber ? { number: input.milestoneNumber } : null,
  };
}

function projectItem(input: {
  itemId: string;
  issueNodeId: string;
  issueId?: number;
  issueNumber: number;
  title?: string;
  body?: string;
  state?: "open" | "closed";
  url?: string;
  milestoneNumber?: number;
  kataId: string;
  kataType: string;
  parentId?: string;
  artifactScope?: string;
  status?: string;
  verificationState?: string;
}) {
  return {
    id: input.itemId,
    content: {
      id: input.issueNodeId,
      ...(input.issueId !== undefined ? { databaseId: input.issueId } : {}),
      number: input.issueNumber,
      ...(input.title ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.state ? { state: input.state.toUpperCase() } : {}),
      ...(input.url ? { url: input.url } : {}),
      ...(input.milestoneNumber !== undefined ? { milestone: { number: input.milestoneNumber } } : {}),
    },
    kataId: { text: input.kataId },
    kataType: { text: input.kataType },
    ...(input.parentId ? { parentId: { text: input.parentId } } : {}),
    ...(input.artifactScope ? { artifactScope: { text: input.artifactScope } } : {}),
    ...(input.status ? { status: { name: input.status } } : {}),
    ...(input.verificationState ? { verificationState: { text: input.verificationState } } : {}),
  };
}

function createFakeGithubClient(
  input: {
    issues?: any[];
    issueListSnapshots?: any[][];
    projectFields?: any[];
    projectItems?: any[];
    nativeDependencies?: Array<{ blocked: number; blocker: number }>;
    subIssuesByParent?: Map<number, number[]>;
  } = {},
) {
  const issues = [...(input.issues ?? [])];
  const projectItems = [...(input.projectItems ?? [])];
  const nativeDependencies = [...(input.nativeDependencies ?? [])];
  const subIssuesByParent = input.subIssuesByParent ?? new Map<number, number[]>();
  input.subIssuesByParent = subIssuesByParent;
  const commentsByIssue = new Map<number, any[]>();
  let nextIssueNumber = issues.reduce((max, issue) => Math.max(max, Number(issue.number) || 0), 0) + 1;
  let nextProjectItemNumber = projectItems.reduce((max, item) => {
    const match = typeof item.id === "string" ? item.id.match(/^project-item-(\d+)$/) : null;
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  let nextCommentId = 1;
  let issueListCallCount = 0;
  const enrichProjectItemContent = (item: any) => {
    const issue = issues.find((candidate) =>
      candidate.node_id === item.content?.id || candidate.number === item.content?.number
    );
    if (!issue) return item;
    return {
      ...item,
      content: {
        ...item.content,
        databaseId: item.content?.databaseId ?? issue.id,
        title: item.content?.title ?? issue.title,
        body: item.content?.body ?? issue.body,
        state: item.content?.state ?? String(issue.state).toUpperCase(),
        url: item.content?.url ?? issue.html_url,
        milestone: item.content?.milestone ?? issue.milestone,
      },
    };
  };

  return {
    graphql: vi.fn(async (request: any) => {
      if (request.query.includes("LoadKataProjectFields")) {
        return {
          organization: {
            projectV2: {
              id: "project-id",
              fields: {
                nodes: input.projectFields ?? [
                  ...validProjectFields(),
                ],
              },
            },
          },
        };
      }

      if (request.query.includes("LoadKataIssueDependencies")) {
        return {
          nodes: request.variables.ids.map((id: string) => {
            const issue = issues.find((candidate) => candidate.node_id === id);
            if (!issue) return null;
            return {
              id: issue.node_id,
              number: issue.number,
              blockedBy: {
                nodes: nativeDependencies
                  .filter((dependency) => dependency.blocked === issue.number)
                  .map((dependency) => issues.find((candidate) => candidate.number === dependency.blocker))
                  .filter(Boolean)
                  .map((candidate) => ({ id: candidate.node_id, number: candidate.number })),
              },
              blocking: {
                nodes: nativeDependencies
                  .filter((dependency) => dependency.blocker === issue.number)
                  .map((dependency) => issues.find((candidate) => candidate.number === dependency.blocked))
                  .filter(Boolean)
                  .map((candidate) => ({ id: candidate.node_id, number: candidate.number })),
              },
            };
          }),
        };
      }

      if (request.query.includes("AddKataIssueBlockedBy")) {
        const blocked = issues.find((issue) => issue.node_id === request.variables.issueId);
        const blocker = issues.find((issue) => issue.node_id === request.variables.blockingIssueId);
        if (blocked && blocker && !nativeDependencies.some((dependency) => dependency.blocked === blocked.number && dependency.blocker === blocker.number)) {
          nativeDependencies.push({ blocked: blocked.number, blocker: blocker.number });
        }
        return { addBlockedBy: { issue: { id: request.variables.issueId } } };
      }

      if (request.query.includes("LoadKataProjectItemFields")) {
        return {
          organization: {
            projectV2: {
              items: {
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null,
                },
                nodes: projectItems.map(enrichProjectItemContent),
              },
            },
          },
        };
      }

      if (request.query.includes("addProjectV2ItemById")) {
        const existingItem = projectItems.find((candidate) => candidate.content?.id === request.variables.contentId);
        if (existingItem) {
          return {
            addProjectV2ItemById: {
              item: { id: existingItem.id },
            },
          };
        }
        const item = {
          id: `project-item-${nextProjectItemNumber++}`,
          content: { id: request.variables.contentId },
        };
        projectItems.push(item);
        return {
          addProjectV2ItemById: {
            item: { id: item.id },
          },
        };
      }

      if (request.query.includes("updateProjectV2ItemFieldValue")) {
        const itemToUpdate = projectItems.find((candidate) => candidate.id === request.variables.itemId);
        if (itemToUpdate) {
          const text = request.variables.value?.text;
          if (request.variables.fieldId === "kata-type-field-id") itemToUpdate.kataType = { text };
          if (request.variables.fieldId === "kata-id-field-id") itemToUpdate.kataId = { text };
          if (request.variables.fieldId === "kata-parent-id-field-id") itemToUpdate.parentId = { text };
          if (request.variables.fieldId === "kata-artifact-scope-field-id") itemToUpdate.artifactScope = { text };
          if (request.variables.fieldId === "kata-verification-state-field-id") itemToUpdate.verificationState = { text };
          if (request.variables.fieldId === "status-field-id") {
            const optionId = request.variables.value?.singleSelectOptionId;
            const option = validStatusOptions().find((candidate) => candidate.id === optionId);
            if (option) itemToUpdate.status = { name: option.name };
          }
        }
        return {
          updateProjectV2ItemFieldValue: {
            projectV2Item: { id: request.variables.itemId },
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
        const snapshot = input.issueListSnapshots?.[issueListCallCount++];
        if (snapshot) return page === 1 ? snapshot : [];
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

      const blockedByMatch = request.path.match(/^\/repos\/kata-sh\/uat\/issues\/(\d+)\/dependencies\/blocked_by$/);
      if (request.method === "GET" && blockedByMatch) {
        const issueNumber = Number(blockedByMatch[1]);
        return nativeDependencies
          .filter((dependency) => dependency.blocked === issueNumber)
          .map((dependency) => issues.find((issue) => issue.number === dependency.blocker))
          .filter(Boolean);
      }
      if (request.method === "POST" && blockedByMatch) {
        const issueNumber = Number(blockedByMatch[1]);
        const blocker = issues.find((issue) => issue.id === request.body.issue_id);
        if (blocker && !nativeDependencies.some((dependency) => dependency.blocked === issueNumber && dependency.blocker === blocker.number)) {
          nativeDependencies.push({ blocked: issueNumber, blocker: blocker.number });
        }
        return undefined;
      }

      const blockingMatch = request.path.match(/^\/repos\/kata-sh\/uat\/issues\/(\d+)\/dependencies\/blocking$/);
      if (request.method === "GET" && blockingMatch) {
        const issueNumber = Number(blockingMatch[1]);
        return nativeDependencies
          .filter((dependency) => dependency.blocker === issueNumber)
          .map((dependency) => issues.find((issue) => issue.number === dependency.blocked))
          .filter(Boolean);
      }

      const subIssuesMatch = request.path.match(/^\/repos\/kata-sh\/uat\/issues\/(\d+)\/sub_issues(?:\?.*)?$/);
      if (request.method === "GET" && subIssuesMatch) {
        const parentIssueNumber = Number(subIssuesMatch[1]);
        const subIssueNumbers = subIssuesByParent.get(parentIssueNumber) ?? [];
        const params = new URL(`https://example.test${request.path}`).searchParams;
        const perPage = Number(params.get("per_page") ?? "100");
        const page = Number(params.get("page") ?? "1");
        const start = (page - 1) * perPage;
        return subIssueNumbers
          .slice(start, start + perPage)
          .map((issueNumber) => issues.find((issue) => issue.number === issueNumber))
          .filter(Boolean);
      }
      if (request.method === "POST" && subIssuesMatch) {
        const parentIssueNumber = Number(subIssuesMatch[1]);
        const child = issues.find((issue) => issue.id === request.body.sub_issue_id);
        if (child) {
          const childNumbers = subIssuesByParent.get(parentIssueNumber) ?? [];
          if (!childNumbers.includes(child.number)) {
            subIssuesByParent.set(parentIssueNumber, [...childNumbers, child.number]);
          }
        }
        return {
          parent_issue_number: parentIssueNumber,
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
          milestone: request.body.milestone ? { number: request.body.milestone } : null,
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

function validProjectFields(input: { statusOptions?: Array<{ id: string; name: string }> } = {}) {
  return [
    { id: "status-field-id", name: "Status", options: input.statusOptions ?? validStatusOptions() },
    { id: "kata-type-field-id", name: "Kata Type", dataType: "TEXT" },
    { id: "kata-id-field-id", name: "Kata ID", dataType: "TEXT" },
    { id: "kata-parent-id-field-id", name: "Kata Parent ID", dataType: "TEXT" },
    { id: "kata-artifact-scope-field-id", name: "Kata Artifact Scope", dataType: "TEXT" },
    { id: "kata-verification-state-field-id", name: "Kata Verification State", dataType: "TEXT" },
  ];
}
