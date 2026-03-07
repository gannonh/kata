# Converting Claude Code Slash Commands to Skills

This document provides detailed guidance on converting existing Claude Code slash commands to the Skills format.

## Essential Reading

Before starting any conversion, review these official documentation sources:

- **Slash Commands Overview**: https://code.claude.com/docs/en/slash-commands.md
- **Agent Skills Overview**: https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview.md
- **Best Practices**: https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices.md

Use WebFetch to access these URLs for the latest information.

## Understanding the Differences

### Slash Command Configuration

Slash commands are single Markdown files (in `~/.claude/commands/` or `.claude/commands/`) with YAML frontmatter:

```yaml
---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*)
argument-hint: [message]
description: Create a git commit
model: claude-3-5-haiku-20241022
---

Create a git commit with message: $ARGUMENTS
```

**Key characteristics:**
- Single `.md` file per command
- Invoked explicitly by user with `/command-name`
- Can restrict tools with `allowed-tools` field
- Can specify model with `model` field
- Can use bash execution with `!` prefix (e.g., `!git status`)
- Can reference files with `@` prefix (e.g., `@src/utils.js`)
- Can accept arguments via `$ARGUMENTS` or positional `$1`, `$2`, etc.
- Can fork into sub-agent context with `context: fork`
- Can define command-scoped hooks

### Skill Configuration

Skills are directories with a `SKILL.md` file:

```yaml
---
name: creating-git-commits
description: Use this skill when creating git commits, generating commit messages, staging changes, or preparing code for version control. This includes analyzing diffs, writing conventional commit messages, and handling staged/unstaged changes.
---

# Git Commit Expert

Help users create well-structured git commits...
```

**Key characteristics:**
- Directory structure with `SKILL.md` and optional supporting files
- Invoked automatically by Claude when relevant (no explicit command needed)
- Description must trigger invocation (keywords + use cases)
- No `allowed-tools` field (inherits all Claude Code capabilities)
- No `model` field (uses conversation model)
- No `argument-hint` (Claude determines what's needed from context)
- Uses explicit CLI instructions instead of `!` prefix bash execution
- Uses relative path references (`./file.md`) instead of `@` prefix
- Can have supporting files for progressive disclosure

## Key Transformation Steps

### 1. Name Transformation

**Slash Command Names** (file names, any format):
- `commit.md`
- `review-pr.md`
- `security-check.md`
- `fix-issue.md`

**Skill Names** (gerund form - verb + -ing):
- `creating-commits` (not `commit`)
- `reviewing-pull-requests` (not `review-pr`)
- `checking-security` (not `security-check`)
- `fixing-issues` (not `fix-issue`)

Verify:
- Lowercase only
- Hyphens for word separation
- Max 64 characters
- Gerund form preferred

### 2. Description Transformation (MOST CRITICAL)

Slash command descriptions explain WHAT the command does. Skill descriptions must explain WHEN to invoke.

**Transformation Formula:**
```
Slash Command: "Create a git commit"
Skill: "Use this skill when creating git commits, generating commit messages from diffs, staging changes, or preparing code for version control. This includes analyzing uncommitted changes, writing conventional commit messages, and handling both staged and unstaged modifications."
```

**Guidelines:**
- Write in third person
- Start with "Use this skill when..."
- Include specific trigger keywords users might say
- List concrete use cases
- Keep under 1024 characters
- Think: "What user queries should invoke this?"

### 3. Frontmatter Transformation

#### Fields to Remove

These slash command fields are NOT used in skills:

| Field | Why Remove |
|-------|------------|
| `allowed-tools` | Skills inherit all Claude Code capabilities |
| `argument-hint` | Claude determines needs from context |
| `model` | Skills use the conversation model |
| `context` | Skills don't fork into sub-agent context |
| `agent` | Skills don't specify agent type |
| `disable-model-invocation` | Use `user-invocable: false` in skills if needed |
| `hooks` | Define hooks in project settings if needed |

#### Fields to Transform

| Slash Command | Skill Equivalent |
|---------------|------------------|
| `description` (task-focused) | `description` (invocation-focused) |
| Filename (e.g., `commit.md`) | `name` field in gerund form |

### 4. Content Transformation

#### Bash Execution (`!` prefix)

**Before (Slash Command):**
```markdown
## Context

- Current git status: !`git status`
- Current git diff: !`git diff HEAD`
- Current branch: !`git branch --show-current`
```

**After (Skill):**
```markdown
## Gathering Context

Before creating a commit, gather context using these commands:

1. Check current status: `git status`
2. Review all changes: `git diff HEAD`
3. Identify current branch: `git branch --show-current`

Run these commands to understand what will be committed.
```

Skills don't have automatic bash execution. Instead, provide explicit CLI instructions that Claude will execute.

#### File References (`@` prefix)

**Before (Slash Command):**
```markdown
Review the implementation in @src/utils/helpers.js

Compare @src/old-version.js with @src/new-version.js
```

**After (Skill):**
```markdown
## Working with Files

When reviewing implementations, read the relevant source files directly.

For comparison tasks, read both files and analyze differences:
- Use `git diff file1 file2` for version-controlled files
- Read files sequentially for manual comparison
```

Skills use explicit instructions for file access, or reference supporting files within the skill directory using relative paths like `./reference-guide.md`.

#### Arguments (`$ARGUMENTS`, `$1`, `$2`) → Contextual Variables

Skills don't support `$ARGUMENTS` or positional placeholders like slash commands do. However, skills can still work with variables by providing guidance on:

1. **How to infer variables from context** (conversation, codebase, git state)
2. **When to ask the user** if the value isn't clear

This enables a more conversational, adaptive approach compared to the rigid input/output style of slash commands.

**Before (Slash Command):**
```markdown
---
argument-hint: [issue-number] [priority]
---

Fix issue #$1 with priority $2 following our coding standards
```

**After (Skill):**
```markdown
## Fixing Issues

When asked to fix an issue:

1. **Identify the Issue Number**
   - Extract from user's request (e.g., "close issue 5" → issue #5)
   - Check conversation context for recently mentioned issues
   - If unclear, ask: "Which issue number should I work on?"

2. **Determine Priority**
   - Infer from user's request (e.g., "urgent fix" → high priority)
   - Check issue labels if available (`gh issue view [number]`)
   - If not specified and not inferable, ask the user

3. **Follow Standards**: Apply coding standards from the project's style guide
```

**Key Principle:** Skills provide guidance for inferring workflow variables from context, making them more conversational and adaptive. When a user says "close issue 5", the skill helps Claude:
- Recognize "5" as the issue number
- Gather any additional context needed
- Ask clarifying questions only when truly necessary

This is more natural than requiring `/fix-issue 5 high` with explicit arguments.

### 5. Progressive Disclosure

Convert single-file commands to multi-file skill structures when beneficial:

**Before (Long Slash Command):**
```markdown
---
description: Comprehensive code review
---

# Code Review

[200+ lines of review criteria, checklists, examples...]
```

**After (Skill with Progressive Disclosure):**
```
reviewing-code/
├── SKILL.md (core workflow, <100 lines)
├── security-checklist.md (security review criteria)
├── performance-patterns.md (performance anti-patterns)
└── style-guide-reference.md (style conventions)
```

SKILL.md references supporting files:
```markdown
## Review Approach

1. **Security Review**: Check for vulnerabilities (see `./security-checklist.md`)
2. **Performance Check**: Identify bottlenecks (see `./performance-patterns.md`)
3. **Style Compliance**: Verify conventions (see `./style-guide-reference.md`)
```

## Conversion Examples

### Example 1: Git Commit Command → Skill

**Original Slash Command:** `~/.claude/commands/commit.md`

```markdown
---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*)
argument-hint: [message]
description: Create a git commit
model: claude-3-5-haiku-20241022
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

Based on the above changes, create a single git commit with message: $ARGUMENTS

If no message provided, generate an appropriate conventional commit message.
```

**Converted Skill:** `~/.claude/skills/creating-git-commits/SKILL.md`

```markdown
---
name: creating-git-commits
description: Use this skill when creating git commits, generating commit messages, staging changes, or preparing code for version control. This includes analyzing diffs, writing conventional commit messages, and handling staged/unstaged changes.
---

# Git Commit Expert

Help users create well-structured git commits following conventional commit standards.

## Workflow

1. **Gather Context**
   - Run `git status` to see all changes
   - Run `git diff HEAD` to review staged and unstaged changes
   - Run `git branch --show-current` to identify the branch
   - Run `git log --oneline -10` to see recent commit style

2. **Analyze Changes**
   - Understand what was modified
   - Identify the type of change (feat, fix, refactor, docs, etc.)
   - Note affected components or modules

3. **Create Commit**
   - Stage relevant changes with `git add`
   - Write a conventional commit message:
     - Format: `type(scope): description`
     - Keep subject line under 72 characters
     - Use imperative mood ("Add feature" not "Added feature")
   - Execute `git commit -m "message"`

## Conventional Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting, whitespace
- `refactor`: Code restructuring without behavior change
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

## Example Commit Messages

```
feat(auth): add JWT token refresh mechanism
fix(api): handle null response in user endpoint
docs(readme): update installation instructions
refactor(utils): extract date formatting helpers
```

## CLI Commands Reference

- `git status` - View working tree status
- `git diff HEAD` - Show all uncommitted changes
- `git add .` - Stage all changes
- `git add -p` - Interactive staging
- `git commit -m "message"` - Create commit
- `git log --oneline -5` - View recent commits
```

**Key Changes:**
1. Name: `commit.md` → `creating-git-commits` (gerund form)
2. Description: Expanded with trigger keywords and use cases
3. Removed: `allowed-tools`, `argument-hint`, `model` fields
4. Converted: `!` bash execution → explicit CLI instructions
5. Converted: `$ARGUMENTS` → context-based workflow
6. Enhanced: Added examples and reference section

### Example 2: PR Review Command → Skill

**Original Slash Command:** `~/.claude/commands/review-pr.md`

```markdown
---
argument-hint: [pr-number]
description: Review a pull request
context: fork
agent: general-purpose
---

Review PR #$1 focusing on:
- Code quality and readability
- Security vulnerabilities
- Performance implications
- Test coverage

Provide actionable feedback organized by severity.
```

**Converted Skill:** `~/.claude/skills/reviewing-pull-requests/SKILL.md`

```markdown
---
name: reviewing-pull-requests
description: Use this skill when reviewing pull requests, analyzing PR diffs, checking code changes for issues, or providing feedback on proposed changes. This includes examining PR descriptions, reviewing modified files, checking test coverage, and suggesting improvements.
---

# Pull Request Review Expert

Provide thorough, actionable code reviews for pull requests.

## Review Workflow

1. **Understand the PR**
   - Run `gh pr view [number]` to see PR description
   - Run `gh pr diff [number]` to view all changes
   - Identify the purpose and scope of changes

2. **Code Quality Review**
   - Check code readability and maintainability
   - Look for code duplication
   - Verify naming conventions
   - Assess code organization

3. **Security Assessment**
   - Check for potential vulnerabilities
   - Review authentication/authorization changes
   - Look for exposed secrets or credentials
   - Verify input validation

4. **Performance Analysis**
   - Identify potential bottlenecks
   - Check for N+1 queries or inefficient loops
   - Review resource usage patterns

5. **Test Coverage**
   - Verify tests exist for new functionality
   - Check edge case coverage
   - Ensure tests are meaningful

## CLI Tools

```bash
# View PR details
gh pr view 123

# View PR diff
gh pr diff 123

# List PR files changed
gh pr diff 123 --name-only

# Check PR status
gh pr checks 123
```

## Feedback Format

**Critical Issues** (must fix before merge):
- Issue description with file:line reference
- Suggested fix or approach

**Warnings** (should address):
- Issue description
- Why it matters

**Suggestions** (nice to have):
- Improvement opportunity
- Optional enhancement

See `./code-review-checklist.md` for comprehensive review criteria.
```

**Key Changes:**
1. Name: `review-pr.md` → `reviewing-pull-requests` (gerund, more descriptive)
2. Description: Added trigger keywords for PR-related queries
3. Removed: `argument-hint`, `context`, `agent` fields
4. Converted: `$1` parameter → context-based workflow
5. Enhanced: Added CLI commands section
6. Added: Reference to supporting file for detailed checklist

### Example 3: Security Check Command → Skill

**Original Slash Command:** `~/.claude/commands/security-check.md`

```markdown
---
allowed-tools: Read, Grep, Glob
description: Run security checks on codebase
---

Scan the codebase for security vulnerabilities:

1. Check @package.json for vulnerable dependencies
2. Look for hardcoded secrets: !`grep -r "api_key\|secret\|password" --include="*.js" --include="*.ts" .`
3. Review authentication patterns
4. Check for SQL injection risks
5. Verify input validation

Report findings with severity levels.
```

**Converted Skill:** `~/.claude/skills/checking-security/`

**SKILL.md:**
```markdown
---
name: checking-security
description: Use this skill when auditing code for security vulnerabilities, checking for exposed secrets, reviewing authentication patterns, or assessing application security. This includes scanning for hardcoded credentials, SQL injection risks, XSS vulnerabilities, and insecure dependencies.
---

# Security Audit Expert

Conduct thorough security assessments of codebases.

## Security Audit Workflow

1. **Dependency Audit**
   - Review `package.json` for known vulnerabilities
   - Run `npm audit` or `yarn audit` if available
   - Check for outdated packages with known CVEs

2. **Secret Detection**
   - Search for hardcoded credentials:
     ```bash
     grep -r "api_key\|secret\|password\|token" --include="*.js" --include="*.ts" --include="*.py" .
     ```
   - Check for exposed API keys or tokens
   - Review `.env` file handling

3. **Injection Vulnerabilities**
   - SQL injection: Look for string concatenation in queries
   - Command injection: Check subprocess/exec calls
   - XSS: Review output encoding

4. **Authentication Review**
   - Verify password hashing (bcrypt, argon2)
   - Check session management
   - Review token handling

5. **Input Validation**
   - Check form validation
   - Review API input sanitization
   - Verify file upload restrictions

## Severity Levels

- **Critical**: Immediate exploitation risk, data breach potential
- **High**: Significant vulnerability, should fix before deployment
- **Medium**: Security weakness, plan to address
- **Low**: Minor issue, best practice improvement

See `./owasp-top-10-checklist.md` for comprehensive vulnerability categories.
See `./secure-coding-patterns.md` for recommended fixes.
```

**owasp-top-10-checklist.md:**
```markdown
# OWASP Top 10 Checklist

## A01: Broken Access Control
- [ ] Verify authorization on all endpoints
- [ ] Check for IDOR vulnerabilities
- [ ] Review CORS configuration

## A02: Cryptographic Failures
- [ ] Use strong encryption algorithms
- [ ] Protect data in transit (HTTPS)
- [ ] Secure password storage

## A03: Injection
- [ ] Parameterized queries for SQL
- [ ] Input validation and sanitization
- [ ] Command injection prevention

[... additional categories ...]
```

**Key Changes:**
1. Name: `security-check.md` → `checking-security` (gerund form)
2. Description: Comprehensive with security-related trigger keywords
3. Removed: `allowed-tools` field
4. Converted: `@package.json` reference → explicit file reading instruction
5. Converted: `!grep...` → explicit grep command in code block
6. Enhanced: Multi-file structure with supporting checklists
7. Added: Severity levels and detailed workflow

## Conversion Checklist

Use this checklist when converting any slash command to a skill:

- [ ] Read the slash command file completely
- [ ] Review official documentation (URLs at top of this file)
- [ ] Identify the command's core purpose and workflow
- [ ] Choose gerund-form skill name (e.g., `creating-commits`, not `commit`)
- [ ] Write new description with invocation triggers in third person
- [ ] Remove `allowed-tools`, `argument-hint`, `model`, `context`, `agent` fields
- [ ] Convert `!` bash execution to explicit CLI instructions
- [ ] Convert `@file` references to relative paths or explicit read instructions
- [ ] Convert `$ARGUMENTS`/`$1`/`$2` to context-based workflow
- [ ] Add CLI commands reference section
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
   - Only `name` and `description` fields
   - No `allowed-tools`, `model`, or other slash command fields
   - Description under 1024 characters
   - Name in gerund form, max 64 characters

3. **Invocation Testing**
   - Ask Claude queries that should trigger the skill
   - Verify skill is invoked appropriately
   - Check that CLI instructions are followed
   - Confirm workflow executes correctly

4. **Content Comparison**
   - Did we preserve the command's core functionality?
   - Are CLI commands documented explicitly?
   - Is the workflow clear without bash auto-execution?

## Common Issues and Solutions

### Issue: Skill Not Being Invoked

**Symptoms:** User query should trigger skill, but doesn't

**Causes:**
- Description doesn't contain trigger keywords matching query
- Description still uses task-focused language from command
- Name not descriptive enough

**Solutions:**
- Add more trigger keywords to description
- Include concrete use cases in description
- Ensure third person voice
- Test with various query phrasings

### Issue: Bash Commands Not Executing

**Symptoms:** Commands from `!` prefix not running

**Solutions:**
- Skills don't auto-execute bash. Convert `!command` to explicit instructions
- Provide complete, runnable commands in code blocks
- Add context explaining when to run each command

### Issue: Missing File Context

**Symptoms:** `@file` references not working

**Solutions:**
- Skills don't support `@` file references
- For skill-internal files, use relative paths like `./reference.md`
- For project files, provide explicit instructions to read files

### Issue: Handling Workflow Variables Without Arguments

**Symptoms:** Need to handle values that were previously passed via `$ARGUMENTS`, `$1`, `$2`

**Solutions:**
- Skills don't support argument placeholders, but can guide variable inference
- Provide instructions for extracting variables from user requests (e.g., "close issue 5" → issue #5)
- Include guidance on checking conversation context for recently mentioned values
- Add fallback: "If [variable] is unclear, ask the user"
- This conversational approach is more adaptive than rigid argument passing

### Issue: SKILL.md Too Long

**Symptoms:** Over 500 lines

**Solutions:**
- Move detailed checklists to separate file (e.g., `./checklist.md`)
- Extract examples to `./examples.md`
- Move reference content to `./reference.md`
- Keep only core workflow in SKILL.md
- Reference files with `./filename.md` relative paths

## When NOT to Convert

Some slash commands work better as commands than skills:

1. **Commands requiring explicit invocation**: If you want control over when something runs, keep it as a command

2. **Commands with complex argument handling**: Commands using multiple positional arguments (`$1`, `$2`, `$3`) may be clearer as explicit commands

3. **One-off utilities**: Simple, rarely-used utilities may not benefit from automatic invocation

4. **Commands that fork context**: Commands using `context: fork` for sub-agent isolation may work better as commands

**Consider keeping as command if:**
- You want explicit `/command` invocation
- The command needs specific argument structure
- The workflow benefits from isolated context
- It's a rarely-used utility

**Convert to skill if:**
- Claude should discover the capability automatically
- Multiple user queries should trigger the same workflow
- The capability benefits from supporting files
- You want reusable, context-aware behavior

## Migration Strategy

For projects with many slash commands:

1. **Inventory Commands**
   - List all commands in `.claude/commands/` and `~/.claude/commands/`
   - Categorize by frequency of use and complexity

2. **Prioritize Conversion**
   - Start with frequently-used commands
   - Convert commands that would benefit from automatic discovery
   - Keep rarely-used or argument-heavy commands as-is

3. **Convert Incrementally**
   - Convert one command at a time
   - Test each skill before converting the next
   - Keep old commands until skills are validated

4. **Document the Change**
   - Update team documentation
   - Note which commands became skills
   - Explain new invocation patterns

## Best Practices Summary

1. **Start with documentation** - Review official docs before converting
2. **Description is critical** - Spend time on invocation triggers
3. **Preserve core workflow** - Don't lose the command's functionality
4. **Convert `!` to explicit CLI** - Document commands clearly
5. **Use gerund names** - `creating-commits`, not `commit`
6. **Remove command fields** - No `allowed-tools`, `model`, etc.
7. **Add CLI reference** - Document all commands explicitly
8. **Intention-revealing names** - For all supporting files
9. **Progressive disclosure** - SKILL.md < 500 lines, details elsewhere
10. **Test thoroughly** - Verify invocation and functionality
