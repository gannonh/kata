# Editing and Refining Skills Guide

## When to Edit Skills

Edit existing skills to:
1. Improve invocation accuracy (most common)
2. Update for new use cases or workflows
3. Apply progressive disclosure (reduce SKILL.md size)
4. Add CLI and scripting patterns
5. Fix outdated information
6. Reorganize for clarity

## Common Skill Improvements

### 1. Refine Description for Better Invocation

**This is the most impactful edit you can make.**

**Problem:** Skill isn't being invoked when it should be

**Investigation:**
- What user queries should trigger this skill?
- What keywords are missing from the description?
- Does description explain WHEN to use it?

**Solution:**
```yaml
# Before (weak)
description: Helps with CSV files

# After (strong)
description: Use this skill when working with CSV files using xsv CLI, including exploring structure, filtering data, selecting columns, transforming files, sorting, joining datasets, or performing tabular data analysis. Invoke when users mention CSV with tasks like explore, filter, select, transform, sort, or join.
```

**Process:**
1. Read current description
2. List 10 user queries that should trigger the skill
3. Extract keywords from those queries
4. Ensure description includes those keywords
5. Start with "Use this skill when..."
6. Add concrete use cases

### 2. Apply Progressive Disclosure

**Problem:** SKILL.md is over 500 lines with too much detail

**Solution:** Move detailed content to reference files

**Process:**

1. **Identify sections to extract:**
   - Detailed methodology (background/theory)
   - Long examples (>50 lines)
   - Comprehensive checklists
   - Reference tables
   - Troubleshooting guides

2. **Create reference files with intention-revealing names:**
   ```
   skill-name/
   ├── SKILL.md (keep core workflow)
   ├── reference/
   │   ├── detailed-methodology.md
   │   ├── advanced-examples.md
   │   └── troubleshooting-guide.md
   ```

3. **Replace detailed sections with skinny pointers:**
   ```markdown
   ## Methodology

   See `./reference/detailed-methodology.md` for comprehensive background on the approach.
   ```

4. **Keep in SKILL.md:**
   - Essential workflow steps (high-level)
   - Core instructions Claude needs immediately
   - Quick reference (1-2 examples)
   - Pointers to detailed documentation

5. **Move to reference files:**
   - Detailed explanations
   - Background theory
   - Extensive example libraries
   - Long checklists
   - Edge case handling

**Example transformation:**

```markdown
# Before (in SKILL.md, 150 lines)
## CSV Processing Methodology

CSV files are comma-separated values files...
[50 lines of CSV format explanation]

Here are 15 detailed examples:
[100 lines of examples]

# After (in SKILL.md, 10 lines)
## CSV Processing Methodology

See `./reference/csv-methodology.md` for detailed CSV format information.
See `./reference/csv-examples.md` for 15+ comprehensive examples.

Quick example:
```bash
xsv select column1,column2 input.csv > output.csv
```
```

### 3. Improve Organization

**Problem:** Instructions are hard to follow or unclear

**Solution:** Restructure with clear hierarchy

**Before:**
```markdown
You should first check the data then process it and validate.
Use xsv for CSV. You can also use jq for JSON.
Sometimes errors happen so handle those.
```

**After:**
```markdown
## Processing Workflow

1. **Validation**
   - Check file format with `file` command
   - Verify structure with `head`

2. **Processing**
   - CSV files: Use `xsv` commands
   - JSON files: Use `jq` commands

3. **Error Handling**
   - Verify output with test commands
   - Check for data integrity issues

See `./reference/detailed-workflow.md` for comprehensive steps.
```

### 4. Add CLI and Scripting Patterns

**Problem:** Skill doesn't emphasize modern tooling

**Solution:** Add specific CLI commands and appropriate scripting examples

**What to add:**
- CLI tools section with specific commands
- Script examples using the right language for the task
- Complete, runnable command examples
- Command chaining patterns

**Before:**
```markdown
Process the data using appropriate tools.
```

**After:**
```markdown
## CLI Tools

**Process with xsv:**
```bash
xsv select id,name data.csv | xsv sort -s name > sorted.csv
```

**Process with Bash (simple operations):**
```bash
cat data.csv | grep "active" | cut -d',' -f1,3 > filtered.csv
```

**Process with Python (data science):**
```python
#!/usr/bin/env python3
import pandas as pd
df = pd.read_csv('data.csv')
summary = df.groupby('category')['value'].mean()
```

**Process with Node.js (JSON tasks):**
```javascript
#!/usr/bin/env node
import { readFile } from 'fs/promises';
const data = JSON.parse(await readFile('data.json', 'utf-8'));
console.log(data.filter(x => x.active));
```

See `./reference/cli-and-scripting-patterns.md` for more examples.
```

### 5. Update Outdated Content

**Problem:** Skill references old tools, deprecated commands, or outdated practices

**Solution:** Update to current best practices

**Common updates:**
- Mismatched tools → Right language for the task
- Old CLI tool versions → Latest versions
- Deprecated commands → Current alternatives
- Old API patterns → Modern approaches

**Process:**
1. Review official documentation for referenced tools
2. Check for deprecated features
3. Update commands and examples
4. Test updated commands
5. Update version requirements if needed

### 6. Add Supporting Files

**When to add supporting files:**
- Skill needs detailed reference information
- Multiple complex examples would help
- Templates would accelerate workflows
- Helper scripts would be reusable

**File types to consider:**

**Reference documentation:**
```
reference/
├── methodology.md          # Detailed approach explanation
├── advanced-patterns.md    # Complex use cases
├── troubleshooting.md      # Common issues and solutions
└── api-reference.md        # API/command reference
```

**Templates:**
```
templates/
├── report-template.md      # Output format template
├── config-template.yaml    # Configuration template
└── script-template.sh/.js/.py  # Script skeletons
```

**Scripts:**
```
scripts/
├── process-data.js         # Data processing utility
├── validate-output.js      # Validation script
└── transform-files.js      # File transformation
```

## Editing Workflow

### Step 1: Analyze Current State

1. Read SKILL.md completely
2. Check supporting files (if any)
3. Identify the issue:
   - Poor invocation? → Fix description
   - Too long? → Apply progressive disclosure
   - Missing examples? → Add supporting files
   - Outdated? → Update content
   - Unclear? → Improve organization

### Step 2: Review Official Documentation

Before making changes:
- Check https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices.md
- Review latest patterns and recommendations
- Verify your approach aligns with current best practices

### Step 3: Make Focused Changes

**Don't change everything at once. Focus on:**
1. Most impactful improvement (usually description)
2. One structural improvement (progressive disclosure or organization)
3. One content improvement (examples or CLI tools)

### Step 4: Validate Changes

After editing:
- [ ] YAML frontmatter is valid (no syntax errors)
- [ ] Description is under 1024 characters
- [ ] Name follows gerund form convention
- [ ] SKILL.md is under 500 lines (ideally)
- [ ] All relative paths (./file.md) are correct
- [ ] Supporting files have intention-revealing names
- [ ] Examples are tested and work
- [ ] Scripts use appropriate language for the task

### Step 5: Test Invocation

Test with realistic user queries:
1. Write 5-10 queries that should trigger this skill
2. Test if description keywords match those queries
3. Ensure skill is invoked appropriately
4. Verify instructions are clear and actionable

## Common Editing Patterns

### Pattern: Extract Long Section

**Before (SKILL.md has 300-line examples section):**
```markdown
## Examples

### Example 1: Basic Usage
[50 lines]

### Example 2: Advanced Usage
[80 lines]

### Example 3: Edge Cases
[70 lines]

### Example 4: Integration
[100 lines]
```

**After (SKILL.md has brief overview):**
```markdown
## Examples

See `./reference/comprehensive-examples.md` for 15+ detailed examples covering:
- Basic usage patterns
- Advanced transformations
- Edge case handling
- Integration with other tools

Quick example:
```bash
xsv select id,name data.csv > output.csv
```
```

### Pattern: Add CLI Emphasis

**Before (generic instructions):**
```markdown
Check the data and then process it appropriately.
```

**After (specific CLI tools):**
```markdown
## Data Validation

**Check file format:**
```bash
file data.csv
head -n 5 data.csv
xsv headers data.csv
```

**Process data:**
```bash
xsv select column1,column2 data.csv | xsv filter -s column1 'value' > output.csv
```

See `./reference/cli-commands.md` for complete command reference.
```

### Pattern: Choose the Right Scripting Language

**Use the right tool for the task:**

| Task | Best Language |
|------|---------------|
| CLI chaining, file operations | Bash |
| Data science, pandas/numpy work | Python |
| JSON processing, web tasks | Node.js |

**Example - Data science (Python is appropriate):**
```markdown
## Data Analysis Script

```python
#!/usr/bin/env python3
import pandas as pd
df = pd.read_csv('data.csv')
summary = df.groupby('category').agg({'value': ['mean', 'sum']})
print(summary)
```
```

**Example - JSON processing (Node.js is appropriate):**
```markdown
## JSON Processing Script

```javascript
#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';
const data = JSON.parse(await readFile('data.json', 'utf-8'));
const filtered = data.filter(x => x.active);
await writeFile('output.json', JSON.stringify(filtered, null, 2));
```
```

**Example - Simple file operations (Bash is appropriate):**
```markdown
## File Processing Script

```bash
#!/bin/bash
cat data.csv | grep "active" | cut -d',' -f1,3 > filtered.csv
```
```

### Pattern: Improve Description Specificity

**Before:**
```yaml
description: Helps with data analysis tasks
```

**After:**
```yaml
description: Use this skill when analyzing datasets, writing SQL queries, exploring data patterns, generating statistical insights, creating data visualizations, or transforming data files. This includes working with CSV files, JSON data, database queries, and data aggregation tasks. Invoke for data exploration, statistical analysis, or data transformation needs.
```

## Editing Checklist

When editing any skill:

- [ ] Read complete current SKILL.md and supporting files
- [ ] Identify specific issue to address
- [ ] Review official best practices documentation
- [ ] Make focused, targeted improvements
- [ ] If reducing SKILL.md size:
  - [ ] Created reference files with intention-revealing, lowercase names
  - [ ] Replaced verbose sections with skinny pointers
  - [ ] Verified relative paths are correct
- [ ] If improving description:
  - [ ] Starts with "Use this skill when..."
  - [ ] Includes 5+ trigger keywords
  - [ ] Lists concrete use cases
  - [ ] Written in third person
  - [ ] Under 1024 characters
- [ ] If adding CLI tools:
  - [ ] Specific, runnable commands
  - [ ] Modern tool versions
  - [ ] Complete examples
- [ ] If adding scripts:
  - [ ] Uses appropriate language for the task
  - [ ] Bash for CLI chaining, Python for data science, Node.js for JSON/web
  - [ ] Executable with shebang
- [ ] Validated YAML syntax
- [ ] Tested with realistic queries
- [ ] SKILL.md under 500 lines

## When NOT to Edit

Don't edit a skill if:
1. **It's working well** - No invocation issues, clear instructions, good organization
2. **Recent changes** - Give skills time to stabilize after edits
3. **No clear goal** - Don't edit just to edit; have specific improvement in mind
4. **User feedback needed** - If unclear what to improve, gather usage data first

## Testing Edits

After editing:

1. **Syntax check:**
   ```bash
   cat SKILL.md  # Verify YAML and markdown render correctly
   ```

2. **Structure check:**
   ```bash
   ls -la skill-name/
   # Verify all referenced files exist
   ```

3. **Invocation test:**
   - Ask Claude queries that should trigger skill
   - Verify skill is invoked
   - Check instructions are followed

4. **Comparison:**
   - Before: What was the problem?
   - After: Is the problem solved?
   - Trade-offs: What changed for better/worse?

## Quick Reference: Common Edits

| Problem | Solution | Files Affected |
|---------|----------|----------------|
| Not being invoked | Improve description with trigger keywords | SKILL.md |
| Too long (>500 lines) | Extract to reference files with skinny pointers | SKILL.md + new reference/ files |
| Missing examples | Add examples or reference file | SKILL.md or reference/examples.md |
| Wrong scripting language | Use right tool: Bash/Python/Node.js for task | scripts/*.sh/.py/.js |
| Unclear structure | Reorganize with hierarchy | SKILL.md |
| No CLI tools | Add CLI commands section | SKILL.md or reference/cli-patterns.md |
| Outdated commands | Update to current versions | SKILL.md + reference files |
| Generic name | Change to gerund form | SKILL.md (name field) |
| Verbose explanation | Challenge necessity, condense or remove | SKILL.md |

## Iterative Improvement

Skills improve over time through:
1. **Usage observation** - See when they're invoked (or not)
2. **Targeted edits** - Fix specific issues
3. **Testing** - Verify improvements work
4. **Refinement** - Iterate based on results

Don't expect perfection on first edit. Skills evolve through iterative refinement based on real-world usage.
