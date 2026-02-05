# Phase 0: Hard Fork & Rebrand - Research

**Researched:** 2026-01-18
**Domain:** Project rebranding, git repository management, npm package naming
**Confidence:** HIGH

## Summary

This phase involves a complete separation from the upstream GSD project (glittercowboy/get-shit-done) and establishing an independent identity as "GSD Enterprise." The scope is well-defined: rename identifiers, update documentation, reconfigure git, and prepare for independent npm publishing.

The codebase has been thoroughly audited. References to the original project exist in 15+ files across documentation, package configuration, install scripts, and asset files. The current project name "kata-cli" (npm package) and "Kata" (product name) will be replaced with "gsd-enterprise" and "GSD Enterprise" respectively.

**Primary recommendation:** Execute a systematic find-and-replace across all files, update git configuration, and prepare the npm package for independent publishing under a new name.

## Standard Stack

This phase involves configuration changes, not new technology. The existing stack remains:

### Core
| File Type | Purpose | Files Affected |
|-----------|---------|----------------|
| JSON | Package configuration | `package.json` |
| Markdown | Documentation, commands, agents, workflows | 60+ files |
| JavaScript | Install script, hooks | `bin/install.js`, `hooks/*.js` |
| SVG | Terminal asset | `assets/terminal.svg` |
| YAML | GitHub funding | `.github/FUNDING.yml` |
| Bash | Utility scripts | `script/fetch-issues.sh` |

### Tools Required
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `git remote` | Remove upstream, update origin | Git configuration |
| `grep/sed` or editor | Find-replace across files | Systematic renaming |
| `npm` | Update package name, prepare for publish | Publishing preparation |

## Architecture Patterns

### Naming Convention Decisions

The project uses these naming patterns that must be consistently updated:

```
Current → New

Product Name:
  Kata → GSD Enterprise

npm Package:
  kata-cli → gsd-enterprise (or similar)

Command Prefix:
  /kata: → /gsd: (or keep /kata:)

File Prefixes:
  kata-*.js → gsd-*.js (hooks, agents)
  kata-*.md → gsd-*.md (agents)
  commands/kata/ → commands/gsd/ (directory)
  kata/ → gsd/ (skill directory)

GitHub References:
  glittercowboy/get-shit-done → [NEW_ORG]/gsd-enterprise

Author:
  TACHES → [NEW_AUTHOR]
```

### Directory Structure Impact

```
Current structure with kata naming:
.
├── agents/kata-*.md           # 11 agent files
├── commands/kata/*.md         # 24 command files
├── hooks/kata-*.js           # 1 hook file
├── kata/                      # Skill directory
│   ├── references/
│   ├── templates/
│   └── workflows/
└── bin/install.js            # References kata paths
```

### Pattern: Systematic Rename Order

Execute renames in this order to avoid broken references:

1. **Git configuration** - Remove upstream, update origin
2. **package.json** - Update name, author, repository URL
3. **Documentation files** - README.md, CLAUDE.md, CHANGELOG.md
4. **Install script** - bin/install.js banner and paths
5. **Hook files** - hooks/kata-check-update.js
6. **Asset files** - assets/terminal.svg text
7. **GitHub files** - .github/FUNDING.yml
8. **Utility scripts** - script/fetch-issues.sh
9. **Commands directory** - Rename commands/kata/ to commands/gsd/
10. **Skill directory** - Rename kata/ to gsd/
11. **Agent files** - Rename agents/kata-*.md to agents/gsd-*.md
12. **Internal references** - Update all file path references in .md files

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding all references | Manual file inspection | `grep -r "pattern"` | Comprehensive, no misses |
| Bulk file renaming | Individual renames | Bash loop or `rename` | Consistent, atomic |
| Path replacement in files | Manual edits | `sed -i` or script | Consistent across all files |
| Git remote management | Manual .git/config edits | `git remote` commands | Standard, auditable |

## Common Pitfalls

### Pitfall 1: Incomplete Reference Removal
**What goes wrong:** Some references to old names remain, causing broken links or confusion
**Why it happens:** Files searched individually instead of systematically
**How to avoid:** Use grep to find ALL occurrences before starting, then verify after
**Warning signs:** Tests fail, links broken, npm scripts error

### Pitfall 2: Breaking Install Script Paths
**What goes wrong:** `bin/install.js` copies files from wrong paths after rename
**Why it happens:** Directory structure changes not reflected in install logic
**How to avoid:** Update install.js AFTER renaming directories, test installation
**Warning signs:** `npx gsd-enterprise` fails to install files

### Pitfall 3: Inconsistent Command Prefix
**What goes wrong:** Some commands use `/kata:` while others use `/gsd:`
**Why it happens:** Partial update of command files
**How to avoid:** Rename entire commands/kata/ directory, update all internal references
**Warning signs:** `/gsd:help` shows mixed prefixes

### Pitfall 4: npm Package Name Conflict
**What goes wrong:** Desired package name already taken on npm
**Why it happens:** Didn't check npm registry before choosing name
**How to avoid:** Run `npm view [desired-name]` before committing to a name
**Warning signs:** `npm publish` fails with 403

### Pitfall 5: Breaking Existing User Installations
**What goes wrong:** Users with existing kata installations have broken references
**Why it happens:** No migration path considered
**How to avoid:** Document breaking change clearly, provide update instructions
**Warning signs:** User reports of "command not found"

### Pitfall 6: Lost Git History
**What goes wrong:** File renames appear as delete+add instead of move
**Why it happens:** Using file operations instead of `git mv`
**How to avoid:** Use `git mv` for directory/file renames
**Warning signs:** `git log --follow` doesn't show history

## Code Examples

### Git Remote Configuration

```bash
# Source: Standard git workflow
# Current state check
git remote -v
# origin    git@github.com:gannonh/get-shit-done.git (fetch)
# upstream  git@github.com:glittercowboy/get-shit-done.git (fetch)

# Remove upstream remote (severing tie to original)
git remote remove upstream

# Update origin to new repo (if repo name changes)
git remote set-url origin git@github.com:[NEW_ORG]/gsd-enterprise.git
```

### Directory Rename with Git

```bash
# Source: Standard git workflow
# Preserve git history with mv
git mv commands/kata commands/gsd
git mv kata gsd

# Rename agent files
for f in agents/kata-*.md; do
  newname=$(echo "$f" | sed 's/kata-/gsd-/')
  git mv "$f" "$newname"
done

# Rename hook files
git mv hooks/kata-check-update.js hooks/gsd-check-update.js
```

### Bulk Find-Replace Pattern

```bash
# Source: Standard sed usage
# Find all occurrences first
grep -r "kata-cli" --include="*.md" --include="*.json" --include="*.js"

# Replace in all files (macOS syntax)
find . -type f \( -name "*.md" -o -name "*.json" -o -name "*.js" \) \
  -exec sed -i '' 's/kata-cli/gsd-enterprise/g' {} +

# Replace command prefix in markdown files
find . -type f -name "*.md" \
  -exec sed -i '' 's|/kata:|/gsd:|g' {} +
```

### package.json Updates

```json
// Source: npm package.json specification
{
  "name": "gsd-enterprise",
  "version": "2.0.0",
  "description": "A meta-prompting, context engineering and spec-driven development system for Claude Code.",
  "author": "[NEW_AUTHOR]",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/[NEW_ORG]/gsd-enterprise.git"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fork with upstream sync | Hard fork, independent | 2026-01-17 | Complete independence |
| Solo-dev focus (Kata) | Team workflow focus (GSD Enterprise) | 2026-01-17 | Different target audience |

**Deprecated/outdated:**
- Upstream syncing workflow in CLAUDE.md — must be replaced with standalone guidance
- References to TACHES as author — must be updated to new maintainer

## Files Requiring Updates

### Tier 1: Critical Configuration (must update first)
| File | References to Update |
|------|---------------------|
| `package.json` | name, description, author, repository.url |
| `.github/FUNDING.yml` | github: glittercowboy |
| `CLAUDE.md` | All fork references, upstream workflow |

### Tier 2: User-Facing Documentation
| File | References to Update |
|------|---------------------|
| `README.md` | All glittercowboy URLs, kata-cli references, badges, TACHES mentions |
| `CHANGELOG.md` | All release URLs (130+ lines), Unreleased compare URL |
| `LICENSE` | Copyright holder (currently Lex Christopherson) |

### Tier 3: Install & Runtime
| File | References to Update |
|------|---------------------|
| `bin/install.js` | Banner text, TACHES reference, kata directory paths |
| `hooks/kata-check-update.js` | npm view command, file paths |
| `hooks/statusline.js` | Any kata references |
| `assets/terminal.svg` | TACHES text, get-shit-done text |
| `script/fetch-issues.sh` | Default repo reference |

### Tier 4: Commands & Agents (directory rename + internal refs)
| Location | Count | Action |
|----------|-------|--------|
| `commands/kata/*.md` | 24 files | Rename directory to `commands/gsd/`, update internal paths |
| `agents/kata-*.md` | 11 files | Rename to `agents/gsd-*.md`, update internal references |

### Tier 5: Skill Content
| Location | Count | Action |
|----------|-------|--------|
| `kata/` | 3 subdirs | Rename to `gsd/`, update all path references |
| `kata/references/*.md` | 7 files | Update internal path references |
| `kata/templates/*.md` | 20+ files | Update internal path references |
| `kata/workflows/*.md` | 13 files | Update internal path references |

### Tier 6: Planning Docs (internal use)
| Location | References |
|----------|------------|
| `.planning/PROJECT.md` | glittercowboy reference, GSD mentions |
| `.planning/codebase/*.md` | File path references to kata/ and commands/kata/ |
| `.planning/phases/01-*/*.md` | Path references |

## Open Questions

Things that require user decision before execution:

1. **New npm Package Name**
   - What we know: Current name is `kata-cli`
   - What's unclear: Final name — `gsd-enterprise`, `gsd-ent`, `@scope/gsd`?
   - Recommendation: Check npm availability, decide before execution
   - **Note:** `npm view gsd-enterprise` should be run to verify availability

2. **New GitHub Organization/Owner**
   - What we know: Currently forked to gannonh/get-shit-done
   - What's unclear: Final org name and repo name
   - Recommendation: Decide GitHub org structure before execution

3. **New Author Attribution**
   - What we know: Currently "TACHES" and "Lex Christopherson"
   - What's unclear: New author/maintainer attribution
   - Recommendation: Decide attribution before updating package.json and LICENSE

4. **Command Prefix Decision**
   - What we know: Currently `/kata:command`
   - What's unclear: Keep `/kata:` or change to `/gsd:`?
   - Recommendation: `/gsd:` aligns with GSD Enterprise branding
   - **Trade-off:** `/kata:` has muscle memory for existing users

5. **Version Number Reset**
   - What we know: Currently v1.6.4
   - What's unclear: Start at v2.0.0 (major breaking change) or continue sequence?
   - Recommendation: v2.0.0 signals breaking change and new identity

## Sources

### Primary (HIGH confidence)
- Codebase analysis via grep/glob — verified all file locations and references
- `package.json` direct inspection — npm package configuration
- `git` documentation — standard remote management

### Secondary (MEDIUM confidence)
- npm naming conventions — standard practice for package names

### Tertiary (LOW confidence)
- None — this is a configuration/rename task, not a technology research task

## Metadata

**Confidence breakdown:**
- File inventory: HIGH — complete grep analysis performed
- Rename procedure: HIGH — standard git/sed operations
- Breaking change handling: MEDIUM — user migration path needs testing

**Research date:** 2026-01-18
**Valid until:** Until Phase 0 execution (one-time task)

---

## Appendix: Complete Reference Inventory

### "glittercowboy" References (17 unique files)
```
CLAUDE.md (2)
.planning/codebase/INTEGRATIONS.md (1)
.planning/PROJECT.md (1)
commands/kata/update.md (1)
commands/kata/whats-new.md (3)
README.md (5)
package.json (1)
CHANGELOG.md (131)
script/fetch-issues.sh (2)
.github/FUNDING.yml (1)
```

### "TACHES" References (6 unique files)
```
assets/terminal.svg (1)
package.json (2)
README.md (2)
bin/install.js (1)
```

### "kata-cli" References (18 unique files)
```
.planning/codebase/INTEGRATIONS.md
package.json
README.md (11)
.planning/codebase/ARCHITECTURE.md (2)
bin/install.js (6)
CHANGELOG.md (1)
.planning/codebase/STACK.md (4)
hooks/kata-check-update.js (1)
commands/kata/update.md (3)
commands/kata/whats-new.md (4)
commands/kata/help.md (1)
```

### "get-shit-done" References (Files outside CHANGELOG.md)
```
CLAUDE.md (2)
assets/terminal.svg (2)
.planning/phases/01-*/*.md (multiple)
.planning/codebase/*.md (multiple)
kata/templates/codebase/structure.md (multiple)
package.json (1)
README.md (5)
.gitignore (1)
script/fetch-issues.sh (2)
```

### Files/Directories Requiring Rename
```
commands/kata/           → commands/gsd/
kata/                    → gsd/
agents/kata-*.md (11)    → agents/gsd-*.md
hooks/kata-check-update.js → hooks/gsd-check-update.js
kata.code-workspace      → gsd-enterprise.code-workspace
```
