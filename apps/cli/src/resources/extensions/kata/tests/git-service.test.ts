import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  inferCommitType,
  buildTaskCommitMessage,
  runGit,
  getCurrentBranch,
  getMainBranch,
  autoCommitCurrentBranch,
  commit,
  mergeSliceToMain,
  MergeConflictError,
  RUNTIME_EXCLUSION_PATHS,
  VALID_BRANCH_NAME,
  type GitPreferences,
  type CommitOptions,
  type TaskCommitContext,
} from "../git-service.js";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createFile(base: string, relativePath: string, content = "x"): void {
  const full = join(base, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

/**
 * Create a temp repo with an initial commit so HEAD exists.
 * All git I/O tests that need a working repo use this.
 */
function initRepo(branch = "main"): string {
  const dir = mkdtempSync(join(tmpdir(), "kata-git-service-test-"));
  execFileSync("git", ["init", "-b", branch], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Pi Test"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "pi@example.com"], { cwd: dir });
  createFile(dir, ".gitkeep", "");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

/**
 * Create an empty repo (no commits) — used by runGit tests that need
 * commands to fail (e.g. `git log --oneline` on a repo with no history).
 */
function initEmptyRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "kata-git-service-test-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Pi Test"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "pi@example.com"], { cwd: dir });
  return dir;
}

/** Run a raw git command for test setup/verification (bypasses git-service.js). */
function gitRaw(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// ─── inferCommitType ──────────────────────────────────────────────────────────

describe("inferCommitType", () => {
  it("generic feature title → feat", () => {
    assert.equal(inferCommitType("Implement user authentication"), "feat");
  });

  it("add-style title → feat", () => {
    assert.equal(inferCommitType("Add dashboard page"), "feat");
  });

  it("title with 'fix' → fix", () => {
    assert.equal(inferCommitType("Fix login redirect bug"), "fix");
  });

  it("title with 'bug' → fix", () => {
    assert.equal(inferCommitType("Bug in session handling"), "fix");
  });

  it("title with 'hotfix' → fix", () => {
    assert.equal(inferCommitType("Hotfix for production crash"), "fix");
  });

  it("title with 'patch' → fix", () => {
    assert.equal(inferCommitType("Patch memory leak"), "fix");
  });

  it("title with 'refactor' → refactor", () => {
    assert.equal(inferCommitType("Refactor state management"), "refactor");
  });

  it("title with 'restructure' → refactor", () => {
    assert.equal(inferCommitType("Restructure project layout"), "refactor");
  });

  it("title with 'reorganize' → refactor", () => {
    assert.equal(inferCommitType("Reorganize module imports"), "refactor");
  });

  it("title with 'documentation' → docs", () => {
    assert.equal(inferCommitType("Update API documentation"), "docs");
  });

  it("title with 'doc' → docs", () => {
    assert.equal(inferCommitType("Add doc for setup guide"), "docs");
  });

  it("title with 'tests' → test", () => {
    assert.equal(inferCommitType("Add unit tests for auth"), "test");
  });

  it("title with 'testing' → test", () => {
    assert.equal(inferCommitType("Testing infrastructure setup"), "test");
  });

  it("title with 'chore' → chore", () => {
    assert.equal(inferCommitType("Chore: update dependencies"), "chore");
  });

  it("title with 'cleanup' → chore", () => {
    assert.equal(inferCommitType("Cleanup unused imports"), "chore");
  });

  it("title with 'clean up' → chore", () => {
    assert.equal(inferCommitType("Clean up stale branches"), "chore");
  });

  it("title with 'archive' → chore", () => {
    assert.equal(inferCommitType("Archive old milestones"), "chore");
  });

  it("title with 'remove' → chore", () => {
    assert.equal(inferCommitType("Remove deprecated endpoints"), "chore");
  });

  it("title with 'delete' → chore", () => {
    assert.equal(inferCommitType("Delete temp files"), "chore");
  });

  it("title with 'optimize' → perf", () => {
    assert.equal(inferCommitType("Optimize database queries"), "perf");
  });

  it("title with 'performance' → perf", () => {
    assert.equal(inferCommitType("Improve rendering performance"), "perf");
  });

  it("mixed keywords → first match wins (fix before refactor)", () => {
    assert.equal(inferCommitType("Fix and refactor the login module"), "fix");
  });

  it("mixed keywords → first match wins (refactor before test)", () => {
    assert.equal(inferCommitType("Refactor test utilities"), "refactor");
  });

  it("unrecognized title → feat", () => {
    assert.equal(inferCommitType("Build the new pipeline"), "feat");
  });

  it("empty title → feat", () => {
    assert.equal(inferCommitType(""), "feat");
  });

  it("'testify' does not match 'test' — word boundary prevents partial match", () => {
    assert.equal(inferCommitType("Testify integration"), "feat");
  });

  it("'documentary' does not match 'doc' — word boundary prevents partial match", () => {
    assert.equal(inferCommitType("Documentary style UI"), "feat");
  });

  it("'prefix' does not match 'fix' — word boundary prevents partial match", () => {
    assert.equal(inferCommitType("Add prefix to all IDs"), "feat");
  });
});

// ─── inferCommitType with oneLiner ───────────────────────────────────────────

describe("inferCommitType with oneLiner", () => {
  it("one-liner with 'fixed' overrides generic title → fix", () => {
    assert.equal(
      inferCommitType("implement dashboard", "Fixed rendering bug in sidebar"),
      "fix",
    );
  });

  it("one-liner with 'performance' and 'caching' → perf", () => {
    assert.equal(
      inferCommitType("add search", "Optimized query performance with caching"),
      "perf",
    );
  });
});

// ─── buildTaskCommitMessage ───────────────────────────────────────────────────

describe("buildTaskCommitMessage", () => {
  it("builds full message with one-liner and key files", () => {
    const msg = buildTaskCommitMessage({
      taskId: "S01/T02",
      taskTitle: "implement user authentication",
      oneLiner: "Added JWT-based auth with refresh token rotation",
      keyFiles: ["src/auth.ts", "src/middleware/jwt.ts"],
    });
    assert.ok(msg.startsWith("feat(S01/T02):"), "message starts with type(scope)");
    assert.ok(msg.includes("JWT-based auth"), "message includes one-liner content");
    assert.ok(msg.includes("- src/auth.ts"), "message body includes first key file");
    assert.ok(msg.includes("- src/middleware/jwt.ts"), "message body includes second key file");
  });

  it("infers commit type from title when no one-liner provided", () => {
    const msg = buildTaskCommitMessage({
      taskId: "S02/T01",
      taskTitle: "fix login redirect bug",
    });
    assert.ok(msg.startsWith("fix(S02/T01):"), "infers fix type from title");
    assert.ok(msg.includes("fix login redirect bug"), "uses task title when no one-liner");
    assert.ok(!msg.includes("\n"), "no body section when no key files");
  });

  it("infers test type from title", () => {
    const msg = buildTaskCommitMessage({
      taskId: "S01/T03",
      taskTitle: "add tests",
      oneLiner: "Unit tests for auth module with coverage",
    });
    assert.ok(msg.startsWith("test(S01/T03):"), "infers test type from title");
  });
});

// ─── RUNTIME_EXCLUSION_PATHS ──────────────────────────────────────────────────

describe("RUNTIME_EXCLUSION_PATHS", () => {
  it("is an array with entries", () => {
    assert.ok(Array.isArray(RUNTIME_EXCLUSION_PATHS), "is an array");
    assert.ok(RUNTIME_EXCLUSION_PATHS.length > 0, "has at least one entry");
  });

  it("all entries start with .kata-cli/ prefix", () => {
    for (const p of RUNTIME_EXCLUSION_PATHS) {
      assert.ok(p.startsWith(".kata-cli/"), `path starts with .kata-cli/: "${p}"`);
    }
  });

  it("includes .kata-cli/activity/", () => {
    assert.ok(
      RUNTIME_EXCLUSION_PATHS.includes(".kata-cli/activity/"),
      "includes .kata-cli/activity/",
    );
  });

  it("includes .kata-cli/auto.lock", () => {
    assert.ok(
      RUNTIME_EXCLUSION_PATHS.includes(".kata-cli/auto.lock"),
      "includes .kata-cli/auto.lock",
    );
  });

  it("includes .kata-cli/STATE.md", () => {
    assert.ok(
      RUNTIME_EXCLUSION_PATHS.includes(".kata-cli/STATE.md"),
      "includes .kata-cli/STATE.md",
    );
  });

  it("includes .kata-cli/metrics.json", () => {
    assert.ok(
      RUNTIME_EXCLUSION_PATHS.includes(".kata-cli/metrics.json"),
      "includes .kata-cli/metrics.json",
    );
  });

  it("includes .kata-cli/completed-units.json", () => {
    assert.ok(
      RUNTIME_EXCLUSION_PATHS.includes(".kata-cli/completed-units.json"),
      "includes .kata-cli/completed-units.json",
    );
  });

  it("includes .kata-cli/worktrees/", () => {
    assert.ok(
      RUNTIME_EXCLUSION_PATHS.includes(".kata-cli/worktrees/"),
      "includes .kata-cli/worktrees/",
    );
  });

  it("does not contain any .gsd/ paths", () => {
    for (const p of RUNTIME_EXCLUSION_PATHS) {
      assert.ok(!p.startsWith(".gsd/"), `no .gsd/ paths — found: "${p}"`);
    }
  });
});

// ─── VALID_BRANCH_NAME ────────────────────────────────────────────────────────

describe("VALID_BRANCH_NAME", () => {
  it("accepts 'main'", () => assert.ok(VALID_BRANCH_NAME.test("main")));
  it("accepts 'master'", () => assert.ok(VALID_BRANCH_NAME.test("master")));
  it("accepts 'develop'", () => assert.ok(VALID_BRANCH_NAME.test("develop")));
  it("accepts 'feature/foo'", () => assert.ok(VALID_BRANCH_NAME.test("feature/foo")));
  it("accepts 'release-1.0'", () => assert.ok(VALID_BRANCH_NAME.test("release-1.0")));
  it("accepts 'my_branch'", () => assert.ok(VALID_BRANCH_NAME.test("my_branch")));
  it("accepts 'v2.0.1'", () => assert.ok(VALID_BRANCH_NAME.test("v2.0.1")));
  it("accepts 'kata/M001/S01'", () => assert.ok(VALID_BRANCH_NAME.test("kata/M001/S01")));

  it("rejects shell injection 'main; rm -rf /'", () => {
    assert.ok(!VALID_BRANCH_NAME.test("main; rm -rf /"));
  });

  it("rejects '&& injection'", () => {
    assert.ok(!VALID_BRANCH_NAME.test("main && echo pwned"));
  });

  it("rejects empty string", () => {
    assert.ok(!VALID_BRANCH_NAME.test(""));
  });

  it("rejects spaces in branch name", () => {
    assert.ok(!VALID_BRANCH_NAME.test("branch name"));
  });

  it("rejects backtick injection", () => {
    assert.ok(!VALID_BRANCH_NAME.test("branch`cmd`"));
  });

  it("rejects $() subshell injection", () => {
    assert.ok(!VALID_BRANCH_NAME.test("branch$(cmd)"));
  });
});

// ─── runGit ───────────────────────────────────────────────────────────────────

describe("runGit", () => {
  // Use an empty repo (no commits) so `git log` will fail — tests both
  // success and failure paths without needing an initial commit.
  let repo: string;

  beforeAll(() => {
    repo = initEmptyRepo();
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("returns git command output on success", () => {
    const branch = runGit(repo, ["branch", "--show-current"]);
    assert.equal(branch, "main");
  });

  it("allowFailure: true returns empty string on error", () => {
    const result = runGit(repo, ["log", "--oneline"], { allowFailure: true });
    assert.equal(result, "");
  });

  it("throws an Error on failure when allowFailure is not set", () => {
    assert.throws(
      () => runGit(repo, ["log", "--oneline"]),
      (err: unknown) => {
        assert.ok(err instanceof Error, "throws an Error instance");
        // Error message should identify the failed git command
        const msg = (err as Error).message;
        assert.ok(
          msg.includes("log") || msg.includes("failed") || msg.length > 0,
          `error message is descriptive: "${msg}"`,
        );
        return true;
      },
    );
  });
});

// ─── type exports compile checks ─────────────────────────────────────────────

describe("type exports", () => {
  it("GitPreferences is usable as a type", () => {
    // Compile-time check: if we reach here the type imported correctly
    const _prefs: GitPreferences = { auto_push: true, remote: "origin" };
    assert.ok(true);
  });

  it("CommitOptions is usable as a type", () => {
    const _opts: CommitOptions = { message: "test" };
    assert.ok(true);
  });

  it("TaskCommitContext is usable as a type", () => {
    const _ctx: TaskCommitContext = {
      taskId: "S01/T01",
      taskTitle: "test task",
    };
    assert.ok(true);
  });
});

// ─── smart staging — runtime file exclusions ──────────────────────────────────

describe("smart staging — runtime file exclusions", () => {
  it("excludes .kata-cli/ runtime files from commit; commits real source files", () => {
    const repo = initRepo();
    try {
      // Create runtime files (should be excluded from staging)
      createFile(repo, ".kata-cli/activity/log.jsonl", "log data");
      createFile(repo, ".kata-cli/runtime/state.json", '{"state":true}');
      createFile(repo, ".kata-cli/STATE.md", "# State");
      createFile(repo, ".kata-cli/auto.lock", "lock");
      createFile(repo, ".kata-cli/metrics.json", "{}");
      createFile(repo, ".kata-cli/worktrees/wt/file.txt", "wt data");

      // Create a real source file (should be staged and committed)
      createFile(repo, "src/code.ts", 'console.log("hello");');

      const msg = autoCommitCurrentBranch(repo, "task", "T01");
      assert.ok(msg !== null, "autoCommit succeeds when real source file is present");

      // Only the real source file should be in the commit
      const showStat = gitRaw(["show", "--stat", "--format=", "HEAD"], repo);
      assert.ok(showStat.includes("src/code.ts"), "src/code.ts is in the commit");
      assert.ok(
        !showStat.includes(".kata-cli/activity"),
        ".kata-cli/activity/ excluded from commit",
      );
      assert.ok(
        !showStat.includes(".kata-cli/runtime"),
        ".kata-cli/runtime/ excluded from commit",
      );
      assert.ok(!showStat.includes("STATE.md"), ".kata-cli/STATE.md excluded from commit");
      assert.ok(!showStat.includes("auto.lock"), ".kata-cli/auto.lock excluded from commit");
      assert.ok(!showStat.includes("metrics.json"), ".kata-cli/metrics.json excluded from commit");
      assert.ok(
        !showStat.includes(".kata-cli/worktrees"),
        ".kata-cli/worktrees/ excluded from commit",
      );

      // Runtime files should still be untracked after commit
      const statusOut = gitRaw(["status", "--short", "--untracked-files=all"], repo);
      assert.ok(
        statusOut.includes(".kata-cli/activity/"),
        ".kata-cli/activity/ still untracked after commit",
      );
      assert.ok(
        statusOut.includes(".kata-cli/runtime/"),
        ".kata-cli/runtime/ still untracked after commit",
      );
      assert.ok(
        statusOut.includes(".kata-cli/STATE.md"),
        ".kata-cli/STATE.md still untracked after commit",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// ─── smart staging — tracked runtime file cleanup (_runtimeFilesCleanedUp) ───

describe("smart staging — tracked runtime file cleanup", () => {
  it(
    "removes previously-tracked .kata-cli/ files from index before committing real files",
    () => {
      const repo = initRepo();
      try {
        // Simulate: .kata-cli/ runtime files were previously force-added to git
        // (mirrors the historical bug where files were accidentally tracked)
        createFile(repo, ".kata-cli/metrics.json", '{"version":1}');
        createFile(repo, ".kata-cli/completed-units.json", '["unit1"]');
        createFile(repo, ".kata-cli/activity/log.jsonl", '{"ts":1}');
        createFile(repo, "src/real.ts", "real code");

        execFileSync(
          "git",
          [
            "add",
            "-f",
            ".kata-cli/metrics.json",
            ".kata-cli/completed-units.json",
            ".kata-cli/activity/log.jsonl",
            "src/real.ts",
          ],
          { cwd: repo },
        );
        execFileSync("git", ["commit", "-m", "init with tracked runtime files"], { cwd: repo });

        // Add .gitignore to exclude .kata-cli/ (mirrors real-world setup)
        createFile(repo, ".gitignore", ".kata-cli/\n");
        execFileSync("git", ["add", ".gitignore"], { cwd: repo });
        execFileSync("git", ["commit", "-m", "add gitignore"], { cwd: repo });

        // Precondition: runtime files are tracked in the git index
        const tracked = gitRaw(["ls-files", ".kata-cli/"], repo);
        assert.ok(tracked.includes("metrics.json"), "precondition: metrics.json is tracked");
        assert.ok(
          tracked.includes("completed-units.json"),
          "precondition: completed-units.json is tracked",
        );
        assert.ok(
          tracked.includes("activity/log.jsonl"),
          "precondition: activity log is tracked",
        );

        // Modify both runtime files and a real source file
        createFile(repo, ".kata-cli/metrics.json", '{"version":2}');
        createFile(repo, ".kata-cli/completed-units.json", '["unit1","unit2"]');
        createFile(repo, ".kata-cli/activity/log.jsonl", '{"ts":2}');
        createFile(repo, "src/real.ts", "updated code");

        // First autoCommit: commits real.ts; auto-cleanup removes runtime files from index
        const msg = autoCommitCurrentBranch(repo, "execute-task", "M001/S01/T01");
        assert.ok(msg !== null, "first autoCommit produces a commit");

        const show = gitRaw(["show", "--stat", "HEAD"], repo);
        assert.ok(show.includes("src/real.ts"), "real files are in the commit");

        // Runtime files must be removed from the git index after cleanup
        const trackedAfter = gitRaw(["ls-files", ".kata-cli/"], repo);
        assert.equal(trackedAfter, "", "no .kata-cli/ runtime files remain in the git index");

        // Second autoCommit: runtime files still excluded (even after first cleanup)
        createFile(repo, ".kata-cli/metrics.json", '{"version":3}');
        createFile(repo, ".kata-cli/completed-units.json", '["unit1","unit2","unit3"]');
        createFile(repo, "src/real.ts", "third version");

        const msg2 = autoCommitCurrentBranch(repo, "execute-task", "M001/S01/T02");
        assert.ok(msg2 !== null, "second autoCommit produces a commit");

        const show2 = gitRaw(["show", "--stat", "HEAD"], repo);
        assert.ok(show2.includes("src/real.ts"), "real files committed in second commit");
        assert.ok(!show2.includes("metrics"), "metrics.json not in second commit");
        assert.ok(!show2.includes("completed-units"), "completed-units.json not in second commit");
        assert.ok(!show2.includes("activity"), "activity log not in second commit");
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    },
  );
});

// ─── autoCommitCurrentBranch ──────────────────────────────────────────────────

describe("autoCommitCurrentBranch — clean repo", () => {
  it("returns null when repo is clean (nothing to commit)", () => {
    const repo = initRepo();
    try {
      const result = autoCommitCurrentBranch(repo, "task", "T01");
      assert.equal(result, null);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("autoCommitCurrentBranch — dirty repo without taskContext", () => {
  it("returns generic commit message format", () => {
    const repo = initRepo();
    try {
      createFile(repo, "src/new-feature.ts", "export const x = 1;");

      const msg = autoCommitCurrentBranch(repo, "task", "T01");
      assert.equal(msg, "chore(T01): auto-commit after task");

      const log = gitRaw(["log", "--oneline", "-1"], repo);
      assert.ok(
        log.includes("chore(T01): auto-commit after task"),
        "generic message appears in git log",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("autoCommitCurrentBranch — dirty repo with taskContext", () => {
  it("returns meaningful commit message using taskContext", () => {
    const repo = initRepo();
    try {
      createFile(repo, "src/auth.ts", "export function login() {}");

      const ctx: TaskCommitContext = {
        taskId: "S01/T02",
        taskTitle: "implement user authentication endpoint",
        oneLiner: "Added JWT-based auth with refresh token rotation",
        keyFiles: ["src/auth.ts"],
      };

      const msg = autoCommitCurrentBranch(repo, "task", "S01/T02", ctx);
      assert.ok(msg !== null, "returns a non-null message with task context");
      assert.ok(msg!.startsWith("feat(S01/T02):"), "uses feat type and task scope");
      assert.ok(msg!.includes("JWT-based auth"), "includes one-liner content");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("autoCommitCurrentBranch — empty-after-staging guard", () => {
  it("returns null when only runtime files are dirty", () => {
    const repo = initRepo();
    try {
      // Create only runtime files — no real source changes
      createFile(repo, ".kata-cli/activity/x.jsonl", "data");

      const result = autoCommitCurrentBranch(repo, "task", "T02");
      assert.equal(result, null, "returns null when only runtime files are dirty");

      // No new commit should have been created (still at the init commit)
      const logCount = gitRaw(["rev-list", "--count", "HEAD"], repo);
      assert.equal(logCount, "1", "no new commit created when only runtime files changed");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// ─── commit ───────────────────────────────────────────────────────────────────

describe("commit", () => {
  it("returns null when nothing is staged", () => {
    const repo = initRepo();
    try {
      // Clean repo: no changes staged — commit should be a no-op
      const result = commit(repo, { message: "should not commit" });
      assert.equal(result, null);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// ─── getCurrentBranch ─────────────────────────────────────────────────────────

describe("getCurrentBranch", () => {
  it("returns 'main' on main branch", () => {
    const repo = initRepo("main");
    try {
      assert.equal(getCurrentBranch(repo), "main");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("returns slice branch name kata/M001/S01", () => {
    const repo = initRepo("main");
    try {
      execFileSync("git", ["checkout", "-b", "kata/M001/S01"], { cwd: repo });
      assert.equal(getCurrentBranch(repo), "kata/M001/S01");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("returns feature branch name", () => {
    const repo = initRepo("main");
    try {
      execFileSync("git", ["checkout", "-b", "feature/foo"], { cwd: repo });
      assert.equal(getCurrentBranch(repo), "feature/foo");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// ─── getMainBranch ────────────────────────────────────────────────────────────

describe("getMainBranch", () => {
  it("returns 'main' when repo has a main branch", () => {
    const repo = initRepo("main");
    try {
      assert.equal(getMainBranch(repo), "main");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("returns 'master' when repo only has a master branch", () => {
    const repo = initRepo("master");
    try {
      assert.equal(getMainBranch(repo), "master");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("falls back to current branch when neither main nor master exists", () => {
    const repo = initRepo("trunk");
    try {
      // No 'main' or 'master' branch — should fall back
      const branch = getMainBranch(repo);
      assert.equal(branch, "trunk");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// ─── mergeSliceToMain ─────────────────────────────────────────────────────────

describe("mergeSliceToMain", () => {
  it("happy path: squash-merges slice commits onto main and returns result", () => {
    const repo = initRepo("main");
    try {
      // Create a slice branch with one new commit
      execFileSync("git", ["checkout", "-b", "kata/M001/S01"], { cwd: repo });
      createFile(repo, "src/feature.ts", "export const feature = 1;");
      execFileSync("git", ["add", "-A"], { cwd: repo });
      execFileSync("git", ["commit", "-m", "feat: add feature"], { cwd: repo });

      const result = mergeSliceToMain(repo, "M001", "S01", "Feature slice");

      assert.equal(result.branch, "kata/M001/S01", "returns slice branch name");
      assert.equal(
        result.mergedCommitMessage,
        "feat(M001/S01): Feature slice",
        "returns conventional squash commit message",
      );
      assert.equal(result.deletedBranch, false);

      // Should now be on main
      assert.equal(getCurrentBranch(repo), "main");

      // The squash commit must appear in main's log
      const log = gitRaw(["log", "--oneline", "-1"], repo);
      assert.ok(
        log.includes("feat(M001/S01): Feature slice"),
        `squash commit is in main log: "${log}"`,
      );

      // The feature file must be present on main
      const showStat = gitRaw(["show", "--stat", "--format=", "HEAD"], repo);
      assert.ok(showStat.includes("src/feature.ts"), "feature file is in the squash commit");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("throws when slice has no new commits (empty squash stages nothing)", () => {
    const repo = initRepo("main");
    try {
      // Create slice branch with NO additional commits — identical to main
      execFileSync("git", ["checkout", "-b", "kata/M001/S01"], { cwd: repo });

      assert.throws(
        () => mergeSliceToMain(repo, "M001", "S01", "Empty slice"),
        (err: unknown) => {
          assert.ok(err instanceof Error, "throws an Error");
          assert.ok(
            (err as Error).message.includes("staged nothing"),
            `error mentions 'staged nothing': "${(err as Error).message}"`,
          );
          return true;
        },
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("throws MergeConflictError with populated conflictedFiles on conflict", () => {
    const repo = initRepo("main");
    try {
      // Create a conflicting edit on the slice branch
      execFileSync("git", ["checkout", "-b", "kata/M001/S01"], { cwd: repo });
      createFile(repo, "conflict.txt", "slice version\n");
      execFileSync("git", ["add", "-A"], { cwd: repo });
      execFileSync("git", ["commit", "-m", "feat: slice edit"], { cwd: repo });

      // Create a conflicting edit on main
      execFileSync("git", ["checkout", "main"], { cwd: repo });
      createFile(repo, "conflict.txt", "main version\n");
      execFileSync("git", ["add", "-A"], { cwd: repo });
      execFileSync("git", ["commit", "-m", "chore: main edit"], { cwd: repo });

      // Switch back to slice so mergeSliceToMain captures the right current branch
      execFileSync("git", ["checkout", "kata/M001/S01"], { cwd: repo });

      assert.throws(
        () => mergeSliceToMain(repo, "M001", "S01", "Conflicting slice"),
        (err: unknown) => {
          assert.ok(err instanceof MergeConflictError, "throws MergeConflictError");
          const mce = err as MergeConflictError;
          assert.ok(mce.conflictedFiles.length > 0, "conflictedFiles is non-empty");
          assert.ok(
            mce.conflictedFiles.includes("conflict.txt"),
            `conflictedFiles includes conflict.txt: ${JSON.stringify(mce.conflictedFiles)}`,
          );
          assert.equal(mce.strategy, "squash", "strategy is always 'squash'");
          assert.equal(mce.branch, "kata/M001/S01", "records the slice branch");
          assert.equal(mce.mainBranch, "main", "records the main branch");
          return true;
        },
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
