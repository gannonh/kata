# Phase 02: Rebranding — UAT

**Started:** 2026-01-29
**Completed:** 2026-01-29
**Status:** Pass (with fixes applied)
**Tester:** User

## Test Summary

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | Window title shows "Kata Agents" | N/A | Frameless window - no title bar by design |
| 2 | macOS menu bar shows "Kata Agents" | ✓ | Menu items correct; "Electron" in bar is dev mode only |
| 3 | About dialog displays "Kata Agents" | ✓ | Verified in packaged build |
| 4 | Dock icon is Kata mark | ✓ | Amber mark on dark background |
| 5 | Splash screen shows Kata mark | ✓ | |
| 6 | Help menu opens GitHub repo | ✓ | Help > Help & Documentation → GitHub |
| 7 | Deeplink scheme is kata:// | ✓ | Verified in code |

**Result:** 6/6 applicable tests passed

## Issues Found & Fixed

| Issue | Location | Fix |
|-------|----------|-----|
| AI introduces itself as "Craft Agent" | packages/shared/src/prompts/system.ts:368 | Changed to "Kata Agents" |
| "All Documentation" link → craft.do | apps/electron/src/renderer/components/app-shell/AppShell.tsx:2121 | Changed to GitHub repo |

**Fix commit:** 8cf6f1d

## Testing Notes

### Dev vs Production Build
- `bun run electron:start` runs in dev mode - shows "Electron" branding in About dialog and menu bar
- For accurate branding UAT, must build packaged app: `cd apps/electron && bunx electron-builder --mac`
- Packaged app location: `apps/electron/release/mac-arm64/Kata Agents.app`

### README Attribution
README.md references to "Craft Agents" are intentional - they're required attribution for the fork (LICENSE/NOTICE compliance).

---
*Completed: 2026-01-29*
