/**
 * Kata Onboarding — Project Setup Wizard
 *
 * Provides:
 * - `isProjectConfigured(basePath)` — check if .kata/preferences.md exists with linear config
 * - `runOnboarding(ctx)` — interactive wizard to collect LINEAR_API_KEY and create .kata/
 * - `shouldSkipOnboarding()` / `setSkipOnboarding()` — session-scoped skip flag
 *
 * The wizard:
 * 1. Guards non-TTY environments (returns "skipped" with warning)
 * 2. Prompts for LINEAR_API_KEY via ctx.ui.input (masked)
 * 3. Validates via LinearClient.getViewer() (one retry on failure)
 * 4. Stores key in auth.json via AuthStorage
 * 5. Creates .kata/preferences.md from template + ensures .gitignore
 * 6. Hydrates process.env.LINEAR_API_KEY for same-session use
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadEffectiveKataPreferences } from "./preferences.js";
import { ensurePreferences, ensureGitignore } from "./gitignore.js";

// ─── Session-scoped skip flag ─────────────────────────────────────────────────

let onboardingSkipped = false;

export function shouldSkipOnboarding(): boolean {
  return onboardingSkipped;
}

export function setSkipOnboarding(skip: boolean = true): void {
  onboardingSkipped = skip;
}

/**
 * Reset the skip flag. Exposed for testing only.
 * @internal
 */
export function _resetSkipFlag(): void {
  onboardingSkipped = false;
}

// ─── Project configuration check ─────────────────────────────────────────────

/**
 * Returns true if the project at `basePath` has a `.kata/preferences.md`
 * file AND has either `linear.teamKey` or `linear.projectSlug` set.
 */
export function isProjectConfigured(basePath: string): boolean {
  const preferencesPath = join(basePath, ".kata", "preferences.md");
  const legacyPath = join(basePath, ".kata", "PREFERENCES.md");

  if (!existsSync(preferencesPath) && !existsSync(legacyPath)) {
    return false;
  }

  const loaded = loadEffectiveKataPreferences(basePath);
  if (!loaded) return false;

  const linear = loaded.preferences.linear;
  if (!linear) return false;

  return !!(linear.teamKey || linear.projectSlug || linear.teamId || linear.projectId);
}

// ─── Dependencies (injectable for testing) ────────────────────────────────────

export interface AuthStorageLike {
  get: (provider: string) => { type: string; key: string } | undefined;
  has: (provider: string) => boolean;
  set: (provider: string, cred: { type: string; key: string }) => void;
}

export interface OnboardingDeps {
  getAuthFilePath: () => string;
  createAuthStorage: (path: string) => AuthStorageLike;
  createLinearClient: (apiKey: string) => {
    getViewer: () => Promise<{ id: string; name: string; email: string }>;
    listTeams: () => Promise<Array<{ id: string; key: string; name: string }>>;
    listProjects: (opts?: { teamId?: string }) => Promise<Array<{ id: string; name: string; slugId: string }>>;
  };
  ensurePreferences: (basePath: string) => boolean;
  ensureGitignore: (basePath: string) => boolean;
}

let _deps: OnboardingDeps | null = null;

/**
 * Override dependencies for testing. Pass null to reset to defaults.
 * @internal
 */
export function _setDeps(deps: OnboardingDeps | null): void {
  _deps = deps;
}

async function getDeps(): Promise<OnboardingDeps> {
  if (_deps) return _deps;

  const authFilePath = join(homedir(), ".kata-cli", "agent", "auth.json");
  const { AuthStorage } = await import("@mariozechner/pi-coding-agent");
  const { LinearClient } = await import("../linear/linear-client.js");

  return {
    getAuthFilePath: () => authFilePath,
    createAuthStorage: (path: string) => AuthStorage.create(path),
    createLinearClient: (apiKey: string) => new LinearClient(apiKey),
    ensurePreferences,
    ensureGitignore,
  };
}

// ─── Linear team & project picker ─────────────────────────────────────────────

export interface LinearPickerResult {
  teamKey: string;
  projectSlug: string;
}

/**
 * Fetch teams and projects from the Linear API and present interactive pickers.
 * Returns `{ teamKey, projectSlug }` on success, or `null` if the user cancels
 * or both API calls fail and manual entry is cancelled.
 *
 * - Single-team accounts auto-select without prompting.
 * - Single-project teams auto-select without prompting.
 * - API failures fall back to manual `ctx.ui.input` entry.
 */
export async function pickLinearTeamAndProject(
  ctx: ExtensionCommandContext,
  apiKey: string,
): Promise<LinearPickerResult | null> {
  const deps = await getDeps();
  const client = deps.createLinearClient(apiKey);

  // ── Team selection ──────────────────────────────────────────────────────
  let teamKey: string;
  let teamId: string;

  try {
    const teams = await client.listTeams();

    if (teams.length === 0) {
      ctx.ui.notify("No teams found in your Linear workspace.", "warning");
      return manualLinearEntry(ctx);
    }

    if (teams.length === 1) {
      const team = teams[0];
      ctx.ui.notify(`Auto-selected team: ${team.name} (${team.key})`, "info");
      teamKey = team.key;
      teamId = team.id;
    } else {
      // Team keys are unique in Linear, so labels are inherently unique.
      const teamLabelMap = new Map(teams.map((t) => [`${t.name} (${t.key})`, t]));
      const teamOptions = Array.from(teamLabelMap.keys());
      const selected = await ctx.ui.select("Select your Linear team", teamOptions);
      if (!selected) return null;

      const team = teamLabelMap.get(selected);
      if (!team) return null;
      teamKey = team.key;
      teamId = team.id;
    }
  } catch (err) {
    ctx.ui.notify(
      `Could not fetch teams from Linear — entering manually. (${err instanceof Error ? err.message : String(err)})`,
      "warning",
    );
    return manualLinearEntry(ctx);
  }

  // ── Project selection ───────────────────────────────────────────────────
  let projectSlug: string;

  try {
    const projects = await client.listProjects({ teamId });

    if (projects.length === 0) {
      ctx.ui.notify("No projects found for this team.", "warning");
      return manualProjectEntry(ctx, teamKey);
    }

    if (projects.length === 1) {
      const project = projects[0];
      ctx.ui.notify(`Auto-selected project: ${project.name}`, "info");
      projectSlug = project.slugId;
    } else {
      // Build labels that are guaranteed unique: append slugId when two projects share a name.
      const nameCounts = new Map<string, number>();
      for (const p of projects) {
        nameCounts.set(p.name, (nameCounts.get(p.name) ?? 0) + 1);
      }
      const projectLabelMap = new Map<string, (typeof projects)[number]>();
      for (const p of projects) {
        const label = (nameCounts.get(p.name) ?? 0) > 1 ? `${p.name} (${p.slugId})` : p.name;
        projectLabelMap.set(label, p);
      }
      const projectOptions = Array.from(projectLabelMap.keys());
      const selected = await ctx.ui.select("Select your Linear project", projectOptions);
      if (!selected) return null;

      const project = projectLabelMap.get(selected);
      if (!project) return null;
      projectSlug = project.slugId;
    }
  } catch (err) {
    ctx.ui.notify(
      `Could not fetch projects from Linear — entering manually. (${err instanceof Error ? err.message : String(err)})`,
      "warning",
    );
    return manualProjectEntry(ctx, teamKey);
  }

  return { teamKey, projectSlug };
}

/**
 * Fallback: prompt user to manually enter both team key and project slug.
 */
async function manualLinearEntry(
  ctx: ExtensionCommandContext,
): Promise<LinearPickerResult | null> {
  const teamKey = await ctx.ui.input("Linear team key", "e.g. KAT");
  if (!teamKey || !teamKey.trim()) return null;

  const projectSlug = await ctx.ui.input("Linear project slug", "from your project URL, e.g. 459f9835e809");
  if (!projectSlug || !projectSlug.trim()) return null;

  return { teamKey: teamKey.trim(), projectSlug: projectSlug.trim() };
}

/**
 * Fallback: prompt user to manually enter just the project slug (team was already selected).
 */
async function manualProjectEntry(
  ctx: ExtensionCommandContext,
  teamKey: string,
): Promise<LinearPickerResult | null> {
  const projectSlug = await ctx.ui.input("Linear project slug", "from your project URL, e.g. 459f9835e809");
  if (!projectSlug || !projectSlug.trim()) return null;

  return { teamKey, projectSlug: projectSlug.trim() };
}

// ─── Preferences update utility ──────────────────────────────────────────────

/**
 * Update `.kata/preferences.md` YAML frontmatter with `linear.teamKey` and
 * `linear.projectSlug`. Preserves all other frontmatter fields and the
 * markdown body below the closing `---`.
 */
export function updatePreferencesLinearConfig(
  basePath: string,
  config: LinearPickerResult,
): void {
  const preferencesPath = join(basePath, ".kata", "preferences.md");
  const legacyPath = join(basePath, ".kata", "PREFERENCES.md");

  const filePath = existsSync(preferencesPath)
    ? preferencesPath
    : existsSync(legacyPath)
      ? legacyPath
      : preferencesPath;

  const content = existsSync(filePath)
    ? readFileSync(filePath, "utf-8")
    : "---\nversion: 1\nlinear: {}\n---\n";

  const updated = replaceLinearBlock(content, config);
  writeFileSync(filePath, updated, "utf-8");
}

/**
 * Replace the `linear:` block in YAML frontmatter with the new teamKey/projectSlug.
 * Handles both `linear: {}` (empty inline) and multi-line `linear:` blocks.
 */
function replaceLinearBlock(
  content: string,
  config: LinearPickerResult,
): string {
  // Detect line ending so we can be CRLF-agnostic.
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    // No frontmatter — wrap with new frontmatter
    return `---${eol}version: 1${eol}linear:${eol}  teamKey: ${config.teamKey}${eol}  projectSlug: ${config.projectSlug}${eol}---${eol}${content}`;
  }

  const openDelim = `---${eol}`;
  const frontmatter = fmMatch[1];
  const closeDelim = "---";
  const afterFrontmatter = content.slice(fmMatch[0].length);

  // Replace the linear block (strip \r so line values are clean regardless of eol)
  const lines = frontmatter.split("\n").map((l) => l.replace(/\r$/, ""));
  const newLines: string[] = [];
  let inLinearBlock = false;
  let linearBlockReplaced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (trimmed.startsWith("linear:")) {
      inLinearBlock = true;
      linearBlockReplaced = true;

      // Check if inline (e.g. "linear: {}" or "linear: {teamKey: ...}")
      const afterColon = trimmed.slice("linear:".length).trim();
      if (afterColon && afterColon !== "") {
        // Replace the inline value
        newLines.push("linear:");
        newLines.push(`  teamKey: ${config.teamKey}`);
        newLines.push(`  projectSlug: ${config.projectSlug}`);
        inLinearBlock = false;
        continue;
      }

      // Multi-line block starts
      newLines.push("linear:");
      newLines.push(`  teamKey: ${config.teamKey}`);
      newLines.push(`  projectSlug: ${config.projectSlug}`);
      continue;
    }

    if (inLinearBlock) {
      // Skip indented lines that belong to the old linear block.
      // Blank lines end the block (they're separators between top-level keys) — preserve them.
      if (line.match(/^\s+\S/)) {
        continue;
      }
      // Blank line or non-indented line: linear block ended
      inLinearBlock = false;
    }

    newLines.push(line);
  }

  // If no linear block was found, append one
  if (!linearBlockReplaced) {
    newLines.push("linear:");
    newLines.push(`  teamKey: ${config.teamKey}`);
    newLines.push(`  projectSlug: ${config.projectSlug}`);
  }

  return `${openDelim}${newLines.join(eol)}${eol}${closeDelim}${afterFrontmatter}`;
}

// ─── API key resolution ───────────────────────────────────────────────────────

interface ResolvedKey {
  apiKey: string;
  isExisting: boolean;
}

/**
 * Resolve a Linear API key, checking for an existing stored key first.
 *
 * 1. If auth.json has a `linear` credential, validate it.
 * 2. If valid, ask the user whether to reuse it or enter a new one.
 * 3. If no stored key (or user chooses new), prompt for a fresh key.
 *
 * Returns `{ apiKey, isExisting }` on success, or `null` if the user skips.
 */
async function resolveApiKey(
  ctx: ExtensionCommandContext,
  deps: OnboardingDeps,
  authStorage: AuthStorageLike,
): Promise<ResolvedKey | null> {
  // Check for an existing stored key
  if (authStorage.has("linear")) {
    const cred = authStorage.get("linear");
    if (cred && cred.type === "api_key" && cred.key) {
      // Validate the stored key
      try {
        const client = deps.createLinearClient(cred.key);
        const viewer = await client.getViewer();

        // Key works — ask the user
        const choice = await ctx.ui.select(
          `Found existing Linear key (${viewer.name} — ${viewer.email}). Use it?`,
          ["Use existing key", "Enter a new key"],
        );

        if (choice === "Use existing key") {
          return { apiKey: cred.key, isExisting: true };
        }

        // User wants a new key — fall through to prompt
        if (choice === undefined) {
          // User cancelled the selector
          return null;
        }
      } catch {
        // Stored key is invalid or network error — fall through to prompt
        ctx.ui.notify(
          "Existing Linear key is no longer valid. Please enter a new one.",
          "warning",
        );
      }
    }
  }

  return promptForNewKey(ctx, deps);
}

/**
 * Prompt the user for a new Linear API key with validation and one retry.
 * Returns `{ apiKey, isExisting: false }` on success, or `null` if the user skips.
 */
async function promptForNewKey(
  ctx: ExtensionCommandContext,
  deps: OnboardingDeps,
): Promise<ResolvedKey | null> {
  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const input = await ctx.ui.input(
      "Linear API Key",
      "lin_api_...",
    );

    // Empty input → user wants to skip
    if (!input || !input.trim()) {
      return null;
    }

    const apiKey = input.trim();

    // Validate the key
    try {
      const client = deps.createLinearClient(apiKey);
      await client.getViewer();
      return { apiKey, isExisting: false };
    } catch (err) {
      const isAuthError =
        err instanceof Error &&
        (err.message.includes("401") ||
          err.message.includes("403") ||
          err.message.includes("Authentication") ||
          err.message.includes("Unauthorized"));

      if (isAuthError) {
        ctx.ui.notify(
          "Invalid API key — please check and try again.",
          "error",
        );
      } else {
        ctx.ui.notify(
          "Could not reach Linear API — check your connection.",
          "error",
        );
      }

      if (attempt === maxAttempts - 1) {
        ctx.ui.notify(
          "Setup cancelled after failed validation. Run /kata to try again.",
          "warning",
        );
        return null;
      }
    }
  }

  return null;
}

// ─── Onboarding wizard ───────────────────────────────────────────────────────

export type OnboardingResult = "completed" | "skipped";

/**
 * Run the onboarding wizard.
 *
 * Prompts for LINEAR_API_KEY, validates it, stores it, and creates .kata/.
 * Returns "completed" on success, "skipped" if user skips or non-TTY.
 */
export async function runOnboarding(
  ctx: ExtensionCommandContext,
  basePath: string = process.cwd(),
): Promise<OnboardingResult> {
  // Non-TTY guard
  if (!ctx.hasUI) {
    ctx.ui.notify(
      "Kata setup requires an interactive terminal. Run /kata in a TTY to configure.",
      "warning",
    );
    return "skipped";
  }

  const deps = await getDeps();
  const authPath = deps.getAuthFilePath();
  const authStorage = deps.createAuthStorage(authPath);

  // ── Check for existing Linear API key ───────────────────────────────────
  const keyResult = await resolveApiKey(ctx, deps, authStorage);
  if (!keyResult) {
    return "skipped";
  }

  const { apiKey, isExisting } = keyResult;

  // Store only if it's a new key (existing key is already in auth.json)
  if (!isExisting) {
    try {
      authStorage.set("linear", { type: "api_key", key: apiKey });
    } catch (err) {
      ctx.ui.notify(
        `Failed to store API key: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
      return "skipped";
    }
  }

  // Hydrate process.env immediately for same-session use
  process.env.LINEAR_API_KEY = apiKey;

  // Create .kata/preferences.md + ensure .gitignore
  try {
    deps.ensurePreferences(basePath);
    deps.ensureGitignore(basePath);
  } catch (err) {
    ctx.ui.notify(
      `Failed to create project config: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
    return "skipped";
  }

  // Pick Linear team and project
  const pickerResult = await pickLinearTeamAndProject(ctx, apiKey);
  if (pickerResult) {
    try {
      updatePreferencesLinearConfig(basePath, pickerResult);
      ctx.ui.notify(
        `✓ Linear configured: team=${pickerResult.teamKey}, project=${pickerResult.projectSlug}\nPreferences saved: .kata/preferences.md (edit directly or with /kata config)`,
        "info",
      );
    } catch (err) {
      ctx.ui.notify(
        `Failed to write Linear config: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }
  } else {
    ctx.ui.notify("✓ Linear API key saved. .kata/ created. Run /kata to configure team/project.", "info");
  }

  return "completed";
}
