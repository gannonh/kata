# Skill Metadata Requirements Reference

## Critical Fields

The YAML frontmatter in SKILL.md contains two critical fields that determine how and when skills are invoked.

## Name Field

**Purpose:** Unique identifier for the skill

**Format Requirements:**
- **Maximum:** 64 characters
- **Characters:** Lowercase letters, numbers, hyphens only
- **No spaces:** Use hyphens instead
- **No underscores:** Use hyphens
- **No special characters:** No `@`, `#`, `$`, etc.
- **No XML tags:** Plain text only
- **No reserved words:** Avoid "anthropic", "claude", "skill"

**Naming Convention - Gerund Form (verb + -ing):**

Use action-oriented names that describe what the skill does:

**Good Examples:**
- `processing-pdfs` (not `pdf-processor`)
- `analyzing-spreadsheets` (not `spreadsheet-analyzer`)
- `deploying-lambdas` (not `lambda-deployer`)
- `reviewing-code` (not `code-reviewer`)
- `debugging-applications` (not `debugger`)
- `managing-databases` (not `database-manager`)
- `transforming-data` (not `data-transformer`)

**Bad Examples (avoid noun forms):**
- `pdf-helper`
- `spreadsheet-utils`
- `lambda-tool`
- `code-review`
- `debug-agent`

**Why Gerund Form?**
- Describes ongoing action/capability
- More intuitive for invocation matching
- Consistent with skill-as-capability mental model
- Aligns with "what is this skill doing?" question

## Description Field

**Purpose:** THE MOST CRITICAL field - determines when Claude invokes the skill

**This is your skill's "invocation trigger" - spend time crafting it carefully.**

### Requirements

- **Maximum:** 1024 characters
- **Voice:** Third person (not first person)
- **Focus:** WHEN to use the skill (not just WHAT it does)
- **Content:** Include trigger keywords and concrete use cases

### Writing Formula

```
Use this skill when [primary situation]. This includes [specific use cases with trigger keywords], [more use cases], and [edge cases].
```

### Key Principles

1. **Be Specific About "When"**
   - Good: "Use this skill when..."
   - Bad: "This skill can..." or "This skill helps with..."

2. **Include Trigger Keywords**
   - Words users might say in queries
   - Technical terms relevant to the domain
   - Action verbs that imply this skill's use
   - Tool names, file formats, frameworks

3. **List Concrete Use Cases**
   - Real scenarios where skill applies
   - Different phrasings of the same need
   - Edge cases that should trigger invocation

4. **Think From Claude's Perspective**
   - "When would I need this skill?"
   - "What user queries should activate this?"
   - "How do I distinguish this from other skills?"

5. **Write in Third Person**
   - Describe the skill to someone else
   - Not "I help you..." but "Use this skill when..."

### Examples

**Good Description (CSV processing skill):**
```yaml
description: Use this skill when working with CSV files using the xsv command-line tool, including exploring CSV structure, understanding column headers, filtering data, selecting specific columns, transforming files, sorting, joining datasets, or performing data analysis on tabular data. Invoke when users mention CSV files with tasks like "explore", "filter", "select columns", "transform", "sort", or "join".
```

**Why it's good:**
- Starts with "Use this skill when"
- Lists specific operations: exploring, filtering, selecting, transforming, sorting, joining
- Includes trigger keywords: CSV, xsv, tabular data, column headers
- Mentions common user verbs: explore, filter, select, transform
- Covers the full scope of when to invoke

**Bad Description:**
```yaml
description: CSV helper skill
```

**Why it's bad:**
- Doesn't explain when to use it
- No trigger keywords
- Too vague and generic
- Doesn't help Claude decide when to invoke

**Good Description (AWS Lambda deployment skill):**
```yaml
description: Use this skill when deploying AWS Lambda functions, updating Lambda configurations, managing Lambda layers, setting environment variables, configuring triggers, or troubleshooting Lambda deployments. This includes working with SAM templates, CloudFormation stacks, Lambda permissions, VPC configurations, and monitoring Lambda metrics. Invoke for tasks involving serverless deployments, Lambda updates, or AWS serverless architecture.
```

**Why it's good:**
- Comprehensive list of Lambda-related tasks
- Includes AWS-specific terminology (SAM, CloudFormation, VPC)
- Covers both deployment and troubleshooting
- Multiple trigger phrases (deploying, managing, configuring, troubleshooting)

**Good Description (Git workflow skill):**
```yaml
description: Use this skill when performing advanced Git operations including interactive rebasing, cherry-picking commits, resolving complex merge conflicts, managing Git submodules, working with Git bisect for debugging, or executing complex branch strategies. This includes repository cleanup, history rewriting, and multi-repository workflows. Invoke for non-trivial Git tasks beyond basic add/commit/push operations.
```

**Why it's good:**
- Clearly scoped to "advanced" operations
- Lists specific Git commands: rebase, cherry-pick, bisect, submodules
- Distinguishes from basic Git operations
- Includes multiple scenarios: cleanup, debugging, multi-repo

### Testing Your Description

Ask yourself:

1. **Would these user queries trigger this skill?**
   - List 5-10 example queries
   - Check if description contains relevant keywords from each

2. **Is it distinct from other skills?**
   - How does this differ from similar skills?
   - Are there clear boundaries?

3. **Does it cover edge cases?**
   - What unusual requests should still trigger this?
   - Are those mentioned in the description?

4. **Could Claude figure out when to invoke this?**
   - Read it from Claude's perspective
   - Is the "when" clear and unambiguous?

### Common Mistakes

❌ **Too vague:** "Use this skill for data work"
✅ **Specific:** "Use this skill when analyzing CSV files, writing SQL queries, or generating statistical insights"

❌ **What instead of when:** "This skill processes PDFs and extracts text"
✅ **When-focused:** "Use this skill when extracting text from PDFs, analyzing PDF structure, or converting PDFs to other formats"

❌ **First person:** "I help you with Docker containers"
✅ **Third person:** "Use this skill when building Docker images, managing containers, or debugging Docker deployments"

❌ **Missing triggers:** "Use this skill for Python projects"
✅ **With triggers:** "Use this skill when writing Python code, debugging Python scripts, managing virtual environments with pip/poetry, or optimizing Python performance"

## Validation Checklist

Before finalizing metadata:

- [ ] Name is in gerund form (verb + -ing)
- [ ] Name is lowercase with hyphens only
- [ ] Name is under 64 characters
- [ ] Description starts with "Use this skill when..."
- [ ] Description is written in third person
- [ ] Description includes 5+ trigger keywords
- [ ] Description lists concrete use cases
- [ ] Description is under 1024 characters
- [ ] No `allowed-tools`, `model`, or `tools` fields in YAML
- [ ] YAML uses spaces (not tabs)

## Examples of Complete Metadata

### Example 1: Email Template Documenter

```yaml
---
name: documenting-sendgrid-templates
description: Use this skill when generating business-focused documentation for SendGrid email templates by analyzing AWS Lambda configurations and codebase usage. This includes translating technical implementations into business rules, extracting trigger conditions, documenting data fields, and creating comprehensive template documentation. Invoke when working with SendGrid template IDs, email template documentation, or Lambda email sending logic.
---
```

### Example 2: CSV Analysis

```yaml
---
name: analyzing-csv-data
description: Use this skill when working with CSV files using xsv CLI tool, including exploring structure, filtering data, selecting columns, transforming files, sorting, joining datasets, or performing tabular data analysis. Invoke when users mention CSV files with operations like explore, filter, select, transform, sort, or join.
---
```

### Example 3: GitHub Workflows

```yaml
---
name: creating-github-workflows
description: Use this skill when creating or debugging GitHub Actions workflows, writing workflow YAML files, configuring CI/CD pipelines, managing GitHub secrets, troubleshooting workflow failures, or optimizing workflow performance. This includes working with actions marketplace, custom actions, matrix strategies, and deployment workflows. Invoke for GitHub Actions automation, continuous integration, or deployment pipeline tasks.
---
```

## Why Metadata Matters

**The description is the difference between:**
- A skill that's never invoked (poor description)
- A skill that's invoked at the right time (great description)

Claude reads skill descriptions to decide which skills to activate for each user query. A well-crafted description ensures your skill is discovered and used when needed.

**Time investment:**
- Spend 5-10 minutes crafting the description
- Test with multiple example queries
- Iterate based on invocation behavior
- Update as you learn what triggers work best

This is the most important part of skill creation - don't rush it!
