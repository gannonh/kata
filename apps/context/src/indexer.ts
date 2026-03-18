/**
 * Indexing pipeline orchestrator.
 *
 * Wires together: file discovery → parsing → relationship extraction → graph storage.
 * Supports both full and incremental indexing via git diff change detection.
 *
 * Full path: discover all files → parse → extract relationships → store → set SHA.
 * Incremental path: git diff since last SHA → partition changes → delete stale →
 *   parse changed → extract relationships → store → set SHA.
 */

import { execSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { discoverFiles } from "./discovery.js";
import { GraphStore } from "./graph/store.js";
import { extractRelationships } from "./graph/relationships.js";
import { parseFiles } from "./parser/index.js";
import { isSupportedFile } from "./parser/languages.js";
import type { Config, ParsedFile, Relationship, Symbol } from "./types.js";

// ── Types ──

/**
 * Result summary returned by indexProject.
 */
export interface IndexResult {
  /** Number of files successfully indexed */
  filesIndexed: number;
  /** Total symbols extracted and stored */
  symbolsExtracted: number;
  /** Total cross-file edges created */
  edgesCreated: number;
  /** Time taken in milliseconds */
  duration: number;
  /** Files that failed to parse (path + error) */
  errors: Array<{ filePath: string; error: string }>;
  /** Whether incremental indexing was used */
  incremental: boolean;
  /** Number of changed files processed (incremental only) */
  changedFiles?: number;
  /** Number of deleted files removed from graph (incremental only) */
  deletedFiles?: number;
}

/**
 * Options for indexProject.
 */
export interface IndexOptions {
  /** Path to the SQLite database. Defaults to `.kata/index/graph.db` under rootPath. */
  dbPath?: string;
  /** Config overrides. If omitted, loads from `.kata/config.json`. */
  config?: Config;
  /** An existing open GraphStore to use (for testing with :memory: databases). */
  store?: GraphStore;
  /** Force full re-index even if a last-indexed SHA exists. */
  full?: boolean;
}

// ── Change detection types ──

/** Status of a file change detected by git diff. */
export type FileChangeStatus = "added" | "modified" | "deleted" | "renamed";

/** A single file change from git diff. */
export interface FileChange {
  status: FileChangeStatus;
  /** File path (for added/modified/deleted) or new path (for renamed). */
  filePath: string;
  /** Old path (for renamed files only). */
  oldPath?: string;
}

// ── Default DB path ──

const DEFAULT_DB_DIR = ".kata/index";
const DEFAULT_DB_NAME = "graph.db";

/**
 * Resolve the default database path for a project.
 */
function resolveDbPath(rootPath: string): string {
  return resolve(rootPath, DEFAULT_DB_DIR, DEFAULT_DB_NAME);
}

// ── Git helpers ──

/**
 * Get the current HEAD SHA of the git repository.
 *
 * @param rootPath - Absolute path to the project root
 * @returns Current HEAD SHA, or null if not a git repo or git is unavailable
 */
export function getCurrentSha(rootPath: string): string | null {
  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: rootPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return sha || null;
  } catch {
    return null;
  }
}

/**
 * Get changed files between a base SHA and HEAD using `git diff`.
 *
 * Parses `git diff --name-status --diff-filter=ACDMR` output to detect
 * added, copied, deleted, modified, and renamed files.
 *
 * @param rootPath - Absolute path to the project root
 * @param baseSha - The SHA to diff against (last indexed SHA)
 * @returns Array of file changes, or null if git command fails
 */
export function getChangedFiles(
  rootPath: string,
  baseSha: string,
): FileChange[] | null {
  try {
    // Use spawnSync with argument array to avoid shell injection via baseSha
    const result = spawnSync(
      "git",
      ["diff", "--name-status", "--diff-filter=ACDMR", baseSha, "HEAD"],
      { cwd: rootPath, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    if (result.status !== 0 || result.error) return null;
    const output = (result.stdout as string).trim();

    if (!output) return [];

    const changes: FileChange[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      // Tab-separated: STATUS\tPATH or STATUS\tOLD_PATH\tNEW_PATH (for renames)
      const parts = line.split("\t");
      const statusCode = parts[0];

      if (!statusCode) continue;

      // Rename lines start with R followed by similarity percentage (e.g. R100, R095)
      if (statusCode.startsWith("R")) {
        const oldPath = parts[1];
        const newPath = parts[2];
        if (oldPath && newPath) {
          changes.push({
            status: "renamed",
            filePath: newPath,
            oldPath: oldPath,
          });
        }
      } else if (statusCode.startsWith("C")) {
        // Copied files — treat as added (the copy target is new)
        const newPath = parts[2];
        if (newPath) {
          changes.push({ status: "added", filePath: newPath });
        }
      } else {
        const filePath = parts[1];
        if (!filePath) continue;

        switch (statusCode) {
          case "A":
            changes.push({ status: "added", filePath });
            break;
          case "D":
            changes.push({ status: "deleted", filePath });
            break;
          case "M":
            changes.push({ status: "modified", filePath });
            break;
        }
      }
    }

    return changes;
  } catch {
    return null;
  }
}

// ── Full index path ──

/**
 * Execute the full indexing path: discover all files, parse, extract, store.
 */
function fullIndex(
  rootPath: string,
  config: Config,
  store: GraphStore,
): {
  parsedFiles: ParsedFile[];
  relationships: Relationship[];
  errors: Array<{ filePath: string; error: string }>;
} {
  // Discover all files
  const filePaths = discoverFiles(rootPath, config);

  // Parse all files
  const parseResults = parseFiles(filePaths, rootPath);

  // Separate successes and errors
  const parsedFiles: ParsedFile[] = [];
  const errors: Array<{ filePath: string; error: string }> = [];

  for (const result of parseResults) {
    if (result.parsed) {
      parsedFiles.push(result.parsed);
    } else if (result.error) {
      errors.push({ filePath: result.filePath, error: result.error });
    }
  }

  // Extract cross-file relationships
  const relationships = extractRelationships(parsedFiles, rootPath);

  // Collect all symbols
  const allSymbols: Symbol[] = [];
  for (const file of parsedFiles) {
    allSymbols.push(...file.symbols);
  }

  // Delete stale data for files being re-indexed
  const indexedFiles = new Set(parsedFiles.map((f) => f.filePath));
  for (const filePath of indexedFiles) {
    store.deleteEdgesByFile(filePath);
    store.deleteSymbolsByFile(filePath);
  }

  // Upsert symbols
  if (allSymbols.length > 0) {
    store.upsertSymbols(allSymbols);
  }

  // Upsert edges
  if (relationships.length > 0) {
    store.upsertEdges(relationships);
  }

  return { parsedFiles, relationships, errors };
}

// ── Incremental index path ──

/**
 * Execute the incremental indexing path: process only changed files.
 */
function incrementalIndex(
  rootPath: string,
  config: Config,
  store: GraphStore,
  changes: FileChange[],
): {
  parsedFiles: ParsedFile[];
  relationships: Relationship[];
  errors: Array<{ filePath: string; error: string }>;
  deletedCount: number;
} {
  // Partition changes into:
  //   pathsRemoved — truly gone (deleted files, renamed old paths): clean up all edges
  //   pathsToRefresh — modified files: clean outgoing edges only (inbound preserved)
  //   pathsToParse — files to re-parse
  const pathsRemoved: string[] = [];
  const pathsToRefresh: string[] = [];
  const pathsToParse: string[] = [];

  for (const change of changes) {
    switch (change.status) {
      case "deleted":
        pathsRemoved.push(change.filePath);
        break;

      case "renamed":
        // Old path is truly removed
        if (change.oldPath) {
          pathsRemoved.push(change.oldPath);
        }
        // Parse new path (if supported)
        if (isSupportedFile(change.filePath)) {
          pathsToParse.push(change.filePath);
        }
        break;

      case "added":
        if (isSupportedFile(change.filePath)) {
          pathsToParse.push(change.filePath);
        }
        break;

      case "modified":
        // Modified: refresh outgoing edges but preserve inbound
        pathsToRefresh.push(change.filePath);
        if (isSupportedFile(change.filePath)) {
          pathsToParse.push(change.filePath);
        }
        break;
    }
  }

  // 1a. For truly removed files: clean up ALL edges (outgoing + inbound) and symbols.
  //     Inbound edges must be deleted BEFORE symbols so the subquery can resolve target IDs.
  for (const filePath of pathsRemoved) {
    store.deleteEdgesTargetingFile(filePath);
    store.deleteEdgesByFile(filePath);
    store.deleteSymbolsByFile(filePath);
  }

  // 1b. For modified files: clean outgoing edges and symbols (will be re-created).
  //     Inbound edges from other files are preserved — their target IDs remain valid
  //     when the symbol's deterministic hash doesn't change (common case).
  for (const filePath of pathsToRefresh) {
    store.deleteEdgesByFile(filePath);
    store.deleteSymbolsByFile(filePath);
  }

  // 2. Parse changed/added files
  const parseResults = parseFiles(pathsToParse, rootPath);

  const parsedFiles: ParsedFile[] = [];
  const errors: Array<{ filePath: string; error: string }> = [];

  for (const result of parseResults) {
    if (result.parsed) {
      parsedFiles.push(result.parsed);
    } else if (result.error) {
      errors.push({ filePath: result.filePath, error: result.error });
    }
  }

  // 3. Extract relationships for changed files
  const relationships = extractRelationships(parsedFiles, rootPath);

  // 4. Collect symbols from changed files
  const allSymbols: Symbol[] = [];
  for (const file of parsedFiles) {
    allSymbols.push(...file.symbols);
  }

  // 5. Upsert symbols
  if (allSymbols.length > 0) {
    store.upsertSymbols(allSymbols);
  }

  // 6. Upsert edges
  if (relationships.length > 0) {
    store.upsertEdges(relationships);
  }

  // Count files that were only deleted (not re-parsed)
  const deletedOnly = changes.filter((c) => c.status === "deleted").length;

  return { parsedFiles, relationships, errors, deletedCount: deletedOnly };
}

// ── Main entry point ──

/**
 * Index a project: discover files, parse them, extract relationships,
 * and store everything in the knowledge graph.
 *
 * Supports incremental indexing: when a last-indexed SHA exists and `full`
 * is not set, only files changed since that SHA are processed. Falls back
 * to full indexing when git metadata is unavailable or the SHA is missing.
 *
 * @param rootPath - Absolute path to the project root
 * @param options - Optional: dbPath, config overrides, store, or full flag
 * @returns Summary of what was indexed
 */
export function indexProject(
  rootPath: string,
  options?: IndexOptions,
): IndexResult {
  const start = performance.now();

  // 1. Load config
  const config = options?.config ?? loadConfig(rootPath);

  // 2. Open or use provided store
  const ownStore = !options?.store;
  const dbPath = options?.dbPath ?? resolveDbPath(rootPath);
  let store: GraphStore;

  if (options?.store) {
    store = options.store;
  } else {
    mkdirSync(dirname(dbPath), { recursive: true });
    store = new GraphStore(dbPath);
  }

  try {
    // 3. Decide: incremental or full?
    const forceFull = options?.full === true;
    const lastSha = store.getLastIndexedSha();
    const currentSha = getCurrentSha(rootPath);

    let useIncremental = false;
    let changes: FileChange[] | null = null;

    if (!forceFull && lastSha && currentSha) {
      // Try incremental: get changed files
      changes = getChangedFiles(rootPath, lastSha);
      if (changes !== null) {
        useIncremental = true;
      }
    }

    if (useIncremental && changes !== null) {
      // ── Incremental path ──

      // No changes since last index
      if (changes.length === 0) {
        const duration = Math.round(performance.now() - start);
        // Update SHA even if no changes (HEAD may have advanced via non-code commits)
        if (currentSha) {
          store.setLastIndexedSha(currentSha);
        }
        return {
          filesIndexed: 0,
          symbolsExtracted: 0,
          edgesCreated: 0,
          duration,
          errors: [],
          incremental: true,
          changedFiles: 0,
          deletedFiles: 0,
        };
      }

      const result = incrementalIndex(rootPath, config, store, changes);

      // Persist new SHA
      if (currentSha) {
        store.setLastIndexedSha(currentSha);
      }

      const duration = Math.round(performance.now() - start);
      return {
        filesIndexed: result.parsedFiles.length,
        symbolsExtracted: result.parsedFiles.reduce(
          (sum, f) => sum + f.symbols.length,
          0,
        ),
        edgesCreated: result.relationships.length,
        duration,
        errors: result.errors,
        incremental: true,
        changedFiles: changes.length,
        deletedFiles: result.deletedCount,
      };
    } else {
      // ── Full path ──
      const result = fullIndex(rootPath, config, store);

      // Persist SHA for subsequent incremental runs
      if (currentSha) {
        store.setLastIndexedSha(currentSha);
      }

      const allSymbols: Symbol[] = [];
      for (const file of result.parsedFiles) {
        allSymbols.push(...file.symbols);
      }

      const duration = Math.round(performance.now() - start);
      return {
        filesIndexed: result.parsedFiles.length,
        symbolsExtracted: allSymbols.length,
        edgesCreated: result.relationships.length,
        duration,
        errors: result.errors,
        incremental: false,
      };
    }
  } finally {
    if (ownStore) {
      store.close();
    }
  }
}
