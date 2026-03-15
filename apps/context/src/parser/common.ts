/**
 * Shared parser utilities.
 *
 * Provides deterministic symbol ID generation and helpers
 * used by all language-specific parsers.
 */

import { createHash } from "node:crypto";
import type { SymbolKind } from "../types.js";

/**
 * Generate a stable, deterministic symbol ID from its identity tuple.
 *
 * Uses SHA-256 truncated to 16 hex chars (64 bits). Collision probability
 * is negligible for single-repo scale (<100k symbols).
 *
 * @param filePath - File the symbol lives in (repo-relative)
 * @param name - Symbol name
 * @param kind - Symbol kind
 * @returns 16-char hex string
 */
export function generateSymbolId(
  filePath: string,
  name: string,
  kind: SymbolKind,
): string {
  const input = `${filePath}::${name}::${kind}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Normalize a file path to forward slashes and remove leading `./`.
 * Used to ensure consistent paths across platforms.
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Extract text content from a tree-sitter node, safely handling null.
 */
export function nodeText(
  node: { text: string } | null | undefined,
): string | null {
  return node?.text ?? null;
}

/**
 * Check if a tree-sitter node is an export wrapper.
 * Returns the inner declaration node if it is, null otherwise.
 */
export function unwrapExport(node: {
  type: string;
  namedChildren: Array<{ type: string }>;
}): { type: string } | null {
  if (node.type === "export_statement") {
    // The actual declaration is the first named child
    return node.namedChildren[0] ?? null;
  }
  return null;
}
