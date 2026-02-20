# Plan: Investigate ui-brand.md Path Resolution During Phase Planning

## Problem Statement

User observed: During phase planning (`/kata-plan-phase`), Claude accessed `ui-brand.md` from `skills/kata-adding-milestones/references/` instead of `skills/kata-planning-phases/references/`.

## Investigation Findings

### File Structure (Correct)
- **Source skill:** `skills/kata-planning-phases/SKILL.md` line 17: `@./references/ui-brand.md`
- **Source reference:** `skills/kata-planning-phases/references/ui-brand.md` ✓ exists
- **Cached plugin:** `~/.claude/plugins/cache/kata-marketplace/kata/1.1.15/skills/planning-phases/references/ui-brand.md` ✓ exists

### All ui-brand.md Files Are Identical
```
MD5 (skills/kata-adding-milestones/references/ui-brand.md) = a174d924fa4d2b03e088777a11419056
MD5 (skills/kata-executing-phases/references/ui-brand.md) = a174d924fa4d2b03e088777a11419056
MD5 (skills/kata-planning-phases/references/ui-brand.md) = a174d924fa4d2b03e088777a11419056
MD5 (skills/kata-starting-projects/references/ui-brand.md) = a174d924fa4d2b03e088777a11419056
```

### What Should Happen
1. User invokes `/kata-plan-phase`
2. Claude loads `skills/kata-planning-phases/SKILL.md`
3. Skill's `<execution_context>` contains `@./references/ui-brand.md`
4. This should resolve to `skills/kata-planning-phases/references/ui-brand.md`

### Possible Causes
1. **Claude Code `@` path resolution bug** - The relative path resolver may have context bleeding between skills
2. **Plugin cache issue** - Stale or incorrectly built plugin version
3. **Skill namespace collision** - Multiple skills with `references/ui-brand.md` confusing the resolver
4. **Development vs production mismatch** - Running from source while plugin is installed

## Next Steps - Need User Input

To diagnose this properly, I need to understand:

1. **How was the skill invoked?**
   - Via explicit `/kata-plan-phase` command?
   - Via natural language that triggered the skill?

2. **What exactly was observed?**
   - Did Claude show "reading kata-adding-milestones/references/ui-brand.md"?
   - Was there an error message?
   - Or was this seen in debug output?

3. **Environment context**
   - Were you running from the kata project directory?
   - Was this using the installed plugin or source skills?

## Potential Fixes (Once Root Cause Confirmed)

1. **If Claude Code resolver bug:** Report to Claude Code team, no Kata changes needed
2. **If plugin build issue:** Fix build.js to ensure correct path isolation
3. **If namespace collision:** Consider unique reference file names per skill (e.g., `planning-ui-brand.md`)
4. **If stale cache:** Clear `~/.claude/plugins/cache/kata-marketplace/` and rebuild
