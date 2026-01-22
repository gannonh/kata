# Fix: Orphaned Skills/Commands in Transformation

## Problem

The transformation IS working correctly - GSD commands transform to the right skills/commands:
- `new-milestone` → `kata-starting-milestones` → `start-milestone.md` ✓
- `new-project` → `kata-starting-projects` → `start-project.md` ✓
- `update` → `kata-updating` → `update.md` ✓

But production also contains **orphaned duplicates** that have no GSD source. These get preserved during transformation and create confusion.

**Orphaned skills** (no GSD source):
- `kata-starting-new-milestones` (duplicate of `kata-starting-milestones`)
- `kata-updating-kata` (duplicate of `kata-updating`)

**Orphaned commands**:
- `start-new-milestone.md` (duplicate of `start-milestone.md`)
- `update-kata.md` (duplicate of `update.md`)

## Root Cause

Step 2 copies production → staging. Orphans in production survive because nothing removes them.

## Fix

Delete orphans from **production**, then rerun transformation.

### Step 1: Delete orphaned skills from production

```bash
rm -rf skills/kata-starting-new-milestones
rm -rf skills/kata-updating-kata
```

### Step 2: Delete orphaned commands from production

```bash
rm commands/kata/start-new-milestone.md
rm commands/kata/update-kata.md
```

### Step 3: Rerun transformation

```bash
/kata:transform-from-gsd
```

### Step 4: Verify 1:1 mapping

After transformation, verify:
- 27 GSD commands → 27 skills → 27 commands
- No orphans remain

```bash
# Count should match
ls dev/transform/gsd-source/commands/gsd/*.md | wc -l
ls dev/transform/kata-staging/skills/ | wc -l
ls dev/transform/kata-staging/commands/kata/*.md | wc -l
```

## Files to Delete

| Type | Path |
|------|------|
| Skill | `skills/kata-starting-new-milestones/` |
| Skill | `skills/kata-updating-kata/` |
| Command | `commands/kata/start-new-milestone.md` |
| Command | `commands/kata/update-kata.md` |

## Verification

After fix:
- `new-milestone` → `kata-starting-milestones` → `start-milestone.md`
- `update` → `kata-updating` → `update.md`
