# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this package.

**Important:** Keep this file and the root `CLAUDE.md` up-to-date whenever functionality changes.

## Project Overview

Kata is a **spec-driven development framework** for Claude Code. It's a meta-prompting and context engineering system that helps Claude build software systematically through structured workflows: requirements gathering → research → planning → execution → verification.

**Core Architecture:**
- **Skills** (`skills/kata-*/SKILL.md`) — Primary interface for all Kata workflows, invoked via `/kata-skill-name`
- **Skill Resources** (`skills/kata-*/references/`) — Agent instructions inlined into subagent prompts at spawn time
- **Templates** (`kata/templates/`) — Structured output formats (PROJECT.md, PLAN.md, etc.)
- **References** (`kata/references/`) — Deep-dive documentation on concepts and patterns

**Directory-specific guidance:**
- Desktop app work under `app/` also follows `app/AGENTS.md`

**Key Design Principle:** Plans ARE prompts. PLAN.md files are executable XML documents optimized for Claude, not prose to be transformed.

## Development Commands

### Installation and Testing

Build and test the plugin locally:

```bash
# Build the plugin
npm run build:plugin

# Test from a separate project using --plugin-dir
cd /path/to/test-project
claude --plugin-dir /path/to/kata/dist/plugin

# Verify skills load
/kata-help
```

Alternative: manually copy to test project's plugin directory:

```bash
mkdir -p /path/to/test-project/.claude/plugins/kata
cp -r dist/plugin/* /path/to/test-project/.claude/plugins/kata/
```

After rebuilding, restart Claude Code to pick up changes.

### Testing

```bash
# Fast script tests (no Claude invocation, <5s)
npm run test:scripts

# Build and source validation
npm test

# Build artifact validation
npm run test:artifacts

# Full test suite including smoke tests
npm run test:all

# Only tests affected by current branch changes
npm run test:affected

# Coverage (core + app)
npm run test:coverage

# App-only unit tests
npm run test:app

# App-only coverage
npm run test:app:coverage
```

### Desktop App Testing (workspace: app)

```bash
# Run strict desktop quality gate (typecheck + tagged Wave 1 E2E subset)
npm run test:app:quality-gate

# Run only CI-tagged desktop E2E
npm run test:app:e2e:ci

# Run full Wave 1 desktop UAT E2E suite
npm run test:app:e2e

# Launch desktop app dev mode from root
npm run dev

# Run app tests directly from app/
cd app
npm run test:e2e:quality-gate
npm run test:e2e:ci
npm run test:e2e
```

### Using Kata for Kata Development

This project uses Kata to build Kata. Key files in `.planning/`:

```bash
# Check current state and progress
cat .planning/STATE.md

# View project vision and requirements
cat .planning/PROJECT.md
cat .planning/REQUIREMENTS.md

# See roadmap and phase breakdown
cat .planning/ROADMAP.md

# Current phase plans (phases live in active/, pending/, or completed/)
ls .planning/phases/active/
ls .planning/phases/pending/
```

**Common workflow when working on Kata:**
1. Check progress: "What's the status?" or `/kata-track-progress`
2. Plan phase: "Plan phase [N]" or `/kata-plan-phase [N]`
3. Execute: "Execute phase [N]" or `/kata-execute-phase [N]`
4. Verify: "Verify phase [N]" or `/kata-verify-work [N]`

## Architecture: Files Teach Claude

Every file in Kata serves dual purposes:
1. **Runtime functionality** — Loaded by Claude during execution
2. **Teaching material** — Shows Claude how to build software systematically

### Multi-Agent Orchestration

Skills are orchestrators that spawn general-purpose subagents with instructions inlined from their `references/` directories. Each subagent gets a fresh 200k context window. The orchestrator stays lean (~15% context) while subagents handle autonomous work.

## Skills Architecture

Skills are the primary interface for all Kata workflows. They respond to both natural language and explicit slash command invocation.

### Invocation Syntax

| Syntax             | Example              |
| ------------------ | -------------------- |
| `/kata-skill-name` | `/kata-plan-phase 1` |

**Key points:**
- **Natural language works:** "plan phase 2", "what's the status", "execute the phase"
- **Explicit invocation works:** Use the slash command syntax for precision
- **All skills are user-invocable:** Direct `/` menu access and natural language routing

### Available Skills

Skills are installed to `.claude/skills/` and invoked via `/kata-skill-name`.

| Skill                 | Invocation             | Purpose                                        |
| --------------------- | ---------------------- | ---------------------------------------------- |
| `kata-plan-phase`     | `/kata-plan-phase`     | Phase planning, task breakdown                 |
| `kata-execute-phase`  | `/kata-execute-phase`  | Plan execution, checkpoints                    |
| `kata-verify-work`    | `/kata-verify-work`    | Goal verification, UAT                         |
| `kata-new-project`    | `/kata-new-project`    | New project setup                              |
| `kata-add-milestone`  | `/kata-add-milestone`  | Add milestone, research, requirements, roadmap |
| `kata-research-phase` | `/kata-research-phase` | Domain research                                |
| `kata-track-progress` | `/kata-track-progress` | Progress, debug, mapping                       |

### Skill Naming Best Practices

**Skill names and descriptions are critical for autonomous invocation.** Claude matches skills based on name and description before falling back to default behaviors.

**Mandatory conventions:**
- **Use gerund (verb-ing) style names** — `kata-managing-todos` not `kata-todo-management`. The gerund form reads naturally: "Use this skill for managing todos"
- **Exhaustive trigger phrases in description** — List EVERY phrase a user might say that should trigger the skill. More triggers = better matching

**Key learnings:**
- **Be verbose and specific** — Generic names like "utility" or "verification" get lost. Use descriptive names like `kata-providing-progress-and-status-updates` or `kata-verify-work-outcomes-and-user-acceptance-testing`
- **Include key terms in the name** — If you want "UAT" to trigger a skill, put "uat" in the skill name itself
- **Avoid collision with built-in behaviors** — "test" triggers test suite, "build" triggers builds. Prefix with "kata" or use alternative vocabulary
- **Description triggers matter** — List explicit trigger phrases users might say: "check status", "what's the progress", "run uat"
- **Test natural language prompts** — Verify skills trigger correctly with phrases like "help me plan phase 2" not just explicit invocation

### Skill Structure

Each skill follows the pattern:

```
skills/kata-{name}/
├── SKILL.md         # Orchestrator workflow (<500 lines)
└── references/      # Progressive disclosure
    ├── {topic}.md
    └── ...
```

Skills ARE orchestrators. They spawn general-purpose subagents via Task tool, inlining instructions from their `references/` directory.

## Style Guide

@KATA-STYLE.md

## Working with Planning Files

When modifying `.planning/` files (PROJECT.md, ROADMAP.md, STATE.md):

1. **Always read STATE.md first** — Contains current position and accumulated decisions
2. **Respect the structure** — Templates in `kata/templates/` show expected format
3. **Update STATE.md** — When making decisions or completing work
4. **Commit planning changes** — Use `docs:` or `chore:` prefix

## PR Workflow

**NEVER commit directly to main.** When `pr_workflow: true`, follow the spec in:
@kata/references/planning-config.md.

## Common Gotchas

1. **Don't transform plans** — PLAN.md files are prompts, not documents to rewrite into different formats
2. **Don't inflate plans** — Split based on actual work, not arbitrary numbers
3. **Read before writing** — NEVER propose changes to code you haven't read
4. **Phase numbers** — Integer phases (0, 1, 2) are roadmap, decimal (0.1, 2.1) are urgent insertions
5. **Waves in plans** — Pre-computed dependency groups for parallel execution, don't recalculate
6. **STATE.md is source of truth** — For current position, decisions, blockers

## Making Changes to Kata

1. **Match existing patterns** — Study similar files before creating new ones
2. **Test locally** — Use `npm run build:plugin` and test with `claude --plugin-dir`
3. **Update KATA-STYLE.md** — If introducing new patterns or conventions
4. **Follow KATA-STYLE.md** — For all formatting, naming, and structural decisions
5. **When modifying skills** — Follow the /building-claude-code-skills methodology
6. **Keep SKILL.md under 500 lines** — Move details to `references/` subdirectory

## Release Details

**Version file:** `.claude-plugin/plugin.json`

**Pre-release tests:** `npm run build && npm test && npm run test:scripts && npm run test:smoke`

**CI pipeline:** `release.yml` triggers on push to main, detects version change, runs tests, builds, creates GitHub Release, and publishes to the marketplace and skills registry.

**Post-release verification:**
```bash
gh release view vX.Y.Z
gh api repos/gannonh/kata-marketplace/contents/.claude-plugin/marketplace.json --jq '.content' | base64 -d | jq -r '.plugins[0].version'
```

### Hotfixes (bypassing CI)

For urgent fixes that need to reach users immediately without a version bump, patch the downstream repos directly:

```bash
# Clone both downstream repos
gh repo clone gannonh/kata-marketplace /tmp/kata-marketplace -- --depth 1
gh repo clone gannonh/kata-skills /tmp/kata-skills -- --depth 1

# Copy fixed file(s) to both repos
# Marketplace path: plugins/kata/skills/...
# Skills path: skills/...
cp skills/kata-example/file.sh /tmp/kata-marketplace/plugins/kata/skills/kata-example/file.sh
cp skills/kata-example/file.sh /tmp/kata-skills/skills/kata-example/file.sh

# Commit and push each
cd /tmp/kata-marketplace && git add -A && git commit -m "fix: description" && git push
cd /tmp/kata-skills && git add -A && git commit -m "fix: description" && git push
```

**Downstream repo paths:**
- **Marketplace** (`gannonh/kata-marketplace`): `plugins/kata/` mirrors `dist/plugin/`
- **Skills** (`gannonh/kata-skills`): `skills/` mirrors `dist/skills-sh/skills/`

The next full release via CI will overwrite these repos from the built output, so the fix must also be in the source repo (`skills/`) to persist.

## Testing and UAT

- Create test projects in `../kata-burner/` using `../kata-burner/create-test-project.sh`
- Use `scripts/test-local.sh` to run local tests against the plugin
