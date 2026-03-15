/**
 * Core type definitions for Kata Context.
 *
 * These types are the foundation of the knowledge graph and are used
 * by all downstream modules: parsers, graph store, queries, CLI.
 */

// ── Symbol kinds ──

export enum SymbolKind {
  Function = "function",
  Method = "method",
  Class = "class",
  Interface = "interface",
  TypeAlias = "typeAlias",
  Enum = "enum",
  Module = "module",
  Variable = "variable",
}

// ── Relationship kinds ──

export enum RelationshipKind {
  Imports = "imports",
  Calls = "calls",
  Inherits = "inherits",
  Implements = "implements",
  References = "references",
}

// ── Symbol ──

export interface Symbol {
  /** Deterministic ID: hash of (filePath, name, kind) */
  id: string;
  /** Symbol name (e.g. "greet", "UserService", "Config") */
  name: string;
  /** What kind of symbol this is */
  kind: SymbolKind;
  /** Absolute or repo-relative file path */
  filePath: string;
  /** 1-based start line */
  lineStart: number;
  /** 1-based end line */
  lineEnd: number;
  /** Human-readable signature (e.g. "function greet(name: string): string") */
  signature: string | null;
  /** JSDoc / docstring content */
  docstring: string | null;
  /** Raw source text of the symbol */
  source: string;
  /** Whether the symbol is exported from its module */
  exported: boolean;
  /** NL summary (populated by M002 semantic pipeline) */
  summary?: string;
  /** ISO timestamp of last indexing */
  lastIndexedAt?: string;
  /** Git SHA at last indexing */
  gitSha?: string;
}

// ── Relationship ──

export interface Relationship {
  /** ID of the source symbol (the one doing the importing/calling) */
  sourceId: string;
  /** ID of the target symbol (the one being imported/called) */
  targetId: string;
  /** What kind of relationship */
  kind: RelationshipKind;
  /** File where the relationship was found */
  filePath: string;
  /** Line number where the relationship occurs */
  lineNumber: number;
}

// ── ParsedFile ──

export interface ParsedFile {
  /** File path that was parsed */
  filePath: string;
  /** Detected language */
  language: Language;
  /** Symbols extracted from this file */
  symbols: Symbol[];
  /** Relationships found within this file (cross-file resolved later) */
  relationships: Relationship[];
}

// ── Language ──

export type Language = "typescript" | "python";

// ── Config ──

export interface Config {
  /** Limit indexing to these languages; empty = auto-detect all known */
  languages: Language[];
  /** Glob patterns to exclude from file discovery */
  excludes: string[];
  /** Minimum lines for a symbol to qualify for NL summary (M002) */
  summaryThreshold: number;
  /** Enable file watcher for auto re-index (M002) */
  watch: boolean;
  /** Provider settings for M002+ features */
  providers: ProviderConfig;
}

export interface ProviderConfig {
  /** OpenAI API config for embeddings */
  openai: {
    model: string;
    batchSize: number;
  };
  /** Anthropic API config for summaries */
  anthropic: {
    model: string;
    maxTokens: number;
  };
}

// ── Query result types ──

/**
 * A symbol with its relationship context — used in dependency/dependent results.
 */
export interface SymbolWithRelations {
  /** The related symbol */
  symbol: Symbol;
  /** The kind of relationship connecting this symbol to the target */
  relationship: RelationshipKind;
  /** File where the relationship was found */
  filePath: string;
  /** Line number where the relationship occurs */
  lineNumber: number;
}

/**
 * Result of a dependents() or dependencies() query.
 */
export interface DependencyResult {
  /** The target symbol that was queried */
  symbol: Symbol;
  /** Symbols related to the target (dependents or dependencies) */
  related: SymbolWithRelations[];
}

/**
 * A symbol with its edge counts — used in symbolsInFile() results.
 */
export interface FileSymbolResult {
  /** The symbol */
  symbol: Symbol;
  /** Number of incoming edges (other symbols depend on this) */
  incomingEdges: number;
  /** Number of outgoing edges (this symbol depends on others) */
  outgoingEdges: number;
}

/**
 * Union type for all query results.
 */
export type QueryResult = DependencyResult | FileSymbolResult[];

// ── Fuzzy find result types ──

/**
 * Options for fuzzyFind().
 */
export interface FuzzyOptions {
  /** Maximum number of results to return (default: 20) */
  limit?: number;
  /** Filter results to a specific symbol kind */
  kind?: SymbolKind;
  /** Filter results to symbols within files matching this path prefix */
  fileScope?: string;
}

/**
 * A single fuzzy match result from FTS5.
 */
export interface FuzzyResult {
  /** The matched symbol */
  symbol: Symbol;
  /** BM25 relevance score (lower = more relevant in SQLite FTS5) */
  score?: number;
}

// ── Grep result types ──

/**
 * Options for grepSearch().
 */
export interface GrepOptions {
  /** File glob patterns to include (e.g. ['*.ts', '*.py']) */
  globs?: string[];
  /** Number of context lines before and after each match */
  contextLines?: number;
  /** Whether the search is case sensitive (default: true) */
  caseSensitive?: boolean;
  /** Maximum number of matches to return */
  maxResults?: number;
  /** Ripgrep file type filter (e.g. 'ts', 'py') */
  fileType?: string;
}

/**
 * A single match result from ripgrep.
 */
export interface GrepResult {
  /** Repo-relative file path */
  filePath: string;
  /** 1-based line number of the match */
  lineNumber: number;
  /** 0-based column number of the first match on the line */
  columnNumber: number;
  /** The matched text (the substring that matched the pattern) */
  matchText: string;
  /** Full content of the matching line */
  lineContent: string;
  /** Context lines before the match (when contextLines > 0) */
  contextBefore: string[];
  /** Context lines after the match (when contextLines > 0) */
  contextAfter: string[];
}

/**
 * Error returned when ripgrep is not available.
 */
export class GrepNotFoundError extends Error {
  constructor() {
    super(
      "ripgrep (rg) is not installed or not found in PATH. Install it from https://github.com/BurntSushi/ripgrep"
    );
    this.name = "GrepNotFoundError";
  }
}

// ── Default config values ──

export const DEFAULT_EXCLUDES: readonly string[] = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  "vendor",
  "coverage",
  ".cache",
  ".kata/index",
] as const;

export const DEFAULT_CONFIG: Config = {
  languages: [],
  excludes: [...DEFAULT_EXCLUDES],
  summaryThreshold: 5,
  watch: false,
  providers: {
    openai: {
      model: "text-embedding-3-small",
      batchSize: 100,
    },
    anthropic: {
      model: "claude-sonnet-4-20250514",
      maxTokens: 200,
    },
  },
};
