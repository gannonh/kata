#!/usr/bin/env node
/**
 * Sync pkg/package.json version with the installed @mariozechner/pi-coding-agent version.
 *
 * kata-pi sets PI_PACKAGE_DIR=pkg/ so that pi's config.js reads piConfig from
 * pkg/package.json (for branding: name="kata", configDir=".kata"). However, config.js
 * also reads `version` from that same file and uses it for the update check
 * (comparing against npm registry). If pkg/package.json has a stale version,
 * pi's update banner fires even when the user is already on the latest release.
 *
 * This script reads the actual installed pi-coding-agent version and writes it
 * into pkg/package.json so VERSION is always correct at publish time.
 */
const { readFileSync, writeFileSync } = require('fs')
const { resolve, join } = require('path')

const root = resolve(__dirname, '..')
const kataPkgPath = join(root, 'pkg', 'package.json')

// Walk up from workspace root to find hoisted dependency (bun/npm hoist to monorepo root)
function findPiPkgJson() {
  let dir = root
  while (true) {
    const candidate = join(dir, 'node_modules', '@mariozechner', 'pi-coding-agent', 'package.json')
    try {
      readFileSync(candidate, 'utf-8')
      return candidate
    } catch {}
    const parent = resolve(dir, '..')
    if (parent === dir) throw new Error('Could not find @mariozechner/pi-coding-agent in any node_modules')
    dir = parent
  }
}

const piPkg = JSON.parse(readFileSync(findPiPkgJson(), 'utf-8'))
const kataPkg = JSON.parse(readFileSync(kataPkgPath, 'utf-8'))

if (kataPkg.version !== piPkg.version) {
  console.log(`[sync-pkg-version] Updating pkg/package.json version: ${kataPkg.version} → ${piPkg.version}`)
  kataPkg.version = piPkg.version
  writeFileSync(kataPkgPath, JSON.stringify(kataPkg, null, 2) + '\n')
} else {
  console.log(`[sync-pkg-version] pkg/package.json version already matches: ${piPkg.version}`)
}
