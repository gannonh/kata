import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertFileMatchesPattern,
  assertResultContains
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-executing-phases', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-executing-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-executing-phases');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-executing-phases');
    cpSync(skillSource, skillDest, { recursive: true });

    // Install required agents (spawned by skill)
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });
    const agents = ['kata-executor.md', 'kata-verifier.md'];
    for (const agent of agents) {
      const agentSource = join(KATA_ROOT, 'agents', agent);
      if (existsSync(agentSource)) {
        cpSync(agentSource, join(testDir, '.claude', 'agents', agent));
      }
    }

    // Set up ROADMAP.md with Phase 1
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = `# Roadmap: Test Fixture

## Overview

Test project for Kata skill testing.

## Phases

### Phase 01: Test Phase
**Goal:** Create a simple test file
**Success criteria:**
- test.txt file exists

## Progress

1 phase planned.
`;
    writeFileSync(roadmapPath, roadmapContent);

    // Create phase directory
    const phaseDir = join(testDir, '.planning', 'phases', '01-test-phase');
    mkdirSync(phaseDir, { recursive: true });

    // Create a simple PLAN.md file with a task (create a file)
    const planPath = join(phaseDir, '01-01-PLAN.md');
    const planContent = `---
phase: 01-test-phase
plan: 01
type: execute
wave: 1
autonomous: true
files_modified:
  - test.txt
---

<objective>
Create a simple test file for verification.

Purpose: Verify that the execution workflow works correctly.

Output: test.txt file with "Hello, World!" content.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Create test file</name>
  <files>test.txt</files>
  <action>Create a file named test.txt with the content "Hello, World!"</action>
  <verify>Check that test.txt exists and contains "Hello, World!"</verify>
  <done>test.txt exists with correct content</done>
</task>

</tasks>

<verification>
\`\`\`bash
cat test.txt
\`\`\`
Should output: Hello, World!
</verification>

<success_criteria>
- test.txt file created with "Hello, World!" content
</success_criteria>
`;
    writeFileSync(planPath, planContent);

    // Update STATE.md to reference Phase 1
    const statePath = join(testDir, '.planning', 'STATE.md');
    const stateContent = `# Project State

## Project Reference

**Core value:** Test project for Kata skill verification
**Current focus:** Test Phase 1

## Current Position

Milestone: Test
Phase: 1 (Test Phase)
Plan: 01 of 1
Status: Ready for execution

## Accumulated Context

### Decisions

None.

### Pending Todos

0 pending todos.

### Blockers/Concerns

None.
`;
    writeFileSync(statePath, stateContent);

    // Initialize git repo for commit tests
    const { execSync } = require('node:child_process');
    try {
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });
      execSync('git add -A && git commit -m "Initial commit"', { cwd: testDir, stdio: 'pipe' });
    } catch (e) {
      // Git might not be available or already initialized
    }
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "execute phase 1"', { timeout: config.timeouts.expensive }, () => {
    const result = invokeClaude('execute phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.expensive,
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected skill to be invoked for "execute phase 1"');
  });

  it('creates SUMMARY.md after execution', { timeout: config.timeouts.expensive }, () => {
    const result = invokeClaude('execute phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.expensive,
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Verify SUMMARY.md was created in the phase directory
    const phaseDir = join(testDir, '.planning', 'phases', '01-test-phase');
    assertFileMatchesPattern(
      phaseDir,
      /SUMMARY\.md$/,
      'Expected SUMMARY.md file to be created after execution'
    );
  });

  it('creates the artifact specified in the plan', { timeout: config.timeouts.expensive }, () => {
    const result = invokeClaude('execute phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.expensive,
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Verify the task's artifact was created
    const testFilePath = join(testDir, 'test.txt');
    if (!existsSync(testFilePath)) {
      throw new Error('Expected test.txt to be created by execution');
    }
  });
});
