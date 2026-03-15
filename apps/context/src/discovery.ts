/**
 * File discovery module.
 *
 * Recursively walks a directory tree to find parseable source files,
 * respecting config excludes and language filters.
 */

import { type Dirent, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import type { Config, Language } from "./types.js";
import { detectLanguage, knownExtensions } from "./parser/languages.js";

/**
 * Discover all parseable source files under a root directory.
 *
 * Walks the directory tree recursively, skipping excluded directories
 * and filtering to known language extensions. If config.languages is
 * non-empty, only files matching those languages are returned.
 *
 * @param rootPath - Absolute path to the project root
 * @param config - Project config (for excludes and language filter)
 * @returns Array of repo-relative file paths (forward slashes)
 */
export function discoverFiles(rootPath: string, config: Config): string[] {
  const results: string[] = [];
  const excludeSet = new Set(config.excludes);

  // Build set of allowed extensions
  const allowedExtensions = buildAllowedExtensions(config.languages);

  walkDir(rootPath, rootPath, excludeSet, allowedExtensions, results);

  // Sort for deterministic output
  results.sort();
  return results;
}

/**
 * Build the set of file extensions to include.
 * If languages filter is empty, all known extensions are included.
 */
function buildAllowedExtensions(languages: Language[]): Set<string> {
  if (languages.length === 0) {
    return new Set(knownExtensions());
  }

  const allowed = new Set<string>();
  for (const lang of languages) {
    // Map language back to extensions
    for (const ext of knownExtensions()) {
      if (detectLanguage(`file.${ext}`) === lang) {
        allowed.add(ext);
      }
    }
  }
  return allowed;
}

/**
 * Recursive directory walker.
 */
function walkDir(
  currentPath: string,
  rootPath: string,
  excludeSet: Set<string>,
  allowedExtensions: Set<string>,
  results: string[],
): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(currentPath, { withFileTypes: true }) as Dirent[];
  } catch {
    // Permission denied or unreadable directory — skip silently
    return;
  }

  for (const entry of entries) {
    const name = entry.name;

    // Skip hidden directories (starting with .) other than known config dirs
    if (name.startsWith(".") && entry.isDirectory()) {
      // .kata is always excluded via default excludes
      continue;
    }

    // Skip excluded directory names
    if (entry.isDirectory() && excludeSet.has(name)) {
      continue;
    }

    const fullPath = join(currentPath, name);

    if (entry.isDirectory()) {
      walkDir(fullPath, rootPath, excludeSet, allowedExtensions, results);
      continue;
    }

    // Skip symlinks to avoid cycles
    if (entry.isSymbolicLink()) {
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) continue; // Skip directory symlinks
      } catch {
        continue; // Broken symlink
      }
    }

    // Check if file has an allowed extension
    const ext = getExtension(name);
    if (ext && allowedExtensions.has(ext)) {
      // Store as repo-relative with forward slashes
      const relPath = relative(rootPath, fullPath).replace(/\\/g, "/");
      results.push(relPath);
    }
  }
}

/**
 * Get file extension without the leading dot, lowercase.
 */
function getExtension(filename: string): string | null {
  const ext = extname(filename);
  if (!ext) return null;
  return ext.slice(1).toLowerCase();
}
