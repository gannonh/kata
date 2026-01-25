import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

describe('kata-planning-milestone-gaps', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-gaps-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-planning-milestone-gaps');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-planning-milestone-gaps');
    cpSync(skillSource, skillDest, { recursive: true });

    // Install required agents
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });
    const agents = ['kata-planner.md'];
    for (const agent of agents) {
      const agentSource = join(KATA_ROOT, 'agents', agent);
      if (existsSync(agentSource)) {
        cpSync(agentSource, join(testDir, '.claude', 'agents', agent));
      }
    }

    // Set up milestone with incomplete phases in ROADMAP.md
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = `# Roadmap: Test Project

## Overview

Test project for gap detection.

## Milestone: v1.0

### Phase 01: Authentication
**Goal:** Implement user auth
**Status:** Complete

### Phase 02: Dashboard
**Goal:** Create dashboard UI
**Status:** In progress (missing API integration)

## Progress

2 phases, 1 incomplete.
`;
    writeFileSync(roadmapPath, roadmapContent);

    // Create a MILESTONE-AUDIT.md with gaps
    const auditPath = join(testDir, '.planning', 'v1.0-MILESTONE-AUDIT.md');
    const auditContent = `---
milestone: v1.0
audit_date: 2026-01-25
gaps:
  requirements:
    - id: DASH-01
      description: Dashboard doesn't fetch from API
      reason: Missing fetch call
  integration:
    - from_phase: 1
      to_phase: 2
      connection: Auth token passed to API calls
      reason: No auth header in fetch
  flows:
    - name: View dashboard
      broken_at: Data fetch
      reason: No API call
---

# v1.0 Milestone Audit

## Summary

Gaps found that need to be addressed before milestone completion.

## Requirements Gaps

- DASH-01: Dashboard doesn't fetch from API

## Integration Gaps

- Phase 1 -> Phase 2: Auth token not passed to API calls

## Flow Gaps

- "View dashboard" flow broken at data fetch step
`;
    writeFileSync(auditPath, auditContent);

    // Create phase directories
    mkdirSync(join(testDir, '.planning', 'phases', '01-authentication'), { recursive: true });
    mkdirSync(join(testDir, '.planning', 'phases', '02-dashboard'), { recursive: true });

    // Update STATE.md
    const statePath = join(testDir, '.planning', 'STATE.md');
    const stateContent = `# Project State

## Project Reference

**Core value:** Test project for gap detection
**Current focus:** Milestone v1.0 gap closure

## Current Position

Milestone: v1.0
Phase: 2 (Dashboard)
Plan: 0
Status: Gaps identified

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

  it('responds to "check milestone gaps"', { timeout: config.timeouts.quick }, () => {
    const result = invokeClaude('check milestone gaps', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected skill to be invoked for "check milestone gaps"');
  });

  it('identifies missing work', { timeout: config.timeouts.quick }, () => {
    const result = invokeClaude('plan milestone gaps', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Check that result mentions gaps, missing, or incomplete
    const resultText = (result.result || '').toLowerCase();
    const mentionsGaps = resultText.includes('gap') ||
      resultText.includes('missing') ||
      resultText.includes('incomplete') ||
      resultText.includes('audit');

    if (!mentionsGaps) {
      throw new Error('Expected result to mention gaps, missing work, or audit findings');
    }
  });

  it('responds to "plan gaps" trigger', { timeout: config.timeouts.quick }, () => {
    const result = invokeClaude('plan gaps', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected skill to be invoked for "plan gaps"');
  });
});
