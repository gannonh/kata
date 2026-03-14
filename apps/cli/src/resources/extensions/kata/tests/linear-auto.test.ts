/**
 * Unit tests for linear-auto.ts — resolveLinearKataState state resolution,
 * selectLinearPrompt dispatcher, and prompt builders.
 *
 * resolveLinearKataState blocked paths (missing API key, file mode fallback)
 * do NOT require network access — the function returns before any API call.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  resolveLinearKataState,
  selectLinearPrompt,
  buildLinearExecuteTaskPrompt,
  buildLinearPlanSlicePrompt,
  buildLinearPlanMilestonePrompt,
  buildLinearCompleteSlicePrompt,
} from "../linear-auto.ts";
import type { KataState } from "../types.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<KataState>): KataState {
  return {
    phase: "executing",
    activeMilestone: { id: "M001", title: "Test Milestone" },
    activeSlice: { id: "S01", title: "Test Slice" },
    activeTask: { id: "T01", title: "Test Task" },
    blockers: [],
    recentDecisions: [],
    nextAction: "Execute T01",
    registry: [],
    progress: { milestones: { done: 0, total: 1 } },
    ...overrides,
  };
}

// ─── resolveLinearKataState ───────────────────────────────────────────────────

test("resolveLinearKataState returns blocked when LINEAR_API_KEY is not set", async () => {
  // Temporarily write linear-mode project preferences so isLinearMode() returns true.
  // loadEffectiveKataPreferences() re-reads from disk on each call, so this is safe.
  const prefsPath = join(process.cwd(), ".kata", "preferences.md");
  const originalPrefs = readFileSync(prefsPath, "utf-8");
  const originalApiKey = process.env.LINEAR_API_KEY;

  const linearPrefs = [
    "---",
    "workflow:",
    "  mode: linear",
    "linear:",
    "  teamId: team-test",
    "  projectId: proj-test",
    "---",
    "",
  ].join("\n");

  writeFileSync(prefsPath, linearPrefs, "utf-8");
  delete process.env.LINEAR_API_KEY;

  try {
    const state = await resolveLinearKataState("/tmp");
    assert.equal(state.phase, "blocked");
    assert.ok((state.blockers?.length ?? 0) > 0, "blockers should be non-empty");
    assert.ok(
      state.blockers?.some((b) => b.includes("LINEAR_API_KEY")),
      "blockers should mention LINEAR_API_KEY",
    );
  } finally {
    writeFileSync(prefsPath, originalPrefs, "utf-8");
    if (originalApiKey === undefined) {
      delete process.env.LINEAR_API_KEY;
    } else {
      process.env.LINEAR_API_KEY = originalApiKey;
    }
  }
});

test("resolveLinearKataState falls back to deriveState in file mode", async () => {
  // isLinearMode() reads PROJECT_PREFERENCES_PATH which is captured at module
  // load time from process.cwd(), so we cannot override it with process.chdir().
  // Instead, temporarily flip the project preferences to file mode.
  const prefsPath = join(process.cwd(), ".kata", "preferences.md");
  let originalPrefs: string | undefined;
  try {
    originalPrefs = readFileSync(prefsPath, "utf-8");
  } catch {
    // No project prefs — isLinearMode() returns false by default
  }

  try {
    if (originalPrefs) {
      // Temporarily set workflow.mode: file
      const filePrefs = originalPrefs.replace(
        /mode:\s*linear/,
        "mode: file",
      );
      writeFileSync(prefsPath, filePrefs, "utf-8");
    }

    const tmp = mkdtempSync(join(tmpdir(), "kata-linear-auto-"));
    const state = await resolveLinearKataState(tmp);
    // Empty temp dir has no .kata/ → pre-planning phase with no active milestone.
    assert.equal(state.phase, "pre-planning");
    assert.equal(state.activeMilestone, null);
  } finally {
    if (originalPrefs) {
      writeFileSync(prefsPath, originalPrefs, "utf-8");
    }
  }
});

// ─── selectLinearPrompt dispatcher ───────────────────────────────────────────

test("selectLinearPrompt returns null for phase=complete", () => {
  const state = makeState({ phase: "complete" });
  assert.equal(selectLinearPrompt(state), null);
});

test("selectLinearPrompt returns null for phase=blocked", () => {
  const state = makeState({ phase: "blocked", blockers: ["missing key"] });
  assert.equal(selectLinearPrompt(state), null);
});

test("selectLinearPrompt returns execute prompt for phase=executing", () => {
  const state = makeState({ phase: "executing" });
  const prompt = selectLinearPrompt(state);
  assert.ok(prompt !== null);
  assert.match(prompt, /Execute Task/);
  assert.match(prompt, /M001/);
  assert.match(prompt, /T01/);
});

test("selectLinearPrompt returns execute prompt for phase=verifying", () => {
  const state = makeState({ phase: "verifying" });
  const prompt = selectLinearPrompt(state);
  assert.ok(prompt !== null);
  assert.match(prompt, /Execute Task/);
});

test("selectLinearPrompt returns plan-slice prompt for phase=planning", () => {
  const state = makeState({ phase: "planning" });
  const prompt = selectLinearPrompt(state);
  assert.ok(prompt !== null);
  assert.match(prompt, /Plan Slice/);
  assert.match(prompt, /S01/);
});

test("selectLinearPrompt returns plan-milestone prompt for phase=pre-planning", () => {
  const state = makeState({ phase: "pre-planning" });
  const prompt = selectLinearPrompt(state);
  assert.ok(prompt !== null);
  assert.match(prompt, /Plan Milestone/);
  assert.match(prompt, /M001/);
});

test("selectLinearPrompt returns complete-slice prompt for phase=summarizing", () => {
  const state = makeState({ phase: "summarizing" });
  const prompt = selectLinearPrompt(state);
  assert.ok(prompt !== null);
  assert.match(prompt, /Complete Slice/);
  assert.match(prompt, /S01/);
});

test("selectLinearPrompt returns null for unknown phases", () => {
  // @ts-ignore — testing runtime fallback
  const state = makeState({ phase: "discussing" });
  assert.equal(selectLinearPrompt(state), null);
});

// ─── buildLinearExecuteTaskPrompt ────────────────────────────────────────────

test("buildLinearExecuteTaskPrompt includes milestone, slice, task IDs", () => {
  const state = makeState({
    phase: "executing",
    activeMilestone: { id: "M002", title: "My Milestone" },
    activeSlice: { id: "S03", title: "My Slice" },
    activeTask: { id: "T02", title: "My Task" },
  });
  const prompt = buildLinearExecuteTaskPrompt(state);
  assert.match(prompt, /M002/);
  assert.match(prompt, /S03/);
  assert.match(prompt, /T02/);
  assert.match(prompt, /My Task/);
});

test("buildLinearExecuteTaskPrompt references kata_derive_state", () => {
  const state = makeState();
  const prompt = buildLinearExecuteTaskPrompt(state);
  assert.match(prompt, /kata_derive_state/);
});

test("buildLinearExecuteTaskPrompt references kata_update_issue_state", () => {
  const state = makeState();
  const prompt = buildLinearExecuteTaskPrompt(state);
  assert.match(prompt, /kata_update_issue_state/);
});

test("buildLinearExecuteTaskPrompt references LINEAR-WORKFLOW.md", () => {
  const state = makeState();
  const prompt = buildLinearExecuteTaskPrompt(state);
  assert.match(prompt, /LINEAR-WORKFLOW\.md/);
});

// ─── buildLinearPlanSlicePrompt ───────────────────────────────────────────────

test("buildLinearPlanSlicePrompt includes milestone and slice IDs", () => {
  const state = makeState({
    phase: "planning",
    activeMilestone: { id: "M001", title: "Milestone One" },
    activeSlice: { id: "S02", title: "Slice Two" },
  });
  const prompt = buildLinearPlanSlicePrompt(state);
  assert.match(prompt, /M001/);
  assert.match(prompt, /S02/);
  assert.match(prompt, /Slice Two/);
});

test("buildLinearPlanSlicePrompt references kata_create_task", () => {
  const state = makeState({ phase: "planning" });
  const prompt = buildLinearPlanSlicePrompt(state);
  assert.match(prompt, /kata_create_task/);
});

test("buildLinearPlanSlicePrompt references kata_update_issue_state with executing phase", () => {
  const state = makeState({ phase: "planning" });
  const prompt = buildLinearPlanSlicePrompt(state);
  assert.match(prompt, /kata_update_issue_state/);
  assert.match(prompt, /executing/);
});

// ─── buildLinearPlanMilestonePrompt ──────────────────────────────────────────

test("buildLinearPlanMilestonePrompt includes milestone ID and title", () => {
  const state = makeState({
    phase: "pre-planning",
    activeMilestone: { id: "M003", title: "Big Milestone" },
  });
  const prompt = buildLinearPlanMilestonePrompt(state);
  assert.match(prompt, /M003/);
  assert.match(prompt, /Big Milestone/);
});

test("buildLinearPlanMilestonePrompt references kata_create_slice", () => {
  const state = makeState({ phase: "pre-planning" });
  const prompt = buildLinearPlanMilestonePrompt(state);
  assert.match(prompt, /kata_create_slice/);
});

// ─── buildLinearCompleteSlicePrompt ──────────────────────────────────────────

test("buildLinearCompleteSlicePrompt includes milestone and slice IDs", () => {
  const state = makeState({
    phase: "summarizing",
    activeMilestone: { id: "M001", title: "Milestone" },
    activeSlice: { id: "S04", title: "Fourth Slice" },
  });
  const prompt = buildLinearCompleteSlicePrompt(state);
  assert.match(prompt, /M001/);
  assert.match(prompt, /S04/);
  assert.match(prompt, /Fourth Slice/);
});

test("buildLinearCompleteSlicePrompt references kata_update_issue_state with done phase", () => {
  const state = makeState({ phase: "summarizing" });
  const prompt = buildLinearCompleteSlicePrompt(state);
  assert.match(prompt, /kata_update_issue_state/);
  assert.match(prompt, /done/);
});

test("buildLinearCompleteSlicePrompt references kata_list_tasks", () => {
  const state = makeState({ phase: "summarizing" });
  const prompt = buildLinearCompleteSlicePrompt(state);
  assert.match(prompt, /kata_list_tasks/);
});
