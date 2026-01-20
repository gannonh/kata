# Todo Format Reference

This reference defines the YAML frontmatter schema, filename conventions, and classification values for Kata todos.

## Frontmatter Schema

```yaml
---
created: 2026-01-18T17:28    # ISO timestamp (required)
title: Short descriptive title # 5-10 words (required)
area: planning                  # Classification by domain (required)
type: feature                   # Classification by nature (required)
files:                          # Related file paths (optional)
  - path/to/file.ts
  - path/to/other.ts
---
```

### Required Fields

| Field   | Type      | Description                           |
| ------- | --------- | ------------------------------------- |
| created | timestamp | ISO format: YYYY-MM-DDTHH:MM          |
| title   | string    | Concise description, 5-10 words       |
| area    | enum      | Domain classification (see below)     |
| type    | enum      | Nature classification (see below)     |

### Optional Fields

| Field | Type        | Description                              |
| ----- | ----------- | ---------------------------------------- |
| files | string list | Related file paths for context/tracking  |

## Filename Convention

**Pattern:** `{YYYY-MM-DD}-{slug}.md`

**Slug rules:**
- Lowercase letters and numbers only
- Spaces converted to hyphens
- Max 50 characters
- Remove special characters

**Examples:**
- `2026-01-18-add-authentication-to-api.md`
- `2026-01-19-fix-broken-validation-logic.md`
- `2026-01-20-refactor-state-management.md`

**Generation:**
```bash
DATE=$(date +%Y-%m-%d)
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-' | cut -c1-50)
FILENAME="${DATE}-${SLUG}.md"
```

## Area Values

Area indicates which part of the codebase or workflow the todo relates to.

| Area      | Description                               | Inferred From                           |
| --------- | ----------------------------------------- | --------------------------------------- |
| planning  | Roadmap, requirements, workflow design    | planning/, ROADMAP, phase, milestone    |
| execution | Plan execution, task handling             | execute, run, action                    |
| tooling   | Commands, skills, installer, integrations | commands/, skills/, workflows/, agents/ |
| ui        | Visual components, user interface         | components/, pages/, ui/, style, app/   |
| testing   | Test infrastructure, verification         | test/, spec/, *.test.*                  |
| docs      | Documentation, README, onboarding         | *.md, readme, docs/                     |
| other     | Anything not fitting above                | (default)                               |

### Area Inference Logic

When inferring area from context:

1. Check file paths mentioned in conversation
2. Check keywords in title and description
3. Default to "other" if no match

```
if paths contain "planning" or keywords "ROADMAP", "phase", "milestone":
  area = "planning"
elif paths contain "commands", "skills", "workflows", "agents":
  area = "tooling"
elif paths contain "components", "pages", "ui" or keywords "style", "app":
  area = "ui"
elif paths contain "test", "spec" or file pattern "*.test.*":
  area = "testing"
elif paths contain "docs" or file extension ".md" or keywords "readme", "documentation":
  area = "docs"
else:
  area = "other"
```

## Type Values

Type indicates the nature of the work.

| Type        | Description                         | Inferred From Keywords         |
| ----------- | ----------------------------------- | ------------------------------ |
| feature     | New functionality                   | (default)                      |
| bug         | Something broken that needs fixing  | bug, fix, broken, error        |
| improvement | Enhancement to existing feature     | improve, enhance, better       |
| refactor    | Code cleanup, no behavior change    | refactor, cleanup, simplify    |
| docs        | Documentation only                  | doc, readme, document          |
| chore       | Configuration, dependencies, tooling| config, setup, install         |

### Type Inference Logic

When inferring type from title and body:

```
if keywords "bug", "fix", "broken", "error" present:
  type = "bug"
elif keywords "refactor", "cleanup", "simplify" present:
  type = "refactor"
elif keywords "doc", "readme", "document" present:
  type = "docs"
elif keywords "config", "setup", "install" present:
  type = "chore"
elif keywords "improve", "enhance", "better" present:
  type = "improvement"
else:
  type = "feature"
```

## Body Structure

The todo body follows a Problem/Solution format:

```markdown
## Problem

[Description of what needs to be addressed]

## Solution

[Proposed approach or "TBD" if not yet known]
```

### Body Guidelines

- **Problem section:** Explain the issue, pain point, or gap
- **Solution section:** Outline approach if known, otherwise "TBD"
- Keep body concise - this is for capture, not detailed specification

## Storage Locations

Todos are stored in `.planning/todos/` with subdirectories indicating state:

```
.planning/todos/
├── pending/     # Active todos awaiting action
│   └── 2026-01-18-example-todo.md
└── done/        # Completed todos (for reference)
    └── 2026-01-15-completed-task.md
```

**Key principle:** File location IS state. No status field needed in frontmatter.

- **Pending:** `.planning/todos/pending/`
- **Done:** `.planning/todos/done/`

Moving a file between directories changes its state.

## Examples

### Feature Todo

```yaml
---
created: 2026-01-18T14:30
title: Add dark mode support to UI
area: ui
type: feature
files:
  - src/components/ThemeProvider.tsx
  - src/styles/theme.ts
---

## Problem

Users have requested dark mode for reduced eye strain during night usage.
Currently only light theme is available.

## Solution

1. Add theme context provider
2. Create dark color palette
3. Add toggle in settings menu
4. Persist preference in localStorage
```

### Bug Todo

```yaml
---
created: 2026-01-19T09:15
title: Fix login validation not catching empty passwords
area: tooling
type: bug
files:
  - src/auth/validate.ts
---

## Problem

The login form accepts empty password strings without validation error.
This causes a cryptic backend error instead of helpful user feedback.

## Solution

Add empty string check before API call:
```typescript
if (!password || password.trim() === '') {
  return { error: 'Password is required' }
}
```
```

### Improvement Todo

```yaml
---
created: 2026-01-20T16:45
title: Improve error messages in CLI output
area: tooling
type: improvement
files:
  - bin/cli.ts
---

## Problem

Current error messages are too technical and don't guide users toward solutions.
Example: "ENOENT: no such file" instead of "File not found: [path]. Did you mean to run /kata:new-project first?"

## Solution

TBD - Need to audit existing error messages and identify improvement opportunities.
```

## Duplicate Detection

Before creating a new todo, check for duplicates:

**Exact title match:** Block creation with warning
**File overlap:** Warn but allow creation

```bash
# Check for existing todos
for todo in .planning/todos/pending/*.md; do
  existing_title=$(grep "^title:" "$todo" | sed 's/title: //')
  # Compare normalized (lowercase) titles
done
```
