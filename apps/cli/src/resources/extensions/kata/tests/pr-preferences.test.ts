/**
 * Tests for KataPrPreferences schema integration.
 *
 * These tests FAIL until T02 adds `KataPrPreferences` to preferences.ts
 * and wires it through the validatePreferences / mergePreferences pipeline.
 *
 * Expected failure: `result.preferences.pr` is undefined because validatePreferences
 * does not yet copy the `pr` field into the validated output.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const resolveTsHookPath = fileURLToPath(new URL('./resolve-ts.mjs', import.meta.url));
const preferencesPath = fileURLToPath(new URL('../preferences.ts', import.meta.url));

/**
 * Runs a Node script with the ts resolve hook, using tmp as HOME so that
 * ~/.kata-cli/preferences.md resolves to tmp/.kata-cli/preferences.md.
 */
function runPreferencesScript(tmp: string, script: string) {
  return execFileSync(
    'node',
    ['--import', resolveTsHookPath, '--experimental-strip-types', '-e', script],
    {
      cwd: tmp,
      env: {
        ...process.env,
        HOME: tmp,
      },
      encoding: 'utf-8',
    },
  ).trim();
}

test('loadEffectiveKataPreferences reads pr section from global preferences', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kata-pr-preferences-'));
  // Create ~/.kata-cli/preferences.md (HOME is set to tmp)
  const kataCliDir = join(tmp, '.kata-cli');
  mkdirSync(kataCliDir, { recursive: true });
  writeFileSync(
    join(kataCliDir, 'preferences.md'),
    `---
pr:
  enabled: true
  auto_create: false
  base_branch: "main"
  review_on_create: false
  linear_link: false
---
`,
  );

  const script = `
    import { loadEffectiveKataPreferences } from ${JSON.stringify(preferencesPath)};
    const result = loadEffectiveKataPreferences();
    console.log(JSON.stringify({
      prEnabled: result?.preferences?.pr?.enabled ?? null,
      prBaseBranch: result?.preferences?.pr?.base_branch ?? null,
    }));
  `;

  const output = runPreferencesScript(tmp, script);
  const parsed = JSON.parse(output);

  // These assertions fail until T02 wires KataPrPreferences through the schema
  assert.equal(parsed.prEnabled, true, 'pr.enabled should be true');
  assert.equal(parsed.prBaseBranch, 'main', 'pr.base_branch should be "main"');
});

test('loadEffectiveKataPreferences validates pr section without errors', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kata-pr-preferences-'));
  const kataCliDir = join(tmp, '.kata-cli');
  mkdirSync(kataCliDir, { recursive: true });
  writeFileSync(
    join(kataCliDir, 'preferences.md'),
    `---
pr:
  enabled: true
  auto_create: false
  base_branch: "main"
  review_on_create: false
  linear_link: false
---
`,
  );

  // Capture stderr to confirm no validation errors are emitted
  const script = `
    import { loadEffectiveKataPreferences } from ${JSON.stringify(preferencesPath)};
    // Intercept stderr to detect validation warnings
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrLines = [];
    process.stderr.write = (chunk, ...args) => {
      stderrLines.push(String(chunk));
      return originalWrite(chunk, ...args);
    };
    const result = loadEffectiveKataPreferences();
    const validationErrors = stderrLines.filter(l => l.includes('[kata] preferences validation'));
    console.log(JSON.stringify({
      hasResult: result !== null,
      validationErrors,
    }));
  `;

  const output = runPreferencesScript(tmp, script);
  const parsed = JSON.parse(output);

  assert.equal(parsed.hasResult, true, 'loadEffectiveKataPreferences should return a result');
  assert.deepEqual(parsed.validationErrors, [], 'no validation errors should be emitted for valid pr section');
});

test('loadEffectiveKataPreferences merges pr section from global into project preferences', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kata-pr-preferences-'));

  // Global preferences: pr section
  const kataCliDir = join(tmp, '.kata-cli');
  mkdirSync(kataCliDir, { recursive: true });
  writeFileSync(
    join(kataCliDir, 'preferences.md'),
    `---
pr:
  enabled: true
  base_branch: "main"
---
`,
  );

  // Project preferences: workflow section (no pr section)
  const kataDir = join(tmp, '.kata');
  mkdirSync(kataDir, { recursive: true });
  writeFileSync(
    join(kataDir, 'preferences.md'),
    `---
workflow:
  mode: linear
---
`,
  );

  const script = `
    import { loadEffectiveKataPreferences } from ${JSON.stringify(preferencesPath)};
    const result = loadEffectiveKataPreferences();
    console.log(JSON.stringify({
      prEnabled: result?.preferences?.pr?.enabled ?? null,
      prBaseBranch: result?.preferences?.pr?.base_branch ?? null,
      workflowMode: result?.preferences?.workflow?.mode ?? null,
    }));
  `;

  const output = runPreferencesScript(tmp, script);
  const parsed = JSON.parse(output);

  // pr comes from global, workflow comes from project
  assert.equal(parsed.prEnabled, true, 'pr.enabled merged from global preferences');
  assert.equal(parsed.prBaseBranch, 'main', 'pr.base_branch merged from global preferences');
  assert.equal(parsed.workflowMode, 'linear', 'workflow.mode comes from project preferences');
});
