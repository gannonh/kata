/**
 * pr-runner-fixtures.ts — Deterministic test helpers for `runCreatePr()`.
 *
 * Provides:
 * - `createMockRuntime()` — builds a mock PrRunnerRuntime that records
 *   commands and returns scripted responses.
 * - `PLAN_CONTENT` / `SUMMARY_CONTENT` — minimal valid artifact content
 *   that passes `parsePlan()` / `parseSummary()`.
 */

import type { PrRunnerRuntime, PrRunnerExecOptions } from "../pr-runner-runtime.js";

// ─── Minimal valid artifact content ───────────────────────────────────────────

/** Minimal PLAN content that satisfies `parsePlan()` expectations. */
export const PLAN_CONTENT = `# S01: Test Slice

**Goal:** Deterministic orchestration testing.

## Must-Haves

- Orchestration paths covered

## Tasks

- [ ] **T01: Fixture task** \`est:10m\`
`;

/** Minimal SUMMARY content that satisfies `parseSummary()` expectations. */
export const SUMMARY_CONTENT = `---
id: S01
---

# S01 Summary

**Test summary content.**
`;

// ─── Command transcript types ─────────────────────────────────────────────────

export interface MockCommandEntry {
  command: string;
  cwd: string;
  response: string | Error;
}

export interface MockRuntimeOptions {
  /**
   * Branch name returned by getCurrentBranch().
   * Set to null to simulate "not in a git repo".
   */
  branch?: string | null;

  /**
   * Scripted command responses. Each entry maps a command prefix to a
   * response string (stdout) or an Error to throw.
   *
   * Commands are matched by `command.includes(entry.match)` (substring match).
   * First match wins.
   */
  commands?: Array<{
    match: string | RegExp;
    response: string | Error;
  }>;

  /**
   * Override parseBranchToSlice result.
   * Default: returns { milestoneId, sliceId } parsed from the branch.
   */
  parsedBranch?: { milestoneId: string; sliceId: string } | null;
}

// ─── Mock runtime factory ─────────────────────────────────────────────────────

export interface MockRuntime extends PrRunnerRuntime {
  /** Recorded exec() calls in order. */
  execLog: Array<{ command: string; cwd: string }>;
  /** Recorded writeFile() calls in order. */
  writeLog: Array<{ path: string; content: string }>;
  /** Recorded removeFile() calls in order. */
  removeLog: string[];
}

/**
 * Creates a mock `PrRunnerRuntime` for deterministic orchestration testing.
 *
 * - `exec()` records the call and returns the first matching scripted response.
 * - `writeFile()` / `removeFile()` record calls but do no I/O.
 * - `tempFilePath()` returns a deterministic path.
 * - Pre-flight checks return `true` by default.
 * - `getCurrentBranch()` returns the configured branch name.
 * - `parseBranchToSlice()` returns the configured parsed result.
 */
export function createMockRuntime(opts: MockRuntimeOptions = {}): MockRuntime {
  const branch = opts.branch !== undefined ? opts.branch : "kata/apps-cli/M001/S01";
  const commands = opts.commands ?? [];

  // Default parsedBranch: parse from configured branch if it looks like kata format
  const defaultParsed = branch && /^kata\//.test(branch)
    ? (() => {
        // Namespaced: kata/<scope>/<M>/<S>
        const ns = branch.match(/^kata\/[^/]+\/(M\d+)\/(S\d+)$/);
        if (ns) return { milestoneId: ns[1], sliceId: ns[2] };
        // Legacy: kata/<M>/<S>
        const leg = branch.match(/^kata\/(M\d+)\/(S\d+)$/);
        if (leg) return { milestoneId: leg[1], sliceId: leg[2] };
        return null;
      })()
    : null;
  const parsedBranch = opts.parsedBranch !== undefined ? opts.parsedBranch : defaultParsed;

  const execLog: Array<{ command: string; cwd: string }> = [];
  const writeLog: Array<{ path: string; content: string }> = [];
  const removeLog: string[] = [];

  return {
    execLog,
    writeLog,
    removeLog,

    exec(command: string, options: PrRunnerExecOptions): string {
      execLog.push({ command, cwd: options.cwd });

      for (const entry of commands) {
        const matches = typeof entry.match === "string"
          ? command.includes(entry.match)
          : entry.match.test(command);
        if (matches) {
          if (entry.response instanceof Error) throw entry.response;
          return entry.response;
        }
      }

      // Default: return empty string for unmatched commands
      return "";
    },

    writeFile(path: string, content: string): void {
      writeLog.push({ path, content });
    },

    removeFile(path: string): void {
      removeLog.push(path);
    },

    tempFilePath(extension: string): string {
      return `/tmp/mock-pr-body${extension}`;
    },

    isGhInstalled(): boolean {
      return true;
    },

    isGhAuthenticated(): boolean {
      return true;
    },

    getCurrentBranch(_cwd: string): string | null {
      return branch;
    },

    parseBranchToSlice(_branch: string): { milestoneId: string; sliceId: string } | null {
      return parsedBranch;
    },
  };
}
