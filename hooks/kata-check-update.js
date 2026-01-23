#!/usr/bin/env node
// Check for Kata updates in background, write result to cache
// Called by SessionStart hook - runs once per session

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const homeDir = os.homedir();
const cwd = process.cwd();

// Detect local vs global installation by checking VERSION file
// This single check tells us both: existence = local install, contents = version
const localVersionFile = path.join(cwd, '.claude', 'kata', 'VERSION');
const globalVersionFile = path.join(homeDir, '.claude', 'kata', 'VERSION');
const isLocalInstall = fs.existsSync(localVersionFile);

// Use paths based on installation type - cache location matches install context
const versionFile = isLocalInstall ? localVersionFile : globalVersionFile;
const cacheDir = isLocalInstall
  ? path.join(cwd, '.claude', 'kata', 'cache')
  : path.join(homeDir, '.claude', 'kata', 'cache');
const cacheFile = path.join(cacheDir, 'update-check.json');

// Store cwd in cache so statusline can detect stale cache
const checkedCwd = cwd;

// Ensure cache directory exists
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Run check in background (spawn detached process)
// Note: The spawned process uses --input-type=module for ESM compatibility
const child = spawn(process.execPath, ['--input-type=module', '-e', `
  import fs from 'fs';
  import { execSync } from 'child_process';

  const cacheFile = ${JSON.stringify(cacheFile)};
  const versionFile = ${JSON.stringify(versionFile)};
  const checkedCwd = ${JSON.stringify(checkedCwd)};
  const isLocalInstall = ${JSON.stringify(isLocalInstall)};

  let installed = '0.0.0';
  try {
    installed = fs.readFileSync(versionFile, 'utf8').trim();
  } catch (e) {}

  let latest = null;
  try {
    latest = execSync('npm view @gannonh/kata version', { encoding: 'utf8', timeout: 10000 }).trim();
  } catch (e) {}

  const result = {
    update_available: latest && installed !== latest,
    installed,
    latest: latest || 'unknown',
    checked: Math.floor(Date.now() / 1000),
    cwd: checkedCwd,
    isLocalInstall: isLocalInstall
  };

  fs.writeFileSync(cacheFile, JSON.stringify(result));
`], {
  detached: true,
  stdio: 'ignore'
});

child.unref();
