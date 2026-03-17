import { LinearBackend, type LinearBackendConfig } from "../linear-backend.ts";
import type { KataBackend } from "../backend.ts";
import type { KataState } from "../types.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertMatch(text: string, pattern: RegExp, message: string): void {
  if (pattern.test(text)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — pattern ${pattern} not found in output`);
  }
}

const TEST_CONFIG: LinearBackendConfig = {
  apiKey: "test-key",
  projectId: "proj-123",
  teamId: "team-456",
  sliceLabelId: "label-789",
};

function makeBackend(): LinearBackend {
  return new LinearBackend("/tmp/test-project", TEST_CONFIG);
}

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

// ─── Interface ──────────────────────────────────────────────────────────────

console.log("LinearBackend interface");
{
  const backend: KataBackend = new LinearBackend("/tmp/test-project", TEST_CONFIG);
  assert(backend !== undefined, "satisfies KataBackend interface");
  assert(backend.basePath === "/tmp/test-project", "sets basePath from constructor");
}

// ─── buildPrompt dispatcher ─────────────────────────────────────────────────

console.log("LinearBackend.buildPrompt dispatcher");
{
  const b = makeBackend();
  const s = makeState;

  let p = await b.buildPrompt("complete", s({ phase: "complete" }));
  assert(p === "", "returns empty string for phase=complete");

  p = await b.buildPrompt("blocked", s({ phase: "blocked" }));
  assert(p === "", "returns empty string for phase=blocked");

  p = await b.buildPrompt("executing", s({ phase: "executing" }));
  assertMatch(p, /Execute Task/, "returns execute prompt for phase=executing");

  p = await b.buildPrompt("verifying", s({ phase: "verifying" }));
  assertMatch(p, /Execute Task/, "returns execute prompt for phase=verifying");

  p = await b.buildPrompt("planning", s({ phase: "planning" }));
  assertMatch(p, /Plan Slice/, "returns plan-slice prompt for phase=planning");

  p = await b.buildPrompt("pre-planning", s({ phase: "pre-planning" }));
  assertMatch(p, /Plan Milestone/, "returns plan-milestone prompt for phase=pre-planning");

  p = await b.buildPrompt("summarizing", s({ phase: "summarizing" }));
  assertMatch(p, /Complete Slice/, "returns complete-slice prompt for phase=summarizing");

  p = await b.buildPrompt("completing-milestone", s({ phase: "completing-milestone" }));
  assertMatch(p, /Complete Milestone/, "returns complete-milestone for phase=completing-milestone");

  p = await b.buildPrompt("replanning-slice", s({ phase: "replanning-slice" }));
  assertMatch(p, /Replan Slice/, "returns replan prompt for phase=replanning-slice");

  p = await b.buildPrompt("paused", s({ phase: "paused" }));
  assert(p === "", "returns empty string for unknown phase=paused");
}

// ─── buildPrompt dispatch-time overrides ────────────────────────────────────

console.log("LinearBackend.buildPrompt dispatch-time overrides");
{
  const b = makeBackend();
  const s = makeState;

  let p = await b.buildPrompt("pre-planning", s({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
  assertMatch(p, /Research Milestone/, "dispatchResearch=milestone overrides phase");

  p = await b.buildPrompt("planning", s({ phase: "planning" }), { dispatchResearch: "slice" });
  assertMatch(p, /Research Slice/, "dispatchResearch=slice overrides phase");

  p = await b.buildPrompt("executing", s(), { reassessSliceId: "S01" });
  assertMatch(p, /Reassess Roadmap/, "reassessSliceId overrides phase");
  assertMatch(p, /S01-SUMMARY/, "reassess includes S01-SUMMARY");
  assertMatch(p, /S01-ASSESSMENT/, "reassess includes S01-ASSESSMENT");

  p = await b.buildPrompt("executing", s(), { uatSliceId: "S02" });
  assertMatch(p, /Run UAT/, "uatSliceId overrides phase");
  assertMatch(p, /S02-UAT/, "uat includes S02-UAT");

  p = await b.buildPrompt("executing", s(), { uatSliceId: "S01", reassessSliceId: "S01", dispatchResearch: "milestone" });
  assertMatch(p, /Run UAT/, "override priority: uat > reassess > research");
}

// ─── Execute task prompt ────────────────────────────────────────────────────

console.log("LinearBackend execute task prompt");
{
  const b = makeBackend();
  const p = await b.buildPrompt("executing", makeState());
  assertMatch(p, /M001/, "includes milestone ID");
  assertMatch(p, /S01/, "includes slice ID");
  assertMatch(p, /T01/, "includes task ID");
  assertMatch(p, /Test Task/, "includes task title");
  assertMatch(p, /kata_derive_state/, "references kata_derive_state");
  assertMatch(p, /kata_update_issue_state/, "references kata_update_issue_state");
  assertMatch(p, /KATA-WORKFLOW\.md/, "references KATA-WORKFLOW.md");
  assertMatch(p, /T01-PLAN/i, "reads T01-PLAN");
  assertMatch(p, /S01-PLAN/, "reads S01-PLAN");
  assertMatch(p, /prior task/i, "includes carry-forward instruction");
  assertMatch(p, /partial/i, "includes continue/resume check");
}

// ─── Plan slice prompt ──────────────────────────────────────────────────────

console.log("LinearBackend plan slice prompt");
{
  const b = makeBackend();
  const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
  const p = await b.buildPrompt("planning", state);
  assertMatch(p, /M001/, "includes milestone ID");
  assertMatch(p, /S02/, "includes slice ID");
  assertMatch(p, /Second Slice/, "includes slice title");
  assertMatch(p, /M001-ROADMAP/i, "reads M001-ROADMAP");
  assertMatch(p, /kata_create_task/, "references kata_create_task");
  assertMatch(p, /kata_update_issue_state/, "references kata_update_issue_state");
  assertMatch(p, /idempotency/i, "includes idempotency check");
}

// ─── Complete slice prompt ──────────────────────────────────────────────────

console.log("LinearBackend complete slice prompt");
{
  const b = makeBackend();
  const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
  assertMatch(p, /M001/, "includes milestone ID");
  assertMatch(p, /S01/, "includes slice ID");
  assertMatch(p, /M001-ROADMAP/i, "reads M001-ROADMAP");
  assertMatch(p, /S01-PLAN/i, "reads S01-PLAN");
  assertMatch(p, /kata_update_issue_state/, "references kata_update_issue_state");
  assertMatch(p, /kata_list_tasks/, "references kata_list_tasks");
  assertMatch(p, /S01-UAT/, "writes UAT");
}

// ─── Research prompts ───────────────────────────────────────────────────────

console.log("LinearBackend research prompts");
{
  const b = makeBackend();
  let p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
  assertMatch(p, /M001-CONTEXT/i, "research-milestone reads M001-CONTEXT");
  assertMatch(p, /M001-RESEARCH/, "research-milestone writes M001-RESEARCH");
  assertMatch(p, /PROJECT/, "research-milestone reads PROJECT");
  assertMatch(p, /REQUIREMENTS/, "research-milestone reads REQUIREMENTS");

  p = await b.buildPrompt("planning", makeState({ phase: "planning" }), { dispatchResearch: "slice" });
  assertMatch(p, /M001-ROADMAP/i, "research-slice reads M001-ROADMAP");
  assertMatch(p, /S01-RESEARCH/, "research-slice writes S01-RESEARCH");
}

// ─── Other prompts ──────────────────────────────────────────────────────────

console.log("LinearBackend other prompts");
{
  const b = makeBackend();

  let p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }));
  assertMatch(p, /M001-CONTEXT/i, "plan-milestone reads M001-CONTEXT");
  assertMatch(p, /kata_create_slice/, "plan-milestone references kata_create_slice");

  p = await b.buildPrompt("completing-milestone", makeState({ phase: "completing-milestone" }));
  assertMatch(p, /M001-ROADMAP/i, "complete-milestone reads M001-ROADMAP");
  assertMatch(p, /M001-SUMMARY/, "complete-milestone writes M001-SUMMARY");

  p = await b.buildPrompt("replanning-slice", makeState({ phase: "replanning-slice" }));
  assertMatch(p, /M001-ROADMAP/i, "replan reads ROADMAP");
  assertMatch(p, /S01-PLAN/i, "replan reads S01-PLAN");
  assertMatch(p, /S01-REPLAN/, "replan writes S01-REPLAN");

  p = await b.buildPrompt("executing", makeState(), { reassessSliceId: "S01" });
  assertMatch(p, /M001-ROADMAP/i, "reassess reads ROADMAP");
  assertMatch(p, /S01-ASSESSMENT/, "reassess writes S01-ASSESSMENT");

  p = await b.buildPrompt("executing", makeState(), { uatSliceId: "S02" });
  assertMatch(p, /S02-UAT/i, "uat reads S02-UAT");
  assertMatch(p, /S02-UAT-RESULT/, "uat writes S02-UAT-RESULT");
}

// ─── Cross-cutting ──────────────────────────────────────────────────────────

console.log("LinearBackend cross-cutting");
{
  const b = makeBackend();
  const s = makeState();
  const prompts = await Promise.all([
    b.buildPrompt("executing", s),
    b.buildPrompt("planning", s),
    b.buildPrompt("pre-planning", s),
    b.buildPrompt("summarizing", s),
    b.buildPrompt("pre-planning", s, { dispatchResearch: "milestone" }),
    b.buildPrompt("planning", s, { dispatchResearch: "slice" }),
    b.buildPrompt("completing-milestone", s),
    b.buildPrompt("replanning-slice", s),
    b.buildPrompt("executing", s, { reassessSliceId: "S01" }),
    b.buildPrompt("executing", s, { uatSliceId: "S01" }),
  ]);
  for (const p of prompts) {
    assertMatch(p, /KATA-WORKFLOW\.md/, "references KATA-WORKFLOW.md");
    assertMatch(p, /never use bash/i, "includes hard rule");
  }
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
