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
    expect(KATA_TOOL_STRATEGIES.kata_derive_state).toBe("state");
    expect(KATA_TOOL_STRATEGIES.kata_list_slices).toBe("inventory");
  });
});
