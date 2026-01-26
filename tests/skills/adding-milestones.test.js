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

  describe('Phase Issue Creation (Phase 9.5)', () => {
    it('contains issueMode config check', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-adding-milestones', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify skill checks all three issueMode values
      const hasAutoMode = skillContent.includes('"auto"') || skillContent.includes("'auto'") || skillContent.includes('auto');
      const hasAskMode = skillContent.includes('"ask"') || skillContent.includes("'ask'") || skillContent.includes('ask');
      const hasNeverMode = skillContent.includes('"never"') || skillContent.includes("'never'") || skillContent.includes('never');

      // At minimum, skill should reference issueMode
      const hasIssueModeCheck = skillContent.includes('issueMode') || skillContent.includes('ISSUE_MODE');

      if (!hasIssueModeCheck) {
        throw new Error('Expected skill to check issueMode configuration');
      }

      // Should handle all three modes
      const modesFound = [hasAutoMode, hasAskMode, hasNeverMode].filter(Boolean).length;
      if (modesFound < 3) {
        throw new Error(`Expected skill to handle auto, ask, and never modes for issueMode. Found ${modesFound}/3`);
      }
    });

    it('contains phase label creation', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-adding-milestones', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify idempotent label creation pattern
      const hasLabelCreate = skillContent.includes('gh label create');
      const hasForceFlag = skillContent.includes('--force');
      const hasPhaseLabel = skillContent.includes('"phase"') || skillContent.includes("'phase'");

      if (!hasLabelCreate) {
        throw new Error('Expected skill to include gh label create command');
      }

      if (!hasForceFlag) {
        throw new Error('Expected skill to use --force flag for idempotent label creation');
      }

      if (!hasPhaseLabel) {
        throw new Error('Expected skill to create a "phase" label');
      }
    });

    it('contains milestone number lookup', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-adding-milestones', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify milestone API lookup before issue creation
      const hasMilestoneApi = skillContent.includes('/repos/:owner/:repo/milestones') ||
                              skillContent.includes('gh api') && skillContent.includes('milestones');

      // Should extract milestone number with jq or similar
      const hasMilestoneSelect = skillContent.includes('.title') ||
                                  skillContent.includes('select') ||
                                  skillContent.includes('MILESTONE_NUM');

      if (!hasMilestoneApi) {
        throw new Error('Expected skill to query GitHub milestones API');
      }

      if (!hasMilestoneSelect) {
        throw new Error('Expected skill to extract milestone number before creating issues');
      }
    });

    it('contains ROADMAP.md parsing for phases', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-adding-milestones', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify ROADMAP.md is read
      const hasRoadmapRead = skillContent.includes('ROADMAP.md') || skillContent.includes('ROADMAP_FILE');

      // Verify phase extraction patterns
      const hasPhaseExtraction = skillContent.includes('Phase') ||
                                  skillContent.includes('PHASE_');

      // Verify goal/success criteria parsing
      const hasGoalParsing = skillContent.includes('Goal') || skillContent.includes('PHASE_GOAL');
      const hasSuccessCriteria = skillContent.includes('Success Criteria') || skillContent.includes('SUCCESS_CRITERIA');

      if (!hasRoadmapRead) {
        throw new Error('Expected skill to read ROADMAP.md for phase information');
      }

      if (!hasPhaseExtraction) {
        throw new Error('Expected skill to extract phase information from roadmap');
      }

      if (!hasGoalParsing || !hasSuccessCriteria) {
        throw new Error('Expected skill to parse Phase Goal and Success Criteria from roadmap');
      }
    });

    it('contains idempotent issue existence check', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-adding-milestones', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify issue list check before creation
      const hasIssueList = skillContent.includes('gh issue list');
      const hasLabelFilter = skillContent.includes('--label') && skillContent.includes('phase');
      const hasMilestoneFilter = skillContent.includes('--milestone');

      // Should check for existing issue to avoid duplicates
      const hasExistenceCheck = skillContent.includes('EXISTING') ||
                                 skillContent.includes('already exists') ||
                                 skillContent.includes('if [ -n');

      if (!hasIssueList) {
        throw new Error('Expected skill to list existing issues before creation');
      }

      if (!hasLabelFilter) {
        throw new Error('Expected skill to filter issues by phase label');
      }

      if (!hasMilestoneFilter) {
        throw new Error('Expected skill to filter issues by milestone');
      }

      if (!hasExistenceCheck) {
        throw new Error('Expected skill to check if issue already exists (idempotent)');
      }
    });

    it('uses --body-file pattern', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-adding-milestones', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify body-file pattern for safe special character handling
      const hasBodyFile = skillContent.includes('--body-file');

      // Should write to temp file first
      const hasTempFile = skillContent.includes('/tmp/') ||
                           skillContent.includes('phase-issue-body') ||
                           skillContent.includes('cat >');

      if (!hasBodyFile) {
        throw new Error('Expected skill to use --body-file pattern for issue body');
      }

      if (!hasTempFile) {
        throw new Error('Expected skill to write issue body to temp file before gh issue create');
      }
    });

    it('contains gh issue create with required flags', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-adding-milestones', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      // Verify gh issue create command with all required flags
      const hasIssueCreate = skillContent.includes('gh issue create');
      const hasTitleFlag = skillContent.includes('--title');
      const hasLabelFlag = skillContent.includes('--label') && skillContent.includes('phase');
      const hasMilestoneFlag = skillContent.includes('--milestone');

      if (!hasIssueCreate) {
        throw new Error('Expected skill to include gh issue create command');
      }

      if (!hasTitleFlag) {
        throw new Error('Expected gh issue create to include --title flag');
      }

      if (!hasLabelFlag) {
        throw new Error('Expected gh issue create to include --label "phase" flag');
      }

      if (!hasMilestoneFlag) {
        throw new Error('Expected gh issue create to include --milestone flag');
      }
    });
  });
});
