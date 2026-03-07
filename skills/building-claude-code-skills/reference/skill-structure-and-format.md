# Skill Structure and Format Reference

## Directory Structure

Every skill requires a directory with a `SKILL.md` file:

```
skill-name/
├── SKILL.md (required)
├── reference/ (optional - for detailed documentation)
│   ├── methodology.md
│   └── examples.md
├── scripts/ (optional)
│   └── process-data.sh/.js/.py (choose based on task)
└── templates/ (optional)
    └── output-template.txt
```

## File Naming Conventions

**Use intention-revealing names for all supporting files:**

**Good Examples:**
- `./reference/converting-sub-agents.md`
- `./reference/aws-deployment-patterns.md`
- `./reference/github-workflow-examples.md`
- `./scripts/analyze-complexity.js`
- `./templates/report-template.md`

**Bad Examples (avoid generic names):**
- `./reference.md`
- `./helpers.md`
- `./utils.md`
- `./misc.md`

**Reference files with relative paths:**
- Use `./filename.md` in SKILL.md
- Use lowercase filenames with hyphens
- Group related files in subdirectories (reference/, scripts/, templates/)

## SKILL.md Format

```yaml
---
name: skill-name
description: Clear description of what this skill does and when to use it (max 1024 chars)
---

# Main Instructions

Clear, detailed instructions for Claude to follow when this skill is invoked.

## Step-by-Step Guidance

1. First step
2. Second step
3. Third step

## Examples

Concrete examples showing how to use this skill.

## Reference Documentation

- See `./reference/detailed-methodology.md` for [what it contains]
- See `./reference/advanced-patterns.md` for [what it contains]
- See `./templates/` for [what templates are available]
```

## YAML Frontmatter Requirements

**Required fields:**
- `name`: Skill identifier (see metadata requirements)
- `description`: When to invoke this skill (see metadata requirements)

**NO other fields allowed:**
- Do NOT include `allowed-tools` field (skills inherit all Claude Code capabilities)
- Do NOT include `model` field (not applicable to skills)
- Do NOT include `tools` field (legacy sub-agent field)

**YAML syntax rules:**
- Use spaces, not tabs
- Name and description must be valid YAML strings
- Use quotes if description contains special characters
- Ensure proper indentation

## Skill Locations

**Personal Skills:**
- Location: `~/.claude/skills/`
- Scope: Available across all Claude Code projects
- Use for: General-purpose skills, cross-project utilities

**Project Skills:**
- Location: `.claude/skills/`
- Scope: Project-specific, shared with team
- Use for: Project-specific workflows, team conventions

## Progressive Disclosure Pattern

**Keep SKILL.md lean (<500 lines target):**

```markdown
# Main Skill Instructions

[Core workflow and essential guidance only]

## Step 1: Initial Analysis
[Brief overview - 3-5 bullets]

## Step 2: Processing
See `./reference/processing-methodology.md` for detailed approach.

## Step 3: Validation
See `./reference/validation-checklist.md` for complete checklist.
```

**Move details to reference files:**
- Detailed methodologies → `./reference/methodology.md`
- Extensive examples → `./reference/examples.md`
- Long checklists → `./reference/checklist.md`
- Background information → `./reference/background.md`

**Benefits:**
- Lower initial context cost
- Easier to maintain
- Clearer separation of concerns
- On-demand detail loading

## Multi-File Organization Example

```
analyzing-data/
├── SKILL.md                           # Core workflow (~150 lines)
├── reference/
│   ├── data-processing-patterns.md    # Detailed examples
│   ├── sql-optimization-guide.md      # Query best practices
│   └── statistical-methods.md         # Background theory
├── templates/
│   ├── analysis-report.md
│   └── query-template.sql
└── scripts/
    ├── aggregate-json.js              # Node.js for JSON tasks
    └── analyze-data.py                # Python for data science
```

This structure keeps SKILL.md focused while making detailed information available when needed.

## Table of Contents for Long Reference Files

When reference files exceed 200 lines, include a table of contents:

```markdown
# Detailed Methodology Reference

## Table of Contents
- [Overview](#overview)
- [Step-by-Step Process](#step-by-step-process)
- [Advanced Patterns](#advanced-patterns)
- [Troubleshooting](#troubleshooting)

## Overview
[Content...]
```

## File Organization Best Practices

1. **One topic per reference file** - Don't create catch-all files
2. **Use lowercase filenames** - e.g., `nodejs-patterns.md`, not `NodeJS-Patterns.md`
3. **Group by type** - reference/, scripts/, templates/
4. **Intention-revealing names** - Name describes the content clearly
5. **Cross-reference sparingly** - Reference files should be self-contained when possible
