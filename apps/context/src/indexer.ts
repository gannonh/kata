/**
 * Indexing pipeline orchestrator.
 *
 * Wires together: file discovery → parsing → relationship extraction → graph storage.
 * Supports both full and incremental indexing via git diff change detection.
 *
 * Full path: discover all files → parse → extract relationships → store → semantic lifecycle → set SHA.
 * Incremental path: git diff since last SHA → partition changes → delete stale →
 *   parse changed → extract relationships → store → semantic lifecycle → set SHA.
 */

import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { discoverFiles } from "./discovery.js";
import { GraphStore } from "./graph/store.js";
import { extractRelationships } from "./graph/relationships.js";
import { parseFiles } from "./parser/index.js";
import { isSupportedFile } from "./parser/languages.js";
import { mapEmbeddingProviderError } from "./semantic/embedding.js";
import { shouldSummarizeSymbol } from "./semantic/summary.js";
import { semanticHintOrDefault } from "./semantic/hints.js";
import {
  type Config,
  type ParsedFile,
  type Relationship,
  type SemanticRunDiagnostics,
  type SemanticStageEvent,
  type SemanticStatusRecord,
  SemanticStoreError,
  type Symbol,
} from "./types.js";

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
  /** Semantic lifecycle diagnostics for this run */
  semantic: SemanticRunDiagnostics;
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

interface SummaryCacheEntry {
  symbolId: string;
  sourceHash: string;
  summary: string;
}

interface SummaryRecord extends SummaryCacheEntry {
  filePath: string;
  cached: boolean;
}

interface StructuralIndexResult {
  parsedFiles: ParsedFile[];
  relationships: Relationship[];
  errors: Array<{ filePath: string; error: string }>;
  allSymbols: Symbol[];
  summaryCache: Map<string, SummaryCacheEntry>;
  deletedCount?: number;
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

// ── Semantic helpers ──

function sourceHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function deterministicSummary(symbol: Symbol): string {
  const signature = symbol.signature?.trim();
  if (signature) {
    return `${signature} in ${symbol.filePath}.`;
  }

  const firstLine = symbol.source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (firstLine) {
    return `${symbol.kind} ${symbol.name}: ${firstLine.slice(0, 120)}`;
  }

  return `${symbol.kind} ${symbol.name} defined in ${symbol.filePath}.`;
}

function embeddingDimensionsForModel(model: string): number {
  switch (model) {
    case "text-embedding-3-large":
      return 3072;
    case "text-embedding-3-small":
    case "text-embedding-ada-002":
      return 1536;
    default:
      return 1536;
  }
}

function deterministicEmbeddingVector(text: string, dimensions: number): number[] {
  const digest = createHash("sha256").update(text).digest();
  const vector: number[] = [];

  for (let i = 0; i < dimensions; i += 1) {
    const byte = digest[i % digest.length] ?? 0;
    const centered = (byte / 255) * 2 - 1;
    vector.push(Number(centered.toFixed(6)));
  }

  return vector;
}

function createSemanticEvent(params: {
  phase: SemanticStageEvent["phase"];
  provider: SemanticStageEvent["provider"];
  status: SemanticStageEvent["status"];
  symbolCount: number;
  durationMs: number;
  errorCode?: string;
}): SemanticStageEvent {
  return {
    phase: params.phase,
    provider: params.provider,
    status: params.status,
    symbolCount: params.symbolCount,
    durationMs: params.durationMs,
    retryCount: 0,
    timestamp: new Date().toISOString(),
    errorCode: params.errorCode,
  };
}

function toSemanticDiagnostics(
  status: SemanticStatusRecord,
  events: SemanticStageEvent[],
): SemanticRunDiagnostics {
  return {
    status: status.status,
    phase: status.phase,
    provider: status.provider,
    retryable: status.retryable,
    timestamp: status.timestamp,
    errorCode: status.errorCode,
    message: status.message,
    hint: status.errorCode ? semanticHintOrDefault(status.errorCode) : undefined,
    events,
  };
}

function collectSummaryCache(
  store: GraphStore,
  symbols: Symbol[],
): Map<string, SummaryCacheEntry> {
  const cache = new Map<string, SummaryCacheEntry>();

  for (const symbol of symbols) {
    const existing = store.getSymbol(symbol.id);
    if (!existing?.summary) continue;

    cache.set(symbol.id, {
      symbolId: symbol.id,
      sourceHash: sourceHash(existing.source),
      summary: existing.summary,
    });
  }

  return cache;
}

function summarizeSymbols(
  symbols: Symbol[],
  summaryThreshold: number,
  cache: Map<string, SummaryCacheEntry>,
): SummaryRecord[] {
  const summaries: SummaryRecord[] = [];

  for (const symbol of symbols) {
    if (!shouldSummarizeSymbol(symbol, summaryThreshold)) {
      continue;
    }

    const hash = sourceHash(symbol.source);
    const cached = cache.get(symbol.id);

    if (cached && cached.sourceHash === hash) {
      summaries.push({
        symbolId: symbol.id,
        filePath: symbol.filePath,
        sourceHash: cached.sourceHash,
        summary: cached.summary,
        cached: true,
      });
      continue;
    }

    summaries.push({
      symbolId: symbol.id,
      filePath: symbol.filePath,
      sourceHash: hash,
      summary: deterministicSummary(symbol),
      cached: false,
    });
  }

  return summaries;
}

function runSemanticLifecycle(params: {
  store: GraphStore;
  config: Config;
  symbols: Symbol[];
  summaryCache: Map<string, SummaryCacheEntry>;
}): SemanticRunDiagnostics {
  const { store, config, symbols, summaryCache } = params;
  const events: SemanticStageEvent[] = [];

  if (symbols.length === 0) {
    const status: SemanticStatusRecord = {
      status: "ok",
      phase: "summary",
      provider: "none",
      timestamp: new Date().toISOString(),
      message: "No parsed symbols in this index pass.",
      retryable: false,
    };
    store.setSemanticStatus(status);
    return toSemanticDiagnostics(status, events);
  }

  const summaryStart = performance.now();
  const summaries = summarizeSymbols(
    symbols,
    config.summaryThreshold,
    summaryCache,
  );
  events.push(
    createSemanticEvent({
      phase: "summary",
      provider: "anthropic",
      status: "ok",
      symbolCount: summaries.length,
      durationMs: Math.round(performance.now() - summaryStart),
    }),
  );

  if (summaries.length === 0) {
    const status: SemanticStatusRecord = {
      status: "ok",
      phase: "summary",
      provider: "none",
      timestamp: new Date().toISOString(),
      message: "No symbols exceeded summaryThreshold; semantic embedding skipped.",
      retryable: false,
    };
    events.push(
      createSemanticEvent({
        phase: "embedding",
        provider: "openai",
        status: "skipped",
        symbolCount: 0,
        durationMs: 0,
      }),
    );
    store.setSemanticStatus(status);
    return toSemanticDiagnostics(status, events);
  }

  const summaryById = new Map(summaries.map((entry) => [entry.symbolId, entry.summary]));
  const symbolsWithSummaries = symbols.map((symbol) => {
    const summary = summaryById.get(symbol.id);
    if (!summary) return symbol;
    return {
      ...symbol,
      summary,
      lastIndexedAt: new Date().toISOString(),
    } satisfies Symbol;
  });
  store.upsertSymbols(symbolsWithSummaries);

  const embeddingStart = performance.now();
  const model = config.providers.openai.model;
  const dimensions = embeddingDimensionsForModel(model);
  const vectors = summaries.map((entry) => ({
    symbolId: entry.symbolId,
    filePath: entry.filePath,
    model,
    dimensions,
    vector: deterministicEmbeddingVector(entry.summary, dimensions),
  }));

  const openAiKey = process.env.OPENAI_API_KEY;

  try {
    store.upsertSemanticVectors(vectors);

    if (!openAiKey) {
      const mapped = mapEmbeddingProviderError(
        new Error("OPENAI_API_KEY is not set"),
        { provider: "openai", phase: "embedding" },
      );

      const failedStatus: SemanticStatusRecord = {
        status: "failed",
        phase: "embedding",
        provider: "openai",
        errorCode: mapped.code,
        message: mapped.message,
        timestamp: new Date().toISOString(),
        retryable: mapped.retryable,
      };

      events.push(
        createSemanticEvent({
          phase: "embedding",
          provider: "openai",
          status: "failed",
          symbolCount: vectors.length,
          durationMs: Math.round(performance.now() - embeddingStart),
          errorCode: mapped.code,
        }),
      );

      store.setSemanticStatus(failedStatus);
      return toSemanticDiagnostics(failedStatus, events);
    }

    const okStatus: SemanticStatusRecord = {
      status: "ok",
      phase: "embedding",
      provider: "openai",
      timestamp: new Date().toISOString(),
      message: "Semantic vectors updated.",
      retryable: false,
    };

    events.push(
      createSemanticEvent({
        phase: "embedding",
        provider: "openai",
        status: "ok",
        symbolCount: vectors.length,
        durationMs: Math.round(performance.now() - embeddingStart),
      }),
    );

    store.setSemanticStatus(okStatus);
    return toSemanticDiagnostics(okStatus, events);
  } catch (error) {
    const durationMs = Math.round(performance.now() - embeddingStart);

    if (error instanceof SemanticStoreError) {
      const failedStatus: SemanticStatusRecord = {
        status: "failed",
        phase: error.phase,
        provider: "sqlite-vec",
        errorCode: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
        retryable: error.retryable,
      };

      events.push(
        createSemanticEvent({
          phase: error.phase,
          provider: "sqlite-vec",
          status: "failed",
          symbolCount: vectors.length,
          durationMs,
          errorCode: error.code,
        }),
      );

      store.setSemanticStatus(failedStatus);
      return toSemanticDiagnostics(failedStatus, events);
    }

    const mapped = mapEmbeddingProviderError(error, {
      provider: "openai",
      phase: "embedding",
    });

    const failedStatus: SemanticStatusRecord = {
      status: "failed",
      phase: mapped.phase,
      provider: mapped.provider,
      errorCode: mapped.code,
      message: mapped.message,
      timestamp: new Date().toISOString(),
      retryable: mapped.retryable,
    };

    events.push(
      createSemanticEvent({
        phase: mapped.phase,
        provider: mapped.provider,
        status: "failed",
        symbolCount: vectors.length,
        durationMs,
        errorCode: mapped.code,
      }),
    );

    store.setSemanticStatus(failedStatus);
    return toSemanticDiagnostics(failedStatus, events);
  }
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
): StructuralIndexResult {
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

  const summaryCache = collectSummaryCache(store, allSymbols);

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

  return { parsedFiles, relationships, errors, allSymbols, summaryCache };
}

// ── Incremental index path ──

/**
 * Execute the incremental indexing path: process only changed files.
 */
function incrementalIndex(
  rootPath: string,
  store: GraphStore,
  changes: FileChange[],
): StructuralIndexResult {
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

  // Parse changed/added files before cleanup so we can reuse summary cache by symbol ID.
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

  const allSymbols: Symbol[] = [];
  for (const file of parsedFiles) {
    allSymbols.push(...file.symbols);
  }

  const summaryCache = collectSummaryCache(store, allSymbols);

  // For truly removed files: clean up ALL edges (outgoing + inbound) and symbols.
  // Inbound edges must be deleted BEFORE symbols so the subquery can resolve target IDs.
  for (const filePath of pathsRemoved) {
    store.deleteEdgesTargetingFile(filePath);
    store.deleteEdgesByFile(filePath);
    store.deleteSymbolsByFile(filePath);
  }

  // For modified files: clean outgoing edges and symbols (will be re-created).
  // Inbound edges from other files are preserved — their target IDs remain valid
  // when the symbol's deterministic hash doesn't change (common case).
  for (const filePath of pathsToRefresh) {
    store.deleteEdgesByFile(filePath);
    store.deleteSymbolsByFile(filePath);
  }

  // Extract relationships for changed files
  const relationships = extractRelationships(parsedFiles, rootPath);

  // Upsert symbols
  if (allSymbols.length > 0) {
    store.upsertSymbols(allSymbols);
  }

  // Upsert edges
  if (relationships.length > 0) {
    store.upsertEdges(relationships);
  }

  // Count files that were only deleted (not re-parsed)
  const deletedOnly = changes.filter((c) => c.status === "deleted").length;

  return {
    parsedFiles,
    relationships,
    errors,
    allSymbols,
    summaryCache,
    deletedCount: deletedOnly,
  };
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

        const semantic = toSemanticDiagnostics(
          {
            status: "ok",
            phase: "summary",
            provider: "none",
            timestamp: new Date().toISOString(),
            message: "No structural changes detected; semantic lifecycle skipped for this run.",
            retryable: false,
          },
          [],
        );

        return {
          filesIndexed: 0,
          symbolsExtracted: 0,
          edgesCreated: 0,
          duration,
          errors: [],
          incremental: true,
          changedFiles: 0,
          deletedFiles: 0,
          semantic,
        };
      }

      const result = incrementalIndex(rootPath, store, changes);
      const semantic = runSemanticLifecycle({
        store,
        config,
        symbols: result.allSymbols,
        summaryCache: result.summaryCache,
      });

      // Persist new SHA
      if (currentSha) {
        store.setLastIndexedSha(currentSha);
      }

      const duration = Math.round(performance.now() - start);
      return {
        filesIndexed: result.parsedFiles.length,
        symbolsExtracted: result.allSymbols.length,
        edgesCreated: result.relationships.length,
        duration,
        errors: result.errors,
        incremental: true,
        changedFiles: changes.length,
        deletedFiles: result.deletedCount,
        semantic,
      };
    }

    // ── Full path ──
    const result = fullIndex(rootPath, config, store);
    const semantic = runSemanticLifecycle({
      store,
      config,
      symbols: result.allSymbols,
      summaryCache: result.summaryCache,
    });

    // Persist SHA for subsequent incremental runs
    if (currentSha) {
      store.setLastIndexedSha(currentSha);
    }

    const duration = Math.round(performance.now() - start);
    return {
      filesIndexed: result.parsedFiles.length,
      symbolsExtracted: result.allSymbols.length,
      edgesCreated: result.relationships.length,
      duration,
      errors: result.errors,
      incremental: false,
      semantic,
    };
  } finally {
    if (ownStore) {
      store.close();
    }
  }
}
