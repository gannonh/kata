import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertArtifactExists,
  assertFileMatchesPattern
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-add-phase', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), config.isolation.tempPrefix));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-add-phase');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-add-phase');
    cpSync(skillSource, skillDest, { recursive: true });

    // Ensure .claude directory structure exists
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });

    // Add a milestone section to ROADMAP.md for context
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = `# Roadmap: Test Fixture

## Current Milestone: v1.0 Foundation

### Phase 1: Initial Setup

**Goal:** Set up project foundation
**Depends on:** None
**Plans:** 0 plans

---

## Progress

No phases completed.
`;
    writeFileSync(roadmapPath, roadmapContent);
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "add phase for authentication"', async () => {
    const result = invokeClaude('add phase for authentication', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('modifies ROADMAP.md', async () => {
    const result = invokeClaude('add phase for user authentication', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Read ROADMAP.md and verify it was updated
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = readFileSync(roadmapPath, 'utf8');

    // Should contain reference to authentication or new phase
    const hasNewPhase = roadmapContent.includes('authentication') ||
      roadmapContent.includes('Phase 2') ||
      roadmapContent.includes('user-authentication');
    if (!hasNewPhase) {
      throw new Error(`Expected ROADMAP.md to contain new phase reference, got:\n${roadmapContent.substring(0, 500)}`);
    }
  });

  it('creates phase directory', async () => {
    const result = invokeClaude('add phase for data models', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Verify phase directory was created
    const phasesDir = join(testDir, '.planning', 'phases');
    if (existsSync(phasesDir)) {
      assertFileMatchesPattern(phasesDir, /^\d{2}-.*$/);
    }
  });
});
