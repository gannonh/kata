/**
 * Git commit automation for memory mutations.
 *
 * Every memory write/delete produces a commit with a deterministic message format:
 *   kata-context: <operation> — <description>
 */

import { execFileSync, execSync } from "node:child_process";
import { MemoryError, MEMORY_ERROR_CODES } from "./types.js";

/**
 * Check if a directory is inside a git repository.
 */
export function isGitRepo(dir: string): boolean {
  try {
    execSync("git rev-parse --git-dir", { cwd: dir, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stage .kata/memory/ changes and commit with a structured message.
 * Returns the commit SHA on success.
 */
export function memoryGitCommit(
  operation: string,
  description: string,
  rootDir: string,
): string {
  if (!isGitRepo(rootDir)) {
    throw new MemoryError(
      MEMORY_ERROR_CODES.MEMORY_GIT_NOT_REPO,
      `Not a git repository: ${rootDir}`,
    );
  }

  const message = `kata-context: ${operation} — ${description}`;

  try {
    execFileSync("git", ["add", ".kata/memory/"], { cwd: rootDir, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", message], {
      cwd: rootDir,
      stdio: "pipe",
    });
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDir,
      encoding: "utf-8",
    }).trim();
    return sha;
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    throw new MemoryError(
      MEMORY_ERROR_CODES.MEMORY_GIT_COMMIT_FAILED,
      `Git commit failed: ${errMessage}`,
    );
  }
}
