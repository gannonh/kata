# Phase 1: Setup and Tooling - Research

**Researched:** 2026-01-29
**Domain:** CI/CD, GitHub Actions, Electron Build Pipeline, Git Upstream Management
**Confidence:** HIGH

## Summary

This phase establishes CI/CD infrastructure for PR validation and release builds, plus documents the upstream management strategy. The codebase already has a partial CI workflow (`release.yml`) that handles release builds but lacks PR validation triggers and has an incorrect script reference (`build:electron` should be `electron:build`).

The standard approach is to use GitHub Actions with `oven-sh/setup-bun@v2` for Bun runtime, separate workflow jobs for PR validation vs release builds, and `electron-builder` for cross-platform packaging. Upstream management follows a cherry-pick-to-feature-branch pattern with a dedicated sync branch.

**Primary recommendation:** Create a new `ci.yml` workflow for PR validation (typecheck, test, macOS build), fix the existing `release.yml` to use correct scripts, and document the upstream strategy in `UPSTREAM.md`.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library/Tool | Version | Purpose | Why Standard |
|--------------|---------|---------|--------------|
| GitHub Actions | latest | CI/CD platform | Native to GitHub, no external dependencies |
| oven-sh/setup-bun | v2 | Bun runtime setup | Official action from Bun team |
| actions/checkout | v4 | Repository checkout | Standard GitHub action |
| actions/upload-artifact | v4 | Artifact management | Standard, 90% faster than v3 |
| actions/download-artifact | v4 | Artifact retrieval | Pairs with upload-artifact |
| electron-builder | ^26.0.12 | Cross-platform packaging | Already in project, de facto standard |
| softprops/action-gh-release | v2 | GitHub releases | Mature, widely used |

### Supporting
| Library/Tool | Version | Purpose | When to Use |
|--------------|---------|---------|-------------|
| actions/setup-node | v4 | Node.js setup | Required alongside Bun for electron-builder |
| actions/cache | v4 | Dependency caching | Optional optimization for bun install |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual electron-builder | samuelmeuli/action-electron-builder | Less control, but simpler setup |
| Separate workflows | Single workflow with path filtering | Single file is simpler but harder to maintain |
| Cherry-pick workflow | Merge workflow | Merge is simpler but brings unwanted changes |

**Installation:**
No new dependencies needed - all tools are GitHub Actions or already in project.

## Architecture Patterns

### Recommended Workflow Structure
```
.github/workflows/
├── ci.yml          # PR validation (typecheck, test, macOS build)
└── release.yml     # Release builds (all platforms, GitHub Release)
```

### Pattern 1: Tiered Build Matrix

**What:** Build macOS only on PRs, full matrix (macOS/Windows/Linux) on main/tags
**When to use:** When fast PR feedback is prioritized over full coverage

**Example:**
```yaml
# Source: GitHub Actions matrix strategy documentation
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run typecheck:all
      - run: bun test

  build-mac:
    needs: validate
    runs-on: macos-latest
    # Only for PRs, skip on main (release handles main)
```

### Pattern 2: Cherry-Pick Upstream Integration

**What:** Fetch upstream changes to sync branch, cherry-pick to feature branches
**When to use:** When maintaining a fork with selective upstream adoption

**Example:**
```bash
# Source: GitHub Blog - Friendly Fork Management
git fetch upstream
git checkout -b feature/upstream-bug-fix main
git cherry-pick <commit-sha>
git push origin feature/upstream-bug-fix
# Open PR to main
```

### Pattern 3: Artifact Retention Configuration

**What:** Set explicit retention days on uploaded artifacts
**When to use:** Always, to control storage costs

**Example:**
```yaml
# Source: actions/upload-artifact documentation
- uses: actions/upload-artifact@v4
  with:
    name: macos-arm64
    path: apps/electron/release/*.dmg
    retention-days: 7
```

### Anti-Patterns to Avoid
- **Using build:electron:** The workflow references a non-existent script. Use `electron:build` instead.
- **Skipping Node.js setup:** electron-builder requires Node.js even when using Bun for the build.
- **Publishing from PRs:** Never create releases from PR builds; reserve for main/tags.
- **Merging entire upstream:** Cherry-pick individual commits to maintain fork clarity.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| Bun runtime setup | Manual download/install | oven-sh/setup-bun@v2 | Handles caching, version resolution, PATH setup |
| Artifact upload | Custom S3/storage logic | actions/upload-artifact@v4 | 90% faster, native integration |
| Release creation | Manual gh CLI calls | softprops/action-gh-release@v2 | Handles asset upload, release notes |
| Version checking | Custom bash scripts | Existing check-version job | Already implemented in release.yml |

**Key insight:** GitHub Actions ecosystem is mature. Actions for common tasks are well-tested and handle edge cases (platform differences, permissions, caching) that custom scripts would miss.

## Common Pitfalls

### Pitfall 1: Missing Node.js for electron-builder
**What goes wrong:** electron-builder fails because it requires Node.js, not just Bun
**Why it happens:** Bun can run most JS but electron-builder has Node-specific dependencies
**How to avoid:** Always include `actions/setup-node@v4` before electron-builder steps
**Warning signs:** "node: command not found" or "npx: command not found"

### Pitfall 2: Incorrect Script Names
**What goes wrong:** Workflow fails with "Script not found"
**Why it happens:** The existing release.yml uses `build:electron` but package.json defines `electron:build`
**How to avoid:** Verify script names against package.json before using in workflows
**Warning signs:** `bun run build:electron` fails immediately

### Pitfall 3: Code Signing on macOS
**What goes wrong:** Build succeeds but app cannot be opened on other Macs
**Why it happens:** Unsigned apps trigger Gatekeeper
**How to avoid:** For now, use `CSC_IDENTITY_AUTO_DISCOVERY: false` to skip signing; add proper signing later
**Warning signs:** "App is damaged and can't be opened" on user machines

### Pitfall 4: Windows EBUSY Errors
**What goes wrong:** Windows build fails with EBUSY when copying bun.exe
**Why it happens:** electron-builder's npm module collector locks files during scan
**How to avoid:** Use extraResources for bun.exe (already configured in electron-builder.yml)
**Warning signs:** EBUSY errors in Windows build logs

### Pitfall 5: Upstream Merge Conflicts
**What goes wrong:** Cherry-picked commits conflict with local changes
**Why it happens:** Upstream refactors or changes to files you've also modified
**How to avoid:** Skip upstream refactors unless they provide user value; resolve conflicts in feature branch before PR
**Warning signs:** git cherry-pick fails with CONFLICT

## Code Examples

Verified patterns from official sources:

### PR Validation Workflow
```yaml
# Source: GitHub Actions documentation + oven-sh/setup-bun
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run typecheck:all
      - run: bun test

  build-mac:
    needs: validate
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: bun install
      - run: bun run electron:build
      - run: |
          cd apps/electron
          npx electron-builder --mac --arm64 --publish never
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: false
      - uses: actions/upload-artifact@v4
        with:
          name: macos-arm64
          path: apps/electron/release/*.dmg
          retention-days: 7
```

### Upstream Sync Commands
```bash
# Source: Atlassian Git Tutorials + GitHub Blog
# One-time setup
git remote add upstream https://github.com/AiCodecraft/craft-agents.git
git fetch upstream
git checkout -b upstream/sync upstream/main

# Monthly sync
git checkout upstream/sync
git fetch upstream
git reset --hard upstream/main

# Cherry-pick workflow
git checkout main
git checkout -b feature/upstream-sdk-update
git cherry-pick abc1234  # specific commit
git push origin feature/upstream-sdk-update
```

### UPSTREAM.md Template
```markdown
# Upstream Management

## Source Repository
- **URL:** https://github.com/AiCodecraft/craft-agents
- **Remote name:** upstream
- **Sync branch:** upstream/sync

## Setup
\`\`\`bash
git remote add upstream https://github.com/AiCodecraft/craft-agents.git
git fetch upstream
git checkout -b upstream/sync upstream/main --no-track
\`\`\`

## Sync Process
1. Fetch: `git fetch upstream`
2. Update sync branch: `git checkout upstream/sync && git reset --hard upstream/main`
3. Review commits: `git log upstream/sync --oneline -20`
4. Cherry-pick: `git checkout -b feature/upstream-xyz main && git cherry-pick <sha>`
5. PR to main

## Adoption Criteria
| Type | Policy |
|------|--------|
| Bug fixes | Adopt readily |
| SDK updates | Test thoroughly |
| Features | Case-by-case |
| Refactors | Generally skip |
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| setup-bun@v1 | setup-bun@v2 | 2024 | Better caching, version resolution |
| upload-artifact@v3 | upload-artifact@v4 | 2024 | 90% faster uploads, immediate availability |
| Node 16 in CI | Node 20 | 2024 | Node 16 EOL, security updates |
| Manual release | softprops/action-gh-release@v2 | 2024 | Better asset handling |

**Deprecated/outdated:**
- setup-bun@v1: Still works but v2 has better version resolution
- upload-artifact@v3: Performance penalty, use v4 on GitHub.com (v3 still required for GHES)
- Node 16 runners: Being phased out, use Node 20

## Open Questions

Things that couldn't be fully resolved:

1. **Code signing strategy for distribution**
   - What we know: Current workflow skips signing with `CSC_IDENTITY_AUTO_DISCOVERY: false`
   - What's unclear: Whether Kata will need Apple Developer account for notarization
   - Recommendation: Leave signing disabled for Phase 1; address in future milestone

2. **Test suite stability**
   - What we know: Running `bun test` shows some failing tests (mermaid package)
   - What's unclear: Whether tests should pass before PR or are known issues
   - Recommendation: Run tests in CI but don't block PR merge initially; track test health

3. **Caching strategy for bun install**
   - What we know: setup-bun@v2 can cache the bun binary; bun has built-in caching
   - What's unclear: Whether explicit dependency caching provides meaningful speedup
   - Recommendation: Start without explicit caching; add if CI times become problematic

## Sources

### Primary (HIGH confidence)
- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun) - Action documentation and inputs
- [Bun CI/CD Guide](https://bun.com/docs/guides/runtime/cicd) - Official Bun CI documentation
- [actions/upload-artifact](https://github.com/actions/upload-artifact) - Artifact retention and v4 improvements

### Secondary (MEDIUM confidence)
- [GitHub Blog - Friendly Fork Management](https://github.blog/developer-skills/github/friend-zone-strategies-friendly-fork-management/) - Fork strategies from GitHub's own forks
- [Atlassian Git Tutorials](https://www.atlassian.com/git/tutorials/git-forks-and-upstreams) - Upstream tracking patterns
- [electron-builder GitHub](https://github.com/electron-userland/electron-builder) - Build matrix patterns

### Tertiary (LOW confidence)
- WebSearch results for "GitHub Actions 2026" - General best practices, not project-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official documentation verified
- Architecture: HIGH - Patterns match existing codebase structure
- Pitfalls: MEDIUM - Some derived from codebase analysis, not all verified externally

**Research date:** 2026-01-29
**Valid until:** 2026-03-01 (30 days - stable domain)
