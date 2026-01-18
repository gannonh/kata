# External Integrations

**Analysis Date:** 2026-01-16

## APIs & External Services

**Claude Code CLI:**
- Primary integration target - Kata is a meta-prompting layer for Claude Code
- Integration mechanism: Slash commands in `commands/kata/*.md`
- Agent definitions in `agents/kata-*.md`
- Hooks in `hooks/*.sh` and `hooks/*.js`
- Settings configuration in `settings.json`

**Context7 MCP (Model Context Protocol):**
- Used by research agents for library documentation
- Tools: `mcp__context7__resolve-library-id`, `mcp__context7__query-docs`
- Agents using it:
  - `agents/kata-planner.md`
  - `agents/kata-phase-researcher.md`
  - `agents/kata-project-researcher.md`

**WebSearch & WebFetch:**
- Used by research agents for external information
- Agents using them:
  - `agents/kata-phase-researcher.md`
  - `agents/kata-project-researcher.md`
  - `agents/kata-debugger.md`

**npm Registry:**
- Update checking: `npm view kata-cli version` in `hooks/kata-check-update.js`
- Package distribution via npm

## Data Storage

**Databases:**
- None - Kata is stateless between sessions

**File Storage:**
- Local filesystem only
- Planning artifacts: `.planning/` directory
- Configuration: `~/.claude/` or `./.claude/`
- Cache: `~/.claude/cache/` (update check results)
- Todos: `~/.claude/todos/` (session-scoped task lists)

**Caching:**
- `~/.claude/cache/kata-update-check.json` - Update availability cache

## Authentication & Identity

**Auth Provider:**
- None - Relies on Claude Code CLI authentication
- No user accounts or API keys required by Kata itself

## Monitoring & Observability

**Error Tracking:**
- None - No external error tracking

**Logs:**
- No structured logging
- Shell scripts output to stdout/stderr
- Claude Code provides session transcripts

## CI/CD & Deployment

**Hosting:**
- npm registry for package distribution
- GitHub for source code (`github.com/gannonh/kata`)

**CI Pipeline:**
- None detected - No GitHub Actions workflows
- Manual release process (`npm publish`)

## Environment Configuration

**Required env vars:**
- None required

**Optional env vars:**
- `CLAUDE_CONFIG_DIR` - Custom Claude config directory location

**Secrets location:**
- No secrets required by Kata itself
- User's Claude Code credentials managed externally

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Claude Code Integration Points

**Slash Commands (`commands/kata/`):**
- 29 commands total
- Key commands: `new-project.md`, `plan-phase.md`, `execute-phase.md`, `debug.md`
- Commands use frontmatter for metadata and tool permissions

**Agents (`agents/`):**
- 11 agent definitions
- Key agents: `kata-planner.md`, `kata-executor.md`, `kata-debugger.md`, `kata-verifier.md`
- Agents define tools, colors, and detailed execution flows

**Hooks (`hooks/`):**
- `statusline.sh` - Status bar showing model, task, context usage
- `kata-notify.sh` - Completion notifications (cross-platform)
- `kata-check-update.js` - Background update checking

**Settings Integration (`settings.json`):**
- `hooks.SessionStart` - Update check on session start
- `hooks.Stop` - Notification on session stop
- `statusLine` - Custom status bar command

## Claude Code Tool Dependencies

**Standard tools used by agents:**
- `Read`, `Write`, `Edit` - File operations
- `Bash` - Shell commands
- `Glob`, `Grep` - File search
- `Task` - Subagent spawning
- `TodoWrite` - Task tracking
- `AskUserQuestion` - User interaction
- `WebSearch`, `WebFetch` - Internet access (research agents)

---

*Integration audit: 2026-01-16*
