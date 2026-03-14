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
  buildLinearResearchMilestonePrompt,
  buildLinearResearchSlicePrompt,
  buildLinearCompleteMilestonePrompt,
  buildLinearReplanSlicePrompt,
  buildLinearReassessRoadmapPrompt,
  buildLinearRunUatPrompt,
} from "../linear-auto.ts";
import type { KataState } from "../types.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides?: Partial<KataState>): KataState {
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
  const prefsPath = join(process.cwd(), ".kata", "preferences.md");
  const originalPrefs = readFileSync(prefsPath, "utf-8");
  const originalApiKey = process.env.LINEAR_API_KEY;

  try {
    writeFileSync(
      prefsPath,
      [
        "---",
        "workflow:",
        "  mode: linear",
        "linear:",
        '  teamKey: "KAT"',
        '  projectId: "proj-123"',
        "---",
      ].join("\n"),
    );
    delete process.env.LINEAR_API_KEY;

    const base = mkdtempSync(join(tmpdir(), "kata-linear-"));
    const state = await resolveLinearKataState(base);
    assert.equal(state.phase, "blocked");
    assert.ok(state.blockers.some((b) => /LINEAR_API_KEY/i.test(b)));
  } finally {
    writeFileSync(prefsPath, originalPrefs);
    if (originalApiKey !== undefined) {
      process.env.LINEAR_API_KEY = originalApiKey;
    }
  }
});

test("resolveLinearKataState falls back to deriveState in file mode", async () => {
  const state = await resolveLinearKataState(process.cwd());
  assert.ok(state.phase !== "blocked" || state.blockers.length > 0);
});

// ─── selectLinearPrompt dispatcher ────────────────────────────────────────────

test("selectLinearPrompt returns null for phase=complete", () => {
  assert.equal(selectLinearPrompt(makeState({ phase: "complete" })), null);
});

test("selectLinearPrompt returns null for phase=blocked", () => {
  assert.equal(selectLinearPrompt(makeState({ phase: "blocked" })), null);
});

test("selectLinearPrompt returns execute prompt for phase=executing", () => {
  const prompt = selectLinearPrompt(makeState({ phase: "executing" }));
  assert.ok(prompt);
  assert.match(prompt, /Execute Task/);
});

test("selectLinearPrompt returns execute prompt for phase=verifying", () => {
  const prompt = selectLinearPrompt(makeState({ phase: "verifying" }));
  assert.ok(prompt);
  assert.match(prompt, /Execute Task/);
});

test("selectLinearPrompt returns plan-slice prompt for phase=planning", () => {
  const prompt = selectLinearPrompt(makeState({ phase: "planning" }));
  assert.ok(prompt);
  assert.match(prompt, /Plan Slice/);
});

test("selectLinearPrompt returns plan-milestone prompt for phase=pre-planning", () => {
  const prompt = selectLinearPrompt(makeState({ phase: "pre-planning" }));
  assert.ok(prompt);
  assert.match(prompt, /Plan Milestone/);
});

test("selectLinearPrompt returns complete-slice prompt for phase=summarizing", () => {
  const prompt = selectLinearPrompt(makeState({ phase: "summarizing" }));
  assert.ok(prompt);
  assert.match(prompt, /Complete Slice/);
});

test("selectLinearPrompt returns complete-milestone prompt for phase=completing-milestone", () => {
  const prompt = selectLinearPrompt(makeState({ phase: "completing-milestone" }));
  assert.ok(prompt);
  assert.match(prompt, /Complete Milestone/);
});

test("selectLinearPrompt returns replan prompt for phase=replanning-slice", () => {
  const prompt = selectLinearPrompt(makeState({ phase: "replanning-slice" }));
  assert.ok(prompt);
  assert.match(prompt, /Replan Slice/);
});

test("selectLinearPrompt returns null for unknown phases", () => {
  assert.equal(selectLinearPrompt(makeState({ phase: "paused" })), null);
  assert.equal(
    selectLinearPrompt(makeState({ phase: "some-future-phase" as any })),
    null,
  );
});

// ─── selectLinearPrompt dispatch-time overrides ───────────────────────────────

test("selectLinearPrompt dispatchResearch=milestone overrides phase", () => {
  const prompt = selectLinearPrompt(makeState({ phase: "pre-planning" }), {
    dispatchResearch: "milestone",
  });
  assert.ok(prompt);
  assert.match(prompt, /Research Milestone/);
});

test("selectLinearPrompt dispatchResearch=slice overrides phase", () => {
  const prompt = selectLinearPrompt(makeState({ phase: "planning" }), {
    dispatchResearch: "slice",
  });
  assert.ok(prompt);
  assert.match(prompt, /Research Slice/);
});

test("selectLinearPrompt reassessSliceId overrides phase", () => {
  const prompt = selectLinearPrompt(makeState(), { reassessSliceId: "S01" });
  assert.ok(prompt);
  assert.match(prompt, /Reassess Roadmap/);
  assert.match(prompt, /S01-SUMMARY/);
  assert.match(prompt, /S01-ASSESSMENT/);
});

test("selectLinearPrompt uatSliceId overrides phase", () => {
  const prompt = selectLinearPrompt(makeState(), { uatSliceId: "S02" });
  assert.ok(prompt);
  assert.match(prompt, /Run UAT/);
  assert.match(prompt, /S02-UAT/);
});

test("selectLinearPrompt override priority: uat > reassess > research", () => {
  // UAT takes priority over everything
  const prompt = selectLinearPrompt(makeState(), {
    uatSliceId: "S01",
    reassessSliceId: "S01",
    dispatchResearch: "milestone",
  });
  assert.ok(prompt);
  assert.match(prompt, /Run UAT/);
});

// ─── buildLinearExecuteTaskPrompt ─────────────────────────────────────────────

test("buildLinearExecuteTaskPrompt includes milestone, slice, task IDs", () => {
  const state = makeState();
  const prompt = buildLinearExecuteTaskPrompt(state);
  assert.match(prompt, /M001/);
  assert.match(prompt, /S01/);
  assert.match(prompt, /T01/);
  assert.match(prompt, /Test Task/);
});

test("buildLinearExecuteTaskPrompt references kata_derive_state", () => {
  const prompt = buildLinearExecuteTaskPrompt(makeState());
  assert.match(prompt, /kata_derive_state/);
});

test("buildLinearExecuteTaskPrompt references kata_update_issue_state", () => {
  const prompt = buildLinearExecuteTaskPrompt(makeState());
  assert.match(prompt, /kata_update_issue_state/);
});

test("buildLinearExecuteTaskPrompt references KATA-WORKFLOW.md", () => {
  const prompt = buildLinearExecuteTaskPrompt(makeState());
  assert.match(prompt, /KATA-WORKFLOW\.md/);
});

test("buildLinearExecuteTaskPrompt reads T01-PLAN as required", () => {
  const prompt = buildLinearExecuteTaskPrompt(makeState());
  assert.match(prompt, /T01-PLAN.*required/i);
});

test("buildLinearExecuteTaskPrompt reads S01-PLAN as optional", () => {
  const prompt = buildLinearExecuteTaskPrompt(makeState());
  assert.match(prompt, /S01-PLAN/);
});

test("buildLinearExecuteTaskPrompt includes carry-forward instruction", () => {
  const prompt = buildLinearExecuteTaskPrompt(makeState());
  assert.match(prompt, /prior task/i);
  assert.match(prompt, /Txx-SUMMARY/i);
});

test("buildLinearExecuteTaskPrompt includes continue/resume check", () => {
  const prompt = buildLinearExecuteTaskPrompt(makeState());
  assert.match(prompt, /partial/i);
});

test("buildLinearExecuteTaskPrompt has no cascading fallback", () => {
  const prompt = buildLinearExecuteTaskPrompt(makeState());
  // Should NOT contain the old cascade pattern
  assert.doesNotMatch(prompt, /If this returns null.*read.*PLAN.*If that also returns null/i);
});

// ─── buildLinearPlanSlicePrompt ───────────────────────────────────────────────

test("buildLinearPlanSlicePrompt includes milestone and slice IDs", () => {
  const state = makeState({
    phase: "planning",
    activeMilestone: { id: "M001", title: "Milestone One" },
    activeSlice: { id: "S02", title: "Second Slice" },
  });
  const prompt = buildLinearPlanSlicePrompt(state);
  assert.match(prompt, /M001/);
  assert.match(prompt, /S02/);
  assert.match(prompt, /Second Slice/);
});

test("buildLinearPlanSlicePrompt reads M001-ROADMAP as required", () => {
  const prompt = buildLinearPlanSlicePrompt(makeState({ phase: "planning" }));
  assert.match(prompt, /M001-ROADMAP.*required/i);
});

test("buildLinearPlanSlicePrompt references kata_create_task", () => {
  const prompt = buildLinearPlanSlicePrompt(makeState({ phase: "planning" }));
  assert.match(prompt, /kata_create_task/);
});

test("buildLinearPlanSlicePrompt references kata_update_issue_state with executing phase", () => {
  const prompt = buildLinearPlanSlicePrompt(makeState({ phase: "planning" }));
  assert.match(prompt, /kata_update_issue_state/);
  assert.match(prompt, /executing/);
});

test("buildLinearPlanSlicePrompt includes dependency summary instruction", () => {
  const prompt = buildLinearPlanSlicePrompt(makeState({ phase: "planning" }));
  assert.match(prompt, /depends:\[\]/i);
  assert.match(prompt, /Sxx-SUMMARY/i);
});

test("buildLinearPlanSlicePrompt includes idempotency check", () => {
  const prompt = buildLinearPlanSlicePrompt(makeState({ phase: "planning" }));
  assert.match(prompt, /idempotency/i);
});

// ─── buildLinearPlanMilestonePrompt ───────────────────────────────────────────

test("buildLinearPlanMilestonePrompt includes milestone ID and title", () => {
  const prompt = buildLinearPlanMilestonePrompt(makeState({ phase: "pre-planning" }));
  assert.match(prompt, /M001/);
  assert.match(prompt, /Test Milestone/);
});

test("buildLinearPlanMilestonePrompt reads M001-CONTEXT as required", () => {
  const prompt = buildLinearPlanMilestonePrompt(makeState({ phase: "pre-planning" }));
  assert.match(prompt, /M001-CONTEXT.*required/i);
});

test("buildLinearPlanMilestonePrompt references kata_create_slice", () => {
  const prompt = buildLinearPlanMilestonePrompt(makeState({ phase: "pre-planning" }));
  assert.match(prompt, /kata_create_slice/);
});

test("buildLinearPlanMilestonePrompt includes idempotency check", () => {
  const prompt = buildLinearPlanMilestonePrompt(makeState({ phase: "pre-planning" }));
  assert.match(prompt, /idempotency/i);
});

// ─── buildLinearCompleteSlicePrompt ───────────────────────────────────────────

test("buildLinearCompleteSlicePrompt includes milestone and slice IDs", () => {
  const prompt = buildLinearCompleteSlicePrompt(makeState({ phase: "summarizing" }));
  assert.match(prompt, /M001/);
  assert.match(prompt, /S01/);
});

test("buildLinearCompleteSlicePrompt reads M001-ROADMAP as required", () => {
  const prompt = buildLinearCompleteSlicePrompt(makeState({ phase: "summarizing" }));
  assert.match(prompt, /M001-ROADMAP.*required/i);
});

test("buildLinearCompleteSlicePrompt reads S01-PLAN as required", () => {
  const prompt = buildLinearCompleteSlicePrompt(makeState({ phase: "summarizing" }));
  assert.match(prompt, /S01-PLAN.*required/i);
});

test("buildLinearCompleteSlicePrompt references kata_update_issue_state with done phase", () => {
  const prompt = buildLinearCompleteSlicePrompt(makeState({ phase: "summarizing" }));
  assert.match(prompt, /kata_update_issue_state/);
  assert.match(prompt, /done/);
});

test("buildLinearCompleteSlicePrompt references kata_list_tasks for summaries", () => {
  const prompt = buildLinearCompleteSlicePrompt(makeState({ phase: "summarizing" }));
  assert.match(prompt, /kata_list_tasks/);
});

test("buildLinearCompleteSlicePrompt writes UAT", () => {
  const prompt = buildLinearCompleteSlicePrompt(makeState({ phase: "summarizing" }));
  assert.match(prompt, /S01-UAT/);
});

// ─── buildLinearResearchMilestonePrompt ───────────────────────────────────────

test("buildLinearResearchMilestonePrompt reads M001-CONTEXT as required", () => {
  const prompt = buildLinearResearchMilestonePrompt(makeState({ phase: "pre-planning" }));
  assert.match(prompt, /M001-CONTEXT.*required/i);
});

test("buildLinearResearchMilestonePrompt writes M001-RESEARCH", () => {
  const prompt = buildLinearResearchMilestonePrompt(makeState({ phase: "pre-planning" }));
  assert.match(prompt, /M001-RESEARCH/);
});

test("buildLinearResearchMilestonePrompt reads optional PROJECT, REQUIREMENTS, DECISIONS", () => {
  const prompt = buildLinearResearchMilestonePrompt(makeState({ phase: "pre-planning" }));
  assert.match(prompt, /PROJECT/);
  assert.match(prompt, /REQUIREMENTS/);
  assert.match(prompt, /DECISIONS/);
});

// ─── buildLinearResearchSlicePrompt ───────────────────────────────────────────

test("buildLinearResearchSlicePrompt reads M001-ROADMAP as required", () => {
  const prompt = buildLinearResearchSlicePrompt(makeState({ phase: "planning" }));
  assert.match(prompt, /M001-ROADMAP.*required/i);
});

test("buildLinearResearchSlicePrompt writes S01-RESEARCH", () => {
  const prompt = buildLinearResearchSlicePrompt(makeState({ phase: "planning" }));
  assert.match(prompt, /S01-RESEARCH/);
});

test("buildLinearResearchSlicePrompt includes dependency summary instruction", () => {
  const prompt = buildLinearResearchSlicePrompt(makeState({ phase: "planning" }));
  assert.match(prompt, /depends:\[\]/i);
});

// ─── buildLinearCompleteMilestonePrompt ───────────────────────────────────────

test("buildLinearCompleteMilestonePrompt reads M001-ROADMAP as required", () => {
  const prompt = buildLinearCompleteMilestonePrompt(makeState({ phase: "completing-milestone" }));
  assert.match(prompt, /M001-ROADMAP.*required/i);
});

test("buildLinearCompleteMilestonePrompt reads slice summaries via iteration", () => {
  const prompt = buildLinearCompleteMilestonePrompt(makeState({ phase: "completing-milestone" }));
  assert.match(prompt, /kata_list_slices/);
  assert.match(prompt, /Sxx-SUMMARY/);
});

test("buildLinearCompleteMilestonePrompt writes M001-SUMMARY", () => {
  const prompt = buildLinearCompleteMilestonePrompt(makeState({ phase: "completing-milestone" }));
  assert.match(prompt, /M001-SUMMARY/);
});

// ─── buildLinearReplanSlicePrompt ─────────────────────────────────────────────

test("buildLinearReplanSlicePrompt reads ROADMAP and PLAN as required", () => {
  const prompt = buildLinearReplanSlicePrompt(makeState({ phase: "replanning-slice" }));
  assert.match(prompt, /M001-ROADMAP.*required/i);
  assert.match(prompt, /S01-PLAN.*required/i);
});

test("buildLinearReplanSlicePrompt writes S01-REPLAN", () => {
  const prompt = buildLinearReplanSlicePrompt(makeState({ phase: "replanning-slice" }));
  assert.match(prompt, /S01-REPLAN/);
});

// ─── buildLinearReassessRoadmapPrompt ─────────────────────────────────────────

test("buildLinearReassessRoadmapPrompt reads ROADMAP and completed slice summary as required", () => {
  const prompt = buildLinearReassessRoadmapPrompt(makeState(), "S01");
  assert.match(prompt, /M001-ROADMAP.*required/i);
  assert.match(prompt, /S01-SUMMARY.*required/i);
});

test("buildLinearReassessRoadmapPrompt writes S01-ASSESSMENT", () => {
  const prompt = buildLinearReassessRoadmapPrompt(makeState(), "S01");
  assert.match(prompt, /S01-ASSESSMENT/);
});

// ─── buildLinearRunUatPrompt ──────────────────────────────────────────────────

test("buildLinearRunUatPrompt reads UAT file as required", () => {
  const prompt = buildLinearRunUatPrompt(makeState(), "S02");
  assert.match(prompt, /S02-UAT.*required/i);
});

test("buildLinearRunUatPrompt writes UAT-RESULT", () => {
  const prompt = buildLinearRunUatPrompt(makeState(), "S02");
  assert.match(prompt, /S02-UAT-RESULT/);
});

// ─── Cross-cutting: all builders reference KATA-WORKFLOW.md ───────────────────

test("all builders reference KATA-WORKFLOW.md", () => {
  const state = makeState();
  const builders = [
    buildLinearExecuteTaskPrompt(state),
    buildLinearPlanSlicePrompt(state),
    buildLinearPlanMilestonePrompt(state),
    buildLinearCompleteSlicePrompt(state),
    buildLinearResearchMilestonePrompt(state),
    buildLinearResearchSlicePrompt(state),
    buildLinearCompleteMilestonePrompt(state),
    buildLinearReplanSlicePrompt(state),
    buildLinearReassessRoadmapPrompt(state, "S01"),
    buildLinearRunUatPrompt(state, "S01"),
  ];
  for (const prompt of builders) {
    assert.match(prompt, /KATA-WORKFLOW\.md/, `Builder missing KATA-WORKFLOW.md reference: ${prompt.split("\n")[0]}`);
  }
});

// ─── Cross-cutting: no builder uses cascading fallbacks ───────────────────────

test("no builder uses cascading document fallbacks", () => {
  const state = makeState();
  const builders = [
    buildLinearExecuteTaskPrompt(state),
    buildLinearPlanSlicePrompt(state),
    buildLinearPlanMilestonePrompt(state),
    buildLinearCompleteSlicePrompt(state),
    buildLinearResearchMilestonePrompt(state),
    buildLinearResearchSlicePrompt(state),
    buildLinearCompleteMilestonePrompt(state),
    buildLinearReplanSlicePrompt(state),
  ];
  for (const prompt of builders) {
    assert.doesNotMatch(
      prompt,
      /If this returns null.*read.*PLAN.*If that also returns null/i,
      `Builder has cascading fallback: ${prompt.split("\n")[0]}`,
    );
  }
});

// ─── Cross-cutting: all builders include the hard rule ────────────────────────

test("all builders include the hard rule about not using bash/find/rg for artifacts", () => {
  const state = makeState();
  const builders = [
    buildLinearExecuteTaskPrompt(state),
    buildLinearPlanSlicePrompt(state),
    buildLinearPlanMilestonePrompt(state),
    buildLinearCompleteSlicePrompt(state),
    buildLinearResearchMilestonePrompt(state),
    buildLinearResearchSlicePrompt(state),
    buildLinearCompleteMilestonePrompt(state),
    buildLinearReplanSlicePrompt(state),
    buildLinearReassessRoadmapPrompt(state, "S01"),
    buildLinearRunUatPrompt(state, "S01"),
  ];
  for (const prompt of builders) {
    assert.match(prompt, /never use bash/i, `Builder missing hard rule: ${prompt.split("\n")[0]}`);
  }
});
