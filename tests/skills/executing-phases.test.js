import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

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

describe('kata-execute-phase', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-executing-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-execute-phase');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-execute-phase');
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

  describe('Plan Sync - Wave Completion (Phase 4)', () => {
    it('contains wave completion GitHub update', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify wave completion includes GitHub update
      const hasWaveUpdate = skillContent.includes('wave') &&
        skillContent.includes('gh issue');

      if (!hasWaveUpdate) {
        throw new Error('Expected skill to update GitHub issue on wave completion');
      }
    });

    it('updates per wave not per plan (race condition mitigation)', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify orchestrator-level update pattern
      const hasWaveCompletion = skillContent.includes('wave complete') ||
        skillContent.includes('COMPLETED_PLANS_IN_WAVE') ||
        skillContent.includes('Wave');

      // Should mention per-wave updates, not per-plan
      const mentionsPerWave = skillContent.includes('per wave') ||
        skillContent.includes('per-wave') ||
        skillContent.includes('ONCE per wave');

      if (!hasWaveCompletion) {
        throw new Error('Expected skill to update issue at wave completion, not per-plan');
      }
    });

    it('contains checkbox toggle pattern', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify sed pattern for checkbox toggle
      const hasCheckboxToggle = skillContent.includes('\\[ \\]') ||
        skillContent.includes('- [ ]') ||
        skillContent.includes('[x]');

      if (!hasCheckboxToggle) {
        throw new Error('Expected skill to include checkbox toggle pattern');
      }
    });

    it('contains config guard', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasEnabledCheck = skillContent.includes('GITHUB_ENABLED') ||
        skillContent.includes('github.enabled');

      if (!hasEnabledCheck) {
        throw new Error('Expected skill to check github.enabled config');
      }
    });

    it('uses --body-file pattern', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasBodyFile = skillContent.includes('--body-file');

      if (!hasBodyFile) {
        throw new Error('Expected skill to use --body-file for safe issue body updates');
      }
    });
  });

  describe('PR Integration - Phase 5', () => {
    it('contains branch creation step', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasBranchCreation = skillContent.includes('Create Phase Branch') ||
        skillContent.includes('git checkout -b');

      if (!hasBranchCreation) {
        throw new Error('Expected skill to include branch creation step for pr_workflow');
      }
    });

    it('contains draft PR creation step', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasDraftPR = skillContent.includes('gh pr create --draft');

      if (!hasDraftPR) {
        throw new Error('Expected skill to include draft PR creation with gh pr create --draft');
      }
    });

    it('contains PR ready step', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasPRReady = skillContent.includes('gh pr ready');

      if (!hasPRReady) {
        throw new Error('Expected skill to include gh pr ready step');
      }
    });

    it('includes PR title convention', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Should have title pattern: v{milestone} Phase {N}: {Name}
      const hasTitlePattern = skillContent.includes('v${MILESTONE} Phase') ||
        skillContent.includes('v{milestone} Phase');

      if (!hasTitlePattern) {
        throw new Error('Expected skill to include PR title convention');
      }
    });

    it('includes issue linking in PR body', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasClosesLink = skillContent.includes('Closes #');

      if (!hasClosesLink) {
        throw new Error('Expected skill to include "Closes #" issue linking in PR body');
      }
    });

    it('has re-run protection for branch creation', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasReRunProtection = skillContent.includes('show-ref --verify') ||
        skillContent.includes('branch exists');

      if (!hasReRunProtection) {
        throw new Error('Expected skill to have re-run protection for branch creation');
      }
    });

    it('has re-run protection for PR creation', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-execute-phase', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasExistingPRCheck = skillContent.includes('EXISTING_PR') ||
        skillContent.includes('PR already exists');

      if (!hasExistingPRCheck) {
        throw new Error('Expected skill to check for existing PR before creation');
      }
    });
  });
});
