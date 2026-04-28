import { describe, expect, it } from "vitest";

import { createKataDomainApi } from "../../domain/service.js";
import { KataDomainError } from "../../domain/errors.js";
import { readTrackerConfig } from "../../backends/read-tracker-config.js";
import { runJsonCommand } from "../../transports/json.js";
import type {
  KataArtifactListInput,
  KataArtifactReadInput,
  KataArtifactWriteInput,
  KataBackendAdapter,
  KataMilestone,
  KataProjectContext,
  KataSlice,
  KataSliceListInput,
  KataTask,
  KataTaskListInput,
} from "../../domain/types.js";

const fakeProject: KataProjectContext = {
  backend: "github",
  workspacePath: "/workspace/kata-mono",
  repository: {
    owner: "kata-sh",
    name: "kata-mono",
  },
};

const fakeMilestone: KataMilestone = {
  id: "M01",
  title: "Milestone One",
  goal: "Create the canonical contract",
  status: "active",
  active: true,
};

const fakeTask: KataTask = {
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

const fakeSlice: KataSlice = {
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

function createFakeAdapter(): KataBackendAdapter {
  return {
    getProjectContext: async () => fakeProject,
    getActiveMilestone: async () => fakeMilestone,
    listSlices: async (_input: KataSliceListInput) => [fakeSlice],
    listTasks: async (_input: KataTaskListInput) => [fakeTask],
    listArtifacts: async (_input: KataArtifactListInput) => [fakeArtifact],
    readArtifact: async (_input: KataArtifactReadInput) => fakeArtifact,
    writeArtifact: async (artifact: KataArtifactWriteInput) => ({
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
  it("covers golden-path contract operations", async () => {
    const api = createKataDomainApi(createFakeAdapter());

    await expect(api.project.getContext()).resolves.toEqual(fakeProject);
    await expect(api.milestone.getActive()).resolves.toEqual(fakeMilestone);
    await expect(api.slice.list({ milestoneId: fakeMilestone.id })).resolves.toEqual([fakeSlice]);
    await expect(api.task.list({ sliceId: "S01" })).resolves.toEqual([fakeTask]);
    await expect(api.artifact.list({ scopeType: "slice", scopeId: "S01" })).resolves.toEqual([fakeArtifact]);
    await expect(
      api.artifact.read({ scopeType: "slice", scopeId: "S01", artifactType: "plan" }),
    ).resolves.toEqual(fakeArtifact);
    await expect(api.execution.getStatus()).resolves.toEqual(fakeExecutionStatus);
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

describe("runJsonCommand", () => {
  it("returns an explicit NOT_IMPLEMENTED error for supported operations without handlers", async () => {
    const result = await runJsonCommand(
      { operation: "task.list", payload: { sliceId: "S01" } },
      { task: {} },
    );

    expect(JSON.parse(result)).toEqual({
      ok: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message: "Supported operation is not implemented by this API: task.list",
      },
    });
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

  it("wraps malformed YAML in a KataDomainError", async () => {
    await expect(
      readTrackerConfig({
        preferencesContent: `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: [kata
---`,
      }),
    ).rejects.toThrowError(KataDomainError);
  });

  it("rejects missing required GitHub fields with KataDomainError", async () => {
    await expect(
      readTrackerConfig({
        preferencesContent: `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  stateMode: projects_v2
  githubProjectNumber: 12
---`,
      }),
    ).rejects.toThrowError(KataDomainError);
  });

  it("rejects invalid githubProjectNumber with KataDomainError", async () => {
    await expect(
      readTrackerConfig({
        preferencesContent: `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata
  stateMode: projects_v2
  githubProjectNumber: 0
---`,
      }),
    ).rejects.toThrowError(KataDomainError);
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
