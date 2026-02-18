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
// Constants
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = [
  'js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx',
  'py', 'go', 'rs', 'java',
];

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
// Brownfield doc staleness detection
// ---------------------------------------------------------------------------

const BROWNFIELD_DOCS = [
  'ARCHITECTURE.md', 'STACK.md', 'CONVENTIONS.md', 'STRUCTURE.md',
  'TESTING.md', 'INTEGRATIONS.md', 'CONCERNS.md',
];

const ANALYSIS_DATE_RE = /\*\*Analysis Date:\*\*\s*(\d{4}-\d{2}-\d{2})/;

function hasSourceExtension(filePath) {
  const ext = path.extname(filePath).replace(/^\./, '');
  return SUPPORTED_EXTENSIONS.includes(ext);
}

function detectBrownfieldDocStaleness(projectRoot) {
  // 1. Check if .planning/codebase/ exists
  const codebaseDir = path.join(projectRoot, '.planning', 'codebase');
  if (!dirExists(codebaseDir)) {
    return { brownfieldDocStale: false };
  }

  // 2. Parse Analysis Date from brownfield docs (first found wins)
  let analysisDate = null;
  for (const docName of BROWNFIELD_DOCS) {
    const docPath = path.join(codebaseDir, docName);
    try {
      const content = fs.readFileSync(docPath, 'utf8');
      const match = content.match(ANALYSIS_DATE_RE);
      if (match) {
        analysisDate = match[1];
        break;
      }
    } catch {
      // File missing or unreadable, try next
    }
  }

  if (!analysisDate) {
    return { brownfieldDocStale: false, reason: 'no_analysis_date' };
  }

  // 3. Find the commit at or before the analysis date
  let baseCommit;
  try {
    baseCommit = git(
      `git log --until="${analysisDate}T23:59:59" --format=%H -1`,
      projectRoot
    );
  } catch {
    return { brownfieldDocStale: false, reason: 'no_commit_at_date' };
  }

  if (!baseCommit) {
    // Analysis Date predates git history — fall back to oldest commit
    try {
      baseCommit = git('git rev-list --max-parents=0 HEAD', projectRoot);
      if (baseCommit.includes('\n')) {
        baseCommit = baseCommit.split('\n')[0];
      }
    } catch {
      return { brownfieldDocStale: false, reason: 'no_commit_at_date' };
    }
    if (!baseCommit) {
      return { brownfieldDocStale: false, reason: 'no_commit_at_date' };
    }
  }

  // 4. Get changed files since base commit
  let changedRaw;
  try {
    changedRaw = git(`git diff --name-only ${baseCommit}..HEAD`, projectRoot);
  } catch {
    return { brownfieldDocStale: false, reason: 'git_diff_failed' };
  }

  // 5. Filter to source files only
  const changedFiles = changedRaw ? changedRaw.split('\n').filter(Boolean) : [];
  const sourceChanged = changedFiles.filter(hasSourceExtension);

  // 6. Get total source file count
  let totalFiles = 0;
  try {
    const lsRaw = git('git ls-files', projectRoot);
    const allFiles = lsRaw ? lsRaw.split('\n').filter(Boolean) : [];
    totalFiles = allFiles.filter(hasSourceExtension).length;
  } catch {
    totalFiles = 0;
  }

  // 7-8. Compute change percentage and return result
  if (totalFiles === 0) {
    return {
      brownfieldDocStale: false,
      brownfieldAnalysisDate: analysisDate,
      brownfieldChangedFiles: sourceChanged.length,
      brownfieldTotalFiles: 0,
      brownfieldChangePct: 0,
    };
  }

  const changePct = sourceChanged.length / totalFiles;

  return {
    brownfieldDocStale: changePct > 0.3,
    brownfieldAnalysisDate: analysisDate,
    brownfieldChangedFiles: sourceChanged.length,
    brownfieldTotalFiles: totalFiles,
    brownfieldChangePct: Math.round(changePct * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const projectRoot = resolveProjectRoot();
  const result = detectStaleFiles(projectRoot);
  const brownfield = detectBrownfieldDocStaleness(projectRoot);
  console.log(JSON.stringify({ ...result, ...brownfield }, null, 2));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { detectStaleFiles, detectBrownfieldDocStaleness };

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
