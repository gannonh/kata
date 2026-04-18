import { describe, expect, it } from "vitest";
import { registerKataTools, KATA_TOOL_STRATEGIES } from "../tools.js";
import type { KataBackend } from "../backend.js";

function makeBackend(overrides: Partial<KataBackend> = {}): KataBackend {
  return {
    basePath: process.cwd(),
    gitRoot: process.cwd(),
    isLinearMode: false,
    async deriveState() {
      return {
        activeMilestone: { id: "M001", title: "Milestone", trackerIssueId: "101" },
        activeSlice: { id: "S01", title: "Slice", trackerIssueId: "201" },
        activeTask: { id: "T01", title: "Task", trackerIssueId: "301" },
        phase: "executing",
        recentDecisions: [],
        blockers: [],
        nextAction: "Execute the next task.",
        registry: [],
      };
    },
    invalidateStateCache() {},
    async readDocument() {
      return null;
    },
    async writeDocument() {},
    async documentExists() {
      return false;
    },
    async listDocuments() {
      return [];
    },
    async isSlicePlanned() {
      return false;
    },
    async resolveSliceScope() {
      return undefined;
    },
    async buildPrompt() {
      return "";
    },
    buildDiscussPrompt() {
      return "";
    },
    async bootstrap() {},
    async checkMilestoneCreated() {
      return false;
    },
    async loadDashboardData() {
      const state = await this.deriveState();
      return {
        state,
        sliceProgress: null,
        taskProgress: null,
      };
    },
    async preparePrContext() {
      return { branch: "main", documents: {} };
    },
    async createMilestone(input) {
      return { id: "mile-1", name: `[${input.kataId}] ${input.title}`, targetDate: input.targetDate ?? null, trackerIssueId: "401" };
    },
    async createSlice(input) {
      return {
        id: "slice-1",
        identifier: "#501",
        title: `[${input.kataId}] ${input.title}`,
        state: input.initialPhase ?? "open",
        labels: ["kata:slice"],
        projectName: "repo",
        milestoneName: input.milestoneId ?? null,
        parentIdentifier: null,
        updatedAt: null,
      };
    },
    async createTask(input) {
      return {
        id: "task-1",
        identifier: "#601",
        title: `[${input.kataId}] ${input.title}`,
        state: input.initialPhase ?? "open",
        labels: ["kata:task"],
        projectName: "repo",
        milestoneName: null,
        parentIdentifier: input.sliceIssueId,
        updatedAt: null,
      };
    },
    async listMilestones() {
      return [{ id: "mile-1", name: "[M001] Foundation", targetDate: null, updatedAt: "2026-04-12T00:00:00.000Z", trackerIssueId: "401" }];
    },
    async listSlices(input) {
      return [{
        id: "slice-1",
        identifier: "#501",
        title: "[S01] Hardening",
        state: input?.milestoneId ? "planning" : "executing",
        labels: ["kata:slice"],
        updatedAt: "2026-04-12T00:00:00.000Z",
        projectName: "repo",
        milestoneName: input?.milestoneId ?? null,
        parentIdentifier: null,
      }];
    },
    async listTasks(sliceIssueId) {
      return [{
        id: "task-1",
        identifier: "#601",
        title: "[T01] Prepare schema",
        state: "executing",
        labels: ["kata:task"],
        updatedAt: "2026-04-12T00:00:00.000Z",
        projectName: "repo",
        milestoneName: null,
        parentIdentifier: sliceIssueId,
      }];
    },
    async getIssue(issueId) {
      return {
        id: issueId,
        identifier: `#${issueId}`,
        title: "Issue title",
        state: "executing",
        labels: ["kata:slice"],
        updatedAt: "2026-04-12T00:00:00.000Z",
        projectName: "repo",
        milestoneName: "M001",
        parentIdentifier: null,
        description: "one\ntwo\nthree",
        children: [],
        comments: [],
      };
    },
    async upsertComment(input) {
      return {
        id: "comment-1",
        issueId: input.issueId,
        marker: input.marker ?? null,
        action: input.marker ? "updated" : "created",
        createdAt: "2026-04-12T00:00:00.000Z",
        updatedAt: "2026-04-12T00:00:00.000Z",
      };
    },
    async createFollowupIssue(input) {
      return {
        id: "followup-1",
        identifier: "#701",
        title: input.title,
        state: "backlog",
        labels: ["kata:followup"],
        updatedAt: "2026-04-12T00:00:00.000Z",
        projectName: "repo",
        milestoneName: null,
        parentIdentifier: input.parentIssueId ?? null,
      };
    },
    async updateIssueState(issueId, phase) {
      return { issueId, identifier: `#${issueId}`, phase, state: phase };
    },
    ...overrides,
  };
}

function registerKataToolsForTest(backend: KataBackend) {
  const tools = new Map<string, any>();
  const pi = {
    registerTool(tool: any) {
      tools.set(tool.name, tool);
    },
  };

  registerKataTools(pi as any, {
    createBackend: async () => backend,
  });

  return { tools };
}

describe("registerKataTools", () => {
  it("kata_list_slices threads milestoneId to the backend", async () => {
    const calls: Array<{ milestoneId?: string }> = [];
    const backend = makeBackend({
      async listSlices(input) {
        calls.push(input ?? {});
        return [];
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    await tools.get("kata_list_slices").execute("tool-1", {
      projectId: "proj-1",
      teamId: "team-1",
      milestoneId: "M001",
    });

    expect(calls).toEqual([{ milestoneId: "M001" }]);
  });

  it("kata_list_tasks renders compact inventory output", async () => {
    const { tools } = registerKataToolsForTest(makeBackend());
    const result = await tools.get("kata_list_tasks").execute("tool-1", {
      sliceIssueId: "501",
    });

    const text = result.content[0].text;
    expect(text).toContain("[T01] Prepare schema");
    expect(text).toContain("parent: 501");
  });

  it("kata_write_document returns a compact summary instead of echoing full content", async () => {
    let captured: { title: string; content: string } | null = null;
    const backend = makeBackend({
      async writeDocument(title, content) {
        captured = { title, content };
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    const result = await tools.get("kata_write_document").execute("tool-1", {
      title: "M001-ROADMAP",
      content: "x".repeat(10_000),
      projectId: "proj-1",
    });

    expect(captured?.title).toBe("M001-ROADMAP");
    expect(captured?.content.length).toBe(10_000);
    expect(result.content[0].text).toContain("Document written.");
    expect(result.content[0].text).toContain("Use kata_read_document to inspect content.");
    expect(result.content[0].text).not.toContain("xxxxx");
  });

  it("kata_read_document accepts offset/limit and pages content lines", async () => {
    const backend = makeBackend({
      async readDocument() {
        return ["one", "two", "three", "four"].join("\n");
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    const result = await tools.get("kata_read_document").execute("tool-1", {
      title: "M001-ROADMAP",
      projectId: "proj-1",
      offset: 2,
      limit: 2,
    });

    expect(result.content[0].text).toContain("two");
    expect(result.content[0].text).toContain("three");
  });

  it("kata_get_issue defaults includeChildren/includeComments to true", async () => {
    const calls: Array<{ issueId: string; opts?: { includeChildren?: boolean; includeComments?: boolean } }> = [];
    const backend = makeBackend({
      async getIssue(issueId, opts) {
        calls.push({ issueId, opts });
        return null;
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    await tools.get("kata_get_issue").execute("tool-1", {
      issueId: "slice-1",
    });

    expect(calls).toEqual([{
      issueId: "slice-1",
      opts: {
        includeChildren: true,
        includeComments: true,
      },
    }]);
  });

  it("kata_get_issue threads explicit includeChildren/includeComments to backend.getIssue", async () => {
    const calls: Array<{ issueId: string; opts?: { includeChildren?: boolean; includeComments?: boolean } }> = [];
    const backend = makeBackend({
      async getIssue(issueId, opts) {
        calls.push({ issueId, opts });
        return null;
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    await tools.get("kata_get_issue").execute("tool-1", {
      issueId: "slice-1",
      includeChildren: false,
      includeComments: true,
    });

    expect(calls).toEqual([{
      issueId: "slice-1",
      opts: {
        includeChildren: false,
        includeComments: true,
      },
    }]);
  });

  it("kata_get_issue returns JSON null when backend.getIssue returns null", async () => {
    const backend = makeBackend({
      async getIssue() {
        return null;
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    const result = await tools.get("kata_get_issue").execute("tool-1", {
      issueId: "slice-1",
    });

    expect(result.content[0].text).toBe("null");
  });

  it("kata_get_issue pages the issue description instead of dumping raw JSON", async () => {
    const backend = makeBackend({
      async getIssue() {
        return {
          id: "slice-1",
          identifier: "#501",
          title: "[S01] Hardening",
          state: "executing",
          labels: ["kata:slice"],
          updatedAt: "2026-04-12T00:00:00.000Z",
          projectName: "repo",
          milestoneName: "M001",
          parentIdentifier: null,
          description: ["one", "two", "three", "four"].join("\n"),
          children: [],
          comments: [{ id: "comment-1", issueId: "slice-1", marker: "KATA:S01-SUMMARY", action: "created" }],
        };
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    const result = await tools.get("kata_get_issue").execute("tool-1", {
      issueId: "slice-1",
      offset: 2,
      limit: 2,
    });

    expect(result.content[0].text).toContain("two");
    expect(result.content[0].text).toContain("three");
    expect(result.content[0].text).toContain("comments: 1");
    expect(result.content[0].text).toContain("Showing description lines 2-3 of 4. Use offset=4 to continue.");
  });

  it("kata_upsert_comment threads marker-aware payload and returns compact output", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const backend = makeBackend({
      async upsertComment(input) {
        calls.push(input as Record<string, unknown>);
        return {
          id: "comment-1",
          issueId: input.issueId,
          marker: input.marker ?? null,
          action: "updated",
          updatedAt: "2026-04-12T00:00:00.000Z",
        };
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    const result = await tools.get("kata_upsert_comment").execute("tool-1", {
      issueId: "slice-1",
      marker: "KATA:S01-SUMMARY",
      body: "long summary body",
    });

    expect(calls).toEqual([{
      issueId: "slice-1",
      marker: "KATA:S01-SUMMARY",
      body: "long summary body",
    }]);
    expect(result.content[0].text).toContain("Comment upserted.");
    expect(result.content[0].text).toContain("requestedMarker: KATA:S01-SUMMARY");
    expect(result.content[0].text).toContain("storedMarker: KATA:S01-SUMMARY");
    expect(result.content[0].text).not.toContain("long summary body");
  });

  it("kata_upsert_comment does not imply marker persistence when backend omits stored marker", async () => {
    const backend = makeBackend({
      async upsertComment(input) {
        return {
          id: "comment-2",
          issueId: input.issueId,
          action: "created",
          updatedAt: "2026-04-12T00:00:00.000Z",
        };
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    const result = await tools.get("kata_upsert_comment").execute("tool-1", {
      issueId: "slice-1",
      marker: "KATA:S01-SUMMARY",
      body: "summary body",
    });

    expect(result.content[0].text).toContain("requestedMarker: KATA:S01-SUMMARY");
    expect(result.content[0].text).not.toContain("storedMarker: KATA:S01-SUMMARY");
  });

  it("kata_create_followup_issue uses title/description and relation-aware payload", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const backend = makeBackend({
      async createFollowupIssue(input) {
        calls.push(input as Record<string, unknown>);
        return {
          id: "followup-1",
          identifier: "#702",
          title: "Investigate regression",
          state: "backlog",
          labels: ["kata:followup"],
          updatedAt: "2026-04-12T00:00:00.000Z",
          projectName: "repo",
          milestoneName: null,
          parentIdentifier: input.parentIssueId ?? null,
        };
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    const result = await tools.get("kata_create_followup_issue").execute("tool-1", {
      parentIssueId: "slice-1",
      relationType: "blocked_by",
      title: "Investigate regression",
      description: "very long hidden description",
    });

    expect(calls).toEqual([{
      parentIssueId: "slice-1",
      relationType: "blocked_by",
      title: "Investigate regression",
      description: "very long hidden description",
    }]);
    expect(result.content[0].text).toContain("Follow-up issue created.");
    expect(result.content[0].text).toContain("parent: slice-1");
    expect(result.content[0].text).toContain("relationType: blocked_by");
    expect(result.content[0].text).not.toContain("very long hidden description");
  });

  it("kata_create_followup_issue supports missing parentIssueId", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const backend = makeBackend({
      async createFollowupIssue(input) {
        calls.push(input as Record<string, unknown>);
        return {
          id: "followup-2",
          identifier: "#703",
          title: input.title,
          state: "backlog",
          labels: ["kata:followup"],
          updatedAt: "2026-04-12T00:00:00.000Z",
          projectName: "repo",
          milestoneName: null,
          parentIdentifier: null,
        };
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    const result = await tools.get("kata_create_followup_issue").execute("tool-1", {
      title: "Unparented follow-up",
      description: "desc",
    });

    expect(calls).toEqual([{
      parentIssueId: undefined,
      relationType: undefined,
      title: "Unparented follow-up",
      description: "desc",
    }]);
    expect(result.content[0].text).toContain("parent: —");
  });

  it("kata_create_followup_issue fails when relationType is provided without parentIssueId", async () => {
    let called = false;
    const backend = makeBackend({
      async createFollowupIssue() {
        called = true;
        return {
          id: "followup-3",
          identifier: "#704",
          title: "Should not be created",
          state: "backlog",
          labels: ["kata:followup"],
          updatedAt: "2026-04-12T00:00:00.000Z",
          projectName: "repo",
          milestoneName: null,
          parentIdentifier: null,
        };
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    const result = await tools.get("kata_create_followup_issue").execute("tool-1", {
      relationType: "blocked_by",
      title: "Needs parent",
      description: "desc",
    });

    expect(called).toBe(false);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("parentIssueId is required when relationType is provided");
  });

  it("kata_derive_state includes workflowMode", async () => {
    const { tools } = registerKataToolsForTest(makeBackend({ isLinearMode: true }));
    const result = await tools.get("kata_derive_state").execute("tool-1", {});
    const payload = JSON.parse(result.content[0].text);

    expect(payload.workflowMode).toBe("linear");
    expect(payload.activeMilestone.id).toBe("M001");
  });

  it("kata_create_task dispatches through backend-native task creation", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const backend = makeBackend({
      async createTask(input) {
        calls.push(input);
        return {
          id: "task-1",
          identifier: "#777",
          title: `[${input.kataId}] ${input.title}`,
          state: "planning",
          labels: ["kata:task"],
          updatedAt: null,
          projectName: "repo",
          milestoneName: null,
          parentIdentifier: input.sliceIssueId,
        };
      },
    });
    const { tools } = registerKataToolsForTest(backend);

    const result = await tools.get("kata_create_task").execute("tool-1", {
      teamId: "team-1",
      projectId: "proj-1",
      kataId: "T01",
      title: "Task title",
      sliceIssueId: "501",
      description: "Plan body",
      initialPhase: "planning",
    });

    expect(calls).toEqual([{
      kataId: "T01",
      title: "Task title",
      sliceIssueId: "501",
      description: "Plan body",
      initialPhase: "planning",
    }]);
    expect(result.content[0].text).toContain("Task created.");
    expect(result.content[0].text).toContain("parent: 501");
  });

  it("keeps every kata_ tool assigned to a hardening strategy", () => {
    const names = Object.keys(KATA_TOOL_STRATEGIES).filter((name) => name.startsWith("kata_"));
    expect(names.length).toBeGreaterThan(0);
    expect(KATA_TOOL_STRATEGIES.kata_write_document).toBe("mutation");
    expect(KATA_TOOL_STRATEGIES.kata_get_issue).toBe("paged-read");
    expect(KATA_TOOL_STRATEGIES.kata_upsert_comment).toBe("mutation");
    expect(KATA_TOOL_STRATEGIES.kata_create_followup_issue).toBe("mutation");
    expect(KATA_TOOL_STRATEGIES.kata_derive_state).toBe("state");
    expect(KATA_TOOL_STRATEGIES.kata_list_slices).toBe("inventory");
  });
});
