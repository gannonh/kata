import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  getRemoteUrl,
  isInsideWorktree,
  repoIdentity,
  resolveGitCommonDir,
  validateProjectId,
} from "../repo-identity.ts";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function detectWorktreeByGit(cwd: string): boolean {
  const commonDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
    .replaceAll("\\", "/");
  const gitDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"])
    .replaceAll("\\", "/");
  return gitDir.includes("/.git/worktrees/") || gitDir !== commonDir;
}

describe("repoIdentity", () => {
  it("returns a stable SHA-256 hash for the same repository", () => {
    const cwd = process.cwd();
    const repoHash = repoIdentity(cwd);
    const nestedHash = repoIdentity(join(cwd, "src", "resources"));
    assert.equal(repoHash, nestedHash);
    assert.match(repoHash, /^[a-f0-9]{64}$/);
  });

  it("uses KATA_PROJECT_ID when present and valid", () => {
    const original = process.env.KATA_PROJECT_ID;
    process.env.KATA_PROJECT_ID =
      "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";
    try {
      const id = repoIdentity(process.cwd());
      assert.equal(
        id,
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      );
    } finally {
      if (original === undefined) delete process.env.KATA_PROJECT_ID;
      else process.env.KATA_PROJECT_ID = original;
    }
  });
});

describe("validateProjectId", () => {
  it("accepts 64-char SHA-256 hex strings", () => {
    assert.equal(
      validateProjectId(
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      ),
      true,
    );
    assert.equal(
      validateProjectId(
        "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
      ),
      true,
    );
  });

  it("rejects invalid project ids", () => {
    assert.equal(validateProjectId(""), false);
    assert.equal(validateProjectId("abc123"), false);
    assert.equal(
      validateProjectId(
        "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      ),
      false,
    );
  });
});

describe("git helpers", () => {
  it("isInsideWorktree matches .git file detection", () => {
    const cwd = process.cwd();
    assert.equal(isInsideWorktree(cwd), detectWorktreeByGit(cwd));
  });

  it("resolveGitCommonDir returns a non-empty path", () => {
    const dir = resolveGitCommonDir(process.cwd());
    assert.ok(dir.length > 0);
  });

  it("getRemoteUrl returns a string", () => {
    const remote = getRemoteUrl(process.cwd());
    assert.equal(typeof remote, "string");
  });
});
