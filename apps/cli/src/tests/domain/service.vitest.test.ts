import { describe, expect, it } from "vitest";

import { createKataDomainApi } from "../../domain/service.js";
import { KataDomainError } from "../../domain/errors.js";
import readTrackerConfig from "../../backends/read-tracker-config.js";

const fakeProject = {
  id: "P01",
  backend: "github",
  title: "Skill Platform",
  description: "Canonical project context",
};

const fakeMilestone = {
  id: "M01",
  backend: "github",
  title: "Milestone One",
  description: "Active milestone",
  status: "active",
  projectId: fakeProject.id,
};

const fakeTask = {
  id: "T01",
  backend: "github",
  title: "Ship contract",
  status: "todo",
  milestoneId: fakeMilestone.id,
  sliceId: "S01",
};

const fakeArtifact = {
  id: "artifact-1",
  backend: "github",
  artifactType: "plan",
  scopeType: "slice",
  scopeId: "S01",
  title: "Execution plan",
  content: "Ship the contract",
  format: "markdown",
  updatedAt: "2026-04-26T00:00:00.000Z",
};

const fakeSlice = {
  id: "S01",
  backend: "github",
  title: "Domain layer",
  status: "todo",
  milestoneId: fakeMilestone.id,
};

const fakePullRequest = {
  id: "pr-1",
  backend: "github",
  title: "Open PR",
  link: "https://example.com/pull/42",
};

const fakeExecutionStatus = {
  status: "idle",
  updatedAt: "2026-04-26T00:00:00.000Z",
};

function createFakeAdapter() {
  return {
    getProjectContext: async () => fakeProject,
    getActiveMilestone: async () => fakeMilestone,
    listSlices: async () => [fakeSlice],
    listTasks: async () => [fakeTask],
    listArtifacts: async () => [fakeArtifact],
    readArtifact: async () => fakeArtifact,
    writeArtifact: async (artifact: typeof fakeArtifact) => artifact,
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
      id: "artifact-2",
      backend: "github",
      artifactType: "summary",
      scopeType: "task",
      scopeId: fakeTask.id,
      title: "Done",
      content: "Wrapped up",
      format: "markdown",
      externalRef: "artifact-ref-2",
    };

    const result = await api.artifact.write(input);

    expect(result.content).toBe(input.content);
    expect(result.scopeType).toBe(input.scopeType);
    expect(result.artifactType).toBe(input.artifactType);
    expect(result).toEqual(input);
  });
});

describe("readTrackerConfig", () => {
  it("accepts GitHub projects_v2 config", () => {
    const config = readTrackerConfig({ preferencesContent: `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata
  stateMode: projects_v2
  githubProjectNumber: 12
---` });

    expect(config).toEqual({
      kind: "github",
      repoOwner: "kata-sh",
      repoName: "kata",
      stateMode: "projects_v2",
      githubProjectNumber: 12,
    });
  });

  it("rejects GitHub label mode explicitly", () => {
    expect(() =>
      readTrackerConfig({ preferencesContent: `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata
  stateMode: labels
  githubProjectNumber: 12
---` }),
    ).toThrowError(KataDomainError);

    expect(() =>
      readTrackerConfig({ preferencesContent: `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata
  stateMode: labels
  githubProjectNumber: 12
---` }),
    ).toThrowError(/GitHub label mode is no longer supported/);
  });
});
