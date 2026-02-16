#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Project root detection
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
// Git helpers
// ---------------------------------------------------------------------------

function git(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

function isValidCommit(commit, projectRoot) {
  try {
    git(`git cat-file -t ${commit}`, projectRoot);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Staleness detection
// ---------------------------------------------------------------------------

function detectStaleFiles(projectRoot) {
  const indexPath = path.join(projectRoot, '.planning', 'intel', 'index.json');

  // Graceful exit if index.json missing
  if (!fs.existsSync(indexPath)) {
    return {
      staleFiles: [],
      freshFiles: [],
      totalIndexed: 0,
      staleCount: 0,
      stalePct: 0,
      oldestStaleCommit: null,
      hasDocBasedEntries: false,
    };
  }

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    return {
      staleFiles: [],
      freshFiles: [],
      totalIndexed: 0,
      staleCount: 0,
      stalePct: 0,
      oldestStaleCommit: null,
      hasDocBasedEntries: false,
    };
  }

  const topCommit = index.commitHash || null;
  const files = index.files || {};

  // Group files by their lastIndexed commit, skipping wildcard entries
  const byCommit = {};
  let docBasedCount = 0;

  for (const [filePath, entry] of Object.entries(files)) {
    if (filePath.includes('*')) continue; // skip wildcard entries
    const commit = (entry && entry.lastIndexed) || topCommit;
    if (!commit) {
      docBasedCount++;
      continue;
    }
    if (!entry || !entry.lastIndexed) {
      docBasedCount++;
    }
    if (!byCommit[commit]) byCommit[commit] = [];
    byCommit[commit].push(filePath);
  }

  // Check if .planning/codebase/ exists (brownfield doc-based intel)
  const codebaseDir = path.join(projectRoot, '.planning', 'codebase');
  const codebaseDirExists = dirExists(codebaseDir);
  const hasDocBasedEntries = codebaseDirExists && docBasedCount > 0;

  // For each unique commit, run ONE git diff to find changed files
  const staleFiles = [];
  const freshFiles = [];
  let oldestStaleCommit = null;

  for (const [commit, indexedPaths] of Object.entries(byCommit)) {
    if (!isValidCommit(commit, projectRoot)) {
      // Invalid commit (deleted/rebased): treat all files in group as stale
      staleFiles.push(...indexedPaths);
      oldestStaleCommit = oldestStaleCommit || commit;
      continue;
    }

    let changedRaw;
    try {
      changedRaw = git(`git diff --name-only ${commit}..HEAD`, projectRoot);
    } catch {
      // git diff failed: treat all files in group as stale
      staleFiles.push(...indexedPaths);
      oldestStaleCommit = oldestStaleCommit || commit;
      continue;
    }

    if (!changedRaw) {
      // No changes since this commit: all files are fresh
      freshFiles.push(...indexedPaths);
      continue;
    }

    const changed = new Set(changedRaw.split('\n').filter(Boolean));
    for (const fp of indexedPaths) {
      if (changed.has(fp)) {
        staleFiles.push(fp);
        if (!oldestStaleCommit) oldestStaleCommit = commit;
      } else {
        freshFiles.push(fp);
      }
    }
  }

  const totalIndexed = staleFiles.length + freshFiles.length;

  return {
    staleFiles: staleFiles.sort(),
    freshFiles: freshFiles.sort(),
    totalIndexed,
    staleCount: staleFiles.length,
    stalePct: totalIndexed > 0 ? Math.round((staleFiles.length / totalIndexed) * 100) / 100 : 0,
    oldestStaleCommit,
    hasDocBasedEntries,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const projectRoot = resolveProjectRoot();
  const result = detectStaleFiles(projectRoot);
  console.log(JSON.stringify(result, null, 2));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { detectStaleFiles };

if (require.main === module) {
  try {
    main();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`detect-stale-intel.cjs failed: ${message}`);
    process.exit(0); // Always exit 0 (non-blocking)
  }
}
