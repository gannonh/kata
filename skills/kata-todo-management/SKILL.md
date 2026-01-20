---
name: kata-todo-management
description: Use this skill to capture todos, review pending todos, or manage todo lifecycle. Triggers include "add todo", "capture idea", "note for later", "remember to", "todo:", "check todos", "pending todos", "review todos", "list todos", "show todos".
---

# Todo Management Orchestrator

Handles todo capture (ADD) and review (CHECK) operations for the Kata planning system.

## When to Use

- User says "add todo", "capture idea", "note for later", "remember to"
- User starts a message with "todo:" prefix
- User asks to "check todos", "review todos", "list todos", "show todos"
- User mentions "pending todos" or "what todos do I have"

## Workflow Overview

```
1. Determine operation (ADD or CHECK)
2. Execute appropriate workflow
3. Update STATE.md counts
4. Present confirmation with next steps
```

## Execution Flow

### Step 1: Determine Operation

Parse user request to identify operation type:

| Trigger Keywords                                            | Operation |
| ----------------------------------------------------------- | --------- |
| "add todo", "capture idea", "note for later", "remember to" | ADD       |
| "todo:" prefix                                              | ADD       |
| "check todos", "pending todos", "review todos"              | CHECK     |
| "list todos", "show todos", "what todos"                    | CHECK     |

### Step 2: Validate Environment

Check for Kata project structure:

```bash
ls .planning/todos/pending/ 2>/dev/null
```

If not found, create the directory structure:

```bash
mkdir -p .planning/todos/pending
mkdir -p .planning/todos/done
```

### Step 3: Route to Workflow

Based on operation type, execute the appropriate workflow below.

---

## ADD Operation Workflow

Captures a todo from user's request and creates the todo file.

### Step ADD-1: Extract Todo Content

Parse user's message to extract:
- **Title:** First sentence or explicit title (5-10 words)
- **Body:** Additional description, context, or requirements

If the user's intent is unclear, ask:
```
What would you like to capture as a todo?
```

### Step ADD-2: Infer Area

Determine area from file paths mentioned or conversation context.

| Area      | Inferred From                               |
| --------- | ------------------------------------------- |
| planning  | planning/, ROADMAP, phase, milestone        |
| execution | execute, run, action                        |
| tooling   | commands/, skills/, workflows/, agents/     |
| ui        | components/, pages/, ui/, style, app/       |
| testing   | test/, spec/, *.test.*                      |
| docs      | *.md, readme, docs/                         |
| other     | (default if no match)                       |

### Step ADD-3: Infer Type

Determine type from keywords in title and body.

| Type        | Keywords                               |
| ----------- | -------------------------------------- |
| bug         | bug, fix, broken, error                |
| refactor    | refactor, cleanup, simplify            |
| docs        | doc, readme, document                  |
| chore       | config, setup, install                 |
| improvement | improve, enhance, better               |
| feature     | (default)                              |

### Step ADD-4: Check for Duplicates

Scan `.planning/todos/pending/` for potential duplicates:

```bash
ls .planning/todos/pending/*.md 2>/dev/null
```

For each existing todo, extract the title from frontmatter.

**Duplicate detection rules:**
- **Exact title match:** Block creation, warn user
- **File overlap:** Warn but allow (user decides)

If duplicate found:
```
A similar todo already exists:
- [existing-todo-filename.md]: "[existing title]"

Options:
1. Proceed anyway (creates new todo)
2. View existing todo
3. Cancel
```

### Step ADD-5: Generate Filename

Create filename using date and slug:

```bash
DATE=$(date +%Y-%m-%d)
# Slug: lowercase, hyphens, alphanumeric only, max 50 chars
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-' | cut -c1-50)
FILENAME="${DATE}-${SLUG}.md"
```

### Step ADD-6: Write Todo File

Create the todo file at `.planning/todos/pending/{filename}`:

```yaml
---
created: {ISO timestamp}
title: {extracted title}
area: {inferred area}
type: {inferred type}
files:
  - {related file 1}
  - {related file 2}
---

## Problem

{Description of what needs to be addressed}

## Solution

{Proposed approach or "TBD" if not yet known}
```

See `./references/todo-format.md` for complete schema details.

### Step ADD-7: Update STATE.md

Update the pending todos count in STATE.md:

1. Count files in `.planning/todos/pending/`
2. Update the "Pending Todos" section count
3. If count <= 10, list individual todo paths

```bash
COUNT=$(ls .planning/todos/pending/*.md 2>/dev/null | wc -l | tr -d ' ')
```

### Step ADD-8: Confirm and Present Next Steps

```
KATA > TODO CAPTURED

**{title}**
- Area: {area}
- Type: {type}
- File: .planning/todos/pending/{filename}

---

Pending todos: {count}

To review todos: "check todos" or `/kata-todo-management`
```

---

## CHECK Operation Workflow

**See Plan 01-02 for CHECK operation implementation.**

This plan (01-01) focuses on ADD operation. CHECK operation will be added in the next plan.

### Placeholder Response

When CHECK operation is triggered:

```
CHECK operation coming in Plan 01-02.

For now, you can view pending todos manually:
  ls .planning/todos/pending/

Current pending count: {count}
```

---

## Key References

- **Todo format specification:** See `./references/todo-format.md`
- **Area and type values:** See `./references/todo-format.md`

## Quality Standards

Todos must satisfy:

- [ ] Frontmatter includes created, title, area, type fields
- [ ] Filename follows {date}-{slug}.md convention
- [ ] Duplicate check performed before creation
- [ ] STATE.md updated after add
- [ ] Clear confirmation with todo location
