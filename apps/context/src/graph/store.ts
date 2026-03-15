/**
 * SQLite-backed knowledge graph store.
 *
 * Stores symbols (nodes) and relationships (edges) in an adjacency list model
 * with full CRUD, metadata tracking, and transaction support.
 */

import Database from "better-sqlite3";
import type { Symbol, Relationship } from "../types.js";
import { RelationshipKind, SymbolKind } from "../types.js";

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

// ── GraphStore ──

export class GraphStore {
  private db: Database.Database;

  /**
   * Open (or create) a SQLite database at the given path.
   * Pass `:memory:` for an in-memory database (useful for tests).
   */
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_DDL);
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
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
}
