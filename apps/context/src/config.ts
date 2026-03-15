/**
 * Config loader for Kata Context.
 *
 * Reads `.kata/config.json` from the project root (if present) and
 * merges it with sensible defaults. Missing keys use defaults;
 * explicit user values override.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG, type Config } from "./types.js";

const CONFIG_DIR = ".kata";
const CONFIG_FILE = "config.json";

/**
 * Load the Kata Context config for a project.
 *
 * @param rootPath - Absolute path to the project root
 * @returns Merged config (user values override defaults)
 */
export function loadConfig(rootPath: string): Config {
  const configPath = join(rootPath, CONFIG_DIR, CONFIG_FILE);

  if (!existsSync(configPath)) {
    return structuredClone(DEFAULT_CONFIG);
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    // Unreadable file → fall back to defaults
    return structuredClone(DEFAULT_CONFIG);
  }

  let userConfig: Partial<Config>;
  try {
    userConfig = JSON.parse(raw) as Partial<Config>;
  } catch {
    // Invalid JSON → fall back to defaults
    return structuredClone(DEFAULT_CONFIG);
  }

  return mergeConfig(DEFAULT_CONFIG, userConfig);
}

/**
 * Deep-merge user config over defaults.
 * Arrays are replaced (not concatenated) so the user can fully control excludes.
 */
function mergeConfig(defaults: Config, user: Partial<Config>): Config {
  return {
    languages: user.languages ?? defaults.languages,
    excludes: user.excludes ?? [...defaults.excludes],
    summaryThreshold: user.summaryThreshold ?? defaults.summaryThreshold,
    watch: user.watch ?? defaults.watch,
    providers: {
      openai: {
        model: user.providers?.openai?.model ?? defaults.providers.openai.model,
        batchSize:
          user.providers?.openai?.batchSize ??
          defaults.providers.openai.batchSize,
      },
      anthropic: {
        model:
          user.providers?.anthropic?.model ??
          defaults.providers.anthropic.model,
        maxTokens:
          user.providers?.anthropic?.maxTokens ??
          defaults.providers.anthropic.maxTokens,
      },
    },
  };
}
