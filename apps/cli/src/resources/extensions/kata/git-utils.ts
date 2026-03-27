/**
 * Shared git utilities for the Kata workflow.
 */

import { execSync } from "node:child_process";

export function resolveGitRoot(basePath: string): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: basePath, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return basePath;
  }
}

export function ensureGitRepo(basePath: string, gitRoot: string): void {
  if (gitRoot !== basePath) return;
  try {
    execSync("git rev-parse --git-dir", { cwd: basePath, stdio: "pipe" });
  } catch {
    // Use --initial-branch=main so the default branch matches downstream
    // expectations (switchToMain, PR base branch). Older Git versions that
    // don't support the flag fall back to a plain `git init`.
    try {
      execSync("git init --initial-branch=main", { cwd: basePath, stdio: "pipe" });
    } catch {
      execSync("git init", { cwd: basePath, stdio: "pipe" });
    }
  }
}
