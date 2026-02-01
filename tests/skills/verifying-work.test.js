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

describe('kata-verify-work', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-verifying-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-verify-work');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-verify-work');
    cpSync(skillSource, skillDest, { recursive: true });

    // Install required agents
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });
    const agents = ['kata-verifier.md', 'kata-debugger.md', 'kata-planner.md', 'kata-plan-checker.md'];
    for (const agent of agents) {
      const agentSource = join(KATA_ROOT, 'agents', agent);
      if (existsSync(agentSource)) {
        cpSync(agentSource, join(testDir, '.claude', 'agents', agent));
      }
    }

    // Set up ROADMAP.md with Phase 1 and success criteria
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = `# Roadmap: Test Fixture

## Overview

Test project for Kata skill testing.

## Phases

### Phase 01: Test Phase
**Goal:** Create a test file
**Success criteria:**
- test.txt file exists
- test.txt contains expected content

## Progress

Phase 1 completed.
`;
    writeFileSync(roadmapPath, roadmapContent);

    // Create phase directory with completed SUMMARY.md
    const phaseDir = join(testDir, '.planning', 'phases', '01-test-phase');
    mkdirSync(phaseDir, { recursive: true });

    // Create a SUMMARY.md indicating completion
    const summaryPath = join(phaseDir, '01-01-SUMMARY.md');
    const summaryContent = `---
phase: 01-test-phase
plan: 01
completed: 2026-01-25
---

# Phase 01 Plan 01 Summary

## One-liner
Created test.txt file with expected content

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Create test file | abc123 | test.txt |

## Deliverables

- test.txt created with "Hello, World!" content

## Deviations from Plan

None - plan executed exactly as written.
`;
    writeFileSync(summaryPath, summaryContent);

    // Create the actual artifact that was "built"
    writeFileSync(join(testDir, 'test.txt'), 'Hello, World!');

    // Update STATE.md
    const statePath = join(testDir, '.planning', 'STATE.md');
    const stateContent = `# Project State

## Project Reference

**Core value:** Test project for Kata skill verification
**Current focus:** Verify Phase 1

## Current Position

Milestone: Test
Phase: 1 (Test Phase)
Plan: 01 of 1
Status: Ready for verification

## Accumulated Context

### Decisions

None.

### Pending Todos

0 pending todos.

### Blockers/Concerns

None.
`;
    writeFileSync(statePath, stateContent);
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "verify phase 1"', { timeout: config.timeouts.expensive }, () => {
    const result = invokeClaude('verify phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.expensive,
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected skill to be invoked for "verify phase 1"');
  });

  it('checks success criteria', { timeout: config.timeouts.expensive }, () => {
    const result = invokeClaude('verify phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.expensive,
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Check that result mentions verification, criteria, or testing
    const resultText = (result.result || '').toLowerCase();
    const mentionsVerification = resultText.includes('verif') ||
      resultText.includes('criteria') ||
      resultText.includes('test') ||
      resultText.includes('uat') ||
      resultText.includes('check');

    if (!mentionsVerification) {
      throw new Error('Expected result to mention verification or criteria checking');
    }
  });

  it('creates verification output', { timeout: config.timeouts.expensive }, () => {
    const result = invokeClaude('verify phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.expensive,
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Check for UAT.md or VERIFICATION.md in phase directory
    const phaseDir = join(testDir, '.planning', 'phases', '01-test-phase');

    // Either UAT.md is created, or verification is reported in result
    const uatExists = existsSync(join(phaseDir, '01-UAT.md'));
    const verificationExists = existsSync(join(phaseDir, '01-VERIFICATION.md'));
    const resultMentionsVerification = (result.result || '').toLowerCase().includes('verif');

    if (!uatExists && !verificationExists && !resultMentionsVerification) {
      throw new Error('Expected UAT.md or VERIFICATION.md to be created, or verification reported in result');
    }
  });
});
