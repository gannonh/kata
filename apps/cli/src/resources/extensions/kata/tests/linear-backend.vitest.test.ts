import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LinearBackend, type LinearBackendConfig } from "../linear-backend.js";
import type { KataBackend } from "../backend.js";
import type { KataState } from "../types.js";

const TEST_CONFIG: LinearBackendConfig = {
  apiKey: "test-key",
  projectId: "proj-123",
  teamId: "team-456",
  labelSet: {
    milestone: { id: "label-788", name: "kata:milestone", color: "#7C3AED", isGroup: false },
    slice: { id: "label-789", name: "kata:slice", color: "#2563EB", isGroup: false },
    task: { id: "label-790", name: "kata:task", color: "#16A34A", isGroup: false },
  },
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
    activeMilestone: { id: "M001", title: "Test Milestone", linearIssueId: "milestone-linear-1" },
    activeSlice: { id: "S01", title: "Test Slice", linearIssueId: "slice-linear-1" },
    activeTask: { id: "T01", title: "Test Task", linearIssueId: "task-linear-1" },
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
    expect(backend !== undefined).toBeTruthy();
  });

  it("sets basePath from constructor", () => {
    const backend = new LinearBackend("/tmp/test-project", TEST_CONFIG);
    expect(backend.basePath).toBe("/tmp/test-project");
  });
});

describe("LinearBackend canonical worker operations", () => {
  it("getIssue returns issue detail with optional children/comments", async () => {
    const backend = makeBackend();
    let listIssueCommentsCalls = 0;

    (backend as any).client = {
      async getIssue(issueId: string) {
        return {
          id: issueId,
          identifier: "KAT-42",
          title: "[S01] Test Slice",
          state: { id: "state-started", name: "In Progress", type: "started", color: "#000", position: 0 },
          labels: [{ id: "label-789", name: "kata:slice", color: "#2563EB", isGroup: false }],
          children: {
            nodes: [{
              id: "task-linear-1",
              identifier: "KAT-43",
              title: "[T01] Task",
              state: { id: "state-started", name: "In Progress", type: "started", color: "#000", position: 1 },
              labels: [{ id: "label-790", name: "kata:task", color: "#16A34A", isGroup: false }],
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
            }],
          },
          project: { id: "proj-123", name: "Test Project" },
          projectMilestone: { id: "mile-1", name: "[M001] Milestone" },
          parent: null,
          description: "Slice description",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
        };
      },
      async listIssueComments(issueId: string) {
        listIssueCommentsCalls++;
        return [{
          id: "comment-1",
          body: "<!-- KATA:S01-SUMMARY -->\nsummary",
          createdAt: "2024-01-03T00:00:00.000Z",
          updatedAt: "2024-01-04T00:00:00.000Z",
          url: `https://linear.app/comment/${issueId}`,
        }];
      },
    };

    const detail = await backend.getIssue("slice-linear-1");
    expect(detail).toMatchObject({
      id: "slice-linear-1",
      identifier: "KAT-42",
      title: "[S01] Test Slice",
      state: "In Progress",
      labels: ["kata:slice"],
      description: "Slice description",
      children: [{
        id: "task-linear-1",
        identifier: "KAT-43",
        title: "[T01] Task",
      }],
      comments: [{
        id: "comment-1",
        issueId: "slice-linear-1",
        marker: "KATA:S01-SUMMARY",
      }],
    });

    const compact = await backend.getIssue("slice-linear-1", {
      includeChildren: false,
      includeComments: false,
    });
    expect(compact?.children).toEqual([]);
    expect(compact?.comments).toEqual([]);
    expect(listIssueCommentsCalls).toBe(1);
  });

  it("upsertComment updates marker-matched comments before creating new comments", async () => {
    const backend = makeBackend();
    const calls: string[] = [];

    (backend as any).client = {
      async listIssueComments() {
        calls.push("list");
        return [{
          id: "comment-1",
          body: "<!-- KATA:S01-SUMMARY -->\nold body",
          createdAt: "2024-01-03T00:00:00.000Z",
          updatedAt: "2024-01-04T00:00:00.000Z",
          url: "https://linear.app/comment/1",
        }];
      },
      async updateComment(id: string, body: string) {
        calls.push(`update:${id}`);
        return {
          id,
          body,
          createdAt: "2024-01-03T00:00:00.000Z",
          updatedAt: "2024-01-05T00:00:00.000Z",
          url: "https://linear.app/comment/1",
        };
      },
      async createComment() {
        calls.push("create");
        throw new Error("createComment should not be called when marker match exists");
      },
    };

    const comment = await backend.upsertComment({
      issueId: "slice-linear-1",
      marker: "KATA:S01-SUMMARY",
      body: "updated summary",
    });

    expect(calls).toEqual(["list", "update:comment-1"]);
    expect(comment).toMatchObject({
      id: "comment-1",
      issueId: "slice-linear-1",
      marker: "KATA:S01-SUMMARY",
      action: "updated",
    });
  });

  it("createFollowupIssue creates a relation when parent+relationType are provided", async () => {
    const backend = makeBackend();
    const calls: Array<Record<string, unknown>> = [];

    (backend as any).client = {
      async createIssue(input: Record<string, unknown>) {
        calls.push({ type: "createIssue", input });
        return {
          id: "followup-1",
          identifier: "KAT-99",
          title: String(input.title ?? ""),
          state: { id: "state-backlog", name: "Backlog", type: "backlog", color: "#777", position: 0 },
          labels: [],
          children: { nodes: [] },
          project: { id: "proj-123", name: "Test Project" },
          projectMilestone: null,
          parent: input.parentId ? { id: String(input.parentId), identifier: "KAT-42", title: "Parent" } : null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
        };
      },
      async createRelation(input: Record<string, unknown>) {
        calls.push({ type: "createRelation", input });
        return {
          id: "rel-1",
          type: "blocked_by",
          direction: "inbound",
          issue: { id: "parent-1", identifier: "KAT-42", title: "Parent" },
          relatedIssue: { id: "followup-1", identifier: "KAT-99", title: "Investigate regression" },
          otherIssue: { id: "parent-1", identifier: "KAT-42", title: "Parent" },
        };
      },
    };

    const issue = await backend.createFollowupIssue({
      parentIssueId: "parent-1",
      relationType: "blocked_by",
      title: "Investigate regression",
      description: "Detailed follow-up",
    });

    expect(issue).toMatchObject({
      id: "followup-1",
      identifier: "KAT-99",
      title: "Investigate regression",
      parentIdentifier: "KAT-42",
    });
    expect(calls).toEqual([
      {
        type: "createIssue",
        input: {
          teamId: "team-456",
          projectId: "proj-123",
          parentId: "parent-1",
          title: "Investigate regression",
          description: "Detailed follow-up",
        },
      },
      {
        type: "createRelation",
        input: {
          issueId: "followup-1",
          relatedIssueId: "parent-1",
          type: "blocked_by",
        },
      },
    ]);
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
      expect(ctx.branch).toBe("kata/root/M001/S02");
      expect(execSync("git branch --show-current", { cwd: base, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()).toBe("kata/root/M001/S02");
      expect(Object.keys(ctx.documents).sort()).toEqual(["PLAN", "SUMMARY"]);
    } finally {
      rmSync(base, { recursive: true, force: true });
      rmSync(remote, { recursive: true, force: true });
    }
  });
});

describe("LinearBackend milestone-scoped slice helpers", () => {
  it("resolveSliceScope scopes the slice lookup by active milestone UUID", async () => {
    const backend = makeBackend();
    const listIssuesCalls: Array<Record<string, unknown>> = [];

    backend.deriveState = async () => makeState({ phase: "planning" });
    (backend as any).client = {
      async listIssues(filter: Record<string, unknown>) {
        listIssuesCalls.push(filter);
        return [{
          id: "slice-linear-1",
          identifier: "KAT-1",
          title: "[S01] Test Slice",
          state: { id: "state-started", name: "In Progress", type: "started", color: "#000", position: 0 },
          labels: [],
          children: { nodes: [] },
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }];
      },
      async listMilestones() {
        return [];
      },
    };

    const scope = await backend.resolveSliceScope("M001", "S01");

    expect(scope).toEqual({ issueId: "slice-linear-1" });
    expect(listIssuesCalls[0]).toEqual({
      projectId: "proj-123",
      labelIds: ["label-789"],
      projectMilestoneId: "milestone-linear-1",
    });
  });

  it("isSlicePlanned scopes the slice lookup by milestone UUID", async () => {
    const backend = makeBackend();
    const listIssuesCalls: Array<Record<string, unknown>> = [];

    backend.deriveState = async () => makeState({ phase: "planning" });
    (backend as any).client = {
      async listIssues(filter: Record<string, unknown>) {
        listIssuesCalls.push(filter);
        return [{
          id: "slice-linear-1",
          identifier: "KAT-1",
          title: "[S01] Test Slice",
          state: { id: "state-started", name: "In Progress", type: "started", color: "#000", position: 0 },
          labels: [],
          children: { nodes: [{ id: "task-linear-1", identifier: "KAT-2", title: "[T01] Test Task", state: { id: "state-started", name: "In Progress", type: "started", color: "#000", position: 0 } }] },
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }];
      },
      async listMilestones() {
        return [];
      },
    };

    const planned = await backend.isSlicePlanned("M001", "S01");

    expect(planned).toBe(true);
    expect(listIssuesCalls[0]).toEqual({
      projectId: "proj-123",
      labelIds: ["label-789"],
      projectMilestoneId: "milestone-linear-1",
    });
  });
});

// ─── buildPrompt dispatcher ─────────────────────────────────────────────────

describe("LinearBackend.buildPrompt dispatcher", () => {
  const b = makeBackend();
  const s = makeState;

  it("returns empty string for phase=complete", async () => {
    const p = await b.buildPrompt("complete", s({ phase: "complete" }));
    expect(p).toBe("");
  });

  it("returns empty string for phase=blocked", async () => {
    const p = await b.buildPrompt("blocked", s({ phase: "blocked" }));
    expect(p).toBe("");
  });

  it("returns execute prompt for phase=executing", async () => {
    const p = await b.buildPrompt("executing", s({ phase: "executing" }));
    expect(p).toMatch(/Execute Task/);
  });

  it("returns execute prompt for phase=verifying", async () => {
    const p = await b.buildPrompt("verifying", s({ phase: "verifying" }));
    expect(p).toMatch(/Execute Task/);
  });

  it("returns plan-slice prompt for phase=planning", async () => {
    const p = await b.buildPrompt("planning", s({ phase: "planning" }));
    expect(p).toMatch(/Plan Slice/);
  });

  it("returns plan-milestone prompt for phase=pre-planning", async () => {
    const p = await b.buildPrompt("pre-planning", s({ phase: "pre-planning" }));
    expect(p).toMatch(/Plan Milestone/);
  });

  it("returns complete-slice prompt for phase=summarizing", async () => {
    const p = await b.buildPrompt("summarizing", s({ phase: "summarizing" }));
    expect(p).toMatch(/Complete Slice/);
  });

  it("returns complete-milestone for phase=completing-milestone", async () => {
    const p = await b.buildPrompt("completing-milestone", s({ phase: "completing-milestone" }));
    expect(p).toMatch(/Complete Milestone/);
  });

  it("returns replan prompt for phase=replanning-slice", async () => {
    const p = await b.buildPrompt("replanning-slice", s({ phase: "replanning-slice" }));
    expect(p).toMatch(/Replan Slice/);
  });

  it("returns empty string for unknown phase=paused", async () => {
    const p = await b.buildPrompt("paused", s({ phase: "paused" }));
    expect(p).toBe("");
  });
});

// ─── buildPrompt dispatch-time overrides ────────────────────────────────────

describe("LinearBackend.buildPrompt dispatch-time overrides", () => {
  const b = makeBackend();
  const s = makeState;

  it("dispatchResearch=milestone overrides phase", async () => {
    const p = await b.buildPrompt("pre-planning", s({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
    expect(p).toMatch(/Research Milestone/);
  });

  it("dispatchResearch=slice overrides phase", async () => {
    const p = await b.buildPrompt("planning", s({ phase: "planning" }), { dispatchResearch: "slice" });
    expect(p).toMatch(/Research Slice/);
  });

  it("reassessSliceId overrides phase", async () => {
    const p = await b.buildPrompt("executing", s(), { reassessSliceId: "S01" });
    expect(p).toMatch(/Reassess Roadmap/);
  });

  it("reassess includes S01-SUMMARY", async () => {
    const p = await b.buildPrompt("executing", s(), { reassessSliceId: "S01" });
    expect(p).toMatch(/S01-SUMMARY/);
  });

  it("reassess includes S01-ASSESSMENT", async () => {
    const p = await b.buildPrompt("executing", s(), { reassessSliceId: "S01" });
    expect(p).toMatch(/S01-ASSESSMENT/);
  });

  it("uatSliceId overrides phase", async () => {
    const p = await b.buildPrompt("executing", s(), { uatSliceId: "S02" });
    expect(p).toMatch(/Run UAT/);
  });

  it("uat includes S02-UAT", async () => {
    const p = await b.buildPrompt("executing", s(), { uatSliceId: "S02" });
    expect(p).toMatch(/S02-UAT/);
  });

  it("override priority: uat > reassess > research", async () => {
    const p = await b.buildPrompt("executing", s(), { uatSliceId: "S01", reassessSliceId: "S01", dispatchResearch: "milestone" });
    expect(p).toMatch(/Run UAT/);
  });
});

describe("LinearBackend milestone-scoped planning prompts", () => {
  const b = makeBackend();

  it("plan milestone prompt includes the active milestone UUID in kata_list_slices", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning", activeSlice: null, activeTask: null }));
    expect(p).toMatch(/kata_list_slices\(\{ projectId, teamId, milestoneId: "milestone-linear-1" \}\)/);
  });

  it("planning prompts explicitly forbid linear_list_issues for slice enumeration", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning", activeSlice: null, activeTask: null }));
    expect(p).toMatch(/do NOT use linear_list_issues/i);
  });

  it("complete milestone prompt includes the active milestone UUID in kata_list_slices", async () => {
    const p = await b.buildPrompt("completing-milestone", makeState({ phase: "completing-milestone", activeSlice: null, activeTask: null }));
    expect(p).toMatch(/kata_list_slices\(\{ projectId, teamId, milestoneId: "milestone-linear-1" \}\)/);
  });

  it("reassess roadmap prompt includes the active milestone UUID in kata_list_slices", async () => {
    const p = await b.buildPrompt("executing", makeState(), { reassessSliceId: "S01" });
    expect(p).toMatch(/kata_list_slices\(\{ projectId, teamId, milestoneId: "milestone-linear-1" \}\)/);
  });
});

// ─── Execute task prompt ────────────────────────────────────────────────────

describe("LinearBackend execute task prompt", () => {
  const b = makeBackend();

  it("includes milestone ID", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/M001/);
  });

  it("includes slice ID", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/S01/);
  });

  it("includes task ID", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/T01/);
  });

  it("includes task title", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/Test Task/);
  });

  it("references kata_derive_state", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/kata_derive_state/);
  });

  it("references kata_update_issue_state", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/kata_update_issue_state/);
  });

  it("references KATA-WORKFLOW.md", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/KATA-WORKFLOW\.md/);
  });

  it("uses task issue description as primary task plan source", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/linear_get_issue\("<task-uuid>"\)/i);
  });

  it("keeps T01-PLAN fallback for backward compatibility", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/T01-PLAN/i);
  });

  it("reads S01-PLAN", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/S01-PLAN/);
  });

  it("includes carry-forward instruction", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/prior task/i);
  });

  it("includes continue/resume check", async () => {
    const p = await b.buildPrompt("executing", makeState());
    expect(p).toMatch(/partial/i);
  });
});

// ─── Plan slice prompt ──────────────────────────────────────────────────────

describe("LinearBackend plan slice prompt", () => {
  const b = makeBackend();

  it("includes milestone ID", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    expect(p).toMatch(/M001/);
  });

  it("includes slice ID", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    expect(p).toMatch(/S02/);
  });

  it("includes slice title", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    expect(p).toMatch(/Second Slice/);
  });

  it("reads M001-ROADMAP", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    expect(p).toMatch(/M001-ROADMAP/i);
  });

  it("references kata_create_task", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    expect(p).toMatch(/kata_create_task/);
  });

  it("writes slice plan via linear_update_issue description", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    expect(p).toMatch(/linear_update_issue\(\{ id: "<slice-issue-uuid>", description: content \}\)/);
  });

  it("references kata_update_issue_state", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    expect(p).toMatch(/kata_update_issue_state/);
  });

  it("includes idempotency check", async () => {
    const state = makeState({ phase: "planning", activeSlice: { id: "S02", title: "Second Slice" } });
    const p = await b.buildPrompt("planning", state);
    expect(p).toMatch(/idempotency/i);
  });
});

// ─── Complete slice prompt ──────────────────────────────────────────────────

describe("LinearBackend complete slice prompt", () => {
  const b = makeBackend();

  it("includes milestone ID", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(p).toMatch(/M001/);
  });

  it("includes slice ID", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(p).toMatch(/S01/);
  });

  it("reads M001-ROADMAP", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(p).toMatch(/M001-ROADMAP/i);
  });

  it("reads S01-PLAN", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(p).toMatch(/S01-PLAN/i);
  });

  it("does not advance slice directly to done", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(p).not.toMatch(/kata_update_issue_state\(\{ issueId: "<slice-uuid>", phase: "done" \}\)/);
    expect(p).toMatch(/Do NOT advance the slice to done directly/i);
  });

  it("references kata_list_tasks", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(p).toMatch(/kata_list_tasks/);
  });

  it("writes UAT", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(p).toMatch(/S01-UAT/);
  });

  it("writes slice summary via linear_add_comment", async () => {
    const p = await b.buildPrompt("summarizing", makeState({ phase: "summarizing" }));
    expect(p).toMatch(/linear_add_comment\(\{ issueId: "<slice-issue-uuid>", body: content \}\)/);
    expect(p).toMatch(/<!-- KATA:S01-SUMMARY -->/);
  });
});

// ─── Research prompts ───────────────────────────────────────────────────────

describe("LinearBackend research prompts", () => {
  const b = makeBackend();

  it("research-milestone reads M001-CONTEXT", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
    expect(p).toMatch(/M001-CONTEXT/i);
  });

  it("research-milestone writes M001-RESEARCH", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
    expect(p).toMatch(/M001-RESEARCH/);
  });

  it("research-milestone reads PROJECT", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
    expect(p).toMatch(/PROJECT/);
  });

  it("research-milestone reads REQUIREMENTS", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }), { dispatchResearch: "milestone" });
    expect(p).toMatch(/REQUIREMENTS/);
  });

  it("research-slice reads M001-ROADMAP", async () => {
    const p = await b.buildPrompt("planning", makeState({ phase: "planning" }), { dispatchResearch: "slice" });
    expect(p).toMatch(/M001-ROADMAP/i);
  });

  it("research-slice writes S01-RESEARCH", async () => {
    const p = await b.buildPrompt("planning", makeState({ phase: "planning" }), { dispatchResearch: "slice" });
    expect(p).toMatch(/S01-RESEARCH/);
  });

  it("research-slice uses milestone-scoped kata_list_slices for dependency lookup", async () => {
    const p = await b.buildPrompt("planning", makeState({ phase: "planning" }), { dispatchResearch: "slice" });
    expect(p).toMatch(/kata_list_slices\(\{ projectId, teamId, milestoneId: "milestone-linear-1" \}\)/);
  });
});

// ─── Other prompts ──────────────────────────────────────────────────────────

describe("LinearBackend other prompts", () => {
  const b = makeBackend();

  it("plan-milestone reads M001-CONTEXT", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }));
    expect(p).toMatch(/M001-CONTEXT/i);
  });

  it("plan-milestone references kata_create_slice", async () => {
    const p = await b.buildPrompt("pre-planning", makeState({ phase: "pre-planning" }));
    expect(p).toMatch(/kata_create_slice/);
  });

  it("complete-milestone reads M001-ROADMAP", async () => {
    const p = await b.buildPrompt("completing-milestone", makeState({ phase: "completing-milestone" }));
    expect(p).toMatch(/M001-ROADMAP/i);
  });

  it("complete-milestone writes M001-SUMMARY", async () => {
    const p = await b.buildPrompt("completing-milestone", makeState({ phase: "completing-milestone" }));
    expect(p).toMatch(/M001-SUMMARY/);
  });

  it("replan reads ROADMAP", async () => {
    const p = await b.buildPrompt("replanning-slice", makeState({ phase: "replanning-slice" }));
    expect(p).toMatch(/M001-ROADMAP/i);
  });

  it("replan reads S01-PLAN", async () => {
    const p = await b.buildPrompt("replanning-slice", makeState({ phase: "replanning-slice" }));
    expect(p).toMatch(/S01-PLAN/i);
  });

  it("replan writes S01-REPLAN", async () => {
    const p = await b.buildPrompt("replanning-slice", makeState({ phase: "replanning-slice" }));
    expect(p).toMatch(/S01-REPLAN/);
  });

  it("reassess reads ROADMAP", async () => {
    const p = await b.buildPrompt("executing", makeState(), { reassessSliceId: "S01" });
    expect(p).toMatch(/M001-ROADMAP/i);
  });

  it("reassess writes S01-ASSESSMENT", async () => {
    const p = await b.buildPrompt("executing", makeState(), { reassessSliceId: "S01" });
    expect(p).toMatch(/S01-ASSESSMENT/);
  });

  it("plan-slice uses milestone-scoped kata_list_slices for dependency lookup", async () => {
    const p = await b.buildPrompt("planning", makeState({ phase: "planning" }));
    expect(p).toMatch(/kata_list_slices\(\{ projectId, teamId, milestoneId: "milestone-linear-1" \}\)/);
  });

  it("uat reads S02-UAT", async () => {
    const p = await b.buildPrompt("executing", makeState(), { uatSliceId: "S02" });
    expect(p).toMatch(/S02-UAT/i);
  });

  it("uat writes S02-UAT-RESULT", async () => {
    const p = await b.buildPrompt("executing", makeState(), { uatSliceId: "S02" });
    expect(p).toMatch(/S02-UAT-RESULT/);
  });

  it("uat uses milestone-scoped kata_list_slices for slice lookup", async () => {
    const p = await b.buildPrompt("executing", makeState(), { uatSliceId: "S02" });
    expect(p).toMatch(/kata_list_slices\(\{ projectId, teamId, milestoneId: "milestone-linear-1" \}\)/);
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
      expect(p).toMatch(/KATA-WORKFLOW\.md/);
      expect(p).toMatch(/never use bash/i);
    }
  });
});
