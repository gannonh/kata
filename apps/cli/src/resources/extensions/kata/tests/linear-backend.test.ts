import { describe, it, expect } from "vitest";
import { LinearBackend, type LinearBackendConfig } from "../linear-backend.js";
import type { KataBackend } from "../backend.js";
import type { KataState } from "../types.js";

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

describe("LinearBackend", () => {
  it("satisfies the KataBackend interface", () => {
    const backend: KataBackend = new LinearBackend("/tmp/test-project", TEST_CONFIG);
    expect(backend).toBeDefined();
  });

  it("sets basePath from constructor", () => {
    const backend = new LinearBackend("/tmp/test-project", TEST_CONFIG);
    expect(backend.basePath).toBe("/tmp/test-project");
  });
});

// ─── buildPrompt dispatcher ─────────────────────────────────────────────────

describe("LinearBackend.buildPrompt dispatcher", () => {
  it("returns empty string for phase=complete", async () => {
    const prompt = await makeBackend().buildPrompt("complete", makeState({ phase: "complete" }));
    expect(prompt).toBe("");
  });

  it("returns empty string for phase=blocked", async () => {
    const prompt = await makeBackend().buildPrompt("blocked", makeState({ phase: "blocked" }));
    expect(prompt).toBe("");
  });

  it("returns execute prompt for phase=executing", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState({ phase: "executing" }));
    expect(prompt).toMatch(/Execute Task/);
  });

  it("returns execute prompt for phase=verifying", async () => {
    const prompt = await makeBackend().buildPrompt("verifying", makeState({ phase: "verifying" }));
    expect(prompt).toMatch(/Execute Task/);
  });

  it("returns plan-slice prompt for phase=planning", async () => {
    const prompt = await makeBackend().buildPrompt("planning", makeState({ phase: "planning" }));
    expect(prompt).toMatch(/Plan Slice/);
  });

  it("returns plan-milestone prompt for phase=pre-planning", async () => {
    const prompt = await makeBackend().buildPrompt("pre-planning", makeState({ phase: "pre-planning" }));
    expect(prompt).toMatch(/Plan Milestone/);
  });

  it("returns complete-slice prompt for phase=summarizing", async () => {
    const prompt = await makeBackend().buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(prompt).toMatch(/Complete Slice/);
  });

  it("returns complete-milestone prompt for phase=completing-milestone", async () => {
    const prompt = await makeBackend().buildPrompt("completing-milestone", makeState({ phase: "completing-milestone" }));
    expect(prompt).toMatch(/Complete Milestone/);
  });

  it("returns replan prompt for phase=replanning-slice", async () => {
    const prompt = await makeBackend().buildPrompt("replanning-slice", makeState({ phase: "replanning-slice" }));
    expect(prompt).toMatch(/Replan Slice/);
  });

  it("returns empty string for unknown phases", async () => {
    expect(await makeBackend().buildPrompt("paused", makeState({ phase: "paused" }))).toBe("");
    expect(await makeBackend().buildPrompt("some-future-phase", makeState({ phase: "some-future-phase" as any }))).toBe("");
  });
});

// ─── buildPrompt dispatch-time overrides ──────────────────────────────────────

describe("LinearBackend.buildPrompt dispatch-time overrides", () => {
  it("dispatchResearch=milestone overrides phase", async () => {
    const prompt = await makeBackend().buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), {
      dispatchResearch: "milestone",
    });
    expect(prompt).toMatch(/Research Milestone/);
  });

  it("dispatchResearch=slice overrides phase", async () => {
    const prompt = await makeBackend().buildPrompt("planning", makeState({ phase: "planning" }), {
      dispatchResearch: "slice",
    });
    expect(prompt).toMatch(/Research Slice/);
  });

  it("reassessSliceId overrides phase", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState(), { reassessSliceId: "S01" });
    expect(prompt).toMatch(/Reassess Roadmap/);
    expect(prompt).toMatch(/S01-SUMMARY/);
    expect(prompt).toMatch(/S01-ASSESSMENT/);
  });

  it("uatSliceId overrides phase", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState(), { uatSliceId: "S02" });
    expect(prompt).toMatch(/Run UAT/);
    expect(prompt).toMatch(/S02-UAT/);
  });

  it("override priority: uat > reassess > research", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState(), {
      uatSliceId: "S01",
      reassessSliceId: "S01",
      dispatchResearch: "milestone",
    });
    expect(prompt).toMatch(/Run UAT/);
  });
});

// ─── Execute task prompt ────────────────────────────────────────────────────

describe("LinearBackend execute task prompt", () => {
  it("includes milestone, slice, task IDs", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState());
    expect(prompt).toMatch(/M001/);
    expect(prompt).toMatch(/S01/);
    expect(prompt).toMatch(/T01/);
    expect(prompt).toMatch(/Test Task/);
  });

  it("references kata_derive_state", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState());
    expect(prompt).toMatch(/kata_derive_state/);
  });

  it("references kata_update_issue_state", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState());
    expect(prompt).toMatch(/kata_update_issue_state/);
  });

  it("references KATA-WORKFLOW.md", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState());
    expect(prompt).toMatch(/KATA-WORKFLOW\.md/);
  });

  it("reads T01-PLAN as required", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState());
    expect(prompt).toMatch(/T01-PLAN.*required/i);
  });

  it("reads S01-PLAN as optional", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState());
    expect(prompt).toMatch(/S01-PLAN/);
  });

  it("includes carry-forward instruction", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState());
    expect(prompt).toMatch(/prior task/i);
    expect(prompt).toMatch(/Txx-SUMMARY/i);
  });

  it("includes continue/resume check", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState());
    expect(prompt).toMatch(/partial/i);
  });

  it("has no cascading fallback", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState());
    expect(prompt).not.toMatch(/If this returns null.*read.*PLAN.*If that also returns null/i);
  });
});

// ─── Plan slice prompt ──────────────────────────────────────────────────────

describe("LinearBackend plan slice prompt", () => {
  it("includes milestone and slice IDs", async () => {
    const state = makeState({
      phase: "planning",
      activeMilestone: { id: "M001", title: "Milestone One" },
      activeSlice: { id: "S02", title: "Second Slice" },
    });
    const prompt = await makeBackend().buildPrompt("planning", state);
    expect(prompt).toMatch(/M001/);
    expect(prompt).toMatch(/S02/);
    expect(prompt).toMatch(/Second Slice/);
  });

  it("reads M001-ROADMAP as required", async () => {
    const prompt = await makeBackend().buildPrompt("planning", makeState({ phase: "planning" }));
    expect(prompt).toMatch(/M001-ROADMAP.*required/i);
  });

  it("references kata_create_task", async () => {
    const prompt = await makeBackend().buildPrompt("planning", makeState({ phase: "planning" }));
    expect(prompt).toMatch(/kata_create_task/);
  });

  it("references kata_update_issue_state with executing phase", async () => {
    const prompt = await makeBackend().buildPrompt("planning", makeState({ phase: "planning" }));
    expect(prompt).toMatch(/kata_update_issue_state/);
    expect(prompt).toMatch(/executing/);
  });

  it("includes dependency summary instruction", async () => {
    const prompt = await makeBackend().buildPrompt("planning", makeState({ phase: "planning" }));
    expect(prompt).toMatch(/depends:\[\]/i);
    expect(prompt).toMatch(/Sxx-SUMMARY/i);
  });

  it("includes idempotency check", async () => {
    const prompt = await makeBackend().buildPrompt("planning", makeState({ phase: "planning" }));
    expect(prompt).toMatch(/idempotency/i);
  });
});

// ─── Plan milestone prompt ──────────────────────────────────────────────────

describe("LinearBackend plan milestone prompt", () => {
  it("includes milestone ID and title", async () => {
    const prompt = await makeBackend().buildPrompt("pre-planning", makeState({ phase: "pre-planning" }));
    expect(prompt).toMatch(/M001/);
    expect(prompt).toMatch(/Test Milestone/);
  });

  it("reads M001-CONTEXT as required", async () => {
    const prompt = await makeBackend().buildPrompt("pre-planning", makeState({ phase: "pre-planning" }));
    expect(prompt).toMatch(/M001-CONTEXT.*required/i);
  });

  it("references kata_create_slice", async () => {
    const prompt = await makeBackend().buildPrompt("pre-planning", makeState({ phase: "pre-planning" }));
    expect(prompt).toMatch(/kata_create_slice/);
  });

  it("includes idempotency check", async () => {
    const prompt = await makeBackend().buildPrompt("pre-planning", makeState({ phase: "pre-planning" }));
    expect(prompt).toMatch(/idempotency/i);
  });
});

// ─── Complete slice prompt ──────────────────────────────────────────────────

describe("LinearBackend complete slice prompt", () => {
  it("includes milestone and slice IDs", async () => {
    const prompt = await makeBackend().buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(prompt).toMatch(/M001/);
    expect(prompt).toMatch(/S01/);
  });

  it("reads M001-ROADMAP as required", async () => {
    const prompt = await makeBackend().buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(prompt).toMatch(/M001-ROADMAP.*required/i);
  });

  it("reads S01-PLAN as required", async () => {
    const prompt = await makeBackend().buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(prompt).toMatch(/S01-PLAN.*required/i);
  });

  it("references kata_update_issue_state with done phase", async () => {
    const prompt = await makeBackend().buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(prompt).toMatch(/kata_update_issue_state/);
    expect(prompt).toMatch(/done/);
  });

  it("references kata_list_tasks for summaries", async () => {
    const prompt = await makeBackend().buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(prompt).toMatch(/kata_list_tasks/);
  });

  it("writes UAT", async () => {
    const prompt = await makeBackend().buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(prompt).toMatch(/S01-UAT/);
  });
});

// ─── Research milestone prompt ──────────────────────────────────────────────

describe("LinearBackend research milestone prompt", () => {
  it("reads M001-CONTEXT as required", async () => {
    const prompt = await makeBackend().buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), {
      dispatchResearch: "milestone",
    });
    expect(prompt).toMatch(/M001-CONTEXT.*required/i);
  });

  it("writes M001-RESEARCH", async () => {
    const prompt = await makeBackend().buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), {
      dispatchResearch: "milestone",
    });
    expect(prompt).toMatch(/M001-RESEARCH/);
  });

  it("reads optional PROJECT, REQUIREMENTS, DECISIONS", async () => {
    const prompt = await makeBackend().buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), {
      dispatchResearch: "milestone",
    });
    expect(prompt).toMatch(/PROJECT/);
    expect(prompt).toMatch(/REQUIREMENTS/);
    expect(prompt).toMatch(/DECISIONS/);
  });
});

// ─── Research slice prompt ──────────────────────────────────────────────────

describe("LinearBackend research slice prompt", () => {
  it("reads M001-ROADMAP as required", async () => {
    const prompt = await makeBackend().buildPrompt("planning", makeState({ phase: "planning" }), {
      dispatchResearch: "slice",
    });
    expect(prompt).toMatch(/M001-ROADMAP.*required/i);
  });

  it("writes S01-RESEARCH", async () => {
    const prompt = await makeBackend().buildPrompt("planning", makeState({ phase: "planning" }), {
      dispatchResearch: "slice",
    });
    expect(prompt).toMatch(/S01-RESEARCH/);
  });

  it("includes dependency summary instruction", async () => {
    const prompt = await makeBackend().buildPrompt("planning", makeState({ phase: "planning" }), {
      dispatchResearch: "slice",
    });
    expect(prompt).toMatch(/depends:\[\]/i);
  });
});

// ─── Complete milestone prompt ──────────────────────────────────────────────

describe("LinearBackend complete milestone prompt", () => {
  it("reads M001-ROADMAP as required", async () => {
    const prompt = await makeBackend().buildPrompt("completing-milestone", makeState({ phase: "completing-milestone" }));
    expect(prompt).toMatch(/M001-ROADMAP.*required/i);
  });

  it("reads slice summaries via iteration", async () => {
    const prompt = await makeBackend().buildPrompt("completing-milestone", makeState({ phase: "completing-milestone" }));
    expect(prompt).toMatch(/kata_list_slices/);
    expect(prompt).toMatch(/Sxx-SUMMARY/);
  });

  it("writes M001-SUMMARY", async () => {
    const prompt = await makeBackend().buildPrompt("completing-milestone", makeState({ phase: "completing-milestone" }));
    expect(prompt).toMatch(/M001-SUMMARY/);
  });
});

// ─── Replan slice prompt ────────────────────────────────────────────────────

describe("LinearBackend replan slice prompt", () => {
  it("reads ROADMAP and PLAN as required", async () => {
    const prompt = await makeBackend().buildPrompt("replanning-slice", makeState({ phase: "replanning-slice" }));
    expect(prompt).toMatch(/M001-ROADMAP.*required/i);
    expect(prompt).toMatch(/S01-PLAN.*required/i);
  });

  it("writes S01-REPLAN", async () => {
    const prompt = await makeBackend().buildPrompt("replanning-slice", makeState({ phase: "replanning-slice" }));
    expect(prompt).toMatch(/S01-REPLAN/);
  });
});

// ─── Reassess roadmap prompt ────────────────────────────────────────────────

describe("LinearBackend reassess roadmap prompt", () => {
  it("reads ROADMAP and completed slice summary as required", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState(), { reassessSliceId: "S01" });
    expect(prompt).toMatch(/M001-ROADMAP.*required/i);
    expect(prompt).toMatch(/S01-SUMMARY.*required/i);
  });

  it("writes S01-ASSESSMENT", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState(), { reassessSliceId: "S01" });
    expect(prompt).toMatch(/S01-ASSESSMENT/);
  });
});

// ─── Run UAT prompt ─────────────────────────────────────────────────────────

describe("LinearBackend run UAT prompt", () => {
  it("reads UAT file as required", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState(), { uatSliceId: "S02" });
    expect(prompt).toMatch(/S02-UAT.*required/i);
  });

  it("writes UAT-RESULT", async () => {
    const prompt = await makeBackend().buildPrompt("executing", makeState(), { uatSliceId: "S02" });
    expect(prompt).toMatch(/S02-UAT-RESULT/);
  });
});

// ─── Cross-cutting ──────────────────────────────────────────────────────────

describe("LinearBackend cross-cutting prompt properties", () => {
  it("all builders reference KATA-WORKFLOW.md", async () => {
    const backend = makeBackend();
    const state = makeState();
    const prompts = await Promise.all([
      backend.buildPrompt("executing", state),
      backend.buildPrompt("planning", state),
      backend.buildPrompt("pre-planning", state),
      backend.buildPrompt("summarizing", state),
      backend.buildPrompt("pre-planning", state, { dispatchResearch: "milestone" }),
      backend.buildPrompt("planning", state, { dispatchResearch: "slice" }),
      backend.buildPrompt("completing-milestone", state),
      backend.buildPrompt("replanning-slice", state),
      backend.buildPrompt("executing", state, { reassessSliceId: "S01" }),
      backend.buildPrompt("executing", state, { uatSliceId: "S01" }),
    ]);
    for (const prompt of prompts) {
      expect(prompt).toMatch(/KATA-WORKFLOW\.md/);
    }
  });

  it("no builder uses cascading document fallbacks", async () => {
    const backend = makeBackend();
    const state = makeState();
    const prompts = await Promise.all([
      backend.buildPrompt("executing", state),
      backend.buildPrompt("planning", state),
      backend.buildPrompt("pre-planning", state),
      backend.buildPrompt("summarizing", state),
      backend.buildPrompt("pre-planning", state, { dispatchResearch: "milestone" }),
      backend.buildPrompt("planning", state, { dispatchResearch: "slice" }),
      backend.buildPrompt("completing-milestone", state),
      backend.buildPrompt("replanning-slice", state),
    ]);
    for (const prompt of prompts) {
      expect(prompt).not.toMatch(/If this returns null.*read.*PLAN.*If that also returns null/i);
    }
  });

  it("all builders include the hard rule about not using bash/find/rg for artifacts", async () => {
    const backend = makeBackend();
    const state = makeState();
    const prompts = await Promise.all([
      backend.buildPrompt("executing", state),
      backend.buildPrompt("planning", state),
      backend.buildPrompt("pre-planning", state),
      backend.buildPrompt("summarizing", state),
      backend.buildPrompt("pre-planning", state, { dispatchResearch: "milestone" }),
      backend.buildPrompt("planning", state, { dispatchResearch: "slice" }),
      backend.buildPrompt("completing-milestone", state),
      backend.buildPrompt("replanning-slice", state),
      backend.buildPrompt("executing", state, { reassessSliceId: "S01" }),
      backend.buildPrompt("executing", state, { uatSliceId: "S01" }),
    ]);
    for (const prompt of prompts) {
      expect(prompt).toMatch(/never use bash/i);
    }
  });
});
