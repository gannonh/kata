/**
 * pr-runner-runtime.ts — Injectable runtime seams for `runCreatePr()`.
 *
 * The `PrRunnerRuntime` interface covers all I/O boundaries used by
 * the PR creation orchestration: command execution, temp-file lifecycle,
 * pre-flight checks, and branch detection.
 *
 * `defaultRuntime` provides the production implementation backed by
 * Node primitives. Tests inject a mock runtime to make orchestration
 * flows deterministic and network-free.
 */

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  isGhInstalled,
  isGhAuthenticated,
  getCurrentBranch,
  parseBranchToSlice,
} from "./gh-utils.js";

// ─── Runtime interface ────────────────────────────────────────────────────────

export interface PrRunnerExecOptions {
  cwd: string;
  env?: Record<string, string | undefined>;
}

export interface PrRunnerRuntime {
  /** Execute a shell command synchronously, returning stdout. Throws on non-zero exit. */
  exec(command: string, options: PrRunnerExecOptions): string;

  /** Write UTF-8 content to a file. */
  writeFile(path: string, content: string): void;

  /** Remove a file (best-effort, should not throw). */
  removeFile(path: string): void;

  /** Generate a unique temp file path with the given extension. */
  tempFilePath(extension: string): string;

  /** Returns true when `gh` CLI is installed and callable. */
  isGhInstalled(): boolean;

  /** Returns true when `gh` CLI is authenticated. */
  isGhAuthenticated(): boolean;

  /** Returns the current git branch name, or null on failure. */
  getCurrentBranch(cwd: string): string | null;

  /** Parses a Kata-convention branch into milestone/slice IDs, or null. */
  parseBranchToSlice(branch: string): { milestoneId: string; sliceId: string } | null;
}

// ─── Default production runtime ───────────────────────────────────────────────

const PIPE = { stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"] };

export const defaultRuntime: PrRunnerRuntime = {
  exec(command: string, options: PrRunnerExecOptions): string {
    return execSync(command, {
      encoding: "utf8",
      cwd: options.cwd,
      env: options.env ? (options.env as NodeJS.ProcessEnv) : undefined,
      ...PIPE,
    });
  },

  writeFile(path: string, content: string): void {
    writeFileSync(path, content, "utf8");
  },

  removeFile(path: string): void {
    try {
      unlinkSync(path);
    } catch { /* ignore */ }
  },

  tempFilePath(extension: string): string {
    return join(tmpdir(), randomUUID() + extension);
  },

  isGhInstalled,
  isGhAuthenticated,
  getCurrentBranch,
  parseBranchToSlice,
};
