/**
 * parseFile orchestrator.
 *
 * Dispatches to the correct language parser based on file extension.
 * Provides both single-file and batch parsing with graceful error handling.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ParsedFile } from "../types.js";
import { detectLanguage, getParser } from "./languages.js";

/**
 * Parse a single source file and extract its symbols.
 *
 * Detects the language from the file extension, loads source from disk
 * if not provided, and dispatches to the correct parser.
 *
 * @param filePath - Repo-relative file path
 * @param options - Optional: source text and/or root path for resolving
 * @returns ParsedFile with extracted symbols
 * @throws Error if language is unsupported or file can't be read
 */
export function parseFile(
  filePath: string,
  options?: {
    source?: string;
    rootPath?: string;
  },
): ParsedFile {
  const language = detectLanguage(filePath);
  if (!language) {
    throw new Error(`Unsupported file type: ${filePath}`);
  }

  const parser = getParser(language);
  if (!parser) {
    throw new Error(`No parser registered for language: ${language}`);
  }

  let source = options?.source;
  if (source === undefined) {
    const absPath = options?.rootPath
      ? resolve(options.rootPath, filePath)
      : filePath;
    source = readFileSync(absPath, "utf-8");
  }

  return parser(filePath, source);
}

/**
 * Result of a batch parse operation for a single file.
 */
export interface ParseResult {
  /** The parsed file (null if parsing failed) */
  parsed: ParsedFile | null;
  /** File path that was parsed */
  filePath: string;
  /** Error message if parsing failed */
  error?: string;
}

/**
 * Parse multiple source files with graceful error handling.
 *
 * Unparseable files are logged to stderr and skipped — they don't
 * crash the batch. Returns both successful results and error details.
 *
 * @param filePaths - Array of repo-relative file paths
 * @param rootPath - Absolute path to the project root (for resolving files)
 * @returns Array of parse results (one per input file)
 */
export function parseFiles(
  filePaths: string[],
  rootPath: string,
): ParseResult[] {
  const results: ParseResult[] = [];

  for (const filePath of filePaths) {
    try {
      const parsed = parseFile(filePath, { rootPath });
      results.push({ parsed, filePath });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      console.error(`[kata-context] Warning: skipping ${filePath}: ${message}`);
      results.push({ parsed: null, filePath, error: message });
    }
  }

  return results;
}

// Re-export language utilities for convenience
export { detectLanguage, getParser, isSupportedFile } from "./languages.js";
