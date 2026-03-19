/**
 * Kata bootstrappers for .gitignore and preferences.md
 *
 * Ensures baseline .gitignore exists with universally-correct patterns.
 * Creates an empty preferences.md template if it doesn't exist.
 * Both idempotent — non-destructive if already present.
 */

import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Patterns that are always correct regardless of project type.
 * No one ever wants these tracked.
 */
const BASELINE_PATTERNS = [
  // ── Kata runtime (not source artifacts) ──
  ".kata/activity/",
  ".kata/runtime/",
  ".kata/auto.lock",
  ".kata/debug.log",
  ".kata/metrics.json",
  ".kata/STATE.md",

  // ── OS junk ──
  ".DS_Store",
  "Thumbs.db",

  // ── Editor / IDE ──
  "*.swp",
  "*.swo",
  "*~",
  ".idea/",
  ".vscode/",
  "*.code-workspace",

  // ── Environment / secrets ──
  ".env",
  ".env.*",
  "!.env.example",

  // ── Node / JS / TS ──
  "node_modules/",
  ".next/",
  "dist/",
  "build/",

  // ── Python ──
  "__pycache__/",
  "*.pyc",
  ".venv/",
  "venv/",

  // ── Rust ──
  "target/",

  // ── Go ──
  "vendor/",

  // ── Misc build artifacts ──
  "*.log",
  "coverage/",
  ".cache/",
  "tmp/",
];

/**
 * Ensure basePath/.gitignore contains all baseline patterns.
 * Creates the file if missing; appends only missing lines if it exists.
 * Returns true if the file was created or modified, false if already complete.
 */
export function ensureGitignore(basePath: string): boolean {
  const gitignorePath = join(basePath, ".gitignore");

  let existing = "";
  if (existsSync(gitignorePath)) {
    existing = readFileSync(gitignorePath, "utf-8");
  }

  // Parse existing lines (trimmed, ignoring comments and blanks)
  const existingLines = new Set(
    existing
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );

  // Find patterns not yet present
  const missing = BASELINE_PATTERNS.filter((p) => !existingLines.has(p));

  if (missing.length === 0) return false;

  // Build the block to append
  const block = [
    "",
    "# ── Kata baseline (auto-generated) ──",
    ...missing,
    "",
  ].join("\n");

  // Ensure existing content ends with a newline before appending
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, existing + prefix + block, "utf-8");

  return true;
}

/**
 * Ensure basePath/.kata/preferences.md exists as an empty template.
 * Creates the canonical lowercase file if neither the canonical nor legacy file exists.
 * Returns true if created, false if a preferences file already exists.
 */
export function ensurePreferences(basePath: string): boolean {
  const preferencesPath = join(basePath, ".kata", "preferences.md");
  const legacyPreferencesPath = join(basePath, ".kata", "PREFERENCES.md");

  if (existsSync(preferencesPath) || existsSync(legacyPreferencesPath)) {
    return false;
  }

  // Read from the canonical template file — single source of truth.
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const templatePath = join(thisDir, "templates", "preferences.md");
  let template: string;
  try {
    template = readFileSync(templatePath, "utf-8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      // Fallback: minimal valid preferences if template file is missing (shouldn't happen).
      template = `---\nversion: 1\nworkflow:\n  mode: file\n---\n`;
    } else {
      throw error;
    }
  }

  writeFileSync(preferencesPath, template, "utf-8");
  return true;
}
