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

describe('kata-audit-milestone', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), config.isolation.tempPrefix));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-audit-milestone');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-audit-milestone');
    cpSync(skillSource, skillDest, { recursive: true });

    // Ensure .claude directory structure exists
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });

    // Set up PROJECT.md
    const projectPath = join(testDir, '.planning', 'PROJECT.md');
    const projectContent = `# Test Project

## Current Milestone: v1.0 Foundation

**Goal:** Establish project foundation

## Definition of Done

- All phases complete
- All requirements met
`;
    writeFileSync(projectPath, projectContent);

    // Set up REQUIREMENTS.md
    const requirementsPath = join(testDir, '.planning', 'REQUIREMENTS.md');
    const requirementsContent = `# Requirements

## v1.0 Requirements

- [x] **SETUP-01**: Project structure created
- [x] **SETUP-02**: Dependencies installed
- [ ] **AUTH-01**: User can login
`;
    writeFileSync(requirementsPath, requirementsContent);

    // Set up ROADMAP.md with milestone phases
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = `# Roadmap: Test Fixture

## Current Milestone: v1.0 Foundation

### Phase 1: Initial Setup

**Goal:** Set up project foundation
**Depends on:** None
**Plans:** 1 plan
**Requirements:** SETUP-01, SETUP-02

---

## Progress

| Phase | Name | Status |
|-------|------|--------|
| 1 | Initial Setup | Complete |
`;
    writeFileSync(roadmapPath, roadmapContent);

    // Create phase directory with VERIFICATION.md and SUMMARY.md
    const phaseDir = join(testDir, '.planning', 'phases', '01-initial-setup');
    mkdirSync(phaseDir, { recursive: true });

    writeFileSync(join(phaseDir, '01-01-SUMMARY.md'), `# Summary

**Status:** Complete
`);

    writeFileSync(join(phaseDir, '01-VERIFICATION.md'), `# Verification

**Status:** passed
**Requirements:** SETUP-01, SETUP-02

## Critical Gaps

None

## Tech Debt

- TODO: Add rate limiting
`);
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "audit milestone"', async () => {
    const result = invokeClaude('audit milestone v1.0', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('reports milestone status', async () => {
    const result = invokeClaude('audit current milestone and check requirements coverage', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Result should mention milestone, phases, progress, or requirements
    const resultText = result.result || '';
    const mentionsStatus = resultText.toLowerCase().includes('milestone') ||
      resultText.toLowerCase().includes('phase') ||
      resultText.toLowerCase().includes('requirement') ||
      resultText.toLowerCase().includes('progress') ||
      resultText.toLowerCase().includes('audit') ||
      resultText.toLowerCase().includes('coverage');

    if (!mentionsStatus) {
      throw new Error(`Expected audit to mention milestone, phases, or progress, got:\n${resultText.substring(0, 500)}`);
    }
  });
});
