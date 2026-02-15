---
name: kata-add-phase
description: Add planned work discovered during execution to the end of the current milestone in the roadmap. This skill appends sequential phases to the current milestone's phase list, automatically calculating the next phase number. Triggers include "add phase", "append phase", "new phase", and "create phase". This skill updates ROADMAP.md and STATE.md accordingly.
metadata:
  version: "0.1.0"
---

<objective>
Add a new integer phase to the end of the current milestone in the roadmap.

This command appends sequential phases to the current milestone's phase list, automatically calculating the next phase number based on existing phases.

Purpose: Add planned work discovered during execution that belongs at the end of current milestone.

IMPORTANT: When showing examples to users, always use `/kata-add-phase` (the command), not the skill name.
</objective>

<execution_context>
@.planning/ROADMAP.md
@.planning/STATE.md
</execution_context>

<process>

**Script invocation rule.** Code blocks reference scripts with paths relative to this SKILL.md (e.g., `"../kata-configure-settings/scripts/read-config.sh"`). Resolve these to absolute paths. Run scripts from the project directory (where `.planning/` lives). If you must run from a different directory, pass the project root via environment variable: `KATA_PROJECT_ROOT=/path/to/project bash "/path/to/script.sh" args`.

<step name="parse_arguments">
Parse the command arguments:

**With `--issue` flag:**

- `/kata-add-phase --issue .planning/issues/open/2026-02-06-phase-lookup.md`
- Read the issue file to extract title, provenance, and context
- `description` = issue title from frontmatter
- `ISSUE_FILE` = the path argument
- `ISSUE_PROVENANCE` = provenance field from frontmatter (e.g., `github:owner/repo#102`)
- `ISSUE_NUMBER` = extracted from provenance if GitHub-linked (e.g., `102`)

```bash
if echo "$ARGUMENTS" | grep -q "^--issue "; then
  ISSUE_FILE=$(echo "$ARGUMENTS" | sed 's/^--issue //')
  if [ ! -f "$ISSUE_FILE" ]; then
    echo "ERROR: Issue file not found: $ISSUE_FILE"
    exit 1
  fi
  description=$(grep "^title:" "$ISSUE_FILE" | cut -d':' -f2- | xargs)
  ISSUE_PROVENANCE=$(grep "^provenance:" "$ISSUE_FILE" | cut -d' ' -f2)
  ISSUE_NUMBER=""
  if echo "$ISSUE_PROVENANCE" | grep -q "^github:"; then
    ISSUE_NUMBER=$(echo "$ISSUE_PROVENANCE" | grep -oE '#[0-9]+' | tr -d '#')
  fi
fi
```

**Without `--issue` flag:**

- All arguments become the phase description
- Example: `/kata-add-phase Add authentication` → description = "Add authentication"
- `ISSUE_FILE`, `ISSUE_PROVENANCE`, `ISSUE_NUMBER` are empty

If no arguments provided:

```
ERROR: Phase description required
Usage: /kata-add-phase <description>
       /kata-add-phase --issue <issue-file-path>
Example: /kata-add-phase Add authentication system
```

Exit.
</step>

<step name="preflight_roadmap_format">
**Pre-flight: Check roadmap format (auto-migration)**

If ROADMAP.md exists, check format and auto-migrate if old:

```bash
if [ -f .planning/ROADMAP.md ]; then
  bash "../kata-doctor/scripts/check-roadmap-format.sh" 2>/dev/null
  FORMAT_EXIT=$?
  
  if [ $FORMAT_EXIT -eq 1 ]; then
    echo "Old roadmap format detected. Running auto-migration..."
  fi
fi
```

**If exit code 1 (old format):**

Invoke kata-doctor in auto mode:

```
Skill("kata-doctor", "--auto")
```

Continue after migration completes.

**If exit code 0 or 2:** Continue silently.
</step>

<step name="load_roadmap">
Load the roadmap file:

```bash
if [ -f .planning/ROADMAP.md ]; then
  ROADMAP=".planning/ROADMAP.md"
else
  echo "ERROR: No roadmap found (.planning/ROADMAP.md)"
  exit 1
fi
```

Read roadmap content for parsing.
</step>

<step name="find_current_milestone">
Parse the roadmap to find the current milestone section:

1. Locate the "## Current Milestone:" heading
2. Extract milestone name and version
3. Identify all phases under this milestone (before next "---" separator or next milestone heading)
4. Parse existing phase numbers (including decimals if present)

Example structure:

```
## Current Milestone: v1.0 Foundation

### Phase 4: Focused Command System
### Phase 5: Path Routing & Validation
### Phase 6: Documentation & Distribution
```

</step>

<step name="calculate_next_phase">
Find the highest integer phase number in the current milestone:

1. Extract all phase numbers from phase headings (### Phase N:)
2. Filter to integer phases only (ignore decimals like 4.1, 4.2)
3. Find the maximum integer value
4. Add 1 to get the next phase number

Example: If phases are 4, 5, 5.1, 6 → next is 7

Format as two-digit: `printf "%02d" $next_phase`
</step>

<step name="generate_slug">
Convert the phase description to a kebab-case slug:

```bash
# Example transformation:
# "Add authentication" → "add-authentication"
# "Fix critical performance issues" → "fix-critical-performance-issues"

slug=$(echo "$description" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
```

Phase directory name: `{two-digit-phase}-{slug}`
Example: `07-add-authentication`
</step>

<step name="validate_slicing">
Validate that the new phase follows vertical slicing principles:

1. **Read slicing principles:**
   ```bash
   cat "$(dirname "$0")/references/slicing-principles.md"
   ```

2. **Check phase description against red flags:**

   **Red Flag 1: Horizontal layer name**
   - Does description mention "models", "APIs", "components", "frontend", "backend", "database" without feature context?
   - Examples: "Add database models", "Create API layer", "Build UI components"

   **Red Flag 2: Setup-only phase**
   - Is this pure infrastructure with no user-facing feature?
   - Examples: "Set up database", "Configure API", "Initialize framework"

   **Red Flag 3: Continuation of previous phase**
   - Does description suggest incomplete work from prior phase?
   - Examples: "Finish authentication", "Complete product catalog", "Add remaining endpoints"

3. **If red flag detected, use AskUserQuestion:**

   ```markdown
   The phase description "{description}" may not follow vertical slicing principles.

   **Detected issue:** {red flag type}

   **Vertical slicing principle:** Each phase should deliver a complete, demo-able feature (DB + API + UI) rather than a horizontal layer or infrastructure setup.

   **Alternative structures:**

   Option 1: Feature-focused phase
   - Description: "{suggest feature-focused alternative}"
   - Structure: Complete capability from DB to UI
   - Demo-able: {what can be demonstrated}

   Option 2: Inline setup with feature
   - Description: "{suggest inlined alternative}"
   - Structure: Setup combined with first feature using it
   - Demo-able: {what can be demonstrated}

   Option 3: Proceed as-is
   - Use current description
   - Note: May result in non-demo-able phase
   ```

4. **If no red flags, continue silently.**

**Purpose:** Prevent horizontal layer phases and setup-only phases from entering the roadmap. Catch slicing issues at insertion time, not during planning.
</step>

<step name="create_phase_directory">
Create the phase directory structure:

```bash
phase_dir=".planning/phases/pending/${phase_num}-${slug}"
mkdir -p "$phase_dir"
```

Confirm: "Created directory: $phase_dir"
</step>

<step name="update_roadmap">
Add the new phase entry to the roadmap:

1. Find the insertion point (after last phase in current milestone, before "---" separator)
2. Insert new phase heading:

   ```
   ### Phase {N}: {Description}

   **Goal:** [To be planned]
   **Depends on:** Phase {N-1}
   {if ISSUE_NUMBER: **Issue:** Closes #{ISSUE_NUMBER}}
   **Plans:** 0 plans

   Plans:
   - [ ] TBD (run /kata-plan-phase {N} to break down)

   **Details:**
   [To be added during planning]
   ```

   If `ISSUE_NUMBER` is set (from `--issue` flag), include the `**Issue:** Closes #{N}` line.
   This ensures PRs referencing this phase will auto-close the GitHub issue.

3. Write updated roadmap back to file

Preserve all other content exactly (formatting, spacing, other phases).
</step>

<step name="update_project_state">
Update STATE.md to reflect the new phase:

1. Read `.planning/STATE.md`
2. Under "## Current Position" → "**Next Phase:**" add reference to new phase
3. Under "## Accumulated Context" → "### Roadmap Evolution" add entry:
   ```
   - Phase {N} added: {description}
   ```

If "Roadmap Evolution" section doesn't exist, create it.
</step>

<step name="completion">
Present completion summary:

```
Phase {N} added to current milestone:
- Description: {description}
- Directory: .planning/phases/{phase-num}-{slug}/
- Status: Not planned yet
{if ISSUE_NUMBER: - Issue: Closes #${ISSUE_NUMBER} (linked from ${ISSUE_FILE})}

Roadmap updated: {roadmap-path}
Project state updated: .planning/STATE.md

---

## ▶ Next Up

**Phase {N}: {description}**

`/kata-plan-phase {N}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/kata-add-phase <description>` — add another phase
- Review roadmap

---
```

</step>

</process>

<anti_patterns>

- Don't modify phases outside current milestone
- Don't renumber existing phases
- Don't use decimal numbering (that's /kata-insert-phase)
- Don't create plans yet (that's /kata-plan-phase)
- Don't commit changes (user decides when to commit)
  </anti_patterns>

<success_criteria>
Phase addition is complete when:

- [ ] Phase directory created: `.planning/phases/pending/{NN}-{slug}/`
- [ ] Roadmap updated with new phase entry
- [ ] STATE.md updated with roadmap evolution note
- [ ] New phase appears at end of current milestone
- [ ] Next phase number calculated correctly (ignoring decimals)
- [ ] User informed of next steps
      </success_criteria>
