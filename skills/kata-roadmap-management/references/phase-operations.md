# Phase Operations Reference

Detailed workflows for roadmap phase operations: add, insert, and remove.

## Add Phase Workflow

### Purpose

Append a new integer phase to the end of the current milestone.

### Step-by-Step

**1. Parse Description**

Extract phase description from user request:
- "add authentication" → description = "Authentication"
- "add phase: Fix performance issues" → description = "Fix performance issues"

**2. Load Roadmap**

```bash
if [ -f .planning/ROADMAP.md ]; then
  ROADMAP=".planning/ROADMAP.md"
else
  echo "ERROR: No roadmap found"
  exit 1
fi
```

**3. Find Current Milestone**

Locate "## Current Milestone:" heading and extract all phases:

```markdown
## Current Milestone: v1.0 Foundation

### Phase 4: Focused Command System
### Phase 5: Path Routing & Validation
### Phase 6: Documentation & Distribution
```

**4. Calculate Next Phase Number**

```bash
# Extract highest integer phase (ignore decimals)
# If phases are 4, 5, 5.1, 6 → next is 7
HIGHEST=$(grep "### Phase" "$ROADMAP" | grep -oE "Phase [0-9]+" | \
  sed 's/Phase //' | sort -n | tail -1)
NEXT=$((HIGHEST + 1))
PHASE_NUM=$(printf "%02d" $NEXT)
```

**5. Generate Slug**

```bash
SLUG=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]' | \
  sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
```

**6. Create Directory**

```bash
mkdir -p ".planning/phases/${PHASE_NUM}-${SLUG}"
```

**7. Update ROADMAP.md**

Insert after last phase in current milestone, before `---` separator:

```markdown
### Phase {N}: {Description}

**Goal:** [To be planned]
**Depends on:** Phase {N-1}
**Plans:** 0 plans

Plans:
- [ ] TBD (run /kata:plan-phase {N} to break down)

**Details:**
[To be added during planning]
```

**8. Update STATE.md**

Add to "Roadmap Evolution" section:
```markdown
- Phase {N} added: {description}
```

## Insert Phase Workflow

### Purpose

Insert urgent work as decimal phase between existing integer phases.

### Step-by-Step

**1. Parse Arguments**

Extract:
- Target phase (insert AFTER this phase)
- Description

Example: "insert after phase 2: Fix critical auth bug"
→ after = 2, description = "Fix critical auth bug"

**2. Validate Target Exists**

```bash
if ! grep -q "### Phase ${AFTER}:" "$ROADMAP"; then
  echo "ERROR: Phase ${AFTER} not found"
  exit 1
fi
```

**3. Find Existing Decimals**

```bash
# Find all phases like 2.1, 2.2, 2.3...
EXISTING=$(grep -oE "Phase ${AFTER}\.[0-9]+" "$ROADMAP" | \
  sed "s/Phase ${AFTER}\.//" | sort -n | tail -1)

if [ -z "$EXISTING" ]; then
  DECIMAL=1
else
  DECIMAL=$((EXISTING + 1))
fi
```

**4. Format Decimal Phase**

```bash
# Ensure two-digit integer: 2.1 → 02.1
DECIMAL_PHASE=$(printf "%02d.%d" "$AFTER" "$DECIMAL")
```

**5. Create Directory**

```bash
mkdir -p ".planning/phases/${DECIMAL_PHASE}-${SLUG}"
```

**6. Update ROADMAP.md**

Insert after target phase content with `(INSERTED)` marker:

```markdown
### Phase {N.M}: {Description} (INSERTED)

**Goal:** [Urgent work - to be planned]
**Depends on:** Phase {N}
**Plans:** 0 plans

Plans:
- [ ] TBD (run /kata:plan-phase {N.M} to break down)

**Details:**
[To be added during planning]
```

**7. Update STATE.md**

```markdown
- Phase {N.M} inserted after Phase {N}: {description} (URGENT)
```

## Remove Phase Workflow

### Purpose

Remove an unstarted future phase and maintain continuous numbering.

### Validation Steps

**1. Parse Target Phase**

```bash
TARGET=$1  # Can be integer (17) or decimal (17.1)
```

**2. Load Current Position**

```bash
CURRENT=$(grep "^Phase:" .planning/STATE.md | grep -oE "[0-9]+")
```

**3. Validate Future Phase**

```bash
# Target must be greater than current
if [ "$TARGET" -le "$CURRENT" ]; then
  echo "ERROR: Cannot remove current or past phases"
  echo "Use /kata:pause-work to abandon current work"
  exit 1
fi
```

**4. Check for Completed Work**

```bash
if ls .planning/phases/${TARGET}-*/*-SUMMARY.md 2>/dev/null; then
  echo "ERROR: Phase has completed work"
  exit 1
fi
```

### Removal Steps

**5. Gather Subsequent Phases**

List all phases needing renumbering:
- For integer removal (17): phases 18, 19, 20... and 17.x → 16.x
- For decimal removal (17.1): only 17.2, 17.3... → 17.1, 17.2...

**6. Confirm with User**

```
Removing Phase {TARGET}: {Name}

This will:
- Delete: .planning/phases/{TARGET}-{slug}/
- Renumber: {list of affected phases}

Proceed? (y/n)
```

**7. Delete Phase Directory**

```bash
rm -rf ".planning/phases/${TARGET}-${SLUG}"
```

**8. Renumber Directories (Descending Order)**

Process highest to lowest to avoid conflicts:

```bash
# Example: removing 17, renumber 20→19, 19→18, 18→17
for OLD in $(ls -d .planning/phases/[0-9]* | sort -Vr); do
  OLD_NUM=$(basename "$OLD" | grep -oE "^[0-9.]+")
  if [ "$OLD_NUM" -gt "$TARGET" ]; then
    NEW_NUM=$((OLD_NUM - 1))
    NEW_DIR=$(echo "$OLD" | sed "s/${OLD_NUM}/${NEW_NUM}/")
    mv "$OLD" "$NEW_DIR"
  fi
done
```

**9. Rename Files Inside Directories**

```bash
for DIR in .planning/phases/${NEW_NUM}-*/; do
  for FILE in "$DIR"/*; do
    NEW_FILE=$(echo "$FILE" | sed "s/${OLD_NUM}-/${NEW_NUM}-/")
    mv "$FILE" "$NEW_FILE"
  done
done
```

**10. Update ROADMAP.md**

- Remove phase section entirely
- Renumber all subsequent phase headings
- Update dependency references
- Update progress table

**11. Update STATE.md**

- Update total phase count
- Recalculate progress percentage

**12. Commit**

```bash
git add .planning/
git commit -m "chore: remove phase ${TARGET} (${ORIGINAL_NAME})"
```

## Phase Directory Structure

### Standard Naming

```
.planning/phases/
├── 01-foundation/
├── 02-authentication/
├── 02.1-fix-critical-bug/     # Decimal insertion
├── 02.2-hotfix-login/         # Second insertion
├── 03-dashboard/
└── 04-polish/
```

### Directory Contents

```
{NN}-{slug}/
├── {NN}-CONTEXT.md            # Optional: phase context
├── {NN}-RESEARCH.md           # Optional: research findings
├── {NN}-01-PLAN.md            # First plan
├── {NN}-01-SUMMARY.md         # Completed plan summary
├── {NN}-02-PLAN.md            # Second plan
└── ...
```

### Naming Rules

| Type | Format | Example |
|------|--------|---------|
| Integer phase | `{NN}-{slug}` | `07-authentication` |
| Decimal phase | `{NN.M}-{slug}` | `07.1-fix-jwt-bug` |
| Plan file | `{NN}-{PP}-PLAN.md` | `07-01-PLAN.md` |
| Summary file | `{NN}-{PP}-SUMMARY.md` | `07-01-SUMMARY.md` |

## ROADMAP.md Update Patterns

### Phase Section Structure

```markdown
### Phase {N}: {Name}

**Goal:** {Outcome description}
**Depends on:** Phase {N-1}
**Plans:** {count} plans

Plans:
- [x] {NN}-01: {name} — {status}
- [ ] {NN}-02: {name}

**Details:**
{Implementation notes}
```

### Dependency Updates

When removing Phase 17:
- Phase 18's `Depends on: Phase 17` → `Depends on: Phase 16`
- Phase that depended on 17 now depends on 16

### Progress Table Updates

```markdown
| Phase | Goal | Status |
|-------|------|--------|
| 1. Setup | Foundation | Complete |
| 2. Auth | User accounts | In Progress |
| 3. Content | Core features | Pending |  # Was Phase 4
```
