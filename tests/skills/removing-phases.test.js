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

describe('kata-remove-phase', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), config.isolation.tempPrefix));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-remove-phase');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-remove-phase');
    cpSync(skillSource, skillDest, { recursive: true });

    // Ensure .claude directory structure exists
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });

    // Set up ROADMAP.md with multiple phases for removal testing
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = `# Roadmap: Test Fixture

## Current Milestone: v1.0 Foundation

### Phase 1: Initial Setup

**Goal:** Set up project foundation
**Depends on:** None
**Plans:** 1 plan

Plans:
- [ ] Setup plan

### Phase 2: Core Features

**Goal:** Build core features
**Depends on:** Phase 1
**Plans:** 0 plans

Plans:
- [ ] TBD

### Phase 3: Final Polish

**Goal:** Polish and release
**Depends on:** Phase 2
**Plans:** 0 plans

Plans:
- [ ] TBD

---

## Progress

| Phase | Name | Status |
|-------|------|--------|
| 1 | Initial Setup | In progress |
| 2 | Core Features | Not started |
| 3 | Final Polish | Not started |
`;
    writeFileSync(roadmapPath, roadmapContent);

    // Set up STATE.md to indicate current phase is 1
    const statePath = join(testDir, '.planning', 'STATE.md');
    const stateContent = `# Project State

## Current Position

Phase: 1 of 3
Plan: 01 of 01
Status: In progress
Last activity: Test

Progress: [#                               ] 0%
`;
    writeFileSync(statePath, stateContent);

    // Create phase directories
    mkdirSync(join(testDir, '.planning', 'phases', '01-initial-setup'), { recursive: true });
    mkdirSync(join(testDir, '.planning', 'phases', '02-core-features'), { recursive: true });
    mkdirSync(join(testDir, '.planning', 'phases', '03-final-polish'), { recursive: true });
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "remove phase 3"', async () => {
    const result = invokeClaude('remove phase 3', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('updates ROADMAP.md', async () => {
    const result = invokeClaude('remove phase 3 from roadmap', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Read ROADMAP.md and verify phase was removed or renumbered
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = readFileSync(roadmapPath, 'utf8');

    // Should either not have Phase 3 or have renumbered phases
    const hasPhase3 = roadmapContent.includes('### Phase 3: Final Polish');
    const phaseRemoved = !hasPhase3 ||
      roadmapContent.includes('removed') ||
      roadmapContent.includes('2 of 2') ||
      !roadmapContent.includes('Phase 3');

    // Alternatively, the skill might require confirmation - check result
    const resultText = result.result || '';
    const awaitingConfirmation = resultText.toLowerCase().includes('confirm') ||
      resultText.toLowerCase().includes('proceed');

    if (!phaseRemoved && !awaitingConfirmation) {
      throw new Error(`Expected ROADMAP.md to be updated or skill to request confirmation, got:\n${roadmapContent.substring(0, 800)}`);
    }
  });
});
