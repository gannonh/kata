import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KataState } from "../types.js";

const stateRef = vi.hoisted(() => ({ current: null as KataState | null }));
const roadmapRef = vi.hoisted(() => ({ current: null as string | null }));

const mockShowNextAction = vi.hoisted(() => vi.fn(async () => "not_yet"));
const mockCreateBackend = vi.hoisted(() => vi.fn());
const modeGateRef = vi.hoisted(() => ({
  current: {
    allow: true,
    mode: "linear",
    isLinearMode: true,
    notice: null,
    noticeLevel: "info",
    protocol: {
      mode: "linear",
      documentName: "KATA-WORKFLOW.md",
      path: "/fake/path/KATA-WORKFLOW.md",
      ready: true,
    },
  },
}));

vi.mock("../backend-factory.js", () => ({
  createBackend: mockCreateBackend,
}));

vi.mock("../../shared/next-action-ui.js", () => ({
  showNextAction: mockShowNextAction,
}));

vi.mock("../linear-config.js", () => ({
  getWorkflowEntrypointGuard: vi.fn(() => modeGateRef.current),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");

  return {
    ...actual,
    readFileSync: vi.fn((path: Parameters<typeof actual.readFileSync>[0], ...args: unknown[]) => {
      const normalizedPath = typeof path === "string" ? path : String(path);
      if (normalizedPath.includes("KATA-WORKFLOW")) {
        return "# Mock Workflow";
      }
      return (actual.readFileSync as (...params: unknown[]) => unknown)(path, ...args);
    }),
  };
});

import { showPlan } from "../guided-flow.js";

function makeState(overrides: Partial<KataState> = {}): KataState {
  return {
    activeMilestone: { id: "M001", title: "Milestone 1" },
    activeSlice: null,
    activeTask: null,
    phase: "planning",
    recentDecisions: [],
    blockers: [],
    nextAction: "",
    registry: [{ id: "M001", title: "Milestone 1", status: "active" }],
    ...overrides,
  };
}

function makeRoadmap(options: {
  s01Done?: boolean;
  s02Done?: boolean;
  includeS03?: boolean;
} = {}): string {
  const s01Done = options.s01Done ?? false;
  const s02Done = options.s02Done ?? false;
  const includeS03 = options.includeS03 ?? false;

  const lines = [
    "# M001: Milestone 1",
    "",
    "**Vision:** Test roadmap",
    "",
    "**Success Criteria:**",
    "- Coverage exists",
    "",
    "---",
    "",
    "## Slices",
    "",
    `- [${s01Done ? "x" : " "}] **S01: Slice One** \`risk:low\` \`depends:[]\``,
    "> After this: S01 demo.",
    "",
    `- [${s02Done ? "x" : " "}] **S02: Slice Two** \`risk:medium\` \`depends:[S01]\``,
    "> After this: S02 demo.",
  ];

  if (includeS03) {
    lines.push(
      "",
      "- [ ] **S03: Slice Three** `risk:low` `depends:[S02]`",
      "> After this: S03 demo.",
    );
  }

  return lines.join("\n");
}

function capturedActionIds(): string[] {
  const call = mockShowNextAction.mock.calls[0];
  if (!call) return [];
  const opts = call[1] as { actions?: Array<{ id: string }> } | undefined;
  if (!opts) return [];
  return (opts.actions || []).map((action) => action.id);
}

function makeBackend(overrides: Record<string, unknown> = {}) {
  return {
    deriveState: vi.fn(async () => {
      if (!stateRef.current) throw new Error("stateRef.current not configured for test");
      return stateRef.current;
    }),
    readDocument: vi.fn(async (name: string) => {
      if (name.endsWith("-ROADMAP")) return roadmapRef.current;
      return null;
    }),
    documentExists: vi.fn(async () => false),
    resolveSliceScope: vi.fn(async () => undefined),
    buildDiscussPrompt: vi.fn(() => "mock discuss prompt"),
    isLinearMode: true,
    basePath: "/tmp/test",
    ...overrides,
  };
}

function makeCtx() {
  return {
    ui: {
      notify: vi.fn(),
    },
  };
}

function makePi() {
  return {
    sendMessage: vi.fn(),
  };
}

beforeEach(() => {
  mockShowNextAction.mockReset();
  mockShowNextAction.mockResolvedValue("not_yet");

  modeGateRef.current = {
    allow: true,
    mode: "linear",
    isLinearMode: true,
    notice: null,
    noticeLevel: "info",
    protocol: {
      mode: "linear",
      documentName: "KATA-WORKFLOW.md",
      path: "/fake/path/KATA-WORKFLOW.md",
      ready: true,
    },
  };

  stateRef.current = makeState();
  roadmapRef.current = null;

  mockCreateBackend.mockReset();
  mockCreateBackend.mockImplementation(async () => makeBackend());
});

describe("showPlan option presentation", () => {
  it("State A: shows only plan_new_milestone when there are no milestones", async () => {
    stateRef.current = makeState({
      activeMilestone: null,
      registry: [],
      phase: "pre-planning",
    });

    const ctx = makeCtx();
    const pi = makePi();

    await showPlan(ctx as any, pi as any, "/tmp/test");

    expect(capturedActionIds()).toEqual(["plan_new_milestone"]);
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("State B: shows roadmap planning + discuss when active milestone has no roadmap", async () => {
    stateRef.current = makeState({ phase: "planning" });
    roadmapRef.current = null;

    const ctx = makeCtx();
    const pi = makePi();

    await showPlan(ctx as any, pi as any, "/tmp/test");

    expect(capturedActionIds()).toEqual([
      "plan_milestone_roadmap",
      "discuss_planning",
    ]);
  });

  it("State C: shows the full pending-slices planning action set", async () => {
    stateRef.current = makeState({
      phase: "planning",
      activeSlice: { id: "S01", title: "Slice One" },
    });
    roadmapRef.current = makeRoadmap({
      s01Done: false,
      s02Done: false,
      includeS03: true,
    });

    const ctx = makeCtx();
    const pi = makePi();

    await showPlan(ctx as any, pi as any, "/tmp/test");

    expect(capturedActionIds()).toEqual([
      "plan_next_unplanned",
      "pick_slice",
      "add_slice",
      "resequence_slices",
      "revise_roadmap",
      "plan_new_milestone",
      "discuss_planning",
    ]);
  });

  it("State D: shows post-completion milestone options when all slices are complete", async () => {
    stateRef.current = makeState({ phase: "summarizing" });
    roadmapRef.current = makeRoadmap({ s01Done: true, s02Done: true });

    const ctx = makeCtx();
    const pi = makePi();

    await showPlan(ctx as any, pi as any, "/tmp/test");

    expect(capturedActionIds()).toEqual([
      "plan_new_milestone",
      "add_slice",
      "revise_roadmap",
      "discuss_planning",
    ]);
  });

  it("State E: shows only new milestone + discuss when all milestones are complete", async () => {
    stateRef.current = makeState({
      activeMilestone: null,
      phase: "complete",
      registry: [{ id: "M001", title: "Milestone 1", status: "complete" }],
    });
    roadmapRef.current = null;

    const ctx = makeCtx();
    const pi = makePi();

    await showPlan(ctx as any, pi as any, "/tmp/test");

    expect(capturedActionIds()).toEqual([
      "plan_new_milestone",
      "discuss_planning",
    ]);
  });

  it("GitHub mode dispatches the shared discuss prompt for new milestone planning", async () => {
    modeGateRef.current = {
      allow: true,
      mode: "github",
      isLinearMode: false,
      notice: null,
      noticeLevel: "info",
      protocol: {
        mode: "github",
        documentName: "KATA-WORKFLOW.md",
        path: "/fake/path/KATA-WORKFLOW.md",
        ready: true,
      },
    };
    stateRef.current = makeState({
      activeMilestone: null,
      registry: [],
      phase: "pre-planning",
    });
    mockShowNextAction.mockResolvedValue("plan_new_milestone");

    const ctx = makeCtx();
    const pi = makePi();

    const discussPrompt = 'New milestone M001.\n\nSay exactly: "What would you like to build?" — nothing else.';
    mockCreateBackend.mockImplementation(async () =>
      makeBackend({
        isLinearMode: false,
        buildDiscussPrompt: vi.fn(() => discussPrompt),
      }),
    );

    await showPlan(ctx as any, pi as any, "/tmp/test");

    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Say exactly: "What would you like to build?"'),
      }),
      { triggerTurn: true },
    );
  });

  it("Blocked: warns and does not call showNextAction", async () => {
    stateRef.current = makeState({
      phase: "blocked",
      blockers: ["LINEAR_API_KEY missing"],
    });

    const ctx = makeCtx();
    const pi = makePi();

    await showPlan(ctx as any, pi as any, "/tmp/test");

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Blocked:"),
      "warning",
    );
    expect(mockShowNextAction).not.toHaveBeenCalled();
  });
});
