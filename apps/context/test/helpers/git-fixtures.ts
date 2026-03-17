/**
 * Shared git test helpers for creating temporary repos and committing files.
 *
 * Used by both incremental.test.ts and integration-e2e.test.ts.
 */

import { mkdtempSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

/** Create a temporary git repo with initial commit and return its path. */
export function createTempGitRepo(prefix = "kata-test-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", {
    cwd: dir,
    stdio: "pipe",
  });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });

  // Initial empty commit so we have a HEAD
  execSync("git commit --allow-empty -m 'init'", {
    cwd: dir,
    stdio: "pipe",
  });

  return dir;
}

/** Write a file, git add, and commit. */
export function commitFile(
  repoDir: string,
  relPath: string,
  content: string,
  message: string,
): void {
  const fullPath = join(repoDir, relPath);
  const dir = dirname(fullPath);
  if (dir !== repoDir) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(fullPath, content, "utf-8");
  execSync(`git add "${relPath}"`, { cwd: repoDir, stdio: "pipe" });
  execSync(`git commit -m "${message}"`, { cwd: repoDir, stdio: "pipe" });
}

/** Delete a file, git add, and commit. */
export function deleteAndCommit(
  repoDir: string,
  relPath: string,
  message: string,
): void {
  const fullPath = join(repoDir, relPath);
  unlinkSync(fullPath);
  execSync(`git add "${relPath}"`, { cwd: repoDir, stdio: "pipe" });
  execSync(`git commit -m "${message}"`, { cwd: repoDir, stdio: "pipe" });
}

/** Rename a file, git add, and commit. */
export function renameAndCommit(
  repoDir: string,
  oldPath: string,
  newPath: string,
  message: string,
): void {
  execSync(`git mv "${oldPath}" "${newPath}"`, {
    cwd: repoDir,
    stdio: "pipe",
  });
  execSync(`git commit -m "${message}"`, { cwd: repoDir, stdio: "pipe" });
}

/** Get HEAD SHA of a repo. */
export function headSha(repoDir: string): string {
  return execSync("git rev-parse HEAD", {
    cwd: repoDir,
    encoding: "utf-8",
  }).trim();
}
