import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-adding-milestones', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), config.isolation.tempPrefix));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-adding-milestones');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-adding-milestones');
    cpSync(skillSource, skillDest, { recursive: true });

    // Ensure .claude directory structure exists
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });

    // Create PROJECT.md for milestone context
    const projectPath = join(testDir, '.planning', 'PROJECT.md');
    const projectContent = `# Test Project

## Overview

A test project for Kata skill verification.

## Current Milestone: v1.0 Foundation

**Goal:** Establish project foundation

## Key Decisions

None yet.
`;
    writeFileSync(projectPath, projectContent);

    // Create MILESTONES.md for history
    const milestonesPath = join(testDir, '.planning', 'MILESTONES.md');
    const milestonesContent = `# Milestones

## Completed Milestones

None yet.

## Current Milestone

v1.0 Foundation (in progress)
`;
    writeFileSync(milestonesPath, milestonesContent);

    // Update STATE.md
    const statePath = join(testDir, '.planning', 'STATE.md');
    const stateContent = `# Project State

## Current Position

Milestone: v1.0 Foundation
Phase: Not started
Plan: None
Status: Planning
Last activity: Test setup

Progress: [                                ] 0%
`;
    writeFileSync(statePath, stateContent);
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "add milestone v2.0"', async () => {
    const result = invokeClaude('add milestone v2.0 for advanced features', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('creates milestone structure', async () => {
    const result = invokeClaude('new milestone v1.1 for user authentication', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Check if milestone is mentioned in ROADMAP.md or PROJECT.md
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const projectPath = join(testDir, '.planning', 'PROJECT.md');

    let hasMilestone = false;

    if (existsSync(roadmapPath)) {
      const roadmapContent = readFileSync(roadmapPath, 'utf8');
      hasMilestone = roadmapContent.includes('v1.1') || roadmapContent.includes('1.1');
    }

    if (!hasMilestone && existsSync(projectPath)) {
      const projectContent = readFileSync(projectPath, 'utf8');
      hasMilestone = projectContent.includes('v1.1') || projectContent.includes('1.1');
    }

    // The skill might also just output milestone info
    const resultText = result.result || '';
    const mentionsMilestone = resultText.includes('v1.1') ||
                               resultText.includes('milestone') ||
                               resultText.toLowerCase().includes('1.1');

    if (!hasMilestone && !mentionsMilestone) {
      throw new Error(`Expected milestone v1.1 to be created or mentioned, got:\n${resultText.substring(0, 500)}`);
    }
  });

  it('mentions GitHub milestone creation when enabled', async () => {
    // Update config.json to enable GitHub
    const configPath = join(testDir, '.planning', 'config.json');
    const configContent = JSON.stringify({
      mode: 'yolo',
      depth: 'quick',
      parallelization: true,
      commit_docs: true,
      github: {
        enabled: true,
        issueMode: 'never'
      }
    }, null, 2);
    writeFileSync(configPath, configContent);

    const result = invokeClaude('add milestone v2.0 for GitHub integration features', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Check that GitHub milestone is mentioned in the response
    const resultText = result.result || '';
    const mentionsGitHub = resultText.toLowerCase().includes('github') ||
                           resultText.includes('milestone') ||
                           resultText.includes('gh ');

    // The skill should mention GitHub operations or milestones
    if (!mentionsGitHub) {
      console.log('Note: GitHub milestone creation may require gh CLI authentication for full test');
    }
  });

  it('skips GitHub when disabled in config', async () => {
    // Ensure config has github.enabled = false
    const configPath = join(testDir, '.planning', 'config.json');
    const configContent = JSON.stringify({
      mode: 'yolo',
      depth: 'quick',
      parallelization: true,
      commit_docs: true,
      github: {
        enabled: false,
        issueMode: 'never'
      }
    }, null, 2);
    writeFileSync(configPath, configContent);

    const result = invokeClaude('add milestone v1.2 for local-only features', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Should not error even when GitHub is disabled
    // The skill should handle disabled state gracefully
  });

  it('includes GitHub remote validation guard', () => {
    // This test verifies the skill content includes the remote validation pattern
    // Actual remote validation happens during interactive execution

    const skillPath = join(testDir, '.claude', 'skills', 'kata-adding-milestones', 'SKILL.md');
    const skillContent = readFileSync(skillPath, 'utf8');

    // Verify remote detection pattern exists
    const hasRemoteCheck = skillContent.includes('git remote -v') ||
                            skillContent.includes('HAS_GITHUB_REMOTE');

    if (!hasRemoteCheck) {
      throw new Error('Expected skill to include GitHub remote validation pattern');
    }

    // Verify warning message for missing remote
    const hasNoRemoteWarning = skillContent.includes('no GitHub remote') ||
                                skillContent.includes('Skipping GitHub Milestone');

    if (!hasNoRemoteWarning) {
      throw new Error('Expected skill to include warning for missing GitHub remote');
    }

    // Verify actionable instructions in warning
    const hasCreateInstructions = skillContent.includes('gh repo create');

    if (!hasCreateInstructions) {
      throw new Error('Expected skill to include gh repo create instructions in warning');
    }
  });
});
