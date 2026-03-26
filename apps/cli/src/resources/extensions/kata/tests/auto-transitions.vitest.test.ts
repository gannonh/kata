import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import type { KataState } from "../types.js";
import { ensurePreconditions } from "../auto-transitions.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpBase: string;
let mockEnsureSliceBranch: ReturnType<typeof vi.fn>;

function makeState(): KataState {
  return {
    activeMilestone: { id: "M001", title: "Milestone 1" },
    activeSlice: { id: "S01", title: "Slice 1" },
    activeTask: null,
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "",
    registry: [],
  };
}

function setupKataDir(): string {
  tmpBase = mkdtempSync(join(tmpdir(), "auto-transitions-test-"));
  return tmpBase;
}

/** Call ensurePreconditions with the mock injected. */
function callEnsure(unitType: string, unitId: string, base: string, state: KataState) {
  return ensurePreconditions(unitType, unitId, base, state, {
    ensureSliceBranch: mockEnsureSliceBranch,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ensurePreconditions", () => {
  beforeEach(() => {
    mockEnsureSliceBranch = vi.fn();
  });

  afterEach(() => {
    if (tmpBase) {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  it("creates milestone dir with slices/ when it doesn't exist", () => {
    const base = setupKataDir();
    // Ensure .kata/milestones exists but M001 doesn't
    mkdirSync(join(base, ".kata", "milestones"), { recursive: true });

    callEnsure("plan-milestone", "M001", base, makeState());

    expect(existsSync(join(base, ".kata", "milestones", "M001", "slices"))).toBe(true);
  });

  it("does not error when milestone dir already exists", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices"), { recursive: true });

    expect(() => {
      callEnsure("plan-milestone", "M001", base, makeState());
    }).not.toThrow();
  });

  it("creates slice dir with tasks/ when it doesn't exist", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices"), { recursive: true });

    callEnsure("plan-slice", "M001/S01", base, makeState());

    expect(existsSync(join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks"))).toBe(true);
  });

  it("ensures tasks/ subdir when slice dir exists but tasks/ doesn't", () => {
    const base = setupKataDir();
    // Create slice dir without tasks/
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices", "S01"), { recursive: true });

    callEnsure("execute-task", "M001/S01/T01", base, makeState());

    expect(existsSync(join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks"))).toBe(true);
  });

  it("no-op when slice dir and tasks/ already exist", () => {
    const base = setupKataDir();
    const tasksDir = join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks");
    mkdirSync(tasksDir, { recursive: true });

    expect(() => {
      callEnsure("execute-task", "M001/S01/T01", base, makeState());
    }).not.toThrow();

    expect(existsSync(tasksDir)).toBe(true);
  });

  it("calls ensureSliceBranch for research-slice", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });

    callEnsure("research-slice", "M001/S01", base, makeState());

    expect(mockEnsureSliceBranch).toHaveBeenCalledWith(base, "M001", "S01");
  });

  it("calls ensureSliceBranch for plan-slice", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });

    callEnsure("plan-slice", "M001/S01", base, makeState());

    expect(mockEnsureSliceBranch).toHaveBeenCalledWith(base, "M001", "S01");
  });

  it("calls ensureSliceBranch for execute-task", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });

    callEnsure("execute-task", "M001/S01/T01", base, makeState());

    expect(mockEnsureSliceBranch).toHaveBeenCalledWith(base, "M001", "S01");
  });

  it("calls ensureSliceBranch for complete-slice", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });

    callEnsure("complete-slice", "M001/S01", base, makeState());

    expect(mockEnsureSliceBranch).toHaveBeenCalledWith(base, "M001", "S01");
  });

  it("calls ensureSliceBranch for replan-slice", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });

    callEnsure("replan-slice", "M001/S01", base, makeState());

    expect(mockEnsureSliceBranch).toHaveBeenCalledWith(base, "M001", "S01");
  });

  it("does NOT call ensureSliceBranch for plan-milestone", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices"), { recursive: true });

    callEnsure("plan-milestone", "M001", base, makeState());

    expect(mockEnsureSliceBranch).not.toHaveBeenCalled();
  });

  it("does NOT call ensureSliceBranch for research-milestone", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices"), { recursive: true });

    callEnsure("research-milestone", "M001", base, makeState());

    expect(mockEnsureSliceBranch).not.toHaveBeenCalled();
  });

  it("does NOT call ensureSliceBranch for complete-milestone", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices"), { recursive: true });

    callEnsure("complete-milestone", "M001", base, makeState());

    expect(mockEnsureSliceBranch).not.toHaveBeenCalled();
  });

  it("does NOT call ensureSliceBranch for reassess-roadmap with milestone-only ID", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices"), { recursive: true });

    // reassess-roadmap is NOT in the slice branch units list
    callEnsure("reassess-roadmap", "M001", base, makeState());

    expect(mockEnsureSliceBranch).not.toHaveBeenCalled();
  });

  it("creates deeply nested structure for task-level unitId", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones"), { recursive: true });

    callEnsure("execute-task", "M001/S02/T03", base, makeState());

    expect(existsSync(join(base, ".kata", "milestones", "M001", "slices", "S02", "tasks"))).toBe(true);
    expect(mockEnsureSliceBranch).toHaveBeenCalledWith(base, "M001", "S02");
  });

  it("handles run-uat with slice-level unitId (not in SLICE_BRANCH_UNITS)", () => {
    const base = setupKataDir();
    mkdirSync(join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });

    callEnsure("run-uat", "M001/S01", base, makeState());

    // run-uat is NOT in SLICE_BRANCH_UNITS, so no branch checkout
    expect(mockEnsureSliceBranch).not.toHaveBeenCalled();
  });
});
