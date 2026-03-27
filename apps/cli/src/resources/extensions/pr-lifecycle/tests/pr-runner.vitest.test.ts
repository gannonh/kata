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

import { describe, it, expect } from "vitest";
import { runCreatePr } from "../pr-runner.js";
import {
  createMockRuntime,
  PLAN_CONTENT,
  SUMMARY_CONTENT,
} from "./pr-runner-fixtures.js";

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

  it("returns artifact-error when PLAN document is missing", async () => {
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
      expect(result.error).toContain("Missing required Linear artifact");
    }
  });
});
