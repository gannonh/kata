# Phase 1: Plugin Structure & Validation - Research

**Researched:** 2026-01-22
**Domain:** Claude Code Plugin System
**Confidence:** HIGH

## Summary

Claude Code plugins require a specific directory structure with a `.claude-plugin/plugin.json` manifest at the root. The current Kata structure (`commands/kata/`, `agents/`, `skills/kata-*/`, `hooks/`) is already 90% compatible with the plugin format. The primary work involves:

1. Creating the `.claude-plugin/plugin.json` manifest with required metadata
2. Creating `hooks/hooks.json` to register Kata's existing hook scripts
3. Validating the structure with `claude plugin validate .`
4. Testing locally with `claude --plugin-dir ./`

**Primary recommendation:** Create the plugin manifest and hooks.json referencing existing files. The current directory structure is already plugin-compatible - no reorganization needed.

## Standard Stack

### Core Requirements

| Component                    | Current State   | Plugin Requirement  | Gap                |
| ---------------------------- | --------------- | ------------------- | ------------------ |
| `.claude-plugin/plugin.json` | Missing         | Required            | Create manifest    |
| `commands/kata/*.md`         | 27 files exist  | `commands/` at root | Already compatible |
| `agents/kata-*.md`           | 12 files exist  | `agents/` at root   | Already compatible |
| `skills/kata-*/SKILL.md`     | 27 skills exist | `skills/` at root   | Already compatible |
| `hooks/*.js`                 | 2 files exist   | `hooks/hooks.json`  | Create hooks.json  |

### Alternatives Considered

| Instead of             | Could Use                   | Tradeoff                                    |
| ---------------------- | --------------------------- | ------------------------------------------- |
| Root-level directories | Custom paths in plugin.json | Unnecessary complexity; standard paths work |
| Individual hook JSON   | Single hooks.json           | Plugin system expects hooks.json            |

## Architecture Patterns

### Required Plugin Directory Structure

```
kata/
├── .claude-plugin/
│   └── plugin.json        # Required manifest (ONLY this file here)
├── commands/
│   └── kata/              # Slash commands
│       ├── phase-execute.md
│       └── ...            # 27 total
├── agents/
│   ├── kata-executor.md
│   └── ...                # 12 total
├── skills/
│   ├── kata-executing-phases/
│   │   └── SKILL.md
│   └── ...                # 27 total
├── hooks/
│   ├── hooks.json         # Hook configuration (NEW)
│   ├── kata-statusline.js
│   └── kata-check-update.js
└── README.md
```

### Pattern 1: Plugin Manifest (plugin.json)

**What:** JSON file defining plugin identity and metadata
**When to use:** Required for all plugins

```json
{
  "name": "kata",
  "version": "0.1.6",
  "description": "Spec-driven development framework for Claude Code",
  "author": {
    "name": "gannonh",
    "url": "https://github.com/gannonh"
  },
  "repository": "https://github.com/gannonh/kata",
  "license": "MIT",
  "keywords": ["claude", "claude-code", "spec-driven-development", "meta-prompting"]
}
```

Source: [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference)

### Pattern 2: Hooks Configuration (hooks.json)

**What:** JSON file registering hook scripts for lifecycle events
**When to use:** When plugin includes hooks

```json
{
  "description": "Kata framework hooks",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/kata-check-update.js"
          }
        ]
      }
    ]
  }
}
```

Source: [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)

### Pattern 3: Command Namespace

**What:** Commands are automatically namespaced with plugin name
**Behavior:** `commands/kata/phase-execute.md` becomes `/kata:phase-execute`

This already matches Kata's current structure. No changes needed.

### Anti-Patterns to Avoid

- **Putting components in .claude-plugin/:** Only `plugin.json` goes in `.claude-plugin/`. Commands, agents, skills, hooks MUST be at plugin root.
- **Using absolute paths in hooks:** Always use `${CLAUDE_PLUGIN_ROOT}` for script paths.
- **Hardcoding version numbers:** Keep plugin.json version in sync with package.json.

## Don't Hand-Roll

| Problem           | Don't Build        | Use Instead                | Why                                      |
| ----------------- | ------------------ | -------------------------- | ---------------------------------------- |
| Plugin validation | Manual JSON checks | `claude plugin validate .` | Official validator catches schema errors |
| Local testing     | Copy files around  | `claude --plugin-dir ./`   | Direct loading without installation      |
| Path resolution   | Hardcoded paths    | `${CLAUDE_PLUGIN_ROOT}`    | Works across installations               |

**Key insight:** The plugin system is designed for automatic discovery. Components in standard directories (`commands/`, `agents/`, `skills/`, `hooks/`) are found automatically - no registration in plugin.json needed.

## Common Pitfalls

### Pitfall 1: Components Inside .claude-plugin/

**What goes wrong:** Plugin loads but commands/agents/skills not discovered
**Why it happens:** Intuitive to put everything in the plugin directory
**How to avoid:** Only plugin.json goes in .claude-plugin/. Everything else at root.
**Warning signs:** Commands don't appear in `/help`, `claude --debug` shows no components

### Pitfall 2: Missing hooks.json

**What goes wrong:** Hook scripts exist but never execute
**Why it happens:** Scripts are present but not registered
**How to avoid:** Create `hooks/hooks.json` that references each script
**Warning signs:** Hooks don't fire on SessionStart, PostToolUse, etc.

### Pitfall 3: Non-Executable Hook Scripts

**What goes wrong:** Hooks fail silently
**Why it happens:** Scripts lack executable bit or shebang
**How to avoid:** Ensure `#!/usr/bin/env node` and `chmod +x`
**Warning signs:** Hook events logged but no effect

### Pitfall 4: Version Mismatch

**What goes wrong:** Confusion about installed version
**Why it happens:** plugin.json version differs from package.json
**How to avoid:** Single source of truth or sync mechanism
**Warning signs:** `/kata:whats-new` shows wrong version

### Pitfall 5: Statusline Configuration Conflict

**What goes wrong:** Plugin statusline overwrites user's custom statusline
**Why it happens:** Plugin hooks.json includes statusline config
**How to avoid:** Statusline is user preference - don't include in plugin hooks.json
**Warning signs:** User complaints about lost configuration

## Code Examples

### Complete plugin.json

```json
{
  "name": "kata",
  "version": "0.1.6",
  "description": "Spec-driven development framework for Claude Code. Provides structured workflows for requirements gathering, research, planning, execution, and verification.",
  "author": {
    "name": "gannonh",
    "url": "https://github.com/gannonh"
  },
  "homepage": "https://github.com/gannonh/kata",
  "repository": "https://github.com/gannonh/kata",
  "license": "MIT",
  "keywords": [
    "claude",
    "claude-code",
    "spec-driven-development",
    "meta-prompting",
    "context-engineering",
    "ai-development"
  ]
}
```

Source: [Claude Code Plugins Documentation](https://code.claude.com/docs/en/plugins)

### Complete hooks.json

```json
{
  "description": "Kata framework hooks for session management",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/kata-check-update.js"
          }
        ]
      }
    ]
  }
}
```

**Note:** Statusline configuration is NOT included in plugin hooks.json because:
1. It's a user preference, not plugin functionality
2. Plugin statusline would overwrite user's custom config
3. The installer already handles statusline setup separately

Source: [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)

### Validation Command

```bash
# Validate plugin structure
claude plugin validate .

# Expected output on success:
# Plugin "kata" validated successfully

# Common errors:
# - "name: Required" - Missing name field in plugin.json
# - "Invalid JSON syntax" - Malformed JSON
```

### Local Testing Command

```bash
# Start Claude Code with local plugin
claude --plugin-dir ./

# Verify commands loaded
/help  # Should show /kata:* commands

# Test a command
/kata:help
```

## State of the Art

| Old Approach                        | Current Approach                     | When Changed        | Impact                  |
| ----------------------------------- | ------------------------------------ | ------------------- | ----------------------- |
| `~/.claude/` directory installation | Plugin system with `.claude-plugin/` | Claude Code 1.0.33+ | Standard packaging      |
| Manual file copying                 | `claude plugin install`              | 2025                | Simplified distribution |
| Settings.json hooks                 | hooks/hooks.json in plugins          | 2025                | Plugin-scoped hooks     |

**Deprecated/outdated:**
- Manual installation via `npx @gannonh/kata` will still work but plugin system is preferred
- `hooks/` without `hooks.json` - plugin system requires the JSON config file

## Kata-Specific Considerations

### Current Inventory

| Component | Count | Notes                                        |
| --------- | ----- | -------------------------------------------- |
| Commands  | 27    | `commands/kata/*.md`                         |
| Agents    | 12    | `agents/kata-*.md`                           |
| Skills    | 27    | `skills/kata-*/SKILL.md`                     |
| Hooks     | 2     | `kata-statusline.js`, `kata-check-update.js` |

### Namespace Behavior

The plugin name "kata" combined with command folder "kata" results in:
- `commands/kata/phase-execute.md` -> `/kata:phase-execute`

This matches the existing command naming convention. No renaming needed.

### Migration from npm Package

The current `bin/install.js` handles:
1. Copying files to `~/.claude/`
2. Configuring statusline in settings.json
3. Registering hooks in settings.json

As a plugin:
- File copying handled by plugin system
- Statusline configuration becomes user choice (not plugin responsibility)
- Hook registration via `hooks/hooks.json`

The npm installer can remain for users who prefer it, but plugin installation becomes the primary method.

## Open Questions

Things that couldn't be fully resolved:

1. **Dual Distribution Strategy**
   - What we know: Both npm install and plugin install should work
   - What's unclear: Should bin/install.js be deprecated or maintained alongside?
   - Recommendation: Maintain both for v0.1.9, evaluate deprecation in future

2. **Statusline in Plugin Context**
   - What we know: Plugin hooks.json shouldn't include statusline (user preference)
   - What's unclear: How to offer statusline to plugin users
   - Recommendation: Document statusline setup separately, keep out of plugin

3. **Version Synchronization**
   - What we know: plugin.json and package.json both have version
   - What's unclear: Best way to keep in sync
   - Recommendation: Manual sync for v0.1.9, consider build script later

## Sources

### Primary (HIGH confidence)
- [Claude Code Plugins Documentation](https://code.claude.com/docs/en/plugins) - Plugin structure, testing
- [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference) - Schema details
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) - hooks.json format
- [GitHub anthropics/claude-code plugins README](https://github.com/anthropics/claude-code/blob/main/plugins/README.md) - Directory structure

### Secondary (MEDIUM confidence)
- WebSearch verified against official docs for plugin CLI commands

### Tertiary (LOW confidence)
- None - all findings verified with official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official documentation comprehensive
- Architecture: HIGH - Well-documented structure requirements
- Pitfalls: HIGH - Based on official troubleshooting docs
- Hooks.json format: HIGH - Official hooks reference

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - stable plugin API)
