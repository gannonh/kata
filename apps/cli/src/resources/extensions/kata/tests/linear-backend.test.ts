import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LinearBackend, type LinearBackendConfig } from "../linear-backend.ts";
import type { KataBackend } from "../backend.ts";
import type { KataState } from "../types.ts";

const TEST_CONFIG: LinearBackendConfig = {
  apiKey: "test-key",
  projectId: "proj-123",
  teamId: "team-456",
  sliceLabelId: "label-789",
};

function makeBackend(): LinearBackend {
  return new LinearBackend("/tmp/test-project", TEST_CONFIG);
}

function initGitRepo(base: string): void {
  execSync("git init -b main", { cwd: base, stdio: "pipe" });
  execSync("git config user.email kata-test@example.com", { cwd: base, stdio: "pipe" });
  execSync("git config user.name Kata Test", { cwd: base, stdio: "pipe" });
  writeFileSync(join(base, "README.md"), "# test\n");
  execSync("git add README.md", { cwd: base, stdio: "pipe" });
  execSync('git commit -m "init"', { cwd: base, stdio: "pipe" });
}

function initBareRemote(base: string): string {
  const remote = mkdtempSync(join(tmpdir(), "kata-linear-remote-"));
  execSync("git init --bare", { cwd: remote, stdio: "pipe" });
  execSync(`git remote add origin ${remote}`, { cwd: base, stdio: "pipe" });
  execSync("git push -u origin main", { cwd: base, stdio: "pipe" });
  return remote;
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

describe("LinearBackend interface", () => {
  it("satisfies KataBackend interface", () => {
    const backend: KataBackend = new LinearBackend("/tmp/test-project", TEST_CONFIG);
    assert.ok(backend !== undefined);
  });

  it("sets basePath from constructor", () => {
    const backend = new LinearBackend("/tmp/test-project", TEST_CONFIG);
    assert.equal(backend.basePath, "/tmp/test-project");
  });
});

// ─── preparePrContext ───────────────────────────────────────────────────────

describe("LinearBackend.preparePrContext", () => {
  it("checks out and returns namespaced slice branch context", async () => {
    const base = mkdtempSync(join(tmpdir(), "kata-linear-prctx-"));
    initGitRepo(base);
    const remote = initBareRemote(base);

    try {
      const backend = new LinearBackend(base, TEST_CONFIG);
      backend.resolveSliceScope = async () => ({ issueId: "fake-slice-issue-id" });
      backend.readDocument = async (name: string) => {
        if (name === "S02-PLAN") return "# S02 Plan\n";
        if (name === "S02-SUMMARY") return "# S02 Summary\n";
        return null;
      };

      const ctx = await backend.preparePrContext("M001", "S02");
      assert.equal(ctx.branch, "kata/root/M001/S02");
      assert.equal(
        execSync("git branch --show-current", { cwd: base, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim(),
        "kata/root/M001/S02",
      );
      assert.deepEqual(Object.keys(ctx.documents).sort(), ["PLAN", "SUMMARY"]);
    } finally {
      rmSync(base, { recursive: true, force: true });
      rmSync(remote, { recursive: true, force: true });
    }
  });
});

// ─── buildPrompt dispatcher ─────────────────────────────────────────────────

describe("LinearBackend.buildPrompt dispatcher", () => {
  const b = makeBackend();
  const s = makeState;

  it("returns empty string for phase=complete", async () => {
    const p = await b.buildPrompt("complete", s({ phase: "complete" }));
    assert.equal(p, "");
  });

  it("returns empty string for phase=blocked", async () => {
    const p = await b.buildPrompt("blocked", s({ phase: "blocked" }));
    assert.equal(p, "");
  });

  it("returns execute prompt for phase=executing", async () => {
    const p = await b.buildPrompt("executing", s({ phase: "executing" }));
    assert.match(p, /Execute Task/);
  });

  it("returns execute prompt for phase=verifying", async () => {
    const p = await b.buildPrompt("verifying", s({ phase: "verifying" }));
    assert.match(p, /Execute Task/);
  });

  it("returns plan-slice prompt for phase=planning", async () => {
    const p = await b.buildPrompt("planning", s({ phase: "planning" }));
    assert.match(p, /Plan Slice/);
  });

  it("returns plan-milestone prompt for phase=pre-planning", async () => {
    const p = await b.buildPrompt("pre-planning", s({ phase: "pre-planning" }));
    assert.match(p, /Plan Milestone/);
  });

  it("returns complete-slice prompt for phase=summarizing", async () => {
    const p = await b.buildPrompt("summarizing", s({ phase: "summarizing" }));
    assert.match(p, /Complete Slice/);
  });

  it("returns complete-milestone for phase=completing-milestone", async () => {
    const p = await b.buildPrompt("completing-milestone", s({ phase: "completing-milestone" }));
    assert.match(p, /Complete Milestone/);
  });

  it("returns replan prompt for phase=replanning-slice", async () => {
    const p = await b.buildPrompt("replanning-slice", s({ phase: "replanning-slice" }));
    assert.match(p, /Replan Slice/);
  });

  it("returns empty string for unknown phase=paused", async () => {
    const p = await b.buildPrompt("paused", s({ phase: "paused" }));
    assert.equal(p, "");
  });
});

// ─── buildPrompt dispatch-time overrides ────────────────────────────────────

describe("LinearBackend.buildPrompt dispatch-time overrides", () => {
  const b = makeBackend();
  const s = makeState;

  it("dispatchResearch=milestone overrides phase", async () => {
    const p = await b.buildPrompt("pre-planning", s({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
    assert.match(p, /Research Milestone/);
  });

  it("dispatchResearch=slice overrides phase", async () => {
    const p = await b.buildPrompt("planning", s({ phase: "planning" }), { dispatchResearch: "slice" });
    assert.match(p, /Research Slice/);
  });

  it("reassessSliceId overrides phase", async () => {
    const p = await b.buildPrompt("executing", s(), { reassessSliceId: "S01" });
    assert.match(p, /Reassess Roadmap/);
  });

  it("reassess includes S01-SUMMARY", async () => {
    const p = await b.buildPrompt("executing", s(), { reassessSliceId: "S01" });
    assert.match(p, /S01-SUMMARY/);
  });

  it("reassess includes S01-ASSESSMENT", async () => {
    const p = await b.buildPrompt("executing", s(), { reassessSliceId: "S01" });
    assert.match(p, /S01-ASSESSMENT/);
  });

  it("uatSliceId overrides phase", async () => {
    const p = await b.buildPrompt("executing", s(), { uatSliceId: "S02" });
    assert.match(p, /Run UAT/);
  });

  it("uat includes S02-UAT", async () => {
    const p = await b.buildPrompt("executing", s(), { uatSliceId: "S02" });
    assert.match(p, /S02-UAT/);
  });

  it("override priority: uat > reassess > research", async () => {
    const p = await b.buildPrompt("executing", s(), { uatSliceId: "S01", reassessSliceId: "S01", dispatchResearch: "milestone" });
    assert.match(p, /Run UAT/);
  });
});

// ─── Execute task prompt ────────────────────────────────────────────────────

describe("LinearBackend execute task prompt", () => {
  const b = makeBackend();

  it("includes milestone ID", async () => {
    const p = await b.buildPrompt("executing", makeState());
    assert.match(p, /M001/);
  });

  it("includes slice ID", async () => {
    const p = await b.buildPrompt("executing", makeState());
    assert.match(p, /S01/);
  });

  it("includes task ID", async () => {
    const p = await b.buildPrompt("executing", makeState());
    assert.match(p, /T01/);
  });

  it("includes task title", async () => {
    const p = await b.buildPrompt("executing", makeState());
    assert.match(p, /Test Task/);
  });

  it("references kata_derive_state", async () => {
    const p = await b.buildPrompt("executing", makeState());
    assert.match(p, /kata_derive_state/);
  });

  it("references kata_update_issue_state", async () => {
    const p = await b.buildPrompt("executing", makeState());
    assert.match(p, /kata_update_issue_state/);
  });

  it("references KATA-WORKFLOW.md", async () => {
    const p = await b.buildPrompt("executing", makeState());
    assert.match(p, /KATA-WORKFLOW\.md/);
  });

  it("reads T01-PLAN", async () => {
    const p = await b.buildPrompt("executing", makeState());
    assert.match(p, /T01-PLAN/i);
  });

  it("reads S01-PLAN", async () => {
    const p = await b.buildPrompt("executing", makeState());
    assert.match(p, /S01-PLAN/);
  });

  it("includes carry-forward instruction", async () => {
    const p = await b.buildPrompt("executing", makeState());
    assert.match(p, /prior task/i);
  });

  it("includes continue/resume check", async () => {
    const p = await b.buildPrompt("executing", makeState());
    assert.match(p, /partial/i);
  });
});

// ─── Plan slice prompt ──────────────────────────────────────────────────────

describe("LinearBackend plan slice prompt", () => {
  const b = makeBackend();

  it("includes milestone ID", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    assert.match(p, /M001/);
  });

  it("includes slice ID", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    assert.match(p, /S02/);
  });

  it("includes slice title", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    assert.match(p, /Second Slice/);
  });

  it("reads M001-ROADMAP", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    assert.match(p, /M001-ROADMAP/i);
  });

  it("references kata_create_task", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    assert.match(p, /kata_create_task/);
  });

  it("references kata_update_issue_state", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    assert.match(p, /kata_update_issue_state/);
  });

  it("includes idempotency check", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    assert.match(p, /idempotency/i);
  });
});

// ─── Complete slice prompt ──────────────────────────────────────────────────

describe("LinearBackend complete slice prompt", () => {
  const b = makeBackend();

  it("includes milestone ID", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    assert.match(p, /M001/);
  });

  it("includes slice ID", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    assert.match(p, /S01/);
  });

  it("reads M001-ROADMAP", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    assert.match(p, /M001-ROADMAP/i);
  });

  it("reads S01-PLAN", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    assert.match(p, /S01-PLAN/i);
  });

  it("references kata_update_issue_state", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    assert.match(p, /kata_update_issue_state/);
  });

  it("references kata_list_tasks", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    assert.match(p, /kata_list_tasks/);
  });

  it("writes UAT", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    assert.match(p, /S01-UAT/);
  });
});

// ─── Research prompts ───────────────────────────────────────────────────────

describe("LinearBackend research prompts", () => {
  const b = makeBackend();

  it("research-milestone reads M001-CONTEXT", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
    assert.match(p, /M001-CONTEXT/i);
  });

  it("research-milestone writes M001-RESEARCH", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
    assert.match(p, /M001-RESEARCH/);
  });

  it("research-milestone reads PROJECT", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
    assert.match(p, /PROJECT/);
  });

  it("research-milestone reads REQUIREMENTS", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
    assert.match(p, /REQUIREMENTS/);
  });

  it("research-slice reads M001-ROADMAP", async () => {
    const p = await b.buildPrompt("planning", makeState({ phase: "planning" }), { dispatchResearch: "slice" });
    assert.match(p, /M001-ROADMAP/i);
  });

  it("research-slice writes S01-RESEARCH", async () => {
    const p = await b.buildPrompt("planning", makeState({ phase: "planning" }), { dispatchResearch: "slice" });
    assert.match(p, /S01-RESEARCH/);
  });
});

// ─── Other prompts ──────────────────────────────────────────────────────────

describe("LinearBackend other prompts", () => {
  const b = makeBackend();

  it("plan-milestone reads M001-CONTEXT", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }));
    assert.match(p, /M001-CONTEXT/i);
  });

  it("plan-milestone references kata_create_slice", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }));
    assert.match(p, /kata_create_slice/);
  });

  it("complete-milestone reads M001-ROADMAP", async () => {
    const p = await b.buildPrompt("completing-milestone", makeState({ phase: "completing-milestone" }));
    assert.match(p, /M001-ROADMAP/i);
  });

  it("complete-milestone writes M001-SUMMARY", async () => {
    const p = await b.buildPrompt("completing-milestone", makeState({ phase: "completing-milestone" }));
    assert.match(p, /M001-SUMMARY/);
  });

  it("replan reads ROADMAP", async () => {
    const p = await b.buildPrompt("replanning-slice", makeState({ phase: "replanning-slice" }));
    assert.match(p, /M001-ROADMAP/i);
  });

  it("replan reads S01-PLAN", async () => {
    const p = await b.buildPrompt("replanning-slice", makeState({ phase: "replanning-slice" }));
    assert.match(p, /S01-PLAN/i);
  });

  it("replan writes S01-REPLAN", async () => {
    const p = await b.buildPrompt("replanning-slice", makeState({ phase: "replanning-slice" }));
    assert.match(p, /S01-REPLAN/);
  });

  it("reassess reads ROADMAP", async () => {
    const p = await b.buildPrompt("executing", makeState(), { reassessSliceId: "S01" });
    assert.match(p, /M001-ROADMAP/i);
  });

  it("reassess writes S01-ASSESSMENT", async () => {
    const p = await b.buildPrompt("executing", makeState(), { reassessSliceId: "S01" });
    assert.match(p, /S01-ASSESSMENT/);
  });

  it("uat reads S02-UAT", async () => {
    const p = await b.buildPrompt("executing", makeState(), { uatSliceId: "S02" });
    assert.match(p, /S02-UAT/i);
  });

  it("uat writes S02-UAT-RESULT", async () => {
    const p = await b.buildPrompt("executing", makeState(), { uatSliceId: "S02" });
    assert.match(p, /S02-UAT-RESULT/);
  });
});

// ─── Cross-cutting ──────────────────────────────────────────────────────────

describe("LinearBackend cross-cutting", () => {
  it("all prompts reference KATA-WORKFLOW.md and include hard rule", async () => {
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
      assert.match(p, /KATA-WORKFLOW\.md/);
      assert.match(p, /never use bash/i);
    }
  });
});
