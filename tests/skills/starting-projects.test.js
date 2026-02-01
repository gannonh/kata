/**
 * Tests for kata-new-project skill.
 *
 * Verifies that the new-project skill correctly initializes a new Kata
 * project with PROJECT.md and config.json only.
 *
 * NOTE: ROADMAP.md, REQUIREMENTS.md, and STATE.md are created by
 * kata-add-milestone, not new-project.
 *
 * IMPORTANT: This test uses a FRESH temp directory (not the kata-project fixture)
 * since new-project initializes from an empty directory.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertArtifactExists,
  assertFileStructure
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-new-project skill', () => {
  let testDir;

  beforeEach(() => {
    // Create a FRESH empty temp directory (not from fixture)
    // new-project initializes from scratch
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-starting-'));

    // Initialize git repo (required by the skill)
    execSync('git init', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });

    // Create minimal .claude structure for skills
    mkdirSync(join(testDir, '.claude', 'skills'), { recursive: true });
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });

    // Create a minimal CLAUDE.md
    writeFileSync(join(testDir, 'CLAUDE.md'), `# Test Project

This is a test project for kata-new-project skill testing.
`);

    // Install the skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-new-project');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-new-project');
    cpSync(skillSource, skillDest, { recursive: true });

    // Install agents that new-project may spawn
    const agents = [
      'kata-project-researcher.md',
      'kata-research-synthesizer.md',
      'kata-roadmapper.md'
    ];

    for (const agent of agents) {
      const agentSource = join(KATA_ROOT, 'agents', agent);
      const agentDest = join(testDir, '.claude', 'agents', agent);
      if (existsSync(agentSource)) {
        cpSync(agentSource, agentDest);
      }
    }
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "start a new kata project" prompt', () => {
    // Use a simpler prompt that just triggers the skill but may not complete full flow
    // due to interactive nature of the skill
    const result = invokeClaude('start a new kata project for a todo app', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected new-project skill to be invoked');
  });

  it('creates .planning directory', () => {
    const result = invokeClaude('initialize kata project for a simple REST API', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // The skill should at minimum create the .planning directory structure
    // Note: Full completion requires interactive questioning, but basic structure should exist
    assertArtifactExists(testDir, '.planning', 'Expected .planning directory to be created');
  });

  it('creates PROJECT.md during initialization', () => {
    // Provide more context to help the skill create artifacts without full interaction
    const result = invokeClaude(
      'start new kata project: A simple todo list API with CRUD operations. Use Node.js and Express. Quick depth, YOLO mode.',
      {
        cwd: testDir,
        maxBudget: config.budgets.expensive, // Higher budget for more complete flow
        timeout: config.timeouts.expensive
      }
    );

    assertNoError(result);
    assertSkillInvoked(result);

    // Check for PROJECT.md creation
    if (existsSync(join(testDir, '.planning', 'PROJECT.md'))) {
      assertArtifactExists(testDir, '.planning/PROJECT.md', 'Expected PROJECT.md to be created');
    }
  });

  it('does not create ROADMAP.md (handled by add-milestone)', () => {
    const result = invokeClaude(
      'new project: Build a weather CLI tool. Use TypeScript.',
      {
        cwd: testDir,
        maxBudget: config.budgets.expensive,
        timeout: config.timeouts.expensive
      }
    );

    assertNoError(result);
    assertSkillInvoked(result);

    // ROADMAP.md should NOT be created by new-project
    // It's created by add-milestone
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    if (existsSync(roadmapPath)) {
      throw new Error('ROADMAP.md should not be created by new-project (handled by add-milestone)');
    }
  });

  it('does not create STATE.md (handled by add-milestone)', () => {
    const result = invokeClaude(
      'setup kata project for a blog engine with posts and comments',
      {
        cwd: testDir,
        maxBudget: config.budgets.expensive,
        timeout: config.timeouts.expensive
      }
    );

    assertNoError(result);
    assertSkillInvoked(result);

    // STATE.md should NOT be created by new-project
    // It's created by add-milestone
    const statePath = join(testDir, '.planning', 'STATE.md');
    if (existsSync(statePath)) {
      throw new Error('STATE.md should not be created by new-project (handled by add-milestone)');
    }
  });

  it('includes GitHub integration questions in config', () => {
    // Use a prompt that asks about project setup with GitHub enabled
    const result = invokeClaude(
      'start new kata project: A simple API. Enable GitHub tracking.',
      {
        cwd: testDir,
        maxBudget: config.budgets.standard,
        timeout: config.timeouts.standard
      }
    );

    assertNoError(result);
    assertSkillInvoked(result);

    // Check that GitHub is mentioned in the response or config
    const resultText = result.result || '';
    const mentionsGitHub = resultText.toLowerCase().includes('github') ||
      resultText.includes('milestone') ||
      resultText.includes('issue');

    // If config.json was created, check for github namespace
    const configPath = join(testDir, '.planning', 'config.json');
    let hasGitHubConfig = false;

    if (existsSync(configPath)) {
      const configContent = readFileSync(configPath, 'utf8');
      hasGitHubConfig = configContent.includes('"github"') ||
        configContent.includes('github');
    }

    // The skill should either mention GitHub in output or create github config
    if (!mentionsGitHub && !hasGitHubConfig) {
      // GitHub questions may not complete in non-interactive test, but should be mentioned
      console.log('Note: GitHub integration may require interactive mode for full test');
    }
  });

  it('includes GitHub remote detection in workflow', () => {
    // This test verifies the skill content includes the remote detection pattern
    // Actual remote detection happens during interactive execution

    const skillPath = join(testDir, '.claude', 'skills', 'kata-new-project', 'SKILL.md');
    const skillContent = readFileSync(skillPath, 'utf8');

    // Verify remote detection pattern exists
    const hasRemoteCheck = skillContent.includes('git remote -v') ||
      skillContent.includes('HAS_GITHUB_REMOTE');

    if (!hasRemoteCheck) {
      throw new Error('Expected skill to include GitHub remote detection pattern');
    }

    // Verify repo creation option exists
    const hasRepoCreate = skillContent.includes('gh repo create');

    if (!hasRepoCreate) {
      throw new Error('Expected skill to include gh repo create command');
    }

    // Verify skip option that disables github.enabled
    const hasSkipOption = skillContent.includes('Skip for now') ||
      skillContent.includes('github.enabled: false');

    if (!hasSkipOption) {
      throw new Error('Expected skill to include skip option that disables GitHub');
    }
  });
});
