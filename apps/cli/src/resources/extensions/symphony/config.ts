import {
  loadEffectiveKataPreferences,
  type KataPreferences,
} from "../kata/preferences.js";
import {
  SymphonyError,
  isSymphonyError,
  type SymphonyConfigOrigin,
  type SymphonyConnectionConfig,
} from "./types.js";

const DEFAULT_URL_ENV_KEY = "SYMPHONY_URL";
const FALLBACK_URL_ENV_KEY = "KATA_SYMPHONY_URL";

export interface ResolveSymphonyConfigOptions {
  preferences?: Pick<KataPreferences, "symphony"> | null;
  env?: NodeJS.ProcessEnv;
  envVarName?: string;
}

export function resolveSymphonyConfig(
  options: ResolveSymphonyConfigOptions = {},
): SymphonyConnectionConfig {
  const env = options.env ?? process.env;
  const envVarName = options.envVarName ?? DEFAULT_URL_ENV_KEY;

  const prefCandidate = normalizeCandidate(options.preferences?.symphony?.url);
  if (prefCandidate) {
    return {
      url: normalizeAndValidateUrl(prefCandidate, "preferences"),
      origin: "preferences",
    };
  }

  const envCandidate =
    normalizeCandidate(env[FALLBACK_URL_ENV_KEY]) ??
    normalizeCandidate(env[envVarName]);
  if (envCandidate) {
    return {
      url: normalizeAndValidateUrl(envCandidate, "env"),
      origin: "env",
    };
  }

  throw new SymphonyError(
    `Symphony URL is not configured. Set \`symphony.url\` in preferences or set ${FALLBACK_URL_ENV_KEY} / ${envVarName}.`,
    {
      code: "config_missing",
      reason: `missing symphony.url and ${FALLBACK_URL_ENV_KEY}/${envVarName}`,
    },
  );
}

export function resolveSymphonyConfigFromRuntime(
  options: Omit<ResolveSymphonyConfigOptions, "preferences"> & {
    cwd?: string;
  } = {},
): SymphonyConnectionConfig {
  const loaded = loadEffectiveKataPreferences(options.cwd);
  return resolveSymphonyConfig({
    ...options,
    preferences: loaded?.preferences,
  });
}

/**
 * Check whether Symphony is configured (URL available via preferences or env).
 * Returns true if `resolveSymphonyConfigFromRuntime()` succeeds, false if it
 * throws a `config_missing` SymphonyError. Re-throws any other error.
 */
export function isSymphonyConfigured(
  options?: Omit<ResolveSymphonyConfigOptions, "preferences"> & { cwd?: string },
): boolean {
  try {
    resolveSymphonyConfigFromRuntime(options);
    return true;
  } catch (error) {
    if (isSymphonyError(error) && error.code === "config_missing") {
      return false;
    }
    throw error;
  }
}

function normalizeCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAndValidateUrl(
  rawUrl: string,
  origin: SymphonyConfigOrigin,
): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SymphonyError(
      `Invalid Symphony URL from ${origin}: ${rawUrl}`,
      {
        code: "config_invalid",
        origin,
        reason: "malformed_url",
      },
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SymphonyError(
      `Invalid Symphony URL protocol from ${origin}: ${parsed.protocol}`,
      {
        code: "config_invalid",
        origin,
        reason: "unsupported_protocol",
      },
    );
  }

  // Canonicalize: remove trailing slash so endpoint joins are deterministic.
  if (parsed.pathname.endsWith("/") && parsed.pathname !== "/") {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return parsed.toString().replace(/\/$/, "");
}
