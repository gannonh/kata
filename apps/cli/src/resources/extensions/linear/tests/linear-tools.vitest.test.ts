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
  const result = await tools.get("linear_get_issue").execute("tool-1", {
    id: "KAT-1",
    offset: 2,
    limit: 2,
  });

  expect(result.content[0].text).toContain("two");
  expect(result.content[0].text).toContain("three");
  expect(result.content[0].text).toContain("Showing description lines 2-3 of 4. Use offset=4 to continue.");
});

it("kata_list_slices uses compact inventory output when milestoneId is omitted", async () => {
  const tools = new Map<string, any>();
  const pi = { registerTool(tool: any) { tools.set(tool.name, tool); } };
  const client = {
    async ensureLabel(name: string) {
      return { id: `label-${name}`, name, color: "#000000", isGroup: false };
    },
    async listIssueSummaries() {
      return [{
        id: "slice-1",
        identifier: "KAT-101",
        title: "[S01] Hardening",
        priority: 2,
        estimate: 5,
        url: "https://linear.app/kata/issue/KAT-101",
        state: { id: "state-1", name: "Planning", type: "unstarted", color: "#000", position: 1 },
        labels: [{ id: "label-kata:slice", name: "kata:slice", color: "#000000", isGroup: false }],
        parent: null,
        project: { id: "proj-1", name: "Desktop" },
        projectMilestone: null,
        createdAt: "2026-04-12T00:00:00.000Z",
        updatedAt: "2026-04-12T00:00:00.000Z",
      }];
    },
  };

  registerLinearTools(pi as any, client as any);
  const result = await tools.get("kata_list_slices").execute("tool-1", {
    projectId: "proj-1",
    teamId: "team-1",
  });

  const text = result.content[0].text;
  expect(text).toContain("[S01] Hardening");
  expect(text).toContain("Large fields omitted from list output. Use linear_get_issue to inspect one issue.");
  expect(text).toContain("milestoneId omitted; broad project inventory may be large.");
});

describe("registerLinearTools run helper", () => {
  it("emits string results as raw text instead of JSON-stringifying them", async () => {
    const { tools } = registerLinearToolsForTest({
      async getTeam() {
        return "already formatted";
      },
    });

    const tool = tools.get("linear_get_team");
    const result = await tool.execute("tool-1", { idOrKey: "KAT" });

    expect(result).toEqual({
      content: [{ type: "text", text: "already formatted" }],
    });
  });
});

describe("registerLinearTools document outputs", () => {
  function registerDocumentToolsForTest(clientOverrides: Record<string, unknown> = {}) {
    const tools = new Map<string, any>();
    const pi = {
      registerTool(tool: any) {
        tools.set(tool.name, tool);
      },
    };
    const client = {
      async getDocument() {
        return {
          id: "doc-1",
          title: "M001-ROADMAP",
          content: ["a", "b", "c", "d"].join("\n"),
          project: { id: "proj-1", name: "Desktop" },
          issue: null,
          createdAt: "2026-04-12T00:00:00.000Z",
          updatedAt: "2026-04-12T00:00:00.000Z",
        };
      },
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
      async listDocuments() {
        return [
          {
            id: "doc-1",
            title: "M001-ROADMAP",
            content: ["a", "b", "c", "d"].join("\n"),
            project: { id: "proj-1", name: "Desktop" },
            issue: null,
            createdAt: "2026-04-12T00:00:00.000Z",
            updatedAt: "2026-04-12T00:00:00.000Z",
          },
        ];
      },
      ...clientOverrides,
    };

    registerLinearTools(pi as any, client as any);
    return { tools };
  }

  it("advertises compact/paged document contracts in tool metadata", () => {
    const { tools } = registerDocumentToolsForTest();

    expect(tools.get("linear_get_document").description).toMatch(/paged markdown content/i);
    expect(tools.get("linear_get_document").promptSnippet).toMatch(/offset\/limit/i);
    expect(tools.get("kata_read_document").description).toMatch(/compact metadata with paged markdown content/i);
    expect(tools.get("kata_list_documents").description).toMatch(/content is omitted/i);
  });

  it("linear_get_document pages content lines", async () => {
    const { tools } = registerDocumentToolsForTest();

    const result = await tools.get("linear_get_document").execute("tool-1", {
      id: "doc-1",
      offset: 2,
      limit: 2,
    });
    const text = result.content[0].text;

    expect(text).toContain("b");
    expect(text).toContain("c");
    expect(text).toContain("Showing content lines 2-3 of 4. Use offset=4 to continue.");
  });

  it("linear_get_document returns an error when the document does not exist", async () => {
    const { tools } = registerDocumentToolsForTest({
      async getDocument() {
        return null;
      },
    });

    const result = await tools.get("linear_get_document").execute("tool-1", { id: "doc-missing" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Document not found: doc-missing");
  });

  it("linear_get_document rejects invalid paging parameters", async () => {
    const { tools } = registerDocumentToolsForTest();
    const tool = tools.get("linear_get_document");

    const cases = [
      { params: { id: "doc-1", offset: 0 }, expected: "offset must be >= 1" },
      { params: { id: "doc-1", offset: 99 }, expected: "offset 99 is beyond end of content (4 lines total)" },
      { params: { id: "doc-1", limit: 0 }, expected: "limit must be >= 1" },
    ];

    for (const testCase of cases) {
      const result = await tool.execute("tool-1", testCase.params);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(testCase.expected);
    }
  });

  it("linear_list_documents omits document content and exposes item paging", async () => {
    const { tools } = registerDocumentToolsForTest();

    const result = await tools.get("linear_list_documents").execute("tool-1", { projectId: "proj-1" });
    const text = result.content[0].text;

    expect(text).toContain("M001-ROADMAP");
    expect(text).toContain("Document contents omitted from list output. Use linear_get_document to read one document.");
    expect(text).not.toContain('"content"');
  });

  it("kata_list_documents returns inventory output with omitted-content guidance", async () => {
    const { tools } = registerDocumentToolsForTest();

    const result = await tools.get("kata_list_documents").execute("tool-1", { issueId: "issue-1" });
    const text = result.content[0].text;

    expect(text).toContain("M001-ROADMAP");
    expect(text).toContain("Document contents omitted from list output. Use kata_read_document to read one document.");
    expect(text).not.toContain('"content"');
  });

  it("kata_read_document accepts offset/limit and pages content lines", async () => {
    const { tools } = registerDocumentToolsForTest();

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

  it("kata_read_document returns JSON null when the document does not exist", async () => {
    const { tools } = registerDocumentToolsForTest({
      async listDocuments() {
        return [];
      },
    });

    const result = await tools.get("kata_read_document").execute("tool-1", {
      title: "M001-ROADMAP",
      projectId: "proj-1",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("null");
  });
});
