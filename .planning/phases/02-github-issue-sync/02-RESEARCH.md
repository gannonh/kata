# Phase 2: GitHub Issue Sync - Research

**Researched:** 2026-02-01
**Domain:** GitHub CLI issue management, bidirectional sync
**Confidence:** HIGH

## Summary

Phase 2 requires integrating Kata's local issue model (established in Phase 1) with GitHub Issues for projects with `github.enabled=true`. The phase has three distinct requirements:

1. **ISS-02: Outbound sync** — Issues created via `/kata:add-issue` should create corresponding GitHub Issues with `backlog` label
2. **PULL-01: Inbound pull** — Pull existing GitHub Issues into Kata workflow via filtering
3. **PULL-02: Execution linking** — Reference external GitHub Issues during execution and auto-update on completion

The `gh` CLI (v2.86.0) provides all necessary commands. The existing codebase already has patterns for GitHub issue creation (phase issues) that can be adapted. Key insight: the `backlog` label creates a distinct namespace for Kata-created issues separate from `phase` issues.

**Primary recommendation:** Extend the existing add-issue and check-issues skills to conditionally use GitHub API when `github.enabled=true`, while maintaining local file fallback for non-GitHub projects.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Tool | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| `gh` CLI | 2.86.0 | GitHub API access | Already used throughout Kata for milestones, PRs, phase issues |
| jq | N/A | JSON parsing | Embedded in `gh --jq` flag, no separate dependency |

### Supporting
| Tool | Purpose | When to Use |
| --- | --- | --- |
| `gh issue create` | Create new GitHub Issues | When `github.enabled=true` and user creates issue via `/kata:add-issue` |
| `gh issue list` | Query existing issues | Pull existing issues, check for duplicates |
| `gh issue edit` | Update issue body/labels | Auto-update on completion |
| `gh issue close` | Close completed issues | When linked issue work completes |
| `gh issue view` | Read issue details | Display issue content in check-issues |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| `gh` CLI | GitHub REST API via curl | More verbose, no auth handling. `gh` handles auth automatically. |
| `gh` CLI | GitHub GraphQL API | More powerful but overkill for issue CRUD. CLI is simpler. |
| Labels for filtering | GitHub Projects | Projects require `project` scope auth refresh. Labels work with default auth. |

**Installation:**
No additional installation needed. `gh` CLI is already a dependency of Kata workflows.

## Architecture Patterns

### Recommended Integration Points

```
skills/add-issue/SKILL.md      # Modify: add GitHub sync after local file creation
skills/check-issues/SKILL.md   # Modify: query both local and GitHub sources
skills/execute-phase/SKILL.md  # Modify: reference/update linked issues
```

### Pattern 1: Conditional GitHub Sync
**What:** Check `github.enabled` config before any GitHub operation
**When to use:** All GitHub API calls
**Example:**
```bash
# Source: existing pattern in skills/execute-phase/SKILL.md line 148-152
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")

if [ "$GITHUB_ENABLED" = "true" ]; then
  # GitHub operations here
fi
```

### Pattern 2: Label-Based Issue Namespacing
**What:** Use distinct labels to separate issue types
**When to use:** Creating or querying issues
**Example:**
```bash
# Kata backlog issues (user-created via /kata:add-issue)
gh issue create --label "backlog" --title "$TITLE" --body "$BODY"
gh issue list --label "backlog" --json number,title,body,labels,state

# Phase tracking issues (auto-created by kata-add-milestone)
gh issue list --label "phase" --milestone "v${VERSION}"
```

### Pattern 3: Provenance Tracking
**What:** Store issue origin in local file frontmatter for bidirectional sync
**When to use:** When pulling external issues or creating GitHub issues
**Example:**
```yaml
# Local issue file frontmatter
---
created: 2026-02-01T12:00
title: Fix authentication bug
area: auth
provenance: github:gannonh/kata-orchestrator#42  # External reference
files:
  - src/auth/login.ts:15-30
---
```

### Pattern 4: Dual-Source Display
**What:** Merge local and GitHub issues in unified view
**When to use:** `/kata:check-issues` display
**Example:**
```bash
# Get local issues
LOCAL_ISSUES=$(for file in .planning/issues/open/*.md; do
  # parse frontmatter
done)

# Get GitHub issues (if enabled)
if [ "$GITHUB_ENABLED" = "true" ]; then
  GITHUB_ISSUES=$(gh issue list --label "backlog" --json number,title,createdAt,labels)
  # Dedupe by provenance field to avoid double-counting
fi

# Merge and display
```

### Anti-Patterns to Avoid
- **Blocking on GitHub failures:** GitHub operations should NEVER block local workflow. Always continue with local file operations.
- **Duplicate issue creation:** Always check provenance before creating — if local issue already has GitHub reference, skip creation.
- **Modifying phase issues:** The `backlog` label is for user issues. Phase issues (with `phase` label) are managed by `kata-add-milestone` and should not be touched by add-issue/check-issues skills.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| GitHub authentication | Custom OAuth flow | `gh auth status` | Handles token refresh, multiple accounts, enterprise |
| JSON parsing | bash string manipulation | `gh --jq` or `--json` flags | Robust parsing, handles escaping |
| Issue body formatting | echo + heredoc concatenation | `--body-file` flag | Handles special characters, newlines, markdown |
| Deduplication | Custom sync state file | Provenance field in frontmatter | Single source of truth in issue file |
| Label creation | Separate command | `gh label create --force` | Idempotent, creates if not exists |

**Key insight:** The `gh` CLI handles all edge cases (rate limiting, auth, pagination). Don't build abstractions over it — use it directly with its built-in flags.

## Common Pitfalls

### Pitfall 1: Authentication Scope Missing
**What goes wrong:** `gh issue create` fails with permission error
**Why it happens:** Some operations (e.g., adding to Projects) require `project` scope not in default auth
**How to avoid:** For basic issue CRUD, default auth is sufficient. If using Projects, run `gh auth refresh -s project`
**Warning signs:** "Resource not accessible by integration" errors

### Pitfall 2: Race Conditions in Checkbox Updates
**What goes wrong:** Concurrent wave executors overwrite each other's checkbox updates
**Why it happens:** Multiple Task() agents updating same issue body simultaneously
**How to avoid:** Issue updates happen at orchestrator level per-wave, not in individual executors (already implemented in execute-phase)
**Warning signs:** Checkbox states reverting or missing

### Pitfall 3: Duplicate Issues from Re-runs
**What goes wrong:** Running `/kata:add-issue` twice creates two GitHub Issues
**Why it happens:** No idempotency check before GitHub creation
**How to avoid:** Check local file's provenance field; if already has GitHub reference, skip creation
**Warning signs:** Multiple GitHub Issues with identical titles

### Pitfall 4: Stale Local Cache
**What goes wrong:** GitHub issue was updated/closed externally but local still shows it open
**Why it happens:** No sync from GitHub -> local
**How to avoid:** For PULL-02, pull fresh state from GitHub on check-issues; for ISS-02, treat GitHub as source of truth when enabled
**Warning signs:** State mismatch between local files and GitHub

### Pitfall 5: Special Characters in Issue Body
**What goes wrong:** Issue body with markdown code blocks or special chars gets mangled
**Why it happens:** Shell escaping issues in heredoc or `--body` flag
**How to avoid:** Always use `--body-file /tmp/issue-body.md` pattern (already used in execute-phase)
**Warning signs:** Backticks disappearing, code blocks not rendering

## Code Examples

Verified patterns from existing codebase:

### Create Issue with Label
```bash
# Source: skills/add-milestone/SKILL.md lines 890-896
gh issue create \
  --title "Phase ${PHASE_NUM}: ${PHASE_NAME}" \
  --body-file /tmp/phase-issue-body.md \
  --label "phase" \
  --milestone "v${VERSION}"
```

### Query Issues by Label
```bash
# Source: skills/execute-phase/SKILL.md lines 159-164
ISSUE_NUMBER=$(gh issue list \
  --label "phase" \
  --milestone "v${VERSION}" \
  --json number,title \
  --jq ".[] | select(.title | startswith(\"Phase ${PHASE}:\")) | .number" \
  2>/dev/null)
```

### Update Issue Body
```bash
# Source: skills/execute-phase/SKILL.md lines 171-189
ISSUE_BODY=$(gh issue view "$ISSUE_NUMBER" --json body --jq '.body' 2>/dev/null)

# Modify ISSUE_BODY...

printf '%s\n' "$ISSUE_BODY" > /tmp/issue-body.md
gh issue edit "$ISSUE_NUMBER" --body-file /tmp/issue-body.md 2>/dev/null \
  && echo "Updated issue #${ISSUE_NUMBER}" \
  || echo "Warning: Failed to update issue #${ISSUE_NUMBER}"
```

### Create Label Idempotently
```bash
# Source: skills/add-milestone/SKILL.md (derived from phase label creation)
gh label create "backlog" --description "Kata backlog items" --force 2>/dev/null
```

### Close Issue with Comment
```bash
# Source: skills/execute-phase/SKILL.md line 419
gh issue close "$ISSUE_NUMBER" --comment "Completed via Kata execution" 2>/dev/null
```

### List Issues with Full Details
```bash
# For pulling external issues into Kata
gh issue list \
  --label "backlog" \
  --state open \
  --json number,title,body,createdAt,labels,milestone \
  --jq '.[] | {number, title, body, created: .createdAt, labels: [.labels[].name]}'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| GitHub REST API v3 | gh CLI wrapper | gh CLI 2.0+ | Simpler auth, built-in pagination |
| Personal access tokens | `gh auth login` OAuth | gh CLI 1.0 | More secure, easier setup |
| GitHub Projects (classic) | GitHub Projects (new) | 2022 | New projects require `project` scope |

**Deprecated/outdated:**
- `hub` CLI: Superseded by official `gh` CLI
- REST API direct calls: Use `gh api` for low-level access if needed
- Classic Projects: Still work but new projects use different API

## Open Questions

Things that couldn't be fully resolved:

1. **Issue filtering UX for PULL-01**
   - What we know: `gh issue list` supports `--search`, `--label`, `--milestone`, `--assignee` filters
   - What's unclear: What filters should `/kata:check-issues` expose to users? All of them? Just labels?
   - Recommendation: Start with `--label` filter only (matches existing area filter pattern), expand based on user feedback

2. **Bidirectional sync granularity**
   - What we know: We can push to GitHub and pull from GitHub
   - What's unclear: How often to sync? On every command? On explicit refresh?
   - Recommendation: Push immediately on create; pull fresh on check-issues; no background sync

3. **Handling issues without local files (pure GitHub)**
   - What we know: PULL-01 pulls external GitHub Issues into Kata
   - What's unclear: Do we create local `.planning/issues/` files for pulled issues, or just display them?
   - Recommendation: Create local files with `provenance: github:owner/repo#N` — makes them workable in Kata offline

## Sources

### Primary (HIGH confidence)
- `gh issue --help` and subcommands — CLI documentation (local, 2026-01-21 version)
- `skills/execute-phase/SKILL.md` — Existing GitHub issue patterns (lines 148-192, 227-232, 419)
- `skills/add-milestone/SKILL.md` — Phase issue creation patterns (lines 860-896)
- `skills/execute-phase/references/github-integration.md` — Integration architecture documentation

### Secondary (MEDIUM confidence)
- `.planning/issues/open/2026-01-26-github-issues-as-todos.md` — Prior research/design thinking on this feature
- `.planning/REQUIREMENTS.md` — ISS-02, PULL-01, PULL-02 requirement definitions

### Tertiary (LOW confidence)
- None — all findings verified against CLI help or existing codebase patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — gh CLI already in use, patterns established
- Architecture: HIGH — extending existing patterns, not greenfield
- Pitfalls: HIGH — derived from existing code's error handling patterns

**Research date:** 2026-02-01
**Valid until:** 2026-03-01 (gh CLI stable, patterns established in codebase)
