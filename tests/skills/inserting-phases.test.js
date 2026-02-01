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

describe('kata-insert-phase', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), config.isolation.tempPrefix));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-insert-phase');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-insert-phase');
    cpSync(skillSource, skillDest, { recursive: true });

    // Ensure .claude directory structure exists
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });

    // Set up ROADMAP.md with Phase 1 so insertion has context
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = `# Roadmap: Test Fixture

## Current Milestone: v1.0 Foundation

### Phase 1: Initial Setup

**Goal:** Set up project foundation
**Depends on:** None
**Plans:** 0 plans

Plans:
- [ ] TBD

### Phase 2: Core Features

**Goal:** Build core features
**Depends on:** Phase 1
**Plans:** 0 plans

Plans:
- [ ] TBD

---

## Progress

| Phase | Name | Status |
|-------|------|--------|
| 1 | Initial Setup | Not started |
| 2 | Core Features | Not started |
`;
    writeFileSync(roadmapPath, roadmapContent);

    // Create phase 1 directory for context
    mkdirSync(join(testDir, '.planning', 'phases', '01-initial-setup'), { recursive: true });
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "insert urgent phase before phase 2"', async () => {
    const result = invokeClaude('insert urgent phase after phase 1 for fixing critical bug', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('creates decimal phase', async () => {
    const result = invokeClaude('insert phase after phase 1 for urgent security fix', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Read ROADMAP.md and verify decimal phase was created
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = readFileSync(roadmapPath, 'utf8');

    // Should contain decimal phase numbering (1.1 or similar)
    const hasDecimalPhase = roadmapContent.includes('1.1') ||
      roadmapContent.includes('Phase 1.') ||
      roadmapContent.includes('01.1');
    if (!hasDecimalPhase) {
      // Also check for (INSERTED) marker which indicates decimal insertion
      const hasInsertedMarker = roadmapContent.includes('INSERTED');
      if (!hasInsertedMarker && !hasDecimalPhase) {
        throw new Error(`Expected ROADMAP.md to contain decimal phase or INSERTED marker, got:\n${roadmapContent.substring(0, 800)}`);
      }
    }
  });
});
