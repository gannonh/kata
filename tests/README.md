# Kata Test Harness

CLI-based testing framework that programmatically invokes Claude Code to verify skills work correctly.

## Quick Start

```bash
# Run all tests
npm test

# Run only skill tests
npm run test:skills

# Run a specific skill test
npm run test:skill -- tests/skills/tracking-progress.test.js

# Run only tests for changed skills (CI mode)
npm run test:affected
```

Tests take 60-90 seconds because they actually invoke Claude Code via subprocess.

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Test File      │────▶│  invokeClaude()  │────▶│  claude -p      │
│  (.test.js)     │     │  (subprocess)    │     │  (JSON output)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                                                │
        │                                                ▼
        │                                        ┌─────────────────┐
        │◀───────────────────────────────────────│  JSON response  │
        │                                        │  {result, ...}  │
        ▼                                        └─────────────────┘
┌─────────────────┐
│  Assertions     │
│  (num_turns,    │
│   artifacts)    │
└─────────────────┘
```

1. **Test creates isolated environment** — Copies `fixtures/kata-project/` to temp directory
2. **Test installs skill** — Copies skill to temp project's `.claude/skills/`
3. **Test invokes Claude** — Runs `claude -p "prompt" --output-format json`
4. **Test asserts results** — Checks `num_turns > 1` (skill ran) and artifacts created
5. **Test cleans up** — Removes temp directory

## Directory Structure

```
tests/
├── README.md           # This file
├── harness/
│   ├── claude-cli.js   # invokeClaude() wrapper
│   ├── assertions.js   # Custom assertions
│   └── runner.js       # Configuration constants
├── fixtures/
│   └── kata-project/   # Minimal Kata project for test isolation
│       ├── .planning/
│       │   ├── STATE.md
│       │   ├── ROADMAP.md
│       │   └── todos/pending/.gitkeep
│       ├── .claude/skills/.gitkeep
│       └── CLAUDE.md
└── skills/
    └── kata-managing-todos.test.js  # Example skill test
```

## Writing a Skill Test

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import { assertSkillInvoked, assertNoError } from '../harness/assertions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('my-skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'my-skill');
    const skillDest = join(testDir, '.claude', 'skills', 'my-skill');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('triggers on natural language prompt', () => {
    const result = invokeClaude('do the thing my skill does', {
      cwd: testDir,
      maxBudget: 2.00,
      timeout: 180000
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });
});
```

## API Reference

### `invokeClaude(prompt, options)`

Invokes Claude Code CLI and returns parsed JSON response.

```javascript
const result = invokeClaude('check my todos', {
  cwd: '/path/to/test/project',  // Required - working directory
  allowedTools: 'Read,Bash,Glob,Write',  // Default tools
  maxBudget: 1.00,  // Max cost in USD (default: $1.00)
  timeout: 120000   // Timeout in ms (default: 2 min)
});

// result = { result: "...", num_turns: 3, is_error: false, ... }
```

### Assertions

| Function | Purpose |
|----------|---------|
| `assertSkillInvoked(result)` | Verify `num_turns > 1` (skill executed, not just ad-hoc answer) |
| `assertNoError(result)` | Verify `is_error === false` |
| `assertArtifactExists(basePath, relativePath)` | Verify file/directory was created |
| `assertFileMatchesPattern(dirPath, pattern)` | Verify file matching regex exists |
| `assertResultContains(result, text)` | Verify response contains expected text |
| `assertNextStepProposed(result, command)` | Verify "Next Up" section contains expected `/kata:` command |
| `assertFileStructure(basePath, paths)` | Verify all expected relative paths exist |

### Configuration (runner.js)

```javascript
import { config } from '../harness/runner.js';

// config.budgets.quick = 0.50      // Simple trigger tests
// config.budgets.standard = 2.00   // Full workflow tests
// config.budgets.expensive = 5.00  // Complex multi-turn tests

// config.timeouts.quick = 60000    // 1 min
// config.timeouts.standard = 180000 // 3 min
// config.timeouts.expensive = 300000 // 5 min
```

## Why num_turns > 1?

When Claude receives a prompt:
- **Direct answer** (no skill): 1 turn — Claude responds immediately
- **Skill invocation**: 2+ turns — Claude loads skill, executes workflow, uses tools

Checking `num_turns > 1` confirms a skill actually ran rather than Claude giving an ad-hoc response.

## Cost & Time

Each test invokes Claude Code, which costs money and takes time:

| Test Type | Budget | Timeout | Use Case |
|-----------|--------|---------|----------|
| Quick | $0.50 | 1 min | Simple skill trigger |
| Standard | $2.00 | 3 min | Full workflow |
| Expensive | $5.00 | 5 min | Complex multi-turn |

Run tests sparingly during development. Use `npm run test:skills` to run only skill tests.

## Affected Test Detection

Run only tests for skills changed in your branch — essential for CI cost control.

### How It Works

```javascript
import { getAffectedSkills, getAffectedTestFiles } from '../harness/affected.js';

// Get skills affected by git changes
const skills = getAffectedSkills('origin/main');
// → ['kata-tracking-progress', 'kata-adding-phases']

// Get test files for affected skills
const testFiles = getAffectedTestFiles('origin/main');
// → ['tests/skills/tracking-progress.test.js', 'tests/skills/adding-phases.test.js']
```

### What Triggers Affected Detection

| Change | Detection |
|--------|-----------|
| `skills/kata-{name}/` | Direct skill change → that skill affected |
| `agents/kata-{agent}.md` | Agent change → all skills spawning that agent affected |

### Agent-to-Skill Mapping

When an agent file changes, the harness scans all SKILL.md files to find which skills spawn that agent:

```javascript
import { getSkillsUsingAgent } from '../harness/affected.js';

// Find skills that spawn kata-executor
const skills = getSkillsUsingAgent('kata-executor');
// → ['kata-executing-phases']
```

The mapping is cached for efficiency within a test run.

## CI Integration

### GitHub Workflow

The CI workflow (`.github/workflows/test-skills.yml`) uses affected test detection to minimize costs:

```
┌─────────────┐     ┌───────────────────┐     ┌─────────────────┐
│   PR Push   │────▶│  detect-changes   │────▶│  test-affected  │
│             │     │  (find changed    │     │  (run tests for │
│             │     │   skills)         │     │   those skills) │
└─────────────┘     └───────────────────┘     └─────────────────┘

┌─────────────┐     ┌───────────────────┐     ┌─────────────────┐
│ Push to     │────▶│  detect-changes   │────▶│   test-full     │
│   main      │     │  (run_full=true)  │     │  (all tests)    │
└─────────────┘     └───────────────────┘     └─────────────────┘
```

**Workflow jobs:**

| Job | Trigger | What it does |
|-----|---------|--------------|
| `detect-changes` | Always | Identifies affected skills using `affected.js` |
| `test-affected` | PR has affected tests | Runs only tests for changed skills |
| `test-full` | Push to main | Runs full test suite |

Test results appear as **PR annotations** via `mikepenz/action-junit-report`.

### Cost Control

Each test invokes Claude Code, which costs money. The CI workflow controls costs by:

1. **PRs run only affected tests** — Changes to `skills/kata-foo/` only run `foo.test.js`
2. **Agent changes cascade** — Changes to `agents/kata-bar.md` trigger tests for all skills using that agent
3. **Full suite on main only** — Complete test suite runs only on merge to main

To run affected tests locally:

```bash
npm run test:affected
```

### Budget Tiers

Tests use tiered budgets from `harness/runner.js`:

| Tier | Budget | Use Case |
|------|--------|----------|
| `quick` | $0.50 | Simple skill trigger verification |
| `standard` | $2.00 | Full workflow execution |
| `expensive` | $5.00 | Multi-agent orchestrator tests |

Choose the appropriate tier based on what your test needs to verify.

### Required Secrets

| Secret | Purpose | How to Set |
|--------|---------|------------|
| `ANTHROPIC_API_KEY` | Claude API access for test execution | Repository Settings > Secrets > Actions |

**Missing API key symptoms:**
- Tests fail with "Error: API key not found"
- `invokeClaude()` returns error object

### Troubleshooting CI

**Tests pass locally but fail in CI:**
- Check `ANTHROPIC_API_KEY` secret is set
- Verify test files are in `tests/skills/` directory
- Check workflow logs for timeout issues

**No tests run on PR:**
- Affected detection found no matching tests
- Verify test file naming: `{skill-name-without-kata-prefix}.test.js`
- Check git diff includes skill or agent files

**Workflow logs location:**
- GitHub repo > Actions tab > Select workflow run > Select job > View logs

**Manual workflow trigger:**
- Not supported — workflow runs automatically on PR/push

## Writing Skill Tests

### Test Structural Outputs, Not Prose

Skills produce deterministic artifacts. Test those, not conversational text:

```javascript
// Good: Test artifact creation
assertArtifactExists(testDir, '.planning/phases/01-auth/01-01-PLAN.md');
assertFileStructure(testDir, [
  '.planning/STATE.md',
  '.planning/ROADMAP.md',
  '.planning/phases/01-auth/'
]);

// Good: Test "Next Up" proposal
assertNextStepProposed(result, '/kata:execute-phase');

// Avoid: Testing exact prose (brittle)
assert(result.result.includes('I have created the plan'));
```

### `assertNextStepProposed` Example

Kata skills end with a "Next Up" section proposing the next command:

```javascript
import { assertNextStepProposed } from '../harness/assertions.js';

const result = invokeClaude('plan phase 1', { cwd: testDir });

// Verify skill proposed execute-phase as next step
assertNextStepProposed(result, '/kata:execute-phase');
```

### Test Isolation Best Practices

1. **Fresh temp directory per test** — Use `mkdtempSync` in `beforeEach`
2. **Copy fixtures, don't mutate** — `cpSync(FIXTURES_DIR, testDir)`
3. **Install only needed skills** — Copy specific skill to `testDir/.claude/skills/`
4. **Clean up on success** — `rmSync(testDir)` in `afterEach`

## Integration Testing Patterns

### Testing Orchestrator Skills

Orchestrator skills spawn agents (e.g., `kata-planning-phases` spawns `kata-planner`). Test these by:

1. **Setting up fixtures** with pre-populated `.planning/` structures
2. **Invoking the skill** and letting it spawn agents
3. **Asserting artifacts** created by the spawned agents

```javascript
describe('kata-planning-phases (orchestrator)', () => {
  let testDir;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));

    // Copy fixture with roadmap and state
    cpSync(join(FIXTURES_DIR, 'multi-phase-project'), testDir, { recursive: true });

    // Install orchestrator skill AND agents it spawns
    cpSync(join(KATA_ROOT, 'skills/kata-planning-phases'),
           join(testDir, '.claude/skills/kata-planning-phases'),
           { recursive: true });
    cpSync(join(KATA_ROOT, 'agents/kata-planner.md'),
           join(testDir, '.claude/agents/kata-planner.md'));
    cpSync(join(KATA_ROOT, 'agents/kata-plan-checker.md'),
           join(testDir, '.claude/agents/kata-plan-checker.md'));
  });

  it('creates plan files when planning phase 1', () => {
    const result = invokeClaude('plan phase 1', {
      cwd: testDir,
      maxBudget: 5.00,  // Orchestrators need higher budget
      timeout: 300000   // 5 min for multi-agent flows
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Verify agent output: planner creates PLAN.md files
    assertFileMatchesPattern(
      join(testDir, '.planning/phases/01-auth'),
      /01-\d+-PLAN\.md$/
    );

    // Verify orchestrator proposed next step
    assertNextStepProposed(result, '/kata:execute-phase');
  });
});
```

### Fixture Hierarchy

Create fixtures at different complexity levels:

```
tests/fixtures/
├── kata-project/           # Base: minimal STATE.md, ROADMAP.md
├── multi-phase-project/    # Extended: populated roadmap with phases
├── mid-execution/          # Partial: some plans complete, some pending
└── agent-fixtures/
    ├── planner-input/      # Isolated agent test fixtures
    └── verifier-input/
```

**Base fixtures** for simple skill tests:

```
fixtures/kata-project/
├── .planning/
│   ├── STATE.md
│   ├── ROADMAP.md
│   └── todos/pending/.gitkeep
├── .claude/skills/.gitkeep
└── CLAUDE.md
```

**Phase fixtures** for orchestrator tests:

```
fixtures/multi-phase-project/
├── .planning/
│   ├── STATE.md
│   ├── ROADMAP.md
│   ├── PROJECT.md
│   ├── REQUIREMENTS.md
│   └── phases/
│       └── 01-auth/
│           └── 01-CONTEXT.md
├── .claude/
│   ├── skills/.gitkeep
│   └── agents/.gitkeep
└── CLAUDE.md
```

### Verifying Agent Spawning

To confirm an orchestrator spawned the expected agent without mocking:

1. **Check output patterns** — Agents produce characteristic output
2. **Check artifacts** — Agents create specific files
3. **Check turn count** — Multi-agent flows have many turns

```javascript
it('spawns planner agent (verified by output)', () => {
  const result = invokeClaude('plan phase 1', { cwd: testDir, maxBudget: 5.00 });

  // Planner agent produces PLAN.md files
  assertFileMatchesPattern(
    join(testDir, '.planning/phases/01-auth'),
    /PLAN\.md$/
  );

  // Orchestrator mentions agent activity in output
  assertResultContains(result, /Spawning planner|PLANNING PHASE/i);

  // Multi-agent flow: expect many turns
  assert.ok(result.num_turns > 5, 'Expected multi-agent flow to have 5+ turns');
});
```

### Simple vs Workflow Skills

| Skill Type | Test Approach |
|------------|---------------|
| **Simple** (no agents) | Invoke, assert output contains expected text/pattern |
| **Workflow** (spawns agents) | Set up fixtures, invoke, assert artifacts created |

**Simple skill test:**

```javascript
it('provides help text', () => {
  const result = invokeClaude('/kata:providing-help', { cwd: testDir });
  assertNoError(result);
  assertResultContains(result, '/kata:');  // Lists available commands
});
```

**Workflow skill test:**

```javascript
it('executes phase plans', () => {
  // Fixture has completed plans ready for execution
  cpSync(join(FIXTURES_DIR, 'ready-to-execute'), testDir, { recursive: true });

  const result = invokeClaude('execute phase 1', {
    cwd: testDir,
    maxBudget: 10.00,
    timeout: 600000
  });

  assertNoError(result);

  // Verify executor agent ran: SUMMARY.md files created
  assertFileMatchesPattern(
    join(testDir, '.planning/phases/01-auth'),
    /SUMMARY\.md$/
  );
});
```

## Troubleshooting

**Tests timeout:** Increase `timeout` option in `invokeClaude()` call.

**Tests fail with permission errors:** Ensure `allowedTools` includes all tools the skill needs.

**Skill not found:** Verify skill is copied to `testDir/.claude/skills/` in `beforeEach`.

**State pollution between tests:** Each test should use fresh `mkdtempSync` directory.

**Orchestrator tests fail:** Ensure agents are copied to `.claude/agents/` alongside skills.
