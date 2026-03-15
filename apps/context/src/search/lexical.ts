/**
 * Lexical search: ripgrep wrapper with structured output.
 *
 * Spawns `rg --json` and parses the output into typed GrepResult[].
 */

import { spawn } from "node:child_process";
import { relative, isAbsolute } from "node:path";
import type { GrepOptions, GrepResult, FuzzyOptions, FuzzyResult } from "../types.js";
import { GrepNotFoundError } from "../types.js";
import type { GraphStore } from "../graph/store.js";

/**
 * Search for a pattern using ripgrep and return structured results.
 *
 * @param pattern - Regex pattern to search for (ripgrep syntax)
 * @param rootPath - Root directory to search in
 * @param options - Search options (globs, context, case sensitivity, etc.)
 * @returns Array of grep results, or empty array if no matches
 * @throws GrepNotFoundError if ripgrep is not installed
 */
export async function grepSearch(
  pattern: string,
  rootPath: string,
  options: GrepOptions = {}
): Promise<GrepResult[]> {
  const args = buildArgs(pattern, options);

  const { stdout, stderr, exitCode } = await spawnRg(args, rootPath);

  // Exit code 1 = no matches (not an error)
  if (exitCode === 1) {
    return [];
  }

  // Exit code 2 = error in rg (bad pattern, permission, etc.)
  // BUT rg also returns exit code 2 when no files were searched (empty dir,
  // all files filtered by glob). Check if the output is just a summary with
  // 0 matches — that's "no results", not an error.
  if (exitCode === 2) {
    // rg returns exit code 2 when no files were searched (empty dir,
    // all files filtered by glob) — stderr will say "No files were searched".
    // Treat this as empty results, not an error.
    const stderrText = stderr.trim();
    const isNoFilesSearched = stderrText.includes("No files were searched");
    if (isNoFilesSearched || (!stderrText && isEmptySearchSummary(stdout))) {
      return [];
    }
    if (stderrText) {
      throw new Error(`ripgrep error: ${stderrText.slice(0, 200)}`);
    }
    // Try to extract error message from output
    const errorLines = stdout
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          const parsed = JSON.parse(l);
          if (parsed.type === "summary" && parsed.data?.stats) return null;
          return l;
        } catch {
          return l;
        }
      })
      .filter(Boolean);
    throw new Error(`ripgrep error: ${errorLines.join(" ").slice(0, 200)}`);
  }

  return parseJsonOutput(stdout, rootPath);
}

/**
 * Check if rg output is just a summary with zero matches (no files searched).
 * rg returns exit code 2 when no files were searched (empty dir, all filtered),
 * but the output is still valid JSON with a summary showing 0 matches.
 */
function isEmptySearchSummary(stdout: string): boolean {
  const lines = stdout.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return true;
  // If the only JSON lines are summaries with 0 matches, treat as empty
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === "summary" && parsed.data?.stats?.matches === 0) {
        continue;
      }
      // Any non-summary line means it's not just an empty search
      return false;
    } catch {
      // Non-JSON lines (like error messages) mean it's a real error
      return false;
    }
  }
  return true;
}

/**
 * Build ripgrep command-line arguments.
 */
function buildArgs(pattern: string, options: GrepOptions): string[] {
  const args: string[] = ["--json"];

  // Case sensitivity
  if (options.caseSensitive === false) {
    args.push("--ignore-case");
  }

  // Context lines
  if (options.contextLines != null && options.contextLines > 0) {
    args.push("--context", String(options.contextLines));
  }

  // Max results (per-file max count)
  if (options.maxResults != null) {
    args.push("--max-count", String(options.maxResults));
  }

  // File type filter
  if (options.fileType) {
    args.push("--type", options.fileType);
  }

  // Glob filters
  if (options.globs && options.globs.length > 0) {
    for (const glob of options.globs) {
      args.push("--glob", glob);
    }
  }

  // The pattern to search for
  args.push("--", pattern);

  return args;
}

/**
 * Spawn ripgrep as a child process and collect output.
 */
function spawnRg(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const child = spawn("rg", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(new GrepNotFoundError());
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

// ── rg JSON output types ──

interface RgMatch {
  type: "match";
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: Array<{
      match: { text: string };
      start: number;
      end: number;
    }>;
  };
}

interface RgContext {
  type: "context";
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: [];
  };
}

type RgLine = RgMatch | RgContext | { type: "begin" | "end" | "summary"; data: unknown };

/**
 * Parse ripgrep JSON output into GrepResult[].
 *
 * The JSON output is one JSON object per line. We track context lines
 * and associate them with their nearest match.
 */
function parseJsonOutput(stdout: string, rootPath: string): GrepResult[] {
  const lines = stdout.split("\n").filter((l) => l.trim());
  const parsed: RgLine[] = [];

  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line) as RgLine);
    } catch {
      // Skip non-JSON lines
    }
  }

  // Collect all matches and contexts in order, grouped by file
  const results: GrepResult[] = [];

  // We need to associate context lines with matches.
  // Strategy: collect a sequential list of match/context entries per file,
  // then walk through and attach context to each match.
  type Entry = {
    type: "match" | "context";
    lineNumber: number;
    lineContent: string;
    filePath: string;
    matchText?: string;
    columnNumber?: number;
  };

  const entries: Entry[] = [];

  for (const item of parsed) {
    if (item.type === "match") {
      const m = item as RgMatch;
      const filePath = normalizePath(m.data.path.text, rootPath);
      const lineContent = m.data.lines.text.replace(/\n$/, "");
      const firstSubmatch = m.data.submatches[0];
      entries.push({
        type: "match",
        lineNumber: m.data.line_number,
        lineContent,
        filePath,
        matchText: firstSubmatch?.match.text ?? "",
        columnNumber: firstSubmatch?.start ?? 0,
      });
    } else if (item.type === "context") {
      const c = item as RgContext;
      const filePath = normalizePath(c.data.path.text, rootPath);
      const lineContent = c.data.lines.text.replace(/\n$/, "");
      entries.push({
        type: "context",
        lineNumber: c.data.line_number,
        lineContent,
        filePath,
      });
    }
  }

  // Now walk entries and build GrepResults.
  // For each match, look backwards for context lines and forward for context lines.
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "match") continue;

    const contextBefore: string[] = [];
    const contextAfter: string[] = [];

    // Look backwards for context lines belonging to this match
    for (let j = i - 1; j >= 0; j--) {
      const prev = entries[j];
      if (prev.type !== "context" || prev.filePath !== entry.filePath) break;
      // Context before must be contiguous and before the match line
      if (prev.lineNumber < entry.lineNumber) {
        contextBefore.unshift(prev.lineContent);
      } else {
        break;
      }
    }

    // Look forward for context lines belonging to this match
    for (let j = i + 1; j < entries.length; j++) {
      const next = entries[j];
      if (next.filePath !== entry.filePath) break;
      if (next.type === "context" && next.lineNumber > entry.lineNumber) {
        contextAfter.push(next.lineContent);
      } else {
        // Hit another match or different file
        break;
      }
    }

    results.push({
      filePath: entry.filePath,
      lineNumber: entry.lineNumber,
      columnNumber: entry.columnNumber!,
      matchText: entry.matchText!,
      lineContent: entry.lineContent,
      contextBefore,
      contextAfter,
    });
  }

  return results;
}

/**
 * Normalize a file path to be relative to rootPath.
 */
function normalizePath(filePath: string, rootPath: string): string {
  if (isAbsolute(filePath)) {
    return relative(rootPath, filePath);
  }
  return filePath;
}

// ── Fuzzy Find ──

/**
 * Check if a query string contains FTS5 operators.
 */
function hasFtsOperators(query: string): boolean {
  return /[*"]/.test(query) || /\b(OR|AND|NOT)\b/.test(query);
}

/**
 * Fuzzy find symbols and file paths using FTS5 full-text search.
 *
 * Wraps GraphStore.ftsSearch() with a user-friendly interface:
 * - Auto-adds `*` suffix for prefix matching when query has no FTS5 operators
 * - Supports kind filtering (only functions, only classes, etc.)
 * - Supports fileScope filtering (only symbols in files matching a path prefix)
 * - Returns FuzzyResult[] with symbol and optional relevance score
 *
 * @param query - Search query (symbol names, file paths, docstrings)
 * @param store - GraphStore instance to search
 * @param options - Optional limit, kind filter, and file scope
 * @returns Array of fuzzy match results, or empty array if no matches
 */
export function fuzzyFind(
  query: string,
  store: GraphStore,
  options: FuzzyOptions = {},
): FuzzyResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = options.limit ?? 20;

  // Auto-add * suffix for prefix matching when no FTS5 operators present.
  // This enables "usr" to match "UserService" via prefix expansion.
  let ftsQuery = trimmed;
  if (!hasFtsOperators(ftsQuery)) {
    // Add * to each whitespace-separated token for prefix matching
    ftsQuery = trimmed
      .split(/\s+/)
      .map((token) => `"${token.replace(/"/g, '""')}"*`)
      .join(" ");
  }

  // Fetch more results than needed if we'll be post-filtering by fileScope,
  // since ftsSearch doesn't support file path filtering directly.
  const fetchLimit = options.fileScope ? limit * 5 : limit;

  const symbols = store.ftsSearch(ftsQuery, {
    limit: fetchLimit,
    kind: options.kind,
  });

  // Post-filter by fileScope if specified
  let filtered = symbols;
  if (options.fileScope) {
    const scope = options.fileScope;
    filtered = symbols.filter((s) => s.filePath.startsWith(scope));
  }

  // Trim to requested limit
  const results = filtered.slice(0, limit);

  return results.map((symbol) => ({
    symbol,
  }));
}
