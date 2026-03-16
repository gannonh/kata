/**
 * Shared git utilities used by both FileBackend and LinearBackend.
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
    execSync("git init", { cwd: basePath, stdio: "pipe" });
  }
}
