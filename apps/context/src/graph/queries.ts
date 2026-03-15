/**
 * Graph query functions: dependents, dependencies, symbolsInFile, resolveSymbol.
 *
 * These are the primary structural query surface for S03.
 * They operate on a GraphStore instance and return typed results.
 */

import type { GraphStore } from "./store.js";
import type {
  Symbol,
  DependencyResult,
  SymbolWithRelations,
  FileSymbolResult,
} from "../types.js";

// ── resolveSymbol ──

/**
 * Resolve a human-readable symbol name (or exact ID) to Symbol objects.
 *
 * Resolution order:
 * 1. Try exact ID lookup via `getSymbol(id)`.
 * 2. If not found, search by name via `ftsSearch()` with exact name match filtering.
 *
 * Returns all matching symbols (may be multiple for ambiguous names).
 * Returns empty array if no match found.
 */
export function resolveSymbol(store: GraphStore, nameOrId: string): Symbol[] {
  if (!nameOrId || !nameOrId.trim()) return [];

  const trimmed = nameOrId.trim();

  // 1. Try exact ID lookup
  const byId = store.getSymbol(trimmed);
  if (byId) return [byId];

  // 2. Search by name via FTS5, then filter to exact name matches
  // FTS5 may return partial matches, so we filter by exact name equality
  const ftsResults = store.ftsSearch(trimmed, { limit: 100 });
  const exactMatches = ftsResults.filter(
    (s) => s.name === trimmed || s.name.toLowerCase() === trimmed.toLowerCase(),
  );

  return exactMatches;
}

// ── dependents ──

/**
 * Find all symbols that depend on the given symbol (incoming edges).
 *
 * "Dependents" are symbols that import, call, reference, inherit from,
 * or implement the target symbol.
 *
 * @param store - GraphStore instance
 * @param symbolNameOrId - Symbol name or exact ID
 * @returns DependencyResult with the target and its dependents, or null if symbol not found
 */
export function dependents(
  store: GraphStore,
  symbolNameOrId: string,
): DependencyResult | null {
  const resolved = resolveSymbol(store, symbolNameOrId);
  if (resolved.length === 0) return null;

  // Use the first resolved symbol (caller can disambiguate via resolveSymbol)
  const target = resolved[0]!;

  // Get incoming edges (other symbols → this symbol)
  const incomingEdges = store.getEdgesTo(target.id);

  // Hydrate the source symbols
  const related: SymbolWithRelations[] = [];
  for (const edge of incomingEdges) {
    const sourceSymbol = store.getSymbol(edge.sourceId);
    if (sourceSymbol) {
      related.push({
        symbol: sourceSymbol,
        relationship: edge.kind,
        filePath: edge.filePath,
        lineNumber: edge.lineNumber,
      });
    }
  }

  return { symbol: target, related };
}

// ── dependencies ──

/**
 * Find all symbols that the given symbol depends on (outgoing edges).
 *
 * "Dependencies" are symbols that the target imports, calls, references,
 * inherits from, or implements.
 *
 * @param store - GraphStore instance
 * @param symbolNameOrId - Symbol name or exact ID
 * @returns DependencyResult with the target and its dependencies, or null if symbol not found
 */
export function dependencies(
  store: GraphStore,
  symbolNameOrId: string,
): DependencyResult | null {
  const resolved = resolveSymbol(store, symbolNameOrId);
  if (resolved.length === 0) return null;

  const target = resolved[0]!;

  // Get outgoing edges (this symbol → other symbols)
  const outgoingEdges = store.getEdgesFrom(target.id);

  // Hydrate the target symbols
  const related: SymbolWithRelations[] = [];
  for (const edge of outgoingEdges) {
    const targetSymbol = store.getSymbol(edge.targetId);
    if (targetSymbol) {
      related.push({
        symbol: targetSymbol,
        relationship: edge.kind,
        filePath: edge.filePath,
        lineNumber: edge.lineNumber,
      });
    }
  }

  return { symbol: target, related };
}

// ── symbolsInFile ──

/**
 * List all symbols in a file with their incoming and outgoing edge counts.
 *
 * @param store - GraphStore instance
 * @param filePath - File path to query (as stored in the graph — typically repo-relative)
 * @returns Array of symbols with edge counts, or empty array if file not found
 */
export function symbolsInFile(
  store: GraphStore,
  filePath: string,
): FileSymbolResult[] {
  const symbols = store.getSymbolsByFile(filePath);

  return symbols.map((symbol) => ({
    symbol,
    incomingEdges: store.getEdgesTo(symbol.id).length,
    outgoingEdges: store.getEdgesFrom(symbol.id).length,
  }));
}
