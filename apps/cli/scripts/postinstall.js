#!/usr/bin/env node
import { execSync } from 'child_process'
import { createRequire } from 'module'
import os from 'os'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pkg = require(resolve(__dirname, '..', 'package.json'))

// Colors
const cyan    = '\x1b[36m'
const green   = '\x1b[32m'
const yellow  = '\x1b[33m'
const dim     = '\x1b[2m'
const reset   = '\x1b[0m'

const banner =
  '\n' +
  cyan +
  '   ██████╗ ███████╗██████╗ \n' +
  '  ██╔════╝ ██╔════╝██╔══██╗\n' +
  '  ██║  ███╗███████╗██║  ██║\n' +
  '  ██║   ██║╚════██║██║  ██║\n' +
  '  ╚██████╔╝███████║██████╔╝\n' +
  '   ╚═════╝ ╚══════╝╚═════╝ ' +
  reset + '\n' +
  '\n' +
  `  Get Shit Done ${dim}v${pkg.version}${reset}\n` +
  `  A standalone coding agent that plans, executes, and ships.\n` +
  '\n' +
  `  ${green}✓${reset} Installed successfully\n` +
  `  ${dim}Run ${reset}${cyan}gsd${reset}${dim} to get started.${reset}\n`

process.stderr.write(banner)

// Install Playwright chromium for browser tools (non-fatal)
const args = os.platform() === 'linux' ? '--with-deps' : ''
try {
  execSync(`npx playwright install chromium ${args}`, { stdio: 'inherit' })
  process.stderr.write(`\n  ${green}✓${reset} Browser tools ready\n\n`)
} catch {
  process.stderr.write(`\n  ${yellow}⚠${reset}  Browser tools unavailable — run ${cyan}npx playwright install chromium${reset} to enable\n\n`)
}
