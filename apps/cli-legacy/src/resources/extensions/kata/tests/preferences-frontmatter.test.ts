import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const resolveTsHookPath = fileURLToPath(new URL('./resolve-ts.mjs', import.meta.url));
const preferencesPath = fileURLToPath(new URL('../preferences.ts', import.meta.url));
const gitignorePath = fileURLToPath(new URL('../gitignore.ts', import.meta.url));

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

function mockPreferenceFilesScript(filesSource: string) {
  return `
    import fs from 'node:fs';
    import { join } from 'node:path';
    import { syncBuiltinESMExports } from 'node:module';

    const cwd = process.cwd();
    const files = new Map(${filesSource});
    const actualExistsSync = fs.existsSync;
    const actualReadFileSync = fs.readFileSync;

    fs.existsSync = (path) => files.has(String(path)) || actualExistsSync(path);
    fs.readFileSync = (path, encoding) => {
      const key = String(path);
      if (files.has(key)) return files.get(key);
      return actualReadFileSync(path, encoding);
    };
    syncBuiltinESMExports();

    const { loadProjectKataPreferences } = await import(${JSON.stringify(preferencesPath)});
    const prefs = loadProjectKataPreferences();
    console.log(JSON.stringify({
      path: prefs?.path ?? null,
      workflow: prefs?.preferences.workflow ?? null,
      linear: prefs?.preferences.linear ?? null,
      canonicalPath: join(cwd, '.kata', 'preferences.md'),
      legacyPath: join(cwd, '.kata', 'PREFERENCES.md'),
    }));
  `;
}

test('loadEffectiveKataPreferences preserves blank-line-separated skill_rules lists', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kata-preferences-frontmatter-'));
  const kataDir = join(tmp, '.kata');
  mkdirSync(kataDir, { recursive: true });
  writeFileSync(
    join(kataDir, 'preferences.md'),
    `---
skill_rules:

  - when: build
    use:
      - test-driven-development
---
`,
  );

  const script = `
    import { loadEffectiveKataPreferences } from ${JSON.stringify(preferencesPath)};
    const prefs = loadEffectiveKataPreferences();
    console.log(JSON.stringify(prefs?.preferences.skill_rules ?? null));
  `;

  const output = runPreferencesScript(tmp, script);

  assert.deepEqual(JSON.parse(output), [
    {
      when: 'build',
      use: ['test-driven-development'],
    },
  ]);
});

test('loadEffectiveKataPreferences normalizes nested workflow and linear frontmatter', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kata-preferences-frontmatter-'));
  const kataDir = join(tmp, '.kata');
  mkdirSync(kataDir, { recursive: true });
  writeFileSync(
    join(kataDir, 'preferences.md'),
    `---
version: 1
workflow:
  mode: LINEAR
linear:
  teamId: team-123
  teamKey: KAT
  projectId: project-456
---
`,
  );

  const script = `
    import { loadEffectiveKataPreferences } from ${JSON.stringify(preferencesPath)};
    const prefs = loadEffectiveKataPreferences();
    console.log(JSON.stringify({
      workflow: prefs?.preferences.workflow ?? null,
      linear: prefs?.preferences.linear ?? null,
    }));
  `;

  const output = runPreferencesScript(tmp, script);

  assert.deepEqual(JSON.parse(output), {
    workflow: { mode: 'linear' },
    linear: {
      teamId: 'team-123',
      teamKey: 'KAT',
      projectId: 'project-456',
    },
  });
});

test('loadEffectiveKataPreferences preserves models and auto_supervisor settings', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kata-preferences-frontmatter-'));
  const kataDir = join(tmp, '.kata');
  mkdirSync(kataDir, { recursive: true });
  writeFileSync(
    join(kataDir, 'preferences.md'),
    `---
version: 1
models:
  research: claude-sonnet-4-6
  planning: claude-opus-4-6     # Opus for architecture
  execution: claude-opus-4-6
  completion: claude-sonnet-4-6
  review: claude-sonnet-4-6
auto_supervisor:
  model: claude-sonnet-4-6
  soft_timeout_minutes: "25"
  idle_timeout_minutes: 12
  hard_timeout_minutes: 40
---
`,
  );

  const script = `
    import {
      loadEffectiveKataPreferences,
      resolveModelForUnit,
      resolveAutoSupervisorConfig,
    } from ${JSON.stringify(preferencesPath)};

    const prefs = loadEffectiveKataPreferences();
    console.log(JSON.stringify({
      models: prefs?.preferences.models ?? null,
      researchModel: resolveModelForUnit('research-slice') ?? null,
      planningModel: resolveModelForUnit('plan-slice') ?? null,
      executionModel: resolveModelForUnit('execute-task') ?? null,
      completionModel: resolveModelForUnit('complete-slice') ?? null,
      supervisor: resolveAutoSupervisorConfig(),
    }));
  `;

  const output = runPreferencesScript(tmp, script);

  assert.deepEqual(JSON.parse(output), {
    models: {
      research: 'claude-sonnet-4-6',
      planning: 'claude-opus-4-6',
      execution: 'claude-opus-4-6',
      completion: 'claude-sonnet-4-6',
      review: 'claude-sonnet-4-6',
    },
    researchModel: 'claude-sonnet-4-6',
    planningModel: 'claude-opus-4-6',
    executionModel: 'claude-opus-4-6',
    completionModel: 'claude-sonnet-4-6',
    supervisor: {
      model: 'claude-sonnet-4-6',
      soft_timeout_minutes: 25,
      idle_timeout_minutes: 12,
      hard_timeout_minutes: 40,
    },
  });
});

test('loadProjectKataPreferences prefers canonical lowercase filename over legacy uppercase filename', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kata-preferences-frontmatter-'));
  mkdirSync(join(tmp, '.kata'), { recursive: true });

  const filesSource = `[
    [join(process.cwd(), '.kata', 'preferences.md'), ${JSON.stringify(`---
workflow:
  mode: linear
---
`)}],
    [join(process.cwd(), '.kata', 'PREFERENCES.md'), ${JSON.stringify(`---
workflow:
  mode: file
---
`)}],
  ]`;

  const output = runPreferencesScript(
    tmp,
    mockPreferenceFilesScript(filesSource),
  );

  const parsed = JSON.parse(output);
  assert.deepEqual(parsed, {
    path: parsed.canonicalPath,
    workflow: { mode: 'linear' },
    linear: null,
    canonicalPath: parsed.canonicalPath,
    legacyPath: parsed.legacyPath,
  });
});

test('loadProjectKataPreferences falls back to legacy uppercase filename', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kata-preferences-frontmatter-'));
  const kataDir = join(tmp, '.kata');
  mkdirSync(kataDir, { recursive: true });
  writeFileSync(
    join(kataDir, 'PREFERENCES.md'),
    `---
workflow:
  mode: linear
linear:
  teamKey: KAT
---
`,
  );

  const script = `
    import { loadProjectKataPreferences } from ${JSON.stringify(preferencesPath)};
    const prefs = loadProjectKataPreferences();
    console.log(JSON.stringify({
      path: prefs?.path ?? null,
      workflow: prefs?.preferences.workflow ?? null,
      linear: prefs?.preferences.linear ?? null,
    }));
  `;

  const output = runPreferencesScript(tmp, script);
  const parsed = JSON.parse(output);

  assert.equal(parsed.path.endsWith('/.kata/PREFERENCES.md'), true);
  assert.deepEqual(parsed.workflow, { mode: 'linear' });
  assert.deepEqual(parsed.linear, { teamKey: 'KAT' });
});

test('ensurePreferences bootstraps canonical lowercase preferences.md', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kata-preferences-frontmatter-'));
  mkdirSync(join(tmp, '.kata'), { recursive: true });

  const script = `
    import { ensurePreferences } from ${JSON.stringify(gitignorePath)};
    ensurePreferences(${JSON.stringify(tmp)});
  `;

  runPreferencesScript(tmp, script);

  assert.equal(existsSync(join(tmp, '.kata', 'preferences.md')), true);
  assert.deepEqual(readdirSync(join(tmp, '.kata')).includes('PREFERENCES.md'), false);
});
