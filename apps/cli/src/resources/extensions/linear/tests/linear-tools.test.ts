import assert from "node:assert/strict";
import { registerLinearTools } from "../linear-tools.ts";
import type { LinearLabel } from "../linear-types.ts";

function makeLabel(name: string): LinearLabel {
  return {
    id: `label-${name}`,
    name,
    color: "#000000",
    isGroup: false,
  };
}

function registerLinearToolsForTest() {
  const tools = new Map<string, any>();
  const listIssueCalls: Array<Record<string, unknown>> = [];

  const pi = {
    registerTool(tool: any) {
      tools.set(tool.name, tool);
    },
  };

  const client = {
    async ensureLabel(name: string) {
      return makeLabel(name);
    },
    async listIssues(filter: Record<string, unknown>) {
      listIssueCalls.push(filter);
      return [];
    },
  };

  registerLinearTools(pi as any, client as any);

  return {
    tools,
    listIssueCalls,
  };
}

describe("registerLinearTools kata_list_slices", () => {
  it("threads milestoneId through to listIssues", async () => {
    const { tools, listIssueCalls } = registerLinearToolsForTest();
    const tool = tools.get("kata_list_slices");

    await tool.execute("tool-1", {
      projectId: "proj-1",
      teamId: "team-1",
      milestoneId: "milestone-uuid",
    });

    assert.equal(listIssueCalls.length, 1);
    assert.deepEqual(listIssueCalls[0], {
      projectId: "proj-1",
      labelIds: ["label-kata:slice"],
      projectMilestoneId: "milestone-uuid",
    });
  });

  it("still works when milestoneId is omitted", async () => {
    const { tools, listIssueCalls } = registerLinearToolsForTest();
    const tool = tools.get("kata_list_slices");

    await tool.execute("tool-1", {
      projectId: "proj-1",
      teamId: "team-1",
    });

    assert.equal(listIssueCalls.length, 1);
    assert.deepEqual(listIssueCalls[0], {
      projectId: "proj-1",
      labelIds: ["label-kata:slice"],
    });
  });
});

describe("registerLinearTools linear_list_issues", () => {
  it("threads projectMilestoneId through to listIssues", async () => {
    const { tools, listIssueCalls } = registerLinearToolsForTest();
    const tool = tools.get("linear_list_issues");

    await tool.execute("tool-1", {
      projectId: "proj-1",
      projectMilestoneId: "milestone-uuid",
      first: 5,
    });

    assert.deepEqual(listIssueCalls[0], {
      projectId: "proj-1",
      projectMilestoneId: "milestone-uuid",
      first: 5,
    });
  });

  it("warns prompt consumers to prefer kata_list_slices for Kata slice enumeration", () => {
    const { tools } = registerLinearToolsForTest();
    const tool = tools.get("linear_list_issues");

    assert.match(tool.description, /prefer kata_list_slices/i);
    assert.match(tool.promptSnippet, /prefer kata_list_slices/i);
  });
});
