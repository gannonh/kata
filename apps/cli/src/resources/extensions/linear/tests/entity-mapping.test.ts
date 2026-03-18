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

import assert from "node:assert/strict";
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
} from "../linear-entities.ts";
import type { LinearWorkflowState, LinearLabel, LinearIssue, LinearMilestone } from "../linear-types.ts";

// =============================================================================
// Title formatting — format + round-trip
// =============================================================================

describe("formatKataEntityTitle", () => {
  it("formats milestone ID and title", () => {
    assert.equal(formatKataEntityTitle("M001", "Scaffold integration"), "[M001] Scaffold integration");
  });

  it("formats slice ID and title", () => {
    assert.equal(formatKataEntityTitle("S01", "Slice name"), "[S01] Slice name");
  });

  it("formats task ID and title", () => {
    assert.equal(formatKataEntityTitle("T01", "Task title"), "[T01] Task title");
  });

  it("round-trips: formatKataEntityTitle → parseKataEntityTitle recovers original values", () => {
    const formatted = formatKataEntityTitle("M001", "My milestone");
    const parsed = parseKataEntityTitle(formatted);
    assert.deepEqual(parsed, { kataId: "M001", title: "My milestone" });
  });

  it("round-trips a slice", () => {
    const formatted = formatKataEntityTitle("S03", "Entity mapping");
    const parsed = parseKataEntityTitle(formatted);
    assert.deepEqual(parsed, { kataId: "S03", title: "Entity mapping" });
  });

  it("round-trips a task", () => {
    const formatted = formatKataEntityTitle("T04", "Register tools");
    const parsed = parseKataEntityTitle(formatted);
    assert.deepEqual(parsed, { kataId: "T04", title: "Register tools" });
  });
});

// =============================================================================
// parseKataEntityTitle — valid + invalid inputs
// =============================================================================

describe("parseKataEntityTitle", () => {
  it("parses a valid milestone title", () => {
    assert.deepEqual(parseKataEntityTitle("[M001] Scaffold integration"), {
      kataId: "M001",
      title: "Scaffold integration",
    });
  });

  it("parses a valid slice title", () => {
    assert.deepEqual(parseKataEntityTitle("[S01] Slice name"), {
      kataId: "S01",
      title: "Slice name",
    });
  });

  it("parses a valid task title with multiple words", () => {
    assert.deepEqual(parseKataEntityTitle("[T01] Types, title conventions, and phase-state mapping"), {
      kataId: "T01",
      title: "Types, title conventions, and phase-state mapping",
    });
  });

  it("returns null for a plain title with no bracket prefix", () => {
    assert.equal(parseKataEntityTitle("plain title"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(parseKataEntityTitle(""), null);
  });

  it("returns null when bracket prefix has no following space+text", () => {
    assert.equal(parseKataEntityTitle("[M001]"), null);
  });

  it("returns null for a title that starts with a bracket but has wrong format", () => {
    assert.equal(parseKataEntityTitle("[no-close-bracket title"), null);
  });

  it("returns null for lowercase id (convention uses uppercase)", () => {
    // Our regex requires [A-Z0-9]+ — lowercase IDs don't match
    assert.equal(parseKataEntityTitle("[s01] lowercase slice"), null);
  });
});

// =============================================================================
// getLinearStateTypeForKataPhase — forward mapping
// =============================================================================

describe("getLinearStateTypeForKataPhase", () => {
  it("backlog → backlog", () => {
    assert.equal(getLinearStateTypeForKataPhase("backlog"), "backlog");
  });

  it("planning → unstarted", () => {
    assert.equal(getLinearStateTypeForKataPhase("planning"), "unstarted");
  });

  it("executing → started", () => {
    assert.equal(getLinearStateTypeForKataPhase("executing"), "started");
  });

  it("verifying → started", () => {
    assert.equal(getLinearStateTypeForKataPhase("verifying"), "started");
  });

  it("done → completed", () => {
    assert.equal(getLinearStateTypeForKataPhase("done"), "completed");
  });
});

// =============================================================================
// getKataPhaseFromLinearStateType — reverse mapping
// =============================================================================

describe("getKataPhaseFromLinearStateType", () => {
  it("backlog → backlog", () => {
    assert.equal(getKataPhaseFromLinearStateType("backlog"), "backlog");
  });

  it("unstarted → planning", () => {
    assert.equal(getKataPhaseFromLinearStateType("unstarted"), "planning");
  });

  it("started → executing", () => {
    assert.equal(getKataPhaseFromLinearStateType("started"), "executing");
  });

  it("completed → done", () => {
    assert.equal(getKataPhaseFromLinearStateType("completed"), "done");
  });

  it("canceled → done (treated as terminal)", () => {
    assert.equal(getKataPhaseFromLinearStateType("canceled"), "done");
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
    assert.equal(getLinearStateForKataPhase([], "executing"), null);
  });

  it("returns null when no state matches the required type", () => {
    const onlyBacklog = [makeState("backlog", "Backlog")];
    assert.equal(getLinearStateForKataPhase(onlyBacklog, "executing"), null);
  });

  it("returns the matching state for executing (type=started)", () => {
    const result = getLinearStateForKataPhase(states, "executing");
    assert.ok(result, "should find a state");
    assert.equal(result.id, "id-started");
    assert.equal(result.type, "started");
  });

  it("returns the matching state for verifying (type=started)", () => {
    const result = getLinearStateForKataPhase(states, "verifying");
    assert.ok(result, "should find a state");
    assert.equal(result.type, "started");
  });

  it("returns the matching state for planning (type=unstarted)", () => {
    const result = getLinearStateForKataPhase(states, "planning");
    assert.ok(result, "should find a state");
    assert.equal(result.id, "id-unstarted");
  });

  it("returns the matching state for done (type=completed)", () => {
    const result = getLinearStateForKataPhase(states, "done");
    assert.ok(result, "should find a state");
    assert.equal(result.id, "id-completed");
  });

  it("returns the matching state for backlog", () => {
    const result = getLinearStateForKataPhase(states, "backlog");
    assert.ok(result, "should find a state");
    assert.equal(result.id, "id-backlog");
  });

  it("prefers progress-like started state for executing", () => {
    const twoStarted: LinearWorkflowState[] = [
      makeState("started", "In Review", "started-review"),
      makeState("started", "In Progress", "started-progress"),
    ];
    const result = getLinearStateForKataPhase(twoStarted, "executing");
    assert.ok(result, "should find a state");
    assert.equal(result.id, "started-progress");
  });

  it("also prefers progress-like started state for verifying", () => {
    const twoStarted: LinearWorkflowState[] = [
      makeState("started", "In Review", "started-review"),
      makeState("started", "In Progress", "started-progress"),
    ];
    const result = getLinearStateForKataPhase(twoStarted, "verifying");
    assert.ok(result, "should find a state");
    assert.equal(result.id, "started-progress");
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
    assert.ok(names.includes("kata:milestone"), "should call ensureLabel for kata:milestone");
    assert.ok(names.includes("kata:slice"),     "should call ensureLabel for kata:slice");
    assert.ok(names.includes("kata:task"),      "should call ensureLabel for kata:task");
    assert.equal(ensureLabelCalls.length, 3);
  });

  it("passes the teamId to each ensureLabel call", async () => {
    const { client, ensureLabelCalls } = makeMockClient();
    await ensureKataLabels(client, "team-xyz");
    for (const call of ensureLabelCalls) {
      assert.equal(call.opts?.teamId, "team-xyz");
    }
  });

  it("passes fixed colors: #7C3AED for milestone, #2563EB for slice, #16A34A for task", async () => {
    const { client, ensureLabelCalls } = makeMockClient();
    await ensureKataLabels(client, "team-1");
    const byName = Object.fromEntries(ensureLabelCalls.map((c) => [c.name, c.opts?.color]));
    assert.equal(byName["kata:milestone"], "#7C3AED");
    assert.equal(byName["kata:slice"],     "#2563EB");
    assert.equal(byName["kata:task"],      "#16A34A");
  });

  it("returns a KataLabelSet with milestone, slice, and task labels", async () => {
    const { client } = makeMockClient();
    const labelSet = await ensureKataLabels(client, "team-1");
    assert.equal(labelSet.milestone.name, "kata:milestone");
    assert.equal(labelSet.slice.name,     "kata:slice");
    assert.equal(labelSet.task.name,      "kata:task");
  });

  it("returns the label IDs from ensureLabel (uses existing if already present)", async () => {
    const { client } = makeMockClient();
    const labelSet = await ensureKataLabels(client, "team-1");
    // The mock generates IDs as `label-<name>`
    assert.equal(labelSet.milestone.id, "label-kata:milestone");
    assert.equal(labelSet.slice.id,     "label-kata:slice");
    assert.equal(labelSet.task.id,      "label-kata:task");
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
    assert.equal(createMilestoneCalls.length, 1);
    assert.equal(createMilestoneCalls[0].name, "[M001] Scaffold integration");
  });

  it("passes projectId to createMilestone", async () => {
    const { client, createMilestoneCalls } = makeMockClient();
    await createKataMilestone(client, { projectId: "proj-42" }, {
      kataId: "M002",
      title: "Phase two",
    });
    assert.equal(createMilestoneCalls[0].projectId, "proj-42");
  });

  it("passes optional description and targetDate when provided", async () => {
    const { client, createMilestoneCalls } = makeMockClient();
    await createKataMilestone(client, { projectId: "proj-1" }, {
      kataId: "M001",
      title: "With extras",
      description: "Milestone description",
      targetDate: "2025-06-30",
    });
    assert.equal(createMilestoneCalls[0].description, "Milestone description");
    assert.equal(createMilestoneCalls[0].targetDate, "2025-06-30");
  });

  it("does NOT receive or use a KataLabelSet — no ensureLabel calls", async () => {
    const { client, ensureLabelCalls } = makeMockClient();
    await createKataMilestone(client, { projectId: "proj-1" }, {
      kataId: "M001",
      title: "No labels",
    });
    assert.equal(ensureLabelCalls.length, 0);
  });

  it("returns the LinearMilestone from createMilestone", async () => {
    const { client } = makeMockClient();
    const result = await createKataMilestone(client, { projectId: "proj-1" }, {
      kataId: "M001",
      title: "Returned milestone",
    });
    assert.equal(result.name, "[M001] Returned milestone");
    assert.equal(result.id, "milestone-id");
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
    assert.equal(createIssueCalls[0].title, "[S01] Entity mapping");
  });

  it("passes teamId and projectId to createIssue", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S01", title: "Slice" });
    assert.equal(createIssueCalls[0].teamId, "team-1");
    assert.equal(createIssueCalls[0].projectId, "proj-1");
  });

  it("applies kata:slice label ID in labelIds", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S01", title: "Slice" });
    assert.deepEqual(createIssueCalls[0].labelIds, ["label-kata:slice"]);
  });

  it("does NOT apply kata:milestone or kata:task label", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S02", title: "Another slice" });
    const ids = createIssueCalls[0].labelIds as string[];
    assert.ok(!ids.includes("label-kata:milestone"), "should not include milestone label");
    assert.ok(!ids.includes("label-kata:task"),      "should not include task label");
  });

  it("sets projectMilestoneId when milestoneId is provided", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, {
      kataId: "S01",
      title: "With milestone",
      milestoneId: "milestone-uuid",
    });
    assert.equal(createIssueCalls[0].projectMilestoneId, "milestone-uuid");
  });

  it("omits projectMilestoneId when milestoneId is not provided", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S01", title: "No milestone" });
    assert.ok(!("projectMilestoneId" in createIssueCalls[0]), "should not have projectMilestoneId");
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
    assert.equal(createIssueCalls[0].stateId, "state-started");
  });

  it("omits stateId when initialPhase is not provided", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S01", title: "No phase" });
    assert.ok(!("stateId" in createIssueCalls[0]), "should not have stateId");
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
    assert.ok(!("stateId" in createIssueCalls[0]), "should not have stateId when no match");
  });

  it("does NOT set parentId (slices are top-level issues)", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataSlice(client, config, { kataId: "S01", title: "Top level" });
    assert.ok(!("parentId" in createIssueCalls[0]), "slice should not have parentId");
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
    assert.equal(createIssueCalls[0].title, "[T01] Types and mapping");
  });

  it("sets parentId to opts.sliceIssueId", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T01",
      title: "Sub-issue",
      sliceIssueId: "parent-issue-uuid",
    });
    assert.equal(createIssueCalls[0].parentId, "parent-issue-uuid");
  });

  it("applies kata:task label ID in labelIds", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T01",
      title: "Task",
      sliceIssueId: "slice-uuid",
    });
    assert.deepEqual(createIssueCalls[0].labelIds, ["label-kata:task"]);
  });

  it("does NOT apply kata:milestone or kata:slice label", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T02",
      title: "Another task",
      sliceIssueId: "slice-uuid",
    });
    const ids = createIssueCalls[0].labelIds as string[];
    assert.ok(!ids.includes("label-kata:milestone"), "should not include milestone label");
    assert.ok(!ids.includes("label-kata:slice"),     "should not include slice label");
  });

  it("passes teamId and projectId to createIssue", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T01",
      title: "Task",
      sliceIssueId: "slice-uuid",
    });
    assert.equal(createIssueCalls[0].teamId, "team-1");
    assert.equal(createIssueCalls[0].projectId, "proj-1");
  });

  it("does NOT set projectMilestoneId (tasks inherit via parent slice)", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T01",
      title: "No direct milestone",
      sliceIssueId: "slice-uuid",
    });
    assert.ok(!("projectMilestoneId" in createIssueCalls[0]),
      "task should not have projectMilestoneId — inherits from parent slice");
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
    assert.equal(createIssueCalls[0].stateId, "state-todo");
  });

  it("omits stateId when initialPhase is not provided", async () => {
    const { client, createIssueCalls } = makeMockClient();
    await createKataTask(client, config, {
      kataId: "T01",
      title: "No phase",
      sliceIssueId: "slice-uuid",
    });
    assert.ok(!("stateId" in createIssueCalls[0]), "should not have stateId");
  });
});
