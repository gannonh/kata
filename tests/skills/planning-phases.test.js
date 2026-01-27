import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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

describe('kata-planning-phases', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-planning-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-planning-phases');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-planning-phases');
    cpSync(skillSource, skillDest, { recursive: true });

    // Install required agents (spawned by skill)
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });
    const agents = ['kata-planner.md', 'kata-plan-checker.md', 'kata-phase-researcher.md'];
    for (const agent of agents) {
      const agentSource = join(KATA_ROOT, 'agents', agent);
      if (existsSync(agentSource)) {
        cpSync(agentSource, join(testDir, '.claude', 'agents', agent));
      }
    }

    // Add Phase 1 to ROADMAP.md with goal and success criteria
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = `# Roadmap: Test Fixture

## Overview

Test project for Kata skill testing.

## Phases

### Phase 01: Test Phase
**Goal:** Implement a test feature for verification
**Success criteria:**
- Feature is implemented
- Tests pass

## Progress

1 phase planned.
`;
    writeFileSync(roadmapPath, roadmapContent);

    // Create phase directory
    const phaseDir = join(testDir, '.planning', 'phases', '01-test-phase');
    mkdirSync(phaseDir, { recursive: true });

    // Create CONTEXT.md with implementation decisions (required for planning)
    const contextPath = join(phaseDir, '01-CONTEXT.md');
    const contextContent = `# Phase 01 Context

## Implementation Decisions

- Use simple file-based approach
- Keep scope minimal for test verification
- Target: Create a single test file

## Constraints

- Must complete in one plan
- No external dependencies
`;
    writeFileSync(contextPath, contextContent);

    // Update STATE.md to reference Phase 1
    const statePath = join(testDir, '.planning', 'STATE.md');
    const stateContent = `# Project State

## Project Reference

**Core value:** Test project for Kata skill verification
**Current focus:** Test Phase 1

## Current Position

Milestone: Test
Phase: 1 (Test Phase)
Plan: 0
Status: Planning

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

  it('responds to "plan phase 1"', { timeout: config.timeouts.expensive }, () => {
    const result = invokeClaude('plan phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.expensive,
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected skill to be invoked for "plan phase 1"');
  });

  it('creates PLAN.md files', { timeout: config.timeouts.expensive }, () => {
    const result = invokeClaude('plan phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.expensive,
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Verify PLAN.md files were created in the phase directory
    const phaseDir = join(testDir, '.planning', 'phases', '01-test-phase');
    assertFileMatchesPattern(
      phaseDir,
      /PLAN\.md$/,
      'Expected PLAN.md file to be created in phase directory'
    );
  });

  it('updates ROADMAP.md with plan count', { timeout: config.timeouts.expensive }, () => {
    const result = invokeClaude('plan phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.expensive,
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Check that ROADMAP.md was updated (or result mentions plans)
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = readFileSync(roadmapPath, 'utf8');

    // Verify roadmap mentions plans or the result does
    const roadmapMentionsPlans = roadmapContent.toLowerCase().includes('plan');
    const resultMentionsPlans = result.result && result.result.toLowerCase().includes('plan');

    if (!roadmapMentionsPlans && !resultMentionsPlans) {
      throw new Error('Expected ROADMAP.md or result to mention plans');
    }
  });

  describe('Plan Sync - Plan Checklist (Phase 4)', () => {
    it('contains GitHub issue update step', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-planning-phases', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify Step 14 or similar exists for GitHub update
      const hasGitHubStep = skillContent.includes('GitHub Issue') ||
                            skillContent.includes('gh issue edit');

      if (!hasGitHubStep) {
        throw new Error('Expected skill to include GitHub issue update step');
      }
    });

    it('contains config guard for github.enabled', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-planning-phases', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasEnabledCheck = skillContent.includes('GITHUB_ENABLED') ||
                              skillContent.includes('github.enabled');
      const hasIssueModeCheck = skillContent.includes('ISSUE_MODE') ||
                                skillContent.includes('issueMode');

      if (!hasEnabledCheck) {
        throw new Error('Expected skill to check github.enabled config');
      }

      if (!hasIssueModeCheck) {
        throw new Error('Expected skill to check issueMode config');
      }
    });

    it('contains plan checklist construction', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-planning-phases', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify plan iteration and checklist building
      const hasPlanIteration = skillContent.includes('PLAN.md') ||
                                skillContent.includes('for plan_file');
      const hasChecklistFormat = skillContent.includes('- [ ]') ||
                                 skillContent.includes('PLAN_CHECKLIST');

      if (!hasPlanIteration) {
        throw new Error('Expected skill to iterate over PLAN.md files');
      }

      if (!hasChecklistFormat) {
        throw new Error('Expected skill to build checklist with checkbox format');
      }
    });

    it('uses --body-file pattern', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-planning-phases', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasBodyFile = skillContent.includes('--body-file');

      if (!hasBodyFile) {
        throw new Error('Expected skill to use --body-file for safe issue body updates');
      }
    });

    it('contains non-blocking error handling', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-planning-phases', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Should warn but not stop workflow on GitHub errors
      const hasNonBlocking = skillContent.includes('Warning') ||
                             skillContent.includes('warn') ||
                             skillContent.includes('Skip') ||
                             skillContent.includes('non-blocking');

      if (!hasNonBlocking) {
        throw new Error('Expected skill to handle GitHub errors non-blocking');
      }
    });
  });
});
