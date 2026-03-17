/**
 * Unit tests for linear-state.ts — deriveLinearState and listKataMilestones.
 *
 * No API key required. No network calls.
 * Uses inline mock clients following the pattern in entity-mapping.test.ts.
 *
 * Usage:
 *   node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
 *     --experimental-strip-types --test \
 *     src/resources/extensions/linear/tests/linear-state.test.ts
 */

import assert from "node:assert/strict";
import { listKataMilestones } from "../linear-entities.ts";
import { deriveLinearState } from "../linear-state.ts";
import type { LinearMilestone, LinearIssue, LinearWorkflowState } from "../linear-types.ts";
import type { LinearStateClient } from "../linear-state.ts";

// =============================================================================
// Mock builder helpers
// =============================================================================

function makeState(
  type: LinearWorkflowState["type"],
  name = type,
  id = `state-${type}`
): LinearWorkflowState {
  return { id, name, type, color: "#000000", position: 0 };
}

function makeMilestone(
  name: string,
  sortOrder = 0,
  id = `milestone-${name}`
): LinearMilestone {
  return {
    id,
    name,
    sortOrder,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
}

type ChildNode = LinearIssue["children"]["nodes"][number];

function makeChildNode(title: string, stateType: LinearWorkflowState["type"]): ChildNode {
  return {
    id: `child-${title}`,
    identifier: `KAT-child-${title}`,
    title,
    state: makeState(stateType),
  };
}

function makeIssue(
  title: string,
  stateType: LinearWorkflowState["type"],
  opts: {
    milestoneId?: string;
    children?: ChildNode[];
    id?: string;
  } = {}
): LinearIssue {
  return {
    id: opts.id ?? `issue-${title}`,
    identifier: `KAT-${title}`,
    title,
    priority: 0,
    url: `https://linear.app/test/issue/KAT-${title}`,
    state: makeState(stateType),
    labels: [],
    children: { nodes: opts.children ?? [] },
    projectMilestone: opts.milestoneId
      ? { id: opts.milestoneId, name: "Milestone" }
      : null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
}

/**
 * Build a minimal LinearStateClient mock.
 * Supply the milestones/issues to return.
 */
function makeMockStateClient(
  milestones: LinearMilestone[],
  issues: LinearIssue[]
): LinearStateClient {
  return {
    async listMilestones(_projectId: string): Promise<LinearMilestone[]> {
      return milestones;
    },
    async listIssues(_filter: object): Promise<LinearIssue[]> {
      return issues;
    },
  };
}

const BASE_CONFIG = {
  projectId: "proj-1",
  teamId: "team-1",
  sliceLabelId: "label-slice",
  // Use /tmp so getActiveSliceBranch doesn't error on the test environment
  basePath: "/tmp",
};

// =============================================================================
// listKataMilestones — delegates to client.listMilestones
// =============================================================================

describe("listKataMilestones", () => {
  it("delegates to client.listMilestones with the given projectId", async () => {
    const captured: string[] = [];
    const m1 = makeMilestone("[M001] First milestone");
    const m2 = makeMilestone("[M002] Second milestone", 1);

    const client = {
      async listMilestones(projectId: string): Promise<LinearMilestone[]> {
        captured.push(projectId);
        return [m1, m2];
      },
    };

    const result = await listKataMilestones(client, "proj-test");
    assert.equal(captured.length, 1);
    assert.equal(captured[0], "proj-test");
    assert.equal(result.length, 2);
    assert.equal(result[0].id, m1.id);
    assert.equal(result[1].id, m2.id);
  });

  it("sorts milestones by sortOrder regardless of API return order", async () => {
    const m3 = makeMilestone("[M003] Third", 2111);
    const m1 = makeMilestone("[M001] First", -8);
    const m2 = makeMilestone("[M002] Second", 1041);

    const client = {
      async listMilestones(_projectId: string): Promise<LinearMilestone[]> {
        return [m3, m1, m2]; // API returns out of order
      },
    };

    const result = await listKataMilestones(client, "proj-test");
    assert.equal(result.length, 3);
    assert.equal(result[0].sortOrder, -8);
    assert.equal(result[1].sortOrder, 1041);
    assert.equal(result[2].sortOrder, 2111);
  });

  it("returns empty array when no milestones exist", async () => {
    const client = {
      async listMilestones(_projectId: string): Promise<LinearMilestone[]> {
        return [];
      },
    };
    const result = await listKataMilestones(client, "proj-empty");
    assert.deepEqual(result, []);
  });
});

// =============================================================================
// deriveLinearState — no milestones
// =============================================================================

describe("deriveLinearState: no milestones", () => {
  it("returns phase pre-planning, activeMilestone null, empty registry", async () => {
    const client = makeMockStateClient([], []);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "pre-planning");
    assert.equal(state.activeMilestone, null);
    assert.equal(state.activeSlice, null);
    assert.equal(state.activeTask, null);
    assert.deepEqual(state.registry, []);
    assert.equal(state.requirements, undefined);
  });

  it("returns milestones progress 0/0", async () => {
    const client = makeMockStateClient([], []);
    const state = await deriveLinearState(client, BASE_CONFIG);
    assert.deepEqual(state.progress?.milestones, { done: 0, total: 0 });
  });
});

// =============================================================================
// deriveLinearState — milestones with no slices
// =============================================================================

describe("deriveLinearState: milestones with no slices", () => {
  it("returns phase pre-planning, active milestone set, activeSlice null", async () => {
    const m1 = makeMilestone("[M001] Bootstrap", 0, "mid-1");
    const client = makeMockStateClient([m1], []);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "pre-planning");
    assert.ok(state.activeMilestone, "activeMilestone should be set");
    assert.equal(state.activeMilestone.id, "M001");
    assert.equal(state.activeMilestone.title, "Bootstrap");
    assert.equal(state.activeSlice, null);
    assert.equal(state.activeTask, null);
  });

  it("registry has one active entry", async () => {
    const m1 = makeMilestone("[M001] Bootstrap", 0, "mid-1");
    const client = makeMockStateClient([m1], []);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.registry.length, 1);
    assert.equal(state.registry[0].id, "M001");
    assert.equal(state.registry[0].status, "active");
  });

  it("multiple milestones: first is active, rest are pending", async () => {
    const m1 = makeMilestone("[M001] First", 0, "mid-1");
    const m2 = makeMilestone("[M002] Second", 1, "mid-2");
    const client = makeMockStateClient([m1, m2], []);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.registry[0].status, "active");
    assert.equal(state.registry[1].status, "pending");
  });

  it("selects M001 as active when milestones arrive out of sortOrder", async () => {
    // Simulates the real bug: API returns M003 first (highest sortOrder)
    const m3 = makeMilestone("[M003] Polish", 2111, "mid-3");
    const m1 = makeMilestone("[M001] Core Shell", -8, "mid-1");
    const m2 = makeMilestone("[M002] Extended Views", 1041, "mid-2");
    const client = makeMockStateClient([m3, m1, m2], []);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.ok(state.activeMilestone);
    assert.equal(state.activeMilestone.id, "M001");
    assert.equal(state.registry[0].id, "M001");
    assert.equal(state.registry[0].status, "active");
    assert.equal(state.registry[1].id, "M002");
    assert.equal(state.registry[1].status, "pending");
    assert.equal(state.registry[2].id, "M003");
    assert.equal(state.registry[2].status, "pending");
  });
});

// =============================================================================
// deriveLinearState — all milestones complete
// =============================================================================

describe("deriveLinearState: all milestones complete", () => {
  it("returns phase complete, activeMilestone null", async () => {
    const m1 = makeMilestone("[M001] Done milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Completed slice", "completed", { milestoneId: "mid-1" });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "complete");
    assert.equal(state.activeMilestone, null);
    assert.equal(state.activeSlice, null);
    assert.equal(state.activeTask, null);
  });

  it("registry has all complete entries", async () => {
    const m1 = makeMilestone("[M001] Done", 0, "mid-1");
    const m2 = makeMilestone("[M002] Also done", 1, "mid-2");
    const s1 = makeIssue("[S01] Slice", "completed", { milestoneId: "mid-1" });
    const s2 = makeIssue("[S01] Slice", "canceled", { milestoneId: "mid-2" });
    const client = makeMockStateClient([m1, m2], [s1, s2]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.registry.length, 2);
    assert.equal(state.registry[0].status, "complete");
    assert.equal(state.registry[1].status, "complete");
  });

  it("canceled slices count as terminal (milestone complete)", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Canceled slice", "canceled", { milestoneId: "mid-1" });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "complete");
    assert.equal(state.registry[0].status, "complete");
  });

  it("progress milestones done/total is correct", async () => {
    const m1 = makeMilestone("[M001] Done", 0, "mid-1");
    const m2 = makeMilestone("[M002] Also done", 1, "mid-2");
    const s1 = makeIssue("[S01] Slice", "completed", { milestoneId: "mid-1" });
    const s2 = makeIssue("[S01] Slice", "completed", { milestoneId: "mid-2" });
    const client = makeMockStateClient([m1, m2], [s1, s2]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.deepEqual(state.progress?.milestones, { done: 2, total: 2 });
  });
});

// =============================================================================
// deriveLinearState — active slice with state type backlog → planning
// =============================================================================

describe("deriveLinearState: active slice with state backlog → planning", () => {
  it("returns phase planning", async () => {
    const m1 = makeMilestone("[M001] Active milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Planning slice", "backlog", { milestoneId: "mid-1" });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "planning");
    assert.ok(state.activeMilestone);
    assert.ok(state.activeSlice);
    assert.equal(state.activeSlice.id, "S01");
    assert.equal(state.activeSlice.title, "Planning slice");
  });

  it("selects the lowest non-terminal slice ID when API returns unsorted slices", async () => {
    const m1 = makeMilestone("[M001] Active milestone", 0, "mid-1");
    const s3 = makeIssue("[S03] Later slice", "backlog", { milestoneId: "mid-1" });
    const s1 = makeIssue("[S01] First slice", "backlog", { milestoneId: "mid-1" });
    const s2 = makeIssue("[S02] Middle slice", "backlog", { milestoneId: "mid-1" });
    // Intentionally unsorted API order
    const client = makeMockStateClient([m1], [s3, s1, s2]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.ok(state.activeSlice);
    assert.equal(state.activeSlice.id, "S01");
    assert.equal(state.activeSlice.title, "First slice");
  });

  it("activeTask is null in planning phase (no children inspected)", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Backlog slice", "backlog", {
      milestoneId: "mid-1",
      children: [makeChildNode("[T01] Some task", "backlog")],
    });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "planning");
    assert.equal(state.activeTask, null);
  });
});

// =============================================================================
// deriveLinearState — active slice with state type unstarted → planning
// =============================================================================

describe("deriveLinearState: active slice with state unstarted → planning", () => {
  it("returns phase planning", async () => {
    const m1 = makeMilestone("[M001] Active milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Todo slice", "unstarted", { milestoneId: "mid-1" });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "planning");
    assert.equal(state.activeTask, null);
  });
});

// =============================================================================
// deriveLinearState — started slice, 0 children → executing
// =============================================================================

describe("deriveLinearState: active slice started, 0 children → executing", () => {
  it("returns phase executing, activeTask null", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] In progress slice", "started", {
      milestoneId: "mid-1",
      children: [],
    });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "executing");
    assert.equal(state.activeTask, null);
  });

  it("tasks progress is undefined when no children", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] In progress", "started", { milestoneId: "mid-1", children: [] });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.progress?.tasks, undefined);
  });
});

// =============================================================================
// deriveLinearState — started slice, no terminal children → executing
// =============================================================================

describe("deriveLinearState: active slice started, children exist but none terminal → executing", () => {
  it("returns phase executing, first non-terminal child as activeTask", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] In progress", "started", {
      milestoneId: "mid-1",
      children: [
        makeChildNode("[T01] First task", "started"),
        makeChildNode("[T02] Second task", "backlog"),
      ],
    });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "executing");
    assert.ok(state.activeTask, "activeTask should be set");
    assert.equal(state.activeTask.id, "T01");
    assert.equal(state.activeTask.title, "First task");
  });

  it("selects the lowest non-terminal task ID when children are unsorted", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] In progress", "started", {
      milestoneId: "mid-1",
      children: [
        makeChildNode("[T03] Third task", "backlog"),
        makeChildNode("[T01] First task", "started"),
        makeChildNode("[T02] Second task", "backlog"),
      ],
    });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "executing");
    assert.ok(state.activeTask, "activeTask should be set");
    assert.equal(state.activeTask.id, "T01");
    assert.equal(state.activeTask.title, "First task");
  });
});

// =============================================================================
// deriveLinearState — started slice, some terminal children → verifying
// =============================================================================

describe("deriveLinearState: active slice started, some children terminal → verifying", () => {
  it("returns phase verifying", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Verifying slice", "started", {
      milestoneId: "mid-1",
      children: [
        makeChildNode("[T01] Done task", "completed"),
        makeChildNode("[T02] In progress task", "started"),
        makeChildNode("[T03] Todo task", "backlog"),
      ],
    });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "verifying");
  });

  it("activeTask is the first non-terminal child", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Slice", "started", {
      milestoneId: "mid-1",
      children: [
        makeChildNode("[T01] Completed task", "completed"),
        makeChildNode("[T02] Active task", "started"),
        makeChildNode("[T03] Pending task", "backlog"),
      ],
    });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.ok(state.activeTask);
    assert.equal(state.activeTask.id, "T02");
    assert.equal(state.activeTask.title, "Active task");
  });

  it("tasks progress shows done/total correctly", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Slice", "started", {
      milestoneId: "mid-1",
      children: [
        makeChildNode("[T01] Done", "completed"),
        makeChildNode("[T02] Active", "started"),
        makeChildNode("[T03] Todo", "backlog"),
      ],
    });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.deepEqual(state.progress?.tasks, { done: 1, total: 3 });
  });
});

// =============================================================================
// deriveLinearState — started slice, all children terminal → summarizing
// =============================================================================

describe("deriveLinearState: active slice started, all children terminal → summarizing", () => {
  it("returns phase summarizing", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Summarizing slice", "started", {
      milestoneId: "mid-1",
      children: [
        makeChildNode("[T01] Done task", "completed"),
        makeChildNode("[T02] Also done", "completed"),
      ],
    });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "summarizing");
  });

  it("activeTask is null in summarizing phase", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Slice", "started", {
      milestoneId: "mid-1",
      children: [
        makeChildNode("[T01] Done", "completed"),
        makeChildNode("[T02] Canceled", "canceled"),
      ],
    });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.phase, "summarizing");
    assert.equal(state.activeTask, null);
  });

  it("tasks progress shows all done", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Slice", "started", {
      milestoneId: "mid-1",
      children: [
        makeChildNode("[T01] Done", "completed"),
        makeChildNode("[T02] Done", "completed"),
        makeChildNode("[T03] Canceled", "canceled"),
      ],
    });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.deepEqual(state.progress?.tasks, { done: 3, total: 3 });
  });
});

// =============================================================================
// parseKataEntityTitle used for registry IDs and slice/task refs
// =============================================================================

describe("deriveLinearState: parseKataEntityTitle applied to milestone/slice/task names", () => {
  it("extracts kataId from milestone name for registry entry", async () => {
    const m1 = makeMilestone("[M001] My milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Active slice", "started", { milestoneId: "mid-1" });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.registry[0].id, "M001");
    assert.equal(state.registry[0].title, "My milestone");
  });

  it("extracts kataId from slice issue title for activeSlice", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S03] Entity mapping", "started", { milestoneId: "mid-1" });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.ok(state.activeSlice);
    assert.equal(state.activeSlice.id, "S03");
    assert.equal(state.activeSlice.title, "Entity mapping");
  });

  it("extracts kataId from child issue title for activeTask", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Slice", "started", {
      milestoneId: "mid-1",
      children: [makeChildNode("[T02] Register tools", "started")],
    });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.ok(state.activeTask);
    assert.equal(state.activeTask.id, "T02");
    assert.equal(state.activeTask.title, "Register tools");
  });

  it("falls back to raw id/title when title has no bracket prefix", async () => {
    const m1 = makeMilestone("Plain milestone name", 0, "mid-plain");
    const client = makeMockStateClient([m1], []);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.registry[0].id, "mid-plain");
    assert.equal(state.registry[0].title, "Plain milestone name");
  });
});

// =============================================================================
// progress counts — comprehensive
// =============================================================================

describe("deriveLinearState: progress counts", () => {
  it("milestones done/total reflects completed vs total count", async () => {
    const m1 = makeMilestone("[M001] Done", 0, "mid-1");
    const m2 = makeMilestone("[M002] Active", 1, "mid-2");
    const m3 = makeMilestone("[M003] Pending", 2, "mid-3");
    const s1 = makeIssue("[S01] Slice", "completed", { milestoneId: "mid-1" });
    const s2 = makeIssue("[S01] Active slice", "started", { milestoneId: "mid-2" });
    // m3 has no slices
    const client = makeMockStateClient([m1, m2, m3], [s1, s2]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.deepEqual(state.progress?.milestones, { done: 1, total: 3 });
  });

  it("slices done/total counts all terminal slices across project", async () => {
    const m1 = makeMilestone("[M001] Done", 0, "mid-1");
    const m2 = makeMilestone("[M002] Active", 1, "mid-2");
    const s1 = makeIssue("[S01] Done slice", "completed", { milestoneId: "mid-1" });
    const s2 = makeIssue("[S01] Active slice", "started", { milestoneId: "mid-2" });
    const s3 = makeIssue("[S02] Pending slice", "backlog", { milestoneId: "mid-2" });
    const client = makeMockStateClient([m1, m2], [s1, s2, s3]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.deepEqual(state.progress?.slices, { done: 1, total: 3 });
  });

  it("registry: first milestone complete, second active, third pending", async () => {
    const m1 = makeMilestone("[M001] Done", 0, "mid-1");
    const m2 = makeMilestone("[M002] Active", 1, "mid-2");
    const m3 = makeMilestone("[M003] Pending", 2, "mid-3");
    const s1 = makeIssue("[S01] Slice", "completed", { milestoneId: "mid-1" });
    const s2 = makeIssue("[S01] Active slice", "started", { milestoneId: "mid-2" });
    const client = makeMockStateClient([m1, m2, m3], [s1, s2]);
    const state = await deriveLinearState(client, BASE_CONFIG);

    assert.equal(state.registry[0].status, "complete");
    assert.equal(state.registry[1].status, "active");
    assert.equal(state.registry[2].status, "pending");
  });
});

// =============================================================================
// requirements always undefined
// =============================================================================

describe("deriveLinearState: requirements field", () => {
  it("is always undefined (no REQUIREMENTS.md in Linear mode)", async () => {
    const client = makeMockStateClient([], []);
    const state = await deriveLinearState(client, BASE_CONFIG);
    assert.equal(state.requirements, undefined);
  });

  it("is undefined even with a full active milestone/slice", async () => {
    const m1 = makeMilestone("[M001] Milestone", 0, "mid-1");
    const s1 = makeIssue("[S01] Slice", "started", { milestoneId: "mid-1" });
    const client = makeMockStateClient([m1], [s1]);
    const state = await deriveLinearState(client, BASE_CONFIG);
    assert.equal(state.requirements, undefined);
  });
});
