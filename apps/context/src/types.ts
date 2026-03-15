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
