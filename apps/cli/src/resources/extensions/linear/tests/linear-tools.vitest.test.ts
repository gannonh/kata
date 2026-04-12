import { describe, it, expect } from "vitest";
import { registerLinearTools } from "../linear-tools.js";
import type { LinearLabel } from "../linear-types.js";

function makeLabel(name: string): LinearLabel {
  return {
    id: `label-${name}`,
    name,
    color: "#000000",
    isGroup: false,
  };
}

function registerLinearToolsForTest(clientOverrides: Record<string, unknown> = {}) {
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
    async listTeams() {
      return [];
    },
    ...clientOverrides,
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

    expect(listIssueCalls.length).toBe(1);
    expect(listIssueCalls[0]).toEqual({
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

    expect(listIssueCalls.length).toBe(1);
    expect(listIssueCalls[0]).toEqual({
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

    expect(listIssueCalls[0]).toEqual({
      projectId: "proj-1",
      projectMilestoneId: "milestone-uuid",
      first: 5,
    });
  });

  it("warns prompt consumers to prefer kata_list_slices for Kata slice enumeration", () => {
    const { tools } = registerLinearToolsForTest();
    const tool = tools.get("linear_list_issues");

    expect(tool.description).toMatch(/prefer kata_list_slices/i);
    expect(tool.promptSnippet).toMatch(/prefer kata_list_slices/i);
  });
});

describe("registerLinearTools run helper", () => {
  it("emits string results as raw text instead of JSON-stringifying them", async () => {
    const { tools } = registerLinearToolsForTest({
      async listTeams() {
        return "already formatted";
      },
    });

    const tool = tools.get("linear_list_teams");
    const result = await tool.execute("tool-1", {});

    expect(result).toEqual({
      content: [{ type: "text", text: "already formatted" }],
    });
  });
});
