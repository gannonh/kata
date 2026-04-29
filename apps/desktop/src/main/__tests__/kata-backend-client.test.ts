import { describe, expect, it, vi } from "vitest";

import { KataBackendClient } from "../kata-backend-client";

describe("KataBackendClient", () => {
  it("maps canonical slices and tasks into WorkflowBoardSnapshot", async () => {
    const client = new KataBackendClient({
      project: { getContext: vi.fn(async () => ({ backend: "github", workspacePath: "/tmp/repo" })) },
      milestone: {
        getActive: vi.fn(async () => ({
          id: "M003",
          title: "[M003] Skill Platform",
          goal: "Goal",
          status: "active",
          active: true,
        })),
      },
      slice: {
        list: vi.fn(async () => [
          { id: "S01", milestoneId: "M003", title: "[S01] Contract", goal: "Goal", status: "todo", order: 0 },
        ]),
      },
      task: {
        list: vi.fn(async () => [
          { id: "T01", sliceId: "S01", title: "[T01] Build contract", description: "Desc", status: "todo", verificationState: "pending" },
        ]),
      },
      artifact: { list: vi.fn(async () => []), read: vi.fn(), write: vi.fn() },
      execution: { getStatus: vi.fn(async () => ({ queueDepth: 1, activeWorkers: 2, escalations: [] })) },
    } as any);

    const snapshot = await client.getBoardSnapshot();
    expect(snapshot.backend).toBe("github");
    expect(snapshot.columns.find((column) => column.id === "todo")?.cards[0]?.title).toBe("[S01] Contract");
    expect(snapshot.columns.find((column) => column.id === "todo")?.cards[0]?.tasks[0]?.title).toBe(
      "[T01] Build contract",
    );
  });
});
