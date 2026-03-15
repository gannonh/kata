/**
 * Language registry.
 *
 * Maps file extensions to parser functions. Adding a new language
 * is a matter of adding an entry here + the grammar dependency.
 */

import type { Language, ParsedFile } from "../types.js";
import { parseTypeScript } from "./typescript.js";
import { parsePython } from "./python.js";

// ── Parser function type ──

export type ParserFn = (filePath: string, source: string) => ParsedFile;

// ── Registry entry ──

export interface LanguageEntry {
  /** Language identifier */
  language: Language;
  /** File extensions that map to this language (without leading dot) */
  extensions: string[];
  /** Parser function */
  parser: ParserFn;
}

// ── Registry ──

const registry: LanguageEntry[] = [
  {
    language: "typescript",
    extensions: ["ts", "tsx"],
    parser: parseTypeScript,
  },
  {
    language: "python",
    extensions: ["py"],
    parser: parsePython,
  },
];

// ── Lookup caches ──

/** Extension → Language lookup */
const extToLanguage = new Map<string, Language>();

/** Language → ParserFn lookup */
const langToParser = new Map<Language, ParserFn>();

// Build lookups on load
for (const entry of registry) {
  langToParser.set(entry.language, entry.parser);
  for (const ext of entry.extensions) {
    extToLanguage.set(ext, entry.language);
  }
}

// ── Public API ──

/**
 * Detect language from a file extension.
 *
 * @param filePath - File path or just the extension
 * @returns Language identifier or null if unrecognized
 */
export function detectLanguage(filePath: string): Language | null {
  const ext = filePath.includes(".")
    ? filePath.split(".").pop()!.toLowerCase()
    : filePath.toLowerCase();
  return extToLanguage.get(ext) ?? null;
}

/**
 * Get the parser function for a language.
 *
 * @param language - Language identifier
 * @returns Parser function or null if no parser registered
 */
export function getParser(language: Language): ParserFn | null {
  return langToParser.get(language) ?? null;
}

/**
 * Get all known file extensions across all registered languages.
 */
export function knownExtensions(): string[] {
  return [...extToLanguage.keys()];
}

/**
 * Get all registered language identifiers.
 */
export function registeredLanguages(): Language[] {
  return registry.map((e) => e.language);
}

/**
 * Check if a file extension is recognized as a parseable language.
 */
export function isSupportedFile(filePath: string): boolean {
  return detectLanguage(filePath) !== null;
}
