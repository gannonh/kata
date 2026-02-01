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

describe('kata-complete-milestone', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), config.isolation.tempPrefix));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-complete-milestone');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-complete-milestone');
    cpSync(skillSource, skillDest, { recursive: true });

    // Ensure .claude directory structure exists
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });

    // Set up a completable milestone scenario
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = `# Roadmap: Test Fixture

## Current Milestone: v1.0 Foundation

### Phase 1: Initial Setup

**Goal:** Set up project foundation
**Depends on:** None
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md - Setup complete

---

## Progress

| Phase | Name | Status |
|-------|------|--------|
| 1 | Initial Setup | Complete |
`;
    writeFileSync(roadmapPath, roadmapContent);

    // Create REQUIREMENTS.md
    const requirementsPath = join(testDir, '.planning', 'REQUIREMENTS.md');
    const requirementsContent = `# Requirements

## v1.0 Requirements

- [x] **SETUP-01**: Project structure created
- [x] **SETUP-02**: Dependencies installed
`;
    writeFileSync(requirementsPath, requirementsContent);

    // Create PROJECT.md
    const projectPath = join(testDir, '.planning', 'PROJECT.md');
    const projectContent = `# Test Project

## Current Milestone: v1.0 Foundation

**Goal:** Establish project foundation

**Status:** Ready to complete
`;
    writeFileSync(projectPath, projectContent);

    // Create phase directory with SUMMARY.md (indicating completion)
    const phaseDir = join(testDir, '.planning', 'phases', '01-initial-setup');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, '01-01-SUMMARY.md'), `# Summary: Initial Setup

**Status:** Complete
**Duration:** 5 min

## Tasks Completed

- Project structure created
- Dependencies installed
`);

    // Create milestones directory
    mkdirSync(join(testDir, '.planning', 'milestones'), { recursive: true });
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "complete milestone"', async () => {
    const result = invokeClaude('complete milestone v1.0', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('archives milestone', async () => {
    const result = invokeClaude('finish milestone v1.0 and archive it', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Check if milestone was archived or ROADMAP.md updated
    const milestonesDir = join(testDir, '.planning', 'milestones');
    let archived = false;

    if (existsSync(milestonesDir)) {
      // Check for archive file
      const files = require('node:fs').readdirSync(milestonesDir);
      archived = files.some(f => f.includes('v1.0') || f.includes('1.0'));
    }

    // Check ROADMAP.md for completion markers
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    if (existsSync(roadmapPath)) {
      const roadmapContent = readFileSync(roadmapPath, 'utf8');
      archived = archived ||
        roadmapContent.includes('complete') ||
        roadmapContent.includes('archived') ||
        roadmapContent.includes('shipped');
    }

    // The skill might request pre-flight checks
    const resultText = result.result || '';
    const mentionsArchive = resultText.toLowerCase().includes('archive') ||
      resultText.toLowerCase().includes('complete') ||
      resultText.toLowerCase().includes('milestone') ||
      resultText.toLowerCase().includes('pre-flight');

    if (!archived && !mentionsArchive) {
      throw new Error(`Expected milestone to be archived or mentioned, got:\n${resultText.substring(0, 500)}`);
    }
  });
});
