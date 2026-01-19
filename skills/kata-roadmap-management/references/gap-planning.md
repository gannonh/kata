# Gap Planning Reference

Creating phases to close gaps identified by milestone audit.

## Overview

Gap planning transforms audit findings into actionable phases that close coverage gaps in the milestone.

**Input:** MILESTONE-AUDIT.md (from `/kata:audit-milestone`)
**Output:** New phases in ROADMAP.md that address identified gaps

## Gap Identification

### Gap Types

| Type | Source | Description |
|------|--------|-------------|
| Requirements | `gaps.requirements` | Unsatisfied v1 requirements |
| Integration | `gaps.integration` | Missing cross-phase connections |
| Flows | `gaps.flows` | Broken end-to-end user flows |

### Audit File Structure

```yaml
# .planning/v1.0-MILESTONE-AUDIT.md frontmatter

gaps:
  requirements:
    - id: DASH-01
      description: "User sees their data"
      reason: "Dashboard exists but doesn't fetch from API"
      missing:
        - "useEffect with fetch to /api/user/data"
        - "State for user data"
        - "Render user data in JSX"

  integration:
    - from_phase: 1
      to_phase: 3
      connection: "Auth token → API calls"
      reason: "Dashboard API calls don't include auth header"
      missing:
        - "Auth header in fetch calls"
        - "Token refresh on 401"

  flows:
    - name: "User views dashboard after login"
      broken_at: "Dashboard data load"
      reason: "No fetch call"
      missing:
        - "Fetch user data on mount"
        - "Display loading state"
        - "Render user data"
```

## Prioritizing Gaps

### Priority Levels

Map gaps to REQUIREMENTS.md priority:

| Priority | Action | Blocks Milestone? |
|----------|--------|-------------------|
| `must` | Create phase, execute | Yes |
| `should` | Create phase, execute | Recommended |
| `nice` | Ask user | No |

### Priority Inference

For integration/flow gaps, infer priority from affected requirements:
- If gap blocks a `must` requirement → treat as `must`
- If gap blocks multiple `should` requirements → treat as `must`
- If gap only affects `nice` requirements → treat as `nice`

## Grouping Gaps into Phases

### Grouping Rules

1. **Same affected phase** → combine into one fix phase
2. **Same subsystem** (auth, API, UI) → combine
3. **Dependency order** → fix stubs before wiring
4. **Phase size** → keep phases focused: 2-4 tasks each

### Grouping Example

Three separate gaps:
```
Gap 1: DASH-01 unsatisfied (Dashboard doesn't fetch)
Gap 2: Integration Phase 1→3 (Auth not passed to API calls)
Gap 3: Flow "View dashboard" broken at data fetch
```

Grouped into one phase:
```markdown
Phase 6: Wire Dashboard to API

Tasks:
1. Add fetch to Dashboard.tsx
2. Include auth header in fetch
3. Handle response, update state
4. Render user data
```

### Anti-Pattern: One Gap Per Phase

```markdown
# BAD: Too many small phases
Phase 6: Add data fetching
Phase 7: Add auth header
Phase 8: Handle response
Phase 9: Render data

# GOOD: Grouped by coherent capability
Phase 6: Wire Dashboard to API
  - Add fetch, include auth, handle response, render
```

## Gap-to-Phase Mapping

### Requirement Gap → Tasks

```yaml
# Input gap
gap:
  id: DASH-01
  description: "User sees their data"
  reason: "Dashboard exists but doesn't fetch from API"
  missing:
    - "useEffect with fetch to /api/user/data"
    - "State for user data"
    - "Render user data in JSX"

# Output phase
phase: "Wire Dashboard Data"
tasks:
  - name: "Add data fetching"
    files: [src/components/Dashboard.tsx]
    action: "Add useEffect that fetches /api/user/data on mount"

  - name: "Add state management"
    files: [src/components/Dashboard.tsx]
    action: "Add useState for userData, loading, error states"

  - name: "Render user data"
    files: [src/components/Dashboard.tsx]
    action: "Replace placeholder with userData.map rendering"
```

### Integration Gap → Tasks

```yaml
# Input gap
gap:
  from_phase: 1
  to_phase: 3
  connection: "Auth token → API calls"
  reason: "Dashboard API calls don't include auth header"
  missing:
    - "Auth header in fetch calls"
    - "Token refresh on 401"

# Output phase
phase: "Add Auth to Dashboard API Calls"
tasks:
  - name: "Add auth header to fetches"
    files: [src/components/Dashboard.tsx, src/lib/api.ts]
    action: "Include Authorization header with token in all API calls"

  - name: "Handle 401 responses"
    files: [src/lib/api.ts]
    action: "Add interceptor to refresh token or redirect to login on 401"
```

### Flow Gap → Tasks

Flow gaps often overlap with requirement/integration gaps:

```yaml
# Input gap
gap:
  name: "User views dashboard after login"
  broken_at: "Dashboard data load"
  reason: "No fetch call"

# Usually maps to same phase as requirement gap
# Flow gaps validate the OTHER gaps are correctly identified
```

## Phase Proposal Format

### For User Presentation

```markdown
## Gap Closure Plan

**Milestone:** v1.0 Foundation
**Gaps to close:** 3 requirements, 2 integration, 1 flow

### Proposed Phases

**Phase 6: Wire Dashboard to API**
Priority: must (blocks DASH-01)
Closes:
- DASH-01: User sees their data
- Integration: Phase 1 → Phase 3 (auth token)
- Flow: "User views dashboard" at data load
Tasks: 4

**Phase 7: Complete Profile Management**
Priority: should (PROF-02, PROF-03)
Closes:
- PROF-02: User can update profile picture
- PROF-03: User can change password
Tasks: 3

### Deferred (nice-to-have)

These gaps are optional. Include them?
- SOCIAL-03: User can see trending posts

---

Create these 2 phases? (yes / adjust / defer all optional)
```

### Phase Entry for ROADMAP.md

```markdown
### Phase 6: Wire Dashboard to API

**Goal:** Connect Dashboard to backend API with authentication
**Requirements:** DASH-01
**Gap Closure:** Closes gaps from v1.0 audit
**Depends on:** Phase 5

Plans:
- [ ] TBD (run /kata:plan-phase 6 to break down)

**Details:**
- Add data fetching to Dashboard component
- Include auth token in API calls
- Handle loading and error states
- Render user data
```

## Batch Phase Creation

### Calculate Phase Numbers

```bash
# Find highest existing phase
HIGHEST=$(ls -d .planning/phases/*/ | sort -V | tail -1 | \
  grep -oE "[0-9]+" | head -1)

# New phases start after highest
NEXT=$((HIGHEST + 1))
```

### Create Multiple Phases

```bash
# Create phase 6
mkdir -p ".planning/phases/06-wire-dashboard-api"

# Create phase 7
mkdir -p ".planning/phases/07-complete-profile"

# Update ROADMAP.md with both
# Update STATE.md once
```

### Commit Pattern

```bash
git add .planning/ROADMAP.md
git commit -m "docs(roadmap): add gap closure phases 6-7"
```

## Integration with Milestone Audit

### Workflow

```
1. /kata:audit-milestone
   → Creates MILESTONE-AUDIT.md with gaps

2. /kata:plan-milestone-gaps
   → Reads MILESTONE-AUDIT.md
   → Groups gaps into phases
   → Presents proposal
   → Creates phases on approval

3. /kata:plan-phase {N}
   → Plans each gap closure phase
   → Tasks derived from gap.missing

4. /kata:execute-phase {N}
   → Executes gap closure
   → Fixes the gaps

5. /kata:audit-milestone (re-audit)
   → Verifies gaps closed
   → Updates audit results
```

### Re-Audit After Closure

After executing gap closure phases:
```bash
/kata:audit-milestone
```

Expected result:
```markdown
## Audit Results

**Coverage:** 100%
**Gaps:** 0

All v1 requirements satisfied.
Ready for /kata:complete-milestone
```

## Edge Cases

### No Audit File

```
ERROR: No audit file found
Run /kata:audit-milestone first
```

### No Gaps Found

```
No gaps to close!
Milestone audit shows 100% coverage.
Ready for /kata:complete-milestone
```

### All Gaps Are Nice-to-Have

```
All identified gaps are nice-to-have priority.

Options:
1. Create phases anyway (comprehensive)
2. Defer all to v2 (ship faster)
3. Select specific gaps to include

Which approach?
```

### Gap Depends on Future Phase

If gap requires work in an unexecuted phase:
```
Gap DASH-01 requires Phase 4 (not yet executed)

Options:
1. Execute Phase 4 first, then close gap
2. Include fix in Phase 4 plans
3. Create Phase 4.1 for gap closure after Phase 4
```

## Quality Standards

Gap closure phases must:
- [ ] Map every `must` gap to a phase
- [ ] Present `should` gaps (user can defer)
- [ ] Ask about `nice` gaps
- [ ] Keep phases focused (2-4 tasks)
- [ ] Maintain dependency order
- [ ] Update ROADMAP.md completely
- [ ] Not duplicate work in existing phases
