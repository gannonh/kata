import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const resolveTsHookPath = fileURLToPath(new URL('./resolve-ts.mjs', import.meta.url));
const preferencesPath = fileURLToPath(new URL('../preferences.ts', import.meta.url));

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

  const output = execFileSync(
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

  assert.deepEqual(JSON.parse(output), [
    {
      when: 'build',
      use: ['test-driven-development'],
    },
  ]);
});
