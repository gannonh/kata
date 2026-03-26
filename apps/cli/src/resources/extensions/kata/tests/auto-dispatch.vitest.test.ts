import { describe, it, expect } from "vitest";
import { deriveUnitType, deriveUnitId, peekNext } from "../auto-dispatch.js";
import type { KataState } from "../types.js";
import type { PromptOptions } from "../backend.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<KataState> = {}): KataState {
  return {
    activeMilestone: { id: "M001", title: "Milestone 1" },
    activeSlice: { id: "S01", title: "Slice 1" },
    activeTask: null,
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "",
    registry: [],
    ...overrides,
  };
}

function opts(overrides: Partial<PromptOptions> = {}): PromptOptions {
  return { ...overrides };
}

// ─── deriveUnitType ───────────────────────────────────────────────────────────

describe("deriveUnitType", () => {
  it("returns 'run-uat' when uatSliceId is set", () => {
    const state = makeState({ phase: "executing" });
    expect(deriveUnitType(state, opts({ uatSliceId: "S01" }))).toBe("run-uat");
  });

  it("returns 'reassess-roadmap' when reassessSliceId is set", () => {
    const state = makeState({ phase: "executing" });
    expect(deriveUnitType(state, opts({ reassessSliceId: "S01" }))).toBe("reassess-roadmap");
  });

  it("returns 'research-milestone' when dispatchResearch is 'milestone'", () => {
    const state = makeState({ phase: "pre-planning" });
    expect(deriveUnitType(state, opts({ dispatchResearch: "milestone" }))).toBe("research-milestone");
  });

  it("returns 'research-slice' when dispatchResearch is 'slice'", () => {
    const state = makeState({ phase: "planning" });
    expect(deriveUnitType(state, opts({ dispatchResearch: "slice" }))).toBe("research-slice");
  });

  it("returns 'plan-milestone' for pre-planning phase", () => {
    expect(deriveUnitType(makeState({ phase: "pre-planning" }), opts())).toBe("plan-milestone");
  });

  it("returns 'plan-slice' for planning phase", () => {
    expect(deriveUnitType(makeState({ phase: "planning" }), opts())).toBe("plan-slice");
  });

  it("returns 'execute-task' for executing phase", () => {
    expect(deriveUnitType(makeState({ phase: "executing" }), opts())).toBe("execute-task");
  });

  it("returns 'execute-task' for verifying phase", () => {
    expect(deriveUnitType(makeState({ phase: "verifying" }), opts())).toBe("execute-task");
  });

  it("returns 'complete-slice' for summarizing phase", () => {
    expect(deriveUnitType(makeState({ phase: "summarizing" }), opts())).toBe("complete-slice");
  });

  it("returns 'complete-milestone' for completing-milestone phase", () => {
    expect(deriveUnitType(makeState({ phase: "completing-milestone" }), opts())).toBe("complete-milestone");
  });

  it("returns 'replan-slice' for replanning-slice phase", () => {
    expect(deriveUnitType(makeState({ phase: "replanning-slice" }), opts())).toBe("replan-slice");
  });

  it("returns 'unknown-<phase>' for unrecognized phase", () => {
    expect(deriveUnitType(makeState({ phase: "blocked" as any }), opts())).toBe("unknown-blocked");
  });

  it("UAT override takes priority over phase", () => {
    const state = makeState({ phase: "pre-planning" });
    expect(deriveUnitType(state, opts({ uatSliceId: "S02" }))).toBe("run-uat");
  });

  it("reassess override takes priority over phase but not UAT", () => {
    const state = makeState({ phase: "planning" });
    // reassess alone → reassess-roadmap
    expect(deriveUnitType(state, opts({ reassessSliceId: "S01" }))).toBe("reassess-roadmap");
    // UAT + reassess → UAT wins (checked first)
    expect(deriveUnitType(state, opts({ uatSliceId: "S02", reassessSliceId: "S01" }))).toBe("run-uat");
  });

  it("research override takes priority over phase switch", () => {
    const state = makeState({ phase: "executing" });
    expect(deriveUnitType(state, opts({ dispatchResearch: "milestone" }))).toBe("research-milestone");
    expect(deriveUnitType(state, opts({ dispatchResearch: "slice" }))).toBe("research-slice");
  });

  it("returns unknown for 'complete' phase", () => {
    expect(deriveUnitType(makeState({ phase: "complete" as any }), opts())).toBe("unknown-complete");
  });

  it("returns unknown for 'paused' phase", () => {
    expect(deriveUnitType(makeState({ phase: "paused" as any }), opts())).toBe("unknown-paused");
  });
});

// ─── deriveUnitId ─────────────────────────────────────────────────────────────

describe("deriveUnitId", () => {
  it("returns mid/sid/tid when task is active", () => {
    const state = makeState({
      activeTask: { id: "T01", title: "Task 1" },
    });
    expect(deriveUnitId(state)).toBe("M001/S01/T01");
  });

  it("returns mid/sid when no task is active", () => {
    const state = makeState();
    expect(deriveUnitId(state)).toBe("M001/S01");
  });

  it("returns mid only when no slice or task", () => {
    const state = makeState({ activeSlice: null, activeTask: null });
    expect(deriveUnitId(state)).toBe("M001");
  });

  it("returns 'unknown' when no milestone", () => {
    const state = makeState({ activeMilestone: null, activeSlice: null });
    expect(deriveUnitId(state)).toBe("unknown");
  });

  it("uses uatSliceId instead of state slice for UAT", () => {
    const state = makeState({
      activeSlice: { id: "S02", title: "Slice 2" },
      activeTask: { id: "T01", title: "Task 1" },
    });
    const result = deriveUnitId(state, opts({ uatSliceId: "S01" }));
    // UAT targets previous slice; should NOT include tid
    expect(result).toBe("M001/S01");
  });

  it("uses reassessSliceId instead of state slice for reassessment", () => {
    const state = makeState({
      activeSlice: { id: "S03", title: "Slice 3" },
      activeTask: { id: "T02", title: "Task 2" },
    });
    const result = deriveUnitId(state, opts({ reassessSliceId: "S02" }));
    expect(result).toBe("M001/S02");
  });

  it("includes tid when no override options", () => {
    const state = makeState({
      activeTask: { id: "T03", title: "Task 3" },
    });
    expect(deriveUnitId(state, opts())).toBe("M001/S01/T03");
  });

  it("tid excluded when uatSliceId is set even if task active", () => {
    const state = makeState({
      activeTask: { id: "T01", title: "Task 1" },
    });
    expect(deriveUnitId(state, opts({ uatSliceId: "S01" }))).toBe("M001/S01");
  });

  it("tid excluded when reassessSliceId is set even if task active", () => {
    const state = makeState({
      activeTask: { id: "T01", title: "Task 1" },
    });
    expect(deriveUnitId(state, opts({ reassessSliceId: "S01" }))).toBe("M001/S01");
  });

  it("falls back to state slice when options have no override", () => {
    const state = makeState({ activeSlice: { id: "S05", title: "Slice 5" } });
    expect(deriveUnitId(state, opts({ dispatchResearch: "slice" }))).toBe("M001/S05");
  });

  it("returns mid when state has milestone but no slice and no override", () => {
    const state = makeState({ activeSlice: null });
    expect(deriveUnitId(state, opts())).toBe("M001");
  });
});

// ─── peekNext ─────────────────────────────────────────────────────────────────

describe("peekNext", () => {
  const state = makeState();

  it("returns 'plan milestone roadmap' for research-milestone", () => {
    expect(peekNext("research-milestone", state)).toBe("plan milestone roadmap");
  });

  it("returns 'research first slice' for plan-milestone", () => {
    expect(peekNext("plan-milestone", state)).toBe("research first slice");
  });

  it("returns 'plan <sid>' for research-slice", () => {
    expect(peekNext("research-slice", state)).toBe("plan S01");
  });

  it("returns 'execute first task' for plan-slice", () => {
    expect(peekNext("plan-slice", state)).toBe("execute first task");
  });

  it("returns 'continue <sid>' for execute-task", () => {
    expect(peekNext("execute-task", state)).toBe("continue S01");
  });

  it("returns 'reassess roadmap' for complete-slice", () => {
    expect(peekNext("complete-slice", state)).toBe("reassess roadmap");
  });

  it("returns 're-execute <sid>' for replan-slice", () => {
    expect(peekNext("replan-slice", state)).toBe("re-execute S01");
  });

  it("returns 'advance to next slice' for reassess-roadmap", () => {
    expect(peekNext("reassess-roadmap", state)).toBe("advance to next slice");
  });

  it("returns 'reassess roadmap' for run-uat", () => {
    expect(peekNext("run-uat", state)).toBe("reassess roadmap");
  });

  it("returns empty string for unknown unit type", () => {
    expect(peekNext("unknown-xyz", state)).toBe("");
  });

  it("uses empty sid when no active slice", () => {
    const noSlice = makeState({ activeSlice: null });
    expect(peekNext("research-slice", noSlice)).toBe("plan ");
    expect(peekNext("execute-task", noSlice)).toBe("continue ");
    expect(peekNext("replan-slice", noSlice)).toBe("re-execute ");
  });
});
