import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertResultContains
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-checking-todos', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-checking-todos-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Ensure todos directories exist
    mkdirSync(join(testDir, '.planning', 'todos', 'pending'), { recursive: true });
    mkdirSync(join(testDir, '.planning', 'todos', 'done'), { recursive: true });

    // Create a sample todo file for testing
    const sampleTodo = `---
created: 2026-01-25T10:00
title: Fix login validation bug
area: auth
files:
  - src/auth/login.ts:42
---

## Problem

The login form accepts empty passwords, which bypasses validation.

## Solution

Add password length check in validateCredentials().
`;
    writeFileSync(
      join(testDir, '.planning', 'todos', 'pending', '2026-01-25-fix-login-validation-bug.md'),
      sampleTodo
    );

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-checking-todos');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-checking-todos');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "check my todos" prompt', async () => {
    const result = invokeClaude('check my todos', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected kata-checking-todos skill to be invoked');
  });

  it('lists existing todos', async () => {
    const result = invokeClaude('what are my pending todos', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Verify the result mentions todo-related content
    assertResultContains(
      result,
      /todo|login|validation|pending/i,
      'Expected result to mention todo content'
    );
  });
});
