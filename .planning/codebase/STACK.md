# Technology Stack

**Analysis Date:** 2026-01-16

## Languages

**Primary:**
- JavaScript (Node.js) - Core installer script (`bin/install.js`)
- Markdown - Commands, agents, templates, workflows, references (95% of codebase)

**Secondary:**
- Bash - Shell hooks (`hooks/*.sh`)
- JSON - Configuration templates (`kata/templates/config.json`)

## Runtime

**Environment:**
- Node.js >= 16.7.0 (specified in `package.json` engines field)

**Package Manager:**
- npm (published to npm registry as `kata-cli`)
- Lockfile: Not committed (`.gitignore` excludes `package-lock.json`)

## Frameworks

**Core:**
- Claude Code CLI - Target platform (slash commands, agents, hooks)
- No application frameworks - Pure meta-prompting system

**Testing:**
- None - No test framework configured

**Build/Dev:**
- None - No build step required, distributed as-is

## Key Dependencies

**Critical:**
- Zero runtime dependencies - `package.json` has no `dependencies` or `devDependencies`
- Uses only Node.js built-in modules:
  - `fs` - File system operations
  - `path` - Path manipulation
  - `os` - Home directory detection
  - `readline` - Interactive prompts

**Infrastructure:**
- `jq` - JSON parsing in shell hooks (expected on system)
- `npm` - Package distribution and update checking

## Configuration

**Environment:**
- `CLAUDE_CONFIG_DIR` - Optional custom Claude config directory
- Supports `~/.claude/` (global) or `./.claude/` (local) installation

**Build:**
- No build configuration - pure distribution package
- `package.json` defines `bin` for npx execution
- `files` array specifies distributed content: `bin`, `commands`, `kata`, `agents`, `hooks`

## Platform Requirements

**Development:**
- Node.js >= 16.7.0
- Works on Mac, Windows (via Git Bash/WSL), Linux

**Production:**
- Claude Code CLI must be installed
- Optional: `jq` for statusline features
- Optional: Notification tools per platform:
  - Mac: `osascript` (built-in)
  - Linux: `notify-send` or `zenity`
  - Windows: `powershell.exe`

## Distribution

**Package:**
- npm package: `kata-cli`
- Version: 1.5.26
- License: MIT

**Installation:**
```bash
npx kata-cli           # Interactive
npx kata-cli --global  # Non-interactive global
npx kata-cli --local   # Non-interactive local
```

---

*Stack analysis: 2026-01-16*
