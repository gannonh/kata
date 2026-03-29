import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'readline'
import { join } from 'node:path'
import type { AuthStorage } from '@mariozechner/pi-coding-agent'

// ─── Colors ──────────────────────────────────────────────────────────────────

const cyan   = '\x1b[36m'
const green  = '\x1b[32m'
const yellow = '\x1b[33m'
const dim    = '\x1b[2m'
const bold   = '\x1b[1m'
const reset  = '\x1b[0m'

// ─── Masked input ─────────────────────────────────────────────────────────────

/**
 * Prompt for masked input using raw mode stdin.
 * Handles backspace, Ctrl+C, and Enter.
 * Falls back to plain readline if setRawMode is unavailable (e.g. some SSH contexts).
 */
async function promptMasked(label: string, hint: string): Promise<string> {
  return new Promise((resolve) => {
    const question = `  ${cyan}›${reset} ${label} ${dim}${hint}${reset}\n  `
    try {
      process.stdout.write(question)
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.setEncoding('utf8')
      let value = ''
      const handler = (ch: string) => {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.off('data', handler)
          process.stdout.write('\n')
          resolve(value)
        } else if (ch === '\u0003') {
          process.stdin.setRawMode(false)
          process.stdout.write('\n')
          process.exit(0)
        } else if (ch === '\u007f') {
          if (value.length > 0) {
            value = value.slice(0, -1)
          }
          process.stdout.clearLine(0)
          process.stdout.cursorTo(0)
          process.stdout.write('  ' + '*'.repeat(value.length))
        } else {
          value += ch
          process.stdout.write('*')
        }
      }
      process.stdin.on('data', handler)
    } catch (_err) {
      process.stdout.write(` ${dim}(input will be visible)${reset}\n  `)
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      rl.question('', (answer) => {
        rl.close()
        resolve(answer)
      })
    }
  })
}

// ─── Plain (unmasked) prompt ──────────────────────────────────────────────────

/**
 * Prompt for plain visible input using readline.
 * Use for non-sensitive values like URLs where users need to see what they type.
 */
async function promptPlain(label: string, hint: string): Promise<string> {
  return new Promise((resolve) => {
    const question = `  ${cyan}›${reset} ${label} ${dim}${hint}${reset}\n  `
    process.stdout.write(question)
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question('', (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

// ─── Env hydration ────────────────────────────────────────────────────────────

/**
 * Hydrate process.env from stored auth.json credentials for optional tool keys.
 * Runs on every launch so extensions see Brave/Context7/Jina keys stored via the
 * wizard on prior launches.
 */
export function loadStoredEnvKeys(authStorage: AuthStorage): void {
  const providers: Array<[string, string]> = [
    ['brave',         'BRAVE_API_KEY'],
    ['brave_answers', 'BRAVE_ANSWERS_KEY'],
    ['context7',      'CONTEXT7_API_KEY'],
    ['jina',          'JINA_API_KEY'],
    ['linear',        'LINEAR_API_KEY'],
  ]
  for (const [provider, envVar] of providers) {
    if (!process.env[envVar]) {
      const cred = authStorage.get(provider)
      if (cred?.type === 'api_key') {
        process.env[envVar] = cred.key as string
      }
    }
  }
}

// ─── Symphony URL helpers ─────────────────────────────────────────────────────

/**
 * Validate a Symphony URL string. Returns the normalized URL or null if invalid.
 */
export function validateSymphonyUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }
  // Remove trailing slash for consistency
  return parsed.toString().replace(/\/$/, '')
}

/**
 * Write a Symphony URL to the project's preferences file.
 * Creates .kata/preferences.md if it doesn't exist.
 * Returns true if the URL was written, false on error.
 */
export function writeSymphonyUrlToPreferences(basePath: string, url: string): boolean {
  const dir = join(basePath, '.kata')
  const path = join(dir, 'preferences.md')

  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    if (existsSync(path)) {
      let content = readFileSync(path, 'utf-8')
      // Check if symphony section already exists in frontmatter
      if (/^symphony:/m.test(content)) {
        // Replace or add url under existing symphony section — scope to symphony block only
        if (/^(symphony:(?:\n[ \t]+\S[^\n]*)*)(\n[ \t]+url:)/m.test(content)) {
          // Replace url: within the symphony section (not any other section's url:)
          content = content.replace(
            /(^symphony:(?:\n[ \t]+\S[^\n]*)*)(\n[ \t]+url:)[^\n]*/m,
            `$1$2 ${url}`
          )
        } else {
          content = content.replace(/^(symphony:.*$)/m, `$1\n  url: ${url}`)
        }
      } else {
        // Add symphony section before the closing --- (use lastIndexOf to avoid
        // accidentally replacing the opening frontmatter fence)
        const lastFence = content.lastIndexOf('\n---')
        if (lastFence !== -1) {
          content = content.slice(0, lastFence) + `\nsymphony:\n  url: ${url}\n---` + content.slice(lastFence + 4)
        } else {
          // No closing fence found — append at end
          content = content.trimEnd() + `\nsymphony:\n  url: ${url}\n---\n`
        }
      }
      writeFileSync(path, content, 'utf-8')
    } else {
      writeFileSync(path, `---\nsymphony:\n  url: ${url}\n---\n`, 'utf-8')
    }
    return true
  } catch {
    return false
  }
}

/**
 * Prompt the user for an optional Symphony server URL and write it to preferences.
 * Uses raw TTY input — intended to be called at the end of the wizard.
 * Returns the URL that was written, or null if the user skipped.
 */
export async function promptSymphonyUrl(basePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const question = `  ${cyan}›${reset} Connect to a Symphony server? ${dim}(y/N)${reset} `
    process.stdout.write(question)

    try {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.setEncoding('utf8')

      const handler = (ch: string) => {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.off('data', handler)
        process.stdout.write('\n')

        if (ch.toLowerCase() === 'y') {
          promptForUrl(basePath).then(resolve)
        } else {
          process.stdout.write(`  ${dim}↷  Symphony skipped${reset}\n\n`)
          resolve(null)
        }
      }
      process.stdin.on('data', handler)
    } catch {
      resolve(null)
    }
  })
}

async function promptForUrl(basePath: string): Promise<string | null> {
  const value = await promptPlain('Symphony URL', '(e.g. http://localhost:8080)')
  const trimmed = value.trim()
  if (!trimmed) {
    process.stdout.write(`  ${dim}↷  Symphony skipped${reset}\n\n`)
    return null
  }
  const validated = validateSymphonyUrl(trimmed)
  if (!validated) {
    process.stdout.write(`  ${yellow}⚠${reset}  Invalid URL — must be http or https.\n\n`)
    return null
  }
  const written = writeSymphonyUrlToPreferences(basePath, validated)
  if (written) {
    process.stdout.write(`  ${green}✓${reset} Symphony URL saved: ${validated}\n\n`)
    return validated
  }
  process.stdout.write(`  ${yellow}⚠${reset}  Failed to write Symphony URL to preferences.\n\n`)
  return null
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

interface ApiKeyConfig {
  provider: string
  envVar: string
  label: string
  hint: string
  description: string
}

const API_KEYS: ApiKeyConfig[] = [
  {
    provider:    'brave',
    envVar:      'BRAVE_API_KEY',
    label:       'Brave Search',
    hint:        '(search-the-web + search_and_read tools)',
    description: 'Web search and page extraction',
  },
  {
    provider:    'brave_answers',
    envVar:      'BRAVE_ANSWERS_KEY',
    label:       'Brave Answers',
    hint:        '(AI-summarised search answers)',
    description: 'AI-generated search summaries',
  },
  {
    provider:    'context7',
    envVar:      'CONTEXT7_API_KEY',
    label:       'Context7',
    hint:        '(up-to-date library docs)',
    description: 'Live library and framework documentation',
  },
  {
    provider:    'jina',
    envVar:      'JINA_API_KEY',
    label:       'Jina AI',
    hint:        '(clean page extraction)',
    description: 'High-quality web page content extraction',
  },
  {
    provider:    'linear',
    envVar:      'LINEAR_API_KEY',
    label:       'Linear',
    hint:        '(native Linear integration)',
    description: 'Linear project management API access',
  },
]

/**
 * Check for missing optional tool API keys and prompt for them if on a TTY.
 *
 * Anthropic auth is handled by pi's own OAuth/API key flow — we don't touch it.
 * This wizard only collects Brave Search, Context7, and Jina keys which are needed
 * for web search and documentation tools.
 */
export async function runWizardIfNeeded(authStorage: AuthStorage): Promise<void> {
  const missing = API_KEYS.filter(
    k => !authStorage.has(k.provider) && !process.env[k.envVar]
  )

  if (missing.length === 0) return

  // Non-TTY: warn and continue
  if (!process.stdin.isTTY) {
    const names = missing.map(k => k.label).join(', ')
    process.stderr.write(
      `[kata] Warning: optional tool API keys not configured (${names}). Some tools may not work.\n`
    )
    return
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  process.stdout.write(
    `\n  ${bold}Optional API keys${reset}\n` +
    `  ${dim}─────────────────────────────────────────────${reset}\n` +
    `  These unlock additional tools. All optional — press ${cyan}Enter${reset} to skip any.\n\n`
  )

  // ── Prompts ─────────────────────────────────────────────────────────────────
  let savedCount = 0

  for (const key of missing) {
    const value = await promptMasked(key.label, key.hint)
    if (value.trim()) {
      authStorage.set(key.provider, { type: 'api_key', key: value.trim() })
      process.env[key.envVar] = value.trim()
      process.stdout.write(`  ${green}✓${reset} ${key.label} saved\n\n`)
      savedCount++
    } else {
      process.stdout.write(`  ${dim}↷  ${key.label} skipped${reset}\n\n`)
    }
  }

  // ── Symphony URL (optional) ─────────────────────────────────────────────────
  if (!process.env.KATA_SYMPHONY_URL && !process.env.SYMPHONY_URL) {
    await promptSymphonyUrl(process.cwd())
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  process.stdout.write(
    `  ${dim}─────────────────────────────────────────────${reset}\n`
  )
  if (savedCount > 0) {
    process.stdout.write(
      `  ${green}✓${reset} ${savedCount} key${savedCount > 1 ? 's' : ''} saved to ${dim}~/.kata-cli/agent/auth.json${reset}\n` +
      `  ${dim}Run ${reset}${cyan}/login${reset}${dim} inside kata to connect your LLM provider.${reset}\n\n`
    )
  } else {
    process.stdout.write(
      `  ${yellow}↷${reset}  All keys skipped — you can add them later via ${dim}~/.kata-cli/agent/auth.json${reset}\n` +
      `  ${dim}Run ${reset}${cyan}/login${reset}${dim} inside kata to connect your LLM provider.${reset}\n\n`
    )
  }
}
