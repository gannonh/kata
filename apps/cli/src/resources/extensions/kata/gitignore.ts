/**
 * Kata bootstrappers for .gitignore and preferences.md
 *
 * Ensures baseline .gitignore exists with universally-correct patterns.
 * Creates an empty preferences.md template if it doesn't exist.
 * Both idempotent — non-destructive if already present.
 */

import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Patterns that are always correct regardless of project type.
 * No one ever wants these tracked.
 */
const BASELINE_PATTERNS = [
  // ── Kata runtime (not source artifacts) ──
  ".kata/activity/",
  ".kata/runtime/",
  ".kata/auto.lock",
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

  const template = `---
version: 1
workflow:
  mode: file
linear: {}
pr:
  enabled: false
  auto_create: false
  base_branch: main
  review_on_create: false
  linear_link: false
always_use_skills: []
prefer_skills: []
avoid_skills: []
skill_rules: []
custom_instructions: []
models: {}
skill_discovery: auto
auto_supervisor: {}
---

# Kata Skill Preferences

Project-specific guidance for skill selection and workflow configuration.

See \`~/.kata-cli/agent/extensions/kata/docs/preferences-reference.md\` for full field documentation and examples.

## Fields

- \`workflow.mode\`: Choose \`file\` (default) or \`linear\`
- \`linear.teamId\`: Optional Linear team UUID when a project is bound directly to a team
- \`linear.teamKey\`: Optional Linear team key (for example \`KAT\`) when you prefer stable human-readable binding
- \`linear.projectId\`: Optional Linear project UUID for the project Kata should validate against
- \`pr.enabled\`: Set to \`true\` to activate the PR lifecycle (create, review, address, merge via \`gh\` CLI)
- \`pr.auto_create\`: Set to \`true\` to automatically open a PR after each slice completes in auto-mode
- \`pr.base_branch\`: Target branch for PRs (default: \`main\`)
- \`pr.review_on_create\`: Set to \`true\` to auto-run parallel review immediately after PR creation
- \`pr.linear_link\`: Set to \`true\` to include Linear issue references in PR body (requires Linear mode)
- Keep API keys and other secrets in environment variables such as \`LINEAR_API_KEY\`, never in preferences files

## Example

\`\`\`yaml
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectId: 12345678-1234-1234-1234-1234567890ab
pr:
  enabled: true
  auto_create: true
  base_branch: main
prefer_skills:
  - verification-before-completion
custom_instructions:
  - "Use Linear as the workflow source of truth for this project"
\`\`\`
`;

  writeFileSync(preferencesPath, template, "utf-8");
  return true;
}
