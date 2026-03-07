# Converting Claude Code Sub-Agents to Skills

This document provides detailed guidance on converting existing Claude Code sub-agent configurations to the Skills format.

## Essential Reading

Before starting any conversion, review these official documentation sources:

- **Sub-Agents Overview**: https://docs.claude.com/en/docs/claude-code/sub-agents.md
- **Agent Skills Overview**: https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview.md
- **Best Practices**: https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices.md

Use WebFetch to access these URLs for the latest information.

## Understanding the Differences

### Sub-Agent Configuration

Sub-agents are defined in files (in `~/.claude/agents/` or `.claude/agents/`) with YAML frontmatter:

```yaml
---
name: agent-name
description: What this agent does (for Task tool invocation)
tools: [optional tool restrictions]
model: sonnet|opus|haiku
---

Agent instructions and expertise...
```

**Key characteristics:**
- Invoked explicitly by main Claude instance via Task tool
- Operate in separate context windows
- Description explains what the agent does (for explicit selection)
- Model and tools can be specified
- Self-contained instructions

**Example from Documentation - Code Reviewer:**
```yaml
---
name: code-reviewer
description: Reviews code quality, checks security and best practices, provides prioritized feedback
model: sonnet
---

You are an expert code reviewer focusing on:
- Code quality and maintainability
- Security vulnerabilities
- Performance issues
- Best practices adherence

Review the code and provide clear, actionable feedback.
```

### Skill Configuration

Skills are directories with a `SKILL.md` file:

```yaml
---
name: skill-name
description: When to use this skill (triggers automatic invocation by Claude)
---

Skill instructions and expertise...
```

**Key characteristics:**
- Invoked automatically by Claude when relevant (no Task tool needed)
- Description must trigger invocation (keywords + use cases)
- No model/tools specification (inherits Claude Code capabilities)
- Can have supporting files (templates, scripts, references)
- Uses progressive disclosure

## Key Transformation Steps

### 1. Description Transformation (MOST CRITICAL)

Sub-agent descriptions explain WHAT the agent does. Skill descriptions must explain WHEN to invoke.

**Transformation Formula:**
```
Sub-Agent: "Reviews code quality and provides feedback"
Skill: "Use this skill when reviewing code for quality issues, security vulnerabilities, performance problems, or best practices violations. This includes analyzing pull requests, auditing existing code, or validating new implementations."
```

**Guidelines:**
- Write in third person
- Start with "Use this skill when..."
- Include specific trigger keywords users might say
- List concrete use cases
- Keep under 1024 characters
- Think: "What user queries should invoke this?"

### 2. Name Transformation

**Sub-Agent Names** (typically nouns or noun-phrases):
- `code-reviewer`
- `debugger`
- `data-scientist`

**Skill Names** (gerund form - verb + -ing):
- `reviewing-code` (not `code-reviewer`)
- `debugging-applications` (not `debugger`)
- `analyzing-data` (not `data-scientist`)

Verify:
- Lowercase only
- Hyphens for word separation
- Max 64 characters
- Gerund form preferred

### 3. Content Transformation

#### Preserve
- Core expertise and domain knowledge
- Step-by-step approaches
- Examples (these are valuable!)
- Best practices
- Common patterns

#### Enhance
- Add explicit validation steps
- Create separate files for detailed content (with intention-revealing names)
- Add troubleshooting section
- Include completion checklist
- Emphasize CLI-first approach with appropriate scripting
- Keep SKILL.md under 500 lines

#### Remove/Transform
- **Remove**: `model:` field (not used in skills)
- **Remove**: `tools:` field (skills inherit all Claude Code capabilities)
- **Transform**: Sub-agent invocation examples → Skill invocation context
- **Transform**: Self-referential language ("I am an agent") → Direct instructions

### 4. Progressive Disclosure

Skills support multi-file structures. Consider organizing:

```
skill-name/
├── SKILL.md (core instructions, <500 lines)
├── detailed-methodology.md (background theory)
├── code-review-checklist.md (detailed checklists)
├── templates/
│   └── review-report.md
└── scripts/
    └── analyze-complexity.sh/.js/.py (choose based on task)
```

Reference supporting files with relative paths in SKILL.md:
- `./detailed-methodology.md`
- `./code-review-checklist.md`

## Conversion Examples

### Example 1: Code Reviewer Sub-Agent → Skill

**Original Sub-Agent:**
```yaml
---
name: code-reviewer
description: Reviews code quality, checks security and best practices, provides prioritized feedback
model: sonnet
tools: [Read, Grep, Glob]
---

You are an expert code reviewer focusing on:
- Code quality and maintainability
- Security vulnerabilities
- Performance issues
- Best practices adherence

Review the code and provide clear, actionable feedback prioritized by severity.
```

**Converted Skill:**

File: `~/.claude/skills/reviewing-code/SKILL.md`

```yaml
---
name: reviewing-code
description: Use this skill when reviewing code for quality issues, security vulnerabilities, performance problems, or best practices violations. This includes analyzing pull requests, auditing codebases, validating new implementations, checking for code smells, or providing feedback on code maintainability.
---

# Code Review Expert

Focus on providing thorough, actionable code review feedback across quality, security, performance, and best practices.

## Review Approach

1. **Initial Analysis**
   - Understand the code's purpose and context
   - Identify the scope of changes
   - Note the programming language and framework

2. **Quality Assessment**
   - Check code readability and maintainability
   - Look for code smells and anti-patterns
   - Verify naming conventions and structure
   - Assess test coverage

3. **Security Review**
   - Identify potential security vulnerabilities
   - Check for injection risks, authentication issues
   - Review data handling and validation
   - Verify secure dependencies

4. **Performance Analysis**
   - Look for obvious performance bottlenecks
   - Check algorithmic complexity
   - Identify unnecessary operations
   - Review resource usage patterns

5. **Feedback Generation**
   - Prioritize issues by severity (critical, major, minor)
   - Provide specific, actionable recommendations
   - Include code examples where helpful
   - Reference best practices and documentation

## CLI Tools to Leverage

Use these tools to assist reviews:
- `gh pr view` - View pull request details
- `gh pr diff` - See PR changes
- `git diff` - Compare code changes
- Custom scripts for analysis (see `./scripts/`)

## Example Review Structure

**Critical Issues:**
- [Specific issue with line reference]
- Recommended fix: [concrete solution]

**Major Issues:**
- [Issue description]
- Impact: [why this matters]

**Minor Issues & Suggestions:**
- [Improvement opportunities]

See `./code-review-checklist.md` for comprehensive review criteria.
```

**Key Changes:**
1. Name: `code-reviewer` → `reviewing-code` (gerund form)
2. Description: Expanded with trigger keywords and use cases
3. Removed: `model` and `tools` fields
4. Enhanced: Added CLI tool suggestions
5. Structured: Clear step-by-step approach
6. Referenced: Supporting file for detailed checklist

### Example 2: Debugger Sub-Agent → Skill

**Original Sub-Agent:**
```yaml
---
name: debugger
description: Analyzes error messages, identifies root causes, suggests minimal fixes
model: sonnet
---

You are an expert debugger. Analyze errors systematically:
1. Understand the error message
2. Find the root cause
3. Suggest the minimal fix

Be precise and efficient.
```

**Converted Skill:**

File: `~/.claude/skills/debugging-applications/SKILL.md`

```yaml
---
name: debugging-applications
description: Use this skill when debugging application errors, analyzing stack traces, identifying root causes of failures, fixing runtime issues, or resolving build problems. This includes investigating exception messages, tracking down bug sources, and recommending minimal fixes.
---

# Application Debugging Expert

Systematically analyze and resolve application errors through methodical investigation.

## Debugging Approach

1. **Error Analysis**
   - Read complete error message and stack trace
   - Identify error type (syntax, runtime, logical)
   - Note affected files and line numbers
   - Check error context and inputs

2. **Root Cause Investigation**
   - Use `grep` to find related code patterns
   - Check recent changes with `git log` and `git diff`
   - Examine variable values and state
   - Trace execution flow
   - Look for common causes:
     - Null/undefined references
     - Type mismatches
     - Async timing issues
     - Configuration problems

3. **Fix Recommendations**
   - Suggest minimal, focused changes
   - Explain why the fix works
   - Consider edge cases
   - Verify fix doesn't introduce new issues

4. **Verification**
   - Run existing tests if available
   - Suggest test commands to verify fix
   - Use CLI tools to validate:
     - `npm test`
     - `node script.js`
     - Language-specific linters

## CLI Debugging Tools

Leverage these tools:
- `git log --oneline -10` - Recent changes
- `git blame` - Find who changed code
- `gh pr list` - Check related PRs
- `npm run debug` - If configured
- Language-specific debugging (Node.js: `node --inspect`, Python: `pdb`, etc.)

## Example Workflow

**User reports:** "Getting TypeError: Cannot read property 'name' of undefined"

**Investigation:**
1. Locate the exact line from stack trace
2. Read surrounding code with Read tool
3. Check where the object is defined
4. Identify if it's an async timing issue

**Recommendation:**
```javascript
// Before
const userName = user.name;

// After (add null check)
const userName = user?.name || 'Unknown';
```

**Verification:**
- Run tests: `npm test`
- Check similar patterns: `grep -r "user.name" .`
```

**Key Changes:**
1. Name: `debugger` → `debugging-applications` (gerund, more specific)
2. Description: Added specific debugging triggers and keywords
3. Removed: `model` field
4. Enhanced: CLI debugging tools section
5. Expanded: More detailed approach with concrete steps
6. Added: Example workflow showing practical application

### Example 3: Data Scientist Sub-Agent → Skill

**Original Sub-Agent:**
```yaml
---
name: data-scientist
description: Writes SQL queries, performs data analysis, generates insights
model: sonnet
---

You are a data scientist. Help users:
- Write efficient SQL queries
- Analyze data patterns
- Generate insights from data
```

**Converted Skill:**

File: `~/.claude/skills/analyzing-data/SKILL.md`

```yaml
---
name: analyzing-data
description: Use this skill when analyzing datasets, writing SQL queries, exploring data patterns, generating statistical insights, creating data visualizations, or transforming data files. This includes working with CSV files, JSON data, database queries, and data aggregation tasks.
---

# Data Analysis Expert

Help users analyze data, write queries, and extract insights using modern CLI tools and appropriate scripting.

## Analysis Approach

1. **Data Exploration**
   - Understand data structure and format
   - Identify column types and ranges
   - Check for missing or invalid data
   - Use CLI tools for quick exploration:
     - CSV: `head`, `wc -l`, or global npm tools
     - JSON: `jq` for querying

2. **Query Development**
   - Write clear, efficient SQL queries
   - Use proper indexing considerations
   - Include comments explaining logic
   - Test queries incrementally

3. **Data Processing**
   - Choose the right tool for the task:

     **Python (data science/ML):**
     ```python
     import pandas as pd
     df = pd.read_csv('data.csv')
     summary = df.groupby('category').agg({'value': ['mean', 'sum']})
     ```

     **Node.js (JSON processing):**
     ```javascript
     import { readFile, writeFile } from 'fs/promises';
     const data = JSON.parse(await readFile('data.json', 'utf-8'));
     const processed = data.map(/* transform */);
     ```
   - Leverage CLI tools and appropriate packages

4. **Insight Generation**
   - Calculate relevant statistics
   - Identify patterns and anomalies
   - Provide actionable recommendations
   - Suggest visualizations if helpful

## CLI Tools for Data Work

**Essential tools:**
- `jq` - JSON processing
- `awk` - Text processing
- `sort`, `uniq`, `wc` - Data aggregation
- Scripting for complex transformations (Python for data science, Node.js for JSON)
- `gh` - Access GitHub data
- `aws s3` - Work with cloud data

**Choose the right scripting language:**

Python (ideal for data science with pandas/numpy):
```python
#!/usr/bin/env python3
import pandas as pd
df = pd.read_csv('data.csv')
print(df.describe())
```

Node.js (ideal for JSON/streaming):
```javascript
#!/usr/bin/env node
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

const parser = createReadStream('data.csv').pipe(parse({ columns: true }));
for await (const record of parser) {
  console.log(record);
}
```

## Example Queries

**SQL - Find top customers:**
```sql
SELECT customer_id, COUNT(*) as order_count, SUM(total) as revenue
FROM orders
WHERE order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY customer_id
ORDER BY revenue DESC
LIMIT 10;
```

**Node.js - Aggregate JSON data:**
```javascript
#!/usr/bin/env node
import { readFile } from 'fs/promises';

const orders = JSON.parse(await readFile('orders.json', 'utf-8'));
const summary = orders.reduce((acc, order) => {
  acc.total += order.amount;
  acc.count += 1;
  return acc;
}, { total: 0, count: 0 });

console.log(`Total: $${summary.total}, Orders: ${summary.count}`);
```

See `./data-processing-patterns.md` for more examples.
```

**Key Changes:**
1. Name: `data-scientist` → `analyzing-data` (gerund, more general)
2. Description: Comprehensive with data-related trigger keywords
3. Removed: `model` field
4. Enhanced: Heavy emphasis on CLI tools with appropriate scripting
5. Added: Specific code examples using right tool for task (Python for data science, Node.js for JSON)
6. Structured: Clear workflow from exploration to insights
7. Referenced: Supporting file for additional patterns

## Conversion Checklist

Use this checklist when converting any sub-agent to a skill:

- [ ] Read the sub-agent configuration completely
- [ ] Review official documentation (URLs at top of this file)
- [ ] Identify core expertise and capabilities
- [ ] Extract trigger keywords and use cases from agent description
- [ ] Choose gerund-form skill name (e.g., `processing-data`, not `data-processor`)
- [ ] Write new description with invocation triggers in third person
- [ ] Remove `model` and `tools` fields from YAML
- [ ] Copy core instructions and domain expertise
- [ ] Preserve examples (transform self-references to direct instructions)
- [ ] Add CLI-first approach with appropriate scripting language
- [ ] Add validation/testing steps
- [ ] Consider if supporting files would help (use intention-revealing names)
- [ ] Keep SKILL.md under 500 lines
- [ ] Create skill directory in `~/.claude/skills/` for global availability
- [ ] Write complete SKILL.md with proper YAML frontmatter
- [ ] Test with sample queries that should invoke the skill

## Testing Conversions

After conversion, verify:

1. **Structure Validation**
   ```bash
   ls -la ~/.claude/skills/skill-name/
   # Should show SKILL.md and any supporting files
   ```

2. **YAML Syntax**
   - No `model` or `tools` fields
   - Description under 1024 characters
   - Name in gerund form, max 64 characters
   - No tabs (use spaces)

3. **Invocation Testing**
   - Ask Claude queries that should trigger the skill
   - Verify skill is invoked appropriately
   - Check that instructions are followed
   - Confirm CLI-first approaches with appropriate scripting are present

4. **Content Comparison**
   - Did we preserve core sub-agent expertise?
   - Are examples still present and useful?
   - Is domain knowledge intact?
   - Are CLI tools emphasized?

## Common Issues and Solutions

### Issue: Skill Not Being Invoked

**Symptoms:** User query should trigger skill, but doesn't

**Causes:**
- Description doesn't contain trigger keywords matching query
- Description explains WHAT not WHEN
- Name not descriptive enough

**Solutions:**
- Add more trigger keywords to description
- Include concrete use cases in description
- Ensure third person voice
- Test with various query phrasings

### Issue: Using Wrong Scripting Language

**Symptoms:** Scripts use language that doesn't match the task

**Solutions:**
- Use Python for data science/ML tasks (pandas, numpy, etc.)
- Use Node.js for JSON processing and web tasks
- Use Bash for simple CLI chaining and file operations
- Match the language to what the task requires, not a blanket preference

### Issue: SKILL.md Too Long

**Symptoms:** Over 500 lines

**Solutions:**
- Move detailed background to separate file (e.g., `./methodology.md`)
- Extract checklists to `./checklist.md`
- Move examples to `./examples.md`
- Keep only core instructions in SKILL.md
- Reference files with `./filename.md` relative paths

### Issue: Missing CLI Tooling

**Symptoms:** No CLI tools mentioned or encouraged

**Solutions:**
- Add CLI tools section
- Show specific commands (gh, aws, npm, etc.)
- Provide complete, runnable examples
- Suggest global npm package installations
- Demonstrate command chaining

## Advanced: Multi-File Skills

For complex sub-agents, organize into multiple files:

```
analyzing-data/
├── SKILL.md (overview and primary workflow)
├── data-processing-patterns.md (detailed examples)
├── sql-optimization-guide.md (query best practices)
├── templates/
│   ├── analysis-report.md
│   └── query-template.sql
└── scripts/
    ├── aggregate-json.js (Node.js for JSON tasks)
    └── analyze-data.py (Python for data science)
```

This enables progressive disclosure:
- Claude sees skill metadata first (low context cost)
- Loads SKILL.md when invoked (core instructions)
- Loads supporting files only when referenced (on-demand)

**Benefits:**
- Keeps SKILL.md focused and under 500 lines
- Reduces context usage
- Organizes complex knowledge domains
- Easier to maintain and update
- Clear separation of concerns

## Best Practices Summary

1. **Start with documentation** - Review official docs before converting
2. **Description is critical** - Spend time on invocation triggers
3. **Preserve expertise** - Don't lose the sub-agent's domain knowledge
4. **Keep examples** - They're invaluable for understanding
5. **Use gerund names** - `processing-data`, not `data-processor`
6. **Remove agent fields** - No `model` or `tools` in skill YAML
7. **CLI-first approach** - Use appropriate scripting language for the task
8. **Intention-revealing names** - For all supporting files
9. **Progressive disclosure** - SKILL.md < 500 lines, details elsewhere
10. **Test thoroughly** - Verify invocation and functionality
