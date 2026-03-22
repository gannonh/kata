import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";

import { canonicalizeExistingPath } from "../repo-identity.ts";
import {
  getMainRepoPath,
  getWorktreeName,
  isInWorktree,
  resolveWorktreeBasePath,
} from "../worktree-resolver.ts";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function initMainRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "kata-worktree-resolver-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.name", "Pi Test"]);
  git(dir, ["config", "user.email", "pi@example.com"]);
  writeFileSync(join(dir, "README.md"), "hello\n", "utf-8");
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

describe("worktree-resolver", () => {
  it("isInWorktree matches git detection", () => {
    const cwd = process.cwd();
    const gitDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"])
      .replaceAll("\\", "/");
    const commonDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
      .replaceAll("\\", "/");
    const expected = gitDir.includes("/.git/worktrees/") || gitDir !== commonDir;
    assert.equal(isInWorktree(cwd), expected);
  });

  it("getWorktreeName returns current worktree name", () => {
    const cwd = process.cwd();
    const gitDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"])
      .replaceAll("\\", "/");
    const marker = "/.git/worktrees/";
    const expected = gitDir.includes(marker)
      ? gitDir.slice(gitDir.indexOf(marker) + marker.length).split("/")[0]
      : null;
    assert.equal(getWorktreeName(cwd), expected);
  });

  it("getWorktreeName returns null in a main repository checkout", () => {
    const repo = initMainRepo();
    try {
      assert.equal(getWorktreeName(repo), null);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("getMainRepoPath resolves the main repo root from a worktree", () => {
    const cwd = process.cwd();
    const commonDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const expected = canonicalizeExistingPath(resolve(commonDir, ".."));
    assert.equal(getMainRepoPath(cwd), expected);
  });

  it("resolveWorktreeBasePath returns the effective base path", () => {
    const cwd = process.cwd();
    const expectedCwd = isInWorktree(cwd)
      ? getMainRepoPath(cwd)
      : canonicalizeExistingPath(cwd);
    assert.equal(resolveWorktreeBasePath(cwd), expectedCwd);

    const repo = initMainRepo();
    try {
      assert.equal(resolveWorktreeBasePath(repo), canonicalizeExistingPath(repo));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("getMainRepoPath returns the same repo root when not in a worktree", () => {
    const repo = initMainRepo();
    try {
      const expected = canonicalizeExistingPath(dirname(git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"])));
      assert.equal(getMainRepoPath(repo), expected);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
