/**
 * Search provider selection.
 *
 * Single source of truth for which search backend (Tavily vs Brave) to use.
 * Reads API keys from process.env at call time (not module load time).
 * Simplified from gsd-pi: no Ollama, no AuthStorage persistence — just
 * env-var-based resolution with optional SEARCH_PROVIDER override.
 */

export type SearchProvider = 'tavily' | 'brave'
export type SearchProviderPreference = SearchProvider | 'auto'

const VALID_PREFERENCES = new Set<string>(['tavily', 'brave', 'auto'])

/** Returns the Tavily API key from the environment, or empty string if not set. */
export function getTavilyApiKey(): string {
  return process.env.TAVILY_API_KEY || ''
}

/** Returns the Brave API key from the environment, or empty string if not set. */
export function getBraveApiKey(): string {
  return process.env.BRAVE_API_KEY || ''
}

/** Standard headers for Brave Search API requests. */
export function braveHeaders(): Record<string, string> {
  return {
    "Accept": "application/json",
    "Accept-Encoding": "gzip",
    "X-Subscription-Token": getBraveApiKey(),
  }
}

/**
 * Resolve which search provider to use based on available API keys and preference.
 *
 * Logic:
 * 1. If overridePreference is given and valid, use it as the preference.
 * 2. Otherwise, read SEARCH_PROVIDER env var.
 * 3. If preference is 'auto' (or unset): prefer Tavily if TAVILY_API_KEY set, else Brave.
 * 4. If preference is a specific provider: use it if its key exists, else fall back.
 * 5. Return null if neither key is available.
 */
export function resolveSearchProvider(overridePreference?: string): SearchProvider | null {
  const hasTavily = getTavilyApiKey().length > 0
  const hasBrave = getBraveApiKey().length > 0

  // Determine effective preference
  let pref: SearchProviderPreference
  if (overridePreference && VALID_PREFERENCES.has(overridePreference)) {
    pref = overridePreference as SearchProviderPreference
  } else {
    const envPref = process.env.SEARCH_PROVIDER || ''
    pref = VALID_PREFERENCES.has(envPref) ? (envPref as SearchProviderPreference) : 'auto'
  }

  // Resolve based on preference
  if (pref === 'auto') {
    if (hasTavily) return 'tavily'
    if (hasBrave) return 'brave'
    return null
  }

  if (pref === 'tavily') {
    if (hasTavily) return 'tavily'
    if (hasBrave) return 'brave'
    return null
  }

  if (pref === 'brave') {
    if (hasBrave) return 'brave'
    if (hasTavily) return 'tavily'
    return null
  }

  return null
}
