# Phase 7: Deprecate NPX Support - Research

**Researched:** 2026-01-27
**Updated:** 2026-01-27 (corrected based on user feedback)
**Domain:** NPX/NPM distribution removal, plugin-only distribution
**Confidence:** HIGH

## Summary

This phase removes the NPX distribution path from Kata, making it plugin-only. **Key insight:** With plugin-only distribution, we no longer need dual naming conventions. Source files can be named directly for plugin use.

**Build system role:**
- Simplified (NPM target removed) but retained
- Used for BOTH local testing (`--plugin-dir`) AND CI deployment to marketplace
- `dist/plugin/` remains the output for both workflows

**Final NPM publish:**
- Delete automated `publish.yml` workflow
- Replace `bin/install.js` with deprecation stub
- Manually run `npm publish` to release v1.1.0 deprecation package
- Users running `npx @gannonh/kata` see message pointing to plugin install

**Corrected approach:**
1. Rename source directories to plugin naming (remove `kata-` prefix)
2. Update all internal references to new names
3. Simplify build system (remove NPM target, keep plugin build for local testing)
4. Remove NPX-specific files (hooks, update skill, publish workflow)
5. Ship final NPM version (v1.1.0) with deprecation notice redirecting to plugin

## Architecture Change

### Before (Dual Distribution with Build System)

```
Source (skills/kata-*)
       |
   build.js (transforms)
       |
   +---+---+
   |       |
dist/npm  dist/plugin (skills/*)
   |           |
   v           v
NPM registry  kata-marketplace
```

### After (Plugin-Only, Simplified Build)

```
Source (skills/*)
       |
   build.js (just copies, no transforms)
       |
   dist/plugin
       |
       v
  kata-marketplace (+ local testing via --plugin-dir)
```

## Files to Rename (28 skills)

All skill directories need `kata-` prefix removed:

| Current | New |
| ------- | --- |
| `skills/kata-adding-milestones/` | `skills/adding-milestones/` |
| `skills/kata-adding-phases/` | `skills/adding-phases/` |
| `skills/kata-adding-todos/` | `skills/adding-todos/` |
| ... (28 total) | ... |

**Also update:**
- `name:` field in each SKILL.md frontmatter
- Cross-references between skills
- Agent references to skills

## Files to Delete

| File/Directory | Purpose |
| -------------- | ------- |
| `skills/kata-updating/` | NPX update skill |
| `hooks/kata-check-update.js` | NPX update checker |
| `hooks/kata-npm-statusline.js` | NPM statusline |
| `.github/workflows/publish.yml` | Automated NPM publish workflow (manual publish instead)

## Files to Replace

| File | Change |
| ---- | ------ |
| `bin/install.js` | Replace 563-line installer with deprecation stub (~15 lines) |

## Files to Modify

| File | Change |
| ---- | ------ |
| `package.json` | Keep `bin` (for deprecation stub), update `files` to minimal (just `bin/`) |
| `scripts/build.js` | Remove NPM target, keep plugin-only build |
| `tests/build.test.js` | Remove NPM tests, keep plugin tests |
| `README.md` | Remove NPX installation, plugin-only |
| `CLAUDE.md` | Remove NPX syntax references |
| `KATA-STYLE.md` | Remove NPX path references |
| All 28 SKILL.md files | Update `name:` frontmatter (remove `kata-` prefix) |
| Agent files | Update skill references |

## Final NPM Version (v1.1.0)

Create minimal `bin/install.js` that only prints deprecation message:

```javascript
#!/usr/bin/env node
console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Kata NPX installation has been deprecated                ║
╚═══════════════════════════════════════════════════════════╝

Kata is now distributed exclusively as a Claude Code plugin.

To install:
  1. Start Claude Code: claude
  2. Run: /plugin install kata@gannonh-kata-marketplace

For more information: https://github.com/gannonh/kata
`);
process.exit(0);
```

## CI Workflow Change

Update `.github/workflows/plugin-release.yml`:

**Minimal change needed** — CI still uses `node scripts/build.js plugin`, but build.js is simplified (NPM target removed). The workflow structure remains the same:

```yaml
- name: Build plugin distribution
  run: |
    npm run build:hooks
    node scripts/build.js plugin  # Now plugin-only, simpler

- name: Update marketplace
  run: cp -r dist/plugin marketplace/plugins/kata
```

**What changes in build.js:**
- Remove `buildNpm()` function
- Remove `NPM_INCLUDES` constant
- Remove npm CLI target
- After source rename, no path/prefix transformations needed

## Wave Structure (Suggested)

1. **Wave 1: Rename skills** - Rename all 28 skill directories and update frontmatter
2. **Wave 2: Update references** - Fix cross-references in agents, skills, docs
3. **Wave 3: Simplify build & delete NPX** - Remove NPM target from build, delete NPX files/hooks
4. **Wave 4: Documentation** - Update README, CLAUDE.md, KATA-STYLE.md
5. **Wave 5: Final NPM deprecation** - Replace bin/install.js with stub, manual `npm publish`

## Open Questions (Resolved)

| Question | Resolution |
| -------- | ---------- |
| Keep build system? | **Yes, simplified** - Still needed for local testing AND CI deployment to marketplace |
| Path transformations? | **Not needed after rename** - Source matches plugin structure |
| NPM package fate? | **Keep with deprecation message** - v1.1.0 prints migration info |

## Metadata

**Confidence:** HIGH - User clarified architecture approach
**Research date:** 2026-01-27
**Valid until:** Implementation complete
