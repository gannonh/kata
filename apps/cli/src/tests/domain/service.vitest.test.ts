import { describe, expect, it } from "vitest";

import { createKataDomainApi } from "../../domain/service.js";
import { KataDomainError } from "../../domain/errors.js";
import { readTrackerConfig } from "../../backends/read-tracker-config.js";

const fakeProject = {
  backend: "github",
  workspacePath: "/workspace/kata-mono",
  repository: {
    owner: "kata-sh",
    name: "kata-mono",
  },
};

const fakeMilestone = {
  id: "M01",
  title: "Milestone One",
  goal: "Create the canonical contract",
  status: "active",
  active: true,
};

const fakeTask = {
  id: "T01",
  title: "Ship contract",
  description: "Implement Task 1",
  status: "todo",
  sliceId: "S01",
  verificationState: "pending",
};

const fakeArtifact = {
  id: "artifact-1",
  artifactType: "plan",
  scopeType: "slice",
  scopeId: "S01",
  title: "Execution plan",
  content: "Ship the contract",
  format: "markdown",
  updatedAt: "2026-04-26T00:00:00.000Z",
  provenance: {
    backend: "github",
    backendId: "GH-ART-1",
  },
};

const fakeSlice = {
  id: "S01",
  title: "Domain layer",
  goal: "Normalize the backend surface",
  status: "todo",
  milestoneId: fakeMilestone.id,
  order: 1,
};

const fakePullRequest = {
  id: "pr-1",
  url: "https://example.com/pull/42",
  branch: "codex/kata-cli-skill-platform",
  base: "main",
  status: "open",
  mergeReady: true,
};

const fakeExecutionStatus = {
  queueDepth: 0,
  activeWorkers: 1,
  escalations: [
    {
      requestId: "req-1",
      issueId: "ISSUE-1",
      summary: "Waiting on review",
    },
  ],
};

function createFakeAdapter() {
  return {
    getProjectContext: async () => fakeProject,
    getActiveMilestone: async () => fakeMilestone,
    listSlices: async (_input: { milestoneId: string }) => [fakeSlice],
    listTasks: async (_input: { sliceId: string }) => [fakeTask],
    listArtifacts: async (_input: { scopeType: "project" | "milestone" | "slice" | "task"; scopeId: string }) => [fakeArtifact],
    readArtifact: async () => fakeArtifact,
    writeArtifact: async (artifact: {
      scopeType: "project" | "milestone" | "slice" | "task";
      scopeId: string;
      artifactType: "project-brief" | "requirements" | "roadmap" | "phase-context" | "research" | "plan" | "summary" | "verification" | "uat" | "retrospective";
      title: string;
      content: string;
      format: "markdown" | "text" | "json";
    }) => ({
      id: "artifact-2",
      ...artifact,
      updatedAt: "2026-04-26T00:00:00.000Z",
      provenance: {
        backend: "github" as const,
        backendId: "GH-ART-2",
      },
    }),
    openPullRequest: async () => fakePullRequest,
    getExecutionStatus: async () => fakeExecutionStatus,
  };
}

describe("createKataDomainApi", () => {
  it("returns normalized project, milestone, task, and artifact reads", async () => {
    const api = createKataDomainApi(createFakeAdapter());

    await expect(api.project.getContext()).resolves.toEqual(fakeProject);
    await expect(api.milestone.getActive()).resolves.toEqual(fakeMilestone);
    await expect(api.task.list({ sliceId: "S01" })).resolves.toEqual([fakeTask]);
    await expect(
      api.artifact.read({ scopeType: "slice", scopeId: "S01", artifactType: "plan" }),
    ).resolves.toEqual(fakeArtifact);
  });

  it("passes artifact writes through without renaming fields", async () => {
    const api = createKataDomainApi(createFakeAdapter());
    const input = {
      artifactType: "summary",
      scopeType: "task",
      scopeId: fakeTask.id,
      title: "Done",
      content: "Wrapped up",
      format: "markdown",
    };

    const result = await api.artifact.write(input);

    expect(result.content).toBe(input.content);
    expect(result.scopeType).toBe(input.scopeType);
    expect(result.artifactType).toBe(input.artifactType);
  });
});

describe("readTrackerConfig", () => {
  it("accepts GitHub projects_v2 config", async () => {
    await expect(
      readTrackerConfig({ preferencesContent: `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata
  stateMode: projects_v2
  githubProjectNumber: 12
---` }),
    ).resolves.toEqual({
      kind: "github",
      repoOwner: "kata-sh",
      repoName: "kata",
      stateMode: "projects_v2",
      githubProjectNumber: 12,
    });
  });

  it("rejects GitHub label mode explicitly", async () => {
    await expect(
      readTrackerConfig({ preferencesContent: `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata
  stateMode: labels
  githubProjectNumber: 12
---` }),
    ).rejects.toThrowError(KataDomainError);

    await expect(
      readTrackerConfig({ preferencesContent: `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata
  stateMode: labels
  githubProjectNumber: 12
---` }),
    ).rejects.toThrowError(/GitHub label mode is no longer supported/);
  });
});
