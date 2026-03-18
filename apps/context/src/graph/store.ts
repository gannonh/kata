/**
 * SQLite-backed knowledge graph store.
 *
 * Stores symbols (nodes) and relationships (edges) in an adjacency list model
 * with full CRUD, metadata tracking, and transaction support.
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type {
  Symbol,
  Relationship,
  SemanticQueryOptions,
  SemanticQueryResult,
  SemanticStatusRecord,
  SemanticVectorWrite,
  SemanticStoreErrorCode,
} from "../types.js";
import {
  RelationshipKind,
  SymbolKind,
  SemanticStoreError,
} from "../types.js";

// ── Schema DDL ──

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS symbols (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    line_start  INTEGER NOT NULL,
    line_end    INTEGER NOT NULL,
    signature   TEXT,
    docstring   TEXT,
    source      TEXT NOT NULL,
    exported    INTEGER NOT NULL DEFAULT 0,
    summary     TEXT,
    last_indexed_at TEXT,
    git_sha     TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_symbols_file_path ON symbols(file_path);
  CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
  CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);

  CREATE TABLE IF NOT EXISTS edges (
    source_id   TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    kind        TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    PRIMARY KEY (source_id, target_id, kind)
  );

  CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
  CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
  CREATE INDEX IF NOT EXISTS idx_edges_file_path ON edges(file_path);

  CREATE TABLE IF NOT EXISTS metadata (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS semantic_vectors (
    symbol_id   TEXT PRIMARY KEY,
    file_path   TEXT NOT NULL,
    model       TEXT NOT NULL,
    dimensions  INTEGER NOT NULL,
    vector_json TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_semantic_vectors_file_path ON semantic_vectors(file_path);
  CREATE INDEX IF NOT EXISTS idx_semantic_vectors_model ON semantic_vectors(model);

  -- FTS5 external content table for full-text search on symbols
  CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
    name,
    file_path,
    docstring,
    content=symbols,
    content_rowid=rowid
  );

  -- Triggers to keep FTS5 index in sync with symbols table
  CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
    INSERT INTO symbols_fts(rowid, name, file_path, docstring)
    VALUES (new.rowid, new.name, new.file_path, COALESCE(new.docstring, ''));
  END;

  CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
    INSERT INTO symbols_fts(symbols_fts, rowid, name, file_path, docstring)
    VALUES ('delete', old.rowid, old.name, old.file_path, COALESCE(old.docstring, ''));
  END;

  CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
    INSERT INTO symbols_fts(symbols_fts, rowid, name, file_path, docstring)
    VALUES ('delete', old.rowid, old.name, old.file_path, COALESCE(old.docstring, ''));
    INSERT INTO symbols_fts(rowid, name, file_path, docstring)
    VALUES (new.rowid, new.name, new.file_path, COALESCE(new.docstring, ''));
  END;
`;

// ── Row types (what SQLite returns) ──

interface SymbolRow {
  id: string;
  name: string;
  kind: string;
  file_path: string;
  line_start: number;
  line_end: number;
  signature: string | null;
  docstring: string | null;
  source: string;
  exported: number;
  summary: string | null;
  last_indexed_at: string | null;
  git_sha: string | null;
}

interface EdgeRow {
  source_id: string;
  target_id: string;
  kind: string;
  file_path: string;
  line_number: number;
}

interface SemanticVectorRow {
  symbol_id: string;
  file_path: string;
  model: string;
  dimensions: number;
  vector_json: string;
  updated_at: string;
}

// ── Conversion helpers ──

function rowToSymbol(row: SymbolRow): Symbol {
  const sym: Symbol = {
    id: row.id,
    name: row.name,
    kind: row.kind as SymbolKind,
    filePath: row.file_path,
    lineStart: row.line_start,
    lineEnd: row.line_end,
    signature: row.signature,
    docstring: row.docstring,
    source: row.source,
    exported: row.exported === 1,
  };
  if (row.summary != null) sym.summary = row.summary;
  if (row.last_indexed_at != null) sym.lastIndexedAt = row.last_indexed_at;
  if (row.git_sha != null) sym.gitSha = row.git_sha;
  return sym;
}

function rowToRelationship(row: EdgeRow): Relationship {
  return {
    sourceId: row.source_id,
    targetId: row.target_id,
    kind: row.kind as RelationshipKind,
    filePath: row.file_path,
    lineNumber: row.line_number,
  };
}

// ── FTS5 helpers ──

/**
 * Sanitize a user query for FTS5 MATCH syntax.
 * If the query contains FTS5 operators (* prefix at end, OR, AND, NOT, quotes),
 * pass it through as-is. Otherwise, wrap each token in double quotes to prevent
 * syntax errors from special characters (dots, hyphens, slashes, etc.).
 */
function sanitizeFtsQuery(query: string): string {
  // Pass through queries that already use FTS5 syntax
  if (/\*/.test(query) || /\b(OR|AND|NOT)\b/.test(query)) {
    return query;
  }
  // Wrap each whitespace-separated token in double quotes, escaping internal quotes
  return query
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(" ");
}

const SEMANTIC_MODEL_KEY = "semantic.vector.model";
const SEMANTIC_DIMENSIONS_KEY = "semantic.vector.dimensions";
const SEMANTIC_STATUS_KEY = "semantic.status.latest";

function parseStoredVector(vectorJson: string): number[] {
  const parsed = JSON.parse(vectorJson);
  if (!Array.isArray(parsed)) {
    throw new Error("Stored semantic vector is not an array");
  }
  return parsed.map((value) => Number(value));
}

function computeL2Distance(lhs: number[], rhs: number[]): number {
  if (lhs.length !== rhs.length) {
    throw new RangeError(
      `computeL2Distance: vector length mismatch (${lhs.length} vs ${rhs.length})`,
    );
  }

  let sum = 0;
  for (let i = 0; i < lhs.length; i += 1) {
    const delta = lhs[i]! - rhs[i]!;
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

// ── GraphStore ──

export class GraphStore {
  private db: Database.Database;
  private semanticVecLoaded: boolean;

  /**
   * Open (or create) a SQLite database at the given path.
   * Pass `:memory:` for an in-memory database (useful for tests).
   */
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_DDL);

    this.semanticVecLoaded = this.tryLoadSqliteVec();

    // Bind semantic APIs so extracted function references keep GraphStore context.
    this.upsertSemanticVectors = this.upsertSemanticVectors.bind(this);
    this.querySemanticNearest = this.querySemanticNearest.bind(this);
    this.deleteSemanticVectorsByFile = this.deleteSemanticVectorsByFile.bind(this);
    this.querySemanticVectorsByFile = this.querySemanticVectorsByFile.bind(this);
    this.countSemanticVectors = this.countSemanticVectors.bind(this);
    this.setSemanticStatus = this.setSemanticStatus.bind(this);
    this.getSemanticStatus = this.getSemanticStatus.bind(this);
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }

  private tryLoadSqliteVec(): boolean {
    try {
      sqliteVec.load(this.db);
      this.setSemanticStatus({
        status: "ok",
        phase: "extension-load",
        provider: "sqlite-vec",
        timestamp: new Date().toISOString(),
        message: "sqlite-vec extension loaded",
        retryable: false,
      });
      return true;
    } catch (error) {
      const err = new SemanticStoreError(
        "SEMANTIC_VEC_EXTENSION_LOAD_FAILED",
        "Failed to load sqlite-vec extension",
        {
          phase: "extension-load",
          retryable: false,
          cause: error,
        },
      );
      this.setSemanticStatus({
        status: "failed",
        phase: "extension-load",
        provider: "sqlite-vec",
        errorCode: err.code,
        message: err.message,
        timestamp: new Date().toISOString(),
        retryable: err.retryable,
      });
      return false;
    }
  }

  // ── Symbol CRUD ──

  /**
   * Insert or replace symbols in a single transaction.
   * Symbols are matched by `id` (deterministic hash).
   */
  upsertSymbols(symbols: Symbol[]): void {
    if (symbols.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO symbols
        (id, name, kind, file_path, line_start, line_end, signature, docstring, source, exported, summary, last_indexed_at, git_sha)
      VALUES
        (@id, @name, @kind, @filePath, @lineStart, @lineEnd, @signature, @docstring, @source, @exported, @summary, @lastIndexedAt, @gitSha)
    `);

    const runAll = this.db.transaction((syms: Symbol[]) => {
      for (const sym of syms) {
        stmt.run({
          id: sym.id,
          name: sym.name,
          kind: sym.kind,
          filePath: sym.filePath,
          lineStart: sym.lineStart,
          lineEnd: sym.lineEnd,
          signature: sym.signature ?? null,
          docstring: sym.docstring ?? null,
          source: sym.source,
          exported: sym.exported ? 1 : 0,
          summary: sym.summary ?? null,
          lastIndexedAt: sym.lastIndexedAt ?? null,
          gitSha: sym.gitSha ?? null,
        });
      }
    });

    runAll(symbols);
  }

  /** Get a symbol by its deterministic ID. Returns null if not found. */
  getSymbol(id: string): Symbol | null {
    const row = this.db
      .prepare("SELECT * FROM symbols WHERE id = ?")
      .get(id) as SymbolRow | undefined;
    return row ? rowToSymbol(row) : null;
  }

  /** Get all symbols in a given file. */
  getSymbolsByFile(filePath: string): Symbol[] {
    const rows = this.db
      .prepare("SELECT * FROM symbols WHERE file_path = ? ORDER BY line_start")
      .all(filePath) as SymbolRow[];
    return rows.map(rowToSymbol);
  }

  /** Delete all symbols for a file (used for incremental re-indexing). */
  deleteSymbolsByFile(filePath: string): number {
    // Keep semantic vectors in lifecycle parity with structural symbol deletion.
    this.deleteSemanticVectorsByFile(filePath);

    const result = this.db
      .prepare("DELETE FROM symbols WHERE file_path = ?")
      .run(filePath);
    return result.changes;
  }

  // ── Edge CRUD ──

  /**
   * Insert or replace edges in a single transaction.
   * Edges are matched by (source_id, target_id, kind).
   */
  upsertEdges(edges: Relationship[]): void {
    if (edges.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO edges
        (source_id, target_id, kind, file_path, line_number)
      VALUES
        (@sourceId, @targetId, @kind, @filePath, @lineNumber)
    `);

    const runAll = this.db.transaction((edgeList: Relationship[]) => {
      for (const edge of edgeList) {
        stmt.run({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          kind: edge.kind,
          filePath: edge.filePath,
          lineNumber: edge.lineNumber,
        });
      }
    });

    runAll(edges);
  }

  /** Delete all edges originating from a file (used for incremental re-indexing). */
  deleteEdgesByFile(filePath: string): number {
    const result = this.db
      .prepare("DELETE FROM edges WHERE file_path = ?")
      .run(filePath);
    return result.changes;
  }

  /**
   * Delete all edges targeting symbols in a file (inbound edges).
   * Must be called BEFORE deleteSymbolsByFile to resolve target IDs.
   * Prevents orphan edges when a file is deleted or renamed.
   */
  deleteEdgesTargetingFile(filePath: string): number {
    const result = this.db
      .prepare(
        "DELETE FROM edges WHERE target_id IN (SELECT id FROM symbols WHERE file_path = ?)",
      )
      .run(filePath);
    return result.changes;
  }

  // ── Semantic vector lifecycle ──

  private getSemanticVectorInvariant(): { model: string; dimensions: number } | null {
    const modelRow = this.db
      .prepare("SELECT value FROM metadata WHERE key = ?")
      .get(SEMANTIC_MODEL_KEY) as { value: string } | undefined;

    const dimensionsRow = this.db
      .prepare("SELECT value FROM metadata WHERE key = ?")
      .get(SEMANTIC_DIMENSIONS_KEY) as { value: string } | undefined;

    if (!modelRow || !dimensionsRow) {
      return null;
    }

    const dimensions = Number(dimensionsRow.value);
    if (!Number.isFinite(dimensions) || dimensions <= 0) {
      return null;
    }

    return {
      model: modelRow.value,
      dimensions,
    };
  }

  private setSemanticVectorInvariant(model: string, dimensions: number): void {
    const upsertMetadata = this.db.prepare(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
    );

    const persist = this.db.transaction(() => {
      upsertMetadata.run(SEMANTIC_MODEL_KEY, model);
      upsertMetadata.run(SEMANTIC_DIMENSIONS_KEY, String(dimensions));
    });

    persist();
  }

  private clearSemanticVectorInvariant(): void {
    const clear = this.db.prepare(
      "DELETE FROM metadata WHERE key IN (?, ?)",
    );
    clear.run(SEMANTIC_MODEL_KEY, SEMANTIC_DIMENSIONS_KEY);
  }

  private assertSemanticVectorInvariant(model: string, dimensions: number): void {
    const invariant = this.getSemanticVectorInvariant();

    if (!invariant) {
      this.setSemanticVectorInvariant(model, dimensions);
      return;
    }

    if (invariant.model !== model || invariant.dimensions !== dimensions) {
      throw new SemanticStoreError(
        "SEMANTIC_VECTOR_INVARIANT_MISMATCH",
        `Semantic vector invariant mismatch: expected ${invariant.model}/${invariant.dimensions}, received ${model}/${dimensions}`,
        {
          phase: "persist",
          retryable: false,
        },
      );
    }
  }

  upsertSemanticVectors(vectors: SemanticVectorWrite[]): void {
    if (vectors.length === 0) return;

    const first = vectors[0]!;
    this.assertSemanticVectorInvariant(first.model, first.dimensions);

    const timestamp = new Date().toISOString();

    for (const item of vectors) {
      if (item.model !== first.model || item.dimensions !== first.dimensions) {
        throw new SemanticStoreError(
          "SEMANTIC_VECTOR_INVARIANT_MISMATCH",
          `Semantic vector invariant mismatch: expected ${first.model}/${first.dimensions}, received ${item.model}/${item.dimensions}`,
          {
            phase: "persist",
            retryable: false,
          },
        );
      }

      if (item.vector.length !== item.dimensions) {
        throw new SemanticStoreError(
          "SEMANTIC_VECTOR_DIMENSION_MISMATCH",
          `Semantic vector dimension mismatch for symbol ${item.symbolId}: expected ${item.dimensions}, received ${item.vector.length}`,
          {
            phase: "persist",
            retryable: false,
          },
        );
      }
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO semantic_vectors
        (symbol_id, file_path, model, dimensions, vector_json, updated_at)
      VALUES
        (@symbolId, @filePath, @model, @dimensions, @vectorJson, @updatedAt)
    `);

    const writeBatch = this.db.transaction((items: SemanticVectorWrite[]) => {
      for (const item of items) {
        stmt.run({
          symbolId: item.symbolId,
          filePath: item.filePath,
          model: item.model,
          dimensions: item.dimensions,
          vectorJson: JSON.stringify(item.vector),
          updatedAt: timestamp,
        });
      }
    });

    writeBatch(vectors);

    this.setSemanticStatus({
      status: "ok",
      phase: "persist",
      provider: "sqlite-vec",
      timestamp,
      message: this.semanticVecLoaded
        ? "Semantic vectors persisted (sqlite-vec loaded)"
        : "Semantic vectors persisted (sqlite-vec unavailable, deterministic fallback active)",
      retryable: false,
    });
  }

  querySemanticNearest(options: SemanticQueryOptions): SemanticQueryResult[] {
    if (options.topK <= 0) return [];

    const invariant = this.getSemanticVectorInvariant();
    if (invariant) {
      if (invariant.model !== options.model) {
        throw new SemanticStoreError(
          "SEMANTIC_VECTOR_QUERY_MODEL_MISMATCH",
          `Semantic query model mismatch: expected ${invariant.model}, received ${options.model}`,
          {
            phase: "query",
            retryable: false,
          },
        );
      }

      if (invariant.dimensions !== options.queryVector.length) {
        throw new SemanticStoreError(
          "SEMANTIC_VECTOR_QUERY_DIMENSION_MISMATCH",
          `Semantic query dimension mismatch: expected ${invariant.dimensions}, received ${options.queryVector.length}`,
          {
            phase: "query",
            retryable: false,
          },
        );
      }
    }

    const rows = this.db
      .prepare(
        "SELECT * FROM semantic_vectors WHERE model = ? AND dimensions = ?",
      )
      .all(options.model, options.queryVector.length) as SemanticVectorRow[];

    if (rows.length === 0) {
      return [];
    }

    const scored = rows.map((row) => {
      const storedVector = parseStoredVector(row.vector_json);
      const distance = computeL2Distance(options.queryVector, storedVector);
      return {
        symbolId: row.symbol_id,
        filePath: row.file_path,
        model: row.model,
        dimensions: row.dimensions,
        distance,
      } satisfies SemanticQueryResult;
    });

    scored.sort((left, right) => left.distance - right.distance);

    return scored.slice(0, options.topK);
  }

  deleteSemanticVectorsByFile(filePath: string): number {
    const result = this.db
      .prepare("DELETE FROM semantic_vectors WHERE file_path = ?")
      .run(filePath);

    if (result.changes > 0 && this.countSemanticVectors() === 0) {
      this.clearSemanticVectorInvariant();
    }

    return result.changes;
  }

  querySemanticVectorsByFile(filePath: string): SemanticVectorWrite[] {
    const rows = this.db
      .prepare("SELECT * FROM semantic_vectors WHERE file_path = ? ORDER BY symbol_id")
      .all(filePath) as SemanticVectorRow[];

    return rows.map((row) => ({
      symbolId: row.symbol_id,
      filePath: row.file_path,
      model: row.model,
      dimensions: row.dimensions,
      vector: parseStoredVector(row.vector_json),
    }));
  }

  countSemanticVectors(): number {
    return (
      this.db.prepare("SELECT COUNT(*) as cnt FROM semantic_vectors").get() as {
        cnt: number;
      }
    ).cnt;
  }

  setSemanticStatus(status: SemanticStatusRecord): void {
    this.db
      .prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)")
      .run(SEMANTIC_STATUS_KEY, JSON.stringify(status));
  }

  getSemanticStatus(): SemanticStatusRecord {
    const row = this.db
      .prepare("SELECT value FROM metadata WHERE key = ?")
      .get(SEMANTIC_STATUS_KEY) as { value: string } | undefined;

    if (!row) {
      return {
        status: "unknown",
        phase: "persist",
        provider: "none",
        timestamp: new Date().toISOString(),
        retryable: false,
      };
    }

    return JSON.parse(row.value) as SemanticStatusRecord;
  }

  // ── Metadata ──

  /** Get the last indexed git SHA. Returns null if never indexed. */
  getLastIndexedSha(): string | null {
    const row = this.db
      .prepare("SELECT value FROM metadata WHERE key = 'last_indexed_sha'")
      .get() as { value: string } | undefined;
    return row?.value ?? null;
  }

  /** Set the last indexed git SHA. */
  setLastIndexedSha(sha: string): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_indexed_sha', ?)",
      )
      .run(sha);
  }

  // ── FTS5 Search ──

  /**
   * Full-text search on symbol names, file paths, and docstrings.
   * Uses FTS5 MATCH with BM25 relevance ranking.
   *
   * @param query - FTS5 query string (supports prefix matching with *)
   * @param options - Optional limit and kind filter
   */
  ftsSearch(
    query: string,
    options?: { limit?: number; kind?: SymbolKind },
  ): Symbol[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const limit = options?.limit ?? 20;

    // Sanitize query: if it doesn't already contain FTS5 operators (* OR AND NOT),
    // wrap tokens in double quotes to prevent syntax errors from dots, hyphens, etc.
    const ftsQuery = sanitizeFtsQuery(trimmed);

    if (options?.kind) {
      const rows = this.db
        .prepare(
          `SELECT s.* FROM symbols s
           JOIN symbols_fts fts ON s.rowid = fts.rowid
           WHERE symbols_fts MATCH ?
             AND s.kind = ?
           ORDER BY bm25(symbols_fts)
           LIMIT ?`,
        )
        .all(ftsQuery, options.kind, limit) as SymbolRow[];
      return rows.map(rowToSymbol);
    }

    const rows = this.db
      .prepare(
        `SELECT s.* FROM symbols s
         JOIN symbols_fts fts ON s.rowid = fts.rowid
         WHERE symbols_fts MATCH ?
         ORDER BY bm25(symbols_fts)
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as SymbolRow[];
    return rows.map(rowToSymbol);
  }

  // ── Edge Queries ──

  /** Get all edges originating from a symbol (outgoing relationships). */
  getEdgesFrom(symbolId: string): Relationship[] {
    const rows = this.db
      .prepare("SELECT * FROM edges WHERE source_id = ?")
      .all(symbolId) as EdgeRow[];
    return rows.map(rowToRelationship);
  }

  /** Get all edges pointing to a symbol (incoming relationships). */
  getEdgesTo(symbolId: string): Relationship[] {
    const rows = this.db
      .prepare("SELECT * FROM edges WHERE target_id = ?")
      .all(symbolId) as EdgeRow[];
    return rows.map(rowToRelationship);
  }

  /**
   * Batch-count incoming and outgoing edges for a set of symbol IDs.
   * Returns a Map from symbolId → { incoming, outgoing }.
   * Uses two aggregating queries instead of 2N individual queries.
   */
  getEdgeCountsBatch(
    symbolIds: string[],
  ): Map<string, { incoming: number; outgoing: number }> {
    const result = new Map<string, { incoming: number; outgoing: number }>();
    for (const id of symbolIds) {
      result.set(id, { incoming: 0, outgoing: 0 });
    }
    if (symbolIds.length === 0) return result;

    // Build placeholders for IN clause
    const placeholders = symbolIds.map(() => "?").join(",");

    // Count outgoing edges (source_id IN ids)
    const outRows = this.db
      .prepare(
        `SELECT source_id, COUNT(*) AS cnt FROM edges WHERE source_id IN (${placeholders}) GROUP BY source_id`,
      )
      .all(...symbolIds) as { source_id: string; cnt: number }[];
    for (const row of outRows) {
      const entry = result.get(row.source_id);
      if (entry) entry.outgoing = row.cnt;
    }

    // Count incoming edges (target_id IN ids)
    const inRows = this.db
      .prepare(
        `SELECT target_id, COUNT(*) AS cnt FROM edges WHERE target_id IN (${placeholders}) GROUP BY target_id`,
      )
      .all(...symbolIds) as { target_id: string; cnt: number }[];
    for (const row of inRows) {
      const entry = result.get(row.target_id);
      if (entry) entry.incoming = row.cnt;
    }

    return result;
  }

  // ── Stats ──

  /** Get summary counts of the graph contents. */
  getStats(): { symbols: number; edges: number; files: number } {
    const symbolCount = (
      this.db.prepare("SELECT COUNT(*) as cnt FROM symbols").get() as {
        cnt: number;
      }
    ).cnt;
    const edgeCount = (
      this.db.prepare("SELECT COUNT(*) as cnt FROM edges").get() as {
        cnt: number;
      }
    ).cnt;
    const fileCount = (
      this.db
        .prepare("SELECT COUNT(DISTINCT file_path) as cnt FROM symbols")
        .get() as { cnt: number }
    ).cnt;

    return { symbols: symbolCount, edges: edgeCount, files: fileCount };
  }
}
