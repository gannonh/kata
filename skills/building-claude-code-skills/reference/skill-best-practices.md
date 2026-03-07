# Skill Best Practices Reference

## Core Philosophy

**Create skills that provide just enough guidance for Claude to perform tasks effectively.**

Key principles:
1. Challenge every piece of information: "Does Claude really need this?"
2. Use progressive disclosure (fat reference files, skinny SKILL.md)
3. Be concise and actionable
4. Provide specific, complete examples
5. Leverage CLI tools and choose the right scripting language for the task

## Structural Best Practices

### Keep SKILL.md Concise

**Target:** Under 500 lines, ideally ~150-200 lines

**How:**
- Only essential workflow in SKILL.md
- Move details to reference files
- Use skinny pointers to reference files
- Challenge every explanation

**Good (concise with pointer):**
```markdown
## CSV Processing

Process CSV files using xsv CLI tool.

**Quick example:**
```bash
xsv select id,name data.csv > output.csv
```

See `./reference/csv-processing-details.md` for comprehensive methodology and 15+ examples.
```

**Bad (too verbose):**
```markdown
## CSV Processing

CSV stands for comma-separated values. It's a text format where each line represents a row and columns are separated by commas. The xsv tool is a fast CSV command-line toolkit written in Rust...

[50+ more lines of explanation]
```

### Use Progressive Disclosure Pattern

**Preferred Pattern: "High-level guide with references" using lowercase filenames**

**Structure:**
```
skill-name/
├── SKILL.md                    # Core workflow only (~150 lines)
├── reference/                  # Detailed documentation (lowercase names)
│   ├── methodology.md          # NOT Methodology.md
│   ├── advanced-patterns.md    # NOT Advanced-Patterns.md
│   └── troubleshooting.md      # NOT Troubleshooting.md
├── scripts/                    # Helper scripts
│   └── process-data.sh/.js/.py # Choose language based on task
└── templates/                  # Output templates
    └── report-template.md
```

**SKILL.md Pattern:**
```markdown
# Skill Overview
[2-3 sentence overview]

# Core Workflow
[High-level steps only]

## Step 1: Preparation
[Essential actions - 3-5 bullets]

## Step 2: Processing
See `./reference/processing-methodology.md` for detailed approach.
[Quick example only]

## Step 3: Validation
See `./reference/validation-checklist.md` for complete checklist.

# Quick Reference
[Most common commands/patterns only]

# Supporting Documentation
- `./reference/methodology.md` - Detailed processing approach
- `./reference/advanced-patterns.md` - Complex use cases
- `./templates/` - Output templates
```

**Fat Reference Files:**
- Comprehensive detail (200-500+ lines acceptable)
- Complete examples
- Background theory
- Extensive checklists
- Troubleshooting guides
- API references

**Skinny SKILL.md Pointers:**
```markdown
See `./reference/filename.md` for [brief description of what's there].
```

### File Naming Conventions

**Lowercase with hyphens:**
- ✅ `./reference/csv-processing-patterns.md`
- ✅ `./reference/api-authentication-guide.md`
- ✅ `./scripts/transform-data.js`
- ❌ `./reference/CSV-Processing-Patterns.md`
- ❌ `./reference/API_Authentication_Guide.md`
- ❌ `./scripts/TransformData.js`

**Intention-revealing names:**
- ✅ `./reference/aws-lambda-deployment-patterns.md`
- ✅ `./reference/github-workflow-examples.md`
- ❌ `./reference/reference.md`
- ❌ `./reference/helpers.md`
- ❌ `./reference/misc.md`

## Content Best Practices

### Be Concise

**Only include context Claude doesn't already know.**

**Remove:**
- Obvious explanations ("Claude Code is a CLI tool...")
- Self-referential statements ("You are an expert...")
- Background Claude has in training data
- Verbose introductions

**Keep:**
- Specific workflows unique to this skill
- Domain-specific knowledge
- Exact commands and syntax
- Project-specific patterns

**Before (verbose):**
```markdown
You are an expert data scientist with deep knowledge of statistical analysis. Data science is an interdisciplinary field that uses scientific methods, processes, algorithms and systems to extract knowledge and insights from structured and unstructured data...
```

**After (concise):**
```markdown
## Data Analysis Workflow

1. Validate data structure with `head` and `file` commands
2. Process with `xsv` (CSV) or `jq` (JSON)
3. Verify output with test commands
```

### Be Actionable

**Start with verbs, provide exact commands.**

**Good (actionable):**
```markdown
## Validation Steps

1. Check file format:
   ```bash
   file data.csv
   ```

2. Inspect first 10 rows:
   ```bash
   head -n 10 data.csv
   ```

3. Count total rows:
   ```bash
   wc -l data.csv
   ```
```

**Bad (vague):**
```markdown
## Validation

You should validate the data to make sure it's correct.
```

### Be Specific

**Provide complete, runnable examples.**

**Good (specific):**
```bash
# Create PR with body from heredoc
gh pr create --title "Add auth feature" --body "$(cat <<'EOF'
## Summary
- Implemented JWT authentication
- Added login/logout endpoints

## Testing
- [x] Unit tests pass
- [x] Integration tests pass
EOF
)"
```

**Bad (incomplete):**
```bash
# Create PR
gh pr create [with appropriate flags]
```

### Include Concrete Examples

**Real-world examples are invaluable.**

**Pattern:**
```markdown
## Example: Processing User Data

**Scenario:** Filter active users from CSV and export to JSON

**Commands:**
```bash
# Filter active users
xsv select id,name,status data.csv | xsv search -s status "active" > active.csv

# Convert to JSON with Node.js
node convert-to-json.js active.csv > users.json
```

**Expected output:**
```json
[
  {"id": "1", "name": "Alice", "status": "active"},
  {"id": "3", "name": "Bob", "status": "active"}
]
```
```

## Description Best Practices

**The description determines when your skill is invoked - it's the most critical field.**

### Must-Have Elements

1. **Start with "Use this skill when..."**
2. **List specific trigger keywords**
3. **Include concrete use cases**
4. **Write in third person**
5. **Under 1024 characters**

### Formula

```
Use this skill when [primary situations]. This includes [specific use cases with trigger keywords], [more use cases], and [edge cases]. Invoke when [alternative phrasings].
```

### Example Analysis

**Excellent description:**
```yaml
description: Use this skill when working with CSV files using the xsv command-line tool, including exploring CSV structure, understanding column headers, filtering data, selecting specific columns, transforming files, sorting, joining datasets, or performing data analysis on tabular data. Invoke when users mention CSV files with tasks like "explore", "filter", "select columns", "transform", "sort", or "join".
```

**Why it's excellent:**
- Clear "when" statement
- Specific tool (xsv)
- Comprehensive use cases (8 listed)
- Trigger keywords (explore, filter, select, transform, sort, join)
- Action verbs users might say
- Covers file format (CSV, tabular data)

## CLI and Scripting Best Practices

### Emphasize CLI Tools

**Encourage liberal use of:**
- `gh` - GitHub CLI
- `aws` - AWS CLI
- `npm` - Package management
- `git` - Version control
- `jq` - JSON processing
- Domain-specific tools

**Provide complete commands:**
```bash
# Good - complete and runnable
gh pr view 123 --json title,author,commits | jq '.commits | length'

# Bad - incomplete
gh pr view [with flags]
```

### Choose the Right Scripting Language

**Match the tool to the task:**

| Language | Best For |
|----------|----------|
| **Bash** | CLI chaining, file operations, git workflows, simple automation |
| **Python** | Data science, ML, when mature Python libraries exist (pandas, numpy) |
| **Node.js** | JSON processing, web tasks, API integrations |

**Guiding principles:**
- Prefer CLI commands over scripts when possible
- Match the project's existing tooling
- Use Python for data science (don't force Node.js for pandas-level work)
- Use Node.js for web/JSON-heavy tasks
- Use Bash for simple CLI chaining

**Example - Bash (CLI chaining):**
```bash
#!/bin/bash
cat data.csv | grep "active" | cut -d',' -f1,3 > filtered.csv
```

**Example - Python (data science):**
```python
#!/usr/bin/env python3
import pandas as pd
df = pd.read_csv('data.csv')
summary = df.groupby('category').agg({'value': ['mean', 'sum']})
summary.to_csv('summary.csv')
```

**Example - Node.js (JSON processing):**
```javascript
#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';
const data = JSON.parse(await readFile('input.json', 'utf-8'));
const processed = data.filter(item => item.active);
await writeFile('output.json', JSON.stringify(processed, null, 2));
```

See `./cli-and-scripting-patterns.md` for comprehensive examples.

## Naming Best Practices

### Skill Names - Gerund Form

**Format:** verb + -ing

**Examples:**
- ✅ `processing-pdfs`
- ✅ `analyzing-data`
- ✅ `deploying-lambdas`
- ❌ `pdf-processor`
- ❌ `data-analyzer`
- ❌ `lambda-deployer`

### Supporting File Names

**Use lowercase, intention-revealing names:**
- ✅ `./reference/aws-lambda-patterns.md`
- ✅ `./scripts/analyze-logs.js`
- ❌ `./reference/Reference.md`
- ❌ `./scripts/utils.js`

## Testing Best Practices

### Validate Before Deploying

**Checklist:**
- [ ] YAML syntax valid (no tabs, proper quotes)
- [ ] Name in gerund form, <64 chars
- [ ] Description starts with "Use this skill when...", <1024 chars
- [ ] No `allowed-tools`, `model`, or `tools` fields
- [ ] SKILL.md under 500 lines
- [ ] All relative paths (./file.md) are correct
- [ ] Supporting files use lowercase, intention-revealing names
- [ ] Scripts use appropriate language for the task
- [ ] Examples are complete and runnable
- [ ] No unnecessary explanations

### Test Invocation

**Write realistic queries:**
1. "Help me process a CSV file"
2. "I need to filter data in a spreadsheet"
3. "How do I select specific columns from tabular data?"
4. "Can you transform this CSV file?"

**Verify:**
- Skill description matches these queries
- Skill would be invoked appropriately
- Instructions are clear when invoked

## Anti-Patterns to Avoid

### Don't: Over-explain

❌ **Bad:**
```markdown
Claude Code is a powerful CLI tool that helps developers work more efficiently. When working with skills, you need to understand that skills are reusable capabilities that Claude can invoke. This skill is designed to help with...
```

✅ **Good:**
```markdown
## CSV Processing Workflow

1. Validate file structure
2. Process with xsv commands
3. Verify output
```

### Don't: Use Vague Language

❌ **Bad:**
```markdown
Process the data appropriately using suitable tools.
```

✅ **Good:**
```bash
xsv select id,name data.csv | xsv sort -s name > sorted.csv
```

### Don't: Use the Wrong Tool for the Job

❌ **Bad (forcing Node.js for data science):**
```javascript
// Don't use Node.js when pandas is clearly better
const csv = require('csv-parse');
// ... 50 lines of manual aggregation code
```

✅ **Good (Python for data science):**
```python
#!/usr/bin/env python3
import pandas as pd
df = pd.read_csv('data.csv')
summary = df.groupby('category')['value'].mean()
```

❌ **Bad (Python for simple CLI chaining):**
```python
import subprocess
subprocess.run(['cat', 'data.csv'])
subprocess.run(['grep', 'active'])
```

✅ **Good (Bash for CLI chaining):**
```bash
cat data.csv | grep "active" | cut -d',' -f1,3
```

### Don't: Create Generic File Names

❌ **Bad:**
- `./reference.md`
- `./helpers.md`
- `./utils.js`

✅ **Good:**
- `./reference/csv-methodology.md`
- `./scripts/transform-csv.js`
- `./templates/report-template.md`

### Don't: Offer Too Many Options

❌ **Bad:**
```markdown
You could use xsv, or csvkit, or pandas, or just write a custom script, or use awk, or...
```

✅ **Good:**
```markdown
Use xsv for CSV processing:
```bash
xsv select id,name data.csv > output.csv
```
```

### Don't: Use Windows-Style Paths

❌ **Bad:**
```
C:\Users\Documents\file.txt
.\reference\file.md
```

✅ **Good:**
```
/Users/name/Documents/file.txt
./reference/file.md
```

## Advanced Patterns

### Create Verifiable Outputs

When possible, create intermediate outputs that can be verified:

```markdown
## Step 2: Process Data

```bash
xsv select id,name data.csv > intermediate.csv
```

**Verify intermediate output:**
```bash
head -n 5 intermediate.csv
wc -l intermediate.csv
```

Expected: 1000 rows, 2 columns (id, name)
```

### Use Consistent Terminology

Pick terms and stick with them throughout the skill:
- "CSV file" (not "CSV file", "comma-separated file", "spreadsheet")
- "Process" (not "process", "transform", "handle")
- "Validate" (not "validate", "verify", "check")

### Include Quick Reference Section

```markdown
# Quick Reference

**Most common commands:**
```bash
xsv headers data.csv              # List column names
xsv count data.csv                # Count rows
xsv select col1,col2 data.csv     # Select columns
xsv search -s col1 "value" data.csv  # Filter rows
```
```

## Documentation Maintenance

### When to Update

1. **Tool version changes** - CLI tools get updated
2. **Best practices evolve** - Check official docs periodically
3. **Usage reveals issues** - Skill not invoked correctly
4. **New use cases** - Expand scope based on needs

### How to Update

1. Review official best practices first
2. Make focused, targeted changes
3. Test thoroughly
4. Don't change everything at once

### Versioning Approach

Skills don't have formal versions, but document major changes:

```markdown
# Changelog

**2024-01-15:** Refactored to progressive disclosure pattern, moved detailed examples to reference/examples.md
**2024-01-01:** Initial creation
```

## Summary: Quick Checklist

Creating or editing a skill? Check these:

**Structure:**
- [ ] SKILL.md under 500 lines (ideally ~150-200)
- [ ] Detailed content in reference/ files (lowercase names)
- [ ] Skinny pointers in SKILL.md
- [ ] Intention-revealing file names

**Metadata:**
- [ ] Name in gerund form, <64 chars
- [ ] Description starts with "Use this skill when..."
- [ ] Description includes 5+ trigger keywords
- [ ] Description <1024 chars

**Content:**
- [ ] Concise (no unnecessary explanations)
- [ ] Actionable (verb-oriented, specific)
- [ ] Complete examples (runnable commands)
- [ ] CLI tools emphasized
- [ ] Scripts use appropriate language for the task

**Quality:**
- [ ] YAML syntax valid
- [ ] All paths correct (./file.md)
- [ ] Examples tested
- [ ] No anti-patterns

**Testing:**
- [ ] Works with realistic queries
- [ ] Invoked appropriately
- [ ] Instructions clear and effective
