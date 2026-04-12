/**
 * Unit tests for linear-entities.ts — pure mapping functions.
 *
 * No API key required. No network calls.
 *
 * Usage:
 *   node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
 *     --experimental-strip-types --test \
 *     src/resources/extensions/linear/tests/entity-mapping.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  formatKataEntityTitle,
  parseKataEntityTitle,
  getLinearStateTypeForKataPhase,
  getKataPhaseFromLinearStateType,
  getLinearStateForKataPhase,
  ensureKataLabels,
  createKataMilestone,
  createKataSlice,
  createKataTask,
  listKataSlices,
} from "../linear-entities.js";
import type { LinearWorkflowState, LinearLabel, LinearIssue, LinearMilestone } from "../linear-types.js";

// =============================================================================
// Title formatting — format + round-trip
// =============================================================================

describe("formatKataEntityTitle", () => {
  it("formats milestone ID and title", () => {
    expect(formatKataEntityTitle("M001", "Scaffold integration")).toBe("[M001] Scaffold integration");
  });

  it("formats slice ID and title", () => {
    expect(formatKataEntityTitle("S01", "Slice name")).toBe("[S01] Slice name");
  });

  it("formats task ID and title", () => {
    expect(formatKataEntityTitle("T01", "Task title")).toBe("[T01] Task title");
  });

  it("round-trips: formatKataEntityTitle → parseKataEntityTitle recovers original values", () => {
    const formatted = formatKataEntityTitle("M001", "My milestone");
    const parsed = parseKataEntityTitle(formatted);
    expect(parsed).toEqual({ kataId: "M001", title: "My milestone" });
  });

  it("round-trips a slice", () => {
    const formatted = formatKataEntityTitle("S03", "Entity mapping");
    const parsed = parseKataEntityTitle(formatted);
    expect(parsed).toEqual({ kataId: "S03", title: "Entity mapping" });
  });

  it("round-trips a task", () => {
    const formatted = formatKataEntityTitle("T04", "Register tools");
    const parsed = parseKataEntityTitle(formatted);
    expect(parsed).toEqual({ kataId: "T04", title: "Register tools" });
  });
});

// =============================================================================
// parseKataEntityTitle — valid + invalid inputs
// =============================================================================

describe("parseKataEntityTitle", () => {
  it("parses a valid milestone title", () => {
    expect(parseKataEntityTitle("[M001] Scaffold integration")).toEqual({
      kataId: "M001",
      title: "Scaffold integration",
    });
  });

  it("parses a valid slice title", () => {
    expect(parseKataEntityTitle("[S01] Slice name")).toEqual({
      kataId: "S01",
      title: "Slice name",
    });
  });

  it("parses a valid task title with multiple words", () => {
    expect(parseKataEntityTitle("[T01] Types, title conventions, and phase-state mapping")).toEqual({
      kataId: "T01",
      title: "Types, title conventions, and phase-state mapping",
    });
  });

  it("returns null for a plain title with no bracket prefix", () => {
    expect(parseKataEntityTitle("plain title")).toBe(null);
  });

  it("returns null for empty string", () => {
    expect(parseKataEntityTitle("")).toBe(null);
  });

  it("returns null when bracket prefix has no following space+text", () => {
    expect(parseKataEntityTitle("[M001]")).toBe(null);
  });

  it("returns null for a title that starts with a bracket but has wrong format", () => {
    expect(parseKataEntityTitle("[no-close-bracket title")).toBe(null);
  });

  it("returns null for lowercase id (convention uses uppercase)", () => {
    // Our regex requires [A-Z0-9]+ — lowercase IDs don't match
    expect(parseKataEntityTitle("[s01] lowercase slice")).toBe(null);
  });
});

// =============================================================================
// getLinearStateTypeForKataPhase — forward mapping
// =============================================================================

describe("getLinearStateTypeForKataPhase", () => {
  it("backlog → backlog", () => {
    expect(getLinearStateTypeForKataPhase("backlog")).toBe("backlog");
  });

  it("planning → unstarted", () => {
    expect(getLinearStateTypeForKataPhase("planning")).toBe("unstarted");
  });

  it("executing → started", () => {
    expect(getLinearStateTypeForKataPhase("executing")).toBe("started");
  });

  it("verifying → started", () => {
    expect(getLinearStateTypeForKataPhase("verifying")).toBe("started");
  });

  it("done → completed", () => {
    expect(getLinearStateTypeForKataPhase("done")).toBe("completed");
  });
});

// =============================================================================
// getKataPhaseFromLinearStateType — reverse mapping
// =============================================================================

describe("getKataPhaseFromLinearStateType", () => {
  it("backlog → backlog", () => {
    expect(getKataPhaseFromLinearStateType("backlog")).toBe("backlog");
  });

  it("unstarted → planning", () => {
    expect(getKataPhaseFromLinearStateType("unstarted")).toBe("planning");
  });

  it("started → executing", () => {
    expect(getKataPhaseFromLinearStateType("started")).toBe("executing");
  });

  it("completed → done", () => {
    expect(getKataPhaseFromLinearStateType("completed")).toBe("done");
  });

  it("canceled → done (treated as terminal)", () => {
    expect(getKataPhaseFromLinearStateType("canceled")).toBe("done");
  });
});

// =============================================================================
// getLinearStateForKataPhase — state selection from a list
// =============================================================================

function makeState(
  type: LinearWorkflowState["type"],
  name: string,
  id = `state-${type}`
): LinearWorkflowState {
  return { id, name, type, color: "#000000", position: 0 };
}

describe("getLinearStateForKataPhase", () => {
  const states: LinearWorkflowState[] = [
    makeState("backlog", "Backlog", "id-backlog"),
    makeState("unstarted", "Todo", "id-unstarted"),
    makeState("started", "In Progress", "id-started"),
    makeState("completed", "Done", "id-completed"),
    makeState("canceled", "Cancelled", "id-canceled"),
  ];

  it("returns null for an empty list", () => {
    expect(getLinearStateForKataPhase([], "executing")).toBe(null);
  });

  it("returns null when no state matches the required type", () => {
    const onlyBacklog = [makeState("backlog", "Backlog")];
    expect(getLinearStateForKataPhase(onlyBacklog, "executing")).toBe(null);
  });

  it("returns the matching state for executing (type=started)", () => {
    const result = getLinearStateForKataPhase(states, "executing");
    expect(result).toBeTruthy();
    expect(result.id).toBe("id-started");
    expect(result.type).toBe("started");
  });

  it("returns the matching state for verifying (type=started)", () => {
    const result = getLinearStateForKataPhase(states, "verifying");
    expect(result).toBeTruthy();
    expect(result.type).toBe("started");
  });

  it("returns the matching state for planning (type=unstarted)", () => {
    const result = getLinearStateForKataPhase(states, "planning");
    expect(result).toBeTruthy();
    expect(result.id).toBe("id-unstarted");
  });

  it("returns the matching state for done (type=completed)", () => {
    const result = getLinearStateForKataPhase(states, "done");
    expect(result).toBeTruthy();
    expect(result.id).toBe("id-completed");
  });

  it("returns the matching state for backlog", () => {
    const result = getLinearStateForKataPhase(states, "backlog");
    expect(result).toBeTruthy();
    expect(result.id).toBe("id-backlog");
  });

  it("prefers progress-like started state for executing", () => {
    const twoStarted: LinearWorkflowState[] = [
      makeState("started", "In Review", "started-review"),
      makeState("started", "In Progress", "started-progress"),
    ];
    const result = getLinearStateForKataPhase(twoStarted, "executing");
    expect(result).toBeTruthy();
    expect(result.id).toBe("started-progress");
  });

  it("also prefers progress-like started state for verifying", () => {
    const twoStarted: LinearWorkflowState[] = [
      makeState("started", "In Review", "started-review"),
      makeState("started", "In Progress", "started-progress"),
    ];
    const result = getLinearStateForKataPhase(twoStarted, "verifying");
    expect(result).toBeTruthy();
    expect(result.id).toBe("started-progress");
  });
});

// =============================================================================
// T02 — Mock helpers
// =============================================================================

function makeLabel(name: string, color = "#000000"): LinearLabel {
  return { id: `label-${name}`, name, color, isGroup: false };
}

function makeMilestone(name: string): LinearMilestone {
  return {
    id: "milestone-id",
    name,
    sortOrder: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
}

function makeIssue(title: string, extra: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: "issue-id",
    identifier: "KAT-1",
    title,
    priority: 0,
    url: "https://linear.app/test/issue/KAT-1",
    state: makeState("backlog", "Backlog", "state-id"),
    labels: [],
    children: { nodes: [] },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...extra,
  };
}

/**
 * Build a spy mock client that records all calls and returns predictable fixtures.
 */
function makeMockClient() {
  const ensureLabelCalls: Array<{ name: string; opts?: { teamId?: string; color?: string; description?: string } }> = [];
  const createMilestoneCalls: Array<{ name: string; projectId: string; description?: string; targetDate?: string }> = [];
  const createIssueCalls: Array<Record<string, unknown>> = [];

  const client = {
    async ensureLabel(name: string, opts?: { teamId?: string; color?: string; description?: string }): Promise<LinearLabel> {
      ensureLabelCalls.push({ name, opts });
      return makeLabel(name, opts?.color ?? "#000000");
    },
    async createMilestone(input: { name: string; projectId: string; description?: string; targetDate?: string }): Promise<LinearMilestone> {
      createMilestoneCalls.push(input);
      return makeMilestone(input.name);
    },
    async createIssue(input: Record<string, unknown>): Promise<LinearIssue> {
      createIssueCalls.push(input);
      return makeIssue(input.title as string);
    },
  };

  return { client, ensureLabelCalls, createMilestoneCalls, createIssueCalls };
}

// =============================================================================
// ensureKataLabels
// =============================================================================

describe("ensureKataLabels", () => {
  it("calls ensureLabel for all three kata labels", async () => {
    const { client, ensureLabelCalls } = makeMockClient();
    await ensureKataLabels(client, "team-abc");
    const names = ensureLabelCalls.map((c) => c.name);
    expect(names.includes("kata:milestone")).toBeTruthy();
    expect(names.includes("kata:slice")).toBeTruthy();
    expect(names.includes("kata:task")).toBeTruthy();
    expect(ensureLabelCalls.length).toBe(3);
  });

  it("passes the teamId to each ensureLabel call", async () => {
    const { client, ensureLabelCalls } = makeMockClient();
    await ensureKataLabels(client, "team-xyz");
    for (const call of ensureLabelCalls) {
      expect(call.opts?.teamId).toBe("team-xyz");
    }
  });

  it("passes fixed colors: #7C3AED for milestone, #2563EB for slice, #16A34A for task", async () => {
    const { client, ensureLabelCalls } = makeMockClient();
    await ensureKataLabels(client, "team-colors");
    const byName = Object.fromEntries(ensureLabelCalls.map((c) => [c.name, c.opts?.color]));
    expect(byName["kata:milestone"]).toBe("#7C3AED");
    expect(byName["kata:slice"]).toBe("#2563EB");
    expect(byName["kata:task"]).toBe("#16A34A");
  });

  it("returns a KataLabelSet with milestone, slice, and task labels", async () => {
    const { client } = makeMockClient();
    const labelSet = await ensureKataLabels(client, "team-labelset");
    expect(labelSet.milestone.name).toBe("kata:milestone");
    expect(labelSet.slice.name).toBe("kata:slice");
    expect(labelSet.task.name).toBe("kata:task");
  });

  it("returns the label IDs from ensureLabel (uses existing if already present)", async () => {
    const { client } = makeMockClient();
    const labelSet = await ensureKataLabels(client, "team-label-ids");
    // The mock generates IDs as `label-<name>`
    expect(labelSet.milestone.id).toBe("label-kata:milestone");
    expect(labelSet.slice.id).toBe("label-kata:slice");
    expect(labelSet.task.id).toBe("label-kata:task");
  });
});

// =============================================================================
// createKataMilestone
// =============================================================================

describe("createKataMilestone", () => {
  it("formats the milestone name with bracket prefix", async () => {
    const { client, createMilestoneCalls } = makeMockClient();
    await createKataMilestone(client, { projectId: "proj-1" }, {
      kataId: "M001",
      title: "Scaffold integration",
    });
    expect(createMilestoneCalls.length).toBe(1);
    expect(createMilestoneCalls[0].name).toBe("[M001] Scaffold integration");
  });

  it("passes projectId to createMilestone", async () => {
    const { client, createMilestoneCalls } = makeMockClient();
    await createKataMilestone(client, { projectId: "proj-42" }, {
      kataId: "M002",
      title: "Phase two",
    });
    expect(createMilestoneCalls[0].projectId).toBe("proj-42");
  });

  it("passes optional description and targetDate when provided", async () => {
    const { client, createMilestoneCalls } = makeMockClient();
    await createKataMilestone(client, { projectId: "proj-1" }, {
      kataId: "M001",
      title: "With extras",
      description: "Milestone description",
      targetDate: "2025-06-30",
    });
    expect(createMilestoneCalls[0].description).toBe("Milestone description");
    expect(createMilestoneCalls[0].targetDate).toBe("2025-06-30");
  });

  it("does NOT receive or use a KataLabelSet — no ensureLabel calls", async () => {
    const { client, ensureLabelCalls } = makeMockClient();
    await createKataMilestone(client, { projectId: "proj-1" }, {
      kataId: "M001",
      title: "No labels",
    });
    expect(ensureLabelCalls.length).toBe(0);
  });

  it("returns the LinearMilestone from createMilestone", async () => {
    const { client } = makeMockClient();
    const result = await createKataMilestone(client, { projectId: "proj-1" }, {
      kataId: "M001",
      title: "Returned milestone",
    });
    expect(result.name).toBe("[M001] Returned milestone");
    expect(result.id).toBe("milestone-id");
  });
});

// =============================================================================
// createKataSlice
// =============================================================================

describe("createKataSlice", () => {
  const labelSet = {
    milestone: makeLabel("kata:milestone", "#7C3AED"),
    slice:     makeLabel("kata:slice",     "#2563EB"),
    task:      makeLabel("kata:task",      "#16A34A"),
  };

  const config = { teamId: "team-1", projectId: "proj-1", labelSet };

  it("formats the issue title with bracket prefix", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S01", title: "Entity mapping" });
    expect(createIssueCalls[0].title).toBe("[S01] Entity mapping");
  });

  it("passes teamId and projectId to createIssue", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S01", title: "Slice" });
    expect(createIssueCalls[0].teamId).toBe("team-1");
    expect(createIssueCalls[0].projectId).toBe("proj-1");
  });

  it("applies kata:slice label ID in labelIds", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S01", title: "Slice" });
    expect(createIssueCalls[0].labelIds).toEqual(["label-kata:slice"]);
  });

  it("does NOT apply kata:milestone or kata:task label", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S02", title: "Another slice" });
    const ids = createIssueCalls[0].labelIds as string[];
    expect(!ids.includes("label-kata:milestone")).toBeTruthy();
    expect(!ids.includes("label-kata:task")).toBeTruthy();
  });

  it("sets projectMilestoneId when milestoneId is provided", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, {
      kataId: "S01",
      title: "With milestone",
      milestoneId: "milestone-uuid",
    });
    expect(createIssueCalls[0].projectMilestoneId).toBe("milestone-uuid");
  });

  it("omits projectMilestoneId when milestoneId is not provided", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S01", title: "No milestone" });
    expect(!("projectMilestoneId" in createIssueCalls[0])).toBeTruthy();
  });

  it("sets stateId when initialPhase + states are provided", async () => {
    const { client, createIssueCalls } = makeMockClient();
    const teamStates: LinearWorkflowState[] = [
      makeState("started", "In Progress", "state-started"),
    ];
    await createKataSlice(client, config, {
      kataId: "S01",
      title: "With phase",
      initialPhase: "executing",
      states: teamStates,
    });
    expect(createIssueCalls[0].stateId).toBe("state-started");
  });

  it("omits stateId when initialPhase is not provided", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S01", title: "No phase" });
    expect(!("stateId" in createIssueCalls[0])).toBeTruthy();
  });

  it("omits stateId when no state matches the given phase", async () => {
    const { client, createIssueCalls } = makeMockClient();
    const onlyBacklog: LinearWorkflowState[] = [makeState("backlog", "Backlog", "state-backlog")];
    await createKataSlice(client, config, {
      kataId: "S01",
      title: "No match",
      initialPhase: "executing",
      states: onlyBacklog,
    });
    expect(!("stateId" in createIssueCalls[0])).toBeTruthy();
  });

  it("does NOT set parentId (slices are top-level issues)", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S01", title: "Top level" });
    expect(!("parentId" in createIssueCalls[0])).toBeTruthy();
  });
});

// =============================================================================
// createKataTask
// =============================================================================

describe("createKataTask", () => {
  const labelSet = {
    milestone: makeLabel("kata:milestone", "#7C3AED"),
    slice:     makeLabel("kata:slice",     "#2563EB"),
    task:      makeLabel("kata:task",      "#16A34A"),
  };

  const config = { teamId: "team-1", projectId: "proj-1", labelSet };

  it("formats the issue title with bracket prefix", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T01",
      title: "Types and mapping",
      sliceIssueId: "slice-uuid",
    });
    expect(createIssueCalls[0].title).toBe("[T01] Types and mapping");
  });

  it("sets parentId to opts.sliceIssueId", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T01",
      title: "Sub-issue",
      sliceIssueId: "parent-issue-uuid",
    });
    expect(createIssueCalls[0].parentId).toBe("parent-issue-uuid");
  });

  it("applies kata:task label ID in labelIds", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T01",
      title: "Task",
      sliceIssueId: "slice-uuid",
    });
    expect(createIssueCalls[0].labelIds).toEqual(["label-kata:task"]);
  });

  it("does NOT apply kata:milestone or kata:slice label", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T02",
      title: "Another task",
      sliceIssueId: "slice-uuid",
    });
    const ids = createIssueCalls[0].labelIds as string[];
    expect(!ids.includes("label-kata:milestone")).toBeTruthy();
    expect(!ids.includes("label-kata:slice")).toBeTruthy();
  });

  it("passes teamId and projectId to createIssue", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T01",
      title: "Task",
      sliceIssueId: "slice-uuid",
    });
    expect(createIssueCalls[0].teamId).toBe("team-1");
    expect(createIssueCalls[0].projectId).toBe("proj-1");
  });

  it("does NOT set projectMilestoneId (tasks inherit via parent slice)", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T01",
      title: "No direct milestone",
      sliceIssueId: "slice-uuid",
    });
    expect(!("projectMilestoneId" in createIssueCalls[0])).toBeTruthy();
  });

  it("sets stateId when initialPhase + states are provided", async () => {
    const { client, createIssueCalls } = makeMockClient();
    const teamStates: LinearWorkflowState[] = [
      makeState("unstarted", "Todo", "state-todo"),
    ];
    await createKataTask(client, config, {
      kataId: "T01",
      title: "With phase",
      sliceIssueId: "slice-uuid",
      initialPhase: "planning",
      states: teamStates,
    });
    expect(createIssueCalls[0].stateId).toBe("state-todo");
  });

  it("omits stateId when initialPhase is not provided", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T01",
      title: "No phase",
      sliceIssueId: "slice-uuid",
    });
    expect(!("stateId" in createIssueCalls[0])).toBeTruthy();
  });
});

describe("listKataSlices", () => {
  it("forwards projectMilestoneId when milestoneId is provided", async () => {
    const listIssueCalls: Array<Record<string, unknown>> = [];
    const client = {
      async listIssues(filter: Record<string, unknown>): Promise<LinearIssue[]> {
        listIssueCalls.push(filter);
        return [];
      },
    };

    await listKataSlices(client, "proj-1", "label-slice", "milestone-uuid");

    expect(listIssueCalls.length).toBe(1);
    expect(listIssueCalls[0]).toEqual({
      projectId: "proj-1",
      labelIds: ["label-slice"],
      projectMilestoneId: "milestone-uuid",
    });
  });

  it("omits projectMilestoneId when milestoneId is not provided", async () => {
    const listIssueCalls: Array<Record<string, unknown>> = [];
    const client = {
      async listIssues(filter: Record<string, unknown>): Promise<LinearIssue[]> {
        listIssueCalls.push(filter);
        return [];
      },
    };

    await listKataSlices(client, "proj-1", "label-slice");

    expect(listIssueCalls.length).toBe(1);
    expect(listIssueCalls[0]).toEqual({
      projectId: "proj-1",
      labelIds: ["label-slice"],
    });
  });
});
