/**
 * Kata Tools Tests - Dispatcher
 *
 * Tests for kata-tools.cjs dispatch routing and error paths.
 * Covers: no-command, unknown command, unknown subcommands for every command group,
 * --cwd parsing, and previously untouched routing branches.
 *
 * Requirements: DISP-01, DISP-02
 */

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runKataTools, createTempProject, cleanup } = require('./helpers.js');

// ─── Dispatcher Error Paths ──────────────────────────────────────────────────

describe('dispatcher error paths', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // No command
  test('no-command invocation prints usage and exits non-zero', () => {
    const result = runKataTools('', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Usage:'), `Expected "Usage:" in stderr, got: ${result.error}`);
  });

  // Unknown command
  test('unknown command produces clear error and exits non-zero', () => {
    const result = runKataTools('nonexistent-cmd', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown command'), `Expected "Unknown command" in stderr, got: ${result.error}`);
  });

  // --cwd= form with valid directory
  test('--cwd= form overrides working directory', () => {
    // Create STATE.md in tmpDir so state load can find it
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n## Current Position\n\nPhase: 1 of 1 (Test)\n'
    );
    const result = runKataTools(`--cwd=${tmpDir} state load`, process.cwd());
    assert.strictEqual(result.success, true, `Should succeed with --cwd=, got: ${result.error}`);
  });

  // --cwd= with empty value
  test('--cwd= with empty value produces error', () => {
    const result = runKataTools('--cwd= state load', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Missing value for --cwd'), `Expected "Missing value for --cwd" in stderr, got: ${result.error}`);
  });

  // --cwd with nonexistent path
  test('--cwd with invalid path produces error', () => {
    const result = runKataTools('--cwd /nonexistent/path/xyz state load', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Invalid --cwd'), `Expected "Invalid --cwd" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: template
  test('template unknown subcommand errors', () => {
    const result = runKataTools('template bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown template subcommand'), `Expected "Unknown template subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: frontmatter
  test('frontmatter unknown subcommand errors', () => {
    const result = runKataTools('frontmatter bogus file.md', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown frontmatter subcommand'), `Expected "Unknown frontmatter subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: verify
  test('verify unknown subcommand errors', () => {
    const result = runKataTools('verify bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown verify subcommand'), `Expected "Unknown verify subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: phases
  test('phases unknown subcommand errors', () => {
    const result = runKataTools('phases bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown phases subcommand'), `Expected "Unknown phases subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: roadmap
  test('roadmap unknown subcommand errors', () => {
    const result = runKataTools('roadmap bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown roadmap subcommand'), `Expected "Unknown roadmap subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: requirements
  test('requirements unknown subcommand errors', () => {
    const result = runKataTools('requirements bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown requirements subcommand'), `Expected "Unknown requirements subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: phase
  test('phase unknown subcommand errors', () => {
    const result = runKataTools('phase bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown phase subcommand'), `Expected "Unknown phase subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: milestone
  test('milestone unknown subcommand errors', () => {
    const result = runKataTools('milestone bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown milestone subcommand'), `Expected "Unknown milestone subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: validate
  test('validate unknown subcommand errors', () => {
    const result = runKataTools('validate bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown validate subcommand'), `Expected "Unknown validate subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: todo
  test('todo unknown subcommand errors', () => {
    const result = runKataTools('todo bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown todo subcommand'), `Expected "Unknown todo subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: init
  test('init unknown workflow errors', () => {
    const result = runKataTools('init bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown init workflow'), `Expected "Unknown init workflow" in stderr, got: ${result.error}`);
  });
});

// ─── Dispatcher Routing Branches ─────────────────────────────────────────────

describe('dispatcher routing branches', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // find-phase
  test('find-phase locates phase directory by number', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test-phase');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runKataTools('find-phase 01', tmpDir);
    assert.strictEqual(result.success, true, `find-phase failed: ${result.error}`);
    assert.ok(result.output.includes('01-test-phase'), `Expected output to contain "01-test-phase", got: ${result.output}`);
  });

  // init resume
  test('init resume returns valid JSON', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n## Current Position\n\nPhase: 1 of 1 (Test)\nPlan: 01-01 complete\nStatus: Ready\nLast activity: 2026-01-01\n\nProgress: [##########] 100%\n\n## Session Continuity\n\nLast session: 2026-01-01\nStopped at: Test\nResume file: None\n'
    );

    const result = runKataTools('init resume', tmpDir);
    assert.strictEqual(result.success, true, `init resume failed: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.ok(typeof parsed === 'object', 'Output should be valid JSON object');
  });

  // init verify-work
  test('init verify-work returns valid JSON', () => {
    // Create STATE.md
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n## Current Position\n\nPhase: 1 of 1 (Test)\nPlan: 01-01 complete\nStatus: Ready\nLast activity: 2026-01-01\n\nProgress: [##########] 100%\n\n## Session Continuity\n\nLast session: 2026-01-01\nStopped at: Test\nResume file: None\n'
    );

    // Create ROADMAP.md with phase section
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '# Roadmap\n\n## Milestone: v1.0 Test\n\n### Phase 1: Test Phase\n**Goal**: Test goal\n**Depends on**: None\n**Requirements**: TEST-01\n**Success Criteria**:\n  1. Tests pass\n**Plans**: 1 plan\nPlans:\n- [x] 01-01-PLAN.md\n\n## Progress\n\n| Phase | Plans | Status | Date |\n|-------|-------|--------|------|\n| 1 | 1/1 | Complete | 2026-01-01 |\n'
    );

    // Create phase dir
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runKataTools('init verify-work 01', tmpDir);
    assert.strictEqual(result.success, true, `init verify-work failed: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.ok(typeof parsed === 'object', 'Output should be valid JSON object');
  });

  // roadmap update-plan-progress
  test('roadmap update-plan-progress updates phase progress', () => {
    // Create ROADMAP.md with progress table
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '# Roadmap\n\n## Milestone: v1.0 Test\n\n### Phase 1: Test Phase\n**Goal**: Test goal\n**Depends on**: None\n**Requirements**: TEST-01\n**Success Criteria**:\n  1. Tests pass\n**Plans**: 1 plan\nPlans:\n- [ ] 01-01-PLAN.md\n\n## Progress\n\n| Phase | Plans | Status | Date |\n|-------|-------|--------|------|\n| 1 | 0/1 | Not Started | - |\n'
    );

    // Create phase dir with PLAN and SUMMARY
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test-phase');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, '01-01-PLAN.md'),
      '---\nphase: 01-test-phase\nplan: "01"\n---\n\n# Plan\n'
    );
    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      '---\nphase: 01-test-phase\nplan: "01"\n---\n\n# Summary\n'
    );

    const result = runKataTools('roadmap update-plan-progress 1', tmpDir);
    assert.strictEqual(result.success, true, `roadmap update-plan-progress failed: ${result.error}`);
  });

  // state (no subcommand) — default load
  test('state with no subcommand calls cmdStateLoad', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n## Current Position\n\nPhase: 1 of 1 (Test)\nPlan: 01-01 complete\nStatus: Ready\nLast activity: 2026-01-01\n\nProgress: [##########] 100%\n\n## Session Continuity\n\nLast session: 2026-01-01\nStopped at: Test\nResume file: None\n'
    );

    const result = runKataTools('state', tmpDir);
    assert.strictEqual(result.success, true, `state load failed: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.ok(typeof parsed === 'object', 'Output should be valid JSON object');
  });

  // summary-extract
  test('summary-extract parses SUMMARY.md frontmatter', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    const summaryContent = `---
phase: 01-test
plan: "01"
subsystem: testing
tags: [node, test]
duration: 5min
completed: "2026-01-01"
key-decisions:
  - "Used node:test"
requirements-completed: [TEST-01]
---

# Phase 1 Plan 01: Test Summary

**Tests added for core module**
`;

    const summaryPath = path.join(phaseDir, '01-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, summaryContent);

    // Use relative path from tmpDir
    const result = runKataTools(`summary-extract .planning/phases/01-test/01-01-SUMMARY.md`, tmpDir);
    assert.strictEqual(result.success, true, `summary-extract failed: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.ok(typeof parsed === 'object', 'Output should be valid JSON object');
    assert.strictEqual(parsed.path, '.planning/phases/01-test/01-01-SUMMARY.md', 'Path should match input');
    assert.deepStrictEqual(parsed.requirements_completed, ['TEST-01'], 'requirements_completed should contain TEST-01');
  });
});
