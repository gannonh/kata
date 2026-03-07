---
phase: 02-rebranding
plan: 04
subsystem: infrastructure
tags: [trademark, release, oauth, documentation]
dependency-graph:
  requires:
    - "02-01"  # Product name and metadata
    - "02-02"  # Application icons
    - "02-03"  # In-app logos
  provides:
    - Craft.do domain references removed from active code
    - GitHub releases configured for auto-update
    - v0.4.0 version ready for release
  affects: []
tech-stack:
  added: []
  patterns:
    - "Feature disabled with clear error message (Slack OAuth)"
    - "GitHub releases for auto-update"
key-files:
  created: []
  modified:
    - packages/shared/src/docs/doc-links.ts
    - packages/shared/src/version/manifest.ts
    - packages/shared/src/sources/builtin-sources.ts
    - packages/shared/src/prompts/system.ts
    - packages/shared/src/auth/slack-oauth.ts
    - packages/shared/src/validation/url-validator.ts
    - packages/shared/src/agent/craft-agent.ts
    - packages/shared/src/docs/source-guides.ts
    - apps/electron/src/main/menu.ts
    - apps/electron/src/main/auto-update.ts
    - apps/electron/electron-builder.yml
    - apps/electron/package.json
    - apps/electron/src/renderer/components/AppMenu.tsx
    - apps/electron/src/renderer/pages/ChatPage.tsx
    - scripts/install-app.sh
    - scripts/install-app.ps1
    - README.md
    - SECURITY.md
    - CODE_OF_CONDUCT.md
decisions:
  - id: 14
    decision: "Slack OAuth disable approach"
    choice: "Return graceful error, keep implementation for future"
  - id: 15
    decision: "Auto-update provider"
    choice: "GitHub releases instead of generic provider"
  - id: 16
    decision: "Install scripts source"
    choice: "GitHub Releases API"
metrics:
  duration: "6m 26s"
  completed: "2026-01-29"
---

# Phase 02 Plan 04: Domain References and Release Configuration Summary

**Objective:** Remove craft.do domain references from active code paths and configure v0.4.0 release via GitHub Actions.

**One-liner:** Disabled craft.do-dependent features gracefully, switched auto-update to GitHub releases, bumped to v0.4.0.

## What Was Done

### Task 1: Remove/Update craft.do Domain References

**Files Modified:** 15 files

1. **doc-links.ts** - Set `DOC_BASE_URL = ''` (disabled until kata.sh docs exist)
2. **manifest.ts** - Set `VERSIONS_URL = ''` (disabled until kata.sh hosts version manifest)
3. **builtin-sources.ts** - Disabled MCP docs URL in placeholder source
4. **system.ts** - Changed git co-author to `Kata Agents <noreply@kata.sh>`
5. **craft-agent.ts** - Commented out craft-agents-docs MCP server
6. **source-guides.ts** - Commented out craft.do provider domain mapping
7. **menu.ts** - Changed Help menu link to GitHub repo
8. **auto-update.ts** - Updated comment to reference GitHub releases
9. **electron-builder.yml** - Changed publish provider from `generic` to `github`
10. **AppMenu.tsx** - Changed Help & Documentation link to GitHub
11. **ChatPage.tsx** - Changed sharing Learn More links to GitHub
12. **install-app.sh** - Rewrote to download from GitHub Releases
13. **install-app.ps1** - Rewrote to download from GitHub Releases

**Slack OAuth Disabled Gracefully:**
```typescript
export const SLACK_OAUTH_DISABLED = true;
export const SLACK_OAUTH_DISABLED_REASON =
  'Slack OAuth is temporarily unavailable. The OAuth relay server (agents.craft.do) ' +
  'is not available for this fork. This feature will be restored when a replacement ' +
  'relay is configured at kata.sh.';
```

The implementation is preserved for future re-enablement when a relay server is configured.

**URL Validator Updated:**
Changed example domains from `mcp.craft.do` to generic `mcp.example.com` placeholders.

### Task 2: Update Version and Verify Release Workflow

- Bumped version from `0.3.0` to `0.4.0` in `apps/electron/package.json`
- Verified release.yml has `permissions: contents: write` for release creation
- Confirmed workflow triggers on push to main when version changes

### Task 3: Documentation Cleanup

**README.md:**
- Rebranded to Kata Agents
- Added fork attribution note
- Updated installation instructions for GitHub releases
- Updated deep linking scheme to `kataagents://`
- Updated config path to `~/.kata-agents/`

**SECURITY.md:**
- Changed reporting to GitHub Security Advisories
- Updated scope for Kata Agents

**CODE_OF_CONDUCT.md:**
- Changed enforcement contact to GitHub Issues

## Decisions Made

| ID | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| 14 | Slack OAuth disable approach | Return graceful error, keep implementation | Preserves code for when relay is set up; clear error message for users |
| 15 | Auto-update provider | GitHub releases | Standard distribution for open source; no infrastructure needed |
| 16 | Install scripts source | GitHub Releases API | Works without custom infrastructure |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Additional renderer components with craft.do links**

- **Found during:** Task 1
- **Issue:** AppMenu.tsx and ChatPage.tsx had craft.do links not listed in plan
- **Fix:** Updated all Help/Documentation links to GitHub repo
- **Files modified:** AppMenu.tsx, ChatPage.tsx
- **Commit:** e985774

**2. [Rule 2 - Missing Critical] craft-agent.ts MCP server reference**

- **Found during:** Task 1
- **Issue:** craft-agent.ts had hardcoded craft-agents-docs MCP server URL
- **Fix:** Commented out with note for future re-enablement
- **Files modified:** craft-agent.ts
- **Commit:** e985774

## Verification Results

| Check | Result |
|-------|--------|
| SLACK_OAUTH_DISABLED flag exists | Pass |
| Active craft.do references in TS (excl. comments/disabled) | 2 (in disabled feature docs - OK) |
| Version is 0.4.0 | Pass |
| Type check | Pass |
| Tests | 1174 pass, 4 fail (pre-existing mermaid issues) |
| GitHub provider in electron-builder | Pass |
| Release workflow permissions | Pass |

## Commits

| Hash | Message |
|------|---------|
| e985774 | fix(02-04): remove craft.do domain references |
| 91f3a56 | chore(02-04): bump version to 0.4.0 |
| 824ecb0 | docs(02-04): update documentation for Kata Agents |

## What Remains Disabled (Requires Infrastructure)

1. **Slack OAuth** - Needs HTTPS relay server (Cloudflare Worker or similar)
2. **External docs** - Needs docs.kata.sh
3. **Version manifest** - Needs version endpoint at kata.sh
4. **MCP docs server** - Needs docs MCP server at kata.sh

## Next Phase Readiness

- Phase 2 complete (all 4 plans executed)
- Ready to merge to main and trigger v0.4.0 release
- GitHub Actions will build and release for all platforms
