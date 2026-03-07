# Technology Stack

**Analysis Date:** 2026-01-29

## Languages

**Primary:**
- TypeScript 5.0+ - Core application language (monorepo, all packages and apps)
- TSX - React component syntax (Electron renderer, viewer, marketing apps)
- JavaScript/Node.js - Shell scripts and build tools

**Secondary:**
- CSS/Tailwind CSS - UI styling (v4.1.18)
- Bash - Build and deployment scripts
- PowerShell - Windows build scripts (apps/electron/scripts/build-win.ps1)
- Objective-C/Swift - macOS build artifacts (electron-builder integration)

## Runtime

**Environment:**
- Bun (latest stable) - Primary package manager and runtime for monorepo
- Node.js >= 18.0.0 - Required for Electron app (specified in `apps/electron/package.json`)
- Electron 39.2.7 - Desktop app runtime (Chromium-based)

**Package Manager:**
- Bun - Main package manager for monorepo
- Lockfile: `bun.lock` (present in repo root)
- Workspace: Monorepo via Bun workspaces (`packages/*` and `apps/*`)

## Frameworks

**Core:**
- React 18.3.1 - UI framework (Electron renderer, viewer, marketing apps)
- Electron 39.2.7 - Desktop application framework with main/renderer/preload process architecture
- Vite 6.2.4 - Build tool and dev server for renderer process

**Agent & AI:**
- @anthropic-ai/claude-agent-sdk 0.2.19 - Claude Agent SDK for AI-driven agent execution
- @anthropic-ai/sdk 0.71.1 - Anthropic API client (messages, tokens, models)
- @modelcontextprotocol/sdk 1.24.3 - Model Context Protocol (MCP) SDK for tool/resource servers

**UI Component Libraries:**
- Radix UI - Headless UI components (@radix-ui/react-*)
  - Avatar, collapsible, dropdown-menu, scroll-area, select, separator, slot, tabs, tooltip
- TailwindCSS 4.1.18 - Utility-first CSS framework with Vite plugin
- Lucide React 0.561.0 - Icon library
- Class Variance Authority 0.7.1 - Component styling utility
- clsx 2.1.1 - Conditional CSS class merging
- Tailwind Merge 3.4.0 - Merge utility classes safely

**Markdown & Document Processing:**
- React Markdown 10.1.0 - Markdown rendering in React
- Marked 17.0.1 - Markdown parser
- Remark (with plugins) - Unified markdown processor
- Rehype Raw 7.0.0 - Unsafe HTML in markdown
- Remark GFM 4.0.1 - GitHub-flavored Markdown support
- Gray Matter 4.0.3 - YAML frontmatter parsing
- Shiki 3.19.0 - Syntax highlighting for code blocks
- MarkitDown 0.0.14 - Multi-format document conversion

**UI State & Effects:**
- Jotai 2.16.0 - Atomic state management (React hooks)
- Jotai Family 1.0.1 - Family API for atom factories
- Motion 12.23.26 - Animation library
- Next Themes 0.4.6 - Theme management
- React Resizable Panels 3.0.6 - Resizable UI panels
- React Table 8.21.3 - Data table library
- CMDk 1.1.1 - Command palette component
- Vaul 1.1.2 - Drawer component
- Sonner 2.0.7 - Toast notifications

**Development & Build:**
- TypeScript 5.0.0 - Language with type checking
- ESBuild 0.25.0 - Fast JS bundler (used for Electron main/preload)
- Rollup - Module bundler (Vite uses internally)
- Electron Builder 26.0.12 - Package Electron app for distribution
- Electron Packager 19.0.1 - Alternative packaging utility
- Vite 6.2.4 - Fast build tool and dev server
- PostCSS 8.5.6 - CSS transformation (required by Tailwind)

**Linting & Code Quality:**
- ESLint 9.39.2 - JavaScript/TypeScript linting
- @typescript-eslint/eslint-plugin 8.52.0 - TypeScript-specific rules
- @typescript-eslint/parser 8.52.0 - TypeScript parser for ESLint
- Eslint-plugin-react 7.37.5 - React-specific rules
- Eslint-plugin-react-hooks 7.0.1 - React hooks rules

**Testing:**
- Bun test - Built-in test runner (used for unit tests)
- Test command: `bun test` (from package.json root)

**Monitoring & Error Tracking:**
- @sentry/electron 7.7.0 - Error tracking for Electron main process
- @sentry/react 10.36.0 - Error tracking for React renderer
- @sentry/vite-plugin 4.8.0 - Vite plugin for source map uploads (currently disabled)

## Key Dependencies

**Critical - Anthropic:**
- @anthropic-ai/claude-agent-sdk ^0.2.19 - Agent SDK with session management, MCP integration, tool permissions
- @anthropic-ai/sdk ^0.71.1 - Claude API client (messages, tokens, models, vision)

**Critical - MCP:**
- @modelcontextprotocol/sdk ^1.24.3 - MCP client and server implementation

**Infrastructure:**
- Bash parser 0.5.0 - Parse bash scripts for permission validation
- Filtrex 3.1.0 - Expression evaluation for dynamic filtering
- Shell quote 1.8.3 - Shell command quoting utilities
- Incr-regex-package 1.0.4 - Incremental regex for parsing

**UI & Rendering:**
- React PDF 10.3.0 - PDF rendering in browser (viewer app)
- React Simple Code Editor 0.14.1 - Inline code editor
- Date FNS 4.1.0 - Date manipulation
- Linkify-it 5.0.0 - URL/link parsing
- Unist Util Visit 5.0.0 - AST traversal (markdown)
- Strip Markdown 6.0.0 - Remove markdown formatting

**D&D Kit (Drag and Drop):**
- @dnd-kit/core 6.3.1 - Headless drag-drop library
- @dnd-kit/sortable 10.0.0 - Sortable integration
- @dnd-kit/utilities 3.2.2 - Utilities

**Other:**
- Electron Log 5.4.3 - Structured logging for Electron
- Electron Updater 6.7.3 - Auto-update support
- Open 11.0.0 - Open URLs/apps in default browser
- Semver 7.7.3 - Semantic versioning utilities
- Zod 4.0.0 - Schema validation (used in `src/shared`)
- UUID 11.0.0 - Unique ID generation
- TTL Cache 2.1.4 - Time-to-live caching
- @paper-design/shaders-react 0.0.69 - Shader-based visual effects
- @pierre/diffs 1.0.4 - Diff computation
- Chrono Node 2.9.0 - Natural language date parsing

## Configuration

**Environment:**
- Environment variables configured via `.env` file (see `.env.example`)
- Required vars: `ANTHROPIC_API_KEY`, `CRAFT_MCP_URL`, `CRAFT_MCP_TOKEN`
- OAuth vars injected at build time via esbuild `--define` (Google, Slack, Microsoft client IDs)
- Sentry DSN injected at build time: `SENTRY_ELECTRON_INGEST_URL`

**Build Configuration:**
- `bunfig.toml` - Bun runtime configuration (preload interceptor)
- `tsconfig.json` - TypeScript compiler settings (ESNext target, strict mode, path aliases)
- `apps/electron/electron-builder.yml` - Electron distribution config (DMG, NSIS, AppImage targets)
- `apps/electron/vite.config.ts` - Electron renderer build config
- `apps/viewer/vite.config.ts` - Viewer app Vite config
- `apps/marketing/vite.config.ts` - Marketing app Vite config
- `.eslintrc` - ESLint configuration (managed per-workspace or globally)

**Build Scripts:**
- `scripts/electron-build-main.ts` - esbuild for Electron main process
- `scripts/electron-build-preload.ts` - esbuild for preload script
- `scripts/electron-build-renderer.ts` - Vite build for renderer
- `scripts/electron-dev.ts` - Development build with hot reload
- `scripts/release.ts` - Release/versioning automation
- `scripts/build.ts` - Main monorepo build orchestrator

## Platform Requirements

**Development:**
- macOS, Windows (x64), or Linux (x64) for development
- Bun runtime
- Node.js 18+ (for Electron compatibility)
- For macOS: Xcode command-line tools (for native builds)

**Production:**
- macOS (arm64, x64) - DMG installer with Liquid Glass icon support (macOS 26+)
- Windows (x64) - NSIS installer to %LOCALAPPDATA% (per-user, not Program Files)
- Linux (x64) - AppImage format
- Auto-updates via electron-updater from `https://agents.craft.do/electron/latest`

**Distribution Artifacts:**
- Predictable naming: `Kata-Agents-${arch}.dmg`, `Kata-Agents-${arch}.exe`, `Kata-Agents-${arch}.AppImage`
- Code signing & notarization disabled by default (requires CSC_LINK, APPLE_ID env vars)
- No ASAR compression (disabled for performance)

---

*Stack analysis: 2026-01-29*
