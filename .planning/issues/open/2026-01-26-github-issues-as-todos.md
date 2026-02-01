---
created: 2026-01-26
area: github-integration
priority: high
---

# Replace Local Todos with GitHub Issues

## Problem

Currently Kata maintains todos as local markdown files in `.planning/todos/`. For projects with GitHub integration enabled, this creates dual sources of truth — local files AND GitHub issues.

## Solution

For projects with `github.enabled=true`:

1. **Remove local todo storage entirely** — No `.planning/todos/` directory
2. **Create todos as GitHub Issues** — With `backlog` label
3. **GitHub becomes single source of truth** — For todos, backlog items, and any tracked work

## Affected Skills

| Skill | Change |
|-------|--------|
| `kata-adding-todos` | Create GitHub issue instead of local file when `github.enabled` |
| `kata-checking-todos` | Query `gh issue list --label backlog` instead of reading local files |
| `kata-completing-todos` | Close GitHub issue instead of moving local file |

## Implementation Notes

### Label Convention

| Item Type | GitHub Label |
|-----------|--------------|
| Todo/Backlog | `backlog` |
| Phase | `phase` |
| Bug (future) | `bug` |

### Config Extension

```json
{
  "github": {
    "enabled": true,
    "issueMode": "auto",
    "todosAsIssues": true  // or just implicit when enabled=true
  }
}
```

### Migration Path

For existing projects enabling GitHub:
- Option A: One-time migration of local todos to issues
- Option B: Keep existing local todos, new ones go to GitHub

## Benefits

1. **Single source of truth** — No sync issues between local and remote
2. **Visibility** — Team members see backlog in GitHub without Kata
3. **Native GitHub features** — Assignees, comments, linking, search
4. **Simpler codebase** — No local file management for GitHub projects

## Considerations

- Projects without GitHub still need local todo storage (fallback)
- `gh` CLI must be authenticated
- Rate limits for heavy todo usage

## Context

Identified during Phase 3 UAT discussion (2026-01-26). Natural extension of GitHub integration — if phases are issues, todos should be too.
