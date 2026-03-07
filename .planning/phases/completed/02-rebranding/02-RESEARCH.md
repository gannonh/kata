# Phase 2: Rebranding - Research

**Researched:** 2026-01-29
**Domain:** Electron app rebranding, icon generation, GitHub releases
**Confidence:** HIGH

## Summary

This research catalogues all Craft-branded assets and references in the codebase that must be updated for Kata Agents rebranding. The codebase contains extensive Craft branding across:

1. **Application icons** - icns, ico, png files for all platforms
2. **In-app assets** - SVG logos and React components
3. **Configuration files** - package.json, electron-builder.yml with names and bundle IDs
4. **Domain references** - `craft.do`, `agents.craft.do`, `mcp.craft.do` URLs
5. **Code identifiers** - environment variables, deeplink schemes, config paths

Brand assets for Kata are already available in the `assets/brand/` directory with official brand guidelines from https://kata.sh/brand defining colors (#d4a574 amber accent, #18181b charcoal background) and the mark design.

**Primary recommendation:** Systematically update each category below, using the existing `assets/brand/` files and the icon generation script at `apps/electron/resources/generate-icons.sh`.

## Standard Stack

Icon generation uses native macOS tools already in the codebase:

### Core
| Tool | Purpose | Location |
|------|---------|----------|
| `sips` | Resize PNG to multiple sizes | macOS built-in |
| `iconutil` | Generate .icns from iconset | macOS built-in |
| `convert` | Generate .ico from PNGs | ImageMagick (optional) |
| `generate-icons.sh` | Automated icon generation | `apps/electron/resources/` |

### Brand Assets Available
| File | Format | Purpose |
|------|--------|---------|
| `assets/brand/icon-dark.svg` | SVG | App icon (dark bg + amber mark) |
| `assets/brand/icon-light.svg` | SVG | App icon (light bg + amber mark) |
| `assets/brand/mark.svg` | SVG | Raw mark (no background) |
| `assets/brand/logo-circle-dark.svg` | SVG | Circular logo variant |
| `assets/brand/logo-square-512.svg` | SVG | Square 512px for standard use |
| `assets/brand/wordmark.svg` | SVG | Horizontal mark + text lockup |

### Brand Colors (from https://kata.sh/brand)
| Name | Hex | Usage |
|------|-----|-------|
| Ink | #0d0d0d | Darkest |
| Charcoal | #18181b | Dark backgrounds |
| Stone | #27272a | Borders and dividers |
| Ash | #52525b | Secondary text |
| Paper | #faf8f5 | Light backgrounds |
| Amber | #d4a574 | Accent/interactive |

## Files Requiring Changes

### 1. Application Icons (HIGH confidence)

Files to replace with Kata branding:

| File | Platform | Format | Source |
|------|----------|--------|--------|
| `apps/electron/resources/icon.icns` | macOS | Apple Icon Image | Generate from PNG |
| `apps/electron/resources/icon.ico` | Windows | Windows Icon | Generate from PNG |
| `apps/electron/resources/icon.png` | Linux | PNG 512x512 | Export from SVG |
| `apps/electron/resources/icon.svg` | All | SVG | Copy from `assets/brand/icon-dark.svg` |
| `apps/electron/resources/source.png` | All | PNG | Generate from mark |
| `apps/electron/resources/icon.icon/Assets/icon.svg` | macOS Liquid Glass | SVG | Copy from `assets/brand/` |
| `apps/electron/resources/dmg-background.png` | macOS DMG | PNG | Update with Kata branding |
| `apps/electron/resources/dmg-background.tiff` | macOS DMG | TIFF | Generate from updated PNG |

**Craft logos to remove:**
- `apps/electron/resources/craft-logos/craft_app_icon.png`
- `apps/electron/resources/craft-logos/craft_app_icon_dark.png`
- `apps/electron/resources/craft-logos/craft_logo_black.png`
- `apps/electron/resources/craft-logos/craft_logo_white.png`

### 2. In-App SVG Assets (HIGH confidence)

| File | Type | Current | Change To |
|------|------|---------|-----------|
| `apps/electron/src/renderer/assets/craft_logo_c.svg` | SVG file | Craft "C" icon | Kata mark |

### 3. React Icon Components (HIGH confidence)

| File | Component | Description | Action |
|------|-----------|-------------|--------|
| `apps/electron/src/renderer/components/icons/CraftAgentsLogo.tsx` | `CraftAgentsLogo` | Pixel art "CRAFT" wordmark | Replace with Kata wordmark or remove |
| `apps/electron/src/renderer/components/icons/CraftAppIcon.tsx` | `CraftAppIcon` | Displays craft_logo_c.svg | Rename, update import |
| `apps/electron/src/renderer/components/icons/CraftAgentsSymbol.tsx` | `CraftAgentsSymbol` | Displays craft_logo_c.svg | Rename, update import |
| `apps/electron/src/renderer/components/SplashScreen.tsx` | Uses `CraftAgentsSymbol` | Splash screen logo | Update import after rename |

### 4. Package Configuration (HIGH confidence)

**Root package.json:**
```json
// Line 2 - Change:
"name": "craft-agent"
// To:
"name": "kata-agents"

// Line 4 - Change description
```

**apps/electron/package.json:**
```json
// Line 2 - Change:
"name": "@craft-agent/electron"
// Line 4 - Change description
// Line 8-9 - Change author name and email
// Line 11 - Change homepage URL
```

**All workspace package.json files:**
- `packages/core/package.json` - name: `@craft-agent/core`
- `packages/shared/package.json` - name: `@craft-agent/shared`
- `packages/ui/package.json` - name: `@craft-agent/ui`
- `packages/mermaid/package.json` - name: `@craft-agent/mermaid`
- `apps/viewer/package.json` - name: `@craft-agent/viewer`

**Note:** Package names affect import paths throughout codebase. Consider keeping internal package names as-is initially and only changing user-facing names.

### 5. Electron Builder Configuration (HIGH confidence)

**apps/electron/electron-builder.yml:**
| Line | Current | Change To |
|------|---------|-----------|
| 1 | `appId: com.lukilabs.craft-agent` | `appId: sh.kata.desktop` |
| 2 | `productName: Craft Agents` | `productName: Kata Agents` |
| 3 | `copyright: Copyright ... Craft Docs Ltd.` | Keep attribution per LICENSE |
| 72, 80, 105, 138 | `artifactName: "Craft-Agent-${arch}.${ext}"` | `artifactName: "Kata-Agents-${arch}.${ext}"` |
| 86 | `title: "Craft Agents"` (DMG) | `title: "Kata Agents"` |
| 133 | `maintainer: "Craft Docs Ltd. <...>"` | Update maintainer |

### 6. Domain References (MEDIUM confidence)

**Files with `craft.do` references to evaluate:**

| Category | Pattern | Count | Action |
|----------|---------|-------|--------|
| Update server | `agents.craft.do/electron/latest` | 3 | Remove or redirect |
| Documentation | `agents.craft.do/docs` | 5+ | Update or remove |
| OAuth relay | `agents.craft.do/auth/slack/callback` | 1 | Evaluate necessity |
| MCP docs | `mcp.craft.do` | 10+ | Comment/remove |
| Session viewer | `agents.craft.do` (VIEWER_URL) | 1 | Update in branding.ts |
| Install scripts | `agents.craft.do/install-app.*` | 4 | Update or remove |
| Mermaid package | `agents.craft.do/mermaid` | 10+ | Update or remove |
| Support email | `support@craft.do` | 3 | Update |
| Security email | `security@craft.do` | 1 | Update |

**Key files:**
- `packages/shared/src/branding.ts` - VIEWER_URL constant
- `packages/shared/src/docs/doc-links.ts` - DOC_BASE_URL constant
- `packages/shared/src/version/manifest.ts` - VERSIONS_URL constant
- `apps/electron/electron-builder.yml` - publish.url
- `apps/electron/src/main/auto-update.ts` - update server reference
- `scripts/install-app.sh`, `scripts/install-app.ps1` - install scripts

### 7. Application Name References (HIGH confidence)

**Main process:**
- `apps/electron/src/main/index.ts:107` - `app.setName('Craft Agents')`
- `apps/electron/src/main/menu.ts:63-78` - Menu labels ("Craft Agents", "About Craft Agents", etc.)

**Renderer:**
- `apps/electron/src/renderer/index.html:7` - `<title>Craft Agents</title>`
- `apps/electron/src/renderer/playground.html:7` - Title
- `apps/viewer/index.html:7` - Title
- Various React components with text strings

### 8. Environment Variables (MEDIUM confidence)

| Variable | Location | Current | Consideration |
|----------|----------|---------|---------------|
| `CRAFT_DEBUG` | Multiple | Debug flag | Consider `KATA_DEBUG` |
| `CRAFT_APP_NAME` | index.ts, electron-dev.ts | App name override | Consider `KATA_APP_NAME` |
| `CRAFT_DEEPLINK_SCHEME` | index.ts, electron-dev.ts | Deep link scheme | Consider `KATA_DEEPLINK_SCHEME` |
| `CRAFT_CONFIG_DIR` | electron-dev.ts | Config directory | Consider `KATA_CONFIG_DIR` |
| `CRAFT_MCP_URL` | .env.example | MCP server URL | Keep as-is (user config) |
| `CRAFT_MCP_TOKEN` | .env.example | MCP token | Keep as-is (user config) |
| `CRAFT_LOCAL_MCP_ENABLED` | workspaces/storage.ts | Local MCP flag | Keep as-is |

### 9. Deep Link Scheme (HIGH confidence)

Current scheme: `craftagents://`
Files to update:
- `apps/electron/src/main/index.ts:97` - DEEPLINK_SCHEME constant
- `apps/electron/src/main/deep-link.ts` - JSDoc comments
- `apps/electron/README.md` - Documentation
- `README.md` - Documentation
- 40+ renderer files using `craftagents://` URLs

**Recommended new scheme:** `kata://` or `kataagents://`

### 10. Configuration Directory (MEDIUM confidence)

Current: `~/.craft-agent/`
Files with hardcoded path:
- `apps/electron/src/main/window-state.ts:31`
- `apps/electron/src/main/lib/config-watcher.ts:54`
- `packages/shared/src/utils/logo.ts:14-15`
- Multiple documentation files

**Note:** Changing this path requires migration logic for existing users.

### 11. System Prompt / Git Co-Author (LOW priority)

- `packages/shared/src/prompts/system.ts:435` - "Craft Agent" co-author email
- Comments and documentation throughout

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon generation | Manual resizing | `generate-icons.sh` script | Handles all sizes, formats, platforms |
| SVG to PNG | Online converters | `sips` or Inkscape CLI | Consistent quality, scriptable |
| ico generation | Manual tools | ImageMagick `convert` | Standard tool, handles multi-size |

## Common Pitfalls

### Pitfall 1: Incomplete Search and Replace
**What goes wrong:** Simple find/replace of "Craft" catches too much or too little
**Why it happens:** "Craft" appears in various contexts (CraftAgent class, craft.do domain, "Craft Docs Ltd." attribution)
**How to avoid:** Use targeted replacements per category, review each match
**Warning signs:** Broken imports, incorrect attribution removal

### Pitfall 2: Breaking Package Imports
**What goes wrong:** Changing `@craft-agent/*` package names breaks all imports
**Why it happens:** TypeScript path aliases and workspace references
**How to avoid:** Consider keeping internal package names or update all imports systematically
**Warning signs:** Build failures after package.json changes

### Pitfall 3: Deep Link Scheme Not Registered
**What goes wrong:** New deep link scheme doesn't work
**Why it happens:** macOS/Windows require app restart and re-registration
**How to avoid:** Test deep links after build, not just in dev mode
**Warning signs:** OAuth callbacks fail, inter-app navigation broken

### Pitfall 4: Removing Required Attribution
**What goes wrong:** Removing "Craft Docs Ltd." from places required by license
**Why it happens:** Over-eager cleanup
**How to avoid:** Keep attribution in LICENSE, NOTICE, copyright fields
**Warning signs:** License compliance violations

### Pitfall 5: Config Directory Migration
**What goes wrong:** Existing users lose their configuration
**Why it happens:** Changing `~/.craft-agent/` path without migration
**How to avoid:** Either keep the path or implement migration on first launch
**Warning signs:** Users report lost settings, credentials, workspaces

## Architecture Patterns

### Icon Generation Workflow
```
1. Export high-res PNG from assets/brand/icon-dark.svg (1024x1024)
2. cd apps/electron/resources
3. ./generate-icons.sh ../../../assets/brand/source.png
4. Verify icon.icns, icon.ico, icon.png created
5. Update icon.svg from assets/brand/icon-dark.svg
```

### Recommended Rename Strategy

```
Phase 1: User-facing names (low risk)
├── electron-builder.yml (productName, artifactName, title)
├── index.html <title>
├── menu.ts labels
└── app.setName()

Phase 2: Icons and assets (medium risk)
├── Generate new icons from brand assets
├── Replace SVG files
├── Rename React components
└── Update imports

Phase 3: Bundle ID (requires clean install to test)
├── electron-builder.yml appId
└── install-app.sh APP_BUNDLE_ID

Phase 4: Domain references (depends on infrastructure)
├── Remove/update craft.do URLs
├── Update VIEWER_URL
└── Update DOC_BASE_URL

Phase 5: Internal identifiers (optional, highest risk)
├── Package names (@craft-agent/* -> @kata/*)
├── Config directory (~/.craft-agent -> ~/.kata)
├── Environment variables (CRAFT_* -> KATA_*)
└── Deep link scheme (craftagents:// -> kata://)
```

## GitHub Release Configuration

Current release workflow: `.github/workflows/release.yml`

**Key observations:**
1. Triggers on push to main when version changes in `apps/electron/package.json`
2. Builds for macOS (arm64, x64), Windows (x64), Linux (x64)
3. Creates GitHub release with auto-generated release notes
4. Uploads artifacts: `.dmg`, `.zip`, `.exe`, `.AppImage`, `.yml`

**For v0.4.0 release:**
1. Update version in `apps/electron/package.json` to `0.4.0`
2. Complete rebranding changes
3. Push to main
4. Workflow auto-creates release `v0.4.0`

**Artifact names after rebranding:**
- `Kata-Agents-arm64.dmg`
- `Kata-Agents-x64.dmg`
- `Kata-Agents-x64.exe`
- `Kata-Agents-x64.AppImage`

## Code Examples

### Icon Generation (from existing script)
```bash
# Source: apps/electron/resources/generate-icons.sh
SOURCE="${1:-source.png}"
ICONSET="icon.iconset"
mkdir -p "$ICONSET"

# Generate all sizes for macOS iconset
sips -z 16 16 "$SOURCE" --out "$ICONSET/icon_16x16.png"
sips -z 1024 1024 "$SOURCE" --out "$ICONSET/icon_512x512@2x.png"
# ... more sizes

# Generate .icns for macOS
iconutil -c icns "$ICONSET" -o icon.icns

# Generate icon.png for Linux (512x512)
sips -z 512 512 "$SOURCE" --out icon.png
```

### Component Rename Pattern
```typescript
// Before: CraftAgentsSymbol.tsx
import iconSvg from "@/assets/craft_logo_c.svg"
export function CraftAgentsSymbol({ className }: Props) { ... }

// After: KataSymbol.tsx
import iconSvg from "@/assets/kata_mark.svg"
export function KataSymbol({ className }: Props) { ... }
```

### App Name Update
```typescript
// apps/electron/src/main/index.ts
// Before:
app.setName(process.env.CRAFT_APP_NAME || 'Craft Agents')

// After:
app.setName(process.env.KATA_APP_NAME || 'Kata Agents')
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Craft Agents | Kata Agents | Product identity |
| craftagents:// | kata:// (proposed) | Deep links |
| com.lukilabs.craft-agent | sh.kata.desktop | Bundle ID |
| ~/.craft-agent/ | ~/.kata/ (optional) | Config location |

## Open Questions

1. **Domain References**
   - What we know: Many URLs point to `agents.craft.do`
   - What's unclear: Are these services available to the fork? Will they be hosted elsewhere?
   - Recommendation: Remove/comment out for now, add back when Kata infrastructure exists

2. **Package Names**
   - What we know: Internal packages use `@craft-agent/*` namespace
   - What's unclear: Is renaming worth the import churn?
   - Recommendation: Keep internal names, only change user-facing names in Phase 2

3. **Config Directory Migration**
   - What we know: `~/.craft-agent/` contains user data
   - What's unclear: Is migration needed for a fresh fork with no existing users?
   - Recommendation: Defer migration logic unless existing users need to upgrade

4. **Deep Link Scheme**
   - What we know: `craftagents://` is hardcoded in 40+ files
   - What's unclear: What new scheme name to use?
   - Recommendation: Use `kata://` for simplicity

## Sources

### Primary (HIGH confidence)
- Codebase search results (grep, glob)
- Brand assets directory: `assets/brand/`
- Existing icon generation script: `apps/electron/resources/generate-icons.sh`
- electron-builder.yml configuration

### Secondary (MEDIUM confidence)
- WebFetch of https://kata.sh/brand - Brand guidelines
- GitHub Actions workflow: `.github/workflows/release.yml`

### Tertiary (LOW confidence)
- N/A - All findings verified with codebase inspection

## Metadata

**Confidence breakdown:**
- Icon/asset locations: HIGH - Direct file inspection
- Name references: HIGH - Comprehensive grep search
- Domain references: HIGH - Pattern search across codebase
- GitHub release config: HIGH - Workflow file inspection

**Research date:** 2026-01-29
**Valid until:** 60 days (stable domain, unlikely to change)
