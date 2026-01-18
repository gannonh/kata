# Phase 1: Integration Architecture - Research

**Researched:** 2026-01-17
**Domain:** Extensible integration system for Claude Code meta-prompting
**Confidence:** HIGH

## Summary

This phase establishes an extensible integration architecture for GSD Enterprise that enables GitHub (and future Linear, Jira, etc.) integrations to hook into GSD workflow events without modifying core GSD code. The architecture must work as a wrapper/extension of upstream GSD, using native Claude Code capabilities.

The research reveals three complementary extension mechanisms in Claude Code that can be combined for a robust integration architecture:

1. **Hooks** - Shell commands that execute at workflow lifecycle events (PreToolUse, PostToolUse, Stop, etc.)
2. **Agent Skills** - Markdown files that teach Claude domain-specific capabilities with progressive disclosure
3. **MCP** - Model Context Protocol for connecting to external tools like GitHub

The recommended approach is a **Skill-based integration architecture** where integrations are packaged as Agent Skills with associated hooks. This provides:
- Clear extension points (Skills define capabilities, hooks wire events)
- No core modification required (Skills are discovered automatically)
- Native platform support (leverages Claude Code's built-in mechanisms)
- Future-proof design (MCP for API calls, Skills for behavior)

**Primary recommendation:** Build integrations as Agent Skills that combine markdown capability definitions, hook scripts for event wiring, and MCP server configuration for API access.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library/Tool | Version | Purpose | Why Standard |
|--------------|---------|---------|--------------|
| Claude Code Hooks | Current | Event-driven integration wiring | Native, no dependencies, shell-based matches GSD's design |
| Claude Code Agent Skills | Current | Integration capability packaging | Native, markdown-based matches GSD's meta-prompting approach |
| GitHub MCP Server | Current | GitHub API access (issues, PRs, CI) | Official GitHub implementation, OAuth support |
| `gh` CLI | 2.x | Fallback GitHub operations | Pre-installed, well-documented, works without MCP |

### Supporting

| Library/Tool | Version | Purpose | When to Use |
|--------------|---------|---------|-------------|
| jq | 1.7+ | JSON parsing in hook scripts | Already used in GSD hooks |
| yq | 4.x | YAML parsing for frontmatter extraction | Parsing plan/summary metadata |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Agent Skills | Pure Hooks | Hooks lack progressive disclosure; Skills more maintainable |
| MCP Server | Direct `gh` CLI | MCP is more integrated with Claude; `gh` requires shell escaping |
| Event hooks | Polling/cron | Polling adds complexity; hooks are event-driven and synchronous |
| Custom event bus | Claude Code Hooks | Would require runtime code; hooks are native and sufficient |

**Installation:**
```bash
# GitHub MCP Server (for API access)
claude mcp add --transport http github https://api.githubcopilot.com/mcp/

# Then authenticate in Claude Code
/mcp
```

No npm dependencies required - all native Claude Code capabilities.

## Architecture Patterns

### Recommended Project Structure

```
.claude/
  skills/
    github-integration/
      SKILL.md              # Integration capability definition
      events.md             # GSD event -> GitHub action mappings
      templates/
        issue.md            # Issue creation template
        pr.md               # PR creation template
    [future: linear-integration/]
  hooks/
    hooks.json              # Hook configuration
    scripts/
      on-phase-complete.sh  # Emit integration events
      on-execute-start.sh   # Start tracking
.planning/
  integrations/
    INTEGRATIONS.md         # Active integrations registry
    github/
      config.json           # GitHub-specific settings
```

### Pattern 1: Skill-Based Integration

**What:** Package each integration as an Agent Skill with associated hooks and configuration.

**When to use:** Always - this is the recommended pattern for all integrations.

**Structure:**
```yaml
# .claude/skills/github-integration/SKILL.md
---
name: github-integration
description: Sync GSD phases with GitHub Issues and PRs. Triggers on phase/plan completion, creates issues from milestones, PRs from completed phases.
hooks:
  PostToolUse:
    - matcher: "Task"
      hooks:
        - type: command
          command: "./scripts/check-gsd-event.sh"
---

# GitHub Integration for GSD

## Capabilities

- Create GitHub issues from GSD phases
- Create PRs after execute-phase completes
- Sync issue status with plan progress
- Post review comments on PRs

## Event Mappings

See [events.md](events.md) for GSD event -> GitHub action mappings.
```

### Pattern 2: Event-Hook Wiring

**What:** Use Claude Code hooks to detect GSD workflow events and trigger integration actions.

**When to use:** For wiring GSD events to integration capabilities.

**Key insight:** GSD workflow events can be detected by hooking into `PostToolUse` for the `Task` tool (subagent completion) and checking for GSD-specific patterns in the transcript.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/scripts/on-task-complete.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/scripts/on-stop.sh"
          }
        ]
      }
    ]
  }
}
```

### Pattern 3: Integration Registry

**What:** Track active integrations in a central registry that GSD commands can query.

**When to use:** To enable/disable integrations without code changes.

```markdown
# .planning/integrations/INTEGRATIONS.md

## Active Integrations

| Integration | Status | Config |
|-------------|--------|--------|
| github | enabled | .planning/integrations/github/config.json |
| linear | disabled | - |

## Integration Events

GSD emits these events that integrations can subscribe to:

| Event | When | Payload |
|-------|------|---------|
| phase:start | /kata:execute-phase begins | phase_number, phase_name |
| phase:complete | Phase verification passes | phase_number, summary_path |
| plan:start | Executor spawned | plan_id, plan_path |
| plan:complete | SUMMARY.md created | plan_id, summary_path, commits |
| task:complete | Task committed | task_number, commit_hash |
```

### Anti-Patterns to Avoid

- **Hardcoded integration calls in commands:** Don't modify upstream GSD commands to call GitHub directly. Use hooks and skills to intercept events.

- **Monolithic integration files:** Don't put all GitHub logic in one huge file. Use progressive disclosure with multiple files.

- **Polling for state changes:** Don't poll `.planning/` for changes. Use hooks that fire on events.

- **Custom event bus:** Don't build a custom pub/sub system. Claude Code hooks provide this natively.

- **Runtime code dependencies:** Don't require Node.js modules for integrations. Keep them shell + markdown like core GSD.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub API access | Custom HTTP calls | GitHub MCP Server | OAuth handling, rate limiting, proper API coverage |
| Event pub/sub | Custom event emitter | Claude Code Hooks | Native, no dependencies, battle-tested |
| Capability packaging | Custom loading system | Agent Skills | Progressive disclosure, auto-discovery, native |
| Issue/PR templates | Hardcoded strings | Skill markdown files | Maintainable, user-editable, version controlled |
| Authentication | Manual token management | MCP OAuth flow | Secure, automatic refresh, browser-based |

**Key insight:** Claude Code already provides all the infrastructure for extensibility. The work is in wiring GSD events to these mechanisms, not building new mechanisms.

## Common Pitfalls

### Pitfall 1: Over-Engineering the Event System

**What goes wrong:** Building a complex event bus with queues, persistence, and retry logic.

**Why it happens:** Developers expect integrations to need enterprise event infrastructure.

**How to avoid:** Claude Code hooks are synchronous and fire on every event. GSD plans are atomic. If a hook fails, the GSD command shows the error. Keep it simple.

**Warning signs:** Designing message queues, retry policies, event storage.

### Pitfall 2: Modifying Upstream GSD Commands

**What goes wrong:** Adding GitHub-specific code to execute-phase.md or other core commands.

**Why it happens:** Seems like the "obvious" place to add integration points.

**How to avoid:** Use hooks and skills that intercept events without touching upstream files. This keeps the fork minimal and allows pulling upstream changes.

**Warning signs:** Changes to files in `commands/kata/`, `agents/`, or `kata/workflows/`.

### Pitfall 3: Ignoring Progressive Disclosure

**What goes wrong:** Loading entire integration configuration into context at startup.

**Why it happens:** Seems easier than managing multiple files.

**How to avoid:** Use Agent Skills' multi-file pattern. SKILL.md is the entry point; detailed docs in separate files loaded on demand.

**Warning signs:** SKILL.md files over 500 lines, loading all config at session start.

### Pitfall 4: Brittle Event Detection

**What goes wrong:** Parsing GSD command output with fragile regex patterns.

**Why it happens:** Hooks receive raw tool output, tempting regex parsing.

**How to avoid:** Check for artifact existence (SUMMARY.md created, git commits made) rather than parsing output text. File presence is definitive.

**Warning signs:** Complex regex in hook scripts, parsing Claude's natural language output.

### Pitfall 5: Blocking Long Operations in Hooks

**What goes wrong:** Hook makes slow API calls, causing Claude Code to appear frozen.

**Why it happens:** Hooks run synchronously; slow hooks block the workflow.

**How to avoid:** Keep hooks fast (< 5 seconds). For slow operations, hooks can write to a queue file and a background process handles them, or use the hook to trigger an async workflow.

**Warning signs:** Hook scripts with multiple API calls, hooks that timeout.

## Code Examples

Verified patterns from official sources:

### Hook: Detect Phase Completion

```bash
#!/usr/bin/env bash
# .claude/hooks/scripts/on-task-complete.sh
# Detects GSD phase completion and triggers integration events

# Read hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Only process Task tool completions (GSD subagent returns)
if [ "$TOOL_NAME" != "Task" ]; then
  exit 0
fi

# Check if this was a kata-verifier completing with "passed" status
# by checking for VERIFICATION.md creation
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Look for recently created VERIFICATION.md files
RECENT_VERIFICATION=$(find "$CWD/.planning/phases" -name "*-VERIFICATION.md" -mmin -1 2>/dev/null | head -1)

if [ -n "$RECENT_VERIFICATION" ]; then
  # Extract phase number and check status
  STATUS=$(grep "^status:" "$RECENT_VERIFICATION" | cut -d: -f2 | tr -d ' ')
  if [ "$STATUS" = "passed" ]; then
    PHASE_DIR=$(dirname "$RECENT_VERIFICATION")
    PHASE_NAME=$(basename "$PHASE_DIR")

    # Write event for integration processing
    echo "{\"event\": \"phase:complete\", \"phase\": \"$PHASE_NAME\", \"verification\": \"$RECENT_VERIFICATION\"}" \
      >> "$CWD/.planning/integrations/events.jsonl"
  fi
fi

exit 0
```

### Skill: GitHub Integration Entry Point

```yaml
# .claude/skills/github-integration/SKILL.md
---
name: github-integration
description: |
  Integrates GSD workflow with GitHub. Creates issues from phases,
  PRs from completed work, syncs status bidirectionally.
  Triggers when: executing phases, completing plans, reviewing PRs.
hooks:
  PostToolUse:
    - matcher: "Task"
      hooks:
        - type: command
          command: ".claude/hooks/scripts/check-gsd-event.sh"
---

# GitHub Integration

This skill enables GSD to sync with GitHub Issues and Pull Requests.

## Capabilities

1. **Issue Sync**: Create GitHub issues from GSD phases/plans
2. **PR Creation**: Auto-create PRs after execute-phase completes
3. **Status Sync**: Update issue status as plans progress
4. **PR Reviews**: Post Claude's reviews as GitHub comments

## Configuration

See [config.md](config.md) for repository setup.

## Event Mappings

See [events.md](events.md) for which GSD events trigger GitHub actions.

## Templates

- [Issue template](templates/issue.md)
- [PR template](templates/pr.md)

## Usage

The integration activates automatically. To manually trigger:

- Create issue: "Create a GitHub issue for phase 2"
- Create PR: "Create a PR for the completed phase"
- Sync status: "Update GitHub issue #123 to in-progress"
```

### Integration Registry Pattern

```markdown
# .planning/integrations/INTEGRATIONS.md

**Last updated:** 2026-01-17

## Active Integrations

| Integration | Status | Skill | Config |
|-------------|--------|-------|--------|
| github | enabled | github-integration | github/config.json |

## Event Subscriptions

Integrations subscribe to GSD workflow events via hooks.

### Available Events

| Event | Trigger | Data |
|-------|---------|------|
| `phase:start` | execute-phase begins | phase_number, phase_name, goal |
| `phase:complete` | verification passes | phase_number, verification_path |
| `plan:start` | executor spawned | plan_id, plan_path |
| `plan:complete` | SUMMARY.md created | plan_id, summary_path, commits[] |
| `milestone:complete` | all phases done | milestone_name, phases[] |

### GitHub Integration Events

| GSD Event | GitHub Action |
|-----------|---------------|
| phase:start | Update linked issue to "In Progress" |
| phase:complete | Create PR, close linked issue |
| plan:complete | Comment progress on linked issue |
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct API calls in commands | MCP Servers | 2025 | Unified auth, rate limiting, better errors |
| Custom plugin systems | Agent Skills | 2025-10 | Native support, auto-discovery, hot-reload |
| Manual tool invocation | Automatic skill matching | 2025-10 | Skills activate based on request context |
| Hardcoded integrations | Hooks + Skills | 2025 | Extensible without core changes |

**Deprecated/outdated:**
- **@modelcontextprotocol/server-github npm package**: Deprecated April 2025. Use official GitHub MCP server at `https://api.githubcopilot.com/mcp/`.
- **Direct slash commands for integrations**: Skills with good descriptions activate automatically based on context.

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal hook event granularity**
   - What we know: PostToolUse on Task catches subagent completions; Stop catches command completion
   - What's unclear: Whether finer-grained events (per-task commits) are needed or if plan-level is sufficient
   - Recommendation: Start with plan-level events (plan:complete, phase:complete), add task-level if needed

2. **MCP vs gh CLI for GitHub operations**
   - What we know: MCP is more integrated, but `gh` CLI is always available and well-documented
   - What's unclear: Whether MCP reliability is sufficient for all GitHub operations
   - Recommendation: Primary: MCP Server. Fallback: `gh` CLI for operations MCP doesn't support or when MCP has issues

3. **Integration state persistence across sessions**
   - What we know: Skills hot-reload, hooks are read at startup, .planning/ persists
   - What's unclear: Best way to track "which GitHub issue links to which phase" across sessions
   - Recommendation: Store mapping in `.planning/integrations/github/state.json`, read on skill activation

## Sources

### Primary (HIGH confidence)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) - Complete hook configuration
- [Claude Code Agent Skills](https://code.claude.com/docs/en/skills) - Skill structure and patterns
- [Claude Code MCP](https://code.claude.com/docs/en/mcp) - MCP server configuration
- [GitHub MCP Server](https://github.com/github/github-mcp-server) - Official GitHub implementation

### Secondary (MEDIUM confidence)
- [Anthropic Skills Announcement](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) - Design principles
- [GitHub CLI Docs](https://cli.github.com/manual/) - gh command reference
- GSD Codebase Analysis (local) - Architecture patterns, hook usage

### Tertiary (LOW confidence)
- Community MCP servers (various GitHub repos) - Implementation patterns
- WebSearch results on event-driven architecture - General patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on official Claude Code documentation
- Architecture: HIGH - Directly follows native extension mechanisms
- Pitfalls: MEDIUM - Derived from GSD patterns and general integration experience
- Event detection: MEDIUM - Specific to GSD, requires validation during implementation

**Research date:** 2026-01-17
**Valid until:** 2026-02-17 (30 days - Claude Code features are stable)
