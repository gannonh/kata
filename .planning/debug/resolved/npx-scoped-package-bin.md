---
status: resolved
trigger: "npx @gannonh/kata fails with 'kata: command not found' due to known npm bug with scoped packages"
created: 2026-01-22T12:00:00Z
updated: 2026-01-22T21:25:00Z
---

## Current Focus

hypothesis: The issue is local to kata source directory - npm resolves package locally instead of fetching from registry
test: Compare behavior from kata dir vs other directories
expecting: Works everywhere except from within kata source tree
next_action: Verify this is the actual root cause, not a broader npm bug

## Symptoms

expected: `npx @gannonh/kata --global` downloads the package and runs the `kata` bin command
actual: Package downloads but then fails with `sh: kata: command not found`
errors: `sh: kata: command not found`
reproduction: Run `npx @gannonh/kata` from within kata source directory
started: Known npm bug since npm/cli#3791, persists through npm 11.8.0

## Eliminated

- hypothesis: npx cannot resolve bin commands for scoped packages universally
  evidence: `npx @gannonh/kata` works from /tmp/npx-test and ~ (home dir), only fails from kata source dir
  timestamp: 2026-01-22T21:25:00Z

- hypothesis: npm cache corruption
  evidence: Clearing ~/.npm/_npx doesn't help, and package works from other directories
  timestamp: 2026-01-22T21:24:00Z

## Evidence

- timestamp: 2026-01-22T12:00:00Z
  checked: package.json bin configuration
  found: `"bin": { "kata": "bin/install.js" }` - standard npm bin format
  implication: Configuration is correct per npm docs

- timestamp: 2026-01-22T21:24:00Z
  checked: npx from kata source directory
  found: npm verbose logs show NO http fetch, just immediate "sh: kata: command not found"
  implication: npm isn't even trying to download the package from registry

- timestamp: 2026-01-22T21:24:30Z
  checked: npx from /tmp/npx-test (clean directory)
  found: npm verbose logs show http fetch, package downloads, command runs successfully
  implication: npx works correctly when not in a directory with matching package.json

- timestamp: 2026-01-22T21:25:00Z
  checked: npx from home directory (~)
  found: Works correctly, shows help output
  implication: The issue is specific to being in the kata source directory

- timestamp: 2026-01-22T21:25:00Z
  checked: Why npm skips fetch in kata directory
  found: npm sees local package.json with name "@gannonh/kata", resolves package locally
  implication: npm exec doesn't install local packages, so no bin symlink is created

## Resolution

root_cause: When `npx @gannonh/kata` is run from within the kata source directory, npm sees the local package.json with `"name": "@gannonh/kata"` and resolves the package locally instead of fetching from npm registry. Since the local package isn't "installed" (no node_modules/.bin symlinks), the `kata` bin command isn't available in PATH, causing "sh: kata: command not found".

**NOT a universal npm bug.** The command works correctly from:
- Fresh directories without package.json
- Home directory
- Projects that have kata installed as a dependency
- Any directory without a matching package.json name

The original bug report was likely based on testing from within the kata source directory.

fix: Added check to kata-updating skill to detect when running from kata source directory and show helpful error message with workarounds. Also fixed typos where space was missing after npx/npm commands.
verification: |
  1. Detection command correctly identifies kata source directory: PASS
  2. Detection command returns no output in other directories: PASS
  3. npx @gannonh/kata --global works from fresh directories: PASS
  4. npx @gannonh/kata --global works from home directory: PASS
  5. Skill file updated with correct syntax and helpful error message: PASS
files_changed:
  - skills/kata-updating/SKILL.md
