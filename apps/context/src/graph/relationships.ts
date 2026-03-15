/**
 * Relationship extraction orchestrator.
 *
 * Dispatches to language-specific extractors (TypeScript, Python)
 * and merges all cross-file relationships into a single array.
 */

import type { ParsedFile, Relationship } from "../types.js";
import { extractTsRelationships } from "./ts-relationships.js";
import { extractPyRelationships } from "./py-relationships.js";

/**
 * Extract all cross-file relationships from a set of parsed files.
 *
 * Dispatches to language-specific extractors based on what languages
 * are present in the parsed files. Each extractor receives the full
 * set of parsed files (for cross-language symbol lookup) but only
 * processes files of its own language.
 *
 * @param parsedFiles - All successfully parsed files
 * @param rootPath - Absolute path to the project root
 * @returns Merged array of all cross-file relationships
 */
export function extractRelationships(
  parsedFiles: ParsedFile[],
  rootPath: string,
): Relationship[] {
  const hasTs = parsedFiles.some((f) => f.language === "typescript");
  const hasPy = parsedFiles.some((f) => f.language === "python");

  const relationships: Relationship[] = [];

  if (hasTs) {
    relationships.push(...extractTsRelationships(parsedFiles, rootPath));
  }

  if (hasPy) {
    relationships.push(...extractPyRelationships(parsedFiles, rootPath));
  }

  return relationships;
}
