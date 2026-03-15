/**
 * Indexing pipeline orchestrator.
 *
 * Wires together: file discovery → parsing → relationship extraction → graph storage.
 * This is the main entry point for indexing a project into the knowledge graph.
 */

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { discoverFiles } from "./discovery.js";
import { GraphStore } from "./graph/store.js";
import { extractRelationships } from "./graph/relationships.js";
import { parseFiles, type ParseResult } from "./parser/index.js";
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

/**
 * Index a project: discover files, parse them, extract relationships,
 * and store everything in the knowledge graph.
 *
 * @param rootPath - Absolute path to the project root
 * @param options - Optional: dbPath, config overrides, or pre-opened store
 * @returns Summary of what was indexed
 */
export function indexProject(
  rootPath: string,
  options?: IndexOptions,
): IndexResult {
  const start = performance.now();

  // 1. Load config
  const config = options?.config ?? loadConfig(rootPath);

  // 2. Discover files
  const filePaths = discoverFiles(rootPath, config);

  // 3. Parse all files
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

  // 4. Extract cross-file relationships
  const relationships = extractRelationships(parsedFiles, rootPath);

  // 5. Collect all symbols
  const allSymbols: Symbol[] = [];
  for (const file of parsedFiles) {
    allSymbols.push(...file.symbols);
  }

  // 6. Open or use provided store
  const ownStore = !options?.store;
  const dbPath = options?.dbPath ?? resolveDbPath(rootPath);
  let store: GraphStore;

  if (options?.store) {
    store = options.store;
  } else {
    // Ensure the directory exists
    mkdirSync(dirname(dbPath), { recursive: true });
    store = new GraphStore(dbPath);
  }

  try {
    // 7. Upsert symbols into the graph
    if (allSymbols.length > 0) {
      store.upsertSymbols(allSymbols);
    }

    // 8. Upsert edges into the graph
    if (relationships.length > 0) {
      store.upsertEdges(relationships);
    }
  } finally {
    // Only close if we opened it
    if (ownStore) {
      store.close();
    }
  }

  const duration = Math.round(performance.now() - start);

  return {
    filesIndexed: parsedFiles.length,
    symbolsExtracted: allSymbols.length,
    edgesCreated: relationships.length,
    duration,
    errors,
  };
}
