/**
 * pr-runner.vitest.test.ts — Orchestration tests for `runCreatePr()`.
 *
 * Uses injectable PrRunnerRuntime (from T01) with mock command transcripts
 * to exercise deterministic PR creation paths:
 * - Happy path: branch resolves, body written, PR created, URL returned
 * - Push-failed: branch missing on remote + push failure
 * - Parse-failed: non-kata branch with omitted IDs
 * - Explicit-ID bypass: milestoneId + sliceId skip branch parsing
 * - Body-integrity: repair-on-mismatch via gh pr edit
 */

import { describe, it, expect, vi } from "vitest";
import { runCreatePr } from "../pr-runner.js";
import {
  createMockRuntime,
  PLAN_CONTENT,
} from "./pr-runner-fixtures.js";

// Mock only the dynamically-imported LinearClient. The real linear-crosslink.js
// exports are pure functions that work fine without a real API.
vi.mock("../../linear/linear-client.js", () => ({
  LinearClient: class MockLinearClient {
    constructor(public apiKey: string) {}
    async graphql(query: string, _variables?: Record<string, unknown>) {
      // resolveSliceLinearIdentifier: query for issues
      if (query.includes("issues(")) {
        return {
          issues: {
            nodes: [{ id: "mock-issue-id", identifier: "KAT-999", title: "[S01] Test Slice" }],
          },
        };
      }
      // slice plan source of truth: issue description
      if (query.includes("issue(id:") && query.includes("description")) {
        return {
          issue: {
            description: PLAN_CONTENT,
          },
        };
      }
      // postPrLinkComment: mutation for creating comment
      if (query.includes("commentCreate")) {
        return { commentCreate: { success: true } };
      }
      return {};
    }
    async listDocuments(opts?: { projectId?: string; issueId?: string; title?: string; first?: number }) {
      if (opts?.title?.endsWith("-SUMMARY")) {
        return [{ title: opts.title, content: "# Summary\n\n**Done.**", updatedAt: "2026-01-01T00:00:00Z" }];
      }
      if (opts?.issueId) {
        // Issue-scoped query returns optional summary only; plan comes from issue description.
        return [
          { title: "S01-SUMMARY", content: "# Summary\n\n**Done.**", updatedAt: "2026-01-01T00:00:00Z" },
        ];
      }
      return [];
    }
  },
}));

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("runCreatePr — happy path", () => {
  it("creates a PR and returns the URL when all steps succeed", async () => {
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        // ls-remote: branch exists on remote
        { match: "git ls-remote --heads origin", response: "abc123\trefs/heads/kata/apps-cli/M001/S01\n" },
        // gh pr create: succeeds
        { match: "gh pr create", response: "https://github.com/test/repo/pull/42\n" },
        // gh pr view body: matches expected (no repair needed)
        { match: "gh pr view --json body", response: "" },
        // gh pr view url
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/42\n" },
      ],
    });

    const result = await runCreatePr({
      title: "Test PR",
      baseBranch: "main",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe("https://github.com/test/repo/pull/42");
    }

    // Verify body file was written and cleaned up
    expect(rt.writeLog).toHaveLength(1);
    expect(rt.writeLog[0].path).toBe("/tmp/mock-pr-body.md");
    expect(rt.removeLog).toContain("/tmp/mock-pr-body.md");

    // Verify gh pr create was called with correct title prefixing
    const createCmd = rt.execLog.find((e) => e.command.includes("gh pr create"));
    expect(createCmd).toBeDefined();
    expect(createCmd!.command).toContain("[kata/apps-cli/M001/S01]");
    expect(createCmd!.command).toContain("Test PR");
  });

  it("does not prefix title when branch name is already included", async () => {
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc123\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/43\n" },
      ],
    });

    const result = await runCreatePr({
      title: "[kata/apps-cli/M001/S01] Already prefixed",
      baseBranch: "main",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);
    // Title should NOT be double-prefixed
    const createCmd = rt.execLog.find((e) => e.command.includes("gh pr create"));
    expect(createCmd).toBeDefined();
    // Should contain the title as-is, not "[kata/...] [kata/...] Already prefixed"
    const titleMatches = createCmd!.command.match(/\[kata\/apps-cli\/M001\/S01\]/g);
    expect(titleMatches).toHaveLength(1);
  });

  it("pushes branch when not on remote", async () => {
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        // ls-remote: branch NOT on remote (empty output)
        { match: "git ls-remote --heads origin", response: "" },
        // push succeeds
        { match: "git push -u origin", response: "Branch pushed\n" },
        // gh pr create succeeds
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/44\n" },
      ],
    });

    const result = await runCreatePr({
      title: "Push test",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);

    // Verify push was attempted
    const pushCmd = rt.execLog.find((e) => e.command.includes("git push -u origin"));
    expect(pushCmd).toBeDefined();
  });
});

// ─── Push-failed ──────────────────────────────────────────────────────────────

describe("runCreatePr — push-failed", () => {
  it("returns push-failed when branch is missing on remote and push fails", async () => {
    const pushError = new Error("fatal: remote rejected") as Error & { stderr: string };
    pushError.stderr = "fatal: remote rejected (permission denied)";

    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        // ls-remote: branch NOT on remote
        { match: "git ls-remote --heads origin", response: "" },
        // push fails
        { match: "git push -u origin", response: pushError },
      ],
    });

    const result = await runCreatePr({
      title: "Push failure test",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("push-failed");
      expect(result.error).toContain("push failed");
      expect(result.error).toContain("remote rejected");
      expect(result.hint).toBeTruthy();
    }

    // Verify temp file cleanup still happened
    expect(rt.removeLog).toContain("/tmp/mock-pr-body.md");
  });

  it("returns push-failed with error message when stderr is absent", async () => {
    const pushError = new Error("git push command failed");

    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "" },
        { match: "git push -u origin", response: pushError },
      ],
    });

    const result = await runCreatePr({
      title: "Push failure no stderr",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("push-failed");
      expect(result.error).toContain("push failed");
    }
  });
});

// ─── Parse-failed ─────────────────────────────────────────────────────────────

describe("runCreatePr — branch-parse-failed", () => {
  it("returns branch-parse-failed when branch is not a kata format and IDs are omitted", async () => {
    const rt = createMockRuntime({
      branch: "feature/random-work",
      parsedBranch: null,
    });

    const result = await runCreatePr({
      title: "Non-kata branch",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("branch-parse-failed");
      expect(result.error).toContain("feature/random-work");
      expect(result.error).toContain("does not match supported Kata slice branch formats");
      expect(result.hint).toContain("milestoneId and sliceId explicitly");
    }
  });

  it("returns branch-parse-failed when getCurrentBranch returns null", async () => {
    const rt = createMockRuntime({
      branch: null,
    });

    const result = await runCreatePr({
      title: "No branch",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("branch-parse-failed");
      expect(result.error).toContain("Could not determine current git branch");
    }
  });
});

// ─── Explicit-ID bypass ───────────────────────────────────────────────────────

describe("runCreatePr — explicit milestoneId + sliceId", () => {
  it("skips branch parsing when milestoneId and sliceId are provided explicitly", async () => {
    const rt = createMockRuntime({
      // Non-kata branch — would fail parsing normally
      branch: "feature/unrelated",
      parsedBranch: null,
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/feature/unrelated\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/99\n" },
      ],
    });

    const result = await runCreatePr({
      title: "Explicit ID test",
      milestoneId: "M005",
      sliceId: "S03",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    // Should succeed because explicit IDs bypass branch parsing
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe("https://github.com/test/repo/pull/99");
    }

    // Verify PR was actually created (not short-circuited)
    const createCmd = rt.execLog.find((e) => e.command.includes("gh pr create"));
    expect(createCmd).toBeDefined();
  });

  it("uses explicit IDs even when branch is a valid kata format", async () => {
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/100\n" },
      ],
    });

    const result = await runCreatePr({
      title: "Override IDs test",
      milestoneId: "M099",
      sliceId: "S99",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    // Should succeed — explicit IDs take priority
    expect(result.ok).toBe(true);
  });
});

// ─── Body-integrity ───────────────────────────────────────────────────────────

describe("runCreatePr — body-integrity", () => {
  it("triggers body repair via gh pr edit when body does not match", async () => {
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        // Body view returns mangled content (different from expected)
        { match: "gh pr view --json body", response: "Mangled body content that does not match\n" },
        // PR number for repair
        { match: "gh pr view --json number", response: "42\n" },
        // Edit command succeeds
        { match: "gh pr edit", response: "" },
        // URL retrieval
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/42\n" },
      ],
    });

    const result = await runCreatePr({
      title: "Body repair test",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);

    // Verify the repair sequence: view body → get number → edit
    const editCmd = rt.execLog.find((e) => e.command.includes("gh pr edit"));
    expect(editCmd).toBeDefined();
    expect(editCmd!.command).toContain("42");
    expect(editCmd!.command).toContain("--body-file");
  });

  it("does not trigger body repair when body matches expected", async () => {
    // We need the actual body content that composePRBody generates
    // The mock runtime captures what was written to the temp file
    let capturedBody = "";

    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        // Body view returns the exact content (matched dynamically below)
        {
          match: "gh pr view --json body",
          // Will be set after we capture the body
          response: "",
        },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/50\n" },
      ],
    });

    // Override exec to capture body from writeFile and return it in view
    const originalExec = rt.exec.bind(rt);
    rt.exec = (command: string, options: { cwd: string; env?: Record<string, string | undefined> }) => {
      if (command.includes("gh pr view --json body")) {
        // Return exactly what was written to the body file
        return capturedBody;
      }
      return originalExec(command, options);
    };

    // Override writeFile to capture the body
    const originalWrite = rt.writeFile.bind(rt);
    rt.writeFile = (path: string, content: string) => {
      if (path.endsWith(".md")) {
        capturedBody = content;
      }
      originalWrite(path, content);
    };

    const result = await runCreatePr({
      title: "No repair needed",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);

    // Verify NO gh pr edit was called (body matched)
    const editCmd = rt.execLog.find((e) => e.command.includes("gh pr edit"));
    expect(editCmd).toBeUndefined();
  });
});

// ─── Create-failed ────────────────────────────────────────────────────────────

describe("runCreatePr — create-failed", () => {
  it("returns create-failed when gh pr create throws", async () => {
    const ghError = new Error("gh pr create failed") as Error & { stderr: string };
    ghError.stderr = "GraphQL: Resource not accessible by integration";

    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: ghError },
      ],
    });

    const result = await runCreatePr({
      title: "Create failure",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("create-failed");
      expect(result.error).toContain("Resource not accessible");
    }

    // Verify temp file cleanup still happened
    expect(rt.removeLog).toContain("/tmp/mock-pr-body.md");
  });
});

// ─── Pre-flight failures ──────────────────────────────────────────────────────

describe("runCreatePr — pre-flight failures", () => {
  it("returns title-missing when title is empty", async () => {
    const rt = createMockRuntime();
    const result = await runCreatePr({
      title: "",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("title-missing");
    }
  });

  it("returns gh-missing when gh CLI is not installed", async () => {
    const rt = createMockRuntime();
    rt.isGhInstalled = () => false;

    const result = await runCreatePr({
      title: "Test",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("gh-missing");
    }
  });

  it("returns gh-unauth when gh CLI is not authenticated", async () => {
    const rt = createMockRuntime();
    rt.isGhAuthenticated = () => false;

    const result = await runCreatePr({
      title: "Test",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("gh-unauth");
    }
  });

  it("returns artifact-error when slice issue description is unavailable", async () => {
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
    });

    const result = await runCreatePr({
      title: "Test",
      cwd: "/tmp/test-repo",
      // No linearDocuments provided
      _runtime: rt,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("artifact-error");
      expect(result.error).toContain("No Linear configuration provided and no issue body passed");
    }
  });
});

// ─── Linear config integration paths ──────────────────────────────────────────

describe("runCreatePr — linearConfig paths", () => {
  const linearConfig = {
    prPrefs: { linear_link: true },
    workflowMode: "linear",
    projectId: "proj-123",
    sliceLabelId: "label-456",
    apiKey: "test-api-key",
  };

  it("resolves Linear metadata and loads documents when linearConfig is provided without pre-fetched docs", async () => {
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/60\n" },
      ],
    });

    const result = await runCreatePr({
      title: "Linear config test",
      cwd: "/tmp/test-repo",
      linearConfig,
      // No linearDocuments — forces loadLinearPrDocuments to run
      _runtime: rt,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.linearComment).toBe("added");
    }
  });

  it("uses pre-fetched linearDocuments and skips document loading", async () => {
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/61\n" },
      ],
    });

    const result = await runCreatePr({
      title: "Pre-fetched docs",
      cwd: "/tmp/test-repo",
      linearConfig,
      linearDocuments: { PLAN: PLAN_CONTENT, SUMMARY: "# Summary\n\n**Done.**" },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.linearComment).toBe("added");
    }
  });

  it("skips cross-linking when linear_link is false", async () => {
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/62\n" },
      ],
    });

    const result = await runCreatePr({
      title: "No cross-link",
      cwd: "/tmp/test-repo",
      linearConfig: { ...linearConfig, prPrefs: { linear_link: false } },
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.linearComment).toBe("skipped");
    }
  });

  it("loads documents via loadLinearPrDocuments when none are pre-provided (issue-scoped path)", async () => {
    // No linearDocuments at all → loadLinearPrDocuments runs, issue-scoped query returns docs
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/64\n" },
      ],
    });

    const result = await runCreatePr({
      title: "No pre-fetched docs",
      cwd: "/tmp/test-repo",
      linearConfig: {
        prPrefs: { linear_link: false },
        workflowMode: "linear",
        projectId: "proj-123",
        apiKey: "test-key",
      },
      // No linearDocuments — forces loadLinearPrDocuments to run fully
      _runtime: rt,
    });

    expect(result.ok).toBe(true);
  });

  it("skips linear cross-linking when workflowMode is not linear", async () => {
    // Validates graceful flow when linear mode is disabled (workflowMode: "file")
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/63\n" },
      ],
    });

    const result = await runCreatePr({
      title: "Fallthrough test",
      cwd: "/tmp/test-repo",
      linearConfig: { ...linearConfig, workflowMode: "file" },
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.linearComment).toBe("skipped");
    }
  });
});

// ─── PR body composition edge cases (via runCreatePr) ─────────────────────────

describe("runCreatePr — body composition branches", () => {
  it("handles plan with no title and no tasks (fallback branches)", async () => {
    const minimalPlan = "## Must-Haves\n\n- Something works\n";
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/80\n" },
      ],
    });

    const result = await runCreatePr({
      title: "Minimal plan test",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: minimalPlan },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);
    // Body should contain the fallback title and "see slice plan" for tasks
    const body = rt.writeLog[0]?.content ?? "";
    expect(body).toContain("## What Changed");
    expect(body).toContain("## Must-Haves");
  });

  it("handles plan with no must-haves (empty list branch)", async () => {
    const noMustHavesPlan = "# S01: Title\n\n**Goal:** Testing.\n\n## Tasks\n\n- [ ] **T01: Do it** `est:10m`\n";
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/81\n" },
      ],
    });

    const result = await runCreatePr({
      title: "No must-haves test",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: noMustHavesPlan },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);
    const body = rt.writeLog[0]?.content ?? "";
    expect(body).toContain("## Must-Haves");
    expect(body).toContain("See slice plan");
  });

  it("includes Linear references section when linearConfig is active", async () => {
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/82\n" },
      ],
    });

    const result = await runCreatePr({
      title: "Linear refs test",
      cwd: "/tmp/test-repo",
      linearConfig: {
        prPrefs: { linear_link: true },
        workflowMode: "linear",
        projectId: "proj-123",
        apiKey: "test-key",
      },
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);
    const body = rt.writeLog[0]?.content ?? "";
    expect(body).toContain("Closes KAT-999");
  });
});

// ─── Compose body error + URL retrieval fallback ──────────────────────────────

describe("runCreatePr — error edge cases", () => {
  it("returns artifact-error when composePRBody throws", async () => {
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
      ],
    });

    const result = await runCreatePr({
      title: "Compose failure",
      cwd: "/tmp/test-repo",
      // Provide a PLAN that's empty/invalid — parsePlan will return no title
      // but composePRBody should still work. Instead, omit PLAN completely to trigger artifact-error.
      linearDocuments: {},
      _runtime: rt,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("artifact-error");
    }
  });

  it("returns fallback URL when gh pr view --json url fails", async () => {
    const urlError = new Error("gh not found");
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: "abc\trefs/heads/kata/apps-cli/M001/S01\n" },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: urlError },
      ],
    });

    const result = await runCreatePr({
      title: "URL failure test",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain("could not retrieve URL");
    }
  });

  it("proceeds when ls-remote itself fails", async () => {
    const lsRemoteError = new Error("network error");
    const rt = createMockRuntime({
      branch: "kata/apps-cli/M001/S01",
      commands: [
        { match: "git ls-remote --heads origin", response: lsRemoteError },
        { match: "gh pr create", response: "" },
        { match: "gh pr view --json body", response: "" },
        { match: "gh pr view --json url", response: "https://github.com/test/repo/pull/70\n" },
      ],
    });

    const result = await runCreatePr({
      title: "ls-remote failure",
      cwd: "/tmp/test-repo",
      linearDocuments: { PLAN: PLAN_CONTENT },
      _runtime: rt,
    });

    // Should still succeed — ls-remote failure is caught and gh pr create proceeds
    expect(result.ok).toBe(true);
  });
});
