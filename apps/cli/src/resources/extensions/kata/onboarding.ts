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
import { existsSync } from "node:fs";
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

  return !!(linear.teamKey || linear.projectSlug);
}

// ─── Dependencies (injectable for testing) ────────────────────────────────────

export interface OnboardingDeps {
  getAuthFilePath: () => string;
  createAuthStorage: (path: string) => {
    set: (provider: string, cred: { type: string; key: string }) => void;
  };
  createLinearClient: (apiKey: string) => {
    getViewer: () => Promise<{ id: string; name: string; email: string }>;
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

  const { authFilePath } = await import("../../../app-paths.js");
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
  const basePath = process.cwd();

  // Prompt for API key (with one retry on failure)
  let apiKey: string | null = null;
  let validated = false;
  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const input = await ctx.ui.input(
      "Linear API Key",
      "lin_api_...",
    );

    // Empty input → user wants to skip
    if (!input || !input.trim()) {
      return "skipped";
    }

    apiKey = input.trim();

    // Validate the key
    try {
      const client = deps.createLinearClient(apiKey);
      await client.getViewer();
      validated = true;
      break;
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
        return "skipped";
      }
    }
  }

  if (!validated || !apiKey) {
    return "skipped";
  }

  // Store the key in auth.json
  try {
    const authPath = deps.getAuthFilePath();
    const authStorage = deps.createAuthStorage(authPath);
    authStorage.set("linear", { type: "api_key", key: apiKey });
  } catch (err) {
    ctx.ui.notify(
      `Failed to store API key: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
    return "skipped";
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
    // Key is stored even if preferences fail — not a full failure
  }

  ctx.ui.notify("✓ Linear API key saved. .kata/ created.", "info");
  return "completed";
}
