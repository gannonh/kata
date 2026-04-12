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

describe("registerLinearTools document outputs", () => {
  it("linear_list_documents omits document content and exposes item paging", async () => {
    const tools = new Map<string, any>();
    const pi = {
      registerTool(tool: any) {
        tools.set(tool.name, tool);
      },
    };
    const client = {
      async listDocumentSummaries() {
        return [
          {
            id: "doc-1",
            title: "M001-ROADMAP",
            project: { id: "proj-1", name: "Desktop" },
            issue: null,
            createdAt: "2026-04-12T00:00:00.000Z",
            updatedAt: "2026-04-12T00:00:00.000Z",
          },
        ];
      },
    };

    registerLinearTools(pi as any, client as any);
    const result = await tools.get("linear_list_documents").execute("tool-1", { projectId: "proj-1" });
    const text = result.content[0].text;

    expect(text).toContain("M001-ROADMAP");
    expect(text).toContain("Document contents omitted from list output. Use linear_get_document to read one document.");
    expect(text).not.toContain('"content"');
  });

  it("kata_read_document accepts offset/limit and pages content lines", async () => {
    const tools = new Map<string, any>();
    const pi = {
      registerTool(tool: any) {
        tools.set(tool.name, tool);
      },
    };
    const client = {
      async listDocuments() {
        return [{
          id: "doc-1",
          title: "M001-ROADMAP",
          content: ["a", "b", "c", "d"].join("\n"),
          project: { id: "proj-1", name: "Desktop" },
          issue: null,
          createdAt: "2026-04-12T00:00:00.000Z",
          updatedAt: "2026-04-12T00:00:00.000Z",
        }];
      },
    };

    registerLinearTools(pi as any, client as any);
    const result = await tools.get("kata_read_document").execute("tool-1", {
      title: "M001-ROADMAP",
      projectId: "proj-1",
      offset: 2,
      limit: 2,
    });
    const text = result.content[0].text;

    expect(text).toContain("b");
    expect(text).toContain("c");
    expect(text).toContain("Showing content lines 2-3 of 4. Use offset=4 to continue.");
  });
});
