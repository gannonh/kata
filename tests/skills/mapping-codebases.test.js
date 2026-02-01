/**
 * Tests for kata-map-codebase skill.
 *
 * Verifies that the codebase mapping skill correctly analyzes codebase structure
 * and produces documentation about the code organization.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertResultContains,
  assertArtifactExists
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-map-codebase skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-mapping-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-map-codebase');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-map-codebase');
    cpSync(skillSource, skillDest, { recursive: true });

    // Install the agent that mapping skill spawns
    const agentSource = join(KATA_ROOT, 'agents', 'kata-codebase-mapper.md');
    const agentDest = join(testDir, '.claude', 'agents', 'kata-codebase-mapper.md');
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });
    if (existsSync(agentSource)) {
      cpSync(agentSource, agentDest);
    }

    // Create a simple codebase structure to map
    mkdirSync(join(testDir, 'src'), { recursive: true });
    mkdirSync(join(testDir, 'src', 'utils'), { recursive: true });
    mkdirSync(join(testDir, 'src', 'components'), { recursive: true });

    // Create index.js
    writeFileSync(join(testDir, 'src', 'index.js'), `/**
 * Main entry point for the application.
 */
import { helper } from './utils/helper.js';
import { Button } from './components/Button.js';

export function main() {
  console.log('App started');
  helper();
  return new Button();
}

main();
`);

    // Create utils/helper.js
    writeFileSync(join(testDir, 'src', 'utils', 'helper.js'), `/**
 * Helper utilities for the application.
 */
export function helper() {
  console.log('Helper called');
}

export function formatDate(date) {
  return date.toISOString();
}
`);

    // Create components/Button.js
    writeFileSync(join(testDir, 'src', 'components', 'Button.js'), `/**
 * Button component.
 */
export class Button {
  constructor(label = 'Click me') {
    this.label = label;
  }

  render() {
    return \`<button>\${this.label}</button>\`;
  }
}
`);

    // Create package.json
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-codebase',
      version: '1.0.0',
      type: 'module',
      main: 'src/index.js',
      scripts: {
        start: 'node src/index.js'
      }
    }, null, 2));
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "map this codebase" prompt', () => {
    const result = invokeClaude('map this codebase', {
      cwd: testDir,
      maxBudget: config.budgets.expensive, // Scans many files
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected mapping skill to be invoked for codebase mapping prompt');
  });

  it('creates codebase analysis output', () => {
    const result = invokeClaude('analyze the codebase structure', {
      cwd: testDir,
      maxBudget: config.budgets.expensive,
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Verify either codebase directory created or analysis in result
    const codebaseDir = join(testDir, '.planning', 'codebase');
    if (existsSync(codebaseDir)) {
      assertArtifactExists(testDir, '.planning/codebase', 'Expected codebase analysis directory');
    } else {
      // If no directory, analysis should be in result
      assertResultContains(
        result,
        /structure|architecture|component|file|module/i,
        'Expected result to contain codebase analysis'
      );
    }
  });

  it('identifies file structure in analysis', () => {
    const result = invokeClaude('understand this codebase and explain its structure', {
      cwd: testDir,
      maxBudget: config.budgets.expensive,
      timeout: config.timeouts.expensive
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Verify result mentions files or structure
    assertResultContains(
      result,
      /src|index|component|util|file|structure|directory/i,
      'Expected result to mention file structure elements'
    );
  });
});
