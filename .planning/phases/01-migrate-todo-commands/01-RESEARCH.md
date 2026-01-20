# Phase 1: Migrate Todo Commands to Kata Skill - Research

**Researched:** 2026-01-20
**Domain:** Kata skill architecture, todo management
**Confidence:** HIGH

## Summary

This phase migrates the `add-todo` and `check-todos` commands to a unified `kata-todo-management` skill. Research confirms the established skill pattern from Phase 0: skills as orchestrators with SKILL.md (<500 lines) plus references/ subdirectory for progressive disclosure.

The todo system is simple file-based storage (YAML frontmatter + markdown body) with two operations: ADD (capture ideas) and CHECK (review and act). Key enhancements identified: area inference from file context, duplicate detection via title/file similarity, and type field per pending todo request.

**Primary recommendation:** Follow kata-manageing-milestones pattern - unified skill with multiple operations, operation detection from user intent, action routing with clear next steps.

## Standard Stack

### Core
| Component          | Version | Purpose                                           | Why Standard                            |
| ------------------ | ------- | ------------------------------------------------- | --------------------------------------- |
| YAML frontmatter   | N/A     | Todo metadata (created, title, area, files, type) | Established pattern in .planning/todos/ |
| Markdown body      | N/A     | Problem/solution description                      | Human-readable, flexible                |
| File-based storage | N/A     | .planning/todos/{pending,done}/                   | Simple, git-tracked, no dependencies    |

### Supporting
| Component        | Purpose                              | When to Use                               |
| ---------------- | ------------------------------------ | ----------------------------------------- |
| AskUserQuestion  | Multi-select for check-todos actions | When user reviews todo and chooses action |
| STATE.md updates | Track pending count                  | After add/complete operations             |
| Git commits      | Track todo lifecycle                 | On add, move to done                      |

### Alternatives Considered
| Instead of       | Could Use         | Tradeoff                                         |
| ---------------- | ----------------- | ------------------------------------------------ |
| File-based       | SQLite/JSON       | Overkill for simple capture, loses git tracking  |
| Individual files | Single todos.json | Loses markdown body flexibility, merge conflicts |

## Architecture Patterns

### Recommended Skill Structure
```
skills/kata-todo-management/
├── SKILL.md              # Orchestrator (<500 lines)
└── references/
    ├── todo-format.md    # Frontmatter schema, filename conventions
    └── actions.md        # check-todos action workflows
```

### Pattern 1: Unified Skill with Operation Detection

**What:** Single skill handles both ADD and CHECK operations
**When to use:** When operations share domain context (todos)
**Example from kata-manageing-milestones:**

```markdown
## Operation Detection

Parse user request to identify operation type:

| Trigger Keywords                                             | Operation |
| ------------------------------------------------------------ | --------- |
| "add todo", "capture idea", "note for later", "remember to"  | ADD       |
| "check todos", "pending todos", "review todos", "what todos" | CHECK     |
```

### Pattern 2: File-Based Todo Storage

**What:** Each todo is a separate markdown file with YAML frontmatter
**When to use:** For all todo operations
**Example:**

```
.planning/todos/
├── pending/
│   └── 2026-01-18-descriptive-slug.md
└── done/
    └── 2026-01-18-completed-task.md
```

### Pattern 3: Action Options via AskUserQuestion

**What:** Present todo with actionable choices using multiSelect
**When to use:** When reviewing todos in CHECK operation
**Example:**

```
AskUserQuestion(
  question="What would you like to do with '[Todo Title]'?",
  options=[
    "work on now",
    "add to current phase",
    "create new phase",
    "brainstorm ideas",
    "put back (review later)"
  ]
)
```

### Anti-Patterns to Avoid
- **Separate skills for add/check:** Violates unified skill principle, fragments user experience
- **Complex database storage:** Over-engineered for simple capture/review workflow
- **Manual STATE.md management:** Should auto-update count on add/complete

## Don't Hand-Roll

| Problem         | Don't Build              | Use Instead                                                       | Why                       |
| --------------- | ------------------------ | ----------------------------------------------------------------- | ------------------------- |
| Date formatting | Manual date construction | `date +%Y-%m-%d`                                                  | Consistent, locale-aware  |
| Slug generation | Complex sanitization     | `tr '[:upper:]' '[:lower:]' \| tr ' ' '-' \| tr -cd '[:alnum:]-'` | Standard Unix tools       |
| YAML parsing    | Custom parser            | Existing frontmatter pattern                                      | Already works in codebase |

**Key insight:** Todo management is intentionally simple. Resist complexity creep.

## Common Pitfalls

### Pitfall 1: Overcomplicating Area Inference
**What goes wrong:** Building ML-style classifiers for area detection
**Why it happens:** Desire for accuracy
**How to avoid:** Simple heuristic: check file paths for known areas (planning, tooling, ui, etc.)
**Warning signs:** Area inference taking more than 10 lines of logic

### Pitfall 2: Breaking Duplicate Detection
**What goes wrong:** Overly strict matching (exact title) or overly loose (any word match)
**Why it happens:** Unclear definition of "duplicate"
**How to avoid:** Two-tier: exact title match = definite duplicate, 80%+ word overlap OR same files = suggest review
**Warning signs:** False positives blocking legitimate todos, or duplicates piling up

### Pitfall 3: Complex State Management
**What goes wrong:** Tracking todo state beyond file location
**Why it happens:** Anticipating features that aren't needed
**How to avoid:** File location IS state: pending/ = pending, done/ = done
**Warning signs:** Adding status field to frontmatter, creating state machines

### Pitfall 4: Over-Engineering CHECK Actions
**What goes wrong:** Each action becomes a full workflow with sub-agents
**Why it happens:** Following planning/execution patterns where sub-agents are needed
**How to avoid:** Actions are lightweight routing:
- "work on now" → just show the todo content, user takes over
- "add to phase" → update ROADMAP.md with todo as task
- "create phase" → invoke kata-managing-project-roadmap
- "brainstorm" → continue conversation about todo
- "put back" → do nothing, stay in pending
**Warning signs:** Spawning Task() for simple file operations

## Code Examples

### Todo Frontmatter Schema
```yaml
---
created: 2026-01-18T17:28    # ISO timestamp
title: Short descriptive title # 5-10 words
area: planning                  # planning | execution | tooling | ui | docs | other
type: feature                   # feature | bug | improvement | refactor | docs | chore (NEW)
files:                          # Optional: related file paths
  - path/to/file.ts
  - path/to/other.ts
---
```

### Filename Convention
```bash
# Pattern: {date}-{slug}.md
# Example: 2026-01-18-add-authentication-to-api.md

DATE=$(date +%Y-%m-%d)
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-' | head -c 50)
FILENAME="${DATE}-${SLUG}.md"
```

### Area Inference Heuristic
```bash
# Infer area from file paths mentioned
infer_area() {
  local files="$1"
  case "$files" in
    *planning*|*roadmap*|*requirements*) echo "planning" ;;
    *skills*|*commands*|*workflows*) echo "tooling" ;;
    *components*|*pages*|*ui*|*app*) echo "ui" ;;
    *test*|*spec*) echo "testing" ;;
    *readme*|*docs*|*md) echo "docs" ;;
    *) echo "other" ;;
  esac
}
```

### Duplicate Detection Heuristic
```bash
# Check for existing todos with similar title or same files
find_duplicates() {
  local title="$1"
  local files="$2"

  # Normalize title for comparison
  local normalized=$(echo "$title" | tr '[:upper:]' '[:lower:]')

  # Check pending todos
  for todo in .planning/todos/pending/*.md; do
    # Extract existing title
    existing_title=$(grep "^title:" "$todo" | sed 's/title: //' | tr '[:upper:]' '[:lower:]')

    # Exact match = definite duplicate
    if [[ "$normalized" == "$existing_title" ]]; then
      echo "DUPLICATE: $todo"
      return 0
    fi

    # If files provided, check file overlap
    if [[ -n "$files" ]]; then
      existing_files=$(grep -A10 "^files:" "$todo" | grep "^  -" | sed 's/  - //')
      # Any file overlap = potential duplicate
      for f in $files; do
        if echo "$existing_files" | grep -q "$f"; then
          echo "SIMILAR: $todo (shared file: $f)"
        fi
      done
    fi
  done
}
```

### STATE.md Update Pattern
```bash
# Count pending todos and update STATE.md
update_state_todos() {
  local count=$(ls .planning/todos/pending/*.md 2>/dev/null | wc -l | tr -d ' ')

  # Read STATE.md, update Pending Todos section
  # Pattern: replace count in "N pending todos" line
  # Or list individual todos if count <= 5
}
```

## Areas for Todo Classification

Based on existing todos in the codebase:

| Area      | Description                               | Example Keywords                        |
| --------- | ----------------------------------------- | --------------------------------------- |
| planning  | Roadmap, requirements, workflow design    | planning/, ROADMAP, phase, milestone    |
| execution | Plan execution, task handling             | execute, run, action                    |
| tooling   | Commands, skills, installer, integrations | commands/, skills/, workflows/, agents/ |
| ui        | Visual components, user interface         | components/, pages/, ui/, style         |
| testing   | Test infrastructure, verification         | test/, spec/, *.test.*                  |
| docs      | Documentation, README, onboarding         | *.md, readme, docs/                     |
| other     | Anything not fitting above                | (default)                               |

## Check-Todos Actions Specification

### Action 1: Work On Now
**Behavior:** Display todo content, clear skill invocation, user takes over
**Output:**
```
## Working on: [Title]

[Todo body content]

---
Files involved:
- [file1]
- [file2]

When done, run `/kata-todo-management` to mark complete or check other todos.
```

### Action 2: Add to Current Phase
**Behavior:** Parse todo into task, add to current phase PLAN.md or ROADMAP.md
**Prerequisites:** Current phase must exist
**Output:**
```
Added "[Title]" to Phase [X] backlog.
Todo moved to done/.

Next: /kata-planning-phases to incorporate into plans
```

### Action 3: Create New Phase
**Behavior:** Route to kata-managing-project-roadmap to add phase
**Output:**
```
Creating phase from todo...
[Invoke kata-managing-project-roadmap add-phase operation]
Todo moved to done/ after phase created.
```

### Action 4: Brainstorm
**Behavior:** Continue conversation about the todo
**Output:**
```
Let's discuss: [Title]

[Todo body]

What aspects would you like to explore?
```
(Skill completes, normal conversation continues)

### Action 5: Put Back
**Behavior:** Do nothing, return to check-todos list or exit
**Output:**
```
"[Title]" kept in pending.

[Show next todo or exit message]
```

## Natural Language Triggers

### ADD Operation
| Trigger Phrase   | Confidence |
| ---------------- | ---------- |
| "add todo"       | HIGH       |
| "capture idea"   | HIGH       |
| "note for later" | HIGH       |
| "remember to"    | MEDIUM     |
| "todo:" (prefix) | HIGH       |
| "I should"       | LOW        |
| "we need to"     | LOW        |
| "don't forget"   | MEDIUM     |

### CHECK Operation
| Trigger Phrase       | Confidence |
| -------------------- | ---------- |
| "check todos"        | HIGH       |
| "pending todos"      | HIGH       |
| "review todos"       | HIGH       |
| "what todos"         | HIGH       |
| "list todos"         | HIGH       |
| "show todos"         | HIGH       |
| "todos" (standalone) | MEDIUM     |

## State of the Art

| Old Approach                     | Current Approach                     | When Changed | Impact                                         |
| -------------------------------- | ------------------------------------ | ------------ | ---------------------------------------------- |
| Commands (add-todo, check-todos) | Unified skill (kata-todo-management) | Phase 1      | Natural language triggers, operation detection |
| No type field                    | type field in frontmatter            | Phase 1      | Better triage, filtering                       |
| Basic area field                 | Area inference heuristic             | Phase 1      | Less manual classification                     |

**Deprecated/outdated:**
- /kata:add-todo command - replaced by skill (keep for A/B testing per Phase 0 decision)
- /kata:check-todos command - replaced by skill (keep for A/B testing per Phase 0 decision)

## Pending Enhancement: Type Field

Per todo `2026-01-19-add-type-label-to-todo-frontmatter.md`:

**Type values:**
- `feature` - New functionality
- `bug` - Something broken
- `improvement` - Enhancement to existing
- `refactor` - Code cleanup, no behavior change
- `docs` - Documentation only
- `chore` - Configuration, dependencies

**Type inference heuristic:**
```bash
infer_type() {
  local title="$1"
  local body="$2"

  case "$title $body" in
    *bug*|*fix*|*broken*|*error*) echo "bug" ;;
    *refactor*|*cleanup*|*simplify*) echo "refactor" ;;
    *doc*|*readme*|*document*) echo "docs" ;;
    *config*|*setup*|*install*) echo "chore" ;;
    *improve*|*enhance*|*better*) echo "improvement" ;;
    *) echo "feature" ;;  # default
  esac
}
```

## Open Questions

1. **Mark complete flow**
   - What we know: Todos move from pending/ to done/
   - What's unclear: Should there be explicit "mark complete" action, or just on "work on now" completion?
   - Recommendation: Add "mark complete" to check-todos actions for todos worked on outside Kata

2. **Bulk operations**
   - What we know: Current design is one-at-a-time review
   - What's unclear: Will users want "mark all as done" or "delete old todos"?
   - Recommendation: Start simple (one-at-a-time), add bulk ops if pain point emerges

## Sources

### Primary (HIGH confidence)
- Existing todos in `.planning/todos/pending/` - analyzed 10 examples
- kata-manageing-milestones SKILL.md - unified skill pattern
- kata-providing-progress-and-status-updates SKILL.md - operation detection pattern
- STATE.md template in kata/templates/state.md - Pending Todos section specification

### Secondary (MEDIUM confidence)
- Phase 0 research (00-RESEARCH.md) - skill sizing recommendations
- KATA-STYLE.md - skill architecture conventions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - simple file-based pattern already established
- Architecture: HIGH - follows existing unified skill patterns
- Pitfalls: HIGH - based on codebase analysis and anti-pattern observation
- Actions specification: MEDIUM - needs validation during implementation

**Research date:** 2026-01-20
**Valid until:** 2026-02-20 (stable domain, 30-day validity)
