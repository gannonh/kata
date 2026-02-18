# Technology Stack

**Analysis Date:** 2026-02-18

## Languages

**Primary:**
- JavaScript (Node.js) - Project build system, test suite, skill scripts, codebase analysis
- Markdown - Skill definitions, documentation, workflows, references (majority of codebase)
- Bash - Task execution scripts, Git operations, system integration

## Runtime

**Environment:**
- Node.js 20.0.0+ (specified in `package.json` engines field)

**Package Manager:**
- npm - Dependency management, script orchestration
- Lockfile: `package-lock.json` present and committed

## Frameworks

**Core:**
- Claude Code Plugin SDK - Primary runtime (plugin architecture for skills)
- Node.js test runner (`node:test`) - Native testing without external dependencies

**Testing:**
- Node built-in `node:test` module - Unit and integration testing
- Node `node:assert` module - Assertion library
- junit-xml reporter via `--test-reporter junit` for CI integration

**Build/Dev:**
- Custom build script (`scripts/build.js`) - Plugin and distribution target assembly
- Bash/Node.js hybrid scripts - Task execution, shell utilities, Git operations

## Key Dependencies

**Zero external npm dependencies.** Project is dependency-free in `package.json`.

**Built-in modules used:**
- `node:fs` - File I/O
- `node:path` - Path manipulation
- `node:child_process` - Subprocess execution (execSync for bash)
- `node:test` - Test runner
- `node:assert` - Assertions

**System dependencies (not npm):**
- Git 2.20+ - Version control operations
- GitHub CLI (`gh`) - GitHub Milestone/Issue/PR management
- bash - Script execution
- Standard UNIX tools - find, grep, sed, xargs, mktemp

## Configuration

**Environment:**
- Project config: `.planning/config.json` (JSON with workflow and integration settings)
- No `.env` files required (zero secrets handling)

**Build:**
- `scripts/build.js` - Reads `package.json` version, builds plugin and skills-sh distributions
- Distribution targets:
  - `dist/plugin/` - Claude Code marketplace plugin
  - `dist/skills-sh/` - Alternative skills.sh distribution
- VERSION file auto-generated in plugin

**CLI targets:**
- `npm run build:plugin` - Build Claude Code plugin
- `npm run build:skills-sh` - Build skills.sh distribution
- `npm run build` - Alias for build:plugin

## Platform Requirements

**Development:**
- Node.js 20.0.0+
- Git 2.20+
- GitHub CLI (`gh`) for GitHub integration
- bash 4.0+
- Standard UNIX tools

**Production:**
- Claude Code CLI (plugin runtime)
- GitHub account optional (for `github.enabled: true`)
- Git repository (required for Kata workflow)

## Testing Infrastructure

**Test runner:** Node built-in `node:test`

**Test files location:** `tests/`

**Test coverage:**
- `tests/build.test.js` - Plugin build artifact validation
- `tests/smoke.test.js` - Integration smoke tests
- `tests/artifact-validation.test.js` - Generated artifact validation
- `tests/migration-validation.test.js` - Migration support
- `tests/scripts/` - Individual script tests (read-config, project-root, template-system, etc.)
- `tests/skills/` - Skill-specific validation tests

**Test commands:**
- `npm test` - Core tests (build + migration)
- `npm run test:smoke` - Integration tests
- `npm run test:scripts` - Script validation
- `npm run test:artifacts` - Artifact validation
- `npm run test:all` - All tests
- `npm run test:affected` - Only tests affected by current branch

## Distribution

**Package distribution:**
- Published to Claude Code marketplace as `@gannonh/kata`
- Available via `/plugin install @gannonh/kata`
- Version synced between `package.json` and `dist/plugin/.claude-plugin/plugin.json`
- GitHub Actions CI auto-publishes on version changes

**Plugin entry:**
- Skills (primary interface) in `dist/plugin/skills/`
- Each skill mapped to `/kata-{skill-name}` command

---

*Stack analysis: 2026-02-18*
