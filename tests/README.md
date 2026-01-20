# Kata Test Harness

CLI-based testing framework that programmatically invokes Claude Code to verify skills work correctly.

## Quick Start

```bash
# Run all tests
npm test

# Run only skill tests
npm run test:skills
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

## Troubleshooting

**Tests timeout:** Increase `timeout` option in `invokeClaude()` call.

**Tests fail with permission errors:** Ensure `allowedTools` includes all tools the skill needs.

**Skill not found:** Verify skill is copied to `testDir/.claude/skills/` in `beforeEach`.

**State pollution between tests:** Each test should use fresh `mkdtempSync` directory.
