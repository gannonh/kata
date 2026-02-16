#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Project root detection (same pattern as scan-codebase.cjs)
// ---------------------------------------------------------------------------

function resolveProjectRoot() {
  const envRoot = process.env.KATA_PROJECT_ROOT;
  if (envRoot) {
    const resolved = path.resolve(envRoot);
    if (dirExists(path.join(resolved, '.planning'))) return resolved;
  }
  const cwd = process.cwd();
  for (const candidate of [cwd, path.join(cwd, 'main')]) {
    if (dirExists(path.join(candidate, '.planning'))) return path.resolve(candidate);
  }
  throw new Error(
    'Could not find project root. Expected .planning/ in CWD or CWD/main, or set KATA_PROJECT_ROOT.'
  );
}

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Schema builders
// ---------------------------------------------------------------------------

function buildIndexJson(now) {
  return {
    version: 2,
    generated: now,
    source: 'kata-new-project',
    generatedBy: 'scaffold',
    commitHash: 'none',
    files: {},
    stats: {
      totalFiles: 0,
      byType: {},
      byLayer: {},
      byExtension: {},
    },
  };
}

function buildConventionsJson(now) {
  return {
    version: 2,
    generated: now,
    commitHash: 'none',
    naming: {
      exports: {
        pattern: 'insufficient_data',
        confidence: 0,
        sampleSize: 0,
        breakdown: {},
      },
    },
    directories: {},
    fileSuffixes: {},
  };
}

function buildSummaryMd(dateStr) {
  return [
    '# Codebase Intelligence Summary',
    '',
    `Generated: ${dateStr} | Source: kata-new-project (greenfield scaffold)`,
    '',
    '## Stack',
    '- Greenfield project — stack will be detected after first phase execution',
    '',
    '## Architecture',
    '- No code written yet',
    '',
    '## Conventions',
    '- No conventions detected yet',
    '',
    '## Key Patterns',
    '- No patterns detected yet',
    '',
    '## Concerns',
    '- No concerns yet',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function scaffold() {
  const projectRoot = resolveProjectRoot();
  const intelDir = path.join(projectRoot, '.planning', 'intel');
  const now = new Date().toISOString();
  const dateStr = now.slice(0, 10);

  fs.mkdirSync(intelDir, { recursive: true });

  fs.writeFileSync(
    path.join(intelDir, 'index.json'),
    JSON.stringify(buildIndexJson(now), null, 2) + '\n'
  );

  fs.writeFileSync(
    path.join(intelDir, 'conventions.json'),
    JSON.stringify(buildConventionsJson(now), null, 2) + '\n'
  );

  fs.writeFileSync(
    path.join(intelDir, 'summary.md'),
    buildSummaryMd(dateStr)
  );

  console.log('scaffold-intel.cjs: created .planning/intel/ with empty v2 schema');
}

// ---------------------------------------------------------------------------
// Exports for testability
// ---------------------------------------------------------------------------

module.exports = {
  resolveProjectRoot,
  buildIndexJson,
  buildConventionsJson,
  buildSummaryMd,
  scaffold,
};

// Run as CLI when executed directly
if (require.main === module) {
  try {
    scaffold();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`scaffold-intel.cjs failed: ${message}`);
    process.exit(1);
  }
}
