import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GithubProjectsV2Adapter } from "../../backends/github-projects-v2/adapter.js";
import { LinearKataAdapter } from "../../backends/linear/adapter.js";
import { readTrackerConfig } from "../../backends/read-tracker-config.js";
import { resolveBackend } from "../../backends/resolve-backend.js";

function structuralShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => structuralShape(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, structuralShape((value as Record<string, unknown>)[key])]),
    );
  }

  return typeof value;
}

function createGithubAdapter() {
  return new GithubProjectsV2Adapter({
    fetchProjectSnapshot: vi.fn(async () => ({
      activeMilestone: { id: "M003", name: "[M003] Skill Platform" },
      columns: [
        {
          id: "todo",
          title: "Todo",
          cards: [
            {
              id: "42",
              identifier: "#42",
              title: "[S01] Build contract",
              columnId: "todo",
              taskCounts: { total: 1, done: 0 },
              tasks: [
                {
                  id: "99",
                  identifier: "#99",
                  title: "[T01] Write facade",
                  description: "Create the facade",
                  columnId: "todo",
                },
              ],
            },
          ],
        },
      ],
    })),
    listArtifacts: vi.fn(async () => ([
      {
        id: "artifact-1",
        scopeType: "slice",
        scopeId: "42",
        artifactType: "plan",
        title: "[S01] Plan",
        content: "Plan body",
        format: "markdown",
        updatedAt: "2026-04-26T18:00:00.000Z",
        provenance: { backend: "github", backendId: "doc:1" },
      },
    ])),
    readArtifact: vi.fn(async () => ({
      id: "artifact-1",
      scopeType: "slice",
      scopeId: "42",
      artifactType: "plan",
      title: "[S01] Plan",
      content: "Plan body",
      format: "markdown",
      updatedAt: "2026-04-26T18:00:00.000Z",
      provenance: { backend: "github", backendId: "doc:1" },
    })),
  } as any);
}

function createLinearAdapter() {
  return new LinearKataAdapter({
    fetchActiveMilestoneSnapshot: vi.fn(async () => ({
      activeMilestone: { id: "M003", name: "[M003] Skill Platform" },
      columns: [
        {
          id: "todo",
          title: "Todo",
          cards: [
            {
              id: "KAT-42",
              identifier: "KAT-42",
              title: "[S01] Build contract",
              columnId: "todo",
              taskCounts: { total: 1, done: 0 },
              tasks: [
                {
                  id: "KAT-99",
                  identifier: "KAT-99",
                  title: "[T01] Write facade",
                  description: "Create the facade",
                  columnId: "todo",
                },
              ],
            },
          ],
        },
      ],
    })),
    fetchDocumentByTitle: vi.fn(async () => ({
      id: "artifact-1",
      scopeType: "slice",
      scopeId: "KAT-42",
      artifactType: "plan",
      title: "[S01] Plan",
      content: "Plan body",
      format: "markdown",
      updatedAt: "2026-04-26T18:00:00.000Z",
      provenance: { backend: "linear", backendId: "doc:1" },
    })),
    listArtifacts: vi.fn(async () => ([
      {
        id: "artifact-1",
        scopeType: "slice",
        scopeId: "KAT-42",
        artifactType: "plan",
        title: "[S01] Plan",
        content: "Plan body",
        format: "markdown",
        updatedAt: "2026-04-26T18:00:00.000Z",
        provenance: { backend: "linear", backendId: "doc:1" },
      },
    ])),
  } as any);
}

describe("GithubProjectsV2Adapter", () => {
  it("normalizes GitHub issue state into canonical slice/task status names", async () => {
    const adapter = createGithubAdapter();

    const slices = await adapter.listSlices({ milestoneId: "M003" });
    const tasks = await adapter.listTasks({ sliceId: "42" });

    expect(slices[0]).toMatchObject({ id: "42", status: "todo", milestoneId: "M003" });
    expect(tasks[0]).toMatchObject({ id: "99", sliceId: "42", status: "todo" });
  });
});

describe("LinearKataAdapter", () => {
  it("normalizes Linear issue state into the same canonical status names", async () => {
    const adapter = createLinearAdapter();

    const slices = await adapter.listSlices({ milestoneId: "M003" });
    const tasks = await adapter.listTasks({ sliceId: "KAT-42" });
    const artifact = await adapter.readArtifact({
      scopeType: "slice",
      scopeId: "KAT-42",
      artifactType: "plan",
    });

    expect(slices[0]).toMatchObject({ id: "KAT-42", status: "todo", milestoneId: "M003" });
    expect(tasks[0]).toMatchObject({ id: "KAT-99", sliceId: "KAT-42", status: "todo" });
    expect(artifact?.artifactType).toBe("plan");
  });
});

describe("backend contract parity", () => {
  it("returns the same object shapes for golden-path operations across backends", async () => {
    const githubAdapter = createGithubAdapter();
    const linearAdapter = createLinearAdapter();

    const githubProjectContext = await githubAdapter.getProjectContext();
    const linearProjectContext = await linearAdapter.getProjectContext();
    expect(structuralShape(githubProjectContext)).toEqual(structuralShape(linearProjectContext));

    const githubMilestone = await githubAdapter.getActiveMilestone();
    const linearMilestone = await linearAdapter.getActiveMilestone();
    expect(structuralShape(githubMilestone)).toEqual(structuralShape(linearMilestone));

    const githubSlices = await githubAdapter.listSlices({ milestoneId: "M003" });
    const linearSlices = await linearAdapter.listSlices({ milestoneId: "M003" });
    expect(structuralShape(githubSlices)).toEqual(structuralShape(linearSlices));

    const githubTasks = await githubAdapter.listTasks({ sliceId: "42" });
    const linearTasks = await linearAdapter.listTasks({ sliceId: "KAT-42" });
    expect(structuralShape(githubTasks)).toEqual(structuralShape(linearTasks));

    const githubArtifacts = await githubAdapter.listArtifacts({ scopeType: "slice", scopeId: "42" });
    const linearArtifacts = await linearAdapter.listArtifacts({ scopeType: "slice", scopeId: "KAT-42" });
    expect(structuralShape(githubArtifacts)).toEqual(structuralShape(linearArtifacts));

    const githubArtifact = await githubAdapter.readArtifact({
      scopeType: "slice",
      scopeId: "42",
      artifactType: "plan",
    });
    const linearArtifact = await linearAdapter.readArtifact({
      scopeType: "slice",
      scopeId: "KAT-42",
      artifactType: "plan",
    });
    expect(structuralShape(githubArtifact)).toEqual(structuralShape(linearArtifact));

    const githubWrittenArtifact = await githubAdapter.writeArtifact({
      scopeType: "slice",
      scopeId: "42",
      artifactType: "summary",
      title: "done",
      content: "done",
      format: "markdown",
    });
    const linearWrittenArtifact = await linearAdapter.writeArtifact({
      scopeType: "slice",
      scopeId: "KAT-42",
      artifactType: "summary",
      title: "done",
      content: "done",
      format: "markdown",
    });
    expect(structuralShape(githubWrittenArtifact)).toEqual(structuralShape(linearWrittenArtifact));

    const githubExecutionStatus = await githubAdapter.getExecutionStatus();
    const linearExecutionStatus = await linearAdapter.getExecutionStatus();
    expect(structuralShape(githubExecutionStatus)).toEqual(structuralShape(linearExecutionStatus));
  });
});

describe("resolveBackend runtime fallback", () => {
  it("uses an in-process runtime backend factory when explicit clients are not supplied", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "kata-runtime-fallback-"));
    const preferencesPath = join(workspace, ".kata", "preferences.md");
    const projectScopeKey = "__project__";
    const documentsByScope = new Map<string, string[]>([
      ["S01", ["S01-CONTEXT"]],
      [projectScopeKey, ["M001-CONTEXT"]],
    ]);
    const documentContent = new Map<string, string>([
      ["S01-CONTEXT", "Slice context"],
      ["M001-CONTEXT", "Milestone context"],
    ]);

    mkdirSync(join(workspace, ".kata"), { recursive: true });
    writeFileSync(preferencesPath, `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata-mono
  stateMode: projects_v2
  githubProjectNumber: 12
---
`, "utf8");

    const runtimeBackend = {
      isLinearMode: false,
      deriveState: vi.fn(async () => ({
        activeMilestone: { id: "M001", title: "[M001] Runtime Backed" },
        activeSlice: { id: "S01" },
        phase: "executing",
        blockers: ["Waiting on human review"],
      })),
      listSlices: vi.fn(async () => ([
        {
          id: "S01",
          title: "[S01] Runtime Slice",
          state: "in-progress",
          labels: ["kata:in-progress"],
          milestoneName: "M001",
        },
      ])),
      listTasks: vi.fn(async () => ([
        {
          id: "T01",
          title: "[T01] Runtime Task",
          state: "todo",
          labels: ["kata:todo"],
        },
      ])),
      listDocuments: vi.fn(async (scope?: { issueId: string }) => {
        const scopeKey = scope?.issueId ?? projectScopeKey;
        return documentsByScope.get(scopeKey) ?? [];
      }),
      readDocument: vi.fn(async (name: string) => documentContent.get(name) ?? null),
      writeDocument: vi.fn(async (name: string, content: string, scope?: { issueId: string }) => {
        documentContent.set(name, content);
        const scopeKey = scope?.issueId ?? projectScopeKey;
        const docs = documentsByScope.get(scopeKey) ?? [];
        if (!docs.includes(name)) docs.push(name);
        documentsByScope.set(scopeKey, docs);
      }),
    };

    const runtimeBackendFactory = vi.fn(async () => runtimeBackend);

    try {
      const adapter = await resolveBackend({
        workspacePath: workspace,
        runtimeBackendFactory,
      });

      await expect(adapter.getProjectContext()).resolves.toEqual({
        backend: "github",
        workspacePath: workspace,
        repository: {
          owner: "kata-sh",
          name: "kata-mono",
        },
      });

      await expect(adapter.getActiveMilestone()).resolves.toEqual({
        id: "M001",
        title: "[M001] Runtime Backed",
        goal: "[M001] Runtime Backed",
        status: "active",
        active: true,
      });

      await expect(adapter.listSlices({ milestoneId: "M001" })).resolves.toMatchObject([
        { id: "S01", milestoneId: "M001", status: "in_progress" },
      ]);

      await expect(adapter.listTasks({ sliceId: "S01" })).resolves.toMatchObject([
        { id: "T01", sliceId: "S01", status: "todo" },
      ]);

      await expect(adapter.listArtifacts({ scopeType: "slice", scopeId: "S01" })).resolves.toMatchObject([
        { scopeType: "slice", scopeId: "S01", artifactType: "phase-context" },
      ]);
      await expect(adapter.listArtifacts({ scopeType: "milestone", scopeId: "M001" })).resolves.toMatchObject([
        { scopeType: "milestone", scopeId: "M001", artifactType: "context" },
      ]);

      await expect(adapter.readArtifact({
        scopeType: "slice",
        scopeId: "S01",
        artifactType: "phase-context",
      })).resolves.toMatchObject({
        scopeType: "slice",
        scopeId: "S01",
        artifactType: "phase-context",
      });
      await expect(adapter.readArtifact({
        scopeType: "milestone",
        scopeId: "M001",
        artifactType: "context",
      })).resolves.toMatchObject({
        scopeType: "milestone",
        scopeId: "M001",
        artifactType: "context",
      });

      await expect(adapter.writeArtifact({
        scopeType: "slice",
        scopeId: "S01",
        artifactType: "summary",
        title: "Slice Summary",
        content: "Completed.",
        format: "markdown",
      })).resolves.toMatchObject({
        scopeType: "slice",
        scopeId: "S01",
        artifactType: "summary",
      });
      expect(documentContent.get("S01-SUMMARY")).toBe("Completed.");
      await expect(adapter.writeArtifact({
        scopeType: "milestone",
        scopeId: "M001",
        artifactType: "summary",
        title: "Milestone Summary",
        content: "Milestone complete.",
        format: "markdown",
      })).resolves.toMatchObject({
        scopeType: "milestone",
        scopeId: "M001",
        artifactType: "summary",
      });
      expect(documentContent.get("M001-SUMMARY")).toBe("Milestone complete.");

      await expect(adapter.getExecutionStatus()).resolves.toEqual({
        queueDepth: 1,
        activeWorkers: 1,
        escalations: [
          {
            requestId: "blocker-1",
            issueId: "S01",
            summary: "Waiting on human review",
          },
        ],
      });

      expect(runtimeBackendFactory).toHaveBeenCalledTimes(1);
      expect(runtimeBackend.listSlices).toHaveBeenCalledWith({ milestoneId: "M001" });
      expect(runtimeBackend.listDocuments).toHaveBeenCalledWith({ issueId: "S01" });
      expect(runtimeBackend.listDocuments).toHaveBeenCalledWith(undefined);
      expect(runtimeBackend.readDocument).toHaveBeenCalledWith("M001-CONTEXT", undefined);
      expect(runtimeBackend.writeDocument).toHaveBeenCalledWith("M001-SUMMARY", "Milestone complete.", undefined);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("uses the default static runtime backend factory when no override is provided", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "kata-runtime-default-factory-"));
    const preferencesPath = join(workspace, ".kata", "preferences.md");

    mkdirSync(join(workspace, ".kata"), { recursive: true });
    writeFileSync(preferencesPath, `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata-mono
  stateMode: projects_v2
  githubProjectNumber: 12
---
`, "utf8");

    const runtimeBackend = {
      isLinearMode: false,
      deriveState: vi.fn(async () => ({
        activeSlice: { id: "S01" },
        phase: "planning",
        blockers: [],
      })),
      listSlices: vi.fn(async () => []),
      listTasks: vi.fn(async () => []),
      listDocuments: vi.fn(async () => []),
      readDocument: vi.fn(async () => null),
      writeDocument: vi.fn(async () => undefined),
    };
    const createBackend = vi.fn(async () => runtimeBackend);

    try {
      vi.resetModules();
      vi.doMock("../../resources/extensions/kata/backend-factory.js", () => ({
        createBackend,
      }));

      const { resolveBackend: resolveBackendWithMockedDefault } = await import("../../backends/resolve-backend.js");
      const adapter = await resolveBackendWithMockedDefault({ workspacePath: workspace });
      await expect(adapter.getExecutionStatus()).resolves.toEqual({
        queueDepth: 0,
        activeWorkers: 0,
        escalations: [],
      });

      expect(createBackend).toHaveBeenCalledTimes(1);
      expect(createBackend).toHaveBeenCalledWith(workspace);
    } finally {
      vi.doUnmock("../../resources/extensions/kata/backend-factory.js");
      vi.resetModules();
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe("readTrackerConfig", () => {
  it("rejects GitHub label mode with an explicit projects_v2 remediation", async () => {
    await expect(
      readTrackerConfig({
        preferencesContent: `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata
  stateMode: labels
  githubProjectNumber: 12
---`,
      }),
    ).rejects.toThrowError(
      /GitHub label mode is no longer supported.*Use github\.stateMode: projects_v2 and set github\.githubProjectNumber\./,
    );
  });

  it("rejects missing github.stateMode with explicit projects_v2 remediation", async () => {
    await expect(
      readTrackerConfig({
        preferencesContent: `---
workflow:
  mode: github
github:
  repoOwner: kata-sh
  repoName: kata
  githubProjectNumber: 12
---`,
      }),
    ).rejects.toThrowError(
      /github\.stateMode is required and must be projects_v2.*Set github\.stateMode: projects_v2 and github\.githubProjectNumber to a positive integer\./,
    );
  });
});
