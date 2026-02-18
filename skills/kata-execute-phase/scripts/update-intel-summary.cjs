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

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  let projectRoot;
  try {
    projectRoot = resolveProjectRoot();
  } catch {
    // No project root found — exit silently
    return;
  }

  const intelDir = path.join(projectRoot, '.planning', 'intel');
  const indexPath = path.join(intelDir, 'index.json');
  const convPath = path.join(intelDir, 'conventions.json');
  const codebaseDir = path.join(projectRoot, '.planning', 'codebase');

  // Guard: if index.json does not exist, nothing to do
  if (!fileExists(indexPath)) return;

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    return;
  }

  const totalFiles = index.stats?.totalFiles ?? 0;

  // Guard: if no files indexed, nothing to summarize
  if (totalFiles === 0) return;

  // Read conventions.json (optional — proceed without it)
  let conventions = {};
  try {
    if (fileExists(convPath)) {
      conventions = JSON.parse(fs.readFileSync(convPath, 'utf8'));
    }
  } catch {
    // proceed with empty conventions
  }

  // Build summary sections
  const lines = [];

  lines.push('# Codebase Intelligence Summary');
  lines.push('');
  const source = dirExists(codebaseDir) ? 'code-scan (brownfield enrichment)' : 'code-scan (greenfield)';
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)} | Source: ${source}`);
  lines.push('');

  // Stack
  lines.push('## Stack');
  lines.push(`- ${totalFiles} source files indexed`);
  const byExtension = index.stats?.byExtension ?? {};
  for (const [ext, count] of Object.entries(byExtension)) {
    lines.push(`- ${ext}: ${count} files`);
  }
  lines.push('');

  // Architecture
  lines.push('## Architecture');
  const byLayer = index.stats?.byLayer ?? {};
  if (Object.keys(byLayer).length > 0) {
    for (const [layer, count] of Object.entries(byLayer)) {
      lines.push(`- ${layer}: ${count} files`);
    }
  } else {
    lines.push('- No layer classification data');
  }
  lines.push('');

  // Conventions
  lines.push('## Conventions');
  const naming = conventions.naming?.exports;
  if (naming && naming.pattern && naming.pattern !== 'insufficient_data') {
    lines.push(`- Export naming: ${naming.pattern} (confidence: ${naming.confidence})`);
  } else {
    lines.push('- Export naming: insufficient data');
  }
  const directories = conventions.directories ?? {};
  const dirEntries = Object.entries(directories).slice(0, 10);
  for (const [dir, info] of dirEntries) {
    lines.push(`- ${dir} — ${info.purpose}`);
  }
  lines.push('');

  // Key Patterns
  lines.push('## Key Patterns');
  const byType = index.stats?.byType ?? {};
  if (Object.keys(byType).length > 0) {
    for (const [type, count] of Object.entries(byType)) {
      lines.push(`- File types: ${type}: ${count}`);
    }
  } else {
    lines.push('- No file type data');
  }
  lines.push('');

  // Concerns
  lines.push('## Concerns');
  lines.push('- Auto-generated from code scan. Run /kata-map-codebase for detailed analysis.');
  lines.push('');

  fs.writeFileSync(path.join(intelDir, 'summary.md'), lines.join('\n'));
  console.log(`update-intel-summary.cjs: regenerated summary.md (${totalFiles} files indexed)`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

if (require.main === module) {
  try {
    main();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`update-intel-summary.cjs failed: ${message}`);
    process.exit(1);
  }
}

module.exports = { main };
