import { describe, expect, it } from "vitest";
import { LINEAR_TOOL_STRATEGIES, registerLinearTools } from "../linear-tools.js";

function registerLinearToolsForTest(clientOverrides: Record<string, unknown> = {}) {
  const tools = new Map<string, any>();
  const listIssueCalls: Array<Record<string, unknown>> = [];

  const pi = {
    registerTool(tool: any) {
      tools.set(tool.name, tool);
    },
  };

  const client = {
    async listIssues(filter: Record<string, unknown>) {
      listIssueCalls.push(filter);
      return [];
    },
    async listIssueSummaries(filter: Record<string, unknown>) {
      listIssueCalls.push(filter);
      return [];
    },
    async listTeams() {
      return [];
    },
    ...clientOverrides,
  };

  registerLinearTools(pi as any, client as any);
  return { tools, listIssueCalls };
}

describe("registerLinearTools", () => {
  it("threads projectMilestoneId through to linear_list_issues", async () => {
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

  it("documents compact inventory guidance and avoids legacy full-payload wording", () => {
    const { tools } = registerLinearToolsForTest();
    const tool = tools.get("linear_list_issues");

    expect(tool.description).toMatch(/issue inventory/i);
    expect(tool.description).toMatch(/prefer kata_list_slices/i);
    expect(tool.description).toMatch(/linear_get_issue/i);
    expect(tool.description).not.toMatch(/full issue payloads/i);
    expect(tool.promptSnippet).toMatch(/issue inventory/i);
    expect(tool.promptSnippet).toMatch(/prefer kata_list_slices/i);
  });

  it("linear_get_issue pages description lines instead of dumping raw JSON", async () => {
    const tools = new Map<string, any>();
    const pi = { registerTool(tool: any) { tools.set(tool.name, tool); } };
    const client = {
      async getIssue() {
        return {
          id: "issue-1",
          identifier: "KAT-1",
          title: "Investigate context flood",
          description: ["one", "two", "three", "four"].join("\n"),
          priority: 2,
          estimate: 3,
          url: "https://linear.app/kata/issue/KAT-1",
          state: { id: "state-1", name: "In Progress", type: "started", color: "#000", position: 1 },
          assignee: null,
          labels: [],
          parent: null,
          children: { nodes: [] },
          project: { id: "proj-1", name: "Desktop" },
          projectMilestone: null,
          relations: [],
          blockedBy: [],
          createdAt: "2026-04-12T00:00:00.000Z",
          updatedAt: "2026-04-12T00:00:00.000Z",
        };
      },
    };

    registerLinearTools(pi as any, client as any);
    const tool = tools.get("linear_get_issue");
    const result = await tool.execute("tool-1", {
      id: "KAT-1",
      offset: 2,
      limit: 2,
    });

    expect(result.content[0].text).toContain("two");
    expect(result.content[0].text).toContain("three");
    expect(result.content[0].text).toContain("Showing description lines 2-3 of 4. Use offset=4 to continue.");
  });

  it("linear_add_comment omits body from compact mutation output", async () => {
    const tools = new Map<string, any>();
    const pi = { registerTool(tool: any) { tools.set(tool.name, tool); } };
    const client = {
      async createComment() {
        return {
          id: "comment-1",
          issueId: "issue-1",
          createdAt: "2026-04-12T00:00:00.000Z",
          url: "https://linear.app/kata/comment/1",
        };
      },
    };

    registerLinearTools(pi as any, client as any);
    const result = await tools.get("linear_add_comment").execute("tool-1", {
      issueId: "issue-1",
      body: "very long hidden body",
    });

    expect(result.content[0].text).toContain("Comment created.");
    expect(result.content[0].text).not.toContain("very long hidden body");
  });

  it("linear_get_document pages content lines", async () => {
    const tools = new Map<string, any>();
    const pi = { registerTool(tool: any) { tools.set(tool.name, tool); } };
    const client = {
      async getDocument() {
        return {
          id: "doc-1",
          title: "Architecture",
          content: ["one", "two", "three", "four"].join("\n"),
          updatedAt: "2026-04-12T00:00:00.000Z",
          project: { name: "Desktop" },
          issue: null,
        };
      },
    };

    registerLinearTools(pi as any, client as any);
    const result = await tools.get("linear_get_document").execute("tool-1", {
      id: "doc-1",
      offset: 2,
      limit: 2,
    });

    expect(result.content[0].text).toContain("two");
    expect(result.content[0].text).toContain("three");
  });

  it("keeps every linear_ tool assigned to a hardening strategy", () => {
    const names = Object.keys(LINEAR_TOOL_STRATEGIES).filter((name) => name.startsWith("linear_"));
    expect(names.length).toBeGreaterThan(0);
    expect(LINEAR_TOOL_STRATEGIES.linear_update_issue).toBe("mutation");
    expect(LINEAR_TOOL_STRATEGIES.linear_get_issue).toBe("paged-read");
    expect(LINEAR_TOOL_STRATEGIES.linear_list_issues).toBe("inventory");
  });
});
