# Kata-GitHub Primitive Mapping

This document defines how Kata concepts map to GitHub primitives when `github.enabled=true`.

## Mapping Table

| Kata Concept  | GitHub Primitive        | Created By                  | Notes                                                       |
| ------------- | ----------------------- | --------------------------- | ----------------------------------------------------------- |
| **Milestone** | GitHub Milestone        | `add-milestone` (Phase 5.5) | 1:1 mapping. Version becomes milestone title.               |
| **Phase**     | GitHub Issue            | `add-milestone` (Phase 9.5) | Assigned to corresponding milestone. `phase` label applied. |
| **Plan**      | Checklist in Issue body | `execute-phase` (future)    | Plans become `- [ ]` items in phase issue body.             |
| **Task**      | N/A                     | Not mapped                  | Tasks are internal execution units, not surfaced to GitHub. |

## GitHub Config Keys

| Key                | Values               | Effect                                   |
| ------------------ | -------------------- | ---------------------------------------- |
| `github.enabled`   | `true`/`false`       | Master toggle for all GitHub integration |
| `github.issueMode` | `auto`/`ask`/`never` | When to create phase Issues              |

## Milestone Creation Flow (Phase 5.5)

When `github.enabled=true` and a GitHub remote exists:

1. **Check for existing milestone:**
   ```bash
   MILESTONE_EXISTS=$(gh api /repos/:owner/:repo/milestones | jq -r ".[] | select(.title==\"v${VERSION}\") | .number")
   ```

2. **Create if doesn't exist:**
   ```bash
   gh api --method POST /repos/:owner/:repo/milestones \
     -f title="v${VERSION}" \
     -f state='open' \
     -f description="${MILESTONE_DESC}"
   ```

3. **Idempotent:** Re-running add-milestone with same version skips creation.

## Phase Issue Creation Flow (Phase 9.5)

When `github.enabled=true` and GitHub Milestone created, phase issues are created for each phase in the milestone.

### When It Runs

- After ROADMAP.md is committed (Phase 9)
- After GitHub Milestone is created (Phase 5.5)
- Only when `github.enabled=true`

### issueMode Check

The `github.issueMode` config controls phase issue creation:

| Value   | Behavior                                        |
| ------- | ----------------------------------------------- |
| `auto`  | Create issues automatically (default)           |
| `ask`   | Prompt user via AskUserQuestion before creating |
| `never` | Skip phase issue creation silently              |

### Label Creation (Idempotent)

```bash
gh label create "phase" --color "0E8A16" --description "Kata phase tracking" --force 2>/dev/null || true
```

The `--force` flag ensures the command succeeds whether the label exists or not.

### ROADMAP Parsing

Phases are extracted from ROADMAP.md within the current milestone section:

1. Find milestone section by `### v${VERSION}` header
2. Extract phase blocks between `#### Phase N:` headers
3. Parse each phase's goal, requirements, and success criteria

Key variables assigned:
- `PHASE_NUM` - Phase number (e.g., "3", "2.1")
- `PHASE_NAME` - Phase name from header
- `PHASE_GOAL` - From `**Goal**:` line
- `REQUIREMENT_IDS` - From `**Requirements**:` line (optional)
- `SUCCESS_CRITERIA_AS_CHECKLIST` - Numbered list converted to `- [ ]` format

### Issue Existence Check (Idempotent)

Before creating, check if phase issue already exists:

```bash
EXISTING=$(gh issue list --label "phase" --milestone "v${VERSION}" --json number,title \
  --jq ".[] | select(.title | startswith(\"Phase ${PHASE_NUM}:\")) | .number" 2>/dev/null)
```

If `EXISTING` is non-empty, skip creation and report existing issue number.

### Issue Creation

```bash
gh issue create \
  --title "Phase ${PHASE_NUM}: ${PHASE_NAME}" \
  --body-file /tmp/phase-issue-body.md \
  --label "phase" \
  --milestone "v${VERSION}"
```

**Important:** Use `--body-file` (not `--body`) to handle special characters in phase goals safely.

### Issue Body Template

```markdown
## Goal

{phase goal from ROADMAP.md}

## Success Criteria

- [ ] Criterion 1
- [ ] Criterion 2
...

## Requirements

{requirement IDs, if any}

## Plans

<!-- Checklist added by /kata-plan-phase (Phase 4) -->
_Plans will be added after phase planning completes._

---
<sub>Created by Kata | Phase {N} of milestone v{VERSION}</sub>
```

### Error Handling

All operations are non-blocking:
- Missing milestone: Warning, skip phase issues
- Auth failure: Warning, skip phase issues
- Issue creation failure: Warning per phase, continue to next phase
- Planning files always persist locally regardless of GitHub status

## Notes on Phase Issue Creation

**Implemented in Phase 9.5 of add-milestone skill.** See "Phase Issue Creation Flow (Phase 9.5)" section above for full details.

When `github.issueMode=auto` or user approves:
1. Create issue with `phase` label
2. Assign to milestone by number
3. Issue body includes phase goal and success criteria
4. Checklist of plans added later during plan-phase (Phase 4)

## Plan Checklist Sync (Future - Phase 4)

During execution:
- Plans start as `- [ ]` items
- `execute-phase` updates to `- [x]` as each plan completes
- Issue body is edited in place

## Future: Sub-Issues

If `gh-subissue` extension is available, plans could become sub-issues of the phase issue rather than checklist items. This provides:
- Individual plan status tracking
- Separate discussion threads per plan
- Richer linking

Currently not implemented; checklist approach is the MVP.
