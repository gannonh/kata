---
name: kata-move-phase
description: Move a phase between milestones or reorder phases within a milestone. Triggers include "move phase", "move phase to milestone", "reorder phase", "reorder phases".
metadata:
  version: "0.1.0"
user-invocable: true
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Move a pending phase to a different milestone, renumbering at both source and destination.

Purpose: Enable flexible phase reorganization between milestones when scope changes.
Output: Phase moved, directories renamed, ROADMAP.md updated, STATE.md updated, git commit as historical record.

**Supported operations:**
- Cross-milestone move: `/kata:kata-move-phase 3 to v1.6.0`
- Reorder within milestone: (planned for Plan 02)
</objective>

<execution_context>
@.planning/ROADMAP.md
@.planning/STATE.md
</execution_context>

<process>

<step name="parse_arguments">
Parse the command arguments:

**Cross-milestone move:**
- First arg: phase number (integer)
- Second arg: "to"
- Third arg: target milestone version (e.g., v1.6.0)
- Example: `/kata:kata-move-phase 3 to v1.6.0`

**Reorder (planned for Plan 02):**
- If second arg is "before" or "after": reorder operation
- Display: "Reorder capability coming soon. Use cross-milestone move with 'to' keyword."
- Exit.

**Validation:**
- If no arguments:

```
ERROR: Phase number and target required
Usage: /kata:kata-move-phase <phase-number> to <milestone-version>
Example: /kata:kata-move-phase 3 to v1.6.0
```

Exit.

- If missing "to" keyword or target:

```
ERROR: Invalid syntax
Usage: /kata:kata-move-phase <phase-number> to <milestone-version>
Example: /kata:kata-move-phase 3 to v1.6.0
```

Exit.
</step>

<step name="load_state">
Load project state:

```bash
cat .planning/STATE.md 2>/dev/null
cat .planning/ROADMAP.md 2>/dev/null
```

Parse current milestone version from ROADMAP.md (the milestone marked "In Progress").
</step>

<step name="validate_phase_exists">
Verify the target phase exists in ROADMAP.md:

1. Search for `#### Phase {target}:` heading within the current milestone section
2. Use universal phase discovery to find the phase directory:

```bash
PADDED=$(printf "%02d" "$PHASE_NUM" 2>/dev/null || echo "$PHASE_NUM")
PHASE_DIR=""
for state in active pending completed; do
  PHASE_DIR=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | head -1)
  [ -z "$PHASE_DIR" ] && PHASE_DIR=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${PHASE_NUM}-*" 2>/dev/null | head -1)
  [ -n "$PHASE_DIR" ] && break
done
# Fallback: flat directory
if [ -z "$PHASE_DIR" ]; then
  PHASE_DIR=$(find .planning/phases -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | head -1)
  [ -z "$PHASE_DIR" ] && PHASE_DIR=$(find .planning/phases -maxdepth 1 -type d -name "${PHASE_NUM}-*" 2>/dev/null | head -1)
fi
```

If not found in ROADMAP.md:

```
ERROR: Phase {target} not found in roadmap
Available phases: [list phase numbers from current milestone]
```

Exit.
</step>

<step name="validate_phase_movable">
Verify the phase can be moved:

1. **Phase must be in pending/** (not active or completed):

```bash
# Check if in active/ or completed/ (not movable)
for state in active completed; do
  if find .planning/phases/${state} -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | grep -q .; then
    echo "ERROR: Phase ${PHASE_NUM} is in ${state}/ and cannot be moved"
    exit 1
  fi
done
```

If not in pending/:

```
ERROR: Phase {target} is not in pending state
Only pending phases can be moved between milestones.
Active or completed phases have execution artifacts tied to their current position.
```

Exit.

2. **Phase must not have SUMMARY.md files** (no executed plans):

```bash
find "${PHASE_DIR}" -maxdepth 1 -name "*-SUMMARY.md" 2>/dev/null
```

If SUMMARY.md files exist:

```
ERROR: Phase {target} has completed work

Found executed plans:
- {list of SUMMARY.md files}

Cannot move phases with completed work.
```

Exit.
</step>

<step name="validate_target_milestone">
Verify the target milestone exists and is different from source:

1. Search ROADMAP.md for the target milestone heading (e.g., `### v1.6.0`)
2. Target must exist in ROADMAP.md

If not found:

```
ERROR: Milestone {target_milestone} not found in roadmap

Available milestones:
{list milestone headings from ROADMAP.md}
```

Exit.

3. Target must not be the same as the source milestone:

If same:

```
ERROR: Phase {target} is already in milestone {target_milestone}
To reorder within a milestone, use: /kata:kata-move-phase {N} before {M}
(Reorder capability planned for Plan 02)
```

Exit.
</step>

<step name="calculate_destination_number">
Find the next available phase number in the target milestone:

1. Parse all phase headings within the target milestone section
2. Find the highest integer phase number
3. New phase number = highest + 1 (or 1 if milestone has no phases)
4. Format as two-digit: `printf "%02d" $NEW_NUM`

```bash
# Extract highest phase number in target milestone
# Parse between target milestone heading and next milestone heading
HIGHEST=$(sed -n "/^### ${TARGET_MILESTONE}/,/^### v[0-9]/p" .planning/ROADMAP.md \
  | grep -E "^#### Phase [0-9]+:" \
  | sed -E 's/.*Phase ([0-9]+):.*/\1/' \
  | sort -n | tail -1)

if [ -z "$HIGHEST" ]; then
  NEW_NUM=1
else
  NEW_NUM=$((HIGHEST + 1))
fi
PADDED_NEW=$(printf "%02d" "$NEW_NUM")
```
</step>

<step name="confirm_move">
Present move summary and wait for confirmation:

```
Moving Phase {N}: {Name}

From: {source_milestone}
To:   {target_milestone}

This will:
- Remove phase from {source_milestone} in ROADMAP.md
- Add as Phase {NEW_NUM} in {target_milestone}
- Rename directory: {old_dir} -> pending/{PADDED_NEW}-{slug}
- Rename internal files ({OLD_NUM}-01-PLAN.md -> {NEW_NUM}-01-PLAN.md, etc.)
- Renumber {M} remaining phases in {source_milestone} to close the gap

Proceed? (y/n)
```

Wait for confirmation.
</step>

<step name="remove_from_source_milestone">
Remove the phase section from source milestone in ROADMAP.md:

1. Find the phase section boundaries (from `#### Phase {N}:` to next `#### Phase` or section boundary)
2. Remove the entire section
3. Renumber remaining phases in source milestone to close the gap:
   - Phase {N+1} becomes Phase {N}
   - Phase {N+2} becomes Phase {N+1}
   - Process in ascending order for downward shifts

Use the same renumbering approach as kata-remove-phase:
- Update phase headings: `#### Phase {old}:` -> `#### Phase {new}:`
- Update phase list entries
- Update progress table rows
- Update plan references: `{old}-01:` -> `{new}-01:`
- Update dependency references: `Depends on: Phase {old}` -> `Depends on: Phase {new}`
- Update decimal phase references if any
</step>

<step name="add_to_target_milestone">
Insert the phase section into target milestone in ROADMAP.md:

1. Find the insertion point (end of target milestone's phases, before next section)
2. Update phase number in the section to the calculated destination number
3. Insert the section with correct formatting
4. Preserve phase goal, requirements, success criteria
5. Update dependency references to reflect the new milestone context

If the phase had dependency references to other phases in the source milestone, note them as cross-milestone dependencies or remove them if they no longer apply.
</step>

<step name="rename_phase_directory">
Move the phase directory from old number to new number:

```bash
# Extract slug from current directory name
SLUG=$(basename "$PHASE_DIR" | sed -E "s/^${PADDED}-//")

# Rename within pending/ (destination is always pending/)
NEW_DIR=".planning/phases/pending/${PADDED_NEW}-${SLUG}"
mv "$PHASE_DIR" "$NEW_DIR"
echo "Renamed: $PHASE_DIR -> $NEW_DIR"

# Rename files inside the directory
for file in "${NEW_DIR}/${PADDED}-"*; do
  [ -f "$file" ] || continue
  NEW_FILE=$(echo "$file" | sed "s/${PADDED}-/${PADDED_NEW}-/")
  mv "$file" "$NEW_FILE"
  echo "Renamed: $(basename $file) -> $(basename $NEW_FILE)"
done
```

Handle decimal phases that belong to the moved phase:
- Find phases like {N}.1, {N}.2 in pending/
- Move them with the parent phase, renumbering to {NEW_NUM}.1, {NEW_NUM}.2
</step>

<step name="renumber_source_directories">
Renumber directories of phases that shifted in the source milestone due to the gap:

Process in ascending order (for downward shifts):

```bash
# For each subsequent phase in source milestone
# Find it across state subdirectories, rename within same state
for state in active pending completed; do
  SRC=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${OLD_PADDED}-*" 2>/dev/null | head -1)
  if [ -n "$SRC" ]; then
    SLUG=$(basename "$SRC" | sed -E "s/^${OLD_PADDED}-//")
    mv "$SRC" ".planning/phases/${state}/${NEW_PADDED}-${SLUG}"

    # Rename files inside
    for file in ".planning/phases/${state}/${NEW_PADDED}-${SLUG}/${OLD_PADDED}-"*; do
      [ -f "$file" ] || continue
      NEW_FILE=$(echo "$file" | sed "s/${OLD_PADDED}-/${NEW_PADDED}-/")
      mv "$file" "$NEW_FILE"
    done
  fi
done
```

Process each shifted phase sequentially to avoid conflicts.
</step>

<step name="update_state">
Update STATE.md:

1. Add roadmap evolution note:

```markdown
- **Phase {N} moved from {source_milestone} to {target_milestone}** as Phase {NEW_NUM}
```

2. Update total phase count if the source milestone is the current milestone
3. Recalculate progress percentage

Update REQUIREMENTS.md traceability if requirements reference the moved phase:
- Update phase numbers in traceability table for both moved and renumbered phases
</step>

<step name="commit">
Check planning config:

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations

**If `COMMIT_PLANNING_DOCS=true` (default):**

```bash
git add .planning/
git commit -m "chore: move phase {N} to {target_milestone}"
```
</step>

<step name="completion">
Present completion summary:

```
Phase {N} ({phase-name}) moved to {target_milestone}.

Changes:
- Moved: Phase {N} -> Phase {NEW_NUM} in {target_milestone}
- Directory: {old_dir} -> {new_dir}
- Renumbered: {M} phases in {source_milestone}
- Updated: ROADMAP.md, STATE.md
- Committed: chore: move phase {N} to {target_milestone}

---

## What's Next

Would you like to:
- `/kata:kata-track-progress` - see updated roadmap status
- Continue with current phase
- Review roadmap

---
```
</step>

</process>

<anti_patterns>

- Don't move active or completed phases (only pending)
- Don't move phases with executed plans (SUMMARY.md exists)
- Don't move to the same milestone (use reorder instead)
- Don't forget decimal phases (they move with parent integer phase)
- Don't commit if commit_docs is false
- Don't leave gaps in phase numbering after move
- Don't modify phases outside the source and target milestones

</anti_patterns>

<edge_cases>

**Phase has PLAN.md files but no SUMMARY.md:**
- Allowed. Rename plan files inside the directory as part of the move.
- Update plan frontmatter phase references.

**Target milestone is empty (no phases):**
- First phase becomes Phase 1.
- `calculate_destination_number` handles this (NEW_NUM=1 when HIGHEST is empty).

**Last phase in source milestone removed:**
- No renumbering needed in source milestone.
- Source milestone section in ROADMAP.md still has its heading.

**Decimal phases under moved integer phase:**
- Find all decimal phases (N.1, N.2) belonging to the moved integer phase.
- Move them together with the parent.
- Renumber to NEW_NUM.1, NEW_NUM.2 at destination.

**Phase directory doesn't exist yet:**
- Phase may be in ROADMAP.md but directory not created.
- Skip directory operations, proceed with ROADMAP.md updates only.
- Note in completion summary: "No directory to move (phase not yet created)"

</edge_cases>

<success_criteria>
Phase move is complete when:

- [ ] Source phase validated as pending/unstarted
- [ ] Target milestone validated as existing and different from source
- [ ] Phase section removed from source milestone in ROADMAP.md
- [ ] Remaining source phases renumbered to close gap
- [ ] Phase section added to target milestone with correct number
- [ ] Phase directory renamed to match new number
- [ ] Files inside directory renamed ({old}-NN-PLAN.md -> {new}-NN-PLAN.md)
- [ ] Decimal phases moved with parent (if any)
- [ ] Source directories renumbered (if phases shifted)
- [ ] STATE.md updated with roadmap evolution note
- [ ] REQUIREMENTS.md traceability updated (if applicable)
- [ ] Changes committed with descriptive message
- [ ] No gaps in phase numbering at source or destination
- [ ] User informed of all changes
</success_criteria>
