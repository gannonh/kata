# Kata-GitHub Primitive Mapping

This document defines how Kata concepts map to GitHub primitives when `github.enabled=true`.

## Mapping Table

| Kata Concept | GitHub Primitive | Created By | Notes |
| ------------ | ---------------- | ---------- | ----- |
| **Milestone** | GitHub Milestone | `add-milestone` (Phase 5.5) | 1:1 mapping. Version becomes milestone title. |
| **Phase** | GitHub Issue | `planning-phases` (future) | Assigned to corresponding milestone. `phase` label applied. |
| **Plan** | Checklist in Issue body | `executing-phases` (future) | Plans become `- [ ]` items in phase issue body. |
| **Task** | N/A | Not mapped | Tasks are internal execution units, not surfaced to GitHub. |

## GitHub Config Keys

| Key | Values | Effect |
| --- | ------ | ------ |
| `github.enabled` | `true`/`false` | Master toggle for all GitHub integration |
| `github.issueMode` | `auto`/`ask`/`never` | When to create phase Issues |

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

## Phase Issue Creation (Future - Phase 3)

When `github.issueMode=auto` or user approves:

1. Create issue with `phase` label
2. Assign to milestone by number
3. Issue body includes:
   - Phase goal
   - Success criteria
   - Checklist of plans (added during planning-phases)

## Plan Checklist Sync (Future - Phase 4)

During execution:
- Plans start as `- [ ]` items
- `executing-phases` updates to `- [x]` as each plan completes
- Issue body is edited in place

## Future: Sub-Issues

If `gh-subissue` extension is available, plans could become sub-issues of the phase issue rather than checklist items. This provides:
- Individual plan status tracking
- Separate discussion threads per plan
- Richer linking

Currently not implemented; checklist approach is the MVP.
