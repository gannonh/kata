import { describe, expect, it, vi } from "vitest";

import { GithubProjectsV2Adapter } from "../../backends/github-projects-v2/adapter.js";
import { LinearKataAdapter } from "../../backends/linear/adapter.js";

describe("GithubProjectsV2Adapter", () => {
  it("normalizes GitHub issue state into canonical slice/task status names", async () => {
    const adapter = new GithubProjectsV2Adapter({
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
    } as any);

    const slices = await adapter.listSlices({ milestoneId: "M003" });
    const tasks = await adapter.listTasks({ sliceId: "42" });

    expect(slices[0]).toMatchObject({ id: "42", status: "todo", milestoneId: "M003" });
    expect(tasks[0]).toMatchObject({ id: "99", sliceId: "42", status: "todo" });
  });
});

describe("LinearKataAdapter", () => {
  it("normalizes Linear issue state into the same canonical status names", async () => {
    const adapter = new LinearKataAdapter({
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
    } as any);

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
