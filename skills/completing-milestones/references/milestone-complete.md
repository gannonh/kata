<purpose>

Mark a shipped version (v1.0, v1.1, v2.0) as complete. This creates a historical record in MILESTONES.md, performs full PROJECT.md evolution review, reorganizes ROADMAP.md with milestone groupings, and tags the release in git.

This is the ritual that separates "development" from "shipped."

</purpose>

<required_reading>

**Read these files NOW:**

1. @./milestone-archive-template.md
2. @./version-detector.md (if running release workflow)
3. @./changelog-generator.md (if running release workflow)
4. `.planning/ROADMAP.md`
5. `.planning/REQUIREMENTS.md`
6. `.planning/PROJECT.md`

</required_reading>

<archival_behavior>

When a milestone completes, this workflow:

1. Extracts full milestone details to `.planning/milestones/v[X.Y]-ROADMAP.md`
2. Archives requirements to `.planning/milestones/v[X.Y]-REQUIREMENTS.md`
3. Updates ROADMAP.md to replace milestone details with one-line summary
4. Deletes REQUIREMENTS.md (fresh one created for next milestone)
5. Performs full PROJECT.md evolution review
6. Offers to create next milestone inline

**Context Efficiency:**

- Completed milestones: One line each (~50 tokens)
- Full details: In archive files (loaded only when needed)
- Result: ROADMAP.md stays constant size forever
- Result: REQUIREMENTS.md is always milestone-scoped (not cumulative)

**Archive Format:**

**ROADMAP archive** uses `@./milestone-archive-template.md` template with:
- Milestone header (status, phases, date)
- Full phase details from roadmap
- Milestone summary (decisions, issues, technical debt)

**REQUIREMENTS archive** contains:
- All v1 requirements marked complete with outcomes
- Traceability table with final status
- Notes on any requirements that changed during milestone

</archival_behavior>

<process>

<step name="ensure_release_branch">

**CRITICAL: Check pr_workflow and create release branch BEFORE any work.**

This step MUST run first. If pr_workflow is enabled, all milestone completion work
must happen on a release branch, not main.

```bash
PR_WORKFLOW=$(cat .planning/config.json 2>/dev/null | grep -o '"pr_workflow"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
CURRENT_BRANCH=$(git branch --show-current)
```

**If `PR_WORKFLOW=true` AND `CURRENT_BRANCH=main`:**

```bash
# Get version from user input or package.json
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "X.Y.Z")

# Create release branch
git checkout -b "release/v$VERSION"

echo "✓ Created release branch: release/v$VERSION"
```

Present:
```
⚠ pr_workflow is enabled

Creating release branch: release/v$VERSION

All milestone completion work will be committed to this branch.
After completion, a PR will be created to merge to main.
```

**If `PR_WORKFLOW=false` OR already on non-main branch:**

Proceed without creating branch.

**GATE:** Do not proceed to verify_readiness until:
- If pr_workflow=true: Current branch is release/vX.Y.Z (NOT main)
- If pr_workflow=false: Any branch is acceptable

</step>

<step name="verify_readiness">

Check if milestone is truly complete:

```bash
cat .planning/ROADMAP.md
ls .planning/phases/*/SUMMARY.md 2>/dev/null | wc -l
```

**Questions to ask:**

- Which phases belong to this milestone?
- Are all those phases complete (all plans have summaries)?
- Has the work been tested/validated?
- Is this ready to ship/tag?

Present:

```
Milestone: [Name from user, e.g., "v1.0 MVP"]

Appears to include:
- Phase 1: Foundation (2/2 plans complete)
- Phase 2: Authentication (2/2 plans complete)
- Phase 3: Core Features (3/3 plans complete)
- Phase 4: Polish (1/1 plan complete)

Total: 4 phases, 8 plans, all complete
```

<config-check>

```bash
cat .planning/config.json 2>/dev/null
```

</config-check>

<if mode="yolo">

```
⚡ Auto-approved: Milestone scope verification

[Show breakdown summary without prompting]

Proceeding to stats gathering...
```

Proceed directly to gather_stats step.

</if>

<if mode="interactive" OR="custom with gates.confirm_milestone_scope true">

```
Ready to mark this milestone as shipped?
(yes / wait / adjust scope)
```

Wait for confirmation.

If "adjust scope": Ask which phases should be included.
If "wait": Stop, user will return when ready.

</if>

</step>

<step name="release_workflow">

**This step executes when user selected "Yes" or "Yes, dry-run first" in SKILL.md step 0.5**

**Load reference files:**
- Read @./version-detector.md for version detection functions
- Read @./changelog-generator.md for changelog generation functions

**Workflow:**

1. **Detect version bump (REL-02):**
   Use detect_version_bump and calculate_next_version from version-detector.md:
   ```bash
   # Get last release tag
   LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

   # Get commits since last tag
   if [ -n "$LAST_TAG" ]; then
     COMMITS=$(git log --oneline --format="%s" "$LAST_TAG"..HEAD)
   else
     COMMITS=$(git log --oneline --format="%s")
   fi

   # Categorize commits
   BREAKING=$(echo "$COMMITS" | grep -E "^[a-z]+(\(.+\))?!:|BREAKING CHANGE:" || true)
   FEATURES=$(echo "$COMMITS" | grep -E "^feat(\(.+\))?:" || true)
   FIXES=$(echo "$COMMITS" | grep -E "^fix(\(.+\))?:" || true)

   # Detect bump type
   if [ -n "$BREAKING" ]; then
     BUMP_TYPE="major"
   elif [ -n "$FEATURES" ]; then
     BUMP_TYPE="minor"
   elif [ -n "$FIXES" ]; then
     BUMP_TYPE="patch"
   else
     BUMP_TYPE="none"
   fi

   # Get current version
   CURRENT_VERSION=$(node -p "require('./package.json').version")

   # Calculate next version
   IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
   case "$BUMP_TYPE" in
     major) NEXT_VERSION="$((major + 1)).0.0" ;;
     minor) NEXT_VERSION="${major}.$((minor + 1)).0" ;;
     patch) NEXT_VERSION="${major}.${minor}.$((patch + 1))" ;;
     *) NEXT_VERSION="$CURRENT_VERSION" ;;
   esac
   ```

2. **Generate changelog entry (REL-01):**
   Use get_commits_by_type and generate_changelog_entry from changelog-generator.md:
   ```bash
   # Get commits by type
   DOCS=$(echo "$COMMITS" | grep -E "^docs(\(.+\))?:" || true)
   REFACTOR=$(echo "$COMMITS" | grep -E "^refactor(\(.+\))?:" || true)
   PERF=$(echo "$COMMITS" | grep -E "^perf(\(.+\))?:" || true)
   CHANGED="$DOCS
   $REFACTOR
   $PERF"

   # Generate changelog entry
   DATE=$(date +%Y-%m-%d)
   ```

3. **Present for review (REL-04 dry-run):**
   ```
   ## Release Preview

   **Current version:** $CURRENT_VERSION
   **Bump type:** $BUMP_TYPE
   **Next version:** $NEXT_VERSION

   **Changelog entry:**
   ## [$NEXT_VERSION] - $DATE

   ### Added
   [feat commits formatted]

   ### Fixed
   [fix commits formatted]

   ### Changed
   [docs/refactor/perf commits formatted]

   **Files to update:**
   - package.json
   - .claude-plugin/plugin.json
   - CHANGELOG.md
   ```

4. **If dry-run mode:**
   ```
   DRY RUN COMPLETE

   To apply these changes, run the release workflow again without dry-run.
   ```
   Stop here and return to SKILL.md flow.

5. **Confirm before proceeding:**
   Use AskUserQuestion:
   - header: "Confirm Release"
   - question: "Apply release changes?"
   - options:
     - "Yes, update files" — Apply version bump and changelog
     - "Edit changelog first" — Pause for user edits, then confirm
     - "Cancel" — Abort release, proceed to archive only

6. **Apply changes (if confirmed):**
   Use update_versions from version-detector.md:
   ```bash
   # Update package.json
   jq --arg v "$NEXT_VERSION" '.version = $v' package.json > package.json.tmp
   mv package.json.tmp package.json

   # Update plugin.json
   jq --arg v "$NEXT_VERSION" '.version = $v' .claude-plugin/plugin.json > plugin.json.tmp
   mv plugin.json.tmp .claude-plugin/plugin.json

   # Prepend changelog entry to CHANGELOG.md
   # (Use insertion pattern from changelog-generator.md)
   ```

7. **Check pr_workflow mode (REL-03):**
   ```bash
   PR_WORKFLOW=$(cat .planning/config.json 2>/dev/null | grep -o '"pr_workflow"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
   ```

   **If `PR_WORKFLOW=true`:**
   ```
   Release files updated. After PR merge:
   1. Create GitHub Release with tag v$NEXT_VERSION
   2. CI will automatically publish to marketplace

   Note: After GitHub Release is created (manually or via pr_workflow merge),
   the existing `.github/workflows/plugin-release.yml` will automatically
   publish to the marketplace.
   ```

   **If `PR_WORKFLOW=false`:**
   Create GitHub Release directly:
   ```bash
   # Extract changelog for this version
   CHANGELOG=$(awk "/^## \[${NEXT_VERSION}\]/{found=1; next} /^## \[/{if(found) exit} found{print}" CHANGELOG.md)

   # Create release with tag
   gh release create "v$NEXT_VERSION" \
     --title "v$NEXT_VERSION" \
     --notes "$CHANGELOG" \
     --target $(git branch --show-current)

   echo "GitHub Release created: v$NEXT_VERSION"
   ```

8. **Continue to gather_stats step**

**Release files tracking:**
When release workflow completes, set `RELEASE_RAN=true` so git_commit_milestone step knows to stage release files.

</step>

<step name="gather_stats">

Calculate milestone statistics:

```bash
# Count phases and plans in milestone
# (user specified or detected from roadmap)

# Find git range
git log --oneline --grep="feat(" | head -20

# Count files modified in range
git diff --stat FIRST_COMMIT..LAST_COMMIT | tail -1

# Count LOC (adapt to language)
find . -name "*.swift" -o -name "*.ts" -o -name "*.py" | xargs wc -l 2>/dev/null

# Calculate timeline
git log --format="%ai" FIRST_COMMIT | tail -1  # Start date
git log --format="%ai" LAST_COMMIT | head -1   # End date
```

Present summary:

```
Milestone Stats:
- Phases: [X-Y]
- Plans: [Z] total
- Tasks: [N] total (estimated from phase summaries)
- Files modified: [M]
- Lines of code: [LOC] [language]
- Timeline: [Days] days ([Start] → [End])
- Git range: feat(XX-XX) → feat(YY-YY)
```

</step>

<step name="extract_accomplishments">

Read all phase SUMMARY.md files in milestone range:

```bash
cat .planning/phases/01-*/01-*-SUMMARY.md
cat .planning/phases/02-*/02-*-SUMMARY.md
# ... for each phase in milestone
```

From summaries, extract 4-6 key accomplishments.

Present:

```
Key accomplishments for this milestone:
1. [Achievement from phase 1]
2. [Achievement from phase 2]
3. [Achievement from phase 3]
4. [Achievement from phase 4]
5. [Achievement from phase 5]
```

</step>

<step name="create_milestone_entry">

**ACTION REQUIRED: Use the Write tool to update `.planning/MILESTONES.md`.**

1. Read current MILESTONES.md:

```bash
cat .planning/MILESTONES.md
```

2. **Use the Write tool** to prepend the new entry (keep all existing entries below):

```markdown
# Project Milestones: [Project Name from PROJECT.md]

## v[Version] [Name] (Shipped: YYYY-MM-DD)

**Delivered:** [One sentence from user]

**Phases completed:** [X-Y] ([Z] plans total)

**Key accomplishments:**

- [List from previous step]

**Stats:**

- [Files] files created/modified
- [LOC] lines of [language]
- [Phases] phases, [Plans] plans, [Tasks] tasks
- [Days] days from [start milestone or start project] to ship

**Git range:** `feat(XX-XX)` → `feat(YY-YY)`

**What's next:** [Ask user: what's the next goal?]

---

[... existing entries below ...]
```

3. **Verify the file was written** (GATE - do not proceed if this fails):

```bash
head -5 .planning/MILESTONES.md | grep "v[X.Y]" && echo "✓ MILESTONES.md updated" || echo "✗ MILESTONES.md NOT updated - fix before continuing"
```

**CRITICAL:** Do NOT proceed to the next step until MILESTONES.md contains the new version entry.

</step>

<step name="evolve_project_full_review">

Perform full PROJECT.md evolution review at milestone completion.

**Read all phase summaries in this milestone:**

```bash
cat .planning/phases/*-*/*-SUMMARY.md
```

**Full review checklist:**

1. **"What This Is" accuracy:**
   - Read current description
   - Compare to what was actually built
   - Update if the product has meaningfully changed

2. **Core Value check:**
   - Is the stated core value still the right priority?
   - Did shipping reveal a different core value?
   - Update if the ONE thing has shifted

3. **Requirements audit:**

   **Validated section:**
   - All Active requirements shipped in this milestone → Move to Validated
   - Format: `- ✓ [Requirement] — v[X.Y]`

   **Active section:**
   - Remove requirements that moved to Validated
   - Add any new requirements for next milestone
   - Keep requirements that weren't addressed yet

   **Out of Scope audit:**
   - Review each item — is the reasoning still valid?
   - Remove items that are no longer relevant
   - Add any requirements invalidated during this milestone

4. **Context update:**
   - Current codebase state (LOC, tech stack)
   - User feedback themes (if any)
   - Known issues or technical debt to address

5. **Key Decisions audit:**
   - Extract all decisions from milestone phase summaries
   - Add to Key Decisions table with outcomes where known
   - Mark ✓ Good, ⚠️ Revisit, or — Pending for each

6. **Constraints check:**
   - Any constraints that changed during development?
   - Update as needed

**Update PROJECT.md:**

Make all edits inline. Update "Last updated" footer:

```markdown
---
*Last updated: [date] after v[X.Y] milestone*
```

**Example full evolution (v1.0 → v1.1 prep):**

Before:

```markdown
## What This Is

A real-time collaborative whiteboard for remote teams.

## Core Value

Real-time sync that feels instant.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Canvas drawing tools
- [ ] Real-time sync < 500ms
- [ ] User authentication
- [ ] Export to PNG

### Out of Scope

- Mobile app — web-first approach
- Video chat — use external tools
```

After v1.0:

```markdown
## What This Is

A real-time collaborative whiteboard for remote teams with instant sync and drawing tools.

## Core Value

Real-time sync that feels instant.

## Requirements

### Validated

- ✓ Canvas drawing tools — v1.0
- ✓ Real-time sync < 500ms — v1.0 (achieved 200ms avg)
- ✓ User authentication — v1.0

### Active

- [ ] Export to PNG
- [ ] Undo/redo history
- [ ] Shape tools (rectangles, circles)

### Out of Scope

- Mobile app — web-first approach, PWA works well
- Video chat — use external tools
- Offline mode — real-time is core value

## Context

Shipped v1.0 with 2,400 LOC TypeScript.
Tech stack: Next.js, Supabase, Canvas API.
Initial user testing showed demand for shape tools.
```

**Step complete when:**

- [ ] "What This Is" reviewed and updated if needed
- [ ] Core Value verified as still correct
- [ ] All shipped requirements moved to Validated
- [ ] New requirements added to Active for next milestone
- [ ] Out of Scope reasoning audited
- [ ] Context updated with current state
- [ ] All milestone decisions added to Key Decisions
- [ ] "Last updated" footer reflects milestone completion

</step>

<step name="reorganize_roadmap">

Update `.planning/ROADMAP.md` to group completed milestone phases.

Add milestone headers and collapse completed work:

```markdown
# Roadmap: [Project Name]

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped YYYY-MM-DD)
- 🚧 **v1.1 Security** — Phases 5-6 (in progress)
- 📋 **v2.0 Redesign** — Phases 7-10 (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED YYYY-MM-DD</summary>

- [x] Phase 1: Foundation (2/2 plans) — completed YYYY-MM-DD
- [x] Phase 2: Authentication (2/2 plans) — completed YYYY-MM-DD
- [x] Phase 3: Core Features (3/3 plans) — completed YYYY-MM-DD
- [x] Phase 4: Polish (1/1 plan) — completed YYYY-MM-DD

</details>

### 🚧 v[Next] [Name] (In Progress / Planned)

- [ ] Phase 5: [Name] ([N] plans)
- [ ] Phase 6: [Name] ([N] plans)

## Progress

| Phase             | Milestone | Plans Complete | Status      | Completed  |
| ----------------- | --------- | -------------- | ----------- | ---------- |
| 1. Foundation     | v1.0      | 2/2            | Complete    | YYYY-MM-DD |
| 2. Authentication | v1.0      | 2/2            | Complete    | YYYY-MM-DD |
| 3. Core Features  | v1.0      | 3/3            | Complete    | YYYY-MM-DD |
| 4. Polish         | v1.0      | 1/1            | Complete    | YYYY-MM-DD |
| 5. Security Audit | v1.1      | 0/1            | Not started | -          |
| 6. Hardening      | v1.1      | 0/2            | Not started | -          |
```

</step>

<step name="archive_milestone">

Extract completed milestone details and create archive file.

**Process:**

1. Create archive file path: `.planning/milestones/v[X.Y]-ROADMAP.md`

2. Read the `@./milestone-archive-template.md` template

3. Extract data from current ROADMAP.md:
   - All phases belonging to this milestone (by phase number range)
   - Full phase details (goals, plans, dependencies, status)
   - Phase plan lists with completion checkmarks

4. Extract data from PROJECT.md:
   - Key decisions made during this milestone
   - Requirements that were validated

5. Fill template {{PLACEHOLDERS}}:
   - {{VERSION}} — Milestone version (e.g., "1.0")
   - {{MILESTONE_NAME}} — From ROADMAP.md milestone header
   - {{DATE}} — Today's date
   - {{PHASE_START}} — First phase number in milestone
   - {{PHASE_END}} — Last phase number in milestone
   - {{TOTAL_PLANS}} — Count of all plans in milestone
   - {{MILESTONE_DESCRIPTION}} — From ROADMAP.md overview
   - {{PHASES_SECTION}} — Full phase details extracted
   - {{DECISIONS_FROM_PROJECT}} — Key decisions from PROJECT.md
   - {{ISSUES_RESOLVED_DURING_MILESTONE}} — From summaries

6. Write filled template to `.planning/milestones/v[X.Y]-ROADMAP.md`

7. Delete ROADMAP.md (fresh one created for next milestone):
   ```bash
   rm .planning/ROADMAP.md
   ```

8. Verify archive exists:
   ```bash
   ls .planning/milestones/v[X.Y]-ROADMAP.md
   ```

9. Confirm roadmap archive complete:

   ```
   ✅ v[X.Y] roadmap archived to milestones/v[X.Y]-ROADMAP.md
   ✅ ROADMAP.md deleted (fresh one for next milestone)
   ```

**Note:** Phase directories (`.planning/phases/`) are NOT deleted. They accumulate across milestones as the raw execution history. Phase numbering continues (v1.0 phases 1-4, v1.1 phases 5-8, etc.).

</step>

<step name="archive_requirements">

**ACTION REQUIRED: Archive requirements and prepare for fresh requirements in next milestone.**

**Process:**

1. Read current REQUIREMENTS.md:
   ```bash
   cat .planning/REQUIREMENTS.md
   ```

2. Transform requirements for archive:
   - Mark all v1 requirements as `[x]` complete
   - Add outcome notes where relevant (validated, adjusted, dropped)
   - Update traceability table status to "Complete" for all shipped requirements

3. **Use the Write tool** to create `.planning/milestones/v[X.Y]-REQUIREMENTS.md`:

   ```markdown
   # Requirements Archive: v[X.Y] [Milestone Name]

   **Archived:** [DATE]
   **Status:** ✅ SHIPPED

   This is the archived requirements specification for v[X.Y].
   For current requirements, see `.planning/REQUIREMENTS.md` (created for next milestone).

   ---

   [Full REQUIREMENTS.md content with checkboxes marked complete]

   ---

   ## Milestone Summary

   **Shipped:** [X] of [Y] v1 requirements
   **Adjusted:** [list any requirements that changed during implementation]
   **Dropped:** [list any requirements removed and why]

   ---
   *Archived: [DATE] as part of v[X.Y] milestone completion*
   ```

4. **Verify the archive was created** (GATE - do not proceed if this fails):
   ```bash
   ls -la .planning/milestones/v[X.Y]-REQUIREMENTS.md && echo "✓ Requirements archived" || echo "✗ Archive NOT created - fix before continuing"
   ```

5. Delete original REQUIREMENTS.md:
   ```bash
   rm .planning/REQUIREMENTS.md
   ```

6. Confirm:
   ```
   ✅ Requirements archived to milestones/v[X.Y]-REQUIREMENTS.md
   ✅ REQUIREMENTS.md deleted (fresh one needed for next milestone)
   ```

**CRITICAL:** Do NOT proceed to the next step until the archive file exists.

**Important:** The next milestone workflow starts with `/kata:new-milestone` which includes requirements definition. PROJECT.md's Validated section carries the cumulative record across milestones.

</step>

<step name="archive_audit">

Move the milestone audit file to the archive (if it exists):

```bash
# Move audit to milestones folder (if exists)
[ -f .planning/v[X.Y]-MILESTONE-AUDIT.md ] && mv .planning/v[X.Y]-MILESTONE-AUDIT.md .planning/milestones/
```

Confirm:
```
✅ Audit archived to milestones/v[X.Y]-MILESTONE-AUDIT.md
```

(Skip silently if no audit file exists — audit is optional)

</step>

<step name="close_github_milestone">

Close the GitHub Milestone if github.enabled.

```bash
# Check if GitHub integration is enabled
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")

if [ "$GITHUB_ENABLED" = "true" ]; then
  # Find the milestone by name (v[X.Y])
  # VERSION should be set from earlier steps (e.g., from package.json or user input)
  MILESTONE_NUMBER=$(gh api repos/:owner/:repo/milestones --jq ".[] | select(.title == \"v${VERSION}\") | .number" 2>/dev/null)

  if [ -n "$MILESTONE_NUMBER" ]; then
    # Close the milestone
    gh api repos/:owner/:repo/milestones/${MILESTONE_NUMBER} \
      --method PATCH \
      --field state=closed \
      && echo "Closed GitHub Milestone v${VERSION}" \
      || echo "Warning: Failed to close GitHub Milestone v${VERSION}"
  else
    echo "Note: No GitHub Milestone found for v${VERSION}"
  fi
else
  echo "GitHub integration disabled, skipping milestone closure"
fi
```

Confirm:
```
{If closed: ✅ GitHub Milestone v[X.Y] closed}
{If not found: Note: No GitHub Milestone for v[X.Y] (skipped)}
```

</step>

<step name="review_documentation">

Offer final README review before committing milestone completion.

Use AskUserQuestion:
- header: "Final README Review"
- question: "Revise README before completing milestone v{{version}}?"
- options:
 - "Yes, draft an update for my review" — Revise README and present to the user for approval
 - "No, I'll make the edits myself" — Pause for user review, wait for "continue"
 - "Skip for now" — Proceed directly to commit


**If "Yes, I'll review now":**
```
Review README.md for the complete v{{version}} milestone.
Ensure all shipped features are documented.
Say "continue" when ready to proceed.
```

**If "Show README":**
Display README.md content, then ask: "Does this look accurate for v{{version}}? (yes / needs updates)"

**If "Skip" or review complete:** Proceed to update_state.

*Non-blocking: milestone completion continues regardless of choice.*

</step>

<step name="update_state">

Update STATE.md to reflect milestone completion.

**Project Reference:**

```markdown
## Project Reference

See: .planning/PROJECT.md (updated [today])

**Core value:** [Current core value from PROJECT.md]
**Current focus:** [Next milestone or "Planning next milestone"]
```

**Current Position:**

```markdown
Phase: [Next phase] of [Total] ([Phase name])
Plan: Not started
Status: Ready to plan
Last activity: [today] — v[X.Y] milestone complete

Progress: [updated progress bar]
```

**Accumulated Context:**

- Clear decisions summary (full log in PROJECT.md)
- Clear resolved blockers
- Keep open blockers for next milestone

</step>

<step name="git_tag">

Create git tag for milestone:

```bash
git tag -a v[X.Y] -m "$(cat <<'EOF'
v[X.Y] [Name]

Delivered: [One sentence]

Key accomplishments:
- [Item 1]
- [Item 2]
- [Item 3]

See .planning/MILESTONES.md for full details.
EOF
)"
```

Confirm: "Tagged: v[X.Y]"

Ask: "Push tag to remote? (y/n)"

If yes:

```bash
git push origin v[X.Y]
```

</step>

<step name="git_commit_milestone">

Commit milestone completion including archive files and deletions.

**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations for planning files only

**If `COMMIT_PLANNING_DOCS=true` (default):**

```bash
# Stage archive files (new)
git add .planning/milestones/v[X.Y]-ROADMAP.md
git add .planning/milestones/v[X.Y]-REQUIREMENTS.md
git add .planning/milestones/v[X.Y]-MILESTONE-AUDIT.md 2>/dev/null || true

# Stage updated files
git add .planning/MILESTONES.md
git add .planning/PROJECT.md
git add .planning/STATE.md

# Stage deletions
git add -u .planning/
```

**If release workflow was run (RELEASE_RAN=true):**

```bash
# Stage release files
git add package.json
git add .claude-plugin/plugin.json
git add CHANGELOG.md
```

**Commit with descriptive message:**

```bash
# Build commit message based on what was included
if [ "$RELEASE_RAN" = "true" ]; then
  git commit -m "$(cat <<'EOF'
chore: complete v[X.Y] milestone with release

Release:
- package.json version bumped
- plugin.json version bumped
- CHANGELOG.md updated

Archived:
- milestones/v[X.Y]-ROADMAP.md
- milestones/v[X.Y]-REQUIREMENTS.md
- milestones/v[X.Y]-MILESTONE-AUDIT.md (if audit was run)

Deleted (fresh for next milestone):
- ROADMAP.md
- REQUIREMENTS.md

Updated:
- MILESTONES.md (new entry)
- PROJECT.md (requirements → Validated)
- STATE.md (reset for next milestone)

Tagged: v[X.Y]
EOF
)"
else
  git commit -m "$(cat <<'EOF'
chore: complete v[X.Y] milestone

Archived:
- milestones/v[X.Y]-ROADMAP.md
- milestones/v[X.Y]-REQUIREMENTS.md
- milestones/v[X.Y]-MILESTONE-AUDIT.md (if audit was run)

Deleted (fresh for next milestone):
- ROADMAP.md
- REQUIREMENTS.md

Updated:
- MILESTONES.md (new entry)
- PROJECT.md (requirements → Validated)
- STATE.md (reset for next milestone)

Tagged: v[X.Y]
EOF
)"
fi
```

Confirm: "Committed: chore: complete v[X.Y] milestone"

</step>

<step name="offer_next">


✅ Milestone v[X.Y] [Name] complete

Shipped:
- [N] phases ([M] plans, [P] tasks)
- [One sentence of what shipped]

Archived:
- milestones/v[X.Y]-ROADMAP.md
- milestones/v[X.Y]-REQUIREMENTS.md

Summary: .planning/MILESTONES.md
Tag: v[X.Y]

---

## ▶ Next Up

**Start Next Milestone** — questioning → research → requirements → roadmap

`/kata:new-milestone`

<sub>`/clear` first → fresh context window</sub>

---


</step>

</process>

<milestone_naming>

**Version conventions:**
- **v1.0** — Initial MVP
- **v1.1, v1.2, v1.3** — Minor updates, new features, fixes
- **v2.0, v3.0** — Major rewrites, breaking changes, significant new direction

**Name conventions:**
- v1.0 MVP
- v1.1 Security
- v1.2 Performance
- v2.0 Redesign
- v2.0 iOS Launch

Keep names short (1-2 words describing the focus).

</milestone_naming>

<what_qualifies>

**Create milestones for:**
- Initial release (v1.0)
- Public releases
- Major feature sets shipped
- Before archiving planning

**Don't create milestones for:**
- Every phase completion (too granular)
- Work in progress (wait until shipped)
- Internal dev iterations (unless truly shipped internally)

If uncertain, ask: "Is this deployed/usable/shipped in some form?"
If yes → milestone. If no → keep working.

</what_qualifies>

<success_criteria>

Milestone completion is successful when:

- [ ] MILESTONES.md entry created with stats and accomplishments
- [ ] PROJECT.md full evolution review completed
- [ ] All shipped requirements moved to Validated in PROJECT.md
- [ ] Key Decisions updated with outcomes
- [ ] ROADMAP.md reorganized with milestone grouping
- [ ] Roadmap archive created (milestones/v[X.Y]-ROADMAP.md)
- [ ] Requirements archive created (milestones/v[X.Y]-REQUIREMENTS.md)
- [ ] REQUIREMENTS.md deleted (fresh for next milestone)
- [ ] STATE.md updated with fresh project reference
- [ ] Git tag created (v[X.Y])
- [ ] Milestone commit made (includes archive files and deletion)
- [ ] User knows next step (/kata:new-milestone)

</success_criteria>
